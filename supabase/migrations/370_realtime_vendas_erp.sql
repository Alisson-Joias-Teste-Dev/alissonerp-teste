-- ============================================================
-- Migration 370 — Realtime para alissonerp.vendas_erp
--
-- REGRA DE NEGÓCIO:
--   O QUE: adiciona alissonerp.vendas_erp na publicacao supabase_realtime.
--   POR QUE: a tela de detalhe da venda (VendaDetalheClient.tsx) ja tinha uma
--     assinatura Realtime pronta (postgres_changes em UPDATE), esperando avisar
--     sozinha quando a aprovacao de desconto/cartao mudava o status da venda.
--     Sem a tabela na publicacao, o Postgres nunca emite o evento de replicacao
--     que o Realtime usa — o aviso nunca chegava e a tela so atualizava com F5.
--   IMPACTO SE REMOVIDO: aprovar desconto/cartao pela tela de Tarefas volta a nao
--     refletir sozinho na tela da venda ja aberta (precisa refresh manual).
--
-- Aplicado direto em producao em 08/08/2026 (autorizado por Jonathan), registrado
-- em alissonerp.log_mudancas_banco (id 409). Este arquivo documenta o mesmo
-- comando para as demais bases (homolog/local) e para o historico de migrations.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alissonerp' AND tablename = 'vendas_erp'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alissonerp.vendas_erp;
  END IF;
END $$;

-- ============================================================
-- Fim migration 370
-- ============================================================
