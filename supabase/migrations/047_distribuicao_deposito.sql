-- =============================================
-- MIGRATION 047: DISTRIBUIÇÃO — ADD deposito_id / setor_id
-- Mudança ADITIVA — dados existentes preservados
-- =============================================

ALTER TABLE alissonerp.distribuicoes
  ADD COLUMN IF NOT EXISTS deposito_id INTEGER REFERENCES alissonerp.depositos(id);

ALTER TABLE alissonerp.distribuicoes
  ADD COLUMN IF NOT EXISTS setor_id INTEGER REFERENCES alissonerp.setores(id);

-- Garantir grants para authenticated
GRANT SELECT, INSERT, UPDATE ON alissonerp.distribuicoes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.distribuicao_ordens TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.distribuicoes_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.distribuicao_ordens_id_seq TO authenticated;
