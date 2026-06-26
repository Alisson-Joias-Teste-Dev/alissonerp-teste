-- Migration 252: Adiciona campo ordem_solicitacao em transferencias_estoque_comercial
-- Para registrar o numero da ordem de solicitacao na transferencia

SET search_path TO alissonerp;

ALTER TABLE transferencias_estoque_comercial
  ADD COLUMN IF NOT EXISTS ordem_solicitacao VARCHAR(100) NOT NULL DEFAULT '';

COMMENT ON COLUMN transferencias_estoque_comercial.ordem_solicitacao IS
  'Número da ordem de solicitação (alfanumérico, obrigatório)';
