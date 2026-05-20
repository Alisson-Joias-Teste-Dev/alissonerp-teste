"""
Migration 023: Storage bucket para fotos de protocolo + RLS
"""
import sys, os
sys.stdout.reconfigure(encoding='utf-8')

import psycopg2
from psycopg2.extras import RealDictCursor

DB = os.environ.get("DATABASE_URL",
    "postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres")

conn = psycopg2.connect(DB, connect_timeout=15)
conn.autocommit = True
cur = conn.cursor(cursor_factory=RealDictCursor)

MIGRATION_SQL = """
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
"""

def ok(msg): print(f"  \033[32mOK\033[0m  {msg}")
def fail(msg): print(f"  \033[31mFAIL\033[0m {msg}")
def section(msg): print(f"\n\033[1m{'═'*6} {msg} {'═'*6}\033[0m")

section("APLICANDO MIGRATION 023")
try:
    cur.execute(MIGRATION_SQL)
    ok("Migration 023 executada")
except Exception as e:
    fail(f"Migration falhou: {e}")
    sys.exit(1)

import pathlib
mig_path = pathlib.Path(__file__).parent.parent / "supabase" / "migrations" / "023_storage_protocolo.sql"
mig_path.write_text(MIGRATION_SQL, encoding="utf-8")
ok(f"Arquivo salvo em {mig_path}")

section("VERIFICANDO")
cur.execute("SELECT id, name, public, file_size_limit FROM storage.buckets WHERE id = 'protocolo-fotos'")
b = cur.fetchone()
if b:
    ok(f"Bucket criado: id={b['id']}, public={b['public']}, max={b['file_size_limit']//1024//1024}MB")
else:
    fail("Bucket não encontrado")

cur.execute("SELECT policyname FROM pg_policies WHERE tablename='objects' AND schemaname='storage' AND policyname LIKE 'protocolo_fotos%'")
pols = [r['policyname'] for r in cur.fetchall()]
ok(f"Policies storage: {pols}")

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='protocolo_fotos' ORDER BY ordinal_position")
cols = [r['column_name'] for r in cur.fetchall()]
ok(f"protocolo_fotos colunas: {cols}")

print("\n  \033[32mMigration 023 OK — Storage configurado.\033[0m")
print("  Estratégia: Upload para bucket 'protocolo-fotos' via Supabase Storage JS")
print("  Fallback:   foto_base64 na tabela protocolo_fotos (se Storage indisponível)")
conn.close()
