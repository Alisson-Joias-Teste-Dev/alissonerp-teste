-- Migration 096: compras expandidas — NF, data, local destino, lote
-- Sprint 1 v2.14.0 | 28/03/2026

-- ──────────────────────────────────────────────────────────
-- 1. compras: novas colunas de rastreio
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.compras
  ADD COLUMN local_destino_id  INTEGER     REFERENCES alissonerp.locais_estoque(id),
  ADD COLUMN numero_nf         VARCHAR(50),
  ADD COLUMN data_compra       DATE,
  ADD COLUMN data_recebimento  DATE,
  ADD COLUMN recebido_por      UUID        REFERENCES auth.users(id);

-- ──────────────────────────────────────────────────────────
-- 2. itens_compra: novas colunas de detalhe
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.itens_compra
  ADD COLUMN unidade          VARCHAR(20),
  ADD COLUMN peso_ct          NUMERIC(10,4),
  ADD COLUMN qtd_pecas        INTEGER,
  ADD COLUMN custo_por_ct     NUMERIC(12,4),
  ADD COLUMN lote_referencia  VARCHAR(100),
  ADD COLUMN observacao       TEXT;

-- ──────────────────────────────────────────────────────────
-- 3. Indexes
-- ──────────────────────────────────────────────────────────
CREATE INDEX idx_compras_local_destino ON alissonerp.compras(local_destino_id);
CREATE INDEX idx_compras_data_compra   ON alissonerp.compras(data_compra);
CREATE INDEX idx_itens_compra_lote     ON alissonerp.itens_compra(lote_referencia);
