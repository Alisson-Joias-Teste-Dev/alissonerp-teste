-- ============================================================================
-- 093 — Tabelas de Precificação (app Alisson Compra)
--
-- Substitui o projeto Supabase separado (bzffklyprtvobavudytd) do app
-- standalone. Agora tudo persiste no banco do ERP.
-- ============================================================================

-- ═══ 1. CONFIGURAÇÕES (histórico eterno — nunca sobrescreve) ═══
CREATE TABLE IF NOT EXISTS alissonerp.precificacao_config (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content    JSONB NOT NULL,
  label      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_precificacao_config_updated
  ON alissonerp.precificacao_config (updated_at DESC);

COMMENT ON TABLE alissonerp.precificacao_config IS
  'Snapshots de configuração do app de precificação (categorias, MKP, comissões). Histórico eterno.';

-- ═══ 2. HISTÓRICO DE CÁLCULOS ═══
CREATE TABLE IF NOT EXISTS alissonerp.precificacao_historico (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gold_price         NUMERIC,
  weight             NUMERIC,
  mkp                NUMERIC,
  commission_percent NUMERIC,
  commission_value   NUMERIC,
  base_price         NUMERIC,
  final_price        NUMERIC,
  discount_percent   NUMERIC,
  category_name      TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_precificacao_historico_created
  ON alissonerp.precificacao_historico (created_at DESC);

COMMENT ON TABLE alissonerp.precificacao_historico IS
  'Log de cada cálculo feito no app de precificação.';

-- ═══ 3. GRANTS ═══
GRANT ALL ON alissonerp.precificacao_config     TO anon, authenticated;
GRANT ALL ON alissonerp.precificacao_historico  TO anon, authenticated;
