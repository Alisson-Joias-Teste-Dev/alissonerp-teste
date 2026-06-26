SET search_path TO alissonerp;

-- ============================================
-- COMENTÁRIOS NA ORDEM
-- ============================================
CREATE TABLE IF NOT EXISTS alissonerp.comentarios_ordem (
  id SERIAL PRIMARY KEY,
  ordem_id INTEGER NOT NULL REFERENCES alissonerp.ordens(id) ON DELETE CASCADE,
  autor_id UUID NOT NULL,
  texto TEXT NOT NULL,
  mencoes UUID[] DEFAULT '{}',
  editado BOOLEAN DEFAULT false,
  editado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comentarios_ordem_id ON alissonerp.comentarios_ordem(ordem_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_autor ON alissonerp.comentarios_ordem(autor_id);
CREATE INDEX IF NOT EXISTS idx_comentarios_created ON alissonerp.comentarios_ordem(created_at DESC);

-- ============================================
-- NOTIFICAÇÕES DO SISTEMA
-- A tabela notificacoes já existe com user_id.
-- Renomeamos user_id → usuario_id e adicionamos
-- as colunas que faltam.
-- ============================================

-- Renomear user_id → usuario_id (se ainda não foi renomeado)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'alissonerp'
      AND table_name = 'notificacoes'
      AND column_name = 'user_id'
  ) THEN
    ALTER TABLE alissonerp.notificacoes RENAME COLUMN user_id TO usuario_id;
  END IF;
END $$;

-- Adicionar NOT NULL default em usuario_id se necessário
ALTER TABLE alissonerp.notificacoes
  ALTER COLUMN usuario_id SET NOT NULL;

-- Ajustar tipo e default do campo tipo
ALTER TABLE alissonerp.notificacoes
  ALTER COLUMN tipo SET DEFAULT 'mencao',
  ALTER COLUMN tipo SET NOT NULL;

-- Ajustar titulo: mudar de text para varchar(200) e NOT NULL
ALTER TABLE alissonerp.notificacoes
  ALTER COLUMN titulo TYPE VARCHAR(200),
  ALTER COLUMN titulo SET NOT NULL;

-- Adicionar colunas faltantes
ALTER TABLE alissonerp.notificacoes
  ADD COLUMN IF NOT EXISTS link VARCHAR(200),
  ADD COLUMN IF NOT EXISTS ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS comentario_id INTEGER REFERENCES alissonerp.comentarios_ordem(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS remetente_id UUID,
  ADD COLUMN IF NOT EXISTS lida_em TIMESTAMPTZ;

-- Remover coluna dados (JSONB legada) — substituída por campos tipados
-- Só remove se existir e não houver dependências
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'alissonerp'
      AND table_name = 'notificacoes'
      AND column_name = 'dados'
  ) THEN
    ALTER TABLE alissonerp.notificacoes DROP COLUMN dados;
  END IF;
END $$;

-- Índices para notificacoes
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario ON alissonerp.notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_lida ON alissonerp.notificacoes(usuario_id, lida) WHERE lida = false;
CREATE INDEX IF NOT EXISTS idx_notificacoes_created ON alissonerp.notificacoes(created_at DESC);

-- ============================================
-- GRANTS
-- ============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.comentarios_ordem TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.notificacoes TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.comentarios_ordem_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.notificacoes_id_seq TO authenticated;

-- Grants para anon (Realtime precisa)
GRANT SELECT ON alissonerp.comentarios_ordem TO anon;
GRANT SELECT ON alissonerp.notificacoes TO anon;

-- ============================================
-- REALTIME (comentários + notificações em tempo real)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'alissonerp'
      AND tablename = 'comentarios_ordem'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alissonerp.comentarios_ordem;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'alissonerp'
      AND tablename = 'notificacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alissonerp.notificacoes;
  END IF;
END $$;
