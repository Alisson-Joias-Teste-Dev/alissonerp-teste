
-- =============================================
-- MIGRATION 023: STORAGE FOTOS PROTOCOLO
-- =============================================

-- Criar bucket protocolo-fotos (privado)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'protocolo-fotos',
  'protocolo-fotos',
  false,
  10485760,  -- 10MB
  ARRAY['image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- RLS: autenticados podem fazer upload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname='protocolo_fotos_upload' AND tablename='objects' AND schemaname='storage'
  ) THEN
    CREATE POLICY "protocolo_fotos_upload" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'protocolo-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname='protocolo_fotos_select' AND tablename='objects' AND schemaname='storage'
  ) THEN
    CREATE POLICY "protocolo_fotos_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'protocolo-fotos');
  END IF;
END $$;

-- RLS para protocolo_fotos: autenticados podem inserir/ler
ALTER TABLE alissonerp.protocolo_fotos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname='protocolo_fotos_insert' AND tablename='protocolo_fotos' AND schemaname='alissonerp'
  ) THEN
    CREATE POLICY "protocolo_fotos_insert" ON alissonerp.protocolo_fotos
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname='protocolo_fotos_read' AND tablename='protocolo_fotos' AND schemaname='alissonerp'
  ) THEN
    CREATE POLICY "protocolo_fotos_read" ON alissonerp.protocolo_fotos
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- Coluna foto_url em protocolo_fotos para referência direta à URL pública
ALTER TABLE alissonerp.protocolo_fotos
  ADD COLUMN IF NOT EXISTS foto_url TEXT;

-- Coluna foto_base64 como fallback se Storage offline
ALTER TABLE alissonerp.protocolo_fotos
  ADD COLUMN IF NOT EXISTS foto_base64 TEXT;
