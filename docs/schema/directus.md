# Schema directus (READONLY)

> Gerado em: 2026-04-29 | Total tabelas: 110 (mostrando primeiras 20) | Views: 2

> **READONLY** — schema legado, não modificar

> **Nota:** Schema tem 110 tabelas. Documentadas apenas as primeiras 20 por volume.

> Tabelas omitidas: directus_dashboards, directus_extensions, directus_fields, directus_files, directus_flows, directus_folders, directus_migrations, directus_notifications, directus_operations, directus_panels, directus_permissions, directus_policies, directus_presets, directus_relations, directus_revisions, directus_roles, directus_sessions, directus_settings, directus_shares, directus_translations, directus_users, directus_versions, directus_webhooks, distribuicao, distribuicao_ordens, distribuicao_ordens_1, fechamento_distribuicao, fechamento_distribuicao_files, fechamento_distribuicao_itens_disttribuicao, fechamento_distribuicao_ordens, fechamento_distribuicao_outros_insumos_distribuicao, fechamento_fabrica, ficha_tecnica_ordem, formulario_venda_antiga, formulario_venda_antiga_produtos, insumos, insumos_files, itens_compras, itens_disttribuicao, itens_disttribuicao_outros_insumos_distribuicao, itens_ordem, itens_ordem_1, itens_ordem_compra, itens_ordem_compra_files, lancamento_avulso, lancamento_avulso_files, logistica, logistica_ordens, ordemCompra, ordemCompra_produtos, ordem_comentario_mencoes, ordem_comentarios, ordens, ordens_estoque, ordens_files, outros_insumos, outros_insumos_distribuicao, pcp, pcp_fechamento, pcp_teste, peca_pre_acabada, peca_pre_acabada_insumos, pedras_ordens, preparando_entrega, produtos_files, produtos_files_1, produtos_files_2, produtos_files_3, protocolo, protocolo_files, protocolo_loja, protocolo_loja_files, protocolo_loja_ordens, protocolo_loja_ordens_1, protocolo_ordens, protocolo_ordens_1, protocolo_ordens_2, protocolo_ordens_3, protocolo_ordens_4, saida_distribuicao, saida_distribuicao_files, saida_distribuicao_itens_disttribuicao, saida_ordem, saida_ordem_files, saida_ordem_itens_ordem, setor, tipo_apontamento, tipo_ocorrencia, transferencia_ordem, transferencia_ordem_itens_ordem

## ai_prompts

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | — |
| sort | integer | YES | — |
| date_created | timestamp with time zone | YES | CURRENT_TIMESTAMP |
| user_created | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| name | character varying(255) | YES | — |
| status | character varying(255) | YES | 'draft'::character varying |
| description | text | YES | — |
| system_prompt | text | YES | — |
| messages | json | YES | — |

**Índices:**
- `ai_prompts_name_unique` — CREATE UNIQUE INDEX ai_prompts_name_unique ON directus.ai_prompts USING btree (name)
- `ai_prompts_name_index` — CREATE INDEX ai_prompts_name_index ON directus.ai_prompts USING btree (name)

---

## apontamento

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.apontamento_id_seq'::regclass) |
| user_created | uuid | YES | — |
| date_created | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| tipo_apontamento | integer | YES | — |
| deposito | integer | YES | — |
| insumo | integer | YES | — |
| setor | integer | YES | — |
| qtd | real | YES | — |
| pcp_id | integer | YES | — |
| marcador | json | YES | — |

---

## apontamento_distribuicao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.apontamento_distribuicao_id_seq'::regcl... |
| user_created | uuid | YES | — |
| date_created | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| tipo_apontamento | integer | YES | — |
| setor | integer | YES | — |
| deposito | integer | YES | — |
| insumo | integer | YES | — |
| qtd | real | YES | — |
| distribuicao_id | integer | YES | — |

---

## apontamento_distribuicao_files

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.apontamento_distribuicao_files_id_seq':... |
| apontamento_distribuicao_id | integer | YES | — |
| directus_files_id | uuid | YES | — |

---

## apontamento_files

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.apontamento_files_id_seq'::regclass) |
| apontamento_id | integer | YES | — |
| directus_files_id | uuid | YES | — |

---

## apontamentos_pote

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.apontamentos_pote_id_seq'::regclass) |
| sort | integer | YES | — |
| date_created | timestamp with time zone | YES | — |
| date_updated | timestamp with time zone | YES | — |
| peso_bruto | numeric | YES | — |
| peso_liquido_calculado | numeric | YES | — |
| foto_balanca | uuid | YES | — |
| pcp_id | integer | YES | — |
| deposito_id | integer | YES | — |
| setor_id | integer | YES | — |

---

## aprovar_consultora

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.aprovar_consultora_id_seq'::regclass) |
| user_created | uuid | YES | — |
| date_created | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| etapas | character varying(255) | NO | NULL::character varying |
| ordem_id | integer | YES | — |
| consultora_id | bigint | YES | — |
| data_conclusao | timestamp with time zone | YES | — |

---

## aprovar_consultora_files

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.aprovar_consultora_files_id_seq'::regcl... |
| aprovar_consultora_id | integer | YES | — |
| directus_files_id | uuid | YES | — |

---

## auditar_financeiro

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.auditar_financeiro_id_seq'::regclass) |
| user_created | uuid | YES | — |
| date_created | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| situacao | character varying(255) | YES | — |
| ordem_id | integer | YES | — |
| rota_processo | character varying(255) | YES | — |
| tipo_auditoria | character varying(255) | YES | — |
| data_conclusao | timestamp with time zone | YES | — |

**Triggers:**
- `trg_concl_financeiro` (BEFORE UPDATE)
- `trg_concl_preparando` (BEFORE INSERT)
- `trg_concl_preparando` (BEFORE UPDATE)

---

## cadastro_produtos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.cadastro_produtos_id_seq'::regclass) |
| status | character varying(255) | NO | 'draft'::character varying |
| sort | integer | YES | — |
| user_created | uuid | YES | — |
| date_created | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| nome | character varying(255) | YES | — |
| sku | character varying(255) | YES | — |
| tipo | character varying(255) | YES | NULL::character varying |
| ncm | bigint | YES | — |
| localizacao | character varying(255) | YES | — |
| sobEncomenda | character varying(255) | YES | — |
| tamanhos | json | YES | — |
| tipo_variacao | character varying(255) | YES | — |
| letras | json | YES | — |
| estoque_inicial | integer | YES | — |
| estoque_minimo | integer | YES | — |
| estoque_maximo | integer | YES | — |
| dias_preparacao | integer | YES | — |
| unidade_medida | character varying(255) | YES | — |
| tipo_pedra | character varying(255) | YES | — |
| Prazo_garantia | integer | YES | — |
| peso | numeric | YES | — |
| ficha_tecnica | uuid | YES | — |
| origem_producao | character varying(255) | YES | — |
| fator | numeric | YES | — |
| caregorias | bigint | YES | — |
| subCategoria | bigint | YES | — |

---

## categoria_insumo

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.categoria_insumo_id_seq'::regclass) |
| user_created | uuid | YES | — |
| date_created | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| nome | character varying(255) | YES | — |
| descricao | text | YES | — |

---

## compras

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.compras_id_seq'::regclass) |
| user_created | uuid | YES | — |
| date_created | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| fornecedor_id | bigint | YES | — |
| situacao | character varying(255) | YES | — |
| data_hora | timestamp without time zone | YES | — |
| deposito_id | integer | YES | — |
| obs | text | YES | — |
| data_conlusao | character varying(255) | YES | — |

---

## compras_files

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.compras_files_id_seq'::regclass) |
| compras_id | integer | YES | — |
| directus_files_id | uuid | YES | — |

---

## controle_estoque

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.controle_estoque_id_seq'::regclass) |
| user_created | uuid | YES | — |
| date_created | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| entrada | real | YES | — |
| saida | real | YES | — |
| data_hora | timestamp without time zone | YES | — |
| valor_total | numeric | YES | — |
| obs | text | YES | — |
| preco_compra | numeric | YES | — |
| insumo_id | integer | YES | — |
| deposito_id | integer | YES | — |
| setor | integer | YES | — |
| marcador | character varying(255) | YES | — |
| ordem_id | integer | YES | — |

---

## deposito

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.deposito_id_seq'::regclass) |
| user_created | uuid | YES | — |
| date_created | timestamp with time zone | YES | — |
| user_updated | uuid | YES | — |
| date_updated | timestamp with time zone | YES | — |
| nome | character varying(255) | YES | — |
| tipo | character varying(255) | YES | — |

---

## directus_access

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | — |
| role | uuid | YES | — |
| user | uuid | YES | — |
| policy | uuid | NO | — |
| sort | integer | YES | — |

---

## directus_activity

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('directus.directus_activity_id_seq'::regclass) |
| action | character varying(45) | NO | — |
| user | uuid | YES | — |
| timestamp | timestamp with time zone | NO | CURRENT_TIMESTAMP |
| ip | character varying(50) | YES | — |
| user_agent | text | YES | — |
| collection | character varying(64) | NO | — |
| item | character varying(255) | NO | — |
| origin | character varying(255) | YES | — |

**Índices:**
- `directus_activity_timestamp_index` — CREATE INDEX directus_activity_timestamp_index ON directus.directus_activity USING btree ("timest...

---

## directus_collections

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| collection | character varying(64) | NO | — |
| icon | character varying(64) | YES | — |
| note | text | YES | — |
| display_template | character varying(255) | YES | — |
| hidden | boolean | NO | false |
| singleton | boolean | NO | false |
| translations | json | YES | — |
| archive_field | character varying(64) | YES | — |
| archive_app_filter | boolean | NO | true |
| archive_value | character varying(255) | YES | — |
| unarchive_value | character varying(255) | YES | — |
| sort_field | character varying(64) | YES | — |
| accountability | character varying(255) | YES | 'all'::character varying |
| color | character varying(255) | YES | — |
| item_duplication_fields | json | YES | — |
| sort | integer | YES | — |
| group | character varying(64) | YES | — |
| collapse | character varying(255) | NO | 'open'::character varying |
| preview_url | character varying(255) | YES | — |
| versioning | boolean | NO | false |

---

## directus_collections_backup

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| collection | character varying(64) | YES | — |
| icon | character varying(64) | YES | — |
| note | text | YES | — |
| display_template | character varying(255) | YES | — |
| hidden | boolean | YES | — |
| singleton | boolean | YES | — |
| translations | json | YES | — |
| archive_field | character varying(64) | YES | — |
| archive_app_filter | boolean | YES | — |
| archive_value | character varying(255) | YES | — |
| unarchive_value | character varying(255) | YES | — |
| sort_field | character varying(64) | YES | — |
| accountability | character varying(255) | YES | — |
| color | character varying(255) | YES | — |
| item_duplication_fields | json | YES | — |
| sort | integer | YES | — |
| group | character varying(64) | YES | — |
| collapse | character varying(255) | YES | — |
| preview_url | character varying(255) | YES | — |
| versioning | boolean | YES | — |

---

## directus_comments

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | — |
| collection | character varying(64) | NO | — |
| item | character varying(255) | NO | — |
| comment | text | NO | — |
| date_created | timestamp with time zone | YES | CURRENT_TIMESTAMP |
| date_updated | timestamp with time zone | YES | CURRENT_TIMESTAMP |
| user_created | uuid | YES | — |
| user_updated | uuid | YES | — |

---

## Views (2)

### ordem_comentarios_populados

```sql

...
```

### v_saldo_quebra_final

```sql

...
```

