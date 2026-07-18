-- Migration 347: RFID — Serial para novo formato EPC 24 dígitos
-- ─────────────────────────────────────────────────────────────────────────────
-- CONTEXTO:
--   O módulo RFID foi refatorado (branch feat/rfid-impressao-zebra).
--   Formato antigo: AJ{AA}{NNNNNNNN} (12 chars ASCII = 96 bits, via epc_serial).
--   Formato novo:   1001{id_produto9}{serial11} (24 dígitos numéricos, hex direto).
--   O serial antigo (epc_serial) continua alimentando as tags AJ durante a
--   fase de convivência. Esta migration cria o serial INDEPENDENTE para o
--   novo formato (11 dígitos sequenciais, 1 linha, livre de corrida).
--
-- O QUE:
--   Tabela alissonerp.epc_serial_rfid — 1 única linha com próximo serial.
--   Função alissonerp.gerar_proximo_serial_rfid() — UPDATE … RETURNING atômico.
--
-- IDEMPOTÊNCIA:
--   CREATE IF NOT EXISTS + INSERT condicional preservam o valor atual em prod.
--   O unique index impede uma segunda linha acidental.
--   A função usa CREATE OR REPLACE.
--
-- PGAPPNAME: rfid_migration_347

-- ── Tabela ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.epc_serial_rfid (
  proximo_serial bigint       NOT NULL DEFAULT 1,
  atualizado_em  timestamptz  NOT NULL DEFAULT now()
);

-- Garante exatamente 1 linha, sem apagar o valor existente em prod.
INSERT INTO alissonerp.epc_serial_rfid (proximo_serial)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM alissonerp.epc_serial_rfid);

-- Trava de linha única — o UPDATE sem WHERE da função só é seguro com 1 linha.
-- Se alguém inserir uma 2ª linha acidentalmente, este índice bloqueia.
CREATE UNIQUE INDEX IF NOT EXISTS epc_serial_rfid_one_row
  ON alissonerp.epc_serial_rfid ((true));

-- ── Função ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.gerar_proximo_serial_rfid()
RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  serial bigint;
BEGIN
  UPDATE alissonerp.epc_serial_rfid
     SET proximo_serial = proximo_serial + 1,
         atualizado_em  = now()
  RETURNING proximo_serial - 1 INTO serial;

  RETURN serial;
END;
$$;
