-- =============================================
-- MIGRATION 043: FOTO BALANÇA NO APONTAMENTO PCP
-- Adiciona coluna foto_balanca em apontamentos_pcp
-- Cria bucket apontamento-fotos para comprovantes
-- =============================================

-- Coluna que guarda o path no Storage
ALTER TABLE alissonerp.apontamentos_pcp
  ADD COLUMN IF NOT EXISTS foto_balanca TEXT;

-- Bucket privado para fotos de balança
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'apontamento-fotos',
  'apontamento-fotos',
  false,
  10485760,  -- 10MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policies: autenticados podem fazer upload e leitura
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'apontamento_fotos_upload'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "apontamento_fotos_upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'apontamento-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'apontamento_fotos_select'
      AND tablename = 'objects'
      AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "apontamento_fotos_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'apontamento-fotos');
  END IF;
END $$;
