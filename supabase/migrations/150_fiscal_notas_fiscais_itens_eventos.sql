-- ============================================================
-- Migration 150 — Fiscal: itens e eventos de notas fiscais
-- v2.25.0 — Modulo NF-e/NFC-e Sprint 1
--
-- Proposito:
--   notas_fiscais_itens: snapshot fiscal por item faturado
--     (NCM, CFOP, CSOSN, bases, aliquotas, impostos calculados).
--     NAO usa FK para produto (ref logica a public.produtos).
--
--   notas_fiscais_eventos: eventos pos-autorizacao
--     (cancelamento, CC-e, inutilizacao, manifestacao do dest.).
--
-- Impacto:
--   - Novas tabelas alissonerp.notas_fiscais_itens
--   - Novas tabelas alissonerp.notas_fiscais_eventos
--   - ON DELETE CASCADE no FK para notas_fiscais
--
-- Reversao:
--   DROP TABLE IF EXISTS alissonerp.notas_fiscais_itens;
--   DROP TABLE IF EXISTS alissonerp.notas_fiscais_eventos;
-- ============================================================

SET search_path TO alissonerp;

-- ──────────────────────────────────────────────────────────
-- 1. notas_fiscais_itens — snapshot fiscal por item
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.notas_fiscais_itens (
  id                     SERIAL        PRIMARY KEY,
  nota_fiscal_id         INTEGER       NOT NULL
                         REFERENCES alissonerp.notas_fiscais(id) ON DELETE CASCADE,
  numero_item            SMALLINT      NOT NULL,
  produto_id             BIGINT,
  codigo_produto         VARCHAR(60),
  descricao              VARCHAR(120)  NOT NULL,
  ncm                    VARCHAR(8),
  cest                   VARCHAR(7),
  cfop                   VARCHAR(4)    NOT NULL,
  unidade                VARCHAR(6)    NOT NULL,
  ean                    VARCHAR(14),
  origem                 SMALLINT,
  quantidade             NUMERIC(15,4) NOT NULL,
  valor_unitario         NUMERIC(15,4) NOT NULL,
  valor_total            NUMERIC(15,2) NOT NULL,
  valor_desconto         NUMERIC(15,2) NOT NULL DEFAULT 0,
  csosn                  VARCHAR(4),
  cst_icms               VARCHAR(3),
  vbc_icms               NUMERIC(15,2) NOT NULL DEFAULT 0,
  aliq_icms              NUMERIC(5,2)  NOT NULL DEFAULT 0,
  valor_icms             NUMERIC(15,2) NOT NULL DEFAULT 0,
  vbc_icms_st            NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_icms_st          NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_aprox_tributos   NUMERIC(15,2) NOT NULL DEFAULT 0
);

COMMENT ON TABLE  alissonerp.notas_fiscais_itens IS 'Snapshot fiscal por item da nota (imutavel apos autorizacao).';
COMMENT ON COLUMN alissonerp.notas_fiscais_itens.produto_id IS 'Ref logica a public.produtos.id_produto';
COMMENT ON COLUMN alissonerp.notas_fiscais_itens.valor_aprox_tributos IS 'IBPT (Lei 12.741) — valor aproximado de tributos por item';

CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_itens_numero
  ON alissonerp.notas_fiscais_itens(nota_fiscal_id, numero_item);
CREATE INDEX IF NOT EXISTS idx_notas_itens_produto
  ON alissonerp.notas_fiscais_itens(produto_id)
  WHERE produto_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────
-- 2. notas_fiscais_eventos — cancelamento, CC-e, inutilizacao
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.notas_fiscais_eventos (
  id                     SERIAL        PRIMARY KEY,
  nota_fiscal_id         INTEGER       NOT NULL
                         REFERENCES alissonerp.notas_fiscais(id) ON DELETE CASCADE,
  tipo                   VARCHAR(20)   NOT NULL
                         CHECK (tipo IN ('cancelamento','cce','inutilizacao','manifestacao')),
  sequencia              SMALLINT      NOT NULL DEFAULT 1,
  justificativa          TEXT,
  xml_evento             TEXT,
  xml_protocolo          TEXT,
  status                 VARCHAR(20)   NOT NULL DEFAULT 'processando'
                         CHECK (status IN ('processando','registrado','rejeitado')),
  codigo_sefaz           VARCHAR(10),
  mensagem_sefaz         TEXT,
  criado_por_user_id     UUID,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  alissonerp.notas_fiscais_eventos IS 'Eventos pos-emissao: cancelamento, CC-e, inutilizacao, manifestacao.';
COMMENT ON COLUMN alissonerp.notas_fiscais_eventos.sequencia IS 'Sequencia do evento na SEFAZ (CC-e pode ter varias)';
COMMENT ON COLUMN alissonerp.notas_fiscais_eventos.justificativa IS 'Obrigatoria em cancelamento (min 15 chars) e CC-e';

CREATE INDEX IF NOT EXISTS idx_notas_eventos_nota_tipo
  ON alissonerp.notas_fiscais_eventos(nota_fiscal_id, tipo, sequencia);
CREATE INDEX IF NOT EXISTS idx_notas_eventos_created
  ON alissonerp.notas_fiscais_eventos(created_at DESC);
