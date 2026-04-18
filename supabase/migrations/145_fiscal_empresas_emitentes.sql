-- ============================================================
-- Migration 145 — Fiscal: empresas emitentes (multi-CNPJ)
-- v2.25.0 — Modulo NF-e/NFC-e Sprint 1
--
-- Proposito:
--   Cadastro de CNPJs emitentes (fabrica + lojas). Cada emitente
--   tem token Focus NFe proprio, numeracao independente de NF-e
--   e NFC-e, e vincula-se a um local_estoque fisico.
--
-- Impacto:
--   - Nova tabela alissonerp.empresas_emitentes
--   - FK para alissonerp.locais_estoque (ja existe)
--
-- Reversao manual:
--   DROP TABLE IF EXISTS alissonerp.empresas_emitentes;
--
-- NAO toca em: triggers, views, funcoes, schemas public/directus.
-- Idempotente: CREATE TABLE IF NOT EXISTS + ADD CONSTRAINT guard.
-- ============================================================

SET search_path TO alissonerp;

CREATE TABLE IF NOT EXISTS alissonerp.empresas_emitentes (
  id                         SERIAL        PRIMARY KEY,
  nome_fantasia              VARCHAR(100),
  razao_social               VARCHAR(150)  NOT NULL,
  cnpj                       VARCHAR(14)   NOT NULL UNIQUE,
  ie                         VARCHAR(20),
  im                         VARCHAR(20),
  regime_tributario          SMALLINT      NOT NULL DEFAULT 1
                             CHECK (regime_tributario IN (1,2,3)),
  -- Endereco
  logradouro                 VARCHAR(120),
  numero                     VARCHAR(20),
  complemento                VARCHAR(60),
  bairro                     VARCHAR(60),
  codigo_ibge_municipio      VARCHAR(7),
  municipio                  VARCHAR(60),
  uf                         CHAR(2),
  cep                         VARCHAR(8),
  -- Focus NFe
  focus_token_criptografado  TEXT,
  ambiente                   VARCHAR(15)   NOT NULL DEFAULT 'homologacao'
                             CHECK (ambiente IN ('homologacao','producao')),
  -- Numeracao
  serie_nfe                  SMALLINT      NOT NULL DEFAULT 1,
  serie_nfce                 SMALLINT      NOT NULL DEFAULT 1,
  proxima_nfe                INTEGER       NOT NULL DEFAULT 1,
  proxima_nfce               INTEGER       NOT NULL DEFAULT 1,
  -- Vinculo fisico
  local_estoque_id           INTEGER       REFERENCES alissonerp.locais_estoque(id),
  -- Controle
  ativo                      BOOLEAN       NOT NULL DEFAULT true,
  created_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  alissonerp.empresas_emitentes                       IS 'Emitentes fiscais (fabrica + lojas). Multi-CNPJ.';
COMMENT ON COLUMN alissonerp.empresas_emitentes.regime_tributario     IS '1=Simples Nacional, 2=Lucro Presumido, 3=Lucro Real';
COMMENT ON COLUMN alissonerp.empresas_emitentes.ambiente              IS 'homologacao (SEFAZ testes) | producao';
COMMENT ON COLUMN alissonerp.empresas_emitentes.focus_token_criptografado IS 'Token Focus NFe cifrado (pgp_sym_encrypt no app)';
COMMENT ON COLUMN alissonerp.empresas_emitentes.proxima_nfe           IS 'Proximo numero de NF-e 55 a emitir (por serie)';
COMMENT ON COLUMN alissonerp.empresas_emitentes.proxima_nfce          IS 'Proximo numero de NFC-e 65 a emitir (por serie)';
COMMENT ON COLUMN alissonerp.empresas_emitentes.local_estoque_id      IS 'Local fisico que este CNPJ representa (fabrica ou loja)';

CREATE INDEX IF NOT EXISTS idx_empresas_emitentes_cnpj   ON alissonerp.empresas_emitentes(cnpj);
CREATE INDEX IF NOT EXISTS idx_empresas_emitentes_local  ON alissonerp.empresas_emitentes(local_estoque_id)
  WHERE local_estoque_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_empresas_emitentes_ativo  ON alissonerp.empresas_emitentes(ativo)
  WHERE ativo = true;
