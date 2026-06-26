-- ============================================================
-- Migration 147 — Fiscal: tabelas espelho de produto e contato
-- v2.25.0 — Modulo NF-e/NFC-e Sprint 1
--
-- Proposito:
--   public.produtos, public.contatos e public.vendedores sao READONLY
--   (sync Tiny pode sobrescrever). Campos fiscais (NCM, CEST, CFOP, IE,
--   IBGE municipio, empresa_emitente_id etc.) ficam em tabelas ESPELHO
--   em alissonerp, com PK igual ao id da origem.
--
--   As FKs sao LOGICAS (NAO fisicas) — public eh gerenciado
--   externamente, criar FK cross-schema causaria dependencia
--   que o sync nao respeitaria.
--
-- Impacto:
--   - Nova tabela alissonerp.produtos_fiscais (1:1 com public.produtos)
--   - Nova tabela alissonerp.contatos_fiscais (1:1 com public.contatos)
--
-- Uso pretendido:
--   SELECT p.*, pf.ncm, pf.cfop_saida, pf.origem
--   FROM public.produtos p
--   LEFT JOIN alissonerp.produtos_fiscais pf ON pf.id_produto = p.id_produto;
--
-- Reversao:
--   DROP TABLE IF EXISTS alissonerp.produtos_fiscais;
--   DROP TABLE IF EXISTS alissonerp.contatos_fiscais;
-- ============================================================

SET search_path TO alissonerp;

-- ──────────────────────────────────────────────────────────
-- 1. produtos_fiscais (espelho de public.produtos)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.produtos_fiscais (
  id_produto         BIGINT        PRIMARY KEY,
  ncm                VARCHAR(8),
  cest               VARCHAR(7),
  cfop_saida         VARCHAR(4),
  origem             SMALLINT      NOT NULL DEFAULT 0
                     CHECK (origem BETWEEN 0 AND 8),
  unidade_comercial  VARCHAR(6)    NOT NULL DEFAULT 'UN',
  ean                VARCHAR(14),
  updated_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  alissonerp.produtos_fiscais IS 'Campos fiscais de produto. PK = public.produtos.id_produto (FK logica).';
COMMENT ON COLUMN alissonerp.produtos_fiscais.id_produto IS 'Ref logica a public.produtos.id_produto (sem FK fisica)';
COMMENT ON COLUMN alissonerp.produtos_fiscais.ncm IS 'Nomenclatura Comum do Mercosul (8 digitos). Ex: 71131910 (joia ouro)';
COMMENT ON COLUMN alissonerp.produtos_fiscais.cest IS 'Codigo Especificador da Substituicao Tributaria (7 digitos)';
COMMENT ON COLUMN alissonerp.produtos_fiscais.origem IS '0=Nacional,1=Importacao direta,2=Importado de terceiros,...';
COMMENT ON COLUMN alissonerp.produtos_fiscais.unidade_comercial IS 'UN, PC, CT (carat), GR, DZ, etc.';

CREATE INDEX IF NOT EXISTS idx_produtos_fiscais_ncm ON alissonerp.produtos_fiscais(ncm);

-- ──────────────────────────────────────────────────────────
-- 2. contatos_fiscais (espelho de public.contatos)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.contatos_fiscais (
  id_contato             BIGINT        PRIMARY KEY,
  ie                     VARCHAR(20),
  indicador_ie           SMALLINT      CHECK (indicador_ie IN (1,2,9)),
  codigo_ibge_municipio  VARCHAR(7),
  regime_tributario      SMALLINT,
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  alissonerp.contatos_fiscais IS 'Campos fiscais de cliente/fornecedor. PK = public.contatos.id_contato (FK logica).';
COMMENT ON COLUMN alissonerp.contatos_fiscais.id_contato IS 'Ref logica a public.contatos.id_contato (sem FK fisica)';
COMMENT ON COLUMN alissonerp.contatos_fiscais.ie IS 'Inscricao Estadual (so dig). Vazio se isento ou nao contribuinte.';
COMMENT ON COLUMN alissonerp.contatos_fiscais.indicador_ie IS '1=Contribuinte ICMS, 2=Isento, 9=Nao contribuinte';
COMMENT ON COLUMN alissonerp.contatos_fiscais.codigo_ibge_municipio IS 'Codigo IBGE do municipio (7 digitos) — obrigatorio na NF-e';
COMMENT ON COLUMN alissonerp.contatos_fiscais.regime_tributario IS '1=Simples, 2=Lucro Presumido, 3=Lucro Real';

CREATE INDEX IF NOT EXISTS idx_contatos_fiscais_ibge ON alissonerp.contatos_fiscais(codigo_ibge_municipio)
  WHERE codigo_ibge_municipio IS NOT NULL;

-- ──────────────────────────────────────────────────────────
-- 3. vendedores_fiscais (espelho de public.vendedores)
-- ──────────────────────────────────────────────────────────
-- public.vendedores eh READONLY (sync externo). Vinculo de vendedor
-- ao CNPJ emitente (qual loja ele representa) fica aqui.
CREATE TABLE IF NOT EXISTS alissonerp.vendedores_fiscais (
  id_vendedor          BIGINT        PRIMARY KEY,
  empresa_emitente_id  INTEGER       REFERENCES alissonerp.empresas_emitentes(id),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  alissonerp.vendedores_fiscais IS 'Vinculo fiscal vendedor x empresa emitente. PK = public.vendedores.id_vendedor (FK logica).';
COMMENT ON COLUMN alissonerp.vendedores_fiscais.id_vendedor IS 'Ref logica a public.vendedores.id_vendedor (sem FK fisica)';
COMMENT ON COLUMN alissonerp.vendedores_fiscais.empresa_emitente_id IS 'CNPJ emitente que este vendedor representa (NULL = generico/fabrica)';

CREATE INDEX IF NOT EXISTS idx_vendedores_fiscais_empresa
  ON alissonerp.vendedores_fiscais(empresa_emitente_id)
  WHERE empresa_emitente_id IS NOT NULL;
