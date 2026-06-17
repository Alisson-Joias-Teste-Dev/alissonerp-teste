-- ============================================================
-- Migration 309 — novo status 'aguardando_aprovacao_estoque' na devolucao
--
-- REGRA DE NEGOCIO:
-- O QUE: amplia o CHECK de devolucoes_venda.status para incluir a etapa de
--   APROVACAO DO ESTOQUE, que acontece ANTES de gerar o vale-troca (a geracao
--   do vale ocorre na conclusao da devolucao — src/lib/devolucoes.ts).
-- POR QUE: pedido — toda devolucao deve passar pela aprovacao do pessoal do
--   estoque antes de virar credito (vale).
-- IMPACTO SE REMOVIDO: nao da para colocar a devolucao em espera de aprovacao
--   do estoque; o gate de estoque deixa de existir.
--
-- Database Safety §2: recria APENAS o CHECK (constraint, nao coluna),
--   preservando os 6 valores atuais + 1 novo. Nenhum dado existente fica
--   invalido (nao ha linha com status fora da lista antiga).
-- ============================================================
SET search_path TO alissonerp;

ALTER TABLE alissonerp.devolucoes_venda
  DROP CONSTRAINT IF EXISTS devolucoes_venda_status_check;

ALTER TABLE alissonerp.devolucoes_venda
  ADD CONSTRAINT devolucoes_venda_status_check
  CHECK (status IN (
    'rascunho',
    'aguardando_aprovacao',
    'aprovado',
    'aguardando_aprovacao_estoque',  -- NOVO: gate do estoque antes de gerar o vale
    'rejeitado',
    'concluido',
    'cancelado'
  ));

-- ============================================================
-- Fim migration 309
-- ============================================================
