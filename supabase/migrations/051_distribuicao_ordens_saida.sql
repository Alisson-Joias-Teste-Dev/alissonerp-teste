-- =============================================
-- MIGRATION 051: Saída da Distribuição por ordem
-- Adiciona campos de saída em distribuicao_ordens e cria
-- tabela de detalhe de pedras utilizadas na saída.
-- =============================================

ALTER TABLE alissonerp.distribuicao_ordens
  ADD COLUMN IF NOT EXISTS peso_bruto      NUMERIC(10,4),   -- peso da peça na balança (ouro + pedras)
  ADD COLUMN IF NOT EXISTS peso_pedras     NUMERIC(10,4) DEFAULT 0, -- soma peso das pedras usadas
  ADD COLUMN IF NOT EXISTS peso_ouro_real  NUMERIC(10,4),   -- peso_bruto - peso_pedras
  ADD COLUMN IF NOT EXISTS quebra          NUMERIC(10,4),   -- ouro_entregue - ouro_real
  ADD COLUMN IF NOT EXISTS ouro_entregue   NUMERIC(10,4),   -- (entrada+aditivo) - retorno do lote
  ADD COLUMN IF NOT EXISTS data_baixa      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS saida_por       UUID,
  ADD COLUMN IF NOT EXISTS foto_balanca    TEXT;

CREATE TABLE IF NOT EXISTS alissonerp.distribuicao_saida_pedras (
  id                    SERIAL PRIMARY KEY,
  distribuicao_ordem_id INTEGER NOT NULL REFERENCES alissonerp.distribuicao_ordens(id),
  insumo_id             INTEGER NOT NULL REFERENCES alissonerp.insumos(id),
  qtd_utilizada         INTEGER NOT NULL,
  peso_unitario         NUMERIC(10,4),
  peso_total            NUMERIC(10,4)
);

GRANT SELECT, INSERT ON alissonerp.distribuicao_saida_pedras TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.distribuicao_saida_pedras_id_seq TO authenticated;
