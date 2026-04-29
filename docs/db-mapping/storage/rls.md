# `storage` — Row Level Security (RLS)

> 24 políticas em 11 de 11 tabelas

## Tabelas com RLS habilitada

| Tabela | RLS | Forced | # Policies |
|---|---|---|---|
| `buckets` | ✓ | — | 0 |
| `buckets_analytics` | ✓ | — | 0 |
| `buckets_vectors` | ✓ | — | 0 |
| `iceberg_namespaces` | ✓ | — | 0 |
| `iceberg_tables` | ✓ | — | 0 |
| `migrations` | ✓ | — | 0 |
| `objects` | ✓ | — | 24 |
| `prefixes` | ✓ | — | 0 |
| `s3_multipart_uploads` | ✓ | — | 0 |
| `s3_multipart_uploads_parts` | ✓ | — | 0 |
| `vector_indexes` | ✓ | — | 0 |

## Políticas

### `objects`

- **Enable read access for all users** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
- **Give anon users access to JPG images in folder vmbdr4_0** — SELECT (PERMISSIVE) roles=`public`
  - USING: `((bucket_id = 'imagens'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text))`
- **Give anon users access to JPG images in folder vmbdr4_1** — INSERT (PERMISSIVE) roles=`anon`
  - WITH CHECK: `((bucket_id = 'imagens'::text) AND (storage.extension(name) = 'png'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text))`
- **Give anon users access to JPG images in folder vmbdr4_2** — UPDATE (PERMISSIVE) roles=`public`
  - USING: `((bucket_id = 'imagens'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text))`
- **Give anon users access to JPG images in folder vmbdr4_3** — DELETE (PERMISSIVE) roles=`public`
  - USING: `((bucket_id = 'imagens'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text))`
- **auth_insert_apontamento** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `(bucket_id = 'apontamento-fotos'::text)`
- **auth_select_apontamento** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(bucket_id = 'apontamento-fotos'::text)`
- **authenticated_delete** — DELETE (PERMISSIVE) roles=`public`
  - USING: `(auth.role() = ANY (ARRAY['authenticated'::text, 'anon'::text, 'service_role'::text]))`
- **authenticated_insert** — INSERT (PERMISSIVE) roles=`public`
  - WITH CHECK: `(auth.role() = ANY (ARRAY['authenticated'::text, 'anon'::text, 'service_role'::text]))`
- **authenticated_update** — UPDATE (PERMISSIVE) roles=`public`
  - USING: `(auth.role() = ANY (ARRAY['authenticated'::text, 'anon'::text, 'service_role'::text]))`
- **avatars_auth_delete** — DELETE (PERMISSIVE) roles=`public`
  - USING: `((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text))`
- **avatars_auth_insert** — INSERT (PERMISSIVE) roles=`public`
  - WITH CHECK: `((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text))`
- **avatars_auth_update** — UPDATE (PERMISSIVE) roles=`public`
  - USING: `((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text))`
- **avatars_public_select** — SELECT (PERMISSIVE) roles=`public`
  - USING: `(bucket_id = 'avatars'::text)`
- **crm_anexos_auth** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `(bucket_id = 'crm-anexos'::text)`
  - WITH CHECK: `(bucket_id = 'crm-anexos'::text)`
- **crm_instagram_read** — SELECT (PERMISSIVE) roles=`public`
  - USING: `(bucket_id = 'crm-instagram'::text)`
- **crm_instagram_write** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((bucket_id = 'crm-instagram'::text) AND crm.user_eh_admin())`
  - WITH CHECK: `((bucket_id = 'crm-instagram'::text) AND crm.user_eh_admin())`
- **crm_mensagens_auth** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `(bucket_id = 'crm-mensagens'::text)`
  - WITH CHECK: `(bucket_id = 'crm-mensagens'::text)`
- **protocolo_fotos_upload** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `(bucket_id = 'protocolo-fotos'::text)`
- **public_select** — SELECT (PERMISSIVE) roles=`public`
  - USING: `true`
- **service_fotos_delete** — DELETE (PERMISSIVE) roles=`public`
  - USING: `((bucket_id = 'service-fotos'::text) AND (auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])))`
- **service_fotos_insert** — INSERT (PERMISSIVE) roles=`public`
  - WITH CHECK: `((bucket_id = 'service-fotos'::text) AND (auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])))`
- **service_fotos_select** — SELECT (PERMISSIVE) roles=`public`
  - USING: `(bucket_id = 'service-fotos'::text)`
- **service_fotos_update** — UPDATE (PERMISSIVE) roles=`public`
  - USING: `((bucket_id = 'service-fotos'::text) AND (auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])))`

