-- Migration 133 — Notificações de menção: aguardando resposta
--
-- Objetivo: permitir que menções (@fulano) em comentários de ordem disparem
-- alarme sonoro até que o destinatário RESPONDA (qualquer comentário na
-- mesma ordem fecha a pendência). Apenas visualizar NÃO silencia.
--
-- 1. aguardando_resposta: bool (default false). Marcado true no INSERT de
--    notificações tipo='mencao'. Marcado false quando o destinatário posta
--    um comentário na mesma ordem.
-- 2. respondida_em: timestamptz que registra quando foi respondida.
-- 3. Índice parcial para o polling (cheap SELECT por usuario_id).

ALTER TABLE alissonerp.notificacoes
  ADD COLUMN IF NOT EXISTS aguardando_resposta BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS respondida_em       TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_notif_aguardando_resposta
  ON alissonerp.notificacoes (usuario_id, created_at DESC)
  WHERE aguardando_resposta = true;
