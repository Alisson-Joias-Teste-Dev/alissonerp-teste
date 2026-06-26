-- ============================================================
-- 126 — Orçamento: precificação de pedras + peças personalizadas
-- ============================================================

-- 1. Config: markup de pedras + preços por tipo
ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS stone_markup NUMERIC(6,2) NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS stone_prices JSONB NOT NULL DEFAULT '[
    {"tipo":"diamante","preco_usd_ct":80},
    {"tipo":"moissanita","preco_usd_ct":15},
    {"tipo":"rubi","preco_usd_ct":50},
    {"tipo":"esmeralda","preco_usd_ct":60},
    {"tipo":"safira","preco_usd_ct":45}
  ]'::jsonb;

-- 2. Fichas técnicas: pedras detalhadas (substitui campos antigos)
ALTER TABLE alissonerp.orcamento_fichas_tecnicas
  ADD COLUMN IF NOT EXISTS pedras_detalhadas JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 3. Orçamentos: separar valor ouro + pedras + cotação dólar
ALTER TABLE alissonerp.orcamentos
  ADD COLUMN IF NOT EXISTS valor_ouro NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_pedras NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cotacao_dolar NUMERIC(10,2);
