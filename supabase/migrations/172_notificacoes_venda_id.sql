-- Adiciona venda_id em notificacoes para permitir ações inline (ex: aprovar desconto)
ALTER TABLE alissonerp.notificacoes
  ADD COLUMN IF NOT EXISTS venda_id INTEGER REFERENCES alissonerp.vendas_erp(id) ON DELETE SET NULL;
