-- ============================================================
-- Migration 308 — comentarios_devolucao (espelho de comentarios_ordem)
--
-- REGRA DE NEGOCIO:
-- O QUE: tabela PROPRIA de comentarios da devolucao, identica a
--   comentarios_ordem (texto, @mencoes, foto, edicao e soft-delete). Tabela
--   propria (decisao Jonathan) para NAO alterar o comportamento das ordens —
--   risco zero nos modulos vizinhos. Tambem liga a notificacao ao comentario.
-- POR QUE: pedido de ter comentarios + alarme na devolucao iguais aos das ordens.
-- IMPACTO SE REMOVIDO: devolucao sem o recurso de comentarios/alarme.
--
-- Database Safety §2: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ============================================================
SET search_path TO alissonerp;

CREATE TABLE IF NOT EXISTS alissonerp.comentarios_devolucao (
  id             SERIAL PRIMARY KEY,
  devolucao_id   INTEGER NOT NULL REFERENCES alissonerp.devolucoes_venda(id) ON DELETE CASCADE,
  autor_id       UUID NOT NULL,
  texto          TEXT NOT NULL,
  mencoes        UUID[] DEFAULT '{}',
  editado        BOOLEAN DEFAULT false,
  editado_em     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now(),
  excluido       BOOLEAN DEFAULT false,          -- soft-delete (igual ordens)
  excluido_em    TIMESTAMPTZ,
  excluido_por   UUID,
  texto_original TEXT,                           -- versao anterior em caso de edicao
  foto_path      TEXT                            -- anexo opcional (storage)
);

CREATE INDEX IF NOT EXISTS idx_coment_dev_devolucao ON alissonerp.comentarios_devolucao(devolucao_id);
CREATE INDEX IF NOT EXISTS idx_coment_dev_autor     ON alissonerp.comentarios_devolucao(autor_id);
CREATE INDEX IF NOT EXISTS idx_coment_dev_created   ON alissonerp.comentarios_devolucao(created_at DESC);

COMMENT ON TABLE alissonerp.comentarios_devolucao IS
  'Comentarios da devolucao (espelho de comentarios_ordem). Tabela propria para nao impactar as ordens.';

-- Notificacao de @mencao pode apontar para o comentario de devolucao (alarme identico ao das ordens)
ALTER TABLE alissonerp.notificacoes
  ADD COLUMN IF NOT EXISTS comentario_devolucao_id INTEGER
    REFERENCES alissonerp.comentarios_devolucao(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.comentarios_devolucao TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.comentarios_devolucao_id_seq TO authenticated;
GRANT SELECT ON alissonerp.comentarios_devolucao TO anon;

-- Realtime (best-effort: nao aborta a migration se faltar permissao no token)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'alissonerp'
      AND tablename = 'comentarios_devolucao'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE alissonerp.comentarios_devolucao;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'comentarios_devolucao nao adicionada ao realtime (permissao?): %', SQLERRM;
END $$;

-- ============================================================
-- Fim migration 308
-- ============================================================
