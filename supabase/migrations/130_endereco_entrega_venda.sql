-- Migration 130: Endereço de entrega na venda (separado do endereço de cobrança do cliente)
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS endereco_entrega TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_numero TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_complemento TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_bairro TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_cidade TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_cep TEXT,
  ADD COLUMN IF NOT EXISTS endereco_entrega_uf VARCHAR(2);
