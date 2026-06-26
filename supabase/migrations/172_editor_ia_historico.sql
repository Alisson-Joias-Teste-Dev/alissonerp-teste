-- ============================================================
-- Migration 172 — Editor IA: historico com deduplicacao
--
-- Toda geracao de imagem via Editor IA (/editor-ia) passa por
-- hash (input + parametros). Se hash ja existe, retorna a imagem
-- do bucket em vez de gastar uma nova chamada de API.
--
-- Bucket: editor-ia-geradas (publico)
-- ============================================================

SET search_path TO alissonerp, public;

CREATE TABLE IF NOT EXISTS alissonerp.editor_ia_historico (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_nome       TEXT,
  input_hash      TEXT NOT NULL,   -- sha256 das imagens de entrada (concatenadas)
  params_hash     TEXT NOT NULL,   -- sha256 de categoria|cenario|modelo|aspect|detalhes
  categoria       TEXT,
  cenario_id      TEXT,
  cenario_nome    TEXT,
  modelo          TEXT NOT NULL,
  aspect_ratio    TEXT,
  detalhes        TEXT,
  prompt_final    TEXT,
  imagem_url      TEXT NOT NULL,
  storage_path    TEXT NOT NULL,
  elapsed_ms      INTEGER,
  cache_hits      INTEGER NOT NULL DEFAULT 0,   -- quantas vezes foi servida do cache
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_editor_ia_historico_dedup
  ON alissonerp.editor_ia_historico(input_hash, params_hash);

CREATE INDEX IF NOT EXISTS idx_editor_ia_historico_user_created
  ON alissonerp.editor_ia_historico(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_editor_ia_historico_created
  ON alissonerp.editor_ia_historico(created_at DESC);

COMMENT ON TABLE  alissonerp.editor_ia_historico      IS 'Historico global do Editor IA com deduplicacao por hash (input + params).';
COMMENT ON COLUMN alissonerp.editor_ia_historico.cache_hits IS 'Incrementa cada vez que a mesma combinacao input+params eh solicitada novamente.';

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.editor_ia_historico TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.editor_ia_historico_id_seq TO authenticated;

-- ============================================================
-- Libera modulo "editor_ia" para TODAS as roles (vendedoras,
-- mkt, fabrica etc. conforme solicitacao).
-- ============================================================
INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever)
SELECT DISTINCT r, 'editor_ia', true, true
  FROM (VALUES
    ('desenvolvedor'), ('admin'), ('gerente_fabrica'), ('gerente_loja'),
    ('ourives'), ('motoboy'), ('consultora'),
    ('estoquista_fabrica'), ('estoquista_loja'), ('pcp')
  ) AS roles(r)
ON CONFLICT (role, modulo) DO UPDATE
  SET pode_ler = true, pode_escrever = true, atualizado_em = now();
