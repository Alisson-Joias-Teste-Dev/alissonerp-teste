-- Migration 071: Adicionar foto e soft-delete em comentarios_ordem
-- + coluna fotos_paths em alissonerp.ordens para galeria de fotos

SET search_path TO alissonerp;

-- ══════════════════════════════════════════════
-- 1. Colunas faltantes em comentarios_ordem
--    (usadas no código mas não estavam na migration 069)
-- ══════════════════════════════════════════════

ALTER TABLE alissonerp.comentarios_ordem
  ADD COLUMN IF NOT EXISTS texto_original TEXT,
  ADD COLUMN IF NOT EXISTS excluido BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS excluido_por UUID,
  ADD COLUMN IF NOT EXISTS foto_path TEXT;

-- Índice para soft-delete (query usa WHERE excluido = false)
CREATE INDEX IF NOT EXISTS idx_comentarios_nao_excluidos
  ON alissonerp.comentarios_ordem(ordem_id, excluido)
  WHERE excluido = false;

-- ══════════════════════════════════════════════
-- 2. Coluna fotos_paths em alissonerp.ordens
--    Array de paths no bucket 'ordem-fotos'
-- ══════════════════════════════════════════════

ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS fotos_paths TEXT[] DEFAULT '{}';

-- ══════════════════════════════════════════════
-- 3. Bucket 'ordem-fotos' — criar via SQL se não existir
-- ══════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ordem-fotos',
  'ordem-fotos',
  false,
  10485760,  -- 10MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- ══════════════════════════════════════════════
-- 4. RLS para o bucket 'ordem-fotos'
-- ══════════════════════════════════════════════

-- Upload: qualquer autenticado pode fazer upload
CREATE POLICY IF NOT EXISTS "ordem_fotos_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ordem-fotos');

-- Leitura: qualquer autenticado pode ler
CREATE POLICY IF NOT EXISTS "ordem_fotos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ordem-fotos');

-- Delete: qualquer autenticado pode deletar (controle na API)
CREATE POLICY IF NOT EXISTS "ordem_fotos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ordem-fotos');

-- ══════════════════════════════════════════════
-- 5. Grants
-- ══════════════════════════════════════════════

GRANT SELECT, UPDATE ON alissonerp.ordens TO authenticated;
