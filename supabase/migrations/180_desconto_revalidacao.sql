SET search_path TO alissonerp, public;

-- Sinaliza que um item com desconto alto foi adicionado após aprovação anterior
-- Bloqueia auto-aprovação até que desconto seja revalidado por admin/gerente
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS desconto_revalidacao_necessaria BOOLEAN DEFAULT false;
