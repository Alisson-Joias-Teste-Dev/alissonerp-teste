# Schema alissonerp — estoque

> Gerado em: 2026-04-29 | Tabelas: 12

## categorias_insumo

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.categorias_insumo_id_seq'::regclass) |
| nome | character varying(100) | NO | — |
| created_at | timestamp with time zone | YES | now() |

---

## depositos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.depositos_id_seq'::regclass) |
| nome | character varying(100) | NO | — |
| tipo | USER-DEFINED | NO | 'producao'::alissonerp.enum_tipo_deposito |
| ativo | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| local_estoque_id | integer | YES | — |

**FKs:**
- `local_estoque_id` → `alissonerp.locais_estoque.id`

---

## estoque_comercial_config

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.estoque_comercial_config_id_seq'::reg... |
| produto_id | bigint | NO | — |
| estoque_minimo | integer | NO | 0 |
| ativo | boolean | NO | true |
| created_by | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `estoque_comercial_config_produto_id_key` — CREATE UNIQUE INDEX estoque_comercial_config_produto_id_key ON alissonerp.estoque_comercial_confi...

**Triggers:**
- `trg_update_estoque_comercial_config_ts` (BEFORE UPDATE)

---

## insumos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.insumos_id_seq'::regclass) |
| sku | character varying(50) | YES | — |
| nome | character varying(255) | NO | — |
| categoria_id | integer | YES | — |
| saldo | real | YES | 0 |
| peso_pedra | real | YES | 0 |
| peso_total | real | YES | 0 |
| custo_compra | real | YES | 0 |
| estoque_minimo | real | YES | 0 |
| estoque_maximo | real | YES | 0 |
| fornecedor_id | bigint | YES | — |
| ativo | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| unidade | character varying(10) | YES | 'g'::character varying |
| descricao | text | YES | — |
| foto | text | YES | — |
| observacao | text | YES | — |
| sku_interno | text | YES | — |
| peso_pedra_ct | numeric | YES | — |

**FKs:**
- `categoria_id` → `alissonerp.categorias_insumo.id`

**Índices:**
- `idx_insumos_categoria` — CREATE INDEX idx_insumos_categoria ON alissonerp.insumos USING btree (categoria_id)
- `idx_insumos_sku` — CREATE INDEX idx_insumos_sku ON alissonerp.insumos USING btree (sku)

**Triggers:**
- `trg_calcular_peso_pedra` (BEFORE INSERT)
- `trg_calcular_peso_pedra` (BEFORE UPDATE)

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

## locais_estoque

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.locais_estoque_id_seq'::regclass) |
| nome | character varying(100) | NO | — |
| ativo | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

---

## movimentacoes_estoque

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('alissonerp.movimentacoes_estoque_id_seq'::regclass) |
| entrada | real | YES | 0 |
| saida | real | YES | 0 |
| insumo_id | integer | NO | — |
| deposito_id | integer | YES | — |
| setor_id | integer | YES | — |
| ordem_id | integer | YES | — |
| marcador | USER-DEFINED | YES | — |
| obs | text | YES | — |
| data_hora | timestamp with time zone | YES | now() |
| valor_total | numeric | YES | — |
| preco_compra | numeric | YES | — |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| local_estoque_id | integer | NO | — |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `insumo_id` → `alissonerp.insumos.id`
- `local_estoque_id` → `alissonerp.locais_estoque.id`
- `ordem_id` → `alissonerp.ordens.id`
- `setor_id` → `alissonerp.setores.id`

**Índices:**
- `idx_mov_insumo` — CREATE INDEX idx_mov_insumo ON alissonerp.movimentacoes_estoque USING btree (insumo_id)
- `idx_mov_deposito` — CREATE INDEX idx_mov_deposito ON alissonerp.movimentacoes_estoque USING btree (deposito_id)
- `idx_mov_ordem` — CREATE INDEX idx_mov_ordem ON alissonerp.movimentacoes_estoque USING btree (ordem_id)
- `idx_mov_marcador` — CREATE INDEX idx_mov_marcador ON alissonerp.movimentacoes_estoque USING btree (marcador)
- `idx_mov_data` — CREATE INDEX idx_mov_data ON alissonerp.movimentacoes_estoque USING btree (data_hora)
- `idx_mov_dep_ins` — CREATE INDEX idx_mov_dep_ins ON alissonerp.movimentacoes_estoque USING btree (deposito_id, insumo...
- `idx_movimentacoes_local_estoque` — CREATE INDEX idx_movimentacoes_local_estoque ON alissonerp.movimentacoes_estoque USING btree (loc...

**Triggers:**
- `trg_audit_mov_estoque` (AFTER INSERT)

---

## movimentacoes_estoque_comercial

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.movimentacoes_estoque_comercial_id_se... |
| produto_id | bigint | NO | — |
| tipo | character varying(10) | NO | — |
| quantidade | integer | NO | — |
| motivo | character varying(50) | NO | — |
| referencia_id | integer | YES | — |
| referencia_tipo | character varying(30) | YES | — |
| observacao | text | YES | — |
| created_by | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |
| devolucao_id | integer | YES | — |
| status | character varying(20) | NO | 'efetivado'::character varying |
| local_estoque_id | integer | NO | — |
| estorno_de_id | integer | YES | — |
| estornado_por_id | integer | YES | — |
| ordem_id | integer | YES | — |
| protocolo_id | integer | YES | — |

**FKs:**
- `devolucao_id` → `alissonerp.devolucoes_venda.id`
- `estornado_por_id` → `alissonerp.movimentacoes_estoque_comercial.id`
- `estorno_de_id` → `alissonerp.movimentacoes_estoque_comercial.id`
- `local_estoque_id` → `alissonerp.locais_estoque.id`

**Índices:**
- `idx_mov_ec_produto_id` — CREATE INDEX idx_mov_ec_produto_id ON alissonerp.movimentacoes_estoque_comercial USING btree (pro...
- `idx_mov_ec_created_at` — CREATE INDEX idx_mov_ec_created_at ON alissonerp.movimentacoes_estoque_comercial USING btree (cre...
- `idx_mov_ec_referencia` — CREATE INDEX idx_mov_ec_referencia ON alissonerp.movimentacoes_estoque_comercial USING btree (ref...
- `idx_mov_ec_devolucao` — CREATE INDEX idx_mov_ec_devolucao ON alissonerp.movimentacoes_estoque_comercial USING btree (devo...
- `idx_mov_ec_local` — CREATE INDEX idx_mov_ec_local ON alissonerp.movimentacoes_estoque_comercial USING btree (local_es...
- `idx_mov_ec_status` — CREATE INDEX idx_mov_ec_status ON alissonerp.movimentacoes_estoque_comercial USING btree (status)
- `idx_mov_ec_estorno_de` — CREATE INDEX idx_mov_ec_estorno_de ON alissonerp.movimentacoes_estoque_comercial USING btree (est...

---

## outros_insumos_distribuicao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.outros_insumos_distribuicao_id_seq'::... |
| distribuicao_id | integer | YES | — |
| insumo_id | integer | YES | — |
| peso | real | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |

**FKs:**
- `distribuicao_id` → `alissonerp.distribuicoes.id`
- `insumo_id` → `alissonerp.insumos.id`

**Triggers:**
- `trg_after_insert_outros_insumos_dist` (AFTER INSERT)

---

## outros_insumos_pcp

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.outros_insumos_pcp_id_seq'::regclass) |
| pcp_id | integer | YES | — |
| ordem_id | integer | YES | — |
| insumo_id | integer | YES | — |
| deposito_id | integer | YES | — |
| peso | real | YES | — |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `insumo_id` → `alissonerp.insumos.id`
- `ordem_id` → `alissonerp.ordens.id`
- `pcp_id` → `alissonerp.pcp.id`

**Triggers:**
- `trg_after_insert_outros_insumos_pcp` (AFTER INSERT)

---

## reservas_estoque_comercial

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.reservas_estoque_comercial_id_seq'::r... |
| produto_id | bigint | NO | — |
| venda_id | integer | NO | — |
| item_venda_id | integer | NO | — |
| quantidade | integer | NO | — |
| local_estoque_id | integer | NO | 2 |
| status | character varying(20) | NO | 'ativo'::character varying |
| efetivado_em | timestamp with time zone | YES | — |
| cancelado_em | timestamp with time zone | YES | — |
| movimento_id | integer | YES | — |
| created_by | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `item_venda_id` → `alissonerp.itens_venda_erp.id`
- `local_estoque_id` → `alissonerp.locais_estoque.id`
- `movimento_id` → `alissonerp.movimentacoes_estoque_comercial.id`
- `venda_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `idx_reservas_ec_produto` — CREATE INDEX idx_reservas_ec_produto ON alissonerp.reservas_estoque_comercial USING btree (produt...
- `idx_reservas_ec_item` — CREATE INDEX idx_reservas_ec_item ON alissonerp.reservas_estoque_comercial USING btree (item_vend...
- `idx_reservas_ec_status` — CREATE INDEX idx_reservas_ec_status ON alissonerp.reservas_estoque_comercial USING btree (status)
- `idx_reservas_ec_venda` — CREATE INDEX idx_reservas_ec_venda ON alissonerp.reservas_estoque_comercial USING btree (venda_id)
- `idx_reservas_ec_ativo` — CREATE INDEX idx_reservas_ec_ativo ON alissonerp.reservas_estoque_comercial USING btree (status) ...

---

## transferencias_estoque_comercial

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.transferencias_estoque_comercial_id_s... |
| produto_id | bigint | NO | — |
| quantidade | integer | NO | — |
| local_origem_id | integer | NO | — |
| local_destino_id | integer | NO | — |
| status | character varying(20) | NO | 'pendente'::character varying |
| obs | text | YES | — |
| enviado_por | uuid | YES | — |
| recebido_por | uuid | YES | — |
| recebido_em | timestamp with time zone | YES | — |
| cancelado_em | timestamp with time zone | YES | — |
| movimento_saida_id | integer | YES | — |
| movimento_entrada_id | integer | YES | — |
| created_by | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `local_destino_id` → `alissonerp.locais_estoque.id`
- `local_origem_id` → `alissonerp.locais_estoque.id`
- `movimento_entrada_id` → `alissonerp.movimentacoes_estoque_comercial.id`
- `movimento_saida_id` → `alissonerp.movimentacoes_estoque_comercial.id`

**Índices:**
- `idx_transf_ec_status` — CREATE INDEX idx_transf_ec_status ON alissonerp.transferencias_estoque_comercial USING btree (sta...
- `idx_transf_ec_produto` — CREATE INDEX idx_transf_ec_produto ON alissonerp.transferencias_estoque_comercial USING btree (pr...

---

## Views (10)

### vw_estoque_comercial_alerta_v2

```sql
 SELECT vw_saldo_estoque_comercial_consolidado.produto_id,
    vw_saldo_estoque_comercial_consolidado.nome_produto,
    vw_saldo_estoque_comercial_consolidado.sku,
...
```

### vw_estoque_directus

```sql
 SELECT ce.id,
    ce.entrada,
    ce.saida,
...
```

### vw_estoque_directus_saldo

```sql
 SELECT m.deposito_id,
    dep.nome AS deposito_nome,
    m.insumo_id,
...
```

### vw_estoque_ordem

```sql
 SELECT m.id,
    m.entrada,
    m.saida,
...
```

### vw_insumos_directus

```sql
 SELECT i.id,
    i.sku,
    i.nome,
...
```

### vw_quebra_por_deposito

```sql
 SELECT dep.id AS deposito_id,
    dep.nome AS deposito_nome,
    COALESCE(sum(
...
```

### vw_saldo_estoque

```sql
 SELECT me.deposito_id,
    me.insumo_id,
    me.local_estoque_id,
...
```

### vw_saldo_estoque_comercial

```sql
 SELECT m.produto_id,
    p.nome,
    p.sku,
...
```

### vw_saldo_estoque_comercial_consolidado

```sql
 SELECT vw_saldo_estoque_comercial_v2.produto_id,
    vw_saldo_estoque_comercial_v2.nome_produto,
    vw_saldo_estoque_comercial_v2.sku,
...
```

### vw_saldo_estoque_comercial_v2

```sql
 WITH mov_agg AS (
         SELECT movimentacoes_estoque_comercial.produto_id,
            movimentacoes_estoque_comercial.local_estoque_id,
...
```

