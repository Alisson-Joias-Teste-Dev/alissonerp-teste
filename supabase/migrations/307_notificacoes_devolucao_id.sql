-- ============================================================
-- Migration 307 — notificacoes.devolucao_id (alarme de comentario na devolucao)
--
-- REGRA DE NEGOCIO:
-- O QUE: adiciona a referencia da notificacao a uma devolucao, para o alarme
--   de @mencao nos comentarios da devolucao funcionar IGUAL ao das ordens
--   (que ja usa ordem_id).
-- POR QUE: a tabela notificacoes so tinha ordem_id e venda_id; comentarios de
--   devolucao precisam de um alvo proprio para gerar link/alarme.
-- IMPACTO SE REMOVIDO: @mencao em comentario de devolucao nao gera notificacao
--   clicavel para a devolucao.
--
-- Database Safety §2: ADD COLUMN IF NOT EXISTS — sem DROP.
-- ============================================================
SET search_path TO alissonerp;

ALTER TABLE alissonerp.notificacoes
  ADD COLUMN IF NOT EXISTS devolucao_id INTEGER
    REFERENCES alissonerp.devolucoes_venda(id) ON DELETE SET NULL;

COMMENT ON COLUMN alissonerp.notificacoes.devolucao_id IS
  'Devolucao referenciada pela notificacao (ex.: @mencao em comentario de devolucao).';

-- ============================================================
-- Fim migration 307
-- ============================================================
