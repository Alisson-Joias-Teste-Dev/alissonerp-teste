# Schema alissonerp — vendas

> Gerado em: 2026-04-29 | Tabelas: 8

## comunicacoes_crediario

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.comunicacoes_crediario_id_seq'::regcl... |
| conta_receber_id | integer | NO | — |
| tipo | character varying(30) | NO | — |
| mensagem | text | NO | — |
| usuario_id | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `conta_receber_id` → `alissonerp.contas_receber.id`

**Índices:**
- `idx_com_cr_conta` — CREATE INDEX idx_com_cr_conta ON alissonerp.comunicacoes_crediario USING btree (conta_receber_id,...

---

## contas_receber

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.contas_receber_id_seq'::regclass) |
| descricao | text | NO | — |
| cliente_id | bigint | YES | — |
| venda_id | integer | YES | — |
| valor | numeric | NO | — |
| data_vencimento | date | YES | — |
| data_recebimento | date | YES | — |
| situacao | character varying(20) | YES | 'pendente'::character varying |
| categoria | character varying(50) | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| venda_erp_id | integer | YES | — |
| cliente_nome | text | YES | — |

**FKs:**
- `venda_erp_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `idx_cr_situacao` — CREATE INDEX idx_cr_situacao ON alissonerp.contas_receber USING btree (situacao)
- `idx_cr_vencimento` — CREATE INDEX idx_cr_vencimento ON alissonerp.contas_receber USING btree (data_vencimento)
- `idx_cr_venda_erp_id` — CREATE INDEX idx_cr_venda_erp_id ON alissonerp.contas_receber USING btree (venda_erp_id) WHERE ((...
- `idx_cr_situacao_venda` — CREATE INDEX idx_cr_situacao_venda ON alissonerp.contas_receber USING btree (situacao, venda_erp_...

---

## devolucoes_venda

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.devolucoes_venda_id_seq'::regclass) |
| numero | character varying(20) | NO | — |
| venda_id | integer | NO | — |
| tipo | character varying(20) | NO | — |
| motivo | text | YES | — |
| status | character varying(30) | NO | 'rascunho'::character varying |
| tipo_compensacao | character varying(30) | NO | — |
| valor_total_devolvido | numeric | NO | 0 |
| valor_retido | numeric | NO | 0 |
| valor_compensacao | numeric | NO | 0 |
| percentual_retencao | numeric | NO | 0 |
| foi_entregue | boolean | NO | false |
| tarefa_id | integer | YES | — |
| aprovador_id | uuid | YES | — |
| rejeitado_motivo | text | YES | — |
| criado_por | uuid | NO | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| aprovado_em | timestamp with time zone | YES | — |
| nota_fiscal_devolucao_id | integer | YES | — |
| nfe_numero | integer | YES | — |
| nfe_chave_44 | character varying(44) | YES | — |
| nfe_emitida_em | timestamp with time zone | YES | — |

**FKs:**
- `tarefa_id` → `alissonerp.tarefas.id`
- `venda_id` → `alissonerp.vendas_erp.id`
- `nota_fiscal_devolucao_id` → `alissonerp.notas_fiscais.id`

**Índices:**
- `devolucoes_venda_numero_key` — CREATE UNIQUE INDEX devolucoes_venda_numero_key ON alissonerp.devolucoes_venda USING btree (numero)
- `idx_devolucoes_venda` — CREATE INDEX idx_devolucoes_venda ON alissonerp.devolucoes_venda USING btree (venda_id)
- `idx_devolucoes_status` — CREATE INDEX idx_devolucoes_status ON alissonerp.devolucoes_venda USING btree (status)
- `idx_devolucoes_criado_por` — CREATE INDEX idx_devolucoes_criado_por ON alissonerp.devolucoes_venda USING btree (criado_por)
- `idx_devolucoes_tarefa` — CREATE INDEX idx_devolucoes_tarefa ON alissonerp.devolucoes_venda USING btree (tarefa_id) WHERE (...
- `idx_devolucoes_created` — CREATE INDEX idx_devolucoes_created ON alissonerp.devolucoes_venda USING btree (created_at DESC)
- `idx_devolucoes_nfe_chave` — CREATE INDEX idx_devolucoes_nfe_chave ON alissonerp.devolucoes_venda USING btree (nfe_chave_44) W...

**Triggers:**
- `trg_devolucoes_updated_at` (BEFORE UPDATE)

---

## gateways_pagamento

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.gateways_pagamento_id_seq'::regclass) |
| nome | text | NO | — |
| ativo | boolean | NO | true |
| ordem | integer | NO | 0 |
| created_at | timestamp with time zone | NO | now() |

**Índices:**
- `gateways_pagamento_nome_key` — CREATE UNIQUE INDEX gateways_pagamento_nome_key ON alissonerp.gateways_pagamento USING btree (nome)

---

## itens_venda_erp

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.itens_venda_erp_id_seq'::regclass) |
| venda_id | integer | NO | — |
| produto_id | bigint | YES | — |
| nome_produto | text | NO | — |
| sku | text | YES | — |
| quantidade | integer | NO | 1 |
| preco_lista | numeric | NO | — |
| pct_desconto | numeric | NO | 0 |
| preco_unitario | numeric | NO | — |
| total_item | numeric | NO | — |
| pct_comissao | numeric | NO | 0 |
| valor_comissao | numeric | NO | 0 |
| desconto_autorizado_por | uuid | YES | — |
| observacao | text | YES | — |
| peso_estimado | numeric | YES | — |
| created_at | timestamp with time zone | NO | now() |
| personalizacao | jsonb | YES | — |

**FKs:**
- `venda_id` → `alissonerp.vendas_erp.id`

**Triggers:**
- `trg_proteger_insert_itens_venda_fechada` (BEFORE INSERT)
- `trg_recalcular_totais_venda` (AFTER INSERT)
- `trg_recalcular_totais_venda` (AFTER DELETE)
- `trg_recalcular_totais_venda` (AFTER UPDATE)
- `trg_estoque_comercial_update_qtd_item` (AFTER UPDATE)
- `trg_proteger_itens_venda_fechada` (BEFORE DELETE)
- `trg_proteger_itens_venda_fechada` (BEFORE UPDATE)
- `trg_estoque_comercial_baixa_venda` (AFTER INSERT)
- `trg_estoque_comercial_reversao_item` (AFTER DELETE)

---

## pagamentos_venda

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.pagamentos_venda_id_seq'::regclass) |
| venda_id | integer | NO | — |
| forma | character varying(30) | NO | — |
| gateway | character varying(30) | YES | — |
| valor | numeric | NO | — |
| parcelas | integer | NO | 1 |
| status | character varying(20) | NO | 'pendente'::character varying |
| gateway_id | text | YES | — |
| gateway_payload | jsonb | YES | — |
| data_confirmacao | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | NO | now() |
| valor_liquido | numeric | YES | — |
| taxas_mp | numeric | YES | — |
| vale_troca_id | integer | YES | — |
| caixa_baixa_id | integer | YES | — |
| fin_gateway_id | integer | YES | — |
| ouro_gramas | numeric | YES | — |
| ouro_valor_grama | numeric | YES | — |
| source | character varying(20) | YES | — |

**FKs:**
- `caixa_baixa_id` → `alissonerp.fin_caixa_baixas.id`
- `fin_gateway_id` → `alissonerp.fin_gateways.id`
- `vale_troca_id` → `alissonerp.vale_troca.id`
- `venda_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `idx_pagamentos_venda_gateway_id` — CREATE INDEX idx_pagamentos_venda_gateway_id ON alissonerp.pagamentos_venda USING btree (gateway_...
- `idx_pagamentos_vale_troca` — CREATE INDEX idx_pagamentos_vale_troca ON alissonerp.pagamentos_venda USING btree (vale_troca_id)...
- `idx_pagamentos_venda_baixa` — CREATE INDEX idx_pagamentos_venda_baixa ON alissonerp.pagamentos_venda USING btree (caixa_baixa_i...
- `uq_pagamentos_gateway_id` — CREATE UNIQUE INDEX uq_pagamentos_gateway_id ON alissonerp.pagamentos_venda USING btree (gateway_id)

---

## vale_troca

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.vale_troca_id_seq'::regclass) |
| numero | character varying(20) | NO | — |
| devolucao_id | integer | YES | — |
| cliente_id | integer | YES | — |
| valor_original | numeric | NO | — |
| valor_disponivel | numeric | NO | — |
| status | character varying(20) | NO | 'ativo'::character varying |
| venda_utilizado_id | integer | YES | — |
| utilizado_em | timestamp with time zone | YES | — |
| vale_origem_id | integer | YES | — |
| created_at | timestamp with time zone | NO | now() |
| created_by | uuid | YES | — |

**FKs:**
- `devolucao_id` → `alissonerp.devolucoes_venda.id`
- `vale_origem_id` → `alissonerp.vale_troca.id`
- `venda_utilizado_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `vale_troca_numero_key` — CREATE UNIQUE INDEX vale_troca_numero_key ON alissonerp.vale_troca USING btree (numero)
- `idx_vale_troca_numero` — CREATE INDEX idx_vale_troca_numero ON alissonerp.vale_troca USING btree (numero)
- `idx_vale_troca_cliente` — CREATE INDEX idx_vale_troca_cliente ON alissonerp.vale_troca USING btree (cliente_id) WHERE (clie...
- `idx_vale_troca_status` — CREATE INDEX idx_vale_troca_status ON alissonerp.vale_troca USING btree (status)
- `idx_vale_troca_devolucao` — CREATE INDEX idx_vale_troca_devolucao ON alissonerp.vale_troca USING btree (devolucao_id) WHERE (...
- `idx_vale_troca_origem` — CREATE INDEX idx_vale_troca_origem ON alissonerp.vale_troca USING btree (vale_origem_id) WHERE (v...

---

## vendas_erp

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.vendas_erp_id_seq'::regclass) |
| numero_venda | text | NO | — |
| cliente_id | bigint | YES | — |
| vendedor_id | bigint | YES | — |
| data_venda | date | NO | CURRENT_DATE |
| data_entrega | date | YES | — |
| total_produtos | numeric | NO | 0 |
| total_desconto | numeric | NO | 0 |
| total_frete | numeric | NO | 0 |
| total_venda | numeric | NO | 0 |
| total_comissao | numeric | NO | 0 |
| situacao | character varying(20) | NO | 'rascunho'::character varying |
| forma_envio | character varying(50) | YES | — |
| forma_frete | character varying(50) | YES | — |
| observacoes | text | YES | — |
| observacoes_internas | text | YES | — |
| tiny_pedido_id | bigint | YES | — |
| tiny_sync_status | character varying(20) | YES | 'pendente'::character varying |
| tiny_sync_at | timestamp with time zone | YES | — |
| tiny_sync_erro | text | YES | — |
| bloqueado | boolean | NO | false |
| created_by | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| video_obs_interna | text | YES | — |
| token_compartilhamento | uuid | YES | gen_random_uuid() |
| public_venda_id | integer | YES | — |
| orcamento_id | integer | YES | — |
| endereco_entrega | text | YES | — |
| endereco_entrega_numero | text | YES | — |
| endereco_entrega_complemento | text | YES | — |
| endereco_entrega_bairro | text | YES | — |
| endereco_entrega_cidade | text | YES | — |
| endereco_entrega_cep | text | YES | — |
| endereco_entrega_uf | character varying(2) | YES | — |
| credito_gerente_usado | numeric | YES | 0 |
| aprovacao_credito_tipo | character varying(20) | YES | — |
| aprovacao_credito_tarefa_id | integer | YES | — |
| empresa_emitente_id | integer | YES | — |
| nota_fiscal_id | integer | YES | — |
| nfce_numero | integer | YES | — |
| nfce_chave_44 | character varying(44) | YES | — |
| nfce_emitida_em | timestamp with time zone | YES | — |
| tipo_venda | text | YES | — |
| numero_rastreio | text | YES | — |
| venda_garantia_id | integer | YES | — |
| desconto_aprovado_por | uuid | YES | — |
| desconto_aprovado_em | timestamp with time zone | YES | — |

**FKs:**
- `nota_fiscal_id` → `alissonerp.notas_fiscais.id`
- `aprovacao_credito_tarefa_id` → `alissonerp.tarefas.id`
- `empresa_emitente_id` → `alissonerp.empresas_emitentes.id`
- `orcamento_id` → `alissonerp.orcamentos.id`
- `venda_garantia_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `vendas_erp_numero_venda_key` — CREATE UNIQUE INDEX vendas_erp_numero_venda_key ON alissonerp.vendas_erp USING btree (numero_venda)
- `idx_vendas_erp_public_venda_id` — CREATE UNIQUE INDEX idx_vendas_erp_public_venda_id ON alissonerp.vendas_erp USING btree (public_v...
- `idx_vendas_orcamento` — CREATE INDEX idx_vendas_orcamento ON alissonerp.vendas_erp USING btree (orcamento_id) WHERE (orca...
- `idx_vendas_erp_empresa_emitente` — CREATE INDEX idx_vendas_erp_empresa_emitente ON alissonerp.vendas_erp USING btree (empresa_emiten...
- `idx_vendas_erp_nfce_chave` — CREATE INDEX idx_vendas_erp_nfce_chave ON alissonerp.vendas_erp USING btree (nfce_chave_44) WHERE...

**Triggers:**
- `trg_updated_at_vendas_erp` (BEFORE UPDATE)
- `trg_venda_gerar_conta_receber` (AFTER UPDATE)
- `trg_venda_cancelar_conta_receber` (BEFORE UPDATE)
- `trg_venda_gerar_conta_receber_insert` (AFTER INSERT)
- `trg_aa_proteger_venda_fechada` (BEFORE UPDATE)
- `trg_bloquear_venda` (BEFORE UPDATE)
- `trg_estoque_comercial_cancelamento_venda` (BEFORE UPDATE)
- `trg_estoque_comercial_entrega_venda` (BEFORE UPDATE)

---

## Views (7)

### vw_crediario

```sql
 SELECT cr.id AS conta_receber_id,
    cr.descricao,
    cr.valor,
...
```

### vw_dash_itens_venda

```sql
 SELECT itens_venda.id,
    itens_venda.venda_id,
    itens_venda.produto_id,
...
```

### vw_dash_vendas

```sql
 SELECT vendas.id,
    vendas.created_at,
    vendas.updated_at,
...
```

### vw_dash_vendas_todas

```sql
 SELECT 'legado'::text AS fonte,
    (v.id)::bigint AS id,
    v.data_venda,
...
```

### vw_vendas

```sql
 SELECT vendas.id,
    vendas.created_at,
    vendas.updated_at,
...
```

### vw_vendas_completa

```sql
 SELECT v.id,
    v.numero_pedido,
    v.data_venda,
...
```

### vw_vendas_erp_completa

```sql
 SELECT v.id,
    v.numero_venda,
    v.cliente_id,
...
```

