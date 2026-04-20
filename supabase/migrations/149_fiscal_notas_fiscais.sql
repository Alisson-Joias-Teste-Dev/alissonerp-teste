-- ============================================================
-- Migration 149 — Fiscal: tabela mestra de notas fiscais
-- v2.25.0 — Modulo NF-e/NFC-e Sprint 1
--
-- Proposito:
--   Tabela UNIVERSAL para NF-e modelo 55 e NFC-e modelo 65.
--   Polimorfica via (origem_tabela, origem_id) — uma nota pode
--   referenciar uma venda, uma transferencia ou uma devolucao.
--
--   focus_ref eh idempotency key enviado ao gateway Focus NFe
--   para evitar dupla emissao em caso de retry.
--
-- Impacto:
--   - Nova tabela alissonerp.notas_fiscais
--   - FKs fisicas adicionadas em vendas_erp, transferencias_estoque_comercial,
--     devolucoes_venda (colunas ja criadas em 148)
--
-- Reversao:
--   Remover FKs primeiro, depois DROP TABLE.
-- ============================================================

SET search_path TO alissonerp;

CREATE TABLE IF NOT EXISTS alissonerp.notas_fiscais (
  id                     SERIAL         PRIMARY KEY,
  modelo                 SMALLINT       NOT NULL
                         CHECK (modelo IN (55,65)),
  serie                  SMALLINT       NOT NULL,
  numero                 INTEGER        NOT NULL,
  chave_44               VARCHAR(44)    UNIQUE,
  empresa_emitente_id    INTEGER        NOT NULL
                         REFERENCES alissonerp.empresas_emitentes(id),
  tipo_operacao          VARCHAR(20)    NOT NULL
                         CHECK (tipo_operacao IN
                           ('venda','remessa','devolucao','conserto','retorno','outro')),
  origem_tabela          VARCHAR(50)    NOT NULL,
  origem_id              BIGINT         NOT NULL,
  cliente_contato_id     BIGINT,
  natureza_operacao      VARCHAR(60)    NOT NULL,
  cfop                   VARCHAR(4),
  valor_produtos         NUMERIC(15,2)  NOT NULL DEFAULT 0,
  valor_desconto         NUMERIC(15,2)  NOT NULL DEFAULT 0,
  valor_frete            NUMERIC(15,2)  NOT NULL DEFAULT 0,
  valor_total            NUMERIC(15,2)  NOT NULL DEFAULT 0,
  status                 VARCHAR(20)    NOT NULL DEFAULT 'rascunho'
                         CHECK (status IN
                           ('rascunho','processando','autorizada','rejeitada','cancelada','denegada','inutilizada')),
  focus_ref              VARCHAR(80)    UNIQUE,
  xml_assinado           TEXT,
  xml_protocolo          TEXT,
  pdf_danfe_url          TEXT,
  codigo_sefaz           VARCHAR(10),
  mensagem_sefaz         TEXT,
  emitida_por_user_id    UUID,
  ambiente               VARCHAR(15)    NOT NULL
                         CHECK (ambiente IN ('homologacao','producao')),
  created_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  alissonerp.notas_fiscais IS 'Notas fiscais (55 + 65). Polimorfica via (origem_tabela, origem_id).';
COMMENT ON COLUMN alissonerp.notas_fiscais.modelo IS '55 = NF-e | 65 = NFC-e';
COMMENT ON COLUMN alissonerp.notas_fiscais.chave_44 IS 'Chave de acesso SEFAZ (NULL ate autorizacao)';
COMMENT ON COLUMN alissonerp.notas_fiscais.origem_tabela IS 'vendas_erp | transferencias_estoque_comercial | devolucoes_venda';
COMMENT ON COLUMN alissonerp.notas_fiscais.cliente_contato_id IS 'Ref logica a public.contatos.id_contato (NULL em remessa interna)';
COMMENT ON COLUMN alissonerp.notas_fiscais.focus_ref IS 'Idempotency key enviado ao Focus NFe (evita dupla emissao em retry)';
COMMENT ON COLUMN alissonerp.notas_fiscais.emitida_por_user_id IS 'Ref auth.users.id (sem FK fisica pois auth eh gerenciado pelo Supabase)';
COMMENT ON COLUMN alissonerp.notas_fiscais.ambiente IS 'Snapshot do ambiente em que foi emitida (homolog vs prod)';

CREATE INDEX IF NOT EXISTS idx_notas_fiscais_empresa_modelo_num
  ON alissonerp.notas_fiscais(empresa_emitente_id, modelo, numero DESC);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_status
  ON alissonerp.notas_fiscais(status);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_origem
  ON alissonerp.notas_fiscais(origem_tabela, origem_id);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_created
  ON alissonerp.notas_fiscais(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_cliente
  ON alissonerp.notas_fiscais(cliente_contato_id)
  WHERE cliente_contato_id IS NOT NULL;

-- Numero unico por (emitente, modelo, serie)
CREATE UNIQUE INDEX IF NOT EXISTS uq_notas_fiscais_numeracao
  ON alissonerp.notas_fiscais(empresa_emitente_id, modelo, serie, numero);

-- ──────────────────────────────────────────────────────────
-- FKs fisicas para as colunas criadas em 148 (agora que a
-- tabela notas_fiscais existe)
-- Usamos DO block com guard para idempotencia.
-- ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_vendas_erp_nota_fiscal'
  ) THEN
    ALTER TABLE alissonerp.vendas_erp
      ADD CONSTRAINT fk_vendas_erp_nota_fiscal
      FOREIGN KEY (nota_fiscal_id)
      REFERENCES alissonerp.notas_fiscais(id);
  END IF;

  -- FK transferencias so se a tabela existir E a coluna tiver sido criada
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='alissonerp'
      AND table_name='transferencias_estoque_comercial'
      AND column_name='nota_fiscal_remessa_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_transf_nota_fiscal_remessa'
  ) THEN
    ALTER TABLE alissonerp.transferencias_estoque_comercial
      ADD CONSTRAINT fk_transf_nota_fiscal_remessa
      FOREIGN KEY (nota_fiscal_remessa_id)
      REFERENCES alissonerp.notas_fiscais(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_devolucoes_nota_fiscal'
  ) THEN
    ALTER TABLE alissonerp.devolucoes_venda
      ADD CONSTRAINT fk_devolucoes_nota_fiscal
      FOREIGN KEY (nota_fiscal_devolucao_id)
      REFERENCES alissonerp.notas_fiscais(id);
  END IF;
END $$;
