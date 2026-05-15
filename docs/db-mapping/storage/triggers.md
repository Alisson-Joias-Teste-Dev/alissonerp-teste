# `storage` — Triggers

> 7 triggers | gerado 2026-04-29

| Tabela | Trigger | Timing | Eventos | Função | Estado |
|--------|---------|--------|---------|--------|--------|
| `buckets` | `enforce_bucket_name_length_trigger` | BEFORE | INSERT,UPDATE | `storage.enforce_bucket_name_length` | ENABLED |
| `objects` | `objects_delete_delete_prefix` | AFTER | DELETE | `storage.delete_prefix_hierarchy_trigger` | ENABLED |
| `objects` | `objects_insert_create_prefix` | BEFORE | INSERT | `storage.objects_insert_prefix_trigger` | ENABLED |
| `objects` | `objects_update_create_prefix` | BEFORE | UPDATE | `storage.objects_update_prefix_trigger` | ENABLED |
| `objects` | `update_objects_updated_at` | BEFORE | UPDATE | `storage.update_updated_at_column` | ENABLED |
| `prefixes` | `prefixes_create_hierarchy` | BEFORE | INSERT | `storage.prefixes_insert_trigger` | ENABLED |
| `prefixes` | `prefixes_delete_hierarchy` | AFTER | DELETE | `storage.delete_prefix_hierarchy_trigger` | ENABLED |

## Definições completas

### `buckets.enforce_bucket_name_length_trigger`

```sql
CREATE TRIGGER enforce_bucket_name_length_trigger BEFORE INSERT OR UPDATE OF name ON storage.buckets FOR EACH ROW EXECUTE FUNCTION storage.enforce_bucket_name_length()
```

### `objects.objects_delete_delete_prefix`

```sql
CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger()
```

### `objects.objects_insert_create_prefix`

```sql
CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger()
```

### `objects.objects_update_create_prefix`

```sql
CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (new.name <> old.name OR new.bucket_id <> old.bucket_id) EXECUTE FUNCTION storage.objects_update_prefix_trigger()
```

### `objects.update_objects_updated_at`

```sql
CREATE TRIGGER update_objects_updated_at BEFORE UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.update_updated_at_column()
```

### `prefixes.prefixes_create_hierarchy`

```sql
CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN (pg_trigger_depth() < 1) EXECUTE FUNCTION storage.prefixes_insert_trigger()
```

### `prefixes.prefixes_delete_hierarchy`

```sql
CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger()
```

