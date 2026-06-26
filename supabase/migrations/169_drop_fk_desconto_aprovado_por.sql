-- Remove FK constraint que causava falha silenciosa na aprovação de desconto.
-- O UUID do aprovador continua armazenado mas sem constraint de integridade referencial.
ALTER TABLE alissonerp.vendas_erp
  DROP CONSTRAINT IF EXISTS vendas_erp_desconto_aprovado_por_fkey;
