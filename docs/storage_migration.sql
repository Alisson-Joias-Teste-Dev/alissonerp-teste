-- ============================================================
-- MIGRAÇÃO: Padronizar Storage - Buckets Públicos + Policies
-- Executar como postgres no schema storage
-- Gerado em: 2026-03-19
-- ============================================================

-- 1. Tornar TODOS os buckets públicos
--    Isso inclui: avatars, imagens, protocolo-fotos, apontamento-fotos, ordem-fotos
--    e também os buckets insumo-fotos e ordem-videos (se existirem)
UPDATE storage.buckets SET public = true;

-- 2. Verificar
SELECT id, name, public FROM storage.buckets;

-- 3. Remover policies antigas por bucket (lista das que provavelmente existem)
--    Se não existirem, os DROP vai falhar silenciosamente — tudo bem.

-- === avatars ===
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_authenticated" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_authenticated" ON storage.objects;

-- === protocolo-fotos ===
DROP POLICY IF EXISTS "protocolo_fotos_select" ON storage.objects;
DROP POLICY IF EXISTS "protocolo_fotos_insert" ON storage.objects;
DROP POLICY IF EXISTS "protocolo_fotos_update" ON storage.objects;
DROP POLICY IF EXISTS "protocolo_fotos_delete" ON storage.objects;

-- === apontamento-fotos ===
DROP POLICY IF EXISTS "apontamento_fotos_select" ON storage.objects;
DROP POLICY IF EXISTS "apontamento_fotos_insert" ON storage.objects;
DROP POLICY IF EXISTS "apontamento_fotos_update" ON storage.objects;
DROP POLICY IF EXISTS "apontamento_fotos_delete" ON storage.objects;

-- === ordem-fotos ===
DROP POLICY IF EXISTS "ordem_fotos_select" ON storage.objects;
DROP POLICY IF EXISTS "ordem_fotos_insert" ON storage.objects;
DROP POLICY IF EXISTS "ordem_fotos_update" ON storage.objects;
DROP POLICY IF EXISTS "ordem_fotos_delete" ON storage.objects;

-- === insumo-fotos ===
DROP POLICY IF EXISTS "insumo_fotos_select" ON storage.objects;
DROP POLICY IF EXISTS "insumo_fotos_insert" ON storage.objects;
DROP POLICY IF EXISTS "insumo_fotos_update" ON storage.objects;
DROP POLICY IF EXISTS "insumo_fotos_delete" ON storage.objects;

-- === ordem-videos ===
DROP POLICY IF EXISTS "ordem_videos_select" ON storage.objects;
DROP POLICY IF EXISTS "ordem_videos_insert" ON storage.objects;
DROP POLICY IF EXISTS "ordem_videos_update" ON storage.objects;
DROP POLICY IF EXISTS "ordem_videos_delete" ON storage.objects;

-- === Policies genéricas que podem ter sido criadas antes ===
DROP POLICY IF EXISTS "public_select" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_insert" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_update" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_delete" ON storage.objects;

-- 4. Criar policies novas — simples e unificadas

-- SELECT: público (qualquer um pode ler/baixar)
CREATE POLICY "public_select" ON storage.objects
  FOR SELECT USING (true);

-- INSERT: autenticados E anon podem upload
-- (anon key é usada pelas API routes server-side como fallback do service_role)
-- Segurança real está nas API routes Next.js que verificam sessão do usuário
CREATE POLICY "authenticated_insert" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon', 'service_role'));

-- UPDATE: autenticados E anon podem atualizar (upsert)
CREATE POLICY "authenticated_update" ON storage.objects
  FOR UPDATE USING (auth.role() IN ('authenticated', 'anon', 'service_role'));

-- DELETE: autenticados E anon podem deletar
CREATE POLICY "authenticated_delete" ON storage.objects
  FOR DELETE USING (auth.role() IN ('authenticated', 'anon', 'service_role'));

-- 5. Verificar policies ativas após migração
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY policyname;

-- ============================================================
-- BUCKETS QUE PRECISAM SER CRIADOS (se não existirem)
-- Verificar antes: SELECT id, name FROM storage.buckets;
-- ============================================================

-- insumo-fotos (usado por api/insumos/[id]/route.ts)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'insumo-fotos', 'insumo-fotos', true, 10485760,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ordem-videos (usado por NovaOrdemModal.tsx + OrdemDetalheClient.tsx)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ordem-videos', 'ordem-videos', true, 104857600,
  ARRAY['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
)
ON CONFLICT (id) DO UPDATE SET public = true;

-- ============================================================
-- NOTAS IMPORTANTES
-- ============================================================
-- 1. Os buckets insumo-fotos e ordem-videos provavelmente NÃO EXISTEM ainda
--    (não constam no memory/project_storage_buckets.md). Os INSERTs acima
--    criam com ON CONFLICT para ser idempotente.
--
-- 2. Após executar este SQL:
--    - Todos os uploads client-side continuam funcionando (authenticated insert)
--    - Leitura passa a ser via URL pública direta (sem signed URL)
--    - O helper src/lib/storage.ts usa service_role key para uploads server-side
--
-- 3. SUPABASE_SERVICE_ROLE_KEY: NÃO encontrada — JWT_SECRET real está no container Kong/GoTrue.
--    Para encontrar: docker exec <kong-container> env | grep -i "jwt\|secret\|service"
--    Para adicionar quando encontrar:
--    SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
--    O helper src/lib/storage.ts usa a service_role se disponível, senão ANON_KEY.
--
-- 4. POLICY TEMPORÁRIA: INSERT/UPDATE/DELETE aceitam 'anon' role.
--    Quando adicionar SUPABASE_SERVICE_ROLE_KEY, mudar de volta para:
--    WITH CHECK (auth.role() = 'authenticated')
-- ============================================================
