# `auth` — Triggers

> 2 triggers | gerado 2026-04-29

| Tabela | Trigger | Timing | Eventos | Função | Estado |
|--------|---------|--------|---------|--------|--------|
| `users` | `on_auth_user_created` | AFTER | INSERT | `public.handle_new_user` | ENABLED |
| `users` | `trg_on_auth_user_created` | AFTER | INSERT | `alissonerp.fn_handle_new_user` | ENABLED |

## Definições completas

### `users.on_auth_user_created`

```sql
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user()
```

### `users.trg_on_auth_user_created`

```sql
CREATE TRIGGER trg_on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_handle_new_user()
```

