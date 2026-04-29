# `crm` — Row Level Security (RLS)

> 41 políticas em 24 de 31 tabelas

## Tabelas com RLS habilitada

| Tabela | RLS | Forced | # Policies |
|---|---|---|---|
| `agente_runs` | ✓ | — | 1 |
| `agentes_ia` | ✓ | — | 2 |
| `audit_log` | ✓ | — | 1 |
| `automacao_execucoes` | ✓ | — | 1 |
| `automacao_gatilhos` | ✓ | — | 1 |
| `automacoes` | ✓ | — | 1 |
| `brechas` | ✓ | — | 2 |
| `ciclo_vida_eventos` | ✓ | — | 1 |
| `config_geral` | ✓ | — | 2 |
| `conversas` | ✓ | — | 4 |
| `funil_blocos` | ✓ | — | 2 |
| `funil_etapas` | ✓ | — | 2 |
| `funil_movimentos` | ✓ | — | 2 |
| `instagram_posts` | ✓ | — | 2 |
| `kommo_config` | ✓ | — | 1 |
| `mensagens` | ✓ | — | 4 |
| `meta_config` | ✓ | — | 1 |
| `notificacoes` | ✓ | — | 3 |
| `prompt_templates` | ✓ | — | 2 |
| `sdr_runs` | ✓ | — | 1 |
| `tarefas` | ✓ | — | 2 |
| `unipile_config` | ✓ | — | 1 |
| `webhook_config` | ✓ | — | 1 |
| `webhook_log` | ✓ | — | 1 |

## Políticas

### `agente_runs`

- **p_agente_runs_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = agente_runs.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`

### `agentes_ia`

- **p_agentes_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`
- **p_agentes_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`

### `audit_log`

- **p_audit** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`

### `automacao_execucoes`

- **p_aut_exec_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`

### `automacao_gatilhos`

- **p_aut_gat_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`

### `automacoes`

- **p_aut_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`

### `brechas`

- **p_brechas_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = brechas.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`
- **p_brechas_write** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`

### `ciclo_vida_eventos`

- **p_ciclo_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = ciclo_vida_eventos.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`

### `config_geral`

- **p_config_geral_all** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`
- **p_config_geral_select** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`

### `conversas`

- **p_conversas_delete** — DELETE (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
- **p_conversas_insert** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `true`
- **p_conversas_select** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (vendedor_id = crm.user_vendedor_id()) OR (vendedor_id IS NULL))`
- **p_conversas_update** — UPDATE (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (vendedor_id = crm.user_vendedor_id()) OR (vendedor_id IS NULL))`

### `funil_blocos`

- **p_funil_blocos_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`
- **p_funil_blocos_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`

### `funil_etapas`

- **p_funil_etapas_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`
- **p_funil_etapas_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`

### `funil_movimentos`

- **p_funil_mov_insert** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `true`
- **p_funil_mov_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = funil_movimentos.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`

### `instagram_posts`

- **p_ig_posts_select** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`
- **p_ig_posts_write** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`

### `kommo_config`

- **p_kommo_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`

### `mensagens`

- **p_mensagens_delete** — DELETE (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
- **p_mensagens_insert** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `true`
- **p_mensagens_select** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = mensagens.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`
- **p_mensagens_update** — UPDATE (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = mensagens.conversa_id) AND (c.vendedor_id = crm.user_vendedor_id())))))`

### `meta_config`

- **p_meta_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`

### `notificacoes`

- **p_notif_insert** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `true`
- **p_notif_select** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `((user_id = auth.uid()) OR crm.user_eh_admin())`
- **p_notif_update** — UPDATE (PERMISSIVE) roles=`authenticated`
  - USING: `(user_id = auth.uid())`

### `prompt_templates`

- **p_prompts_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`
- **p_prompts_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`

### `sdr_runs`

- **p_sdr_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = sdr_runs.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`

### `tarefas`

- **p_tarefas_read** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (responsavel_id = auth.uid()) OR (criado_por = auth.uid()))`
- **p_tarefas_write** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `(crm.user_eh_admin() OR (responsavel_id = auth.uid()) OR (criado_por = auth.uid()))`
  - WITH CHECK: `true`

### `unipile_config`

- **p_unipile_admin** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`

### `webhook_config`

- **p_wh_cfg** — ALL (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`
  - WITH CHECK: `crm.user_eh_admin()`

### `webhook_log`

- **p_wh_log** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `crm.user_eh_admin()`

