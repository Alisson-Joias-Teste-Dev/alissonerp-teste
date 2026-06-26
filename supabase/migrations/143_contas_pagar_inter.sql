-- ============================================================
-- Migration 143 — Integracao Banco Inter para Contas a Pagar
-- v2.23.0 — Pagamentos Pix/Boleto/TED via API Inter
-- ============================================================

SET search_path TO alissonerp;

ALTER TABLE alissonerp.contas_pagar
  ADD COLUMN IF NOT EXISTS inter_pagamento_id    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS inter_status          VARCHAR(30),
  ADD COLUMN IF NOT EXISTS inter_tipo            VARCHAR(10),
  ADD COLUMN IF NOT EXISTS inter_dados           JSONB,
  ADD COLUMN IF NOT EXISTS inter_enviado_em      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inter_atualizado_em   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS inter_erro            TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_contas_pagar_inter_tipo'
  ) THEN
    ALTER TABLE alissonerp.contas_pagar
      ADD CONSTRAINT ck_contas_pagar_inter_tipo
      CHECK (inter_tipo IS NULL OR inter_tipo IN ('pix', 'boleto', 'ted'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_contas_pagar_inter_pagamento
  ON alissonerp.contas_pagar(inter_pagamento_id)
  WHERE inter_pagamento_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contas_pagar_inter_status_pendente
  ON alissonerp.contas_pagar(inter_status)
  WHERE inter_status IS NOT NULL AND situacao = 'pendente';

-- Tabela de log de sync
CREATE TABLE IF NOT EXISTS alissonerp.inter_sync_log (
  id              SERIAL PRIMARY KEY,
  conta_pagar_id  INTEGER REFERENCES alissonerp.contas_pagar(id),
  operacao        VARCHAR(20) NOT NULL CHECK (operacao IN ('criar','consultar','cancelar')),
  inter_pagamento_id VARCHAR(100),
  status_retornado  VARCHAR(30),
  sucesso         BOOLEAN NOT NULL,
  erro            TEXT,
  request_body    JSONB,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inter_sync_log_conta ON alissonerp.inter_sync_log(conta_pagar_id);
CREATE INDEX IF NOT EXISTS idx_inter_sync_log_created ON alissonerp.inter_sync_log(created_at DESC);

GRANT SELECT, INSERT ON alissonerp.inter_sync_log TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.inter_sync_log_id_seq TO authenticated;
