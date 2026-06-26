-- =============================================
-- MIGRATION 284: INTEGRAÇÃO PAGBANK — BASE
-- v2.X (Fase 1 — Infra)
--
-- Infraestrutura pro fluxo "pagamento PagBank aprovado → venda concluída":
--   1. fin_gateways: entrada PagBank
--   2. webhook_config: entrada pro receiver PagBank
--   3. pagbank_devices: cadastro das maquininhas Moderninha
--   4. Atualiza CHECK constraint de source em pagamentos_venda
--      para aceitar 'webhook_pagbank' e 'manual_pagbank'
--
-- Não altera vendas_erp / pagamentos_venda (já têm gateway_id, gateway_payload,
-- data_confirmacao desde a migration 104).
-- =============================================

-- ─── 1. Gateway no catálogo financeiro ────────────────────────────────────────
INSERT INTO alissonerp.fin_gateways (nome, tipo, cor, ativo)
VALUES ('PagBank', 'outro', '#00D972', true)
ON CONFLICT (nome) DO NOTHING;

-- ─── 2. Webhook config — entrada pro receiver ─────────────────────────────────
INSERT INTO alissonerp.webhook_config (nome, url, descricao, ativo)
VALUES (
  'pagbank-payment',
  '/api/webhooks/pagbank',
  'Receiver de notificações PagBank (Orders + Charges)',
  true
)
ON CONFLICT (nome) DO NOTHING;

-- ─── 3. Cadastro de maquininhas Moderninha PagBank ────────────────────────────
-- Estrutura igual à mp_point_devices (migration 135).
CREATE TABLE IF NOT EXISTS alissonerp.pagbank_devices (
  id             SERIAL PRIMARY KEY,
  device_id      TEXT NOT NULL UNIQUE,
  nome_legivel   TEXT NOT NULL,
  ativo          BOOLEAN NOT NULL DEFAULT true,
  loja           TEXT,
  vendedor_id    INTEGER,
  is_reserva     BOOLEAN NOT NULL DEFAULT false,
  last_sync_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagbank_devices_ativo
  ON alissonerp.pagbank_devices (ativo)
  WHERE ativo = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_pagbank_devices()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_pagbank_devices ON alissonerp.pagbank_devices;
CREATE TRIGGER trg_updated_at_pagbank_devices
  BEFORE UPDATE ON alissonerp.pagbank_devices
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_updated_at_pagbank_devices();

-- ─── 4. Atualizar constraint de source em pagamentos_venda ────────────────────
-- Migration 178 adicionou a coluna source com CHECK constraint.
-- Precisamos adicionar 'webhook_pagbank' e 'manual_pagbank' à lista.
ALTER TABLE alissonerp.pagamentos_venda
  DROP CONSTRAINT IF EXISTS chk_pagamentos_venda_source;

ALTER TABLE alissonerp.pagamentos_venda
  ADD CONSTRAINT chk_pagamentos_venda_source CHECK (
    source IN (
      'webhook_mp', 'manual_mp',
      'webhook_pagbank', 'manual_pagbank',
      'pdv', 'manual', 'ouro', 'dinheiro', 'vale_troca', 'a_receber'
    )
  );

-- ─── 5. Grants ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.pagbank_devices    TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.pagbank_devices_id_seq     TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_updated_at_pagbank_devices()  TO authenticated;
