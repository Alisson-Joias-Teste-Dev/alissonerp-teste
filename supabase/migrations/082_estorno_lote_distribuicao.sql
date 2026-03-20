-- Migration 082: Estorno de lote inteiro
-- ordem_id pode ser NULL quando o estorno reverte o lote inteiro (não uma ordem específica)
ALTER TABLE alissonerp.estornos_distribuicao
  ALTER COLUMN ordem_id DROP NOT NULL;
