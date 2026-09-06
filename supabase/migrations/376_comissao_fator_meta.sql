-- Migration 376: COMISSAO PROPORCIONAL A META (fator por mes da venda)
--
-- JA APLICADA EM PRODUCAO em 05/09/2026 (alissonerp.log_mudancas_banco id 479),
-- naquele momento com o numero 375 — renumerada para 376 porque a homolog ja
-- tinha uma 375 (personalizado_nao_controla_estoque). O conteudo e o mesmo e e
-- idempotente (IF NOT EXISTS / ON CONFLICT DO NOTHING): rodar de novo nao muda nada.
--
-- REGRA DE NEGOCIO
-- O QUE FAZ: cria a base para a comissao passar a depender do atingimento da
--   meta da consultora. Tres coisas:
--     1) tabela comissao_resultado_mensal — guarda, por consultora e mes, a meta,
--        quanto ela vendeu, o percentual exato atingido e o FATOR da comissao.
--        Enquanto o mes corre e recalculada; quando o mes fecha, CONGELA.
--     2) colunas novas em fechamento_comissao_itens — o valor CHEIO da comissao,
--        o fator aplicado e o motivo escrito, para a linha se explicar sozinha.
--     3) parametro COMISSAO_VENDEDORES_EXCLUIDOS — quem nao comissiona.
--
-- O PORQUE (decisao do Jonathan + chefe, 05/09/2026):
--   * agosto/2026: quem nao bateu a meta prata recebeu 50% da comissao das
--     vendas do mes. Ja pago, encerrado, nao se mexe.
--   * setembro/2026 em diante: o fator e o PROPRIO percentual atingido, com teto
--     de 100% e SEM piso. Fez 70% da meta, recebe 70% da comissao; fez 101%,
--     recebe 100%. Vender alem da meta nao aumenta comissao — destrava premio.
--   * O fator segue a VENDA, nao o pagamento: parcela de crediario de uma venda
--     de setembro que so cair em marco chega com o fator de setembro. Por isso o
--     resultado do mes precisa ficar GRAVADO e CONGELADO — sem isso, uma venda
--     cancelada meses depois mudaria retroativamente o fator de um mes ja PAGO.
--   * Ate julho/2026 nada muda: fator 100%. A regra nao e retroativa.
--
-- O IMPACTO SE ALTERADO/REMOVIDO: sem a tabela congelada, o extrato recalcula o
--   fator toda vez que alguem abre a tela e a comissao de um mes fechado deixa de
--   ser estavel. Sem as colunas do item, a linha perde a memoria de quanto ela
--   valia cheia e por que foi reduzida — foi exatamente esse buraco que obrigou a
--   refazer agosto/2026 na mao (e quase pagou R$ 53,71 a menos para a Debora, por
--   debitar devolucao pelo valor cheio numa venda que comissionou pela metade).
--
-- ADITIVA: so CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS e INSERT com
-- ON CONFLICT DO NOTHING. Nenhuma coluna removida, nenhum dado alterado.

-- 1) Resultado da meta por consultora/mes ------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.comissao_resultado_mensal (
  consultora_id  integer     NOT NULL,
  -- competencia no formato AAAA-MM: o MES DA VENDA (nao o do pagamento).
  competencia    text        NOT NULL,
  meta_valor     numeric(12,2) NOT NULL DEFAULT 0,
  -- realizado = soma das vendas do mes MENOS o vale-troca usado. Mesma conta da
  -- tela Analise de Resultado, para o numero da meta ser UM so no sistema.
  realizado      numeric(12,2) NOT NULL DEFAULT 0,
  -- percentual EXATO (sem arredondar para exibicao): 88.9418 e nao 88.9.
  -- Decisao do Jonathan em 05/09/2026.
  pct_atingido   numeric(9,4)  NOT NULL DEFAULT 0,
  -- fator aplicado na comissao das vendas deste mes: 1.0000 = integral.
  fator          numeric(6,4)  NOT NULL DEFAULT 1,
  -- texto que vai para a linha do extrato, para a consultora entender sozinha.
  motivo         text,
  -- congelado = mes fechado. Depois disso o fator NUNCA muda, mesmo que uma
  -- venda seja cancelada. IMPACTO se voltar a recalcular: comissao ja paga muda.
  congelado      boolean     NOT NULL DEFAULT false,
  congelado_em   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consultora_id, competencia)
);

COMMENT ON TABLE alissonerp.comissao_resultado_mensal IS
  'Resultado da meta por consultora/mes e o fator da comissao daquele mes. Congela no fechamento. Ver src/lib/comissao-fator.ts e docs/regras-negocio/comercial.md.';

-- 2) Memoria do fator em cada linha de comissao -------------------------------
ALTER TABLE alissonerp.fechamento_comissao_itens
  -- valor CHEIO, antes do fator. comissao_calculada continua sendo o que se PAGA.
  ADD COLUMN IF NOT EXISTS comissao_bruta numeric,
  -- fator aplicado (1.0000 = integral). NULL = linha anterior a esta regra.
  ADD COLUMN IF NOT EXISTS fator_meta     numeric(6,4),
  -- descritivo obrigatorio quando fator < 1, ex.:
  -- 'venda de setembro/2026 - meta atingida em 88,94% - comissao proporcional'
  ADD COLUMN IF NOT EXISTS motivo_fator   text;

-- 3) Quem nao comissiona -------------------------------------------------------
-- Loja Alisson (id_vendedor 134) NAO e consultora: e o vendedor generico de venda
-- de balcao/institucional. Nao tem meta cadastrada e nao tem quem receba — mesmo
-- assim acumulou R$ 1.795,20 em ago/2026 e R$ 519,64 em jul/2026 de comissao
-- parada no extrato. Decisao do Jonathan, 05/09/2026: nao comissiona.
--
-- Lista SEPARADA de DASHBOARD_VENDEDORES_EXCLUIDOS de proposito: uma diz quem
-- fica fora dos GRAFICOS, esta diz quem nao RECEBE. Sao decisoes diferentes e
-- podem divergir amanha.
INSERT INTO alissonerp.parametros_sistema (chave, valor, tipo, descricao) VALUES
  (
    'COMISSAO_VENDEDORES_EXCLUIDOS',
    '[134]',
    'json',
    'IDs de vendedores que NAO geram comissao (extrato, fechamento, previsao). 134 = Loja Alisson (venda de balcao/institucional, nao e consultora, nao tem meta). Lido por src/lib/comissao-fator.ts.'
  )
ON CONFLICT (chave) DO NOTHING;
