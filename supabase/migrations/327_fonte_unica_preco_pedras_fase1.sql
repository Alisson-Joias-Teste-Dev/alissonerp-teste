-- =====================================================================================
-- 327 — Fonte única de preço de pedras (Fase 1, parte "agora")
-- =====================================================================================
-- O QUÊ: blinda a view vw_pedras_preco sem mudar nenhum preço de hoje.
--   1) Reativa as regras hoje marcadas "inativas" (a view sempre as usou; o flag era decorativo).
--   2) A view passa a RESPEITAR o flag `ativa` (a partir de agora, desligar regra na tela funciona).
--   3) A view aceita tamanho INTEIRO no nome ("2mm"), não só decimal ("2.0mm").
-- POR QUÊ: a view ignorava `ativa` (45 pedras eram precificadas por regra "inativa") e exigia
--   mm com decimal no nome — fragilidades que atrapalham a fonte única.
-- IMPACTO: ZERO no preço atual (ANTES = DEPOIS). Só corrige o COMO a regra é escolhida e
--   liga o controle ativa/inativa pro futuro. Categoria/tamanho ainda vêm do NOME (blindado);
--   casar por dado estruturado fica pra Fase 1b (precisa backfill de categoria + mm).
-- REVERSÍVEL: backup da view em _bkp_pedras_preco_antes_327; regras reativadas podem voltar.
-- =====================================================================================

-- 0) Assinatura obrigatória (livro de mudanças)
SELECT alissonerp.assinar_mudanca_banco(
  'jonathan','claude-code',
  'Fonte única pedras Fase 1: reativa regras inativas + view respeita ativa + aceita mm inteiro (ANTES=DEPOIS, sem mudar preço)',
  'UPDATE pedras_precificacao_regras SET ativa=true WHERE ativa=false; CREATE OR REPLACE VIEW vw_pedras_preco (respeita ativa, mm inteiro)'
);

-- 1) Fotografia ANTES (régua de comparação) — preço atual de cada pedra
DROP TABLE IF EXISTS alissonerp._bkp_pedras_preco_antes_327;
CREATE TABLE alissonerp._bkp_pedras_preco_antes_327 AS
  SELECT id_produto, preco_venda FROM alissonerp.vw_pedras_preco;

-- 2) Reativa as regras inativas (a view já as usava; reativar = mesmo preço de hoje,
--    e a ordem de escolha por menor tamanho_inicial_mm não muda — verificado).
UPDATE alissonerp.pedras_precificacao_regras
SET ativa = true, updated_at = now()
WHERE ativa = false;

-- 3) Recria a view: + filtro r2.ativa = true ; + regex de mm aceitando inteiro.
--    (mudanças marcadas com -- << ; resto idêntico ao original)
CREATE OR REPLACE VIEW alissonerp.vw_pedras_preco AS
 SELECT p.id_produto, p.nome, p.sku, ppe.peso_ct,
    r.categoria_pedra, r.nome_tabela, r.custo_usd_ct, r.preco_rs_un,
    CASE
        WHEN r.tamanho_final_mm > r.tamanho_inicial_mm AND r.preco_rs_un IS NULL
          THEN round(r.markup_inicial - (r.markup_inicial - r.markup_final) *
               (replace(COALESCE(substring(p.nome::text, '([0-9]+([.,][0-9]+)?)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric  -- << aceita inteiro
                - r.tamanho_inicial_mm) / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0::numeric), 4)
        WHEN r.preco_rs_un IS NOT NULL THEN NULL::numeric
        ELSE r.markup_inicial
    END AS markup_calculado,
    CASE
        WHEN r.preco_rs_un IS NOT NULL AND r.preco_rs_un > 0::numeric THEN r.preco_rs_un::integer
        WHEN r.custo_usd_ct IS NOT NULL AND r.custo_usd_ct > 0::numeric AND ppe.peso_ct IS NOT NULL
          THEN round((ppe.peso_ct * r.custo_usd_ct)::double precision *
               ((SELECT dollar FROM public.parametros LIMIT 1)) *
               CASE WHEN r.tamanho_final_mm > r.tamanho_inicial_mm
                    THEN r.markup_inicial - (r.markup_inicial - r.markup_final) *
                         (replace(COALESCE(substring(p.nome::text, '([0-9]+([.,][0-9]+)?)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric  -- << aceita inteiro
                          - r.tamanho_inicial_mm) / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0::numeric)
                    ELSE r.markup_inicial END::double precision)::integer
        ELSE NULL::integer
    END AS preco_venda
   FROM public.produtos p
     JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
     LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
     LEFT JOIN LATERAL (
        SELECT r2.id, r2.nome_tabela, r2.categoria_pedra, r2.custo_usd_ct, r2.preco_rs_un,
               r2.tamanho_inicial_mm, r2.tamanho_final_mm, r2.markup_inicial, r2.markup_final, r2.ativa
          FROM alissonerp.pedras_precificacao_regras r2
         WHERE r2.ativa = true  -- << NOVO: respeita o botão ativa/inativa
           AND (lower(p.nome::text) ~~* (('%'::text || lower(r2.categoria_pedra::text)) || '%'::text)
                OR r2.categoria_pedra::text = 'zirconia'::text AND lower(p.nome::text) ~~* '%zirc%'::text)
           AND (replace(COALESCE(substring(p.nome::text, '([0-9]+([.,][0-9]+)?)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric >= r2.tamanho_inicial_mm
                AND replace(COALESCE(substring(p.nome::text, '([0-9]+([.,][0-9]+)?)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric <= r2.tamanho_final_mm
                OR r2.categoria_pedra::text = 'zirconia'::text)
         ORDER BY r2.tamanho_inicial_mm
         LIMIT 1) r ON true
  WHERE ti.tipo_item = 'insumo'::text AND p.situacao::text = 'A'::text AND p.categoria::text = 'Pedras'::text;

-- 4) VALIDAÇÃO ANTES × DEPOIS — TEM que voltar VAZIO (nenhuma pedra mudou de preço).
--    Se voltar alguma linha, algo mudou: NÃO seguir, investigar.
SELECT a.id_produto, a.preco_venda AS preco_antes, d.preco_venda AS preco_depois
FROM alissonerp._bkp_pedras_preco_antes_327 a
JOIN alissonerp.vw_pedras_preco d ON d.id_produto = a.id_produto
WHERE a.preco_venda IS DISTINCT FROM d.preco_venda;
