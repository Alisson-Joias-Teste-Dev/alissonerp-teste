-- ============================================================================
-- Migration 168 — alissonerp.user_views (filtros nomeados por usuario/modulo)
-- ============================================================================
-- Permite que cada usuario salve combinacoes de filtros de Inteligencia de Estoque
-- (e futuros modulos) com um nome customizado.
--
-- Ex: "Aneis pesados parados", "Criticos fornecedor X", etc.
--
-- RLS: usuario so ve/edita suas proprias vistas. Auth via auth.uid() do JWT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS alissonerp.user_views (
  id          SERIAL PRIMARY KEY,
  user_auth_id UUID NOT NULL,
  scope       TEXT NOT NULL,            -- ex: 'gestao-estoque'
  nome        TEXT NOT NULL,
  filtros     JSONB NOT NULL,           -- { categorias: [], scope: 'critical', ... }
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_auth_id, scope, nome)
);

CREATE INDEX IF NOT EXISTS idx_user_views_user_scope
  ON alissonerp.user_views (user_auth_id, scope);

-- Trigger simples pra manter updated_at
CREATE OR REPLACE FUNCTION alissonerp.fn_user_views_touch_updated()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_views_touch ON alissonerp.user_views;
CREATE TRIGGER trg_user_views_touch
  BEFORE UPDATE ON alissonerp.user_views
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_user_views_touch_updated();

COMMENT ON TABLE alissonerp.user_views IS
  'Filtros nomeados por usuario/modulo (Inteligencia de Estoque e futuros dashboards)';

-- ============================================================================
-- Fim migration 168
-- ============================================================================
