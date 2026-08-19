-- Migration 373: aprovação "Ação Marketing" (cortesia) — coluna própria
--
-- REGRA DE NEGÓCIO (19/08/2026): mesma arquitetura de aprovação por tarefa já
-- usada por desconto (aprovacao_desconto_tarefa_id, migration 202) e crédito/
-- "A Receber" (aprovacao_credito_tarefa_id, migration 138) — cada tipo com sua
-- própria coluna, de propósito, pra uma aprovação pendente não bloquear outra.
-- "Ação Marketing" é uma forma de pagamento nova (texto livre em
-- pagamentos_venda.forma, sem CHECK) que precisa ir pra aprovação do master
-- admin (Alisson) antes da venda aprovar — ver src/lib/vendas-aprovar.ts
-- (submeterVendaParaAprovacaoMarketing) e src/app/api/tarefas/[id]/aprovacao/route.ts.
-- IMPACTO SE REMOVIDO: perde-se o rastreio de qual tarefa está aprovando qual
-- venda por "Ação Marketing" — a tela da venda não sabe mostrar o banner
-- "aguardando aprovação".
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS aprovacao_marketing_tarefa_id INTEGER REFERENCES alissonerp.tarefas(id);
