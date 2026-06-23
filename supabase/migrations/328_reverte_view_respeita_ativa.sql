-- =====================================================================================
-- 328 — REVERTE a parte "respeita ativa" da migration 327
-- =====================================================================================
-- O QUÊ: a view vw_pedras_preco volta a NÃO filtrar por `ativa` (comportamento original),
--   e reativa todas as regras.
-- POR QUÊ: o modelo do app é "1 regra ativa por categoria", mas DIAMANTE precisa de 8 regras
--   ativas (uma por faixa de tamanho). A view historicamente IGNORAVA `ativa` justamente
--   pra manter as 8 funcionando. A 327 fez a view respeitar `ativa` — e ao clicar "ativar"
--   (que desativa as outras da categoria) o diamante ficou com 0 regras ativas e 59 preços sumiram.
-- IMPACTO: restaura os 59 preços de diamante. Volta ao comportamento de antes da 327.
-- =====================================================================================

-- 0) Assinatura
SELECT alissonerp.assinar_mudanca_banco(
  'jonathan','claude-code',
  'REVERTE 327: view volta a IGNORAR ativa (modelo precisa de varias regras/categoria) + reativa regras; restaura 59 precos de diamante que sumiram',
  'CREATE OR REPLACE VIEW vw_pedras_preco (sem filtro ativa, regex original); UPDATE pedras_precificacao_regras SET ativa=true'
);

-- 1) Reativa todas as regras (desfaz a desativação causada pelos cliques em "ativar")
UPDATE alissonerp.pedras_precificacao_regras SET ativa = true, updated_at = NOW() WHERE ativa = false;

-- 2) View de volta ao ORIGINAL (sem filtro `ativa`, regex original que exige decimal),
--    mantendo só a qualificação public. (neutra) de produtos/parametros.
CREATE OR REPLACE VIEW alissonerp.vw_pedras_preco AS
 SELECT p.id_produto, p.nome, p.sku, ppe.peso_ct,
    r.categoria_pedra, r.nome_tabela, r.custo_usd_ct, r.preco_rs_un,
    CASE
        WHEN r.tamanho_final_mm > r.tamanho_inicial_mm AND r.preco_rs_un IS NULL
          THEN round(r.markup_inicial - (r.markup_inicial - r.markup_final) *
               (replace(COALESCE(substring(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric
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
                         (replace(COALESCE(substring(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric
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
         WHERE (lower(p.nome::text) ~~* (('%'::text || lower(r2.categoria_pedra::text)) || '%'::text)
                OR r2.categoria_pedra::text = 'zirconia'::text AND lower(p.nome::text) ~~* '%zirc%'::text)
           AND (replace(COALESCE(substring(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric >= r2.tamanho_inicial_mm
                AND replace(COALESCE(substring(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric <= r2.tamanho_final_mm
                OR r2.categoria_pedra::text = 'zirconia'::text)
         ORDER BY r2.tamanho_inicial_mm
         LIMIT 1) r ON true
  WHERE ti.tipo_item = 'insumo'::text AND p.situacao::text = 'A'::text AND p.categoria::text = 'Pedras'::text;

-- 3) Validação: preços que ainda estão sumidos vs a fotografia 327 (deve voltar 0)
SELECT count(*) AS precos_ainda_sumidos
FROM alissonerp._bkp_pedras_preco_antes_327 a
JOIN alissonerp.vw_pedras_preco d ON d.id_produto = a.id_produto
WHERE a.preco_venda IS NOT NULL AND d.preco_venda IS NULL;
