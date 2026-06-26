-- ============================================================
-- Migration 146 — Fiscal: matriz de regras fiscais por NCM x UF
-- v2.25.0 — Modulo NF-e/NFC-e Sprint 1
--
-- Proposito:
--   Matriz fiscal que define, para cada (empresa, NCM, UF destino),
--   o CFOP, CSOSN (Simples) ou CST, origem, aliquotas IBPT
--   (Lei 12.741) e dados de ST quando aplicavel.
--
--   empresa_emitente_id NULL = regra geral (fallback para todas
--   as empresas que nao tenham regra especifica).
--   uf_destino NULL = vale para qualquer UF (fallback).
--
-- Impacto:
--   - Nova tabela alissonerp.regras_fiscais
--   - FK opcional para empresas_emitentes
--
-- Reversao manual:
--   DROP TABLE IF EXISTS alissonerp.regras_fiscais;
-- ============================================================

SET search_path TO alissonerp;

CREATE TABLE IF NOT EXISTS alissonerp.regras_fiscais (
  id                     SERIAL        PRIMARY KEY,
  empresa_emitente_id    INTEGER       REFERENCES alissonerp.empresas_emitentes(id),
  ncm                    VARCHAR(8)    NOT NULL,
  uf_destino             CHAR(2),
  cfop_saida             VARCHAR(4)    NOT NULL,
  cfop_devolucao         VARCHAR(4),
  csosn                  VARCHAR(4),
  cst_icms               VARCHAR(3),
  origem                 SMALLINT      NOT NULL DEFAULT 0
                         CHECK (origem BETWEEN 0 AND 8),
  aliq_ibpt_federal      NUMERIC(5,2)  NOT NULL DEFAULT 0,
  aliq_ibpt_estadual     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  aliq_ibpt_municipal    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  mva_st                 NUMERIC(7,4),
  aliq_icms_st           NUMERIC(5,2),
  ativo                  BOOLEAN       NOT NULL DEFAULT true,
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  alissonerp.regras_fiscais                IS 'Matriz fiscal: por NCM x UF destino, define CFOP/CSOSN/CST/aliquotas';
COMMENT ON COLUMN alissonerp.regras_fiscais.empresa_emitente_id IS 'NULL = regra geral (fallback)';
COMMENT ON COLUMN alissonerp.regras_fiscais.uf_destino     IS 'NULL = qualquer UF (fallback)';
COMMENT ON COLUMN alissonerp.regras_fiscais.csosn          IS 'Simples Nacional: 101/102/103/201/202/203/300/400/500/900';
COMMENT ON COLUMN alissonerp.regras_fiscais.cst_icms       IS 'Usado em devolucao/entrada ou regime nao-Simples';
COMMENT ON COLUMN alissonerp.regras_fiscais.origem         IS '0=Nacional,1=Importacao direta,2=Importado terceirizado,...8';
COMMENT ON COLUMN alissonerp.regras_fiscais.aliq_ibpt_federal IS 'IBPT federal (Lei 12.741) em %';

-- Unique: (empresa, NCM, UF) tratando NULLs como valor especifico
-- Para evitar duplicatas com NULL (Postgres permite multiplas NULL em UNIQUE padrao),
-- criamos 4 indices parciais cobrindo todas as combinacoes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_regras_fiscais_full
  ON alissonerp.regras_fiscais(empresa_emitente_id, ncm, uf_destino)
  WHERE empresa_emitente_id IS NOT NULL AND uf_destino IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_regras_fiscais_sem_uf
  ON alissonerp.regras_fiscais(empresa_emitente_id, ncm)
  WHERE empresa_emitente_id IS NOT NULL AND uf_destino IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_regras_fiscais_sem_empresa
  ON alissonerp.regras_fiscais(ncm, uf_destino)
  WHERE empresa_emitente_id IS NULL AND uf_destino IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_regras_fiscais_geral
  ON alissonerp.regras_fiscais(ncm)
  WHERE empresa_emitente_id IS NULL AND uf_destino IS NULL;

CREATE INDEX IF NOT EXISTS idx_regras_fiscais_ncm
  ON alissonerp.regras_fiscais(ncm);
CREATE INDEX IF NOT EXISTS idx_regras_fiscais_ativo
  ON alissonerp.regras_fiscais(ativo)
  WHERE ativo = true;
