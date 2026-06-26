-- Migration 112: Módulo de Tarefas (substitui Asana)
-- Tabelas para gerenciamento de tarefas internas vinculáveis a ordens.

SET search_path TO alissonerp;

-- ─── Tabela principal de tarefas ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.tarefas (
  id              SERIAL PRIMARY KEY,
  titulo          TEXT NOT NULL,
  descricao       TEXT,
  responsavel_id  UUID REFERENCES auth.users(id),
  criado_por      UUID REFERENCES auth.users(id),
  prioridade      VARCHAR(10) NOT NULL DEFAULT 'media'
                  CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  data_limite     DATE,
  ordem_id        INTEGER REFERENCES alissonerp.ordens(id),
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  concluida_em    TIMESTAMPTZ
);

-- ─── Comentários de tarefa ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.comentarios_tarefa (
  id          SERIAL PRIMARY KEY,
  tarefa_id   INTEGER NOT NULL REFERENCES alissonerp.tarefas(id) ON DELETE CASCADE,
  autor_id    UUID REFERENCES auth.users(id),
  texto       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── Trigger updated_at ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_updated_at_tarefas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'concluida' AND OLD.status != 'concluida' THEN
    NEW.concluida_em = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_updated_at_tarefas ON alissonerp.tarefas;
CREATE TRIGGER trg_updated_at_tarefas
  BEFORE UPDATE ON alissonerp.tarefas
  FOR EACH ROW
  EXECUTE FUNCTION fn_updated_at_tarefas();

-- ─── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tarefas_responsavel ON alissonerp.tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_status ON alissonerp.tarefas(status);
CREATE INDEX IF NOT EXISTS idx_tarefas_ordem ON alissonerp.tarefas(ordem_id);
CREATE INDEX IF NOT EXISTS idx_tarefas_data_limite ON alissonerp.tarefas(data_limite);
CREATE INDEX IF NOT EXISTS idx_comentarios_tarefa ON alissonerp.comentarios_tarefa(tarefa_id);

-- ─── Grants ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.tarefas TO authenticated;
GRANT SELECT, INSERT, DELETE ON alissonerp.comentarios_tarefa TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.tarefas_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.comentarios_tarefa_id_seq TO authenticated;
