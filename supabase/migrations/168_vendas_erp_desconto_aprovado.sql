-- Registra quem aprovou o desconto e quando
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS desconto_aprovado_por UUID REFERENCES alissonerp.usuarios(id),
  ADD COLUMN IF NOT EXISTS desconto_aprovado_em  TIMESTAMPTZ;
