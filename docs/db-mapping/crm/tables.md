# `crm` — Tabelas

> 31 tabelas | gerado 2026-04-29

## Índice

- [`agente_runs`](#agente_runs)
- [`agentes_ia`](#agentes_ia)
- [`audit_log`](#audit_log)
- [`automacao_etapas`](#automacao_etapas)
- [`automacao_execucoes`](#automacao_execucoes)
- [`automacao_gatilhos`](#automacao_gatilhos)
- [`automacoes`](#automacoes)
- [`brechas`](#brechas)
- [`ciclo_vida_eventos`](#ciclo_vida_eventos)
- [`config_geral`](#config_geral) — Configs key-value (system prompts, defaults, feature flags).
- [`contato_canais`](#contato_canais)
- [`conversas`](#conversas)
- [`funil_blocos`](#funil_blocos)
- [`funil_etapas`](#funil_etapas)
- [`funil_movimentos`](#funil_movimentos)
- [`funis`](#funis)
- [`instagram_posts`](#instagram_posts)
- [`kommo_config`](#kommo_config)
- [`mensagens`](#mensagens)
- [`meta_config`](#meta_config)
- [`motivos_perda`](#motivos_perda)
- [`notificacoes`](#notificacoes)
- [`oportunidade_historico`](#oportunidade_historico)
- [`oportunidades`](#oportunidades)
- [`origens_lead`](#origens_lead)
- [`prompt_templates`](#prompt_templates)
- [`sdr_runs`](#sdr_runs)
- [`tarefas`](#tarefas)
- [`unipile_config`](#unipile_config)
- [`webhook_config`](#webhook_config)
- [`webhook_log`](#webhook_log)

---

## agente_runs

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `agente_id` | uuid | ✓ | — | — |
| 3 | `conversa_id` | uuid | ✓ | — | — |
| 4 | `prompt_final` | text | ✓ | — | — |
| 5 | `resposta` | text | ✓ | — | — |
| 6 | `modelo` | text | ✓ | — | — |
| 7 | `tokens_input` | integer | ✓ | — | — |
| 8 | `tokens_output` | integer | ✓ | — | — |
| 9 | `custo_usd` | numeric(10,6) | ✓ | — | — |
| 10 | `elapsed_ms` | integer | ✓ | — | — |
| 11 | `erro` | text | ✓ | — | — |
| 12 | `metadata` | jsonb | — | `'{}'::jsonb` | — |
| 13 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `agente_runs_pkey` — (`id`)

### Foreign Keys (saída)

- `agente_id` → `crm.agentes_ia.id` (UPDATE NO ACTION, DELETE SET NULL)
- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `crm.sdr_runs.agente_run_id` (constraint `sdr_runs_agente_run_id_fkey`)

### Índices

- `idx_agente_runs_conversa` — `CREATE INDEX idx_agente_runs_conversa ON crm.agente_runs USING btree (conversa_id, created_at DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_agente_runs_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = agente_runs.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`

_Sem referência identificada no código._

---

## agentes_ia

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `codigo` | text | — | — | — |
| 3 | `nome` | text | — | — | — |
| 4 | `descricao` | text | ✓ | — | — |
| 5 | `prompt_template_id` | uuid | ✓ | — | — |
| 6 | `parametros` | jsonb | — | `'{}'::jsonb` | — |
| 7 | `ativo` | boolean | — | `true` | — |
| 8 | `created_at` | timestamp with time zone | — | `now()` | — |
| 9 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `agentes_ia_codigo_key` — (`codigo`)
- **PRIMARY KEY** `agentes_ia_pkey` — (`id`)

### Foreign Keys (saída)

- `prompt_template_id` → `crm.prompt_templates.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `crm.agente_runs.agente_id` (constraint `agente_runs_agente_id_fkey`)

### Índices

- `agentes_ia_codigo_key` — `CREATE UNIQUE INDEX agentes_ia_codigo_key ON crm.agentes_ia USING btree (codigo)`

### Triggers

- `trg_agentes_ia_updated` — BEFORE UPDATE → `crm.set_updated_at` 
- `trg_audit_agentes_ia` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `p_agentes_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`
  - `p_agentes_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`

_Sem referência identificada no código._

---

## audit_log

**Aprox. linhas:** 128

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('crm.audit_log_id_seq'::regclass)` | — |
| 2 | `schema_name` | text | — | — | — |
| 3 | `table_name` | text | — | — | — |
| 4 | `operacao` | text | — | — | — |
| 5 | `registro_id` | text | ✓ | — | — |
| 6 | `user_id` | uuid | ✓ | — | — |
| 7 | `dados_antes` | jsonb | ✓ | — | — |
| 8 | `dados_depois` | jsonb | ✓ | — | — |
| 9 | `diff` | jsonb | ✓ | — | — |
| 10 | `ocorrido_em` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `audit_log_pkey` — (`id`)

### CHECK constraints

- `audit_log_operacao_check` — `CHECK ((operacao = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))`

### Índices

- `idx_audit_table_id` — `CREATE INDEX idx_audit_table_id ON crm.audit_log USING btree (schema_name, table_name, registro_id, ocorrido_em DESC)`
- `idx_audit_user` — `CREATE INDEX idx_audit_user ON crm.audit_log USING btree (user_id, ocorrido_em DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_audit` (SELECT, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`

**Uso no código:**
- `crm.audit_log` — 3 ocorrência(s)
  - `src/lib/audit.ts:37`
  - `scripts/migrar_ordens_legado.mjs:50`
  - `scripts/_db_mapping_build_docs.mjs:480`

---

## automacao_etapas

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `legacy_id` | integer | ✓ | — | — |
| 3 | `funil_id` | uuid | ✓ | — | — |
| 4 | `gatilho` | text | — | — | — |
| 5 | `estagio_origem_id` | uuid | ✓ | — | — |
| 6 | `estagio_destino_id` | uuid | ✓ | — | — |
| 7 | `tipo_acao` | text | — | — | — |
| 8 | `config` | jsonb | ✓ | `'{}'::jsonb` | — |
| 9 | `descricao` | text | ✓ | — | — |
| 10 | `ativo` | boolean | ✓ | `true` | — |
| 11 | `total_execucoes` | bigint | ✓ | `0` | — |
| 12 | `ultima_execucao` | timestamp with time zone | ✓ | — | — |
| 13 | `created_at` | timestamp with time zone | — | `now()` | — |
| 14 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `automacao_etapas_legacy_id_key` — (`legacy_id`)
- **PRIMARY KEY** `automacao_etapas_pkey` — (`id`)

### Foreign Keys (saída)

- `estagio_destino_id` → `crm.funil_etapas.id` (UPDATE NO ACTION, DELETE CASCADE)
- `estagio_origem_id` → `crm.funil_etapas.id` (UPDATE NO ACTION, DELETE CASCADE)
- `funil_id` → `crm.funis.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `automacao_etapas_legacy_id_key` — `CREATE UNIQUE INDEX automacao_etapas_legacy_id_key ON crm.automacao_etapas USING btree (legacy_id)`

### Triggers

- `trg_automacao_etapas_updated` — BEFORE UPDATE → `crm.set_updated_at` 

_Sem referência identificada no código._

---

## automacao_execucoes

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `automacao_id` | uuid | — | — | — |
| 3 | `conversa_id` | uuid | ✓ | — | — |
| 4 | `gatilho` | text | ✓ | — | — |
| 5 | `payload` | jsonb | ✓ | — | — |
| 6 | `resultado` | jsonb | ✓ | — | — |
| 7 | `sucesso` | boolean | ✓ | — | — |
| 8 | `erro` | text | ✓ | — | — |
| 9 | `elapsed_ms` | integer | ✓ | — | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `automacao_execucoes_pkey` — (`id`)

### Foreign Keys (saída)

- `automacao_id` → `crm.automacoes.id` (UPDATE NO ACTION, DELETE CASCADE)
- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE SET NULL)

### Índices

- `idx_aut_execucoes_automacao` — `CREATE INDEX idx_aut_execucoes_automacao ON crm.automacao_execucoes USING btree (automacao_id, created_at DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_aut_exec_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`

_Sem referência identificada no código._

---

## automacao_gatilhos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `automacao_id` | uuid | — | — | — |
| 2 | `gatilho` | text | — | — | — |
| 3 | `parametros` | jsonb | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `automacao_gatilhos_pkey` — (`automacao_id`, `gatilho`)

### Foreign Keys (saída)

- `automacao_id` → `crm.automacoes.id` (UPDATE NO ACTION, DELETE CASCADE)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_aut_gat_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`

_Sem referência identificada no código._

---

## automacoes

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `nome` | text | — | — | — |
| 3 | `descricao` | text | ✓ | — | — |
| 4 | `ativa` | boolean | — | `true` | — |
| 5 | `prioridade` | smallint | — | `100` | — |
| 6 | `condicoes` | jsonb | — | `'[]'::jsonb` | — |
| 7 | `acoes` | jsonb | — | `'[]'::jsonb` | — |
| 8 | `total_execucoes` | bigint | — | `0` | — |
| 9 | `ultima_execucao` | timestamp with time zone | ✓ | — | — |
| 10 | `criado_por` | uuid | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | — | `now()` | — |
| 12 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `automacoes_pkey` — (`id`)

### Referenciada por (entrada)

- `crm.automacao_execucoes.automacao_id` (constraint `automacao_execucoes_automacao_id_fkey`)
- `crm.automacao_gatilhos.automacao_id` (constraint `automacao_gatilhos_automacao_id_fkey`)

### Triggers

- `trg_audit_automacoes` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_automacoes_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_aut_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`

**Uso no código:**
- `crm.automacoes` — 19 ocorrência(s)
  - `src/app/(dashboard)/tarefas/AutomacoesTab.tsx:38`
  - `src/app/(dashboard)/tarefas/AutomacoesTab.tsx:54`
  - `src/app/(dashboard)/tarefas/AutomacoesTab.tsx:66`
  - `src/app/(dashboard)/tarefas/AutomacoesTab.tsx:90`
  - `src/app/(dashboard)/tarefas/AutomacoesTab.tsx:97`

---

## brechas

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `conversa_id` | uuid | ✓ | — | — |
| 3 | `contato_id` | bigint | ✓ | — | — |
| 4 | `tipo` | text | — | — | — |
| 5 | `titulo` | text | — | — | — |
| 6 | `descricao` | text | ✓ | — | — |
| 7 | `prioridade` | text | — | `'media'::text` | — |
| 8 | `status` | text | — | `'aberta'::text` | — |
| 9 | `vencimento` | timestamp with time zone | ✓ | — | — |
| 10 | `metadata` | jsonb | — | `'{}'::jsonb` | — |
| 11 | `detectada_em` | timestamp with time zone | — | `now()` | — |
| 12 | `fechada_em` | timestamp with time zone | ✓ | — | — |
| 13 | `fechada_por` | uuid | ✓ | — | — |
| 14 | `created_at` | timestamp with time zone | — | `now()` | — |
| 15 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `brechas_pkey` — (`id`)

### Foreign Keys (saída)

- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `crm.tarefas.brecha_id` (constraint `tarefas_brecha_id_fkey`)

### CHECK constraints

- `brechas_prioridade_check` — `CHECK ((prioridade = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text, 'urgente'::text])))`
- `brechas_status_check` — `CHECK ((status = ANY (ARRAY['aberta'::text, 'em_andamento'::text, 'fechada'::text, 'descartada'::text])))`

### Índices

- `idx_brechas_contato` — `CREATE INDEX idx_brechas_contato ON crm.brechas USING btree (contato_id)`
- `idx_brechas_status` — `CREATE INDEX idx_brechas_status ON crm.brechas USING btree (status, vencimento)`

### Triggers

- `trg_audit_brechas` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_brechas_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `p_brechas_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = brechas.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`
  - `p_brechas_write` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`

_Sem referência identificada no código._

---

## ciclo_vida_eventos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `conversa_id` | uuid | ✓ | — | — |
| 3 | `contato_id` | bigint | ✓ | — | — |
| 4 | `evento` | text | — | — | — |
| 5 | `detalhes` | jsonb | ✓ | — | — |
| 6 | `ocorrido_em` | timestamp with time zone | — | `now()` | — |
| 7 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `ciclo_vida_eventos_pkey` — (`id`)

### Foreign Keys (saída)

- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_ciclo_vida_contato` — `CREATE INDEX idx_ciclo_vida_contato ON crm.ciclo_vida_eventos USING btree (contato_id, evento, ocorrido_em DESC)`
- `idx_ciclo_vida_conversa` — `CREATE INDEX idx_ciclo_vida_conversa ON crm.ciclo_vida_eventos USING btree (conversa_id, ocorrido_em DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_ciclo_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = ciclo_vida_eventos.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`

_Sem referência identificada no código._

---

## config_geral

> Configs key-value (system prompts, defaults, feature flags).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `chave` | text | — | — | — |
| 2 | `valor` | jsonb | — | `'{}'::jsonb` | — |
| 3 | `descricao` | text | ✓ | — | — |
| 4 | `atualizado_por` | uuid | ✓ | — | — |
| 5 | `created_at` | timestamp with time zone | — | `now()` | — |
| 6 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `config_geral_pkey` — (`chave`)

### Triggers

- `trg_audit_config_geral` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_config_geral_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `p_config_geral_all` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`
  - `p_config_geral_select` (SELECT, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`

_Sem referência identificada no código._

---

## contato_canais

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `contato_id` | bigint | — | — | — |
| 3 | `canal` | text | — | — | — |
| 4 | `canal_id` | text | — | — | — |
| 5 | `username` | text | ✓ | — | — |
| 6 | `nome_canal` | text | ✓ | — | — |
| 7 | `foto_url` | text | ✓ | — | — |
| 8 | `metadata` | jsonb | — | `'{}'::jsonb` | — |
| 9 | `created_at` | timestamp with time zone | — | `now()` | — |
| 10 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `contato_canais_canal_canal_id_key` — (`canal`, `canal_id`)
- **PRIMARY KEY** `contato_canais_pkey` — (`id`)

### CHECK constraints

- `contato_canais_canal_check` — `CHECK ((canal = ANY (ARRAY['instagram_dm'::text, 'instagram'::text, 'whatsapp'::text, 'telegram'::text, 'email'::text, 'outro'::text])))`

### Índices

- `contato_canais_canal_canal_id_key` — `CREATE UNIQUE INDEX contato_canais_canal_canal_id_key ON crm.contato_canais USING btree (canal, canal_id)`
- `idx_contato_canais_contato` — `CREATE INDEX idx_contato_canais_contato ON crm.contato_canais USING btree (contato_id)`
- `idx_contato_canais_username` — `CREATE INDEX idx_contato_canais_username ON crm.contato_canais USING btree (canal, lower(username)) WHERE (username IS NOT NULL)`

### Triggers

- `trg_contato_canais_updated` — BEFORE UPDATE → `crm.set_updated_at` 

_Sem referência identificada no código._

---

## conversas

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `contato_id` | bigint | ✓ | — | — |
| 3 | `lead_id` | bigint | ✓ | — | — |
| 4 | `vendedor_id` | bigint | ✓ | — | — |
| 5 | `canal` | text | — | — | — |
| 6 | `canal_contato_id` | text | ✓ | — | — |
| 7 | `canal_thread_id` | text | ✓ | — | — |
| 8 | `status` | text | — | `'aberta'::text` | — |
| 9 | `modo_auto` | boolean | — | `false` | — |
| 10 | `ultima_msg_em` | timestamp with time zone | ✓ | — | — |
| 11 | `ultima_msg_resumo` | text | ✓ | — | — |
| 12 | `nao_lidas_count` | integer | — | `0` | — |
| 13 | `metadata` | jsonb | — | `'{}'::jsonb` | — |
| 14 | `created_at` | timestamp with time zone | — | `now()` | — |
| 15 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 16 | `etapa_atual_id` | uuid | ✓ | — | — |

### Chaves

- **UNIQUE** `conversas_canal_canal_thread_id_key` — (`canal`, `canal_thread_id`)
- **PRIMARY KEY** `conversas_pkey` — (`id`)

### Foreign Keys (saída)

- `etapa_atual_id` → `crm.funil_etapas.id` (UPDATE NO ACTION, DELETE SET NULL)

### Referenciada por (entrada)

- `crm.agente_runs.conversa_id` (constraint `agente_runs_conversa_id_fkey`)
- `crm.automacao_execucoes.conversa_id` (constraint `automacao_execucoes_conversa_id_fkey`)
- `crm.brechas.conversa_id` (constraint `brechas_conversa_id_fkey`)
- `crm.ciclo_vida_eventos.conversa_id` (constraint `ciclo_vida_eventos_conversa_id_fkey`)
- `crm.funil_movimentos.conversa_id` (constraint `funil_movimentos_conversa_id_fkey`)
- `crm.mensagens.conversa_id` (constraint `mensagens_conversa_id_fkey`)
- `crm.notificacoes.conversa_id` (constraint `notificacoes_conversa_id_fkey`)
- `crm.oportunidades.conversa_id` (constraint `oportunidades_conversa_id_fkey`)
- `crm.sdr_runs.conversa_id` (constraint `sdr_runs_conversa_id_fkey`)
- `crm.tarefas.conversa_id` (constraint `tarefas_conversa_id_fkey`)
- `crm.webhook_log.conversa_id` (constraint `webhook_log_conversa_id_fkey`)

### CHECK constraints

- `conversas_canal_check` — `CHECK ((canal = ANY (ARRAY['instagram_dm'::text, 'instagram_comment'::text, 'whatsapp'::text, 'telegram'::text, 'email'::text, 'interna'::text])))`
- `conversas_status_check` — `CHECK ((status = ANY (ARRAY['aberta'::text, 'aguardando'::text, 'fechada'::text, 'arquivada'::text])))`

### Índices

- `conversas_canal_canal_thread_id_key` — `CREATE UNIQUE INDEX conversas_canal_canal_thread_id_key ON crm.conversas USING btree (canal, canal_thread_id)`
- `idx_conversas_canal_contatoid` — `CREATE INDEX idx_conversas_canal_contatoid ON crm.conversas USING btree (canal, canal_contato_id)`
- `idx_conversas_contato` — `CREATE INDEX idx_conversas_contato ON crm.conversas USING btree (contato_id)`
- `idx_conversas_status` — `CREATE INDEX idx_conversas_status ON crm.conversas USING btree (status) WHERE (status <> 'arquivada'::text)`
- `idx_conversas_ultima_msg` — `CREATE INDEX idx_conversas_ultima_msg ON crm.conversas USING btree (ultima_msg_em DESC NULLS LAST)`
- `idx_conversas_vendedor` — `CREATE INDEX idx_conversas_vendedor ON crm.conversas USING btree (vendedor_id)`

### Triggers

- `trg_audit_conversas` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_conversas_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `p_conversas_delete` (DELETE, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
  - `p_conversas_insert` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `true`
  - `p_conversas_select` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (vendedor_id = crm.user_vendedor_id()) OR (vendedor_id IS NULL))`
  - `p_conversas_update` (UPDATE, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (vendedor_id = crm.user_vendedor_id()) OR (vendedor_id IS NULL))`

_Sem referência identificada no código._

---

## funil_blocos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `nome` | text | — | — | — |
| 3 | `ordem` | integer | — | — | — |
| 4 | `cor` | text | ✓ | — | — |
| 5 | `created_at` | timestamp with time zone | — | `now()` | — |
| 6 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `funil_blocos_pkey` — (`id`)

### Referenciada por (entrada)

- `crm.funil_etapas.bloco_id` (constraint `funil_etapas_bloco_id_fkey`)

### Triggers

- `trg_audit_funil_blocos` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_funil_blocos_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `p_funil_blocos_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`
  - `p_funil_blocos_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`

_Sem referência identificada no código._

---

## funil_etapas

**Aprox. linhas:** 84

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `bloco_id` | uuid | — | — | — |
| 3 | `nome` | text | — | — | — |
| 4 | `ordem` | integer | — | — | — |
| 5 | `cor` | text | ✓ | — | — |
| 6 | `ativo` | boolean | — | `true` | — |
| 7 | `acao_entrada` | jsonb | ✓ | — | — |
| 8 | `acao_saida` | jsonb | ✓ | — | — |
| 9 | `sla_horas` | integer | ✓ | — | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |
| 11 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 12 | `legacy_id` | integer | ✓ | — | — |
| 13 | `funil_id` | uuid | ✓ | — | — |
| 14 | `tipo` | text | ✓ | `'aberto'::text` | — |
| 15 | `fase` | text | ✓ | — | — |

### Chaves

- **UNIQUE** `funil_etapas_legacy_id_key` — (`legacy_id`)
- **PRIMARY KEY** `funil_etapas_pkey` — (`id`)

### Foreign Keys (saída)

- `bloco_id` → `crm.funil_blocos.id` (UPDATE NO ACTION, DELETE CASCADE)
- `funil_id` → `crm.funis.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `crm.automacao_etapas.estagio_destino_id` (constraint `automacao_etapas_estagio_destino_id_fkey`)
- `crm.automacao_etapas.estagio_origem_id` (constraint `automacao_etapas_estagio_origem_id_fkey`)
- `crm.conversas.etapa_atual_id` (constraint `conversas_etapa_atual_id_fkey`)
- `crm.funil_movimentos.etapa_de` (constraint `funil_movimentos_etapa_de_fkey`)
- `crm.funil_movimentos.etapa_para` (constraint `funil_movimentos_etapa_para_fkey`)
- `crm.oportunidade_historico.etapa_anterior_id` (constraint `oportunidade_historico_etapa_anterior_id_fkey`)
- `crm.oportunidade_historico.etapa_nova_id` (constraint `oportunidade_historico_etapa_nova_id_fkey`)
- `crm.oportunidades.etapa_id` (constraint `oportunidades_etapa_id_fkey`)

### CHECK constraints

- `funil_etapas_tipo_check` — `CHECK ((tipo = ANY (ARRAY['aberto'::text, 'ganho'::text, 'perdido'::text, 'arquivo'::text, 'pos_venda'::text, 'nutrir'::text])))`

### Índices

- `funil_etapas_legacy_id_key` — `CREATE UNIQUE INDEX funil_etapas_legacy_id_key ON crm.funil_etapas USING btree (legacy_id)`
- `idx_funil_etapas_bloco` — `CREATE INDEX idx_funil_etapas_bloco ON crm.funil_etapas USING btree (bloco_id, ordem)`
- `idx_funil_etapas_funil` — `CREATE INDEX idx_funil_etapas_funil ON crm.funil_etapas USING btree (funil_id, ordem)`

### Triggers

- `trg_audit_funil_etapas` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_funil_etapas_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `p_funil_etapas_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`
  - `p_funil_etapas_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`

_Sem referência identificada no código._

---

## funil_movimentos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `conversa_id` | uuid | — | — | — |
| 3 | `etapa_de` | uuid | ✓ | — | — |
| 4 | `etapa_para` | uuid | ✓ | — | — |
| 5 | `motivo` | text | ✓ | — | — |
| 6 | `movido_por` | uuid | ✓ | — | — |
| 7 | `movido_em` | timestamp with time zone | — | `now()` | — |
| 8 | `metadata` | jsonb | — | `'{}'::jsonb` | — |

### Chaves

- **PRIMARY KEY** `funil_movimentos_pkey` — (`id`)

### Foreign Keys (saída)

- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE CASCADE)
- `etapa_de` → `crm.funil_etapas.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `etapa_para` → `crm.funil_etapas.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_funil_movimentos_conversa` — `CREATE INDEX idx_funil_movimentos_conversa ON crm.funil_movimentos USING btree (conversa_id, movido_em DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `p_funil_mov_insert` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `true`
  - `p_funil_mov_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = funil_movimentos.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`

_Sem referência identificada no código._

---

## funis

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `legacy_id` | integer | ✓ | — | — |
| 3 | `nome` | text | — | — | — |
| 4 | `cor` | text | ✓ | `'#184036'::text` | — |
| 5 | `ordem` | integer | — | `1` | — |
| 6 | `ativo` | boolean | — | `true` | — |
| 7 | `descricao` | text | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | — | `now()` | — |
| 9 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `funis_legacy_id_key` — (`legacy_id`)
- **PRIMARY KEY** `funis_pkey` — (`id`)

### Referenciada por (entrada)

- `crm.automacao_etapas.funil_id` (constraint `automacao_etapas_funil_id_fkey`)
- `crm.funil_etapas.funil_id` (constraint `funil_etapas_funil_id_fkey`)
- `crm.oportunidades.funil_id` (constraint `oportunidades_funil_id_fkey`)

### Índices

- `funis_legacy_id_key` — `CREATE UNIQUE INDEX funis_legacy_id_key ON crm.funis USING btree (legacy_id)`
- `idx_funis_ordem` — `CREATE INDEX idx_funis_ordem ON crm.funis USING btree (ordem) WHERE ativo`

### Triggers

- `trg_funis_updated` — BEFORE UPDATE → `crm.set_updated_at` 

_Sem referência identificada no código._

---

## instagram_posts

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | text | — | — | — |
| 2 | `tipo` | text | ✓ | — | — |
| 3 | `caption` | text | ✓ | — | — |
| 4 | `permalink` | text | ✓ | — | — |
| 5 | `thumbnail_url` | text | ✓ | — | — |
| 6 | `media_url` | text | ✓ | — | — |
| 7 | `thumbnail_storage_path` | text | ✓ | — | — |
| 8 | `media_storage_path` | text | ✓ | — | — |
| 9 | `thumbnail_url_local` | text | ✓ | — | — |
| 10 | `media_url_local` | text | ✓ | — | — |
| 11 | `timestamp_post` | timestamp with time zone | ✓ | — | — |
| 12 | `metadata` | jsonb | — | `'{}'::jsonb` | — |
| 13 | `created_at` | timestamp with time zone | — | `now()` | — |
| 14 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `instagram_posts_pkey` — (`id`)

### CHECK constraints

- `instagram_posts_tipo_check` — `CHECK (((tipo IS NULL) OR (tipo = ANY (ARRAY['IMAGE'::text, 'VIDEO'::text, 'CAROUSEL_ALBUM'::text, 'STORY'::text, 'REEL'::text]))))`

### Triggers

- `trg_instagram_posts_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `p_ig_posts_select` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`
  - `p_ig_posts_write` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`

_Sem referência identificada no código._

---

## kommo_config

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `subdomain` | text | ✓ | — | — |
| 3 | `client_id` | text | ✓ | — | — |
| 4 | `client_secret` | text | ✓ | — | — |
| 5 | `access_token` | text | ✓ | — | — |
| 6 | `refresh_token` | text | ✓ | — | — |
| 7 | `expires_at` | timestamp with time zone | ✓ | — | — |
| 8 | `ativo` | boolean | — | `true` | — |
| 9 | `created_at` | timestamp with time zone | — | `now()` | — |
| 10 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `kommo_config_pkey` — (`id`)

### Triggers

- `trg_audit_kommo_config` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_kommo_config_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_kommo_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`

_Sem referência identificada no código._

---

## mensagens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `conversa_id` | uuid | — | — | — |
| 3 | `canal_message_id` | text | ✓ | — | — |
| 4 | `papel` | text | — | — | — |
| 5 | `conteudo` | text | ✓ | — | — |
| 6 | `tipo_midia` | text | ✓ | — | — |
| 7 | `midia_url` | text | ✓ | — | — |
| 8 | `midia_storage_path` | text | ✓ | — | — |
| 9 | `duracao_segundos` | integer | ✓ | — | — |
| 10 | `instagram_media_id` | text | ✓ | — | — |
| 11 | `status` | text | — | `'enviada'::text` | — |
| 12 | `erro` | text | ✓ | — | — |
| 13 | `enviado_em` | timestamp with time zone | ✓ | — | — |
| 14 | `metadata` | jsonb | — | `'{}'::jsonb` | — |
| 15 | `created_at` | timestamp with time zone | — | `now()` | — |
| 16 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `mensagens_conversa_id_canal_message_id_key` — (`conversa_id`, `canal_message_id`)
- **PRIMARY KEY** `mensagens_pkey` — (`id`)

### Foreign Keys (saída)

- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `crm.webhook_log.mensagem_id` (constraint `webhook_log_mensagem_id_fkey`)

### CHECK constraints

- `mensagens_papel_check` — `CHECK ((papel = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text, 'vendedor'::text, 'interno'::text])))`
- `mensagens_status_check` — `CHECK ((status = ANY (ARRAY['pendente'::text, 'enviando'::text, 'enviada'::text, 'entregue'::text, 'lida'::text, 'erro'::text])))`
- `mensagens_tipo_midia_check` — `CHECK (((tipo_midia IS NULL) OR (tipo_midia = ANY (ARRAY['imagem'::text, 'video'::text, 'audio'::text, 'documento'::text, 'sticker'::text]))))`

### Índices

- `idx_mensagens_conversa` — `CREATE INDEX idx_mensagens_conversa ON crm.mensagens USING btree (conversa_id, created_at DESC)`
- `idx_mensagens_instagram_media` — `CREATE INDEX idx_mensagens_instagram_media ON crm.mensagens USING btree (instagram_media_id) WHERE (instagram_media_id IS NOT NULL)`
- `mensagens_conversa_id_canal_message_id_key` — `CREATE UNIQUE INDEX mensagens_conversa_id_canal_message_id_key ON crm.mensagens USING btree (conversa_id, canal_message_id)`

### Triggers

- `trg_mensagens_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `p_mensagens_delete` (DELETE, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
  - `p_mensagens_insert` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `true`
  - `p_mensagens_select` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = mensagens.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`
  - `p_mensagens_update` (UPDATE, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = mensagens.conversa_id) AND (c.vendedor_id = crm.user_vendedor_id())))))`

**Uso no código:**
- `crm.mensagens` — 8 ocorrência(s)
  - `src/app/api/whatsapp/webhook/route.js:3`
  - `src/app/api/whatsapp/webhook/route.js:262`
  - `src/lib/whatsapp/assistente.js:105`
  - `src/lib/whatsapp/assistente.js:161`
  - `src/lib/whatsapp/evolution.js:81`

---

## meta_config

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `app_id` | text | ✓ | — | — |
| 3 | `app_secret` | text | ✓ | — | — |
| 4 | `page_id` | text | ✓ | — | — |
| 5 | `page_access_token` | text | ✓ | — | — |
| 6 | `ig_business_id` | text | ✓ | — | — |
| 7 | `verify_token` | text | ✓ | — | — |
| 8 | `webhook_url` | text | ✓ | — | — |
| 9 | `ativo` | boolean | — | `true` | — |
| 10 | `status` | text | — | `'desconectado'::text` | — |
| 11 | `ultimo_erro` | text | ✓ | — | — |
| 12 | `created_at` | timestamp with time zone | — | `now()` | — |
| 13 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `meta_config_pkey` — (`id`)

### CHECK constraints

- `meta_config_status_check` — `CHECK ((status = ANY (ARRAY['desconectado'::text, 'conectado'::text, 'erro'::text])))`

### Triggers

- `trg_audit_meta_config` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_meta_config_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_meta_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`

_Sem referência identificada no código._

---

## motivos_perda

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `legacy_id` | integer | ✓ | — | — |
| 3 | `nome` | text | — | — | — |
| 4 | `ativo` | boolean | ✓ | `true` | — |
| 5 | `ordem` | integer | ✓ | `1` | — |
| 6 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `motivos_perda_legacy_id_key` — (`legacy_id`)
- **PRIMARY KEY** `motivos_perda_pkey` — (`id`)

### Índices

- `motivos_perda_legacy_id_key` — `CREATE UNIQUE INDEX motivos_perda_legacy_id_key ON crm.motivos_perda USING btree (legacy_id)`

_Sem referência identificada no código._

---

## notificacoes

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `user_id` | uuid | — | — | — |
| 3 | `tipo` | text | — | — | — |
| 4 | `titulo` | text | — | — | — |
| 5 | `mensagem` | text | ✓ | — | — |
| 6 | `link` | text | ✓ | — | — |
| 7 | `conversa_id` | uuid | ✓ | — | — |
| 8 | `contato_id` | bigint | ✓ | — | — |
| 9 | `metadata` | jsonb | — | `'{}'::jsonb` | — |
| 10 | `lida` | boolean | — | `false` | — |
| 11 | `lida_em` | timestamp with time zone | ✓ | — | — |
| 12 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `notificacoes_pkey` — (`id`)

### Foreign Keys (saída)

- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_notif_user` — `CREATE INDEX idx_notif_user ON crm.notificacoes USING btree (user_id, lida, created_at DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 3
  - `p_notif_insert` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `true`
  - `p_notif_select` (SELECT, PERMISSIVE) roles=authenticated
    USING: `((user_id = auth.uid()) OR crm.user_eh_admin())`
  - `p_notif_update` (UPDATE, PERMISSIVE) roles=authenticated
    USING: `(user_id = auth.uid())`

**Uso no código:**
- `crm.notificacoes` — 56 ocorrência(s) _(amostra abaixo)_
  - `src/app/api/notificacoes/adiar/route.ts:5`
  - `src/app/api/notificacoes/contagem/route.ts:5`
  - `src/app/api/notificacoes/ler-todas/route.ts:5`
  - `src/app/api/notificacoes/pendentes-resposta/route.ts:5`
  - `src/app/api/notificacoes/route.ts:5`

---

## oportunidade_historico

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('crm.oportunidade_historico_id_seq'::regclass)` | — |
| 2 | `oportunidade_id` | uuid | — | — | — |
| 3 | `etapa_anterior_id` | uuid | ✓ | — | — |
| 4 | `etapa_nova_id` | uuid | ✓ | — | — |
| 5 | `etapa_anterior_nome` | text | ✓ | — | — |
| 6 | `etapa_nova_nome` | text | ✓ | — | — |
| 7 | `motivo` | text | ✓ | — | — |
| 8 | `user_id` | uuid | ✓ | — | — |
| 9 | `metadata` | jsonb | ✓ | `'{}'::jsonb` | — |
| 10 | `ocorrido_em` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `oportunidade_historico_pkey` — (`id`)

### Foreign Keys (saída)

- `etapa_anterior_id` → `crm.funil_etapas.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `etapa_nova_id` → `crm.funil_etapas.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `oportunidade_id` → `crm.oportunidades.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_oport_hist_op` — `CREATE INDEX idx_oport_hist_op ON crm.oportunidade_historico USING btree (oportunidade_id, ocorrido_em DESC)`

_Sem referência identificada no código._

---

## oportunidades

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `legacy_id` | text | ✓ | — | — |
| 3 | `contato_id` | bigint | ✓ | — | — |
| 4 | `vendedor_id` | bigint | ✓ | — | — |
| 5 | `conversa_id` | uuid | ✓ | — | — |
| 6 | `funil_id` | uuid | — | — | — |
| 7 | `etapa_id` | uuid | ✓ | — | — |
| 8 | `titulo` | text | — | — | — |
| 9 | `valor` | numeric(12,2) | ✓ | — | — |
| 10 | `produto_interesse` | text | ✓ | — | — |
| 11 | `notas` | text | ✓ | — | — |
| 12 | `tags` | jsonb | ✓ | `'[]'::jsonb` | — |
| 13 | `origem_lead` | text | ✓ | — | — |
| 14 | `canal_origem` | text | ✓ | — | — |
| 15 | `motivo_perda` | text | ✓ | — | — |
| 16 | `tipo_pedido` | text | ✓ | — | — |
| 17 | `forma_atendimento` | text | ✓ | — | — |
| 18 | `tipo_cliente` | text | ✓ | — | — |
| 19 | `itens_pedido` | jsonb | ✓ | — | — |
| 20 | `desconto` | text | ✓ | — | — |
| 21 | `parcelas` | integer | ✓ | — | — |
| 22 | `forma_pagamento` | text | ✓ | — | — |
| 23 | `valor_frete` | numeric(12,2) | ✓ | — | — |
| 24 | `endereco_entrega` | text | ✓ | — | — |
| 25 | `data_prevista_entrega` | date | ✓ | — | — |
| 26 | `data_envio` | date | ✓ | — | — |
| 27 | `transportador` | text | ✓ | — | — |
| 28 | `observacao_pedido` | text | ✓ | — | — |
| 29 | `forma_envio` | text | ✓ | — | — |
| 30 | `codigo_rastreio` | text | ✓ | — | — |
| 31 | `data_entrega` | date | ✓ | — | — |
| 32 | `entrega_confirmada` | boolean | ✓ | `false` | — |
| 33 | `score_bant` | smallint | ✓ | — | — |
| 34 | `classificacao` | text | ✓ | — | — |
| 35 | `perfil` | text | ✓ | — | — |
| 36 | `decisor` | text | ✓ | — | — |
| 37 | `orcamento_declarado` | text | ✓ | — | — |
| 38 | `ocasiao` | text | ✓ | — | — |
| 39 | `prazo` | text | ✓ | — | — |
| 40 | `motivo_pos_venda` | text | ✓ | — | — |
| 41 | `data_entrada_pos_venda` | timestamp with time zone | ✓ | — | — |
| 42 | `opt_out` | boolean | ✓ | `false` | — |
| 43 | `opt_out_data` | timestamp with time zone | ✓ | — | — |
| 44 | `tentativas_reabordagem` | integer | ✓ | `0` | — |
| 45 | `campos_ia` | jsonb | ✓ | `'[]'::jsonb` | — |
| 46 | `metadata` | jsonb | ✓ | `'{}'::jsonb` | — |
| 47 | `created_at` | timestamp with time zone | — | `now()` | — |
| 48 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `oportunidades_legacy_id_key` — (`legacy_id`)
- **PRIMARY KEY** `oportunidades_pkey` — (`id`)

### Foreign Keys (saída)

- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE SET NULL)
- `etapa_id` → `crm.funil_etapas.id` (UPDATE NO ACTION, DELETE SET NULL)
- `funil_id` → `crm.funis.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `crm.oportunidade_historico.oportunidade_id` (constraint `oportunidade_historico_oportunidade_id_fkey`)

### CHECK constraints

- `oportunidades_classificacao_check` — `CHECK (((classificacao IS NULL) OR (classificacao = ANY (ARRAY['frio'::text, 'morno'::text, 'quente'::text, 'muito_quente'::text]))))`

### Índices

- `idx_oport_classif` — `CREATE INDEX idx_oport_classif ON crm.oportunidades USING btree (classificacao) WHERE (classificacao IS NOT NULL)`
- `idx_oport_contato` — `CREATE INDEX idx_oport_contato ON crm.oportunidades USING btree (contato_id)`
- `idx_oport_conversa` — `CREATE INDEX idx_oport_conversa ON crm.oportunidades USING btree (conversa_id) WHERE (conversa_id IS NOT NULL)`
- `idx_oport_funil` — `CREATE INDEX idx_oport_funil ON crm.oportunidades USING btree (funil_id, etapa_id)`
- `idx_oport_vendedor` — `CREATE INDEX idx_oport_vendedor ON crm.oportunidades USING btree (vendedor_id)`
- `oportunidades_legacy_id_key` — `CREATE UNIQUE INDEX oportunidades_legacy_id_key ON crm.oportunidades USING btree (legacy_id)`

### Triggers

- `trg_oportunidades_updated` — BEFORE UPDATE → `crm.set_updated_at` 

**Uso no código:**
- `crm.oportunidades` — 11 ocorrência(s)
  - `src/app/api/gestao-estoque/ai-chat/route.ts:45`
  - `src/app/api/gestao-estoque/oportunidades-fabricacao/route.ts:2`
  - `src/app/api/gestao-estoque/oportunidades-fabricacao/route.ts:160`
  - `src/app/api/gestao-estoque/oportunidades-fabricacao/route.ts:161`
  - `src/components/gestao-estoque/Dashboard.tsx:193`

---

## origens_lead

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `legacy_id` | integer | ✓ | — | — |
| 3 | `nome` | text | — | — | — |
| 4 | `ativo` | boolean | ✓ | `true` | — |
| 5 | `ordem` | integer | ✓ | `1` | — |
| 6 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `origens_lead_legacy_id_key` — (`legacy_id`)
- **PRIMARY KEY** `origens_lead_pkey` — (`id`)

### Índices

- `origens_lead_legacy_id_key` — `CREATE UNIQUE INDEX origens_lead_legacy_id_key ON crm.origens_lead USING btree (legacy_id)`

_Sem referência identificada no código._

---

## prompt_templates

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `codigo` | text | — | — | — |
| 3 | `nome` | text | — | — | — |
| 4 | `descricao` | text | ✓ | — | — |
| 5 | `modelo` | text | ✓ | — | — |
| 6 | `temperatura` | numeric(3,2) | ✓ | `0.7` | — |
| 7 | `system_prompt` | text | — | — | — |
| 8 | `variaveis` | jsonb | — | `'[]'::jsonb` | — |
| 9 | `ativo` | boolean | — | `true` | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |
| 11 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `prompt_templates_codigo_key` — (`codigo`)
- **PRIMARY KEY** `prompt_templates_pkey` — (`id`)

### Referenciada por (entrada)

- `crm.agentes_ia.prompt_template_id` (constraint `agentes_ia_prompt_template_id_fkey`)

### Índices

- `prompt_templates_codigo_key` — `CREATE UNIQUE INDEX prompt_templates_codigo_key ON crm.prompt_templates USING btree (codigo)`

### Triggers

- `trg_audit_prompt_templates` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_prompt_templates_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `p_prompts_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`
  - `p_prompts_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`

_Sem referência identificada no código._

---

## sdr_runs

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `conversa_id` | uuid | — | — | — |
| 3 | `score_budget` | smallint | ✓ | — | — |
| 4 | `score_authority` | smallint | ✓ | — | — |
| 5 | `score_need` | smallint | ✓ | — | — |
| 6 | `score_timing` | smallint | ✓ | — | — |
| 7 | `score_total` | smallint | ✓ | — | — |
| 8 | `bonus_engajamento` | smallint | ✓ | `0` | — |
| 9 | `classificacao` | text | ✓ | — | — |
| 10 | `resumo` | text | ✓ | — | — |
| 11 | `proximos_passos` | text | ✓ | — | — |
| 12 | `agente_run_id` | uuid | ✓ | — | — |
| 13 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `sdr_runs_pkey` — (`id`)

### Foreign Keys (saída)

- `agente_run_id` → `crm.agente_runs.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `sdr_runs_classificacao_check` — `CHECK ((classificacao = ANY (ARRAY['frio'::text, 'morno'::text, 'quente'::text, 'muito_quente'::text])))`
- `sdr_runs_score_authority_check` — `CHECK (((score_authority >= 0) AND (score_authority <= 100)))`
- `sdr_runs_score_budget_check` — `CHECK (((score_budget >= 0) AND (score_budget <= 100)))`
- `sdr_runs_score_need_check` — `CHECK (((score_need >= 0) AND (score_need <= 100)))`
- `sdr_runs_score_timing_check` — `CHECK (((score_timing >= 0) AND (score_timing <= 100)))`
- `sdr_runs_score_total_check` — `CHECK (((score_total >= 0) AND (score_total <= 100)))`

### Índices

- `idx_sdr_runs_conversa` — `CREATE INDEX idx_sdr_runs_conversa ON crm.sdr_runs USING btree (conversa_id, created_at DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_sdr_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (EXISTS ( SELECT 1    FROM crm.conversas c   WHERE ((c.id = sdr_runs.conversa_id) AND ((c.vendedor_id = crm.user_vendedor_id()) OR (c.vendedor_id IS NULL))))))`

_Sem referência identificada no código._

---

## tarefas

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `titulo` | text | — | — | — |
| 3 | `descricao` | text | ✓ | — | — |
| 4 | `conversa_id` | uuid | ✓ | — | — |
| 5 | `contato_id` | bigint | ✓ | — | — |
| 6 | `brecha_id` | uuid | ✓ | — | — |
| 7 | `responsavel_id` | uuid | ✓ | — | — |
| 8 | `prioridade` | text | — | `'media'::text` | — |
| 9 | `status` | text | — | `'pendente'::text` | — |
| 10 | `data_limite` | timestamp with time zone | ✓ | — | — |
| 11 | `concluida_em` | timestamp with time zone | ✓ | — | — |
| 12 | `criado_por` | uuid | ✓ | — | — |
| 13 | `created_at` | timestamp with time zone | — | `now()` | — |
| 14 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `tarefas_pkey` — (`id`)

### Foreign Keys (saída)

- `brecha_id` → `crm.brechas.id` (UPDATE NO ACTION, DELETE SET NULL)
- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE SET NULL)

### CHECK constraints

- `tarefas_prioridade_check` — `CHECK ((prioridade = ANY (ARRAY['baixa'::text, 'media'::text, 'alta'::text, 'urgente'::text])))`
- `tarefas_status_check` — `CHECK ((status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'concluida'::text, 'cancelada'::text])))`

### Índices

- `idx_tarefas_conversa` — `CREATE INDEX idx_tarefas_conversa ON crm.tarefas USING btree (conversa_id)`
- `idx_tarefas_resp` — `CREATE INDEX idx_tarefas_resp ON crm.tarefas USING btree (responsavel_id, status, data_limite)`

### Triggers

- `trg_audit_tarefas` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_tarefas_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `p_tarefas_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (responsavel_id = auth.uid()) OR (criado_por = auth.uid()))`
  - `p_tarefas_write` (ALL, PERMISSIVE) roles=authenticated
    USING: `(crm.user_eh_admin() OR (responsavel_id = auth.uid()) OR (criado_por = auth.uid()))`
    WITH CHECK: `true`

**Uso no código:**
- `crm.tarefas` — 68 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/devolucoes/[id]/DevolucaoDetalheClient.tsx:373`
  - `src/app/(dashboard)/tarefas/AutomacoesTab.tsx:209`
  - `src/app/(dashboard)/tarefas/TarefaDrawer.tsx:84`
  - `src/app/(dashboard)/tarefas/TarefaDrawer.tsx:94`
  - `src/app/(dashboard)/tarefas/TarefaDrawer.tsx:108`

---

## unipile_config

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `api_key` | text | — | — | — |
| 3 | `dsn` | text | — | — | — |
| 4 | `account_id` | text | ✓ | — | — |
| 5 | `account_username` | text | ✓ | — | — |
| 6 | `account_provider` | text | ✓ | `'INSTAGRAM'::text` | — |
| 7 | `webhook_id` | text | ✓ | — | — |
| 8 | `webhook_url` | text | ✓ | — | — |
| 9 | `webhook_source` | text | ✓ | `'messaging'::text` | — |
| 10 | `ativo` | boolean | — | `true` | — |
| 11 | `status` | text | — | `'desconectado'::text` | — |
| 12 | `ultimo_erro` | text | ✓ | — | — |
| 13 | `created_at` | timestamp with time zone | — | `now()` | — |
| 14 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `unipile_config_pkey` — (`id`)

### CHECK constraints

- `unipile_config_status_check` — `CHECK ((status = ANY (ARRAY['desconectado'::text, 'conectado'::text, 'erro'::text])))`

### Triggers

- `trg_audit_unipile_config` — AFTER INSERT/DELETE/UPDATE → `crm.audit_trigger` 
- `trg_unipile_config_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_unipile_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`

_Sem referência identificada no código._

---

## webhook_config

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `nome` | text | — | — | — |
| 3 | `source` | text | — | — | — |
| 4 | `url_callback` | text | ✓ | — | — |
| 5 | `ativo` | boolean | — | `true` | — |
| 6 | `total_eventos` | bigint | — | `0` | — |
| 7 | `ultimo_evento` | timestamp with time zone | ✓ | — | — |
| 8 | `ultimo_erro` | text | ✓ | — | — |
| 9 | `configuracao` | jsonb | — | `'{}'::jsonb` | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |
| 11 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `webhook_config_nome_key` — (`nome`)
- **PRIMARY KEY** `webhook_config_pkey` — (`id`)

### Índices

- `webhook_config_nome_key` — `CREATE UNIQUE INDEX webhook_config_nome_key ON crm.webhook_config USING btree (nome)`

### Triggers

- `trg_webhook_config_updated` — BEFORE UPDATE → `crm.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_wh_cfg` (ALL, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`
    WITH CHECK: `crm.user_eh_admin()`

**Uso no código:**
- `crm.webhook_config` — 9 ocorrência(s)
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:275`
  - `src/lib/webhooks.ts:16`
  - `scripts/apply_135.mjs:2`
  - `scripts/apply_135.mjs:23`
  - `scripts/apply_135.mjs:142`

---

## webhook_log

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `source` | text | — | — | — |
| 3 | `event` | text | ✓ | — | — |
| 4 | `payload` | jsonb | ✓ | — | — |
| 5 | `processado` | boolean | — | `false` | — |
| 6 | `resultado` | jsonb | ✓ | — | — |
| 7 | `erro` | text | ✓ | — | — |
| 8 | `conversa_id` | uuid | ✓ | — | — |
| 9 | `mensagem_id` | uuid | ✓ | — | — |
| 10 | `recebido_em` | timestamp with time zone | — | `now()` | — |
| 11 | `processado_em` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `webhook_log_pkey` — (`id`)

### Foreign Keys (saída)

- `conversa_id` → `crm.conversas.id` (UPDATE NO ACTION, DELETE SET NULL)
- `mensagem_id` → `crm.mensagens.id` (UPDATE NO ACTION, DELETE SET NULL)

### Índices

- `idx_webhook_log_pendente` — `CREATE INDEX idx_webhook_log_pendente ON crm.webhook_log USING btree (processado, recebido_em) WHERE (NOT processado)`
- `idx_webhook_log_source` — `CREATE INDEX idx_webhook_log_source ON crm.webhook_log USING btree (source, recebido_em DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `p_wh_log` (SELECT, PERMISSIVE) roles=authenticated
    USING: `crm.user_eh_admin()`

**Uso no código:**
- `crm.webhook_log` — 5 ocorrência(s)
  - `src/app/api/webhooks/mercado-pago/route.ts:13`
  - `src/lib/webhooks.ts:43`
  - `scripts/diagnose_pix_502.mjs:34`
  - `scripts/diagnose_pix_aguardando.mjs:35`
  - `supabase/migrations/135_mercado_pago_integracao.sql:18`

---

