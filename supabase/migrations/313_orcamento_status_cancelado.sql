-- 313_orcamento_status_cancelado.sql
--
-- REGRA DE NEGÓCIO (Jonathan, 18/06/2026 — follow-up do B9):
--   O QUÊ: adiciona 'cancelado' aos status válidos de alissonerp.orcamentos.
--   POR QUÊ: quando a venda gerada por um orçamento é cancelada, o orçamento também
--            passa a 'cancelado' (POST /api/vendas/[id]/cancelar). Sem este valor no
--            CHECK chk_orcamentos_status, esse UPDATE falharia e quebraria o
--            cancelamento da venda inteiro (rollback da transação).
--   IMPACTO SE REMOVIDO: cancelar uma venda vinda de orçamento dá erro.
--
-- O QUE FAZ: só ALARGA o CHECK (adiciona um valor permitido). NÃO remove nenhum
-- valor e NÃO rejeita nenhuma linha existente (os status atuais — rascunho,
-- enviado, aprovado, rejeitado, convertido — continuam válidos). Trocar um CHECK
-- exige DROP + ADD (não existe "CREATE OR REPLACE CONSTRAINT") — é seguro aqui
-- porque a mudança só AMPLIA o conjunto permitido. Mantém NOT VALID como o original.
--
-- NÃO mexe em zona no-touch (CLAUDE.md §2). Roda com o token do dia a dia. O vigia
-- de DDL (mig 305) registra sozinho.
--
-- ROLLBACK:
--   ALTER TABLE alissonerp.orcamentos DROP CONSTRAINT IF EXISTS chk_orcamentos_status;
--   ALTER TABLE alissonerp.orcamentos ADD CONSTRAINT chk_orcamentos_status
--     CHECK (status::text = ANY (ARRAY['rascunho','enviado','aprovado','rejeitado','convertido']::text[])) NOT VALID;

BEGIN;

ALTER TABLE alissonerp.orcamentos DROP CONSTRAINT IF EXISTS chk_orcamentos_status;

ALTER TABLE alissonerp.orcamentos ADD CONSTRAINT chk_orcamentos_status
  CHECK (status::text = ANY (ARRAY[
    'rascunho','enviado','aprovado','rejeitado','convertido','cancelado'
  ]::text[])) NOT VALID;

COMMIT;
