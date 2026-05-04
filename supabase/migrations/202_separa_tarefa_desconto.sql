SET search_path TO alissonerp, public;

-- Separa tarefa de desconto da tarefa de crédito para evitar bloqueio cruzado.
-- Bug: aprovacao_credito_tarefa_id era compartilhado entre fluxos de desconto e crédito,
-- fazendo com que uma tarefa de crédito pendente bloqueasse a criação de solicitação de desconto.
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS aprovacao_desconto_tarefa_id INTEGER REFERENCES alissonerp.tarefas(id);
