-- Migration 095: pedras em quilates (ct) — rastreio em pcp e apontamentos
-- Sprint 1 v2.14.0 | 28/03/2026
-- NOTA: insumos.peso_pedra_ct já existe (adicionado em migration 092) — não adicionar novamente

-- ──────────────────────────────────────────────────────────
-- 1. pcp.total_pedras_ct — total de pedras em ct na ordem
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.pcp
  ADD COLUMN total_pedras_ct NUMERIC(10,4) DEFAULT 0;

-- ──────────────────────────────────────────────────────────
-- 2. apontamentos_pcp — peso em ct e peso em g por pedra
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.apontamentos_pcp
  ADD COLUMN peso_ct      NUMERIC(10,4),
  ADD COLUMN peso_g_pedra NUMERIC(10,4);

-- ──────────────────────────────────────────────────────────
-- 3. distribuicao_saida_pedras — peso em ct utilizado
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.distribuicao_saida_pedras
  ADD COLUMN peso_ct_utilizado NUMERIC(10,4);

-- ──────────────────────────────────────────────────────────
-- 4. Backfill insumos.peso_pedra_ct onde ainda está null/zero
--    (registros anteriores ao trigger trg_calcular_peso_pedra)
--    Formula: peso_pedra_ct = peso_pedra / 0.2 (1 ct = 0.2 g)
-- ──────────────────────────────────────────────────────────
UPDATE alissonerp.insumos
SET peso_pedra_ct = ROUND((peso_pedra / 0.2)::numeric, 4)
WHERE categoria_id = 2
  AND peso_pedra IS NOT NULL
  AND peso_pedra > 0
  AND (peso_pedra_ct IS NULL OR peso_pedra_ct = 0);
