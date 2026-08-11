-- ═══════════════════════════════════════════════════════════════════════════
-- 366 — Comissão: grava o PREÇO CHEIO no item
--
-- O QUÊ
--   itens_venda_erp.preco_lista_cheio — o preço contra o qual a comissão do
--   item tem que ser medida. Para item em promoção é o preço ORIGINAL da
--   campanha (promocao_itens.preco_original); para os demais é o próprio
--   preco_lista.
--
-- O PORQUÊ (achado em 03/08/2026, ver docs/regras-negocio/comercial.md §2.1)
--   Hoje esse número NÃO EXISTE no banco. Para item em promoção, `preco_lista`
--   guarda o preço PROMOCIONAL, e o preço cheio da campanha vive só como
--   `preco_lista_original` no estado React de NovaVendaClientV2 — some assim que
--   a venda é reaberta.
--
--   Consequência: `comissaoPct()` cai no fallback `getComissao(pctManual)`, o
--   desconto passa a ser medido contra o preço já promocional (dá ~0%) e o
--   sistema paga a FAIXA CHEIA de 4% onde a tabela mandava 0,50%. A tela de
--   detalhe da venda é pior: não conhece promoção nenhuma. Qualquer edição
--   depois da venda criada derruba a comissão pra faixa cheia.
--
--   Custo medido: R$ 575,61 em 8 itens de julho/2026, corrigidos em produção no
--   log 357. Venda promocional criada e paga sem ninguém reabrir saía certa —
--   por isso o erro parecia intermitente.
--
--   ⚠️ Este é o desconto da COMISSÃO. NÃO é o desconto de ALÇADA. Promoção é
--   pré-aprovada (Jonathan, 03/08/2026): um item com 32,89% de promoção continua
--   vendendo sem aprovação nenhuma — só passa a pagar 0,50% em vez de 4,00%.
--   O portão de aprovação continua olhando `pct_desconto`, e esta coluna NÃO
--   pode ser usada por ele.
--
-- O IMPACTO SE FOR REMOVIDO
--   O servidor volta a não ter como saber o desconto real de um item
--   promocional e a comissão volta a depender do que o navegador mandar.
--
-- ⚠️ NÃO corrige comissão de venda nenhuma. Esta migration só PREENCHE a coluna
--   nova. Mexer em pct_comissao/valor_comissao de venda já paga é acerto de
--   dinheiro e tem que ser feito à parte, assinado, caso a caso.
--
-- Aditiva: não remove coluna, não altera dado existente, não dropa nada.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE alissonerp.itens_venda_erp
  ADD COLUMN IF NOT EXISTS preco_lista_cheio numeric(12,2);

COMMENT ON COLUMN alissonerp.itens_venda_erp.preco_lista_cheio IS
  'Preço CHEIO do item — base do desconto que decide a faixa de comissão. '
  'Item em promoção: preco_original da campanha vigente na data da venda. '
  'Demais: igual a preco_lista. NÃO confundir com preco_lista, que num item '
  'promocional guarda o preço PROMOCIONAL. NÃO usar para alçada de desconto: '
  'promoção é pré-aprovada e não pede aprovação. Quem lê deve usar '
  'COALESCE(preco_lista_cheio, preco_lista) — linhas de caminhos não cobertos '
  'podem ficar nulas. Ver migration 366.';

-- ── Backfill ────────────────────────────────────────────────────────────────
-- ⚠️ SEM CASCATA. O UPDATE em itens_venda_erp acorda dois gatilhos:
--   • fn_proteger_itens_venda_fechada — ABORTA em venda entregue/concluída/
--     virou_credito (a maioria das vendas antigas), e ela nem respeita
--     app.sync_ativo;
--   • fn_recalcular_totais_venda — dispararia UPDATE em vendas_erp, acordando
--     os gatilhos de conta a receber e de sync pro schema public.
-- Como só se preenche uma coluna NOVA (nenhum total muda), nada precisa
-- recalcular. Ver reference: escrita histórica em modo replica.
SET LOCAL session_replication_role = 'replica';

-- A campanha é escolhida pela JANELA DE DATAS da venda, com o mesmo desempate
-- de alissonerp.vw_produto_preco_vigente (data_inicio DESC, id DESC).
--
-- ⚠️ Aqui NÃO se filtra por situacao_manual='agendada', ao contrário da view.
--   Campanha encerrada na mão vira 'encerrada_manual' e some da view — mas a
--   rota de encerrar já faz `data_fim = LEAST(data_fim, CURRENT_DATE)`, então a
--   janela guarda o fim real. Exigir 'agendada' faria as vendas feitas ENQUANTO
--   a campanha estava no ar perderem o preço cheio (10 campanhas nessa situação
--   em 03/08/2026).
--
-- ⚠️ Subconsulta escalar com LIMIT 1, nunca JOIN direto em promocao_itens: um
--   produto pode estar em DUAS campanhas sobrepostas na mesma data (AJ4895 em
--   31/07/2026) e o join direto multiplicaria a linha.
UPDATE alissonerp.itens_venda_erp iv
SET preco_lista_cheio = GREATEST(
      COALESCE((
        SELECT pi.preco_original
        FROM alissonerp.promocao_itens pi
        JOIN alissonerp.promocoes_produtos pp ON pp.id = pi.promocao_id
        JOIN alissonerp.vendas_erp v ON v.id = iv.venda_id
        WHERE pi.produto_id = iv.produto_id
          AND v.data_venda >= pp.data_inicio
          AND v.data_venda <= pp.data_fim
        ORDER BY pp.data_inicio DESC, pp.id DESC
        LIMIT 1
      ), iv.preco_lista),
      iv.preco_lista
    )
WHERE iv.preco_lista_cheio IS NULL;

-- GREATEST acima: se o preco_original da campanha vier MENOR que o preco_lista
-- gravado, o cheio é o maior dos dois. Sem isso o desconto sairia negativo e a
-- faixa, errada.

SET LOCAL session_replication_role = 'origin';
