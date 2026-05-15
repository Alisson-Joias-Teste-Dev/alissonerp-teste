-- ══════════════════════════════════════════════════════════════════════════
-- Migration 132 — Travas de validação + Zircônia + Calibração do orçamento
-- ══════════════════════════════════════════════════════════════════════════
-- Objetivo: adicionar suporte a calibração configurável (JSONB) em
-- config_orcamento e cadastrar zircônia como tipo de pedra não-preciosa.
--
-- Seguro:
--   • Idempotente (IF NOT EXISTS / NOT @> checks)
--   • Aditivo (só ADD COLUMN e UPDATE, nenhum DROP/ALTER destrutivo)
--   • Não toca em orcamentos, fichas técnicas ou vendas
--   • Valores default conservadores (a favor do ourives)
--
-- Como reverter (se necessário):
--   ALTER TABLE alissonerp.config_orcamento DROP COLUMN IF EXISTS calibracao;
--   UPDATE alissonerp.config_orcamento
--      SET stone_prices = (
--        SELECT jsonb_agg(elem)
--        FROM jsonb_array_elements(stone_prices) elem
--        WHERE elem->>'tipo' <> 'zirconia'
--      )
--    WHERE name = 'default';
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Adiciona coluna calibracao (JSONB) em config_orcamento
--    Contém os parâmetros das travas de validação (espessura mín., largura
--    mín. por cravação, folga entre pedras).
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS calibracao JSONB DEFAULT '{
    "espessura_min": {"multiplicador": 0.60, "constante": 0.50},
    "largura_min":   {"canaleta": 1.0, "grao": 0.8, "pave": 1.4},
    "folga_pedras":  0.2
  }'::jsonb;

COMMENT ON COLUMN alissonerp.config_orcamento.calibracao IS
  'Parâmetros de validação do orçamento de alianças. Espessura mínima = pedra*multiplicador + constante. Largura mínima varia por tipo de cravação (canaleta/grão/pavê). Folga = espaço mínimo entre pedras.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Garante que a config default tenha calibracao preenchida
--    (caso o default da coluna não tenha sido aplicado em rows existentes)
-- ──────────────────────────────────────────────────────────────────────────
UPDATE alissonerp.config_orcamento
   SET calibracao = '{
    "espessura_min": {"multiplicador": 0.60, "constante": 0.50},
    "largura_min":   {"canaleta": 1.0, "grao": 0.8, "pave": 1.4},
    "folga_pedras":  0.2
   }'::jsonb
 WHERE name = 'default' AND calibracao IS NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Adiciona zircônia ao stone_prices (preço USD/ct = 0, não cobra)
--    Só insere se ainda não existir, pra ser 100% idempotente.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE alissonerp.config_orcamento
   SET stone_prices = COALESCE(stone_prices, '[]'::jsonb)
                      || '[{"tipo":"zirconia","preco_usd_ct":0}]'::jsonb
 WHERE name = 'default'
   AND NOT (COALESCE(stone_prices, '[]'::jsonb) @> '[{"tipo":"zirconia"}]'::jsonb);

COMMIT;
