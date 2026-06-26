---
name: user_profiles Structure
description: Estrutura real da tabela public.user_profiles — crítica para avatar e auth
type: project
updated: 2026-03-17
---

## Tabela: public.user_profiles

Usada para armazenar dados de perfil exibíveis (avatar, nome) e permissões legadas.
**Fonte de verdade para role = alissonerp.usuarios.role** (NÃO user_profiles.role).

### Colunas (verificado 2026-03-17)

| Coluna | Tipo | Nullable | Default | Obs |
|--------|------|----------|---------|-----|
| id_user | uuid | NOT NULL | gen_random_uuid() | PK (UNIQUE constraint) |
| email | varchar(255) | NOT NULL | — | |
| password_hash | varchar(255) | NOT NULL | — | sempre '' ao fazer upsert via API |
| name | varchar(255) | NOT NULL | — | nome do usuário |
| role | varchar(50) | NOT NULL | 'user' | ver restrição abaixo |
| avatar_url | text | YES | null | URL com ?t={timestamp} anti-cache |
| phone | varchar(20) | YES | null | |
| created_at | timestamptz | YES | now() | |
| updated_at | timestamptz | YES | now() | |
| last_login | timestamptz | YES | null | |
| is_active | boolean | YES | true | |
| vendedor_id | bigint | YES | null | FK public.vendedores |
| mx_desconto_permitido | numeric | YES | null | |

### Constraints

| Nome | Tipo | Detalhes |
|------|------|---------|
| users_pkey | PRIMARY KEY | id_user |
| users_email_key | UNIQUE | email |
| user_profiles_id_user_key | UNIQUE | id_user (adicionado migration 072) |
| users_vendedor_id_fkey | FOREIGN KEY | vendedor_id → public.vendedores |
| user_profiles_role_check | CHECK | role IN ('admin','consultora','user','gerente','producao','logistica','financeiro') |

### ATENÇÃO: Inconsistência de roles

A constraint `user_profiles_role_check` aceita apenas:
`'admin', 'consultora', 'user', 'gerente', 'producao', 'logistica', 'financeiro'`

Isso **NÃO inclui** roles do ERP como: `desenvolvedor`, `ourives`, `gerente_fabrica`, `gerente_loja`, etc.

**Consequência prática:**
- Ao fazer upsert em user_profiles, usar `COALESCE(u.role::text, 'user')` pode violar a constraint se a role do usuário não estiver na lista
- A API `/api/user/avatar` usa `COALESCE(u.role::text, 'user')` — pode falhar para roles como 'desenvolvedor', 'ourives', etc.
- **Fonte de verdade real = alissonerp.usuarios.role** (VARCHAR sem restrição de check)

### Como a API /api/user/role funciona

```sql
SELECT u.role::text AS role, u.nome AS name, up.avatar_url
FROM alissonerp.usuarios u
LEFT JOIN public.user_profiles up ON up.id_user = u.id
WHERE u.id = $user_id::uuid
```

Role vem de `alissonerp.usuarios`, avatar_url vem de `public.user_profiles`.

### Mapeamento correto de roles para user_profiles (código real /api/user/avatar)

```sql
CASE u.role::text
  WHEN 'admin'              THEN 'admin'
  WHEN 'desenvolvedor'      THEN 'admin'
  WHEN 'gerente_fabrica'    THEN 'gerente'
  WHEN 'gerente_loja'       THEN 'gerente'
  WHEN 'consultora'         THEN 'consultora'
  WHEN 'financeiro'         THEN 'financeiro'
  WHEN 'logistica'          THEN 'logistica'
  WHEN 'motoboy'            THEN 'logistica'
  WHEN 'pcp'                THEN 'producao'
  WHEN 'ourives'            THEN 'producao'
  WHEN 'estoquista_fabrica' THEN 'producao'
  WHEN 'estoquista_loja'    THEN 'user'
  ELSE 'user'
END
```

### Como atualizar avatar (migration 072 garante que ON CONFLICT funciona)

```sql
INSERT INTO public.user_profiles (id_user, name, email, role, is_active, avatar_url, password_hash)
SELECT u.id, u.nome, u.email,
  CASE u.role::text
    WHEN 'admin' THEN 'admin' WHEN 'desenvolvedor' THEN 'admin'
    WHEN 'gerente_fabrica' THEN 'gerente' WHEN 'gerente_loja' THEN 'gerente'
    WHEN 'consultora' THEN 'consultora' WHEN 'financeiro' THEN 'financeiro'
    WHEN 'logistica' THEN 'logistica' WHEN 'motoboy' THEN 'logistica'
    WHEN 'pcp' THEN 'producao' WHEN 'ourives' THEN 'producao'
    WHEN 'estoquista_fabrica' THEN 'producao'
    ELSE 'user'
  END,
  COALESCE(u.ativo, true), $url, ''
FROM alissonerp.usuarios u WHERE u.id = $user_id::uuid
ON CONFLICT (id_user) DO UPDATE SET avatar_url = EXCLUDED.avatar_url, updated_at = now()
```

### Hook useAuth

O `useAuth()` busca role primariamente de `/api/user/permissoes` (campo `perm?.role`).
Fallback: `user_metadata.role` do JWT (pode estar desatualizado se role foi alterada).
O avatar vem de `/api/user/role` (que lê `user_profiles.avatar_url`).
O evento `perfil:foto-atualizada` (CustomEvent) atualiza o avatar sem reload.
