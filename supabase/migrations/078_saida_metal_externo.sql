-- Migration 078: adiciona coluna metal_externo em saidas_ordem
-- Metal externo (ouro do cliente) usado na peça — descontado do PMC mas NÃO da movimentação de estoque.

ALTER TABLE alissonerp.saidas_ordem
  ADD COLUMN IF NOT EXISTS metal_externo NUMERIC DEFAULT 0;

COMMENT ON COLUMN alissonerp.saidas_ordem.metal_externo IS
  'Peso do metal externo (ouro do cliente) na saída. Descontado do PMC mas não da movimentação de estoque.';
