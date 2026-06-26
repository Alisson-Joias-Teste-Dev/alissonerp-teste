# Schema alissonerp — ordens

> Gerado em: 2026-04-29 | Tabelas: 14

## comentarios_ordem

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.comentarios_ordem_id_seq'::regclass) |
| ordem_id | integer | NO | — |
| autor_id | uuid | NO | — |
| texto | text | NO | — |
| mencoes | ARRAY | YES | '{}'::uuid[] |
| editado | boolean | YES | false |
| editado_em | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | YES | now() |
| excluido | boolean | YES | false |
| excluido_em | timestamp with time zone | YES | — |
| excluido_por | uuid | YES | — |
| texto_original | text | YES | — |
| foto_path | text | YES | — |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`

**Índices:**
- `idx_comentarios_ordem_id` — CREATE INDEX idx_comentarios_ordem_id ON alissonerp.comentarios_ordem USING btree (ordem_id)
- `idx_comentarios_autor` — CREATE INDEX idx_comentarios_autor ON alissonerp.comentarios_ordem USING btree (autor_id)
- `idx_comentarios_created` — CREATE INDEX idx_comentarios_created ON alissonerp.comentarios_ordem USING btree (created_at DESC)

---

## config_orcamento

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.config_orcamento_id_seq'::regclass) |
| name | character varying(50) | NO | 'default'::character varying |
| start_mkp | numeric | NO | 3.5 |
| discount_percent | numeric | NO | 0 |
| gold_price | numeric | NO | 0 |
| camera_override | numeric | YES | — |
| profile | character varying(30) | YES | 'Anatomica'::character varying |
| pricing_categories | jsonb | NO | '[]'::jsonb |
| groove_rules | jsonb | NO | '[]'::jsonb |
| updated_at | timestamp with time zone | NO | now() |
| updated_by | uuid | YES | — |
| stone_markup | numeric | NO | 2.5 |
| stone_prices | jsonb | NO | '[{"tipo": "diamante", "preco_usd_ct": 80}, {"tipo": "moi... |
| calibracao | jsonb | YES | '{"largura_min": {"grao": 0.8, "pave": 1.4, "canaleta": 1... |
| risco_width | numeric | YES | 0.10 |
| risco_depth | numeric | YES | 0.20 |
| preco_gravacao | numeric | YES | 100.00 |
| stone_markups_table | jsonb | YES | '{}'::jsonb |

**Índices:**
- `config_orcamento_name_key` — CREATE UNIQUE INDEX config_orcamento_name_key ON alissonerp.config_orcamento USING btree (name)

---

## fichas_tecnicas

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fichas_tecnicas_id_seq'::regclass) |
| ordem_id | integer | YES | — |
| tipo_item | character varying(50) | NO | — |
| dados | jsonb | NO | '{}'::jsonb |
| created_by | uuid | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`

**Índices:**
- `idx_fichas_tecnicas_ordem_id` — CREATE INDEX idx_fichas_tecnicas_ordem_id ON alissonerp.fichas_tecnicas USING btree (ordem_id)

---

## fichas_tecnicas_produto

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fichas_tecnicas_produto_id_seq'::regc... |
| produto_id | bigint | NO | — |
| tipo_peca | character varying(50) | YES | — |
| largura | numeric | YES | — |
| altura | numeric | YES | — |
| profundidade | numeric | YES | — |
| diametro_interno | numeric | YES | — |
| peso_estimado_metal | numeric | YES | — |
| qtd_pedras | integer | YES | 0 |
| tamanho_pedras_mm | numeric | YES | — |
| tamanho_pedras_ct | numeric | YES | — |
| tipo_cravacao | character varying(50) | YES | — |
| qtd_garras | integer | YES | 0 |
| largura_garra | numeric | YES | — |
| altura_garra | numeric | YES | — |
| modelo | character varying(100) | YES | — |
| modelo_interno | character varying(50) | YES | — |
| arquivo_3dm | text | YES | — |
| arquivo_glb | text | YES | — |
| ia_provider | character varying(20) | YES | — |
| ia_raw_response | jsonb | YES | — |
| ia_confianca | numeric | YES | — |
| revisado_por | uuid | YES | — |
| revisado_em | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Índices:**
- `fichas_tecnicas_produto_produto_id_key` — CREATE UNIQUE INDEX fichas_tecnicas_produto_produto_id_key ON alissonerp.fichas_tecnicas_produto ...
- `idx_fichas_tecnicas_produto_id` — CREATE INDEX idx_fichas_tecnicas_produto_id ON alissonerp.fichas_tecnicas_produto USING btree (pr...

---

## itens_ordem

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.itens_ordem_id_seq'::regclass) |
| ordem_id | integer | NO | — |
| produto_id | bigint | YES | — |
| nome_produto | text | YES | — |
| sku | text | YES | — |
| quantidade | integer | NO | 1 |
| peso_estimado | numeric | YES | — |
| observacao | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| personalizacao | jsonb | YES | — |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`

**Índices:**
- `idx_itens_ordem_ordem_id` — CREATE INDEX idx_itens_ordem_ordem_id ON alissonerp.itens_ordem USING btree (ordem_id)
- `idx_itens_ordem_produto_id` — CREATE INDEX idx_itens_ordem_produto_id ON alissonerp.itens_ordem USING btree (produto_id)

---

## itens_ordem_insumos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.itens_ordem_insumos_id_seq'::regclass) |
| ordem_id | integer | YES | — |
| deposito_id | integer | YES | — |
| insumo_id | integer | YES | — |
| peso | real | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `insumo_id` → `alissonerp.insumos.id`
- `ordem_id` → `alissonerp.ordens.id`

---

## itens_ordem_produtos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.itens_ordem_produtos_id_seq'::regclass) |
| ordem_id | integer | YES | — |
| produto_id | bigint | YES | — |
| quantidade | real | YES | 1 |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`

---

## orcamento_fichas_tecnicas

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.orcamento_fichas_tecnicas_id_seq'::re... |
| created_at | timestamp with time zone | NO | now() |
| modelo | character varying(50) | YES | — |
| aro_numeracao | character varying(20) | YES | — |
| largura | numeric | YES | — |
| espessura | numeric | YES | — |
| peso_estimado | numeric | YES | — |
| tipo_fonte | character varying(20) | YES | — |
| texto | character varying(200) | YES | — |
| qtd_pedras | integer | YES | — |
| tamanho_pedra | numeric | YES | — |
| tipo_aplicacao_pedra | character varying(30) | YES | — |
| perfil | character varying(30) | YES | — |
| diametro | numeric | YES | — |
| densidade_ouro | numeric | YES | — |
| cor_metal | character varying(30) | YES | — |
| profundidade_concava | numeric | YES | — |
| friso_lado | character varying(10) | YES | — |
| friso_largura | numeric | YES | — |
| friso_profundidade | numeric | YES | — |
| friso_offset | numeric | YES | — |
| canal_largura | numeric | YES | — |
| canal_borda_altura | numeric | YES | — |
| chanfro_tamanho | numeric | YES | — |
| dome_porcentagem | integer | YES | — |
| pedra_fileiras | integer | YES | — |
| pedra_drill | boolean | YES | false |
| pedra_meia_lua | boolean | YES | false |
| pedra_volta_completa | boolean | YES | false |
| pedras_detalhadas | jsonb | NO | '[]'::jsonb |
| has_friso | boolean | YES | false |
| friso_tipo | character varying(20) | YES | — |
| friso_kind | character varying(10) | YES | 'friso'::character varying |
| tipo_pedra | text | YES | — |

---

## orcamentos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.orcamentos_id_seq'::regclass) |
| created_at | timestamp with time zone | NO | now() |
| numero_orcamento | character varying(30) | NO | — |
| tipo | character varying(20) | NO | 'alianca'::character varying |
| vendedor_id | integer | YES | — |
| usuario_id | uuid | YES | — |
| nome_cliente | character varying(200) | NO | — |
| nome_modelo | character varying(100) | YES | — |
| peso | numeric | YES | — |
| valor | numeric | YES | — |
| markup | numeric | YES | — |
| desconto_pct | numeric | YES | 0 |
| cotacao_ouro | numeric | YES | — |
| ficha_tecnica_id | integer | YES | — |
| status | character varying(20) | NO | 'rascunho'::character varying |
| observacoes | text | YES | — |
| updated_at | timestamp with time zone | NO | now() |
| valor_ouro | numeric | YES | — |
| valor_pedras | numeric | YES | — |
| cotacao_dolar | numeric | YES | — |
| cliente_id | bigint | YES | — |
| ordem_gerada_id | integer | YES | — |
| foto_3d | text | YES | — |
| venda_gerada_id | integer | YES | — |
| quantidade | integer | YES | 1 |
| ficha_tecnica_2_id | integer | YES | — |

**FKs:**
- `ficha_tecnica_2_id` → `alissonerp.orcamento_fichas_tecnicas.id`
- `ficha_tecnica_id` → `alissonerp.orcamento_fichas_tecnicas.id`
- `ordem_gerada_id` → `alissonerp.ordens.id`
- `venda_gerada_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `idx_orcamentos_usuario` — CREATE INDEX idx_orcamentos_usuario ON alissonerp.orcamentos USING btree (usuario_id)
- `idx_orcamentos_vendedor` — CREATE INDEX idx_orcamentos_vendedor ON alissonerp.orcamentos USING btree (vendedor_id)
- `idx_orcamentos_status` — CREATE INDEX idx_orcamentos_status ON alissonerp.orcamentos USING btree (status)
- `idx_orcamentos_created` — CREATE INDEX idx_orcamentos_created ON alissonerp.orcamentos USING btree (created_at DESC)
- `idx_orcamentos_cliente` — CREATE INDEX idx_orcamentos_cliente ON alissonerp.orcamentos USING btree (cliente_id)

---

## ordem_comentario_mencoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.ordem_comentario_mencoes_id_seq'::reg... |
| comentario_id | integer | NO | — |
| ordem_id | integer | NO | — |
| user_id_mencionado | uuid | NO | — |
| user_id_mencionador | uuid | NO | — |
| lido | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `comentario_id` → `alissonerp.ordem_comentarios.id`
- `ordem_id` → `alissonerp.ordens.id`
- `user_id_mencionado` → `alissonerp.usuarios.id`
- `user_id_mencionador` → `alissonerp.usuarios.id`

---

## ordem_comentarios

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.ordem_comentarios_id_seq'::regclass) |
| ordem_id | integer | NO | — |
| user_id | uuid | NO | — |
| texto | text | NO | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`
- `user_id` → `alissonerp.usuarios.id`

---

## produto_tipo_item

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| produto_id | bigint | NO | — |
| tipo_item | text | NO | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `idx_produto_tipo_item_tipo` — CREATE INDEX idx_produto_tipo_item_tipo ON alissonerp.produto_tipo_item USING btree (tipo_item)

---

## saidas_ordem

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.saidas_ordem_id_seq'::regclass) |
| ordem_id | integer | YES | — |
| deposito_id | integer | YES | — |
| peso | real | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| metal_externo | numeric | YES | 0 |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `ordem_id` → `alissonerp.ordens.id`

**Triggers:**
- `trg_after_saida_ordem` (AFTER INSERT)

---

## transferencias_ordem

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.transferencias_ordem_id_seq'::regclass) |
| pcp_id | integer | YES | — |
| ordem_id | integer | YES | — |
| setor_id | integer | YES | — |
| deposito_id | integer | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| tipo_transferencia | character varying(20) | YES | 'interna'::character varying |
| protocolo_id | integer | YES | — |
| deposito_origem_id | integer | YES | — |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `deposito_origem_id` → `alissonerp.depositos.id`
- `ordem_id` → `alissonerp.ordens.id`
- `pcp_id` → `alissonerp.pcp.id`
- `protocolo_id` → `alissonerp.protocolos.id`
- `setor_id` → `alissonerp.setores.id`

**Triggers:**
- `trg_after_transferencia_ordem` (AFTER INSERT)
- `trg_after_transferencia_ordem` (AFTER UPDATE)

---

## Views (6)

### vw_apontamentos_ordem

```sql
 SELECT a.id,
    a.pcp_id,
    p.ordem_id,
...
```

### vw_estoque_ordem

```sql
 SELECT m.id,
    m.entrada,
    m.saida,
...
```

### vw_fichas_tecnicas

```sql
 SELECT o.id AS ordem_id,
    o.numero_ordem,
    ft.id AS ficha_id,
...
```

### vw_ordem_detalhe

```sql
 SELECT o.id,
    o.numero_ordem,
    (o.situacao)::text AS situacao_cod,
...
```

### vw_timeline_ordem

```sql
 WITH ev_criacao AS (
         SELECT o.id AS ordem_id,
            1 AS passo,
...
```

### vw_transferencias_ordem

```sql
 SELECT t.id,
    t.pcp_id,
    t.ordem_id,
...
```

