-- Migration 191: Crediário Aging — Automação diária de notificações
-- v2.36.2 — Registra automação de aging do crediário na tabela automacoes_tarefa

-- Tipo de notificação para o bell do sistema
ALTER TABLE alissonerp.notificacoes
  ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES auth.users(id);

-- Índice para lookup rápido por usuário (a rota de notificações já usa usuario_id)
CREATE INDEX IF NOT EXISTS idx_notif_usuario_id
  ON alissonerp.notificacoes(usuario_id)
  WHERE usuario_id IS NOT NULL;

-- Seed: automação de aging do crediário (diária)
-- O campo titulo e tags permitem identificá-la na UI de automações
INSERT INTO alissonerp.automacoes_tarefa
  (titulo, descricao, recorrencia, prioridade, tags, ativa)
VALUES (
  'Crediário — Aging diário',
  'Verifica contas a receber vencidas e a vencer, enviando notificações para gerentes e consultoras. Endpoint: POST /api/crediario/aging-cron (x-cron-secret)',
  'diaria',
  'alta',
  ARRAY['crediario', 'aging', 'notificacao', 'automatico'],
  true
)
ON CONFLICT DO NOTHING;
