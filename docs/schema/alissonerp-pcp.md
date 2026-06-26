# Schema alissonerp — pcp

> Gerado em: 2026-04-29 | Tabelas: 17

## apontamentos_distribuicao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.apontamentos_distribuicao_id_seq'::re... |
| tipo_apontamento_id | integer | YES | — |
| deposito_id | integer | YES | — |
| setor_id | integer | YES | — |
| insumo_id | integer | YES | — |
| distribuicao_id | integer | YES | — |
| qtd | real | NO | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| foto_balanca | text | YES | — |
| peso_ct | numeric | YES | — |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `distribuicao_id` → `alissonerp.distribuicoes.id`
- `insumo_id` → `alissonerp.insumos.id`
- `setor_id` → `alissonerp.setores.id`
- `tipo_apontamento_id` → `alissonerp.tipos_apontamento.id`

**Triggers:**
- `trg_after_insert_apontamento_dist` (AFTER INSERT)

---

## apontamentos_pcp

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.apontamentos_pcp_id_seq'::regclass) |
| tipo_apontamento_id | integer | YES | — |
| deposito_id | integer | YES | — |
| setor_id | integer | YES | — |
| insumo_id | integer | YES | — |
| pcp_id | integer | YES | — |
| qtd | real | NO | — |
| marcador | jsonb | YES | — |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| foto_balanca | text | YES | — |
| peso_ct | numeric | YES | — |
| peso_g_pedra | numeric | YES | — |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `insumo_id` → `alissonerp.insumos.id`
- `pcp_id` → `alissonerp.pcp.id`
- `setor_id` → `alissonerp.setores.id`
- `tipo_apontamento_id` → `alissonerp.tipos_apontamento.id`

**Índices:**
- `idx_apt_pcp_pcp` — CREATE INDEX idx_apt_pcp_pcp ON alissonerp.apontamentos_pcp USING btree (pcp_id)

**Triggers:**
- `trg_after_insert_apontamento_pcp` (AFTER INSERT)

---

## apontamentos_pote

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.apontamentos_pote_id_seq'::regclass) |
| pcp_id | integer | YES | — |
| peso_bruto | real | YES | — |
| peso_liquido | real | YES | — |
| foto_balanca | uuid | YES | — |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |

**FKs:**
- `pcp_id` → `alissonerp.pcp.id`

---

## apontamentos_servico

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('alissonerp.apontamentos_servico_id_seq'::regclass) |
| servico_id | integer | NO | — |
| operador_id | integer | YES | — |
| operador_nome | text | YES | — |
| insumo_id | integer | NO | — |
| insumo_nome | text | YES | — |
| quantidade | numeric | NO | — |
| movimentacao_id | bigint | YES | — |
| foto_url | text | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `insumo_id` → `alissonerp.insumos.id`
- `movimentacao_id` → `alissonerp.movimentacoes_estoque.id`
- `operador_id` → `alissonerp.depositos.id`
- `servico_id` → `alissonerp.servicos.id`

**Índices:**
- `idx_apontamentos_servico_servico_id` — CREATE INDEX idx_apontamentos_servico_servico_id ON alissonerp.apontamentos_servico USING btree (...
- `idx_apontamentos_servico_operador_id` — CREATE INDEX idx_apontamentos_servico_operador_id ON alissonerp.apontamentos_servico USING btree ...

---

## distribuicao_ordens

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.distribuicao_ordens_id_seq'::regclass) |
| distribuicao_id | integer | YES | — |
| ordens_id | integer | YES | — |
| peso_bruto | numeric | YES | — |
| peso_pedras | numeric | YES | 0 |
| peso_ouro_real | numeric | YES | — |
| quebra | numeric | YES | — |
| ouro_entregue | numeric | YES | — |
| data_baixa | timestamp with time zone | YES | — |
| saida_por | uuid | YES | — |
| foto_balanca | text | YES | — |
| sem_peso | boolean | YES | false |
| justificativa_sem_peso | text | YES | — |

**FKs:**
- `distribuicao_id` → `alissonerp.distribuicoes.id`
- `ordens_id` → `alissonerp.ordens.id`

**Índices:**
- `distribuicao_ordens_distribuicao_id_ordens_id_key` — CREATE UNIQUE INDEX distribuicao_ordens_distribuicao_id_ordens_id_key ON alissonerp.distribuicao_...

**Triggers:**
- `trg_after_insert_distribuicao_ordem` (AFTER INSERT)

---

## distribuicao_saida_pedras

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.distribuicao_saida_pedras_id_seq'::re... |
| distribuicao_ordem_id | integer | NO | — |
| insumo_id | integer | NO | — |
| qtd_utilizada | integer | NO | — |
| peso_unitario | numeric | YES | — |
| peso_total | numeric | YES | — |
| peso_ct_utilizado | numeric | YES | — |

**FKs:**
- `distribuicao_ordem_id` → `alissonerp.distribuicao_ordens.id`
- `insumo_id` → `alissonerp.insumos.id`

---

## estornos_distribuicao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.estornos_distribuicao_id_seq'::regclass) |
| distribuicao_id | integer | NO | — |
| ordem_id | integer | YES | — |
| motivo | character varying(50) | NO | — |
| justificativa | text | NO | — |
| estornado_por | uuid | NO | — |
| dados_revertidos | jsonb | NO | '{}'::jsonb |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `distribuicao_id` → `alissonerp.distribuicoes.id`
- `ordem_id` → `alissonerp.ordens.id`

**Índices:**
- `idx_estornos_dist_ordem` — CREATE INDEX idx_estornos_dist_ordem ON alissonerp.estornos_distribuicao USING btree (ordem_id)
- `idx_estornos_dist_dist` — CREATE INDEX idx_estornos_dist_dist ON alissonerp.estornos_distribuicao USING btree (distribuicao...

---

## fechamentos_distribuicao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fechamentos_distribuicao_id_seq'::reg... |
| distribuicao_id | integer | YES | — |
| ordem_id | integer | YES | — |
| peso | real | YES | 0 |
| pmc | real | YES | 0 |
| total_pedras_un | real | YES | 0 |
| total_pedras_g | real | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| foto_balanca | text | YES | — |

**FKs:**
- `distribuicao_id` → `alissonerp.distribuicoes.id`
- `ordem_id` → `alissonerp.ordens.id`

**Índices:**
- `idx_unico_fechamento_dist` — CREATE UNIQUE INDEX idx_unico_fechamento_dist ON alissonerp.fechamentos_distribuicao USING btree ...

**Triggers:**
- `trg_fechamento_distribuicao` (AFTER INSERT)
- `trg_fechamento_distribuicao` (AFTER UPDATE)

---

## itens_distribuicao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.itens_distribuicao_id_seq'::regclass) |
| distribuicao_id | integer | YES | — |
| deposito_id | integer | YES | — |
| insumo_id | integer | YES | — |
| peso | real | YES | 0 |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `distribuicao_id` → `alissonerp.distribuicoes.id`
- `insumo_id` → `alissonerp.insumos.id`

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

## pcp

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.pcp_id_seq'::regclass) |
| etapas | USER-DEFINED | YES | 'novas_ordens'::alissonerp.enum_etapas_pcp |
| ordem_id | integer | YES | — |
| saida_ordem_id | integer | YES | — |
| operador | uuid | YES | — |
| bloqueado | boolean | YES | false |
| local_atual | boolean | YES | true |
| total_metal | real | YES | 0 |
| retorno_metal | real | YES | 0 |
| total_pedras_un | real | YES | 0 |
| total_pedras_g | real | YES | 0 |
| total_geral_outros_pesos | real | YES | 0 |
| total_outros_pesos_g | real | YES | 0 |
| pmc | real | YES | 0 |
| quebra | real | YES | 0 |
| porcentagem_de_quebra | real | YES | 0 |
| peso_final | real | YES | 0 |
| peso_unitario | real | YES | 0 |
| quantidade | real | YES | 0 |
| metal_externo | real | YES | 0 |
| data_conclusao | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| updated_by | uuid | YES | — |
| deposito_id | integer | YES | — |
| dist_ouro_real | real | YES | 0 |
| dist_pedras_qtd | real | YES | 0 |
| dist_pedras_g | real | YES | 0 |
| dist_quebra | real | YES | 0 |
| total_pedras_ct | numeric | YES | 0 |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `ordem_id` → `alissonerp.ordens.id`
- `saida_ordem_id` → `alissonerp.saidas_ordem.id`

**Índices:**
- `idx_pcp_ordem` — CREATE INDEX idx_pcp_ordem ON alissonerp.pcp USING btree (ordem_id)
- `idx_pcp_etapas` — CREATE INDEX idx_pcp_etapas ON alissonerp.pcp USING btree (etapas)

**Triggers:**
- `trg_audit_pcp` (AFTER INSERT)
- `trg_audit_pcp` (AFTER DELETE)
- `trg_audit_pcp` (AFTER UPDATE)
- `trg_criar_servico_from_pcp` (AFTER INSERT)

---

## protocolo_fotos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.protocolo_fotos_id_seq'::regclass) |
| protocolo_id | integer | YES | — |
| arquivo_id | uuid | YES | — |
| tipo | character varying(50) | YES | — |
| created_at | timestamp with time zone | YES | now() |
| foto_url | text | YES | — |
| foto_base64 | text | YES | — |

**FKs:**
- `protocolo_id` → `alissonerp.protocolos.id`

---

## protocolo_ordens

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.protocolo_ordens_id_seq'::regclass) |
| protocolo_id | integer | YES | — |
| ordem_id | integer | YES | — |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`
- `protocolo_id` → `alissonerp.protocolos.id`

**Índices:**
- `protocolo_ordens_protocolo_id_ordem_id_key` — CREATE UNIQUE INDEX protocolo_ordens_protocolo_id_ordem_id_key ON alissonerp.protocolo_ordens USI...

---

## protocolos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.protocolos_id_seq'::regclass) |
| direcao | USER-DEFINED | NO | — |
| etapas | USER-DEFINED | YES | 'pendente'::alissonerp.enum_etapas_protocolo |
| motoboy_id | uuid | YES | — |
| recebedor_id | uuid | YES | — |
| data_conclusao | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| foto_criacao | text | YES | — |
| foto_conclusao | text | YES | — |
| tipo_protocolo | character varying(20) | NO | 'fabrica'::character varying |

**Triggers:**
- `trg_audit_protocolos` (AFTER INSERT)
- `trg_audit_protocolos` (AFTER DELETE)
- `trg_audit_protocolos` (AFTER UPDATE)
- `trg_concluir_protocolo` (BEFORE UPDATE)

---

## saidas_distribuicao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.saidas_distribuicao_id_seq'::regclass) |
| deposito_id | integer | YES | — |
| pf | real | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`

---

## tipos_apontamento

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.tipos_apontamento_id_seq'::regclass) |
| descricao | character varying(100) | NO | — |
| scope | USER-DEFINED | NO | — |
| ativo | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |

---

## Views (7)

### vw_apontamentos_ordem

```sql
 SELECT a.id,
    a.pcp_id,
    p.ordem_id,
...
```

### vw_ordens_prontas_pcp

```sql
 SELECT DISTINCT o.id,
    o.numero_ordem,
    (o.status)::text AS status
...
```

### vw_pcp_completa

```sql
 SELECT p.id,
    p.ordem_id,
    p.etapas AS etapas_cod,
...
```

### vw_pcp_erp

```sql
 SELECT p.id,
    p.ordem_id,
    (p.etapas)::text AS etapas_cod,
...
```

### vw_protocolo_ordens

```sql
 SELECT po.id,
    po.protocolo_id,
    po.ordem_id,
...
```

### vw_protocolos_completo

```sql
 SELECT pr.id,
    (pr.direcao)::text AS direcao,
    (pr.etapas)::text AS etapas_cod,
...
```

### vw_protocolos_loja_completo

```sql
 SELECT pl.id,
    pl.rota AS direcao,
    pl.etapas AS etapas_cod,
...
```

