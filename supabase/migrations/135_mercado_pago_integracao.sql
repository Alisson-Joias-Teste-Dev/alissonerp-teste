-- =============================================
-- MIGRATION 135: INTEGRAÇÃO MERCADO PAGO — BASE
-- v2.19.70 (Fase 1 — Infra)
--
-- Infraestrutura pro fluxo "pagamento MP aprovado → venda concluída":
--   1. webhook_config: entrada pro receiver MP
--   2. mp_point_devices: cadastro das maquininhas Point Smart
--   3. idx gateway_id: lookup rápido no webhook
--   4. fn_cr_marcar_pago_mp: helper pra quitar contas_receber
--
-- Não altera vendas_erp / pagamentos_venda (já têm gateway_id, gateway_payload,
-- data_confirmacao desde a migration 104).
-- =============================================

-- ─── 1. Webhook config — entrada pro receiver ─────────────────────────────────
-- webhook_config.url é NOT NULL. Usamos a URL do próprio endpoint receiver
-- como placeholder — não é "disparada" por fn_disparar_webhook, só faz
-- inverse lookup quando o webhook_log precisa referenciar o nome.
INSERT INTO alissonerp.webhook_config (nome, url, descricao, ativo)
VALUES (
  'mercado-pago-payment',
  '/api/webhooks/mercado-pago',
  'Receiver de notificações MP (Payment Link + Point Smart)',
  true
)
ON CONFLICT (nome) DO NOTHING;

-- ─── 2. Índice pra lookup rápido no webhook ───────────────────────────────────
-- O webhook busca pagamentos_venda por gateway_id (preference_id ou intent_id).
CREATE INDEX IF NOT EXISTS idx_pagamentos_venda_gateway_id
  ON alissonerp.pagamentos_venda (gateway_id)
  WHERE gateway_id IS NOT NULL;

-- ─── 3. Cadastro de maquininhas Point Smart ───────────────────────────────────
-- Sincronizado da MP Integration API (/point/integration-api/devices).
-- Nome legível permite Jonathan renomear ("Caixa Balcão", "Maquininha Móvel").
CREATE TABLE IF NOT EXISTS alissonerp.mp_point_devices (
  id             SERIAL PRIMARY KEY,
  device_id      TEXT NOT NULL UNIQUE,       -- id MP (ex: "PAX_A920__SMARTPOS1234567890")
  nome_legivel   TEXT NOT NULL,              -- "Caixa Balcão", "Móvel", etc.
  store_id       TEXT,                       -- MP store_id (opcional)
  pos_id         TEXT,                       -- MP pos_id (opcional)
  operating_mode TEXT,                       -- "PDV" | "STANDALONE" (retornado pela sincronização)
  ativo          BOOLEAN NOT NULL DEFAULT true,
  loja           TEXT,                        -- rótulo interno: "Matriz", "Filial Shopping"
  last_sync_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mp_point_devices_ativo
  ON alissonerp.mp_point_devices (ativo)
  WHERE ativo = true;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_mp_point_devices()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_mp_point_devices ON alissonerp.mp_point_devices;
CREATE TRIGGER trg_updated_at_mp_point_devices
  BEFORE UPDATE ON alissonerp.mp_point_devices
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_updated_at_mp_point_devices();

-- ─── 4. Função helper: marcar contas_receber como recebida ────────────────────
-- Chamada pelo webhook depois que concluirVenda() roda, pra marcar a CR criada
-- pelo trigger 113 (fn_venda_gerar_conta_receber) como 'pago'.
-- Coluna real: contas_receber.data_recebimento (NÃO data_pagamento — migration 024).
CREATE OR REPLACE FUNCTION alissonerp.fn_cr_marcar_pago_mp(p_venda_id INTEGER)
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE alissonerp.contas_receber
  SET
    situacao         = 'pago',
    data_recebimento = CURRENT_DATE,
    updated_at       = NOW()
  WHERE venda_erp_id = p_venda_id
    AND situacao     = 'pendente';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ─── 5. Grants ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.mp_point_devices    TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.mp_point_devices_id_seq     TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_cr_marcar_pago_mp(INTEGER)     TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_updated_at_mp_point_devices()  TO authenticated;
