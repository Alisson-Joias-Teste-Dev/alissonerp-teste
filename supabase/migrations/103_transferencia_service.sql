-- Migration 103: Transferência Service
-- Campos para rastrear transferências do tipo 'service' (fábrica → operador externo)
-- Executado em: 31/03/2026

BEGIN;

ALTER TABLE alissonerp.transferencias_ordem
  ADD COLUMN IF NOT EXISTS tipo_transferencia VARCHAR(20) DEFAULT 'interna';

ALTER TABLE alissonerp.transferencias_ordem
  ADD COLUMN IF NOT EXISTS protocolo_id INTEGER REFERENCES alissonerp.protocolos(id);

ALTER TABLE alissonerp.transferencias_ordem
  ADD COLUMN IF NOT EXISTS deposito_origem_id INTEGER REFERENCES alissonerp.depositos(id);

ALTER TABLE alissonerp.servicos
  ADD COLUMN IF NOT EXISTS transferencia_service_id INTEGER REFERENCES alissonerp.transferencias_ordem(id);

COMMIT;
