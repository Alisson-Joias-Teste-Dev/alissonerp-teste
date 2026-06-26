-- ==========================================================================
-- Migration 277 — Correção de dados + view vw_pedras_preco (LEFT JOIN)
--
-- TAREFA A: Classificar todas pedras (categoria='Pedras') como insumo
-- TAREFA B: Preencher peso_ct faltante via interpolação mm→ct
-- TAREFA C: Recriar vw_pedras_preco com LEFT JOIN (mostra todas as pedras)
-- ==========================================================================
BEGIN;

-- ── TAREFA A: Classificar como insumo ──────────────────────────────────────
-- Atualiza tipo_item = 'insumo' para toda pedra ativa.
-- Usa ON CONFLICT para não duplicar registros já existentes.
INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
SELECT p.id_produto, 'insumo'
FROM public.produtos p
WHERE p.categoria = 'Pedras' AND p.situacao = 'A'
ON CONFLICT (produto_id)
DO UPDATE SET tipo_item = 'insumo', updated_at = now();

-- ── TAREFA B: Preencher peso_ct via interpolação mm→ct ─────────────────────
-- Usa a mesma tabela de conversão do sistema (constants.ts STONE_CT_TABLE).
-- Aplica interpolação linear para tamanhos entre os pontos da tabela.
WITH mm_ct(mm, ct) AS (
  VALUES
    (1.0, 0.005), (1.1, 0.006), (1.2, 0.007), (1.3, 0.009),
    (1.4, 0.012), (1.5, 0.015), (1.6, 0.017), (1.7, 0.019),
    (1.8, 0.022), (1.9, 0.026), (2.0, 0.030), (2.1, 0.035),
    (2.2, 0.040), (2.3, 0.046), (2.4, 0.053), (2.5, 0.060)
),
pedras_pendentes AS (
  SELECT
    p.id_produto,
    (regexp_match(p.nome, '([0-9]+[,.][0-9]+)\s*mm'))[1]::numeric AS tamanho_mm
  FROM public.produtos p
  LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
  WHERE p.categoria = 'Pedras'
    AND p.situacao = 'A'
    AND (ppe.peso_ct IS NULL OR ppe.produto_id IS NULL)
    AND p.nome ~ '[0-9]+[,.][0-9]+\s*mm'
),
bounds AS (
  SELECT
    pp.id_produto,
    pp.tamanho_mm,
    low.mm  AS mm_low,  low.ct  AS ct_low,
    high.mm AS mm_high, high.ct AS ct_high
  FROM pedras_pendentes pp
  LEFT JOIN LATERAL (
    SELECT mm, ct FROM mm_ct WHERE mm <= pp.tamanho_mm ORDER BY mm DESC LIMIT 1
  ) low ON true
  LEFT JOIN LATERAL (
    SELECT mm, ct FROM mm_ct WHERE mm >= pp.tamanho_mm ORDER BY mm ASC LIMIT 1
  ) high ON true
),
calculado AS (
  SELECT
    id_produto,
    tamanho_mm,
    CASE
      WHEN mm_low = mm_high THEN ct_low
      WHEN mm_low IS NULL THEN ct_high
      WHEN mm_high IS NULL THEN ct_low
      ELSE ct_low + (ct_high - ct_low)
                  * (tamanho_mm - mm_low)
                  / NULLIF(mm_high - mm_low, 0)
    END AS peso_ct_calculado
  FROM bounds
)
INSERT INTO alissonerp.produto_pedra_extras (produto_id, peso_ct)
SELECT id_produto, peso_ct_calculado
FROM calculado
WHERE peso_ct_calculado IS NOT NULL
ON CONFLICT (produto_id)
DO UPDATE SET peso_ct = EXCLUDED.peso_ct, updated_at = now();

-- ── TAREFA C: Recriar vw_pedras_preco com LEFT JOIN + range ───────────────
-- LEFT JOIN em pedras_precificacao_regras para mostrar TODAS as pedras.
-- Match por categoria + range de tamanho (mm extraído do nome) via LATERAL.
CREATE OR REPLACE VIEW alissonerp.vw_pedras_preco AS
SELECT
  p.id_produto,
  p.nome,
  p.sku,
  ppe.peso_ct,
  r.categoria_pedra,
  r.nome_tabela,
  r.custo_usd_ct,
  r.preco_rs_un,
  CASE
    WHEN r.tamanho_final_mm > r.tamanho_inicial_mm AND r.preco_rs_un IS NULL
    THEN round(
           r.markup_inicial
           - (r.markup_inicial - r.markup_final)
             * (COALESCE(substring(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0')::numeric
                - r.tamanho_inicial_mm)
             / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0),
           4)
    WHEN r.preco_rs_un IS NOT NULL THEN NULL
    ELSE r.markup_inicial
  END AS markup_calculado,
  CASE
    WHEN r.preco_rs_un IS NOT NULL AND r.preco_rs_un > 0
    THEN r.preco_rs_un::integer
    WHEN r.custo_usd_ct IS NOT NULL
         AND r.custo_usd_ct > 0
         AND ppe.peso_ct IS NOT NULL
    THEN round(
           ppe.peso_ct
           * r.custo_usd_ct
           * (SELECT parametros.dollar FROM parametros LIMIT 1)
           * CASE
               WHEN r.tamanho_final_mm > r.tamanho_inicial_mm
               THEN r.markup_inicial
                    - (r.markup_inicial - r.markup_final)
                      * (COALESCE(substring(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0')::numeric
                         - r.tamanho_inicial_mm)
                      / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0)
               ELSE r.markup_inicial
             END
         )::integer
    ELSE NULL
  END AS preco_venda
FROM public.produtos p
JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
LEFT JOIN LATERAL (
  SELECT *
  FROM alissonerp.pedras_precificacao_regras r2
  WHERE (
    LOWER(p.nome) ILIKE '%' || LOWER(r2.categoria_pedra) || '%'
    OR (r2.categoria_pedra = 'zirconia' AND LOWER(p.nome) ILIKE '%zirc%')
  )
  AND (
    (
      COALESCE(substring(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0')::numeric >= r2.tamanho_inicial_mm
      AND COALESCE(substring(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0')::numeric <= r2.tamanho_final_mm
    )
    OR r2.categoria_pedra = 'zirconia'
  )
  ORDER BY r2.tamanho_inicial_mm ASC
  LIMIT 1
) r ON true
WHERE ti.tipo_item = 'insumo'
  AND p.situacao = 'A'
  AND p.categoria = 'Pedras';

GRANT SELECT ON alissonerp.vw_pedras_preco TO authenticated, anon;

COMMENT ON VIEW alissonerp.vw_pedras_preco IS
  'Precificação dinâmica de pedras (LEFT JOIN). Mostra TODAS as pedras classificadas como insumo. Para pedras sem regra de precificação, preco_venda = NULL. Fórmula: peso_ct × custo_usd_ct × dolar × markup_interpolado. Para zircônia, retorna preco_rs_un.';

COMMIT;
