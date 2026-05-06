-- ============================================================================
-- Migration 235 — Rota de Fabricação (Kanban): pré-ouro + colaboradores
-- ============================================================================
-- Suporte a:
--   1) Setores pré-ouro (não exigem pesagem): desenho, impressão, cravação cera/resina.
--      Coluna requer_peso. Default true (a maioria opera com peso real).
--   2) Colaboradores responsáveis por setor (N:N depositos↔setores). Tabela
--      alissonerp.setor_operadores. Quando uma OF cai no setor, qualquer um
--      da lista pode atendê-la.
--   3) Operador atribuído individualmente a uma OF na rota (override). Coluna
--      pcp.operador_atribuido_id.
--
-- Segurança: tudo aditivo (ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Setores: requer_peso (default true; user marca false em pré-ouro)
-- ----------------------------------------------------------------------------
ALTER TABLE alissonerp.setores
  ADD COLUMN IF NOT EXISTS requer_peso BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN alissonerp.setores.requer_peso IS
  'Se true, etapas neste setor exigem foto da balança + validação de peso pela IA. Se false (desenho, impressão, cravação cera/resina), só foto é obrigatória — sem pesagem.';

-- ----------------------------------------------------------------------------
-- 2) Tabela N:N — colaboradores responsáveis por setor
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.setor_operadores (
  id BIGSERIAL PRIMARY KEY,
  setor_id    INTEGER     NOT NULL REFERENCES alissonerp.setores(id) ON DELETE CASCADE,
  deposito_id INTEGER     NOT NULL REFERENCES alissonerp.depositos(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (setor_id, deposito_id)
);

CREATE INDEX IF NOT EXISTS idx_setor_operadores_setor    ON alissonerp.setor_operadores (setor_id);
CREATE INDEX IF NOT EXISTS idx_setor_operadores_deposito ON alissonerp.setor_operadores (deposito_id);

COMMENT ON TABLE alissonerp.setor_operadores IS
  'Colaboradores responsáveis por setor (depósito = operador, conforme convenção do PCP). N:N — um operador pode estar em vários setores; um setor pode ter vários operadores. Quando uma OF cai no setor, qualquer um da lista pode pegar.';

-- ----------------------------------------------------------------------------
-- 3) PCP: operador atribuído individualmente (override)
-- ----------------------------------------------------------------------------
ALTER TABLE alissonerp.pcp
  ADD COLUMN IF NOT EXISTS operador_atribuido_id INTEGER REFERENCES alissonerp.depositos(id);

COMMENT ON COLUMN alissonerp.pcp.operador_atribuido_id IS
  'Operador (depósito) atribuído individualmente a esta OF na rota de fabricação. Override sobre a lista de colaboradores do setor (setor_operadores). NULL = qualquer um da lista do setor pode atender.';

CREATE INDEX IF NOT EXISTS idx_pcp_operador_atribuido
  ON alissonerp.pcp (operador_atribuido_id)
  WHERE operador_atribuido_id IS NOT NULL;

-- ============================================================================
-- Fim migration 235
-- ============================================================================
