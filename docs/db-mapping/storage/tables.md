# `storage` — Tabelas

> 11 tabelas | gerado 2026-04-29

## Índice

- [`buckets`](#buckets)
- [`buckets_analytics`](#buckets_analytics)
- [`buckets_vectors`](#buckets_vectors)
- [`iceberg_namespaces`](#iceberg_namespaces)
- [`iceberg_tables`](#iceberg_tables)
- [`migrations`](#migrations)
- [`objects`](#objects)
- [`prefixes`](#prefixes)
- [`s3_multipart_uploads`](#s3_multipart_uploads)
- [`s3_multipart_uploads_parts`](#s3_multipart_uploads_parts)
- [`vector_indexes`](#vector_indexes)

---

## buckets

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | text | — | — | — |
| 2 | `name` | text | — | — | — |
| 3 | `owner` | uuid | ✓ | — | Field is deprecated, use owner_id instead |
| 4 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 5 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `public` | boolean | ✓ | `false` | — |
| 7 | `avif_autodetection` | boolean | ✓ | `false` | — |
| 8 | `file_size_limit` | bigint | ✓ | — | — |
| 9 | `allowed_mime_types` | _text | ✓ | — | — |
| 10 | `owner_id` | text | ✓ | — | — |
| 11 | `type` | buckettype | — | `'STANDARD'::storage.buckettype` | — |

### Chaves

- **PRIMARY KEY** `buckets_pkey` — (`id`)

### Referenciada por (entrada)

- `storage.objects.bucket_id` (constraint `objects_bucketId_fkey`)
- `storage.prefixes.bucket_id` (constraint `prefixes_bucketId_fkey`)
- `storage.s3_multipart_uploads.bucket_id` (constraint `s3_multipart_uploads_bucket_id_fkey`)
- `storage.s3_multipart_uploads_parts.bucket_id` (constraint `s3_multipart_uploads_parts_bucket_id_fkey`)

### Índices

- `bname` — `CREATE UNIQUE INDEX bname ON storage.buckets USING btree (name)`

### Triggers

- `enforce_bucket_name_length_trigger` — BEFORE INSERT/UPDATE → `storage.enforce_bucket_name_length` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

**Uso no código:**
- `storage.buckets` — 25 ocorrência(s)
  - `src/components/gestao-estoque/Dashboard.tsx:707`
  - `src/lib/storage.ts:78`
  - `scripts/apply_073.mjs:54`
  - `scripts/apply_073.mjs:55`
  - `scripts/diag_protocolo_spec.mjs:39`

---

## buckets_analytics

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `name` | text | — | — | — |
| 2 | `type` | buckettype | — | `'ANALYTICS'::storage.buckettype` | — |
| 3 | `format` | text | — | `'ICEBERG'::text` | — |
| 4 | `created_at` | timestamp with time zone | — | `now()` | — |
| 5 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 6 | `id` | uuid | — | `gen_random_uuid()` | — |
| 7 | `deleted_at` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `buckets_analytics_pkey` — (`id`)

### Referenciada por (entrada)

- `storage.iceberg_namespaces.catalog_id` (constraint `iceberg_namespaces_catalog_id_fkey`)
- `storage.iceberg_tables.catalog_id` (constraint `iceberg_tables_catalog_id_fkey`)

### Índices

- `buckets_analytics_unique_name_idx` — `CREATE UNIQUE INDEX buckets_analytics_unique_name_idx ON storage.buckets_analytics USING btree (name) WHERE (deleted_at IS NULL)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## buckets_vectors

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | text | — | — | — |
| 2 | `type` | buckettype | — | `'VECTOR'::storage.buckettype` | — |
| 3 | `created_at` | timestamp with time zone | — | `now()` | — |
| 4 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `buckets_vectors_pkey` — (`id`)

### Referenciada por (entrada)

- `storage.vector_indexes.bucket_id` (constraint `vector_indexes_bucket_id_fkey`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## iceberg_namespaces

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `bucket_name` | text | — | — | — |
| 3 | `name` | text | — | — | — |
| 4 | `created_at` | timestamp with time zone | — | `now()` | — |
| 5 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 6 | `metadata` | jsonb | — | `'{}'::jsonb` | — |
| 7 | `catalog_id` | uuid | — | — | — |

### Chaves

- **PRIMARY KEY** `iceberg_namespaces_pkey` — (`id`)

### Foreign Keys (saída)

- `catalog_id` → `storage.buckets_analytics.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `storage.iceberg_tables.namespace_id` (constraint `iceberg_tables_namespace_id_fkey`)

### Índices

- `idx_iceberg_namespaces_bucket_id` — `CREATE UNIQUE INDEX idx_iceberg_namespaces_bucket_id ON storage.iceberg_namespaces USING btree (catalog_id, name)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## iceberg_tables

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `namespace_id` | uuid | — | — | — |
| 3 | `bucket_name` | text | — | — | — |
| 4 | `name` | text | — | — | — |
| 5 | `location` | text | — | — | — |
| 6 | `created_at` | timestamp with time zone | — | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 8 | `remote_table_id` | text | ✓ | — | — |
| 9 | `shard_key` | text | ✓ | — | — |
| 10 | `shard_id` | text | ✓ | — | — |
| 11 | `catalog_id` | uuid | — | — | — |

### Chaves

- **PRIMARY KEY** `iceberg_tables_pkey` — (`id`)

### Foreign Keys (saída)

- `catalog_id` → `storage.buckets_analytics.id` (UPDATE NO ACTION, DELETE CASCADE)
- `namespace_id` → `storage.iceberg_namespaces.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_iceberg_tables_location` — `CREATE UNIQUE INDEX idx_iceberg_tables_location ON storage.iceberg_tables USING btree (location)`
- `idx_iceberg_tables_namespace_id` — `CREATE UNIQUE INDEX idx_iceberg_tables_namespace_id ON storage.iceberg_tables USING btree (catalog_id, namespace_id, name)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## migrations

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | — | — |
| 2 | `name` | character varying(100) | — | — | — |
| 3 | `hash` | character varying(40) | — | — | — |
| 4 | `executed_at` | timestamp without time zone | ✓ | `CURRENT_TIMESTAMP` | — |

### Chaves

- **UNIQUE** `migrations_name_key` — (`name`)
- **PRIMARY KEY** `migrations_pkey` — (`id`)

### Índices

- `migrations_name_key` — `CREATE UNIQUE INDEX migrations_name_key ON storage.migrations USING btree (name)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

**Uso no código:**
- `storage.migrations` — 43 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/site/SiteClient.tsx:123`
  - `src/lib/db.ts:8`
  - `src/lib/schema-check.ts:3`
  - `src/lib/schema-check.ts:83`
  - `scripts/apply_040.mjs:6`

---

## objects

**Aprox. linhas:** 5328

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `bucket_id` | text | ✓ | — | — |
| 3 | `name` | text | ✓ | — | — |
| 4 | `owner` | uuid | ✓ | — | Field is deprecated, use owner_id instead |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `last_accessed_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `metadata` | jsonb | ✓ | — | — |
| 9 | `path_tokens` | _text | ✓ | — | — |
| 10 | `version` | text | ✓ | — | — |
| 11 | `owner_id` | text | ✓ | — | — |
| 12 | `user_metadata` | jsonb | ✓ | — | — |
| 13 | `level` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `objects_pkey` — (`id`)

### Foreign Keys (saída)

- `bucket_id` → `storage.buckets.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `bucketid_objname` — `CREATE UNIQUE INDEX bucketid_objname ON storage.objects USING btree (bucket_id, name)`
- `idx_name_bucket_level_unique` — `CREATE UNIQUE INDEX idx_name_bucket_level_unique ON storage.objects USING btree (name COLLATE "C", bucket_id, level)`
- `idx_objects_bucket_id_name` — `CREATE INDEX idx_objects_bucket_id_name ON storage.objects USING btree (bucket_id, name COLLATE "C")`
- `idx_objects_lower_name` — `CREATE INDEX idx_objects_lower_name ON storage.objects USING btree ((path_tokens[level]), lower(name) text_pattern_ops, bucket_id, level)`
- `name_prefix_search` — `CREATE INDEX name_prefix_search ON storage.objects USING btree (name text_pattern_ops)`
- `objects_bucket_id_level_idx` — `CREATE UNIQUE INDEX objects_bucket_id_level_idx ON storage.objects USING btree (bucket_id, level, name COLLATE "C")`

### Triggers

- `objects_delete_delete_prefix` — AFTER DELETE → `storage.delete_prefix_hierarchy_trigger` 
- `objects_insert_create_prefix` — BEFORE INSERT → `storage.objects_insert_prefix_trigger` 
- `objects_update_create_prefix` — BEFORE UPDATE → `storage.objects_update_prefix_trigger` 
- `update_objects_updated_at` — BEFORE UPDATE → `storage.update_updated_at_column` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 24
  - `Enable read access for all users` (ALL, PERMISSIVE) roles=public
    USING: `true`
  - `Give anon users access to JPG images in folder vmbdr4_0` (SELECT, PERMISSIVE) roles=public
    USING: `((bucket_id = 'imagens'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text))`
  - `Give anon users access to JPG images in folder vmbdr4_1` (INSERT, PERMISSIVE) roles=anon
    WITH CHECK: `((bucket_id = 'imagens'::text) AND (storage.extension(name) = 'png'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text))`
  - `Give anon users access to JPG images in folder vmbdr4_2` (UPDATE, PERMISSIVE) roles=public
    USING: `((bucket_id = 'imagens'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text))`
  - `Give anon users access to JPG images in folder vmbdr4_3` (DELETE, PERMISSIVE) roles=public
    USING: `((bucket_id = 'imagens'::text) AND (storage.extension(name) = 'jpg'::text) AND (lower((storage.foldername(name))[1]) = 'public'::text) AND (auth.role() = 'anon'::text))`
  - `auth_insert_apontamento` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `(bucket_id = 'apontamento-fotos'::text)`
  - `auth_select_apontamento` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(bucket_id = 'apontamento-fotos'::text)`
  - `authenticated_delete` (DELETE, PERMISSIVE) roles=public
    USING: `(auth.role() = ANY (ARRAY['authenticated'::text, 'anon'::text, 'service_role'::text]))`
  - `authenticated_insert` (INSERT, PERMISSIVE) roles=public
    WITH CHECK: `(auth.role() = ANY (ARRAY['authenticated'::text, 'anon'::text, 'service_role'::text]))`
  - `authenticated_update` (UPDATE, PERMISSIVE) roles=public
    USING: `(auth.role() = ANY (ARRAY['authenticated'::text, 'anon'::text, 'service_role'::text]))`
  - `avatars_auth_delete` (DELETE, PERMISSIVE) roles=public
    USING: `((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text))`
  - `avatars_auth_insert` (INSERT, PERMISSIVE) roles=public
    WITH CHECK: `((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text))`
  - `avatars_auth_update` (UPDATE, PERMISSIVE) roles=public
    USING: `((bucket_id = 'avatars'::text) AND (auth.role() = 'authenticated'::text))`
  - `avatars_public_select` (SELECT, PERMISSIVE) roles=public
    USING: `(bucket_id = 'avatars'::text)`
  - `crm_anexos_auth` (ALL, PERMISSIVE) roles=authenticated
    USING: `(bucket_id = 'crm-anexos'::text)`
    WITH CHECK: `(bucket_id = 'crm-anexos'::text)`
  - `crm_instagram_read` (SELECT, PERMISSIVE) roles=public
    USING: `(bucket_id = 'crm-instagram'::text)`
  - `crm_instagram_write` (ALL, PERMISSIVE) roles=authenticated
    USING: `((bucket_id = 'crm-instagram'::text) AND crm.user_eh_admin())`
    WITH CHECK: `((bucket_id = 'crm-instagram'::text) AND crm.user_eh_admin())`
  - `crm_mensagens_auth` (ALL, PERMISSIVE) roles=authenticated
    USING: `(bucket_id = 'crm-mensagens'::text)`
    WITH CHECK: `(bucket_id = 'crm-mensagens'::text)`
  - `protocolo_fotos_upload` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `(bucket_id = 'protocolo-fotos'::text)`
  - `public_select` (SELECT, PERMISSIVE) roles=public
    USING: `true`
  - `service_fotos_delete` (DELETE, PERMISSIVE) roles=public
    USING: `((bucket_id = 'service-fotos'::text) AND (auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])))`
  - `service_fotos_insert` (INSERT, PERMISSIVE) roles=public
    WITH CHECK: `((bucket_id = 'service-fotos'::text) AND (auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])))`
  - `service_fotos_select` (SELECT, PERMISSIVE) roles=public
    USING: `(bucket_id = 'service-fotos'::text)`
  - `service_fotos_update` (UPDATE, PERMISSIVE) roles=public
    USING: `((bucket_id = 'service-fotos'::text) AND (auth.role() = ANY (ARRAY['anon'::text, 'authenticated'::text, 'service_role'::text])))`

**Uso no código:**
- `storage.objects` — 11 ocorrência(s)
  - `scripts/diag_protocolo_fotos.mjs:30`
  - `scripts/_build_code_references.mjs:4`
  - `scripts/_build_code_references.mjs:330`
  - `scripts/_db_mapping_build_docs.mjs:102`
  - `scripts/_db_mapping_build_docs.mjs:105`

---

## prefixes

**Aprox. linhas:** 1211

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `bucket_id` | text | — | — | — |
| 2 | `name` | text | — | — | — |
| 3 | `level` | integer | — | — | — |
| 4 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 5 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `prefixes_pkey` — (`bucket_id`, `level`, `name`)

### Foreign Keys (saída)

- `bucket_id` → `storage.buckets.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_prefixes_lower_name` — `CREATE INDEX idx_prefixes_lower_name ON storage.prefixes USING btree (bucket_id, level, ((string_to_array(name, '/'::text))[level]), lower(name) text_pattern_ops)`

### Triggers

- `prefixes_create_hierarchy` — BEFORE INSERT → `storage.prefixes_insert_trigger` 
- `prefixes_delete_hierarchy` — AFTER DELETE → `storage.delete_prefix_hierarchy_trigger` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## s3_multipart_uploads

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | text | — | — | — |
| 2 | `in_progress_size` | bigint | — | `0` | — |
| 3 | `upload_signature` | text | — | — | — |
| 4 | `bucket_id` | text | — | — | — |
| 5 | `key` | text | — | — | — |
| 6 | `version` | text | — | — | — |
| 7 | `owner_id` | text | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | — | `now()` | — |
| 9 | `user_metadata` | jsonb | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `s3_multipart_uploads_pkey` — (`id`)

### Foreign Keys (saída)

- `bucket_id` → `storage.buckets.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `storage.s3_multipart_uploads_parts.upload_id` (constraint `s3_multipart_uploads_parts_upload_id_fkey`)

### Índices

- `idx_multipart_uploads_list` — `CREATE INDEX idx_multipart_uploads_list ON storage.s3_multipart_uploads USING btree (bucket_id, key, created_at)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## s3_multipart_uploads_parts

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `upload_id` | text | — | — | — |
| 3 | `size` | bigint | — | `0` | — |
| 4 | `part_number` | integer | — | — | — |
| 5 | `bucket_id` | text | — | — | — |
| 6 | `key` | text | — | — | — |
| 7 | `etag` | text | — | — | — |
| 8 | `owner_id` | text | ✓ | — | — |
| 9 | `version` | text | — | — | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `s3_multipart_uploads_parts_pkey` — (`id`)

### Foreign Keys (saída)

- `bucket_id` → `storage.buckets.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `upload_id` → `storage.s3_multipart_uploads.id` (UPDATE NO ACTION, DELETE CASCADE)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## vector_indexes

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | text | — | `gen_random_uuid()` | — |
| 2 | `name` | text | — | — | — |
| 3 | `bucket_id` | text | — | — | — |
| 4 | `data_type` | text | — | — | — |
| 5 | `dimension` | integer | — | — | — |
| 6 | `distance_metric` | text | — | — | — |
| 7 | `metadata_configuration` | jsonb | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | — | `now()` | — |
| 9 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `vector_indexes_pkey` — (`id`)

### Foreign Keys (saída)

- `bucket_id` → `storage.buckets_vectors.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `vector_indexes_name_bucket_id_idx` — `CREATE UNIQUE INDEX vector_indexes_name_bucket_id_idx ON storage.vector_indexes USING btree (name, bucket_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

