# `alissonerp` — Row Level Security (RLS)

> 38 políticas em 16 de 139 tabelas

## Tabelas com RLS habilitada

| Tabela | RLS | Forced | # Policies |
|---|---|---|---|
| `apontamentos_distribuicao` | ✓ | — | 1 |
| `apontamentos_pcp` | ✓ | — | 2 |
| `aprovacoes_consultora` | ✓ | — | 2 |
| `auditorias` | ✓ | — | 2 |
| `comentarios_ordem` | ✓ | — | 4 |
| `distribuicoes` | ✓ | — | 2 |
| `movimentacoes_estoque` | ✓ | — | 2 |
| `notificacoes` | ✓ | — | 4 |
| `ordem_comentarios` | ✓ | — | 3 |
| `ordens` | ✓ | — | 2 |
| `pcp` | ✓ | — | 3 |
| `preparacoes_entrega` | ✓ | — | 1 |
| `protocolo_fotos` | ✓ | — | 2 |
| `protocolos` | ✓ | — | 4 |
| `transferencias_ordem` | ✓ | — | 1 |
| `usuarios` | ✓ | — | 3 |

## Políticas

### `apontamentos_distribuicao`

- **admin_full_apt_dist** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`

### `apontamentos_pcp`

- **admin_full_apt_pcp** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
- **ourives_apontamentos** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'ourives'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'ourives'::text)`

### `aprovacoes_consultora`

- **admin_full_aprovacoes** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
- **consultora_aprovacoes** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'consultora'::text)`

### `auditorias`

- **admin_full_auditorias** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'gerente_fabrica'::text, 'gerente_loja'::text]))`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'gerente_fabrica'::text, 'gerente_loja'::text]))`
- **read_auditorias** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = ANY (ARRAY['pcp'::text, 'ourives'::text, 'consultora'::text]))`

### `comentarios_ordem`

- **comentarios_delete** — DELETE (PERMISSIVE) roles=`authenticated`
  - USING: `((autor_id = auth.uid()) OR ((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'desenvolvedor'::text])))`
- **comentarios_insert** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `(autor_id = auth.uid())`
- **comentarios_select** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`
- **comentarios_update** — UPDATE (PERMISSIVE) roles=`authenticated`
  - USING: `(autor_id = auth.uid())`

### `distribuicoes`

- **admin_full_distribuicoes** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
- **gerente_fab_distribuicoes** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`

### `movimentacoes_estoque`

- **admin_full_mov_estoque** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
- **gerente_fab_estoque** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`

### `notificacoes`

- **notificacoes_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'desenvolvedor'::text]))`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'desenvolvedor'::text]))`
- **notificacoes_insert** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `true`
- **notificacoes_select** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(usuario_id = auth.uid())`
- **notificacoes_update** — UPDATE (PERMISSIVE) roles=`authenticated`
  - USING: `(usuario_id = auth.uid())`

### `ordem_comentarios`

- **admin_full_comentarios** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
- **all_read_comentarios** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`
- **author_write_comentarios** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `(user_id = auth.uid())`

### `ordens`

- **admin_full_ordens** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
- **gerente_fab_ordens** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`

### `pcp`

- **admin_full_pcp** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
- **gerente_fab_pcp** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`
- **ourives_select_pcp** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'ourives'::text)`

### `preparacoes_entrega`

- **admin_full_preparacoes** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`

### `protocolo_fotos`

- **protocolo_fotos_insert** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `true`
- **protocolo_fotos_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`

### `protocolos`

- **admin_full_protocolos** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
- **gerente_fab_protocolos** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`
- **motoboy_select_protocolos** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'motoboy'::text)`
- **motoboy_update_protocolos** — UPDATE (PERMISSIVE) roles=`authenticated`
  - USING: `(((alissonerp.fn_user_role())::text = 'motoboy'::text) AND (motoboy_id = auth.uid()))`

### `transferencias_ordem`

- **admin_full_transf** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`

### `usuarios`

- **admin_full_usuarios** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
- **user_own_profile** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(id = auth.uid())`
- **usuarios_select_own** — SELECT (PERMISSIVE) roles=`public`
  - USING: `((id = auth.uid()) OR ((alissonerp.fn_user_role())::text = 'admin'::text))`

