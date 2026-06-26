# `directus` — Tabelas

> 110 tabelas | gerado 2026-04-29

## Índice

- [`ai_prompts`](#ai_prompts)
- [`apontamento`](#apontamento)
- [`apontamento_distribuicao`](#apontamento_distribuicao)
- [`apontamento_distribuicao_files`](#apontamento_distribuicao_files)
- [`apontamento_files`](#apontamento_files)
- [`apontamentos_pote`](#apontamentos_pote)
- [`aprovar_consultora`](#aprovar_consultora)
- [`aprovar_consultora_files`](#aprovar_consultora_files)
- [`auditar_financeiro`](#auditar_financeiro)
- [`cadastro_produtos`](#cadastro_produtos)
- [`categoria_insumo`](#categoria_insumo)
- [`compras`](#compras)
- [`compras_files`](#compras_files)
- [`controle_estoque`](#controle_estoque)
- [`deposito`](#deposito)
- [`directus_access`](#directus_access)
- [`directus_activity`](#directus_activity)
- [`directus_collections`](#directus_collections)
- [`directus_collections_backup`](#directus_collections_backup)
- [`directus_comments`](#directus_comments)
- [`directus_dashboards`](#directus_dashboards)
- [`directus_extensions`](#directus_extensions)
- [`directus_fields`](#directus_fields)
- [`directus_files`](#directus_files)
- [`directus_flows`](#directus_flows)
- [`directus_folders`](#directus_folders)
- [`directus_migrations`](#directus_migrations)
- [`directus_notifications`](#directus_notifications)
- [`directus_operations`](#directus_operations)
- [`directus_panels`](#directus_panels)
- [`directus_permissions`](#directus_permissions)
- [`directus_policies`](#directus_policies)
- [`directus_presets`](#directus_presets)
- [`directus_relations`](#directus_relations)
- [`directus_revisions`](#directus_revisions)
- [`directus_roles`](#directus_roles)
- [`directus_sessions`](#directus_sessions)
- [`directus_settings`](#directus_settings)
- [`directus_shares`](#directus_shares)
- [`directus_translations`](#directus_translations)
- [`directus_users`](#directus_users)
- [`directus_versions`](#directus_versions)
- [`directus_webhooks`](#directus_webhooks)
- [`distribuicao`](#distribuicao)
- [`distribuicao_ordens`](#distribuicao_ordens)
- [`distribuicao_ordens_1`](#distribuicao_ordens_1)
- [`fechamento_distribuicao`](#fechamento_distribuicao)
- [`fechamento_distribuicao_files`](#fechamento_distribuicao_files)
- [`fechamento_distribuicao_itens_disttribuicao`](#fechamento_distribuicao_itens_disttribuicao)
- [`fechamento_distribuicao_ordens`](#fechamento_distribuicao_ordens)
- [`fechamento_distribuicao_outros_insumos_distribuicao`](#fechamento_distribuicao_outros_insumos_distribuicao)
- [`fechamento_fabrica`](#fechamento_fabrica)
- [`ficha_tecnica_ordem`](#ficha_tecnica_ordem)
- [`formulario_venda_antiga`](#formulario_venda_antiga)
- [`formulario_venda_antiga_produtos`](#formulario_venda_antiga_produtos)
- [`insumos`](#insumos)
- [`insumos_files`](#insumos_files)
- [`itens_compras`](#itens_compras)
- [`itens_disttribuicao`](#itens_disttribuicao)
- [`itens_disttribuicao_outros_insumos_distribuicao`](#itens_disttribuicao_outros_insumos_distribuicao)
- [`itens_ordem`](#itens_ordem)
- [`itens_ordem_1`](#itens_ordem_1)
- [`itens_ordem_compra`](#itens_ordem_compra)
- [`itens_ordem_compra_files`](#itens_ordem_compra_files)
- [`lancamento_avulso`](#lancamento_avulso)
- [`lancamento_avulso_files`](#lancamento_avulso_files)
- [`logistica`](#logistica)
- [`logistica_ordens`](#logistica_ordens)
- [`ordemCompra`](#ordemCompra)
- [`ordemCompra_produtos`](#ordemCompra_produtos)
- [`ordem_comentario_mencoes`](#ordem_comentario_mencoes)
- [`ordem_comentarios`](#ordem_comentarios)
- [`ordens`](#ordens)
- [`ordens_estoque`](#ordens_estoque)
- [`ordens_files`](#ordens_files)
- [`outros_insumos`](#outros_insumos)
- [`outros_insumos_distribuicao`](#outros_insumos_distribuicao)
- [`pcp`](#pcp)
- [`pcp_fechamento`](#pcp_fechamento)
- [`pcp_teste`](#pcp_teste)
- [`peca_pre_acabada`](#peca_pre_acabada)
- [`peca_pre_acabada_insumos`](#peca_pre_acabada_insumos)
- [`pedras_ordens`](#pedras_ordens)
- [`preparando_entrega`](#preparando_entrega)
- [`produtos_files`](#produtos_files)
- [`produtos_files_1`](#produtos_files_1)
- [`produtos_files_2`](#produtos_files_2)
- [`produtos_files_3`](#produtos_files_3)
- [`protocolo`](#protocolo)
- [`protocolo_files`](#protocolo_files)
- [`protocolo_loja`](#protocolo_loja)
- [`protocolo_loja_files`](#protocolo_loja_files)
- [`protocolo_loja_ordens`](#protocolo_loja_ordens)
- [`protocolo_loja_ordens_1`](#protocolo_loja_ordens_1)
- [`protocolo_ordens`](#protocolo_ordens)
- [`protocolo_ordens_1`](#protocolo_ordens_1)
- [`protocolo_ordens_2`](#protocolo_ordens_2)
- [`protocolo_ordens_3`](#protocolo_ordens_3)
- [`protocolo_ordens_4`](#protocolo_ordens_4)
- [`saida_distribuicao`](#saida_distribuicao)
- [`saida_distribuicao_files`](#saida_distribuicao_files)
- [`saida_distribuicao_itens_disttribuicao`](#saida_distribuicao_itens_disttribuicao)
- [`saida_ordem`](#saida_ordem)
- [`saida_ordem_files`](#saida_ordem_files)
- [`saida_ordem_itens_ordem`](#saida_ordem_itens_ordem)
- [`setor`](#setor)
- [`tipo_apontamento`](#tipo_apontamento)
- [`tipo_ocorrencia`](#tipo_ocorrencia)
- [`transferencia_ordem`](#transferencia_ordem)
- [`transferencia_ordem_itens_ordem`](#transferencia_ordem_itens_ordem)

---

## ai_prompts

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `sort` | integer | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 4 | `user_created` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `user_updated` | uuid | ✓ | — | — |
| 7 | `name` | character varying(255) | ✓ | — | — |
| 8 | `status` | character varying(255) | ✓ | `'draft'::character varying` | — |
| 9 | `description` | text | ✓ | — | — |
| 10 | `system_prompt` | text | ✓ | — | — |
| 11 | `messages` | json | ✓ | — | — |

### Índices

- `ai_prompts_name_index` — `CREATE INDEX ai_prompts_name_index ON directus.ai_prompts USING btree (name)`
- `ai_prompts_name_unique` — `CREATE UNIQUE INDEX ai_prompts_name_unique ON directus.ai_prompts USING btree (name)`

_Sem referência identificada no código._

---

## apontamento

**Aprox. linhas:** 204

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.apontamento_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 7 | `tipo_apontamento` | integer | ✓ | — | — |
| 8 | `deposito` | integer | ✓ | — | — |
| 9 | `insumo` | integer | ✓ | — | — |
| 10 | `setor` | integer | ✓ | — | — |
| 11 | `qtd` | float4 | ✓ | — | — |
| 12 | `pcp_id` | integer | ✓ | — | — |
| 15 | `marcador` | json | ✓ | — | — |

### Triggers

- `trigger_soma_metal` — AFTER INSERT/DELETE/UPDATE → `directus.atualizar_total_metal_pcp` 

**Uso no código:**
- `directus.apontamento` — 59 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/ordens/[id]/OrdemDetalheClient.tsx:588`
  - `src/app/api/distribuicao/[id]/estorno-lote/route.ts:218`
  - `src/app/api/pcp/apontamentos/route.ts:205`
  - `src/app/api/pcp/tipos-apontamento/route.ts:4`
  - `src/app/api/pcp/[id]/atribuir-operador/route.ts:71`

---

## apontamento_distribuicao

**Aprox. linhas:** 186

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.apontamento_distribuicao_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `tipo_apontamento` | integer | ✓ | — | — |
| 7 | `setor` | integer | ✓ | — | — |
| 8 | `deposito` | integer | ✓ | — | — |
| 9 | `insumo` | integer | ✓ | — | — |
| 10 | `qtd` | float4 | ✓ | — | — |
| 12 | `distribuicao_id` | integer | ✓ | — | — |

**Uso no código:**
- `directus.apontamento_distribuicao` — 6 ocorrência(s)
  - `src/app/api/pcp/[id]/historico/route.ts:15`
  - `src/app/api/pcp/[id]/historico/route.ts:102`
  - `src/components/forms/PCPDetalheModal.tsx:39`
  - `src/components/forms/PCPDetalheModal.tsx:456`
  - `src/components/forms/PCPDetalheModal.tsx:479`

---

## apontamento_distribuicao_files

**Aprox. linhas:** 187

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.apontamento_distribuicao_files_id_seq'::regclass)` | — |
| 2 | `apontamento_distribuicao_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## apontamento_files

**Aprox. linhas:** 219

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.apontamento_files_id_seq'::regclass)` | — |
| 2 | `apontamento_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## apontamentos_pote

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.apontamentos_pote_id_seq'::regclass)` | — |
| 2 | `sort` | integer | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 5 | `peso_bruto` | numeric(10,2) | ✓ | — | — |
| 6 | `peso_liquido_calculado` | numeric(10,2) | ✓ | — | — |
| 7 | `foto_balanca` | uuid | ✓ | — | — |
| 9 | `pcp_id` | integer | ✓ | — | — |
| 10 | `deposito_id` | integer | ✓ | — | — |
| 11 | `setor_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## aprovar_consultora

**Aprox. linhas:** 373

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.aprovar_consultora_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `etapas` | character varying(255) | — | `NULL::character varying` | — |
| 7 | `ordem_id` | integer | ✓ | — | — |
| 8 | `consultora_id` | bigint | ✓ | — | — |
| 9 | `data_conclusao` | timestamp with time zone | ✓ | — | — |

### Triggers

- `trg_concl_preparando` — BEFORE INSERT/UPDATE → `directus.fn_atualizar_conclusao_universal` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `frontend` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## aprovar_consultora_files

**Aprox. linhas:** 343

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.aprovar_consultora_files_id_seq'::regclass)` | — |
| 2 | `aprovar_consultora_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## auditar_financeiro

**Aprox. linhas:** 830

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.auditar_financeiro_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `situacao` | character varying(255) | ✓ | — | 1: em andamento 2: concluida |
| 8 | `ordem_id` | integer | ✓ | — | — |
| 9 | `rota_processo` | character varying(255) | ✓ | — | — |
| 10 | `tipo_auditoria` | character varying(255) | ✓ | — | — |
| 11 | `data_conclusao` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `auditar_financeiro_pkey` — (`id`)

### Triggers

- `trg_concl_financeiro` — BEFORE UPDATE → `directus.fn_atualizar_conclusao_universal` 
- `trg_concl_preparando` — BEFORE INSERT/UPDATE → `directus.fn_atualizar_conclusao_universal` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `frontend` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## cadastro_produtos

**Aprox. linhas:** 5

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.cadastro_produtos_id_seq'::regclass)` | — |
| 2 | `status` | character varying(255) | — | `'draft'::character varying` | — |
| 3 | `sort` | integer | ✓ | — | — |
| 4 | `user_created` | uuid | ✓ | — | — |
| 5 | `date_created` | timestamp with time zone | ✓ | — | — |
| 6 | `user_updated` | uuid | ✓ | — | — |
| 7 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 8 | `nome` | character varying(255) | ✓ | — | — |
| 10 | `sku` | character varying(255) | ✓ | — | — |
| 11 | `tipo` | character varying(255) | ✓ | `NULL::character varying` | — |
| 12 | `ncm` | bigint | ✓ | — | — |
| 13 | `localizacao` | character varying(255) | ✓ | — | — |
| 14 | `sobEncomenda` | character varying(255) | ✓ | — | — |
| 16 | `tamanhos` | json | ✓ | — | — |
| 17 | `tipo_variacao` | character varying(255) | ✓ | — | — |
| 18 | `letras` | json | ✓ | — | — |
| 19 | `estoque_inicial` | integer | ✓ | — | — |
| 20 | `estoque_minimo` | integer | ✓ | — | — |
| 21 | `estoque_maximo` | integer | ✓ | — | — |
| 22 | `dias_preparacao` | integer | ✓ | — | — |
| 23 | `unidade_medida` | character varying(255) | ✓ | — | — |
| 27 | `tipo_pedra` | character varying(255) | ✓ | — | — |
| 28 | `Prazo_garantia` | integer | ✓ | — | — |
| 29 | `peso` | numeric(10,5) | ✓ | — | — |
| 30 | `ficha_tecnica` | uuid | ✓ | — | — |
| 31 | `origem_producao` | character varying(255) | ✓ | — | — |
| 32 | `fator` | numeric(10,2) | ✓ | — | — |
| 35 | `caregorias` | bigint | ✓ | — | — |
| 36 | `subCategoria` | bigint | ✓ | — | — |

_Sem referência identificada no código._

---

## categoria_insumo

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.categoria_insumo_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `nome` | character varying(255) | ✓ | — | — |
| 7 | `descricao` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `categoria_insumo_pkey` — (`id`)

_Sem referência identificada no código._

---

## compras

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.compras_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `fornecedor_id` | bigint | ✓ | — | — |
| 7 | `situacao` | character varying(255) | ✓ | — | — |
| 8 | `data_hora` | timestamp without time zone | ✓ | — | — |
| 9 | `deposito_id` | integer | ✓ | — | — |
| 11 | `obs` | text | ✓ | — | — |
| 12 | `data_conlusao` | character varying(255) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `compras_pkey` — (`id`)

**Uso no código:**
- `directus.compras` — 68 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/compras/page.tsx:26`
  - `src/app/(dashboard)/compras/page.tsx:28`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1826`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1841`
  - `src/app/api/compras/fornecedores/route.ts:4`

---

## compras_files

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.compras_files_id_seq'::regclass)` | — |
| 2 | `compras_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## controle_estoque

**Aprox. linhas:** 1877

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.controle_estoque_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `entrada` | float4 | ✓ | — | — |
| 7 | `saida` | float4 | ✓ | — | — |
| 9 | `data_hora` | timestamp without time zone | ✓ | — | — |
| 10 | `valor_total` | numeric(10,5) | ✓ | — | — |
| 11 | `obs` | text | ✓ | — | — |
| 12 | `preco_compra` | numeric(10,5) | ✓ | — | — |
| 13 | `insumo_id` | integer | ✓ | — | — |
| 14 | `deposito_id` | integer | ✓ | — | — |
| 15 | `setor` | integer | ✓ | — | — |
| 16 | `marcador` | character varying(255) | ✓ | — | — |
| 17 | `ordem_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `controle_estoque_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Alisson ERP` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `directus.controle_estoque` — 8 ocorrência(s)
  - `scripts/diag_estoque.js:48`
  - `scripts/diag_estoque.js:51`
  - `scripts/generate-schema-doc.mjs:332`
  - `scripts/pre_migration_check.mjs:115`
  - `scripts/pre_reset_check.mjs:21`

---

## deposito

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.deposito_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `nome` | character varying(255) | ✓ | — | — |
| 7 | `tipo` | character varying(255) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `deposito_pkey` — (`id`)

**Uso no código:**
- `directus.deposito` — 13 ocorrência(s)
  - `src/app/api/pcp/buscar/route.ts:35`
  - `src/app/api/pcp/[id]/atribuir-operador/route.ts:58`
  - `src/app/api/pcp/[id]/atribuir-operador/route.ts:64`
  - `src/app/api/pcp/[id]/atribuir-operador/route.ts:106`
  - `src/app/api/service/[id]/apontar/route.ts:107`

---

## directus_access

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `role` | uuid | ✓ | — | — |
| 3 | `user` | uuid | ✓ | — | — |
| 4 | `policy` | uuid | — | — | — |
| 5 | `sort` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_access_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_activity

**Aprox. linhas:** 122855

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.directus_activity_id_seq'::regclass)` | — |
| 2 | `action` | character varying(45) | — | — | — |
| 3 | `user` | uuid | ✓ | — | — |
| 4 | `timestamp` | timestamp with time zone | — | `CURRENT_TIMESTAMP` | — |
| 5 | `ip` | character varying(50) | ✓ | — | — |
| 6 | `user_agent` | text | ✓ | — | — |
| 7 | `collection` | character varying(64) | — | — | — |
| 8 | `item` | character varying(255) | — | — | — |
| 10 | `origin` | character varying(255) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_activity_pkey` — (`id`)

### Índices

- `directus_activity_timestamp_index` — `CREATE INDEX directus_activity_timestamp_index ON directus.directus_activity USING btree ("timestamp")`

_Sem referência identificada no código._

---

## directus_collections

**Aprox. linhas:** 140

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `collection` | character varying(64) | — | — | — |
| 2 | `icon` | character varying(64) | ✓ | — | — |
| 3 | `note` | text | ✓ | — | — |
| 4 | `display_template` | character varying(255) | ✓ | — | — |
| 5 | `hidden` | boolean | — | `false` | — |
| 6 | `singleton` | boolean | — | `false` | — |
| 7 | `translations` | json | ✓ | — | — |
| 8 | `archive_field` | character varying(64) | ✓ | — | — |
| 9 | `archive_app_filter` | boolean | — | `true` | — |
| 10 | `archive_value` | character varying(255) | ✓ | — | — |
| 11 | `unarchive_value` | character varying(255) | ✓ | — | — |
| 12 | `sort_field` | character varying(64) | ✓ | — | — |
| 13 | `accountability` | character varying(255) | ✓ | `'all'::character varying` | — |
| 14 | `color` | character varying(255) | ✓ | — | — |
| 15 | `item_duplication_fields` | json | ✓ | — | — |
| 16 | `sort` | integer | ✓ | — | — |
| 17 | `group` | character varying(64) | ✓ | — | — |
| 18 | `collapse` | character varying(255) | — | `'open'::character varying` | — |
| 19 | `preview_url` | character varying(255) | ✓ | — | — |
| 20 | `versioning` | boolean | — | `false` | — |

### Chaves

- **PRIMARY KEY** `directus_collections_pkey` — (`collection`)

_Sem referência identificada no código._

---

## directus_collections_backup

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `collection` | character varying(64) | ✓ | — | — |
| 2 | `icon` | character varying(64) | ✓ | — | — |
| 3 | `note` | text | ✓ | — | — |
| 4 | `display_template` | character varying(255) | ✓ | — | — |
| 5 | `hidden` | boolean | ✓ | — | — |
| 6 | `singleton` | boolean | ✓ | — | — |
| 7 | `translations` | json | ✓ | — | — |
| 8 | `archive_field` | character varying(64) | ✓ | — | — |
| 9 | `archive_app_filter` | boolean | ✓ | — | — |
| 10 | `archive_value` | character varying(255) | ✓ | — | — |
| 11 | `unarchive_value` | character varying(255) | ✓ | — | — |
| 12 | `sort_field` | character varying(64) | ✓ | — | — |
| 13 | `accountability` | character varying(255) | ✓ | — | — |
| 14 | `color` | character varying(255) | ✓ | — | — |
| 15 | `item_duplication_fields` | json | ✓ | — | — |
| 16 | `sort` | integer | ✓ | — | — |
| 17 | `group` | character varying(64) | ✓ | — | — |
| 18 | `collapse` | character varying(255) | ✓ | — | — |
| 19 | `preview_url` | character varying(255) | ✓ | — | — |
| 20 | `versioning` | boolean | ✓ | — | — |

_Sem referência identificada no código._

---

## directus_comments

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `collection` | character varying(64) | — | — | — |
| 3 | `item` | character varying(255) | — | — | — |
| 4 | `comment` | text | — | — | — |
| 5 | `date_created` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 6 | `date_updated` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 7 | `user_created` | uuid | ✓ | — | — |
| 8 | `user_updated` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_comments_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_dashboards

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `name` | character varying(255) | — | — | — |
| 3 | `icon` | character varying(64) | — | `'dashboard'::character varying` | — |
| 4 | `note` | text | ✓ | — | — |
| 5 | `date_created` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 6 | `user_created` | uuid | ✓ | — | — |
| 7 | `color` | character varying(255) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_dashboards_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_extensions

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 2 | `enabled` | boolean | — | `true` | — |
| 3 | `id` | uuid | — | — | — |
| 4 | `folder` | character varying(255) | — | — | — |
| 5 | `source` | character varying(255) | — | — | — |
| 6 | `bundle` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_extensions_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_fields

**Aprox. linhas:** 861

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.directus_fields_id_seq'::regclass)` | — |
| 2 | `collection` | character varying(64) | — | — | — |
| 3 | `field` | character varying(64) | — | — | — |
| 4 | `special` | character varying(64) | ✓ | — | — |
| 5 | `interface` | character varying(64) | ✓ | — | — |
| 6 | `options` | json | ✓ | — | — |
| 7 | `display` | character varying(64) | ✓ | — | — |
| 8 | `display_options` | json | ✓ | — | — |
| 10 | `readonly` | boolean | — | `false` | — |
| 11 | `hidden` | boolean | — | `false` | — |
| 12 | `sort` | integer | ✓ | — | — |
| 13 | `width` | character varying(30) | ✓ | `'full'::character varying` | — |
| 15 | `translations` | json | ✓ | — | — |
| 16 | `note` | text | ✓ | — | — |
| 17 | `conditions` | json | ✓ | — | — |
| 18 | `required` | boolean | ✓ | `false` | — |
| 19 | `group` | character varying(64) | ✓ | — | — |
| 20 | `validation` | json | ✓ | — | — |
| 21 | `validation_message` | text | ✓ | — | — |
| 22 | `searchable` | boolean | — | `true` | — |

### Chaves

- **PRIMARY KEY** `directus_fields_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_files

**Aprox. linhas:** 4903

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `storage` | character varying(255) | — | — | — |
| 3 | `filename_disk` | character varying(255) | ✓ | — | — |
| 4 | `filename_download` | character varying(255) | — | — | — |
| 5 | `title` | character varying(255) | ✓ | — | — |
| 6 | `type` | character varying(255) | ✓ | — | — |
| 7 | `folder` | uuid | ✓ | — | — |
| 8 | `uploaded_by` | uuid | ✓ | — | — |
| 9 | `created_on` | timestamp with time zone | — | `CURRENT_TIMESTAMP` | — |
| 10 | `modified_by` | uuid | ✓ | — | — |
| 11 | `modified_on` | timestamp with time zone | — | `CURRENT_TIMESTAMP` | — |
| 12 | `charset` | character varying(50) | ✓ | — | — |
| 13 | `filesize` | bigint | ✓ | — | — |
| 14 | `width` | integer | ✓ | — | — |
| 15 | `height` | integer | ✓ | — | — |
| 16 | `duration` | integer | ✓ | — | — |
| 17 | `embed` | character varying(200) | ✓ | — | — |
| 18 | `description` | text | ✓ | — | — |
| 19 | `location` | text | ✓ | — | — |
| 20 | `tags` | text | ✓ | — | — |
| 21 | `metadata` | json | ✓ | — | — |
| 22 | `focal_point_x` | integer | ✓ | — | — |
| 23 | `focal_point_y` | integer | ✓ | — | — |
| 24 | `tus_id` | character varying(64) | ✓ | — | — |
| 25 | `tus_data` | json | ✓ | — | — |
| 26 | `uploaded_on` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_files_pkey` — (`id`)

**Uso no código:**
- `directus.directus_files` — 2 ocorrência(s)
  - `supabase/migrations/185_produto_imagens.sql:23`
  - `supabase/migrations/185_produto_imagens.sql:41`

---

## directus_flows

**Aprox. linhas:** 35

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `name` | character varying(255) | — | — | — |
| 3 | `icon` | character varying(64) | ✓ | — | — |
| 4 | `color` | character varying(255) | ✓ | — | — |
| 5 | `description` | text | ✓ | — | — |
| 6 | `status` | character varying(255) | — | `'active'::character varying` | — |
| 7 | `trigger` | character varying(255) | ✓ | — | — |
| 8 | `accountability` | character varying(255) | ✓ | `'all'::character varying` | — |
| 9 | `options` | json | ✓ | — | — |
| 10 | `operation` | uuid | ✓ | — | — |
| 11 | `date_created` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 12 | `user_created` | uuid | ✓ | — | — |

### Chaves

- **UNIQUE** `directus_flows_operation_unique` — (`operation`)
- **PRIMARY KEY** `directus_flows_pkey` — (`id`)

### Índices

- `directus_flows_operation_unique` — `CREATE UNIQUE INDEX directus_flows_operation_unique ON directus.directus_flows USING btree (operation)`

_Sem referência identificada no código._

---

## directus_folders

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `name` | character varying(255) | — | — | — |
| 3 | `parent` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_folders_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_migrations

**Aprox. linhas:** 90

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `version` | character varying(255) | — | — | — |
| 2 | `name` | character varying(255) | — | — | — |
| 3 | `timestamp` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |

### Chaves

- **PRIMARY KEY** `directus_migrations_pkey` — (`version`)

_Sem referência identificada no código._

---

## directus_notifications

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.directus_notifications_id_seq'::regclass)` | — |
| 2 | `timestamp` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 3 | `status` | character varying(255) | ✓ | `'inbox'::character varying` | — |
| 4 | `recipient` | uuid | — | — | — |
| 5 | `sender` | uuid | ✓ | — | — |
| 6 | `subject` | character varying(255) | — | — | — |
| 7 | `message` | text | ✓ | — | — |
| 8 | `collection` | character varying(64) | ✓ | — | — |
| 9 | `item` | character varying(255) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_notifications_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_operations

**Aprox. linhas:** 355

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `name` | character varying(255) | ✓ | — | — |
| 3 | `key` | character varying(255) | — | — | — |
| 4 | `type` | character varying(255) | — | — | — |
| 5 | `position_x` | integer | — | — | — |
| 6 | `position_y` | integer | — | — | — |
| 7 | `options` | json | ✓ | — | — |
| 8 | `resolve` | uuid | ✓ | — | — |
| 9 | `reject` | uuid | ✓ | — | — |
| 10 | `flow` | uuid | — | — | — |
| 11 | `date_created` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 12 | `user_created` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_operations_pkey` — (`id`)
- **UNIQUE** `directus_operations_reject_unique` — (`reject`)
- **UNIQUE** `directus_operations_resolve_unique` — (`resolve`)

### Índices

- `directus_operations_reject_unique` — `CREATE UNIQUE INDEX directus_operations_reject_unique ON directus.directus_operations USING btree (reject)`
- `directus_operations_resolve_unique` — `CREATE UNIQUE INDEX directus_operations_resolve_unique ON directus.directus_operations USING btree (resolve)`

_Sem referência identificada no código._

---

## directus_panels

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `dashboard` | uuid | — | — | — |
| 3 | `name` | character varying(255) | ✓ | — | — |
| 4 | `icon` | character varying(64) | ✓ | `NULL::character varying` | — |
| 5 | `color` | character varying(10) | ✓ | — | — |
| 6 | `show_header` | boolean | — | `false` | — |
| 7 | `note` | text | ✓ | — | — |
| 8 | `type` | character varying(255) | — | — | — |
| 9 | `position_x` | integer | — | — | — |
| 10 | `position_y` | integer | — | — | — |
| 11 | `width` | integer | — | — | — |
| 12 | `height` | integer | — | — | — |
| 13 | `options` | json | ✓ | — | — |
| 14 | `date_created` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 15 | `user_created` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_panels_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_permissions

**Aprox. linhas:** 836

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.directus_permissions_id_seq'::regclass)` | — |
| 3 | `collection` | character varying(64) | — | — | — |
| 4 | `action` | character varying(10) | — | — | — |
| 5 | `permissions` | json | ✓ | — | — |
| 6 | `validation` | json | ✓ | — | — |
| 7 | `presets` | json | ✓ | — | — |
| 8 | `fields` | text | ✓ | — | — |
| 10 | `policy` | uuid | — | — | — |

### Chaves

- **PRIMARY KEY** `directus_permissions_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_policies

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `name` | character varying(100) | — | — | — |
| 3 | `icon` | character varying(64) | — | `'badge'::character varying` | — |
| 4 | `description` | text | ✓ | — | — |
| 5 | `ip_access` | text | ✓ | — | — |
| 6 | `enforce_tfa` | boolean | — | `false` | — |
| 7 | `admin_access` | boolean | — | `false` | — |
| 8 | `app_access` | boolean | — | `false` | — |

### Chaves

- **PRIMARY KEY** `directus_policies_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_presets

**Aprox. linhas:** 238

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.directus_presets_id_seq'::regclass)` | — |
| 2 | `bookmark` | character varying(255) | ✓ | — | — |
| 3 | `user` | uuid | ✓ | — | — |
| 4 | `role` | uuid | ✓ | — | — |
| 5 | `collection` | character varying(64) | ✓ | — | — |
| 6 | `search` | character varying(100) | ✓ | — | — |
| 8 | `layout` | character varying(100) | ✓ | `'tabular'::character varying` | — |
| 9 | `layout_query` | json | ✓ | — | — |
| 10 | `layout_options` | json | ✓ | — | — |
| 11 | `refresh_interval` | integer | ✓ | — | — |
| 12 | `filter` | json | ✓ | — | — |
| 13 | `icon` | character varying(64) | ✓ | `'bookmark'::character varying` | — |
| 14 | `color` | character varying(255) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_presets_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_relations

**Aprox. linhas:** 134

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.directus_relations_id_seq'::regclass)` | — |
| 2 | `many_collection` | character varying(64) | — | — | — |
| 3 | `many_field` | character varying(64) | — | — | — |
| 5 | `one_collection` | character varying(64) | ✓ | — | — |
| 6 | `one_field` | character varying(64) | ✓ | — | — |
| 8 | `one_collection_field` | character varying(64) | ✓ | — | — |
| 9 | `one_allowed_collections` | text | ✓ | — | — |
| 10 | `junction_field` | character varying(64) | ✓ | — | — |
| 11 | `sort_field` | character varying(64) | ✓ | — | — |
| 12 | `one_deselect_action` | character varying(255) | — | `'nullify'::character varying` | — |

### Chaves

- **PRIMARY KEY** `directus_relations_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_revisions

**Aprox. linhas:** 111093

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.directus_revisions_id_seq'::regclass)` | — |
| 2 | `activity` | integer | — | — | — |
| 3 | `collection` | character varying(64) | — | — | — |
| 4 | `item` | character varying(255) | — | — | — |
| 5 | `data` | json | ✓ | — | — |
| 6 | `delta` | json | ✓ | — | — |
| 7 | `parent` | integer | ✓ | — | — |
| 8 | `version` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_revisions_pkey` — (`id`)

### Índices

- `directus_revisions_parent_index` — `CREATE INDEX directus_revisions_parent_index ON directus.directus_revisions USING btree (parent)`

_Sem referência identificada no código._

---

## directus_roles

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `name` | character varying(100) | — | — | — |
| 3 | `icon` | character varying(64) | — | `'supervised_user_circle'::character varying` | — |
| 4 | `description` | text | ✓ | — | — |
| 11 | `parent` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_roles_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_sessions

**Aprox. linhas:** 12

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `token` | character varying(64) | — | — | — |
| 2 | `user` | uuid | ✓ | — | — |
| 3 | `expires` | timestamp with time zone | — | — | — |
| 4 | `ip` | character varying(255) | ✓ | — | — |
| 5 | `user_agent` | text | ✓ | — | — |
| 7 | `share` | uuid | ✓ | — | — |
| 8 | `origin` | character varying(255) | ✓ | — | — |
| 9 | `next_token` | character varying(64) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_sessions_pkey` — (`token`)

_Sem referência identificada no código._

---

## directus_settings

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.directus_settings_id_seq'::regclass)` | — |
| 2 | `project_name` | character varying(100) | — | `'Directus'::character varying` | — |
| 3 | `project_url` | character varying(255) | ✓ | — | — |
| 4 | `project_color` | character varying(255) | — | `'#6644FF'::character varying` | — |
| 5 | `project_logo` | uuid | ✓ | — | — |
| 6 | `public_foreground` | uuid | ✓ | — | — |
| 7 | `public_background` | uuid | ✓ | — | — |
| 8 | `public_note` | text | ✓ | — | — |
| 9 | `auth_login_attempts` | integer | ✓ | `25` | — |
| 10 | `auth_password_policy` | character varying(100) | ✓ | — | — |
| 11 | `storage_asset_transform` | character varying(7) | ✓ | `'all'::character varying` | — |
| 12 | `storage_asset_presets` | json | ✓ | — | — |
| 13 | `custom_css` | text | ✓ | — | — |
| 14 | `storage_default_folder` | uuid | ✓ | — | — |
| 15 | `basemaps` | json | ✓ | — | — |
| 16 | `mapbox_key` | character varying(255) | ✓ | — | — |
| 17 | `module_bar` | json | ✓ | — | — |
| 18 | `project_descriptor` | character varying(100) | ✓ | — | — |
| 20 | `default_language` | character varying(255) | — | `'en-US'::character varying` | — |
| 21 | `custom_aspect_ratios` | json | ✓ | — | — |
| 22 | `public_favicon` | uuid | ✓ | — | — |
| 23 | `default_appearance` | character varying(255) | — | `'auto'::character varying` | — |
| 24 | `default_theme_light` | character varying(255) | ✓ | — | — |
| 25 | `theme_light_overrides` | json | ✓ | — | — |
| 26 | `default_theme_dark` | character varying(255) | ✓ | — | — |
| 27 | `theme_dark_overrides` | json | ✓ | — | — |
| 28 | `report_error_url` | character varying(255) | ✓ | — | — |
| 29 | `report_bug_url` | character varying(255) | ✓ | — | — |
| 30 | `report_feature_url` | character varying(255) | ✓ | — | — |
| 31 | `public_registration` | boolean | — | `false` | — |
| 32 | `public_registration_verify_email` | boolean | — | `true` | — |
| 33 | `public_registration_role` | uuid | ✓ | — | — |
| 34 | `public_registration_email_filter` | json | ✓ | — | — |
| 35 | `visual_editor_urls` | json | ✓ | — | — |
| 37 | `project_id` | uuid | ✓ | — | — |
| 38 | `mcp_enabled` | boolean | — | `false` | — |
| 39 | `mcp_allow_deletes` | boolean | — | `false` | — |
| 40 | `mcp_prompts_collection` | character varying(255) | ✓ | `NULL::character varying` | — |
| 41 | `mcp_system_prompt_enabled` | boolean | — | `true` | — |
| 42 | `mcp_system_prompt` | text | ✓ | — | — |
| 43 | `project_owner` | character varying(255) | ✓ | — | — |
| 44 | `project_usage` | character varying(255) | ✓ | — | — |
| 45 | `org_name` | character varying(255) | ✓ | — | — |
| 46 | `product_updates` | boolean | ✓ | — | — |
| 47 | `project_status` | character varying(255) | ✓ | — | — |
| 48 | `ai_openai_api_key` | text | ✓ | — | — |
| 49 | `ai_anthropic_api_key` | text | ✓ | — | — |
| 50 | `ai_system_prompt` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_settings_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_shares

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `name` | character varying(255) | ✓ | — | — |
| 3 | `collection` | character varying(64) | — | — | — |
| 4 | `item` | character varying(255) | — | — | — |
| 5 | `role` | uuid | ✓ | — | — |
| 6 | `password` | character varying(255) | ✓ | — | — |
| 7 | `user_created` | uuid | ✓ | — | — |
| 8 | `date_created` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 9 | `date_start` | timestamp with time zone | ✓ | — | — |
| 10 | `date_end` | timestamp with time zone | ✓ | — | — |
| 11 | `times_used` | integer | ✓ | `0` | — |
| 12 | `max_uses` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_shares_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_translations

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `language` | character varying(255) | — | — | — |
| 3 | `key` | character varying(255) | — | — | — |
| 4 | `value` | text | — | — | — |

### Chaves

- **PRIMARY KEY** `directus_translations_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_users

**Aprox. linhas:** 33

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `first_name` | character varying(50) | ✓ | — | — |
| 3 | `last_name` | character varying(50) | ✓ | — | — |
| 4 | `email` | character varying(128) | ✓ | — | — |
| 5 | `password` | character varying(255) | ✓ | — | — |
| 6 | `location` | character varying(255) | ✓ | — | — |
| 7 | `title` | character varying(50) | ✓ | — | — |
| 8 | `description` | text | ✓ | — | — |
| 9 | `tags` | json | ✓ | — | — |
| 10 | `avatar` | uuid | ✓ | — | — |
| 11 | `language` | character varying(255) | ✓ | `NULL::character varying` | — |
| 13 | `tfa_secret` | character varying(255) | ✓ | — | — |
| 14 | `status` | character varying(16) | — | `'active'::character varying` | — |
| 15 | `role` | uuid | ✓ | — | — |
| 16 | `token` | character varying(255) | ✓ | — | — |
| 17 | `last_access` | timestamp with time zone | ✓ | — | — |
| 18 | `last_page` | character varying(255) | ✓ | — | — |
| 19 | `provider` | character varying(128) | — | `'default'::character varying` | — |
| 20 | `external_identifier` | character varying(255) | ✓ | — | — |
| 21 | `auth_data` | json | ✓ | — | — |
| 22 | `email_notifications` | boolean | ✓ | `true` | — |
| 23 | `appearance` | character varying(255) | ✓ | — | — |
| 24 | `theme_dark` | character varying(255) | ✓ | — | — |
| 25 | `theme_light` | character varying(255) | ✓ | — | — |
| 26 | `theme_light_overrides` | json | ✓ | — | — |
| 27 | `theme_dark_overrides` | json | ✓ | — | — |
| 28 | `text_direction` | character varying(255) | — | `'auto'::character varying` | — |

### Chaves

- **UNIQUE** `directus_users_email_unique` — (`email`)
- **UNIQUE** `directus_users_external_identifier_unique` — (`external_identifier`)
- **PRIMARY KEY** `directus_users_pkey` — (`id`)
- **UNIQUE** `directus_users_token_unique` — (`token`)

### Índices

- `directus_users_email_unique` — `CREATE UNIQUE INDEX directus_users_email_unique ON directus.directus_users USING btree (email)`
- `directus_users_external_identifier_unique` — `CREATE UNIQUE INDEX directus_users_external_identifier_unique ON directus.directus_users USING btree (external_identifier)`
- `directus_users_token_unique` — `CREATE UNIQUE INDEX directus_users_token_unique ON directus.directus_users USING btree (token)`

_Sem referência identificada no código._

---

## directus_versions

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `key` | character varying(64) | — | — | — |
| 3 | `name` | character varying(255) | ✓ | — | — |
| 4 | `collection` | character varying(64) | — | — | — |
| 5 | `item` | character varying(255) | — | — | — |
| 6 | `hash` | character varying(255) | ✓ | — | — |
| 7 | `date_created` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 8 | `date_updated` | timestamp with time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 9 | `user_created` | uuid | ✓ | — | — |
| 10 | `user_updated` | uuid | ✓ | — | — |
| 11 | `delta` | json | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_versions_pkey` — (`id`)

_Sem referência identificada no código._

---

## directus_webhooks

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.directus_webhooks_id_seq'::regclass)` | — |
| 2 | `name` | character varying(255) | — | — | — |
| 3 | `method` | character varying(10) | — | `'POST'::character varying` | — |
| 4 | `url` | character varying(255) | — | — | — |
| 5 | `status` | character varying(10) | — | `'active'::character varying` | — |
| 6 | `data` | boolean | — | `true` | — |
| 7 | `actions` | character varying(100) | — | — | — |
| 8 | `collections` | character varying(255) | — | — | — |
| 9 | `headers` | json | ✓ | — | — |
| 10 | `was_active_before_deprecation` | boolean | — | `false` | — |
| 11 | `migrated_flow` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `directus_webhooks_pkey` — (`id`)

_Sem referência identificada no código._

---

## distribuicao

**Aprox. linhas:** 89

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.distribuicao_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `etapas` | character varying(255) | ✓ | `'1'::character varying` | — |
| 7 | `saida` | integer | ✓ | — | — |
| 8 | `total_metal` | float4 | ✓ | `'0'::real` | — |
| 9 | `retorno_metal` | float4 | ✓ | `'0'::real` | — |
| 10 | `total_pedras_un` | float4 | ✓ | `'0'::real` | — |
| 13 | `total_geral_outros_pesos` | float4 | ✓ | `'0'::real` | — |
| 14 | `total_outros_pesos` | float4 | ✓ | `'0'::real` | — |
| 15 | `porcentagem_de_quebra` | float4 | ✓ | `'0'::real` | — |
| 16 | `quebra` | float4 | ✓ | `'0'::real` | — |
| 17 | `pmc` | float4 | ✓ | `'0'::real` | — |
| 18 | `total_pedras_g` | float4 | ✓ | `'0'::real` | — |
| 19 | `peso_final` | float4 | ✓ | `'0'::real` | — |
| 20 | `setor` | character varying(255) | ✓ | — | — |
| 21 | `operador` | uuid | ✓ | — | — |

**Uso no código:**
- `directus.distribuicao` — 83 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1821`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1840`
  - `src/app/api/configuracoes/permissoes/route.ts:34`
  - `src/app/api/configuracoes/permissoes/route.ts:43`
  - `src/app/api/configuracoes/permissoes/route.ts:52`

---

## distribuicao_ordens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.distribuicao_ordens_id_seq'::regclass)` | — |
| 2 | `distribuicao_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |

**Uso no código:**
- `directus.distribuicao_ordens` — 23 ocorrência(s)
  - `src/app/api/distribuicao/[id]/estorno/route.ts:18`
  - `src/app/api/distribuicao/[id]/estorno/route.ts:208`
  - `src/app/api/distribuicao/[id]/estorno-lote/route.ts:16`
  - `src/app/api/distribuicao/[id]/estorno-lote/route.ts:254`
  - `src/app/api/distribuicao/[id]/saida/route.ts:174`

---

## distribuicao_ordens_1

**Aprox. linhas:** 157

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.distribuicao_ordens_1_id_seq'::regclass)` | — |
| 2 | `distribuicao_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## fechamento_distribuicao

**Aprox. linhas:** 146

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.fechamento_distribuicao_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `peso` | float4 | ✓ | — | — |
| 7 | `distribuicao_id` | integer | ✓ | — | — |
| 8 | `ordem_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## fechamento_distribuicao_files

**Aprox. linhas:** 109

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.fechamento_distribuicao_files_id_seq'::regclass)` | — |
| 2 | `fechamento_distribuicao_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## fechamento_distribuicao_itens_disttribuicao

**Aprox. linhas:** 29

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.fechamento_distribuicao_itens_disttribuicao_id_seq'::regclass)` | — |
| 2 | `fechamento_distribuicao_id` | integer | ✓ | — | — |
| 3 | `itens_disttribuicao_id` | integer | ✓ | — | — |
| 4 | `quantidade_utilizada` | float4 | ✓ | — | — |

_Sem referência identificada no código._

---

## fechamento_distribuicao_ordens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.fechamento_distribuicao_ordens_id_seq'::regclass)` | — |
| 2 | `fechamento_distribuicao_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## fechamento_distribuicao_outros_insumos_distribuicao

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.fechamento_distribuicao_outros_insumos_distribuicao_id_seq'...` | — |
| 2 | `fechamento_distribuicao_id` | integer | ✓ | — | — |
| 3 | `outros_insumos_distribuicao_id` | integer | ✓ | — | — |
| 4 | `peso` | float4 | ✓ | — | — |

_Sem referência identificada no código._

---

## fechamento_fabrica

**Aprox. linhas:** 465

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.fechamento_fabrica_id_seq'::regclass)` | — |
| 2 | `sort` | integer | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 5 | `setor_id` | integer | ✓ | — | — |
| 6 | `deposito_id` | integer | ✓ | — | — |
| 7 | `entrada` | numeric(10,2) | ✓ | `NULL::numeric` | — |
| 8 | `saida` | numeric(10,2) | ✓ | `NULL::numeric` | — |
| 9 | `quebra` | numeric(10,2) | ✓ | `NULL::numeric` | — |
| 10 | `data_hora` | timestamp with time zone | ✓ | — | — |
| 12 | `quebra_percentual` | numeric | ✓ | — | — |
| 13 | `ids_processados` | _jsonb | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `fechamento_fabrica_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `alisson_erp` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## ficha_tecnica_ordem

**Aprox. linhas:** 130

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.ficha_tecnica_ordem_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `milimetragem_1` | float4 | ✓ | — | — |
| 7 | `milimetragem_2` | float4 | ✓ | — | — |
| 8 | `numeracao` | float4 | ✓ | — | — |
| 9 | `numeracao_2` | float4 | ✓ | — | — |
| 10 | `modelo_1` | character varying(255) | ✓ | — | — |
| 11 | `modelo_2` | character varying(255) | ✓ | `NULL::character varying` | — |
| 12 | `modelo_interno_1` | character varying(255) | ✓ | — | — |
| 13 | `modelo_interno_2` | character varying(255) | ✓ | `NULL::character varying` | — |
| 14 | `tipo_fonte_1` | character varying(255) | ✓ | — | — |
| 15 | `tipo_fonte_2` | character varying(255) | ✓ | `NULL::character varying` | — |
| 16 | `comprimento` | float4 | ✓ | — | — |
| 17 | `outro_modelo_1` | character varying(255) | ✓ | — | — |
| 18 | `outro_modelo_2` | character varying(255) | ✓ | `NULL::character varying` | — |
| 19 | `texto_tipo_fonte_2` | character varying(255) | ✓ | — | — |
| 20 | `tipo_elo` | character varying(255) | ✓ | — | — |
| 21 | `outro_tipo_elo` | character varying(255) | ✓ | — | — |
| 22 | `tipo_fecho` | character varying(255) | ✓ | — | — |
| 23 | `outro_tipo_fecho` | character varying(255) | ✓ | — | — |
| 24 | `modelo_anel` | character varying(255) | ✓ | — | — |
| 25 | `milimetragem_da_base` | float4 | ✓ | — | — |
| 26 | `milimetragem_do_aro` | float4 | ✓ | — | — |
| 27 | `modelo_interno_anel` | character varying(255) | ✓ | — | — |
| 28 | `modelo_externo_anel` | character varying(255) | ✓ | `NULL::character varying` | — |
| 29 | `modelo_pingente` | character varying(255) | ✓ | — | — |
| 30 | `Outro_modelo_pingente` | character varying(255) | ✓ | — | — |
| 31 | `Altura_pingente` | float4 | ✓ | — | — |
| 32 | `largura_pingente` | float4 | ✓ | — | — |
| 33 | `modelo_bracelete` | character varying(255) | ✓ | — | — |
| 35 | `altura_placa` | float4 | ✓ | — | — |
| 36 | `largura_placa` | float4 | ✓ | — | — |
| 37 | `expessura_chapa` | float4 | ✓ | — | — |
| 38 | `tipo_tarraxa` | character varying(255) | ✓ | — | — |
| 39 | `nome_chapa` | character varying(255) | ✓ | — | — |
| 40 | `texto_tipo_fonte_1` | character varying(255) | ✓ | `NULL::character varying` | — |

### Chaves

- **PRIMARY KEY** `ficha_tecnica_ordem_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## formulario_venda_antiga

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.formulario_venda_antiga_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 7 | `cliente` | bigint | ✓ | — | — |
| 8 | `data_venda` | timestamp without time zone | ✓ | — | — |
| 9 | `consultor` | bigint | ✓ | — | — |
| 10 | `total_venda` | float4 | ✓ | — | — |

_Sem referência identificada no código._

---

## formulario_venda_antiga_produtos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.formulario_venda_antiga_produtos_id_seq'::regclass)` | — |
| 2 | `formulario_venda_antiga_id` | integer | ✓ | — | — |
| 3 | `produtos_id_produto` | bigint | ✓ | — | — |

_Sem referência identificada no código._

---

## insumos

**Aprox. linhas:** 234

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.insumos_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `nome` | character varying(255) | ✓ | — | — |
| 7 | `sku` | character varying(255) | ✓ | — | — |
| 8 | `unidade` | character varying(255) | ✓ | — | — |
| 9 | `estoque_minimo` | float4 | ✓ | — | — |
| 10 | `estoque_maximo` | float4 | ✓ | — | — |
| 11 | `custo_compra` | float4 | ✓ | — | — |
| 12 | `saldo` | float4 | ✓ | — | — |
| 13 | `ficha_tecnica` | text | ✓ | — | — |
| 15 | `categoria_id` | integer | ✓ | — | — |
| 19 | `fornecedor_id` | bigint | ✓ | — | — |
| 20 | `peso_pedra` | float4 | ✓ | — | — |
| 22 | `peso_total` | float4 | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `insumos_pkey` — (`id`)

**Uso no código:**
- `directus.insumos` — 245 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1825`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1841`
  - `src/app/(dashboard)/estoque/page.tsx:7`
  - `src/app/(dashboard)/estoque/page.tsx:60`
  - `src/app/(dashboard)/insumos/InsumosClient.tsx:6`

---

## insumos_files

**Aprox. linhas:** 208

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.insumos_files_id_seq'::regclass)` | — |
| 2 | `insumos_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## itens_compras

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.itens_compras_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `insumo_id` | integer | ✓ | — | — |
| 7 | `qtd` | float4 | ✓ | — | — |
| 8 | `valor_uni` | numeric(10,5) | ✓ | — | — |
| 9 | `valor_total` | numeric(10,5) | ✓ | — | — |
| 10 | `compra_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `itens_compras_pkey` — (`id`)

_Sem referência identificada no código._

---

## itens_disttribuicao

**Aprox. linhas:** 83

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.itens_disttribuicao_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `distribuicao_id` | integer | ✓ | — | — |
| 7 | `deposito_id` | integer | ✓ | — | — |
| 8 | `insumo_id` | integer | ✓ | — | — |
| 9 | `peso` | float4 | ✓ | — | — |

_Sem referência identificada no código._

---

## itens_disttribuicao_outros_insumos_distribuicao

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.itens_disttribuicao_outros_insumos_distribuicao_id_seq'::re...` | — |
| 2 | `itens_disttribuicao_id` | integer | ✓ | — | — |
| 3 | `outros_insumos_distribuicao_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## itens_ordem

**Aprox. linhas:** 231

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.itens_ordem_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `ordem_id` | integer | ✓ | — | — |
| 7 | `deposito_id` | integer | ✓ | — | — |
| 8 | `insumo_id` | integer | ✓ | — | — |
| 10 | `peso` | float4 | ✓ | — | — |

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

**Uso no código:**
- `directus.itens_ordem` — 16 ocorrência(s)
  - `src/lib/personalizacao-validacao.ts:5`
  - `src/lib/personalizacao-validacao.ts:38`
  - `src/lib/personalizacao-validacao.ts:64`
  - `scripts/apply_074.mjs:1`
  - `scripts/apply_074.mjs:8`

---

## itens_ordem_1

**Aprox. linhas:** 598

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.itens_ordem_1_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `ordem_id` | integer | ✓ | — | — |
| 7 | `produto_id` | bigint | ✓ | — | — |
| 9 | `qtd` | float4 | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `itens_ordem_1_pkey` — (`id`)

### RLS

- **Enabled:** ✗ | **Forced:** ✗ | Políticas: 1
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `directus.itens_ordem_1` — 5 ocorrência(s)
  - `scripts/check_itens_ordem.mjs:15`
  - `scripts/check_itens_ordem.mjs:19`
  - `scripts/check_itens_ordem.mjs:44`
  - `scripts/check_itens_ordem.mjs:53`
  - `scripts/check_itens_ordem.mjs:119`

---

## itens_ordem_compra

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.itens_ordem_compra_id_seq'::regclass)` | — |
| 2 | `sort` | integer | ✓ | — | — |
| 3 | `user_created` | uuid | ✓ | — | — |
| 4 | `date_created` | timestamp with time zone | ✓ | — | — |
| 5 | `user_updated` | uuid | ✓ | — | — |
| 6 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 7 | `peso_ouro18` | numeric(10,2) | ✓ | — | — |
| 8 | `peso_ourofino` | numeric(10,2) | ✓ | `NULL::numeric` | — |
| 9 | `fator` | numeric(10,2) | ✓ | `NULL::numeric` | — |
| 11 | `ordem_compraid` | integer | ✓ | — | — |

### Triggers

- `trg_calc_peso_ourofino` — BEFORE INSERT/UPDATE → `directus.calc_peso_ourofino` 
- `trg_totais_ordem_compra` — AFTER INSERT/DELETE/UPDATE → `directus.calc_totais_ordem_compra` 

_Sem referência identificada no código._

---

## itens_ordem_compra_files

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.itens_ordem_compra_files_id_seq'::regclass)` | — |
| 2 | `itens_ordem_compra_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## lancamento_avulso

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.lancamento_avulso_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `deposito_id` | integer | ✓ | — | — |
| 7 | `setor_id` | integer | ✓ | — | — |
| 8 | `peso` | float4 | ✓ | — | — |
| 9 | `tipo_lancamento` | character varying(255) | ✓ | — | — |
| 10 | `obs` | text | ✓ | — | — |
| 11 | `insumo_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## lancamento_avulso_files

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.lancamento_avulso_files_id_seq'::regclass)` | — |
| 2 | `lancamento_avulso_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## logistica

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.logistica_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `etapas` | character varying(255) | ✓ | — | — |

**Uso no código:**
- `directus.logistica` — 8 ocorrência(s)
  - `src/app/api/user/avatar/route.ts:85`
  - `src/app/api/user/avatar/route.ts:86`
  - `src/app/api/user/[id]/route.ts:182`
  - `src/app/api/user/[id]/route.ts:183`
  - `src/lib/whatsapp/assistente.js:20`

---

## logistica_ordens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.logistica_ordens_id_seq'::regclass)` | — |
| 2 | `logistica_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## ordemCompra

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus."ordemCompra_id_seq"'::regclass)` | — |
| 2 | `status` | character varying(255) | — | `'draft'::character varying` | — |
| 3 | `sort` | integer | ✓ | — | — |
| 4 | `user_created` | uuid | ✓ | — | — |
| 5 | `date_created` | timestamp with time zone | ✓ | — | — |
| 6 | `user_updated` | uuid | ✓ | — | — |
| 7 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 8 | `fornecedor` | bigint | ✓ | — | — |
| 9 | `pesoTotalOuro18` | numeric(10,2) | ✓ | — | — |
| 10 | `pesoTotalOuroFino` | numeric(10,2) | ✓ | `NULL::numeric` | — |
| 11 | `fatorMedio` | numeric(10,2) | ✓ | `NULL::numeric` | — |
| 12 | `registro_da_nota` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## ordemCompra_produtos

**Aprox. linhas:** 2

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus."ordemCompra_produtos_id_seq"'::regclass)` | — |
| 2 | `ordemCompra_id` | integer | ✓ | — | — |
| 3 | `produtos_id_produto` | bigint | ✓ | — | — |
| 4 | `qtd` | integer | ✓ | — | — |
| 5 | `peso` | numeric(10,2) | ✓ | `NULL::numeric` | — |
| 6 | `fator` | numeric(10,2) | ✓ | `NULL::numeric` | — |
| 7 | `foto` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## ordem_comentario_mencoes

**Aprox. linhas:** 253

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.ordem_comentario_mencoes_id_seq'::regclass)` | — |
| 2 | `comentario_id` | integer | — | — | — |
| 3 | `ordem_id` | integer | — | — | — |
| 4 | `user_id_mencionado` | uuid | — | — | — |
| 5 | `user_id_mencionador` | uuid | — | — | — |
| 6 | `date_created` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `ordem_comentario_mencoes_pkey` — (`id`)

### Índices

- `idx_comentario_mencoes_comentario` — `CREATE INDEX idx_comentario_mencoes_comentario ON directus.ordem_comentario_mencoes USING btree (comentario_id)`
- `idx_comentario_mencoes_ordem` — `CREATE INDEX idx_comentario_mencoes_ordem ON directus.ordem_comentario_mencoes USING btree (ordem_id)`
- `idx_comentario_mencoes_unique` — `CREATE UNIQUE INDEX idx_comentario_mencoes_unique ON directus.ordem_comentario_mencoes USING btree (comentario_id, user_id_mencionado)`
- `idx_comentario_mencoes_user_mencionado` — `CREATE INDEX idx_comentario_mencoes_user_mencionado ON directus.ordem_comentario_mencoes USING btree (user_id_mencionado)`

### Triggers

- `trigger_criar_notificacao_mencao` — AFTER INSERT → `public.criar_notificacao_mencao` 

_Sem referência identificada no código._

---

## ordem_comentarios

**Aprox. linhas:** 244

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.ordem_comentarios_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | — | — | — |
| 3 | `user_id` | uuid | — | — | — |
| 4 | `conteudo` | text | — | — | — |
| 5 | `anexos_path` | _text | ✓ | — | — |
| 6 | `editado` | boolean | ✓ | `false` | — |
| 7 | `data_edicao` | timestamp with time zone | ✓ | — | — |
| 8 | `date_created` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `date_updated` | timestamp with time zone | ✓ | `now()` | — |
| 10 | `deleted_at` | timestamp with time zone | ✓ | — | — |
| 11 | `conteudo_texto` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `ordem_comentarios_pkey` — (`id`)

### Índices

- `idx_ordem_comentarios_date_created` — `CREATE INDEX idx_ordem_comentarios_date_created ON directus.ordem_comentarios USING btree (date_created DESC)`
- `idx_ordem_comentarios_deleted_at` — `CREATE INDEX idx_ordem_comentarios_deleted_at ON directus.ordem_comentarios USING btree (deleted_at) WHERE (deleted_at IS NULL)`
- `idx_ordem_comentarios_user_id` — `CREATE INDEX idx_ordem_comentarios_user_id ON directus.ordem_comentarios USING btree (user_id)`
- `ordem_comentarios_ordem_id_idx` — `CREATE INDEX ordem_comentarios_ordem_id_idx ON directus.ordem_comentarios USING btree (ordem_id)`

### Triggers

- `trg_upd_ordens_comentarios` — BEFORE UPDATE → `directus.fn_ordens_comentarios_update_date_column` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `directus.ordem_comentarios` — 1 ocorrência(s)
  - `supabase/migrations/068_role_varchar.sql:148`

---

## ordens

**Aprox. linhas:** 518

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.ordens_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | `now()` | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 13 | `prioridade_fabrica` | character varying(255) | ✓ | — | — |
| 16 | `vendedor_id` | bigint | ✓ | — | — |
| 21 | `situacao` | character varying(255) | ✓ | — | — |
| 24 | `setor_atual` | integer | ✓ | — | — |
| 25 | `status` | character varying(255) | ✓ | `'1'::character varying` | — |
| 26 | `cliente_id` | bigint | ✓ | — | — |
| 27 | `data_entrega` | date | ✓ | — | — |
| 28 | `peso_metal_negocido` | float4 | ✓ | — | — |
| 29 | `itens_para_fabricacao` | character varying(255) | ✓ | — | — |
| 30 | `detalhes_ordem` | text | ✓ | — | — |
| 31 | `itens_do_serevico` | character varying(255) | ✓ | `NULL::character varying` | — |
| 32 | `peso_metal_externo` | float4 | ✓ | — | — |
| 35 | `outro_item_fabricacao` | character varying(255) | ✓ | — | — |
| 36 | `outro_item_servico` | character varying(255) | ✓ | `NULL::character varying` | — |
| 37 | `rota` | character varying(255) | ✓ | — | — |
| 38 | `tipo_ordem` | character varying(255) | ✓ | — | — |
| 39 | `ficha_tecnica` | character varying(255) | ✓ | — | — |
| 40 | `distribuicao_id` | integer | ✓ | — | — |
| 41 | `arquivos_path` | _text | ✓ | — | — |
| 42 | `ficha_tecnica_id` | integer | ✓ | — | — |
| 45 | `pedido_id` | integer | ✓ | — | — |
| 46 | `local_atual` | bigint | ✓ | — | — |
| 47 | `numero_ordem` | text | ✓ | — | — |
| 48 | `origem_reprovacao` | text | ✓ | — | 1: vendedor, 2: cliente |
| 49 | `motivo_reprovacao` | integer | ✓ | — | Motivo da reprovação da Ordem (ID). 1: Fabricado diferente do solicitado, 2: Ordem preenchida errada/incompleta, 3: Acabamento/qualidade reprovada, 4: Cliente não gostou, 99: Outro motivo. |
| 50 | `id_ordem_relacionada` | bigint | ✓ | — | — |
| 51 | `descricao_servico_outros` | text | ✓ | — | — |
| 52 | `id_asana` | bigint | ✓ | — | — |
| 53 | `data_conclusao` | timestamp without time zone | ✓ | — | — |
| 54 | `tipo_servico` | integer | ✓ | — | 1: Solda Laser, 2: Cravação Manual, 3: Acabamento e polimento, 4: Ajuste Manual, 5: Solda e Limpeza, 99: Outro |
| 55 | `descricao_servico_personalizado` | text | ✓ | — | — |
| 56 | `descricao_motivo_reprovacao` | text | ✓ | — | Descrição detalhada quando o Motivo da Reprovação for "99: Outro motivo". |
| 57 | `protocolo_loja` | character varying(255) | ✓ | `'false'::character varying` | — |
| 58 | `tipo_controle` | character varying(255) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `ordens_pkey` — (`id`)

### Triggers

- `trg_ponte_ordens` — AFTER INSERT/UPDATE → `alissonerp.fn_ponte_directus_para_alissonerp` 
- `trg_preencher_numero_ordem` — BEFORE INSERT → `directus.preencher_numero_ordem` 
- `trigger_nova_ordem` — AFTER INSERT/UPDATE → `public.notificar_nova_ordem` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `AlissonERP` (ALL, PERMISSIVE) roles=public
    USING: `true`
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `directus.ordens` — 487 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/auditoria/AuditoriaClient.tsx:922`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:414`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:517`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:591`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1819`

---

## ordens_estoque

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.ordens_estoque_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `produto` | bigint | ✓ | — | — |
| 7 | `solicitante` | uuid | ✓ | — | — |
| 8 | `tipo_controle` | character varying(255) | ✓ | — | — |
| 9 | `data_conclusao` | timestamp without time zone | ✓ | — | — |
| 10 | `Tipo_de_ordem` | character varying(255) | ✓ | `'Reposição de Estoque'::character varying` | — |
| 11 | `numero_ordem` | character varying(255) | ✓ | — | — |
| 12 | `qtd` | integer | ✓ | — | — |

### Triggers

- `trg_set_numero_ordem` — BEFORE INSERT → `directus.func_gerar_numero_ordem` 

_Sem referência identificada no código._

---

## ordens_files

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.ordens_files_id_seq'::regclass)` | — |
| 2 | `ordens_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## outros_insumos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.outros_insumos_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `pcp_id` | integer | ✓ | — | — |
| 7 | `ordem_id` | integer | ✓ | — | — |
| 9 | `peso` | float4 | ✓ | — | — |
| 10 | `deposito_id` | integer | ✓ | — | — |
| 12 | `insumo_id` | integer | ✓ | — | — |

### Triggers

- `trigger_soma_outros_insumos` — AFTER INSERT/DELETE/UPDATE → `directus.atualizar_outros_pesos_pcp` 

_Sem referência identificada no código._

---

## outros_insumos_distribuicao

**Aprox. linhas:** 32

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.outros_insumos_distribuicao_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `distribuicao_id` | integer | ✓ | — | — |
| 7 | `insumo_id` | integer | ✓ | — | — |
| 8 | `peso` | float4 | ✓ | `'0'::real` | — |

**Uso no código:**
- `directus.outros_insumos_distribuicao` — 1 ocorrência(s)
  - `scripts/validar_golive.mjs:47`

---

## pcp

**Aprox. linhas:** 414

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.pcp_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `etapas` | character varying(255) | ✓ | — | — |
| 7 | `ordem_id` | integer | ✓ | — | — |
| 8 | `saida_ordem` | integer | ✓ | — | — |
| 9 | `total_metal` | float4 | ✓ | `'0'::real` | — |
| 10 | `retorno_metal` | float4 | ✓ | `'0'::real` | — |
| 11 | `total_pedras_un` | float4 | ✓ | `'0'::real` | — |
| 12 | `total_pedras_g` | float4 | ✓ | `'0'::real` | — |
| 14 | `pmc` | float4 | ✓ | `'0'::real` | — |
| 15 | `total_geral_outros_pesos` | float4 | ✓ | `'0'::real` | — |
| 16 | `total_outros_pesos_g` | float4 | ✓ | `'0'::real` | — |
| 17 | `data_conclusao` | timestamp with time zone | ✓ | — | — |
| 18 | `quebra` | float4 | ✓ | `'0'::real` | — |
| 19 | `porcentagem_de_quebra` | float4 | ✓ | `'0'::real` | — |
| 20 | `metal_externo` | float4 | ✓ | `'0'::real` | — |
| 21 | `peso_final` | float4 | ✓ | `'0'::real` | — |
| 22 | `local_atual` | boolean | ✓ | — | — |
| 23 | `quantidade` | float4 | ✓ | `'1'::real` | — |
| 24 | `peso_unitario` | float4 | ✓ | — | — |
| 25 | `operador` | uuid | ✓ | — | — |
| 27 | `Bloqueado` | boolean | ✓ | `false` | — |

### Chaves

- **PRIMARY KEY** `pcp_pkey` — (`id`)

### Triggers

- `trg_atualiza_peso_unitario` — BEFORE INSERT/UPDATE → `directus.calcular_peso_unitario_pcp` 
- `trigger_calc_total_geral` — BEFORE INSERT/UPDATE → `directus.calcular_total_geral_pcp` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `frontend` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `directus.pcp` — 476 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:472`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:485`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1138`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1820`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1840`

---

## pcp_fechamento

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.pcp_fechamento_id_seq'::regclass)` | — |
| 2 | `pcp_id` | integer | ✓ | — | — |
| 3 | `item` | character varying(255) | ✓ | — | — |
| 4 | `collection` | character varying(255) | ✓ | — | — |

_Sem referência identificada no código._

---

## pcp_teste

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.pcp_teste_id_seq'::regclass)` | — |
| 2 | `pcp_id` | integer | ✓ | — | — |
| 3 | `item` | character varying(255) | ✓ | — | — |
| 4 | `collection` | character varying(255) | ✓ | — | — |

_Sem referência identificada no código._

---

## peca_pre_acabada

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.peca_pre_acabada_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `peso_peca` | float4 | ✓ | — | — |

_Sem referência identificada no código._

---

## peca_pre_acabada_insumos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.peca_pre_acabada_insumos_id_seq'::regclass)` | — |
| 2 | `peca_pre_acabada_id` | integer | ✓ | — | — |
| 3 | `insumos_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## pedras_ordens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.pedras_ordens_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `deposito_id` | integer | ✓ | — | — |
| 7 | `peso` | float4 | ✓ | — | — |
| 8 | `ordem_id` | integer | ✓ | — | — |
| 9 | `peso_pedra` | float4 | ✓ | — | — |
| 10 | `qtd_pedras` | float4 | ✓ | — | — |

### Triggers

- `trigger_soma_pedras` — AFTER INSERT/DELETE/UPDATE → `directus.atualizar_totais_pedras_pcp` 

**Uso no código:**
- `directus.pedras_ordens` — 3 ocorrência(s)
  - `scripts/validar_golive.mjs:51`
  - `supabase/migrations/018_trigger_apontamento_pcp.sql:104`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:161`

---

## preparando_entrega

**Aprox. linhas:** 392

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.preparando_entrega_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `etapas` | character varying(255) | ✓ | — | — |
| 7 | `ordem_id` | integer | ✓ | — | — |
| 8 | `data_conclusao` | timestamp with time zone | ✓ | — | — |
| 9 | `Observacao` | text | ✓ | — | — |

### Triggers

- `trg_concl_preparando` — BEFORE INSERT/UPDATE → `directus.fn_atualizar_conclusao_universal` 
- `trg_vinculo_entrega_ordem` — AFTER UPDATE → `public.fn_atualizar_ordem_por_entrega` 
- `trg_vinculo_ordens` — AFTER UPDATE → `directus.fn_vinculo_entrega_ordens` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `frontend` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## produtos_files

**Aprox. linhas:** 62

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.produtos_files_id_seq'::regclass)` | — |
| 2 | `produtos_id_produto` | bigint | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `produtos_files_pkey` — (`id`)

**Uso no código:**
- `directus.produtos_files` — 1 ocorrência(s)
  - `scripts/migrate_directus_images.mjs:255`

---

## produtos_files_1

**Aprox. linhas:** 6954

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.produtos_files_1_id_seq'::regclass)` | — |
| 2 | `produtos_id_produto` | bigint | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `produtos_files_1_pkey` — (`id`)

**Uso no código:**
- `directus.produtos_files_1` — 4 ocorrência(s)
  - `scripts/migrate_directus_images.mjs:244`
  - `scripts/migrate_directus_images.mjs:247`
  - `supabase/migrations/185_produto_imagens.sql:24`
  - `supabase/migrations/185_produto_imagens.sql:43`

---

## produtos_files_2

**Aprox. linhas:** 17895

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.produtos_files_2_id_seq'::regclass)` | — |
| 2 | `produtos_id_produto` | bigint | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `produtos_files_2_pkey` — (`id`)

**Uso no código:**
- `directus.produtos_files_2` — 2 ocorrência(s)
  - `scripts/migrate_directus_images.mjs:263`
  - `supabase/migrations/185_produto_imagens.sql:43`

---

## produtos_files_3

**Aprox. linhas:** 187

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.produtos_files_3_id_seq'::regclass)` | — |
| 2 | `produtos_id_produto` | bigint | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

**Uso no código:**
- `directus.produtos_files_3` — 1 ocorrência(s)
  - `scripts/migrate_directus_images.mjs:271`

---

## protocolo

**Aprox. linhas:** 53

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 9 | `obs` | text | ✓ | — | — |
| 10 | `etapas` | character varying(255) | ✓ | `'1'::character varying` | — |
| 12 | `rota` | character varying(255) | ✓ | `'Loja -> Fabrica'::character varying` | — |
| 13 | `data_conclusao` | timestamp without time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `protocolo_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `frontend` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `directus.protocolo` — 245 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1827`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1842`
  - `src/app/(dashboard)/protocolo/page.tsx:18`
  - `src/app/(dashboard)/protocolo/ProtocoloClient.tsx:21`
  - `src/app/(dashboard)/protocolo/ProtocoloClient.tsx:203`

---

## protocolo_files

**Aprox. linhas:** 94

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_files_id_seq'::regclass)` | — |
| 2 | `protocolo_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## protocolo_loja

**Aprox. linhas:** 76

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_loja_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `etapas` | character varying(255) | ✓ | `'1'::character varying` | — |
| 7 | `rota` | character varying(255) | ✓ | `'Fabrica -> Loja'::character varying` | — |
| 8 | `obs` | text | ✓ | — | — |
| 9 | `data_conclusao` | timestamp with time zone | ✓ | — | — |

### Triggers

- `trg_concl_preparando` — BEFORE INSERT/UPDATE → `directus.fn_atualizar_conclusao_universal` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `frontend` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `directus.protocolo_loja` — 13 ocorrência(s)
  - `scripts/apply_073.mjs:83`
  - `scripts/migrar_ordens_legado.mjs:85`
  - `supabase/migrations/006_ordens.sql:30`
  - `supabase/migrations/027_trigger_ponte_pdv.sql:43`
  - `supabase/migrations/028_auditoria_dupla.sql:60`

---

## protocolo_loja_files

**Aprox. linhas:** 109

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_loja_files_id_seq'::regclass)` | — |
| 2 | `protocolo_loja_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Frontend` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## protocolo_loja_ordens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_loja_ordens_id_seq'::regclass)` | — |
| 2 | `protocolo_loja_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `frontend` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## protocolo_loja_ordens_1

**Aprox. linhas:** 271

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_loja_ordens_1_id_seq'::regclass)` | — |
| 2 | `protocolo_loja_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `protocolo_loja_ordens_1_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## protocolo_ordens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_ordens_id_seq'::regclass)` | — |

### Chaves

- **PRIMARY KEY** `protocolo_ordens_pkey` — (`id`)

**Uso no código:**
- `directus.protocolo_ordens` — 14 ocorrência(s)
  - `scripts/backup_pre_golive.mjs:29`
  - `scripts/diag_protocolo_spec.mjs:13`
  - `scripts/diag_protocolo_spec.mjs:17`
  - `scripts/diag_tabelas_protocolo.mjs:7`
  - `scripts/pre_migration_check.mjs:114`

---

## protocolo_ordens_1

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_ordens_1_id_seq'::regclass)` | — |

### Chaves

- **PRIMARY KEY** `protocolo_ordens_1_pkey` — (`id`)

_Sem referência identificada no código._

---

## protocolo_ordens_2

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_ordens_2_id_seq'::regclass)` | — |
| 2 | `protocolo_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `protocolo_ordens_2_pkey` — (`id`)

_Sem referência identificada no código._

---

## protocolo_ordens_3

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_ordens_3_id_seq'::regclass)` | — |
| 2 | `protocolo_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `protocolo_ordens_3_pkey` — (`id`)

_Sem referência identificada no código._

---

## protocolo_ordens_4

**Aprox. linhas:** 235

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.protocolo_ordens_4_id_seq'::regclass)` | — |
| 2 | `protocolo_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `protocolo_ordens_4_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## saida_distribuicao

**Aprox. linhas:** 0

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.saida_distribuicao_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 7 | `obs` | text | ✓ | — | — |
| 9 | `deposito_id` | integer | ✓ | — | — |
| 14 | `pf` | float4 | ✓ | — | — |

**Uso no código:**
- `directus.saida_distribuicao` — 7 ocorrência(s)
  - `src/app/api/pcp/[id]/historico/route.ts:16`
  - `src/app/api/pcp/[id]/historico/route.ts:31`
  - `src/app/api/pcp/[id]/historico/route.ts:119`
  - `src/components/forms/PCPDetalheModal.tsx:40`
  - `src/components/forms/PCPDetalheModal.tsx:459`

---

## saida_distribuicao_files

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.saida_distribuicao_files_id_seq'::regclass)` | — |
| 2 | `saida_distribuicao_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## saida_distribuicao_itens_disttribuicao

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.saida_distribuicao_itens_disttribuicao_id_seq'::regclass)` | — |
| 2 | `saida_distribuicao_id` | integer | ✓ | — | — |
| 3 | `itens_disttribuicao_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## saida_ordem

**Aprox. linhas:** 582

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.saida_ordem_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `peso` | float4 | ✓ | — | — |
| 7 | `ordem_id` | integer | ✓ | — | — |
| 8 | `deposito_id` | integer | ✓ | — | — |

### Índices

- `saida_ordem_id_key` — `CREATE UNIQUE INDEX saida_ordem_id_key ON directus.saida_ordem USING btree (id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

**Uso no código:**
- `directus.saida_ordem` — 15 ocorrência(s)
  - `src/app/api/pcp/saida/route.ts:213`
  - `src/app/api/pcp/transferir-service/receber/route.ts:175`
  - `scripts/fix_aguardando_rota.mjs:59`
  - `scripts/fn_processar_auditoria.sql:23`
  - `supabase/migrations/021_triggers_protocolo.sql:9`

---

## saida_ordem_files

**Aprox. linhas:** 328

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.saida_ordem_files_id_seq'::regclass)` | — |
| 2 | `saida_ordem_id` | integer | ✓ | — | — |
| 3 | `directus_files_id` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## saida_ordem_itens_ordem

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.saida_ordem_itens_ordem_id_seq'::regclass)` | — |
| 2 | `saida_ordem_id` | integer | ✓ | — | — |
| 3 | `itens_ordem_id` | integer | ✓ | — | — |

_Sem referência identificada no código._

---

## setor

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.setor_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `descricao` | character varying(255) | ✓ | — | — |

**Uso no código:**
- `directus.setor` — 32 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1521`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1731`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1747`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1771`
  - `src/app/api/distribuicao/route.ts:157`

---

## tipo_apontamento

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.tipo_apontamento_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `descricao` | character varying(255) | ✓ | — | — |
| 7 | `obs` | text | ✓ | — | — |
| 8 | `tipo` | character varying(255) | ✓ | — | — |

_Sem referência identificada no código._

---

## tipo_ocorrencia

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.tipo_ocorrencia_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 6 | `descricao` | character varying(255) | ✓ | — | — |
| 7 | `obs` | text | ✓ | — | — |
| 8 | `tipo` | character varying(255) | ✓ | — | — |

_Sem referência identificada no código._

---

## transferencia_ordem

**Aprox. linhas:** 401

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.transferencia_ordem_id_seq'::regclass)` | — |
| 2 | `user_created` | uuid | ✓ | — | — |
| 3 | `date_created` | timestamp with time zone | ✓ | — | — |
| 4 | `user_updated` | uuid | ✓ | — | — |
| 5 | `date_updated` | timestamp with time zone | ✓ | — | — |
| 9 | `setor_id` | integer | ✓ | — | — |
| 10 | `deposito_id` | integer | ✓ | — | — |
| 13 | `pcp` | integer | ✓ | — | — |
| 14 | `ordem_id` | integer | ✓ | — | — |

**Uso no código:**
- `directus.transferencia_ordem` — 1 ocorrência(s)
  - `supabase/migrations/016_views_detalhe_ordem.sql:178`

---

## transferencia_ordem_itens_ordem

**Aprox. linhas:** 233

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('directus.transferencia_ordem_itens_ordem_id_seq'::regclass)` | — |
| 2 | `transferencia_ordem_id` | integer | ✓ | — | — |
| 3 | `itens_ordem_id` | integer | ✓ | — | — |
| 4 | `peso` | float4 | ✓ | `'0'::real` | — |

_Sem referência identificada no código._

---

