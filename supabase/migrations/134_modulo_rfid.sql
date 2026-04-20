-- ============================================================================
-- Migration 134 — Modulo RFID (fase 1a: cadastro individual + impressao Zebra)
-- ============================================================================
-- Contexto:
--   Jonathan vai etiquetar 3k-10k joias com tag RFID UHF Gen2 (EPC 96 bits).
--   Impressora Zebra ZD621R no notebook da fabrica, impressao via utilitario
--   oficial "Zebra Browser Print" (localhost:9101) — backend so gera ZPL.
--
--   Fase 1a: cadastro individual + impressao (esta migration).
--   Fase 2 (futura): leitor TSL 1128, inventario, geiger, aprovacao divergencias.
--
-- Tabelas:
--   alissonerp.joias_rfid       — 1 linha = 1 joia fisica com EPC unico
--   alissonerp.joias_leituras   — timeline de eventos (cadastro/reimpressao/...)
--   alissonerp.epc_serial       — controle atomico do serial sequencial por ano
--
-- Funcoes:
--   alissonerp.gerar_proximo_epc() RETURNS TEXT
--     Formato: AJ{AA}{NNNNNNNN} = 12 chars ASCII = 96 bits em hex
--     Exemplo: AJ2600000001 (serial 1 de 2026)
--
-- Seguranca:
--   - CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION
--   - FK produto_id em public.produtos(id_produto) — BIGINT (PK real)
--   - FK criado_por em alissonerp.usuarios(id) — ON DELETE SET NULL
--   - Nenhuma alteracao em public.* ou directus.* (readonly)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Controle atomico do serial de EPC por ano
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.epc_serial (
  ano            INT    PRIMARY KEY,
  proximo_serial BIGINT NOT NULL DEFAULT 1,
  atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  alissonerp.epc_serial IS
  'Controle atomico do serial sequencial de EPC por ano. Uma linha por ano.';
COMMENT ON COLUMN alissonerp.epc_serial.ano IS
  'Ano em 2 digitos (ex: 26 para 2026) — igual ao {AA} do EPC.';
COMMENT ON COLUMN alissonerp.epc_serial.proximo_serial IS
  'Proximo serial a ser alocado. Atualizado pela funcao gerar_proximo_epc().';

-- ----------------------------------------------------------------------------
-- 2) Funcao geradora de EPC sequencial (atomico via ON CONFLICT DO UPDATE)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION alissonerp.gerar_proximo_epc()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  ano_atual INT := EXTRACT(YEAR FROM now())::INT - 2000;
  serial    BIGINT;
BEGIN
  -- INSERT com ON CONFLICT garante atomicidade mesmo sob alta concorrencia.
  -- Na 1a chamada do ano: insere (ano, 2) e retorna serial=1 (proximo_serial - 1).
  -- Nas seguintes: incrementa proximo_serial e retorna o valor anterior.
  INSERT INTO alissonerp.epc_serial (ano, proximo_serial)
  VALUES (ano_atual, 2)
  ON CONFLICT (ano) DO UPDATE
    SET proximo_serial = alissonerp.epc_serial.proximo_serial + 1,
        atualizado_em  = now()
  RETURNING proximo_serial - 1 INTO serial;

  RETURN 'AJ' || LPAD(ano_atual::TEXT, 2, '0') || LPAD(serial::TEXT, 8, '0');
END;
$$;

COMMENT ON FUNCTION alissonerp.gerar_proximo_epc() IS
  'Gera proximo EPC sequencial no formato AJ{AA}{NNNNNNNN} (12 chars ASCII / 96 bits hex). Atomico.';

-- ----------------------------------------------------------------------------
-- 3) Tabela principal: joias com tag RFID (estoque fisico rastreado)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.joias_rfid (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  epc                TEXT         NOT NULL UNIQUE,
  produto_id         BIGINT       REFERENCES public.produtos(id_produto) ON DELETE RESTRICT,
  sku                TEXT         NOT NULL,
  nome               TEXT         NOT NULL,
  categoria          TEXT,
  peso_g             NUMERIC(8,3),
  preco_venda        NUMERIC(10,2),
  localizacao_atual  TEXT         NOT NULL DEFAULT 'fabrica',
  status             TEXT         NOT NULL DEFAULT 'ativo'
                                  CHECK (status IN ('ativo', 'pendente_impressao', 'cancelado')),
  criado_por         UUID         REFERENCES alissonerp.usuarios(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  alissonerp.joias_rfid IS
  '1 linha = 1 joia fisica com EPC unico. Dados do produto desnormalizados no momento do cadastro (snapshot).';
COMMENT ON COLUMN alissonerp.joias_rfid.epc IS
  'Electronic Product Code unico (AJ{AA}{NNNNNNNN}) gravado na tag RFID.';
COMMENT ON COLUMN alissonerp.joias_rfid.produto_id IS
  'FK public.produtos.id_produto (BIGINT). SKU/nome/preco copiados como snapshot.';
COMMENT ON COLUMN alissonerp.joias_rfid.status IS
  'ativo = rastreavel em producao | pendente_impressao = aguarda confirmacao Zebra | cancelado = removido';
COMMENT ON COLUMN alissonerp.joias_rfid.localizacao_atual IS
  'Local atual da peca (ex: fabrica, vitrine, reposicao). Atualizado por eventos futuros.';

-- Indices
CREATE INDEX IF NOT EXISTS idx_joias_rfid_epc
  ON alissonerp.joias_rfid (epc);
CREATE INDEX IF NOT EXISTS idx_joias_rfid_sku
  ON alissonerp.joias_rfid (sku);
CREATE INDEX IF NOT EXISTS idx_joias_rfid_produto
  ON alissonerp.joias_rfid (produto_id);
CREATE INDEX IF NOT EXISTS idx_joias_rfid_localizacao_ativo
  ON alissonerp.joias_rfid (localizacao_atual)
  WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS idx_joias_rfid_criado_por
  ON alissonerp.joias_rfid (criado_por, created_at DESC)
  WHERE status = 'ativo';

-- Trigger de updated_at (simples, inline)
CREATE OR REPLACE FUNCTION alissonerp.tg_joias_rfid_touch_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_joias_rfid_touch_updated ON alissonerp.joias_rfid;
CREATE TRIGGER trg_joias_rfid_touch_updated
  BEFORE UPDATE ON alissonerp.joias_rfid
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.tg_joias_rfid_touch_updated();

-- ----------------------------------------------------------------------------
-- 4) Timeline de leituras / eventos de RFID
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.joias_leituras (
  id           BIGSERIAL    PRIMARY KEY,
  epc          TEXT         NOT NULL,
  evento       TEXT         NOT NULL
                            CHECK (evento IN ('cadastro', 'reimpressao', 'inventario', 'cancelamento', 'movimentacao')),
  localizacao  TEXT,
  leitor_id    TEXT,
  operador     UUID         REFERENCES alissonerp.usuarios(id) ON DELETE SET NULL,
  metadata     JSONB,
  lido_em      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE  alissonerp.joias_leituras IS
  'Timeline de eventos RFID: cadastro, reimpressao, inventario, movimentacao, cancelamento. EPC nao tem FK — permite manter historico apos delete da joia.';
COMMENT ON COLUMN alissonerp.joias_leituras.evento IS
  'Tipo de evento: cadastro (1a impressao), reimpressao, inventario (leitura em contagem), movimentacao (mudanca de local), cancelamento (rollback ou baixa).';
COMMENT ON COLUMN alissonerp.joias_leituras.leitor_id IS
  'Identificador do dispositivo de leitura/gravacao. Ex: ZEBRA-ZD621R, TSL-1128-SN123.';

CREATE INDEX IF NOT EXISTS idx_joias_leituras_epc
  ON alissonerp.joias_leituras (epc, lido_em DESC);
CREATE INDEX IF NOT EXISTS idx_joias_leituras_operador
  ON alissonerp.joias_leituras (operador, lido_em DESC);
CREATE INDEX IF NOT EXISTS idx_joias_leituras_evento
  ON alissonerp.joias_leituras (evento, lido_em DESC);

-- ----------------------------------------------------------------------------
-- 5) Grants (para PostgREST / Supabase ler metadados corretamente)
--    Schema alissonerp ja tem grants padrao; aplicamos nas novas tabelas.
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.joias_rfid      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.joias_leituras  TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON alissonerp.epc_serial      TO authenticated;
GRANT USAGE, SELECT                  ON SEQUENCE alissonerp.joias_leituras_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.gerar_proximo_epc()           TO authenticated;

-- ============================================================================
-- Fim migration 134
-- ============================================================================
