-- ============================================================
-- Migration 148 — Fiscal: ADD COLUMN em tabelas existentes
-- v2.25.0 — Modulo NF-e/NFC-e Sprint 1
--
-- Proposito:
--   Vincular entidades existentes (vendedor, venda, transferencia,
--   devolucao) a um CNPJ emitente e guardar referencia resumida
--   da nota fiscal emitida (numero, chave, data).
--
--   A FK para notas_fiscais (nota_fiscal_id etc.) NAO eh criada
--   aqui — so na migration 149, apos a tabela existir.
--
-- Impacto:
--   - alissonerp.vendas_erp                      + 5 colunas
--   - alissonerp.transferencias_estoque_comercial + 5 colunas
--   - alissonerp.devolucoes_venda                + 4 colunas
--
-- NOTA: vendedores esta em public.* (READONLY) — vinculo com emitente
-- fica em alissonerp.vendedores_fiscais (tabela espelho, ver 147).
--
-- Garantias:
--   - Todas ADD COLUMN IF NOT EXISTS (idempotente)
--   - Todas NULLABLE (nao quebra dados existentes)
--   - NAO altera/remove colunas existentes
--   - NAO toca em triggers/views das tabelas
-- ============================================================

SET search_path TO alissonerp;

-- ──────────────────────────────────────────────────────────
-- 1. vendas_erp — NFC-e emitida
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS empresa_emitente_id INTEGER
    REFERENCES alissonerp.empresas_emitentes(id);

ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS nota_fiscal_id     INTEGER;

ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS nfce_numero        INTEGER;

ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS nfce_chave_44      VARCHAR(44);

ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS nfce_emitida_em    TIMESTAMPTZ;

COMMENT ON COLUMN alissonerp.vendas_erp.empresa_emitente_id IS
  'CNPJ que emite a NFC-e desta venda (derivado do vendedor/loja)';
COMMENT ON COLUMN alissonerp.vendas_erp.nota_fiscal_id IS
  'FK logica para alissonerp.notas_fiscais.id (FK fisica adicionada em 149)';
COMMENT ON COLUMN alissonerp.vendas_erp.nfce_chave_44 IS
  'Chave de acesso de 44 digitos (snapshot — fonte de verdade fica em notas_fiscais)';

CREATE INDEX IF NOT EXISTS idx_vendas_erp_empresa_emitente
  ON alissonerp.vendas_erp(empresa_emitente_id)
  WHERE empresa_emitente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendas_erp_nfce_chave
  ON alissonerp.vendas_erp(nfce_chave_44)
  WHERE nfce_chave_44 IS NOT NULL;

-- ──────────────────────────────────────────────────────────
-- 2. transferencias_estoque_comercial — NF-e 55 remessa
-- ──────────────────────────────────────────────────────────
-- Condicional: so adiciona colunas se a tabela existir neste ambiente.
-- (A tabela eh criada pela migration 140_estoque_comercial_v2 que pode
-- nao ter sido aplicada em todos os ambientes.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='alissonerp' AND table_name='transferencias_estoque_comercial'
  ) THEN
    ALTER TABLE alissonerp.transferencias_estoque_comercial
      ADD COLUMN IF NOT EXISTS empresa_emitente_id   INTEGER
        REFERENCES alissonerp.empresas_emitentes(id);
    ALTER TABLE alissonerp.transferencias_estoque_comercial
      ADD COLUMN IF NOT EXISTS nota_fiscal_remessa_id INTEGER;
    ALTER TABLE alissonerp.transferencias_estoque_comercial
      ADD COLUMN IF NOT EXISTS nfe_numero             INTEGER;
    ALTER TABLE alissonerp.transferencias_estoque_comercial
      ADD COLUMN IF NOT EXISTS nfe_chave_44           VARCHAR(44);
    ALTER TABLE alissonerp.transferencias_estoque_comercial
      ADD COLUMN IF NOT EXISTS nfe_emitida_em         TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_transf_nfe_chave
      ON alissonerp.transferencias_estoque_comercial(nfe_chave_44)
      WHERE nfe_chave_44 IS NOT NULL;
  ELSE
    RAISE NOTICE 'Skipping transferencias_estoque_comercial (tabela nao existe neste ambiente)';
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────
-- 3. devolucoes_venda — NF-e 55 devolucao (entrada)
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.devolucoes_venda
  ADD COLUMN IF NOT EXISTS nota_fiscal_devolucao_id INTEGER;

ALTER TABLE alissonerp.devolucoes_venda
  ADD COLUMN IF NOT EXISTS nfe_numero               INTEGER;

ALTER TABLE alissonerp.devolucoes_venda
  ADD COLUMN IF NOT EXISTS nfe_chave_44             VARCHAR(44);

ALTER TABLE alissonerp.devolucoes_venda
  ADD COLUMN IF NOT EXISTS nfe_emitida_em           TIMESTAMPTZ;

COMMENT ON COLUMN alissonerp.devolucoes_venda.nota_fiscal_devolucao_id IS
  'FK logica para alissonerp.notas_fiscais.id (FK fisica adicionada em 149)';
COMMENT ON COLUMN alissonerp.devolucoes_venda.nfe_chave_44 IS
  'Chave da NF-e de entrada (devolucao) — CFOP tipicamente 1202/2202';

CREATE INDEX IF NOT EXISTS idx_devolucoes_nfe_chave
  ON alissonerp.devolucoes_venda(nfe_chave_44)
  WHERE nfe_chave_44 IS NOT NULL;
