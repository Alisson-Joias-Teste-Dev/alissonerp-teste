-- Migration 119: Tarefas Avançadas — aprovações, automações, posição kanban

-- Coluna posicao para ordenação dentro da coluna kanban
ALTER TABLE alissonerp.tarefas ADD COLUMN IF NOT EXISTS posicao INTEGER DEFAULT 0;

-- ─── Aprovações de Tarefas ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.aprovacoes_tarefa (
  id             SERIAL PRIMARY KEY,
  tarefa_id      INTEGER NOT NULL REFERENCES alissonerp.tarefas(id) ON DELETE CASCADE,
  solicitante_id UUID REFERENCES auth.users(id),
  aprovador_id   UUID REFERENCES auth.users(id),
  status         VARCHAR(20) DEFAULT 'pendente',  -- pendente | aprovado | rejeitado
  motivo         TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  respondido_em  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_tarefa_id  ON alissonerp.aprovacoes_tarefa(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_aprovador  ON alissonerp.aprovacoes_tarefa(aprovador_id);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_status     ON alissonerp.aprovacoes_tarefa(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.aprovacoes_tarefa TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.aprovacoes_tarefa_id_seq TO authenticated;

-- ─── Automações de Tarefas ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.automacoes_tarefa (
  id              SERIAL PRIMARY KEY,
  titulo          TEXT NOT NULL,
  descricao       TEXT,
  responsavel_id  UUID REFERENCES auth.users(id),
  prioridade      VARCHAR(10) DEFAULT 'media',
  recorrencia     VARCHAR(20) NOT NULL DEFAULT 'diaria',  -- diaria | semanal | mensal
  dia_semana      INTEGER,   -- 0=Dom .. 6=Sáb (para semanal)
  dia_mes         INTEGER,   -- 1-31 (para mensal)
  tags            TEXT[] DEFAULT '{}',
  ativa           BOOLEAN DEFAULT true,
  criado_por      UUID REFERENCES auth.users(id),
  ultima_execucao DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_automacoes_ativa ON alissonerp.automacoes_tarefa(ativa);

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.automacoes_tarefa TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.automacoes_tarefa_id_seq TO authenticated;

-- ─── Histórico de Execuções ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.automacoes_execucoes (
  id            SERIAL PRIMARY KEY,
  automacao_id  INTEGER NOT NULL REFERENCES alissonerp.automacoes_tarefa(id) ON DELETE CASCADE,
  tarefa_id     INTEGER REFERENCES alissonerp.tarefas(id),
  executado_em  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exec_automacao ON alissonerp.automacoes_execucoes(automacao_id);

GRANT SELECT, INSERT ON alissonerp.automacoes_execucoes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.automacoes_execucoes_id_seq TO authenticated;
