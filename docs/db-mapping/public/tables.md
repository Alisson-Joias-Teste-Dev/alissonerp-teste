# `public` — Tabelas

> 65 tabelas | gerado 2026-04-29

## Índice

- [`backup_itens_venda_3313`](#backup_itens_venda_3313)
- [`backup_itens_venda_pre_correcao_marco`](#backup_itens_venda_pre_correcao_marco)
- [`backup_itens_venda_test_3313`](#backup_itens_venda_test_3313)
- [`banco_imagens`](#banco_imagens)
- [`categoria_precificação`](#categoria_precificação)
- [`categorias`](#categorias)
- [`categorias_receitas_despesas`](#categorias_receitas_despesas)
- [`comissoes`](#comissoes)
- [`complementos_contatos`](#complementos_contatos)
- [`config_orcamento_aliancas`](#config_orcamento_aliancas)
- [`contas_a_pagar`](#contas_a_pagar)
- [`contas_a_receber`](#contas_a_receber)
- [`contatos`](#contatos)
- [`controle_de_execucao`](#controle_de_execucao)
- [`controle_entregas`](#controle_entregas) — Registros de entregas de pedidos realizadas pelo entregador
- [`controle_requisicao`](#controle_requisicao)
- [`controle_sequencia`](#controle_sequencia)
- [`cotacao`](#cotacao)
- [`estoque`](#estoque)
- [`ficha_tecnica`](#ficha_tecnica)
- [`ficha_tecnica_orcamento`](#ficha_tecnica_orcamento)
- [`ficha_tecnica_produto`](#ficha_tecnica_produto)
- [`fila_webhooks_n8n`](#fila_webhooks_n8n)
- [`fin_conciliacoes`](#fin_conciliacoes) — Match entre lançamentos bancários e contas_a_pagar
- [`fin_extratos_bancarios`](#fin_extratos_bancarios) — Extratos OFX/CSV importados pela Esmeralda
- [`fin_lancamentos_bancarios`](#fin_lancamentos_bancarios) — Lançamentos individuais do extrato bancário
- [`fonte_entrada_kommo`](#fonte_entrada_kommo)
- [`forma_envio`](#forma_envio)
- [`forma_frete`](#forma_frete)
- [`forma_pagamento`](#forma_pagamento)
- [`historico_ordem`](#historico_ordem)
- [`historico_preco`](#historico_preco)
- [`historico_venda_ja`](#historico_venda_ja)
- [`indicadores_marketing`](#indicadores_marketing)
- [`itens_da_ordem`](#itens_da_ordem)
- [`itens_pedido`](#itens_pedido)
- [`itens_venda`](#itens_venda)
- [`leads`](#leads)
- [`loock`](#loock)
- [`map_asana`](#map_asana)
- [`map_vendedor_kommo`](#map_vendedor_kommo)
- [`meio_pagamento`](#meio_pagamento)
- [`metas_mensais`](#metas_mensais)
- [`metas_por_hora`](#metas_por_hora)
- [`notificacoes`](#notificacoes) — Tabela de notificações do sistema
- [`orcamento`](#orcamento)
- [`ordem_compras`](#ordem_compras)
- [`pagamentos`](#pagamentos)
- [`parametros`](#parametros)
- [`parcelas_da_ordem`](#parcelas_da_ordem)
- [`parcelas_pedidos`](#parcelas_pedidos)
- [`pedidos`](#pedidos)
- [`produtos`](#produtos)
- [`public_links`](#public_links)
- [`recebimentos`](#recebimentos)
- [`relacao_tinny_moura`](#relacao_tinny_moura)
- [`solicitacoes_vale_troca`](#solicitacoes_vale_troca)
- [`staging_markup_aprovacao`](#staging_markup_aprovacao)
- [`suporte_conversas`](#suporte_conversas)
- [`teste`](#teste)
- [`tipos_contatos`](#tipos_contatos)
- [`user_profiles`](#user_profiles)
- [`vales_troca`](#vales_troca)
- [`vendas`](#vendas)
- [`vendedores`](#vendedores)

---

## backup_itens_venda_3313

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | ✓ | — | — |
| 2 | `venda_id` | integer | ✓ | — | — |
| 3 | `produto_id` | integer | ✓ | — | — |
| 4 | `sku` | text | ✓ | — | — |
| 5 | `quantidade` | numeric(10,2) | ✓ | — | — |
| 6 | `preco_tabela` | numeric(10,2) | ✓ | — | — |
| 7 | `preco_unitario_final` | numeric(10,2) | ✓ | — | — |
| 8 | `preco_total` | numeric(10,2) | ✓ | — | — |
| 9 | `desconto_percentual` | numeric(10,2) | ✓ | — | — |
| 10 | `desconto_valor` | numeric(10,2) | ✓ | — | — |
| 11 | `comissao_valor` | numeric(10,2) | ✓ | — | — |
| 12 | `comissao_percentual` | numeric | ✓ | — | — |
| 13 | `n8n` | boolean | ✓ | — | — |

_Sem referência identificada no código._

---

## backup_itens_venda_pre_correcao_marco

**Aprox. linhas:** 303

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | ✓ | — | — |
| 2 | `venda_id` | integer | ✓ | — | — |
| 3 | `produto_id` | integer | ✓ | — | — |
| 4 | `sku` | text | ✓ | — | — |
| 5 | `quantidade` | numeric(10,2) | ✓ | — | — |
| 6 | `preco_tabela` | numeric(10,2) | ✓ | — | — |
| 7 | `preco_unitario_final` | numeric(10,2) | ✓ | — | — |
| 8 | `preco_total` | numeric(10,2) | ✓ | — | — |
| 9 | `desconto_percentual` | numeric(10,2) | ✓ | — | — |
| 10 | `desconto_valor` | numeric(10,2) | ✓ | — | — |
| 11 | `comissao_valor` | numeric(10,2) | ✓ | — | — |
| 12 | `comissao_percentual` | numeric | ✓ | — | — |
| 13 | `n8n` | boolean | ✓ | — | — |

_Sem referência identificada no código._

---

## backup_itens_venda_test_3313

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | ✓ | — | — |
| 2 | `venda_id` | integer | ✓ | — | — |
| 3 | `produto_id` | integer | ✓ | — | — |
| 4 | `sku` | text | ✓ | — | — |
| 5 | `quantidade` | numeric(10,2) | ✓ | — | — |
| 6 | `preco_tabela` | numeric(10,2) | ✓ | — | — |
| 7 | `preco_unitario_final` | numeric(10,2) | ✓ | — | — |
| 8 | `preco_total` | numeric(10,2) | ✓ | — | — |
| 9 | `desconto_percentual` | numeric(10,2) | ✓ | — | — |
| 10 | `desconto_valor` | numeric(10,2) | ✓ | — | — |
| 11 | `comissao_valor` | numeric(10,2) | ✓ | — | — |
| 12 | `comissao_percentual` | numeric | ✓ | — | — |
| 13 | `n8n` | boolean | ✓ | — | — |

_Sem referência identificada no código._

---

## banco_imagens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `produto_id_api` | bigint | ✓ | — | — |
| 3 | `imagem` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `banco_imagens_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## categoria_precificação

**Aprox. linhas:** 9

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `categoryName` | character varying | ✓ | — | — |
| 4 | `range` | character varying | ✓ | — | — |
| 6 | `curvePoints` | _jsonb | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `categoria_precificação_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

**Uso no código:**
- `public.categoria_precificação` — 5 ocorrência(s)
  - `src/app/api/precificacao/markup-ouro/route.ts:32`
  - `src/app/api/precificacao/simular/route.ts:70`
  - `src/app/api/produtos/setup/route.ts:5`
  - `src/app/api/produtos/setup/route.ts:42`
  - `supabase/migrations/059_markup_alteracoes.sql:14`

---

## categorias

**Aprox. linhas:** 64

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `descricao` | character varying(255) | — | — | — |
| 3 | `pai_id` | bigint | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `categorias_pkey` — (`id`)

### Índices

- `idx_categorias_pai_id` — `CREATE INDEX idx_categorias_pai_id ON public.categorias USING btree (pai_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Directus` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.categorias` — 130 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/insumos/InsumosClient.tsx:94`
  - `src/app/(dashboard)/insumos/InsumosClient.tsx:101`
  - `src/app/(dashboard)/insumos/InsumosClient.tsx:104`
  - `src/app/(dashboard)/insumos/InsumosClient.tsx:181`
  - `src/app/(dashboard)/insumos/InsumosClient.tsx:292`

---

## categorias_receitas_despesas

**Aprox. linhas:** 190

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_categoria` | bigint | — | — | — |
| 2 | `id_api_categoria` | bigint | ✓ | — | — |
| 3 | `descricao` | text | ✓ | — | — |
| 4 | `grupo` | text | ✓ | — | — |

### Chaves

- **UNIQUE** `categorias_receitas_despesas_id_categoria_key` — (`id_api_categoria`)
- **UNIQUE** `categorias_receitas_despesas_id_key` — (`id_categoria`)
- **PRIMARY KEY** `categorias_receitas_despesas_pkey` — (`id_categoria`)

### Índices

- `categorias_receitas_despesas_id_categoria_key` — `CREATE UNIQUE INDEX categorias_receitas_despesas_id_categoria_key ON public.categorias_receitas_despesas USING btree (id_api_categoria)`
- `categorias_receitas_despesas_id_key` — `CREATE UNIQUE INDEX categorias_receitas_despesas_id_key ON public.categorias_receitas_despesas USING btree (id_categoria)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_categorias_receitas_despesas` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_categorias_receitas_despesas` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_categorias_receitas_despesas` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_categorias_receitas_despesas` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## comissoes

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `nome` | character varying | ✓ | — | — |
| 4 | `tabela` | json | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `comissoes_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `erp` (ALL, PERMISSIVE) roles=anon
    USING: `true`

**Uso no código:**
- `public.comissoes` — 22 ocorrência(s)
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:141`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4736`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4798`
  - `src/app/(dashboard)/vendas/analise-comissoes/AnaliseComissoesClient.tsx:77`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClient.tsx:247`

---

## complementos_contatos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `produtos_interessse` | text | ✓ | — | — |
| 3 | `instagram` | text | ✓ | — | — |
| 4 | `orcamento_mensal` | text | ✓ | — | — |
| 5 | `data_casamento` | text | ✓ | — | — |
| 6 | `data_noivado` | text | ✓ | — | — |
| 7 | `contato_id_api` | bigint | ✓ | — | — |
| 8 | `estado_civil` | text | ✓ | — | — |

### Chaves

- **UNIQUE** `complementos_contatos_contato_id_api_key` — (`contato_id_api`)
- **PRIMARY KEY** `complementos_contatos_pkey` — (`id`)

### Índices

- `complementos_contatos_contato_id_api_key` — `CREATE UNIQUE INDEX complementos_contatos_contato_id_api_key ON public.complementos_contatos USING btree (contato_id_api)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_complementos_contatos` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_complementos_contatos` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_complementos_contatos` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_complementos_contatos` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## config_orcamento_aliancas

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `name` | text | — | — | — |
| 3 | `start_mkp` | numeric | ✓ | — | — |
| 4 | `discount_percent` | numeric | ✓ | — | — |
| 5 | `gold_price` | numeric | ✓ | — | — |
| 6 | `camera_override` | numeric | ✓ | — | — |
| 7 | `profile` | text | ✓ | — | — |
| 8 | `pricing_categories` | jsonb | — | — | — |
| 9 | `groove_rules` | jsonb | — | — | — |
| 10 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 11 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **UNIQUE** `config_orcamento_aliancas_name_key` — (`name`)
- **PRIMARY KEY** `config_orcamento_aliancas_pkey` — (`id`)

### Índices

- `config_orcamento_aliancas_name_idx` — `CREATE UNIQUE INDEX config_orcamento_aliancas_name_idx ON public.config_orcamento_aliancas USING btree (lower(name))`
- `config_orcamento_aliancas_name_key` — `CREATE UNIQUE INDEX config_orcamento_aliancas_name_key ON public.config_orcamento_aliancas USING btree (name)`

### Triggers

- `set_updated_at` — BEFORE UPDATE → `public.set_updated_at` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 3
  - `config_select_by_manager_flag` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(EXISTS ( SELECT 1    FROM vendedores v   WHERE ((TRIM(BOTH FROM lower(v.email)) = TRIM(BOTH FROM lower(auth.email()))) AND (v.gerente_orcamento = true))))`
  - `config_write_insert_by_manager_flag` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `(EXISTS ( SELECT 1    FROM vendedores v   WHERE ((TRIM(BOTH FROM lower(v.email)) = TRIM(BOTH FROM lower(auth.email()))) AND (v.gerente_orcamento = true))))`
  - `config_write_update_by_manager_flag` (UPDATE, PERMISSIVE) roles=authenticated
    USING: `true`
    WITH CHECK: `(EXISTS ( SELECT 1    FROM vendedores v   WHERE ((TRIM(BOTH FROM lower(v.email)) = TRIM(BOTH FROM lower(auth.email()))) AND (v.gerente_orcamento = true))))`

_Sem referência identificada no código._

---

## contas_a_pagar

**Aprox. linhas:** 8390

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `id_api_conta` | bigint | ✓ | — | — |
| 3 | `situacao` | text | ✓ | — | — |
| 4 | `data` | date | ✓ | — | — |
| 5 | `data_vencimento` | date | ✓ | — | — |
| 6 | `data_competencia` | date | ✓ | — | — |
| 7 | `data_liquidacao` | date | ✓ | — | — |
| 8 | `dia_vencimento` | text | ✓ | — | — |
| 9 | `dia_semanavencimento` | text | ✓ | — | — |
| 10 | `numero_documento` | text | ✓ | — | — |
| 11 | `serie_documento` | text | ✓ | — | — |
| 12 | `ocorrencia` | text | ✓ | — | — |
| 13 | `qtd_parcelas` | text | ✓ | — | — |
| 14 | `valor` | float8 | ✓ | — | — |
| 15 | `saldo` | float8 | ✓ | — | — |
| 16 | `valor_pago` | float8 | ✓ | — | — |
| 17 | `multa` | float8 | ✓ | — | — |
| 18 | `juros` | float8 | ✓ | — | — |
| 19 | `forma_pagamento` | text | ✓ | — | — |
| 20 | `historico` | text | ✓ | — | — |
| 21 | `marcador` | text | ✓ | — | — |
| 22 | `fornecedor_id_api` | bigint | ✓ | — | — |
| 23 | `categoria_id_api` | bigint | ✓ | — | — |
| 24 | `hash` | text | ✓ | — | — |

### Chaves

- **UNIQUE** `contas_a_pagar_id_api_conta_key` — (`id_api_conta`)
- **PRIMARY KEY** `contas_a_pagar_pkey` — (`id`)

### Índices

- `contas_a_pagar_id_api_conta_key` — `CREATE UNIQUE INDEX contas_a_pagar_id_api_conta_key ON public.contas_a_pagar USING btree (id_api_conta)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_contas_a_pagar` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_contas_a_pagar` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_contas_a_pagar` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_contas_a_pagar` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## contas_a_receber

**Aprox. linhas:** 4450

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `id_api_conta` | bigint | ✓ | — | — |
| 3 | `situacao` | character varying | ✓ | — | — |
| 4 | `data` | date | ✓ | — | — |
| 5 | `data_vencimento` | date | ✓ | — | — |
| 6 | `data_competencia` | date | ✓ | — | — |
| 7 | `data_liquidacao` | date | ✓ | — | — |
| 8 | `dia_vencimento` | numeric | ✓ | — | — |
| 9 | `dia_semana_vencimento` | numeric | ✓ | — | — |
| 10 | `numero_documento` | character varying | ✓ | — | — |
| 11 | `serie_documento` | numeric | ✓ | — | — |
| 12 | `ocorrencia` | character varying | ✓ | — | — |
| 13 | `quantidade_parcelas` | numeric | ✓ | — | — |
| 14 | `valor` | numeric | ✓ | — | — |
| 15 | `saldo` | numeric | ✓ | — | — |
| 16 | `juros` | numeric | ✓ | — | — |
| 17 | `multa` | numeric | ✓ | — | — |
| 18 | `valor_pago` | numeric | ✓ | — | — |
| 19 | `cliente_id_api` | bigint | ✓ | — | — |
| 20 | `categoria_id_api` | bigint | ✓ | — | — |
| 21 | `forma_recebimento` | character varying | ✓ | — | — |
| 22 | `historico` | character varying | ✓ | — | — |
| 23 | `link_boleto` | character varying | ✓ | — | — |
| 24 | `qtd_parcelas_antecipadas` | numeric | ✓ | — | — |
| 25 | `marcadores` | character varying | ✓ | — | — |
| 26 | `hash` | text | ✓ | — | — |
| 27 | `pedido_id_api` | bigint | ✓ | — | — |

### Chaves

- **UNIQUE** `contas_a_receber_id_api_conta_key` — (`id_api_conta`)
- **PRIMARY KEY** `contas_a_receber_pkey` — (`id`)

### Índices

- `contas_a_receber_id_api_conta_key` — `CREATE UNIQUE INDEX contas_a_receber_id_api_conta_key ON public.contas_a_receber USING btree (id_api_conta)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `Directus-select` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `consulta_get_n8n` (SELECT, PERMISSIVE) roles=anon
    USING: `true`

_Sem referência identificada no código._

---

## contatos

**Aprox. linhas:** 2605

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_contato` | bigint | — | — | — |
| 2 | `id_api_contato` | bigint | ✓ | — | — |
| 3 | `tipo_idapi` | bigint | ✓ | — | — |
| 4 | `nome` | text | ✓ | — | — |
| 5 | `codigo` | text | ✓ | — | — |
| 6 | `fantasia` | text | ✓ | — | — |
| 7 | `tipo_pessoa` | text | ✓ | — | — |
| 8 | `cpf_cnpj` | text | ✓ | — | — |
| 9 | `inscricao_estadual` | text | ✓ | — | — |
| 10 | `rg` | text | ✓ | — | — |
| 11 | `telefone` | text | ✓ | — | — |
| 12 | `celular` | text | ✓ | — | — |
| 13 | `email` | text | ✓ | — | — |
| 14 | `endereco` | text | ✓ | — | — |
| 15 | `numero` | text | ✓ | — | — |
| 16 | `complemento` | text | ✓ | — | — |
| 17 | `bairro` | text | ✓ | — | — |
| 18 | `municipio` | text | ✓ | — | — |
| 19 | `cep` | text | ✓ | — | — |
| 20 | `uf` | text | ✓ | — | — |
| 21 | `pais` | text | ✓ | — | — |
| 22 | `vendedor_idapi` | bigint | ✓ | — | — |
| 23 | `data_atualizacao` | timestamp with time zone | ✓ | — | — |
| 24 | `id_kommo` | bigint | ✓ | — | — |

### Chaves

- **UNIQUE** `contatos_cpf_cnpj_key` — (`cpf_cnpj`)
- **UNIQUE** `contatos_id_api_contato_key` — (`id_api_contato`)
- **PRIMARY KEY** `contatos_pkey` — (`id_contato`)

### Índices

- `contatos_cpf_cnpj_key` — `CREATE UNIQUE INDEX contatos_cpf_cnpj_key ON public.contatos USING btree (cpf_cnpj)`
- `contatos_id_api_contato_key` — `CREATE UNIQUE INDEX contatos_id_api_contato_key ON public.contatos USING btree (id_api_contato)`

### Triggers

- `Webhook Contatos Envio tiny` — AFTER INSERT/UPDATE → `supabase_functions.http_request` 
- `on_contatos_update` — BEFORE INSERT/UPDATE → `public.registrar_modificacao_contatos` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 5
  - `Enable read access for all users` (ALL, PERMISSIVE) roles=public
    USING: `true`
  - `directus_delete_contatos` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_contatos` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_contatos` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_contatos` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.contatos` — 59 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/orcamento/OrcamentoClient.tsx:480`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClient.tsx:532`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClient.tsx:566`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClientLegado.tsx:527`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClientLegado.tsx:561`

---

## controle_de_execucao

**Aprox. linhas:** 11

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `timestamp` | timestamp with time zone | ✓ | — | — |
| 3 | `descricao` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `controle_de_execucao_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_controle_de_execucao` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_controle_de_execucao` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_controle_de_execucao` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_controle_de_execucao` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## controle_entregas

> Registros de entregas de pedidos realizadas pelo entregador

**Aprox. linhas:** 206

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('controle_entregas_id_seq'::regclass)` | — |
| 2 | `pedido_id` | bigint | ✓ | — | ID da venda entregue (referencia vendas.id) |
| 3 | `entregador_responsavel` | text | — | — | Nome do entregador responsável pela entrega |
| 4 | `data_entrega` | timestamp with time zone | — | — | Data em que a entrega foi realizada |
| 5 | `valor_entrega` | numeric(10,2) | — | — | Valor cobrado pela entrega |
| 6 | `observacoes` | text | ✓ | — | Observações op… obrigatório) |
| 7 | `anexos_path` | _text | — | — | — |
| 8 | `numero_pedido_plataforma` | text | ✓ | — | Snapshot: Número do pedido na plataforma (n_pedido_ecommerce) |
| 9 | `numero_pedido_tiny` | text | ✓ | — | Snapshot: Número do pedido no Tiny (numero_pedido) |
| 10 | `nome_cliente` | text | — | — | Snapshot: Nome do cliente no momento da entrega |
| 11 | `frete_pago_cliente` | numeric(10,2) | ✓ | — | Snapshot: Valor do frete pago pelo cliente |
| 12 | `bairro_entrega` | text | ✓ | — | Snapshot: Bairro de entrega do pedido |
| 13 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 14 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 15 | `created_by` | uuid | ✓ | — | UUID do usuário que criou o registro (referencia user_profiles.id_user) |
| 16 | `vendedor_responsavel_id` | bigint | — | — | — |
| 17 | `entrega_type` | character varying(100) | — | — | — |
| 18 | `status_aprovacao` | character varying(100) | — | `'3'::character varying` | — |
| 19 | `descricao_entrega` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `controle_entregas_pkey` — (`id`)

### CHECK constraints

- `check_entrega_type_values` — `CHECK (((entrega_type)::text = ANY ((ARRAY['1'::character varying, '2'::character varying])::text[])))`
- `check_status_aprovacao_values` — `CHECK (((status_aprovacao)::text = ANY ((ARRAY['1'::character varying, '2'::character varying, '3'::character varying])::text[])))`

### Índices

- `idx_entregas_created_at` — `CREATE INDEX idx_entregas_created_at ON public.controle_entregas USING btree (created_at DESC)`
- `idx_entregas_data` — `CREATE INDEX idx_entregas_data ON public.controle_entregas USING btree (data_entrega)`
- `idx_entregas_data_entrega` — `CREATE INDEX idx_entregas_data_entrega ON public.controle_entregas USING btree (data_entrega DESC)`
- `idx_entregas_entregador` — `CREATE INDEX idx_entregas_entregador ON public.controle_entregas USING btree (entregador_responsavel)`
- `idx_entregas_pedido_id` — `CREATE INDEX idx_entregas_pedido_id ON public.controle_entregas USING btree (pedido_id)`
- `idx_entregas_status` — `CREATE INDEX idx_entregas_status ON public.controle_entregas USING btree (status_aprovacao)`
- `idx_entregas_status_data` — `CREATE INDEX idx_entregas_status_data ON public.controle_entregas USING btree (status_aprovacao, data_entrega)`
- `idx_entregas_type` — `CREATE INDEX idx_entregas_type ON public.controle_entregas USING btree (entrega_type)`
- `idx_entregas_type_and_data` — `CREATE INDEX idx_entregas_type_and_data ON public.controle_entregas USING btree (entrega_type, data_entrega)`

### Triggers

- `trigger_entregas_updated_at` — BEFORE UPDATE → `public.update_entregas_updated_at` 
- `trigger_sync_venda_entregue` — AFTER INSERT/DELETE → `public.sync_venda_entregue` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## controle_requisicao

**Aprox. linhas:** 2

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 3 | `nome_fluxo` | text | ✓ | — | — |
| 4 | `duração` | text | ✓ | — | — |
| 5 | `total_reqs` | text | ✓ | — | — |
| 6 | `reqs_minuto` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `controle_requisicao_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_controle_requisicao` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_controle_requisicao` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_controle_requisicao` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_controle_requisicao` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## controle_sequencia

**Aprox. linhas:** 1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `nome_tabela` | text | — | — | — |
| 2 | `ultimo_numero` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `controle_sequencia_pkey` — (`nome_tabela`)

_Sem referência identificada no código._

---

## cotacao

**Aprox. linhas:** 1792

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `data_hora` | timestamp without time zone | ✓ | — | — |
| 3 | `moeda` | text | ✓ | — | — |
| 4 | `cotacao` | float4 | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `cotacao_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_cotacao` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_cotacao` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_cotacao` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_cotacao` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.cotacao` — 45 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/precificacao/page.tsx:74`
  - `src/app/(dashboard)/precificacao/page.tsx:87`
  - `src/app/(dashboard)/precificacao/page.tsx:88`
  - `src/app/(dashboard)/precificacao/PrecificacaoClient.tsx:101`
  - `src/app/(dashboard)/precificacao/PrecificacaoClient.tsx:2062`

---

## estoque

**Aprox. linhas:** 15725

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_estoque` | bigint | — | — | — |
| 2 | `produto_id_api` | bigint | ✓ | — | — |
| 3 | `sku` | character varying | ✓ | — | — |
| 4 | `estoque_loja` | numeric | ✓ | — | — |
| 5 | `estoque_reposicao_srvc` | numeric | ✓ | — | — |
| 6 | `estoque_marketing` | numeric | ✓ | — | — |
| 7 | `estoque_alisson` | numeric | ✓ | — | — |
| 8 | `estoque_dara` | numeric | ✓ | — | — |
| 9 | `estoque_service` | numeric | ✓ | — | — |
| 10 | `estoque_fabrica` | numeric | ✓ | — | — |
| 11 | `saldo` | bigint | ✓ | — | — |
| 12 | `reserva` | bigint | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `estoque_pkey` — (`id_estoque`)
- **UNIQUE** `estoque_produto_id_api_key` — (`produto_id_api`)

### Índices

- `estoque_produto_id_api_key` — `CREATE UNIQUE INDEX estoque_produto_id_api_key ON public.estoque USING btree (produto_id_api)`

### Triggers

- `trigger_atualizar_saldo_estoque` — BEFORE INSERT/UPDATE → `public.atualizar_saldo_estoque` 
- `webhook_estoque_insert_seguro` — AFTER INSERT → `supabase_functions.http_request` 
- `webhook_estoque_update_seguro` — AFTER UPDATE → `supabase_functions.http_request` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `erp` (ALL, PERMISSIVE) roles=anon
    USING: `true`

**Uso no código:**
- `public.estoque` — 356 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1823`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1841`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:3553`
  - `src/app/(dashboard)/devolucoes/[id]/DevolucaoDetalheClient.tsx:235`
  - `src/app/(dashboard)/devolucoes/[id]/DevolucaoDetalheClient.tsx:636`

---

## ficha_tecnica

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `descricao` | text | ✓ | — | — |
| 4 | `ficha_tecnica` | json | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `ficha_tecnica_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `Alisson ERP` (ALL, PERMISSIVE) roles=anon
    USING: `true`
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.ficha_tecnica` — 2 ocorrência(s)
  - `src/app/api/vendas/[id]/pdf/route.ts:145`
  - `src/lib/gerar-pdf-orcamento.ts:52`

---

## ficha_tecnica_orcamento

**Aprox. linhas:** 3

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `modelo` | character varying | ✓ | — | — |
| 4 | `aro_numeracao` | character varying | ✓ | — | — |
| 5 | `largura` | character varying | ✓ | — | — |
| 6 | `espessura` | character varying | ✓ | — | — |
| 7 | `peso_estimado` | character varying | ✓ | — | — |
| 8 | `tipo_fonte` | character varying | ✓ | — | — |
| 9 | `texto` | text | ✓ | — | — |
| 10 | `qtd_pedras` | character varying | ✓ | — | — |
| 11 | `tamanho_pedra` | character varying | ✓ | — | — |
| 12 | `tipo_aplicacao_pedra` | character varying | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `ficha_tecnica_orcamento_pkey` — (`id`)

### Índices

- `idx_ficha_tecnica_orc_id` — `CREATE INDEX idx_ficha_tecnica_orc_id ON public.ficha_tecnica_orcamento USING btree (id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 3
  - `Allow insert ficha tecnica` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `true`
  - `Allow select ficha tecnica` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## ficha_tecnica_produto

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `produto_id` | bigint | ✓ | — | — |
| 4 | `modelo` | character varying | ✓ | — | — |
| 5 | `largura` | numeric | ✓ | — | — |
| 6 | `espessura` | numeric | ✓ | — | — |
| 7 | `peso_estimado` | numeric | ✓ | — | — |
| 8 | `tipo_fonte` | character varying | ✓ | — | — |
| 9 | `texto` | character varying | ✓ | — | — |
| 10 | `qtd_pedras` | numeric | ✓ | — | — |
| 11 | `tamanho_pedra` | numeric | ✓ | — | — |
| 12 | `tipo_apilicacao_pedra` | numeric | ✓ | — | — |
| 13 | `aro_numeracao` | character varying | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `ficha_tecnica_produto_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `Directus` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## fila_webhooks_n8n

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `enviado` | boolean | — | `false` | — |
| 4 | `criado_em` | timestamp with time zone | — | `now()` | — |
| 5 | `enviado_em` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `fila_webhooks_n8n_pkey` — (`id`)

### Índices

- `idx_fila_webhooks_pendentes` — `CREATE INDEX idx_fila_webhooks_pendentes ON public.fila_webhooks_n8n USING btree (enviado) WHERE (enviado = false)`

### Triggers

- `trg_webhook_novo_produto` — AFTER INSERT → `public.disparar_webhook_n8n` 

_Sem referência identificada no código._

---

## fin_conciliacoes

> Match entre lançamentos bancários e contas_a_pagar

**Aprox. linhas:** 14

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('fin_conciliacoes_id_seq'::regclass)` | — |
| 2 | `lancamento_id` | bigint | — | — | — |
| 3 | `conta_pagar_id` | bigint | — | — | — |
| 4 | `status` | text | — | `'confirmado'::text` | — |
| 5 | `diferenca_valor` | numeric(12,2) | — | `0` | — |
| 6 | `diferenca_dias` | integer | — | `0` | — |
| 7 | `confirmado_em` | timestamp with time zone | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `fin_conciliacoes_conta_pagar_id_key` — (`conta_pagar_id`)
- **UNIQUE** `fin_conciliacoes_lancamento_id_key` — (`lancamento_id`)
- **PRIMARY KEY** `fin_conciliacoes_pkey` — (`id`)

### Foreign Keys (saída)

- `lancamento_id` → `public.fin_lancamentos_bancarios.id` (UPDATE NO ACTION, DELETE NO ACTION)

### CHECK constraints

- `fin_conciliacoes_status_check` — `CHECK ((status = ANY (ARRAY['confirmado'::text, 'divergente'::text])))`

### Índices

- `fin_conciliacoes_conta_pagar_id_key` — `CREATE UNIQUE INDEX fin_conciliacoes_conta_pagar_id_key ON public.fin_conciliacoes USING btree (conta_pagar_id)`
- `fin_conciliacoes_lancamento_id_key` — `CREATE UNIQUE INDEX fin_conciliacoes_lancamento_id_key ON public.fin_conciliacoes USING btree (lancamento_id)`
- `idx_fin_conc_status` — `CREATE INDEX idx_fin_conc_status ON public.fin_conciliacoes USING btree (status)`

**Uso no código:**
- `public.fin_conciliacoes` — 8 ocorrência(s)
  - `src/__tests__/conciliar.test.ts:19`
  - `src/__tests__/conciliar.test.ts:374`
  - `src/__tests__/conciliar.test.ts:421`
  - `src/__tests__/conciliar.test.ts:439`
  - `src/__tests__/conciliar.test.ts:470`

---

## fin_extratos_bancarios

> Extratos OFX/CSV importados pela Esmeralda

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('fin_extratos_bancarios_id_seq'::regclass)` | — |
| 2 | `banco` | text | — | — | — |
| 3 | `nome_arquivo` | text | ✓ | — | — |
| 4 | `status` | text | — | `'processando'::text` | — |
| 5 | `total_importado` | integer | ✓ | `0` | — |
| 6 | `total_conciliado` | integer | ✓ | `0` | — |
| 7 | `total_divergencias` | integer | ✓ | `0` | — |
| 8 | `importado_em` | timestamp with time zone | — | `now()` | — |
| 9 | `arquivo_id` | uuid | ✓ | — | — |
| 10 | `conteudo_ofx` | text | ✓ | — | — |
| 11 | `n8n_execution_id` | character varying(255) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `fin_extratos_bancarios_pkey` — (`id`)

### Referenciada por (entrada)

- `public.fin_lancamentos_bancarios.extrato_id` (constraint `fin_lancamentos_bancarios_extrato_id_fkey`)

### CHECK constraints

- `fin_extratos_bancarios_status_check` — `CHECK ((status = ANY (ARRAY['processando'::text, 'concluido'::text, 'erro'::text])))`

**Uso no código:**
- `public.fin_extratos_bancarios` — 3 ocorrência(s)
  - `src/__tests__/extratos.test.ts:120`
  - `src/__tests__/lancamentos.test.ts:94`
  - `src/__tests__/lancamentos.test.ts:100`

---

## fin_lancamentos_bancarios

> Lançamentos individuais do extrato bancário

**Aprox. linhas:** 25

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('fin_lancamentos_bancarios_id_seq'::regclass)` | — |
| 2 | `extrato_id` | bigint | — | — | — |
| 3 | `data_lancamento` | date | — | — | — |
| 4 | `descricao` | text | ✓ | — | — |
| 5 | `valor` | numeric(12,2) | — | — | — |
| 6 | `tipo` | text | — | — | — |
| 7 | `fitid` | text | — | — | ID único OFX — garante idempotência no reimport |

### Chaves

- **UNIQUE** `fin_lancamentos_bancarios_extrato_id_fitid_key` — (`extrato_id`, `fitid`)
- **PRIMARY KEY** `fin_lancamentos_bancarios_pkey` — (`id`)

### Foreign Keys (saída)

- `extrato_id` → `public.fin_extratos_bancarios.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `public.fin_conciliacoes.lancamento_id` (constraint `fin_conciliacoes_lancamento_id_fkey`)

### CHECK constraints

- `fin_lancamentos_bancarios_tipo_check` — `CHECK ((tipo = ANY (ARRAY['debito'::text, 'credito'::text])))`

### Índices

- `fin_lancamentos_bancarios_extrato_id_fitid_key` — `CREATE UNIQUE INDEX fin_lancamentos_bancarios_extrato_id_fitid_key ON public.fin_lancamentos_bancarios USING btree (extrato_id, fitid)`
- `idx_fin_lanc_data` — `CREATE INDEX idx_fin_lanc_data ON public.fin_lancamentos_bancarios USING btree (data_lancamento)`
- `idx_fin_lanc_extrato` — `CREATE INDEX idx_fin_lanc_extrato ON public.fin_lancamentos_bancarios USING btree (extrato_id)`

**Uso no código:**
- `public.fin_lancamentos_bancarios` — 2 ocorrência(s)
  - `src/__tests__/conciliar.test.ts:375`
  - `src/__tests__/conciliar.test.ts:446`

---

## fonte_entrada_kommo

**Aprox. linhas:** 77

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `id_fonte` | bigint | ✓ | — | — |
| 3 | `descricao` | character varying | ✓ | — | — |

### Chaves

- **UNIQUE** `fonte_entrada_kommo_id_fonte_key` — (`id_fonte`)
- **PRIMARY KEY** `fonte_entrada_kommo_pkey` — (`id`)

### Índices

- `fonte_entrada_kommo_id_fonte_key` — `CREATE UNIQUE INDEX fonte_entrada_kommo_id_fonte_key ON public.fonte_entrada_kommo USING btree (id_fonte)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## forma_envio

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `id_api` | bigint | ✓ | — | — |
| 4 | `tipo` | character varying | ✓ | — | — |
| 5 | `situacao` | character varying | ✓ | — | — |
| 6 | `nome` | character varying | ✓ | — | — |

### Chaves

- **UNIQUE** `logistica_id_api_key` — (`id_api`)
- **PRIMARY KEY** `logistica_pkey` — (`id`)

### Índices

- `logistica_id_api_key` — `CREATE UNIQUE INDEX logistica_id_api_key ON public.forma_envio USING btree (id_api)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Alisson ERP` (ALL, PERMISSIVE) roles=anon
    USING: `true`

**Uso no código:**
- `public.forma_envio` — 24 ocorrência(s)
  - `src/app/(dashboard)/vendas/nova/NovaVendaClient.tsx:588`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClient.tsx:640`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClientLegado.tsx:583`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClientLegado.tsx:635`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClientV2.tsx:1115`

---

## forma_frete

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `nome` | character varying | ✓ | — | — |
| 4 | `codigo` | character varying | ✓ | — | — |
| 5 | `codigo_externo` | character varying | ✓ | — | — |
| 6 | `tipo_entrega` | character varying | ✓ | — | — |
| 7 | `id_api` | bigint | ✓ | — | — |
| 8 | `id_api_logistica` | bigint | ✓ | — | — |

### Chaves

- **UNIQUE** `forma_frete_id_api_key` — (`id_api`)
- **PRIMARY KEY** `forma_frete_pkey` — (`id`)

### Índices

- `forma_frete_id_api_key` — `CREATE UNIQUE INDEX forma_frete_id_api_key ON public.forma_frete USING btree (id_api)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Alisson ERP` (ALL, PERMISSIVE) roles=public
    USING: `true`

**Uso no código:**
- `public.forma_frete` — 16 ocorrência(s)
  - `src/app/(dashboard)/vendas/analise-frete/AnaliseFreteClient.tsx:27`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClient.tsx:589`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClient.tsx:641`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClientLegado.tsx:584`
  - `src/app/(dashboard)/vendas/nova/NovaVendaClientLegado.tsx:636`

---

## forma_pagamento

**Aprox. linhas:** 9

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `descricao` | character varying | ✓ | — | — |
| 4 | `slug` | character varying(50) | — | — | — |
| 5 | `id_api_tiny` | bigint | ✓ | — | — |
| 6 | `status` | boolean | ✓ | `false` | — |

### Chaves

- **PRIMARY KEY** `forma_pagamento_pkey` — (`id`)
- **UNIQUE** `forma_pagamento_slug_unique` — (`slug`)

### Índices

- `forma_pagamento_slug_unique` — `CREATE UNIQUE INDEX forma_pagamento_slug_unique ON public.forma_pagamento USING btree (slug)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Alisson ERP` (ALL, PERMISSIVE) roles=public
    USING: `true`

**Uso no código:**
- `public.forma_pagamento` — 8 ocorrência(s)
  - `src/lib/fiscal/payload-nfce.ts:6`
  - `src/lib/fiscal/payload-nfce.ts:70`
  - `src/lib/fiscal/payload-nfce.ts:355`
  - `src/lib/fiscal/payload-nfe-devolucao.ts:101`
  - `src/lib/fiscal/payload-nfe-devolucao.ts:367`

---

## historico_ordem

**Aprox. linhas:** 538

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `ordem` | json | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `historico_ordem_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## historico_preco

**Aprox. linhas:** 17215444

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `id_api_produto` | bigint | ✓ | — | — |
| 3 | `preco_atualizado` | float8 | ✓ | — | — |
| 4 | `data` | timestamp without time zone | ✓ | — | — |
| 5 | `preco_antigo` | float8 | ✓ | — | — |
| 6 | `variacao_percentual` | numeric(10,3) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `historico_preco_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_historico_preco` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_historico_preco` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_historico_preco` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_historico_preco` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## historico_venda_ja

**Aprox. linhas:** 840

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `venda` | json | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `historico_venda_ja_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## indicadores_marketing

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `gid` | bigint | ✓ | — | — |
| 3 | `c-` | character varying | ✓ | — | — |
| 4 | `data_publicacao` | date | ✓ | — | — |
| 5 | `responsavel` | character varying | ✓ | — | — |
| 6 | `campanha` | character varying | ✓ | — | — |
| 7 | `drive_url` | character varying | ✓ | — | — |
| 8 | `estrategia_storie` | character varying | ✓ | — | — |
| 9 | `produtos` | character varying | ✓ | — | — |
| 10 | `alcance` | character varying | ✓ | — | — |
| 11 | `conclusao` | character varying | ✓ | — | — |
| 12 | `engajamento` | character varying | ✓ | — | — |
| 13 | `qtd_comentarios` | character varying | ✓ | — | — |
| 14 | `ctr` | character varying | ✓ | — | — |
| 15 | `abandono` | character varying | ✓ | — | — |
| 16 | `descricao` | character varying | ✓ | — | — |
| 17 | `url_task` | character varying | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `indicadores_marketing_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## itens_da_ordem

**Aprox. linhas:** 2619

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `ordem_id` | bigint | ✓ | — | — |
| 3 | `produto_id` | bigint | ✓ | — | — |
| 4 | `gtin` | character varying | ✓ | — | — |
| 5 | `qtd` | numeric | ✓ | — | — |
| 6 | `preco` | numeric | ✓ | — | — |
| 7 | `ipi` | numeric | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `itens_da_ordem_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## itens_pedido

**Aprox. linhas:** 21923

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_item` | bigint | — | — | — |
| 2 | `produto_id_api` | bigint | ✓ | — | — |
| 3 | `inf_adicional` | text | ✓ | — | — |
| 4 | `quantidade` | bigint | ✓ | — | — |
| 5 | `valor_unitario` | float8 | ✓ | — | — |
| 6 | `pedido_id_api` | bigint | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `itens_pedido_pkey` — (`id_item`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_itens_pedido` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_itens_pedido` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_itens_pedido` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_itens_pedido` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## itens_venda

**Aprox. linhas:** 75961

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('itens_venda_id_seq'::regclass)` | — |
| 2 | `venda_id` | integer | ✓ | — | — |
| 3 | `produto_id` | integer | ✓ | — | — |
| 4 | `sku` | text | ✓ | — | — |
| 5 | `quantidade` | numeric(10,2) | ✓ | — | — |
| 6 | `preco_tabela` | numeric(10,2) | ✓ | — | — |
| 7 | `preco_unitario_final` | numeric(10,2) | ✓ | — | — |
| 8 | `preco_total` | numeric(10,2) | ✓ | — | — |
| 9 | `desconto_percentual` | numeric(10,2) | ✓ | — | — |
| 10 | `desconto_valor` | numeric(10,2) | ✓ | — | — |
| 11 | `comissao_valor` | numeric(10,2) | ✓ | — | — |
| 12 | `comissao_percentual` | numeric | ✓ | — | Percentual de comissão aplicado no momento da conclusão da venda. Valor estático que não muda mesmo se a tabela de comissão do vendedor for alterada posteriormente. |
| 13 | `n8n` | boolean | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `itens_venda_pkey` — (`id`)

### Triggers

- `trg_proteger_delete_itens_venda` — BEFORE DELETE → `public.fn_proteger_delete_itens_venda` 
- `trg_proteger_preco_itens_venda` — BEFORE UPDATE → `public.fn_proteger_preco_itens_venda` 
- `trg_sync_item_venda_insert_from_public` — AFTER INSERT → `alissonerp.fn_sync_item_venda_from_public` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 6
  - `Directus` (ALL, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`
  - `Directus-Select` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `Directus-delete` (DELETE, PERMISSIVE) roles=public
    USING: `true`
  - `Directus-upadte` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`
  - `Direcuts-insert` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `alisson erp` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.itens_venda` — 1 ocorrência(s)
  - `src/app/api/gestao-estoque/produtos/route.ts:6`

---

## leads

**Aprox. linhas:** 78555

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `id_lead` | bigint | — | — | — |
| 3 | `fonte_entrada_id` | bigint | ✓ | — | — |
| 4 | `consultor` | character varying | ✓ | — | — |
| 5 | `data_entrada` | date | ✓ | — | — |
| 6 | `data_fechamento` | date | ✓ | — | — |
| 7 | `motivo_perda` | character varying | ✓ | — | — |
| 8 | `pedido_tiny` | character varying | ✓ | — | — |
| 9 | `contao_nome` | character varying | ✓ | — | — |
| 10 | `contato_telefone` | character varying | ✓ | — | — |
| 11 | `etapa_lead` | character varying | ✓ | — | — |
| 12 | `nome_lead` | character varying | ✓ | — | — |
| 15 | `data_criacao` | timestamp with time zone | ✓ | `now()` | — |
| 16 | `data_atualizacao` | timestamp with time zone | ✓ | `now()` | — |
| 17 | `id_vendedor` | bigint | ✓ | — | — |
| 18 | `status_pedido` | boolean | ✓ | — | — |
| 19 | `status_id` | bigint | ✓ | — | — |

### Chaves

- **UNIQUE** `leads_id_lead_key` — (`id_lead`)
- **PRIMARY KEY** `leads_pkey` — (`id`, `id_lead`)

### Índices

- `leads_id_lead_key` — `CREATE UNIQUE INDEX leads_id_lead_key ON public.leads USING btree (id_lead)`

### Triggers

- `trg_leads_update` — BEFORE UPDATE → `public.update_data_atualizacao` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `Alisson erp` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`
  - `directus-leads` (ALL, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.leads` — 28 ocorrência(s)
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:3533`
  - `src/app/(dashboard)/dashboard-comercial/page.tsx:20`
  - `src/app/(dashboard)/dashboard-comercial/page.tsx:27`
  - `src/app/(dashboard)/dashboard-comercial/page.tsx:234`
  - `src/app/(dashboard)/dashboard-comercial/page.tsx:235`

---

## loock

**Aprox. linhas:** 2

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `flow_name` | character varying | ✓ | — | — |
| 3 | `timestamp` | timestamp without time zone | ✓ | — | — |
| 4 | `status` | character varying | ✓ | — | — |

### Chaves

- **UNIQUE** `look_id_key` — (`id`)
- **PRIMARY KEY** `look_pkey` — (`id`)

### Índices

- `look_id_key` — `CREATE UNIQUE INDEX look_id_key ON public.loock USING btree (id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_loock` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_loock` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_loock` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_loock` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.loock` — 1 ocorrência(s)
  - `scripts/_build_code_references.mjs:163`

---

## map_asana

**Aprox. linhas:** 1409

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `numero_pedido` | text | — | — | — |
| 3 | `gid` | bigint | ✓ | — | — |

### Chaves

- **UNIQUE** `map_asana_gid_key` — (`gid`)
- **PRIMARY KEY** `map_asana_pkey` — (`id`)

### Índices

- `map_asana_gid_key` — `CREATE UNIQUE INDEX map_asana_gid_key ON public.map_asana USING btree (gid)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## map_vendedor_kommo

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `id_api_kommo` | bigint | ✓ | — | — |

### Chaves

- **UNIQUE** `map_vendedor_kommo_id_api_kommo_key` — (`id_api_kommo`)
- **PRIMARY KEY** `map_vendedor_kommo_pkey` — (`id`)

### Índices

- `map_vendedor_kommo_id_api_kommo_key` — `CREATE UNIQUE INDEX map_vendedor_kommo_id_api_kommo_key ON public.map_vendedor_kommo USING btree (id_api_kommo)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## meio_pagamento

**Aprox. linhas:** 10

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `descricao` | character varying | ✓ | — | — |
| 4 | `forma_pagamento_id` | bigint | ✓ | — | — |
| 5 | `slug` | character varying(50) | ✓ | — | — |
| 6 | `id_api_tiny` | bigint | ✓ | — | — |
| 7 | `status` | boolean | ✓ | `true` | — |

### Chaves

- **PRIMARY KEY** `meio_pagamento_pkey` — (`id`)
- **UNIQUE** `meio_pagamento_slug_forma_unique` — (`slug`, `forma_pagamento_id`)

### Índices

- `idx_meio_pagamento_forma` — `CREATE INDEX idx_meio_pagamento_forma ON public.meio_pagamento USING btree (forma_pagamento_id)`
- `meio_pagamento_slug_forma_unique` — `CREATE UNIQUE INDEX meio_pagamento_slug_forma_unique ON public.meio_pagamento USING btree (slug, forma_pagamento_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Alisson ERP` (ALL, PERMISSIVE) roles=public
    USING: `true`

**Uso no código:**
- `public.meio_pagamento` — 2 ocorrência(s)
  - `scripts/_tiny_enviar_29133.mjs:80`
  - `supabase/migrations/174_dashboard_comercial_views.sql:201`

---

## metas_mensais

**Aprox. linhas:** 9

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `mes_ano` | date | — | — | — |
| 4 | `horas_dia` | integer | — | — | — |
| 5 | `hora_inicio` | integer | — | — | — |
| 6 | `dias_trabalhados` | integer | — | — | — |
| 7 | `valor_ouro` | numeric(10,2) | — | — | — |
| 8 | `valor_prata` | numeric(10,2) | — | — | — |
| 9 | `valor_diamante` | numeric(10,2) | — | — | — |
| 10 | `consultora` | bigint | — | — | — |
| 11 | `dias_nao_trabalhados` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `metas_mensais_pkey` — (`id`)

### Triggers

- `trigger_gerar_metas_por_hora` — AFTER INSERT/UPDATE → `public.gerar_metas_por_hora_final` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Sistema de Metas` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.metas_mensais` — 1 ocorrência(s)
  - `supabase/migrations/174_dashboard_comercial_views.sql:243`

---

## metas_por_hora

**Aprox. linhas:** 23640

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `meta_mensal_id` | bigint | ✓ | — | — |
| 3 | `created_at` | timestamp without time zone | — | `now()` | — |
| 4 | `data_hora` | timestamp without time zone | — | — | — |
| 5 | `consultora` | bigint | — | — | — |
| 6 | `tipo_meta` | text | — | — | — |
| 7 | `valor_meta` | numeric | — | — | — |
| 8 | `meta_acumulada` | numeric | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `metas_por_hora_pkey` — (`id`)

### Índices

- `idx_metas_data_consultora` — `CREATE INDEX idx_metas_data_consultora ON public.metas_por_hora USING btree (data_hora, consultora)`
- `idx_metas_por_hora_data_hora` — `CREATE INDEX idx_metas_por_hora_data_hora ON public.metas_por_hora USING btree (data_hora)`

### Triggers

- `trg_definir_meta_acumulada` — BEFORE INSERT/UPDATE → `public.definir_meta_acumulada_inicial` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Sistema de Metas` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## notificacoes

> Tabela de notificações do sistema

**Aprox. linhas:** 253

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('notificacoes_id_seq'::regclass)` | — |
| 2 | `user_id` | uuid | — | — | UUID do usuário que recebe a notificação |
| 3 | `tipo` | character varying(50) | — | — | Tipo de notificação: mencao_comentario, resposta_comentario, etc |
| 4 | `entidade_tipo` | character varying(50) | — | — | Tipo da entidade que gerou a notificação: comentario, ordem, tarefa, etc |
| 5 | `entidade_id` | integer | — | — | ID da entidade relacionada |
| 6 | `dados_contexto` | jsonb | — | `'{}'::jsonb` | — |
| 7 | `lida` | boolean | — | `false` | — |
| 8 | `lida_em` | timestamp with time zone | ✓ | — | — |
| 9 | `created_at` | timestamp with time zone | — | `now()` | — |
| 10 | `deleted_at` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `notificacoes_pkey` — (`id`)

### Índices

- `idx_notificacoes_date_created` — `CREATE INDEX idx_notificacoes_date_created ON public.notificacoes USING btree (user_id, created_at DESC) WHERE (deleted_at IS NULL)`
- `idx_notificacoes_entidade` — `CREATE INDEX idx_notificacoes_entidade ON public.notificacoes USING btree (entidade_tipo, entidade_id)`
- `idx_notificacoes_user_id` — `CREATE INDEX idx_notificacoes_user_id ON public.notificacoes USING btree (user_id) WHERE (deleted_at IS NULL)`
- `idx_notificacoes_user_lida` — `CREATE INDEX idx_notificacoes_user_lida ON public.notificacoes USING btree (user_id, lida) WHERE (deleted_at IS NULL)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `front-end` (ALL, PERMISSIVE) roles=anon,service_role
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.notificacoes` — 56 ocorrência(s) _(amostra abaixo)_
  - `src/app/api/notificacoes/adiar/route.ts:5`
  - `src/app/api/notificacoes/contagem/route.ts:5`
  - `src/app/api/notificacoes/ler-todas/route.ts:5`
  - `src/app/api/notificacoes/pendentes-resposta/route.ts:5`
  - `src/app/api/notificacoes/route.ts:5`

---

## orcamento

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | — | — |
| 3 | `vendedor_id` | bigint | ✓ | — | — |
| 4 | `sku` | character varying | ✓ | — | — |
| 5 | `status` | bigint | ✓ | — | OS STATUS DO ORÇAMENTO POSSÍVEIS SÃO: 1: CANCELADO, 2: APROVADO, 3: PENDENTE |
| 6 | `nome_cliente` | character varying | ✓ | — | — |
| 7 | `nome_modelo` | character varying | ✓ | — | — |
| 8 | `peso` | numeric | ✓ | — | — |
| 9 | `valor` | numeric | ✓ | — | — |
| 10 | `fichaTecnica_id` | bigint | ✓ | — | — |
| 11 | `cliente_id` | bigint | ✓ | — | — |
| 12 | `numero_orcamento` | character varying | ✓ | — | — |
| 13 | `cancelamento_descricao` | text | ✓ | — | Descrição do porquê aquele orçamento foi cancelado |
| 14 | `cancelado_by` | uuid | ✓ | — | — |
| 15 | `aprovado_by` | uuid | ✓ | — | — |
| 16 | `cancelado_at` | timestamp with time zone | ✓ | — | — |
| 17 | `aprovado_at` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `orcamento_pkey` — (`id`)

### Triggers

- `trg_antes_inserir_orcamento` — BEFORE INSERT → `public.fn_inicializar_orcamento` 
- `trg_aprovacao_orcamento` — BEFORE UPDATE → `public.processar_aprovacao_orcamento` 
- `trg_gerar_numero_orcamento` — BEFORE INSERT → `public.fn_gerar_numero_orcamento` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `Allow insert orcamento` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `true`
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.orcamento` — 78 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/orcamento/detalhe/[id]/OrcamentoDetalheClient.tsx:8`
  - `src/app/(dashboard)/orcamento/detalhe/[id]/OrcamentoDetalheClient.tsx:13`
  - `src/app/(dashboard)/orcamento/detalhe/[id]/OrcamentoDetalheClient.tsx:36`
  - `src/app/(dashboard)/orcamento/detalhe/[id]/OrcamentoDetalheClient.tsx:50`
  - `src/app/(dashboard)/orcamento/detalhe/[id]/OrcamentoDetalheClient.tsx:62`

---

## ordem_compras

**Aprox. linhas:** 84

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `id_ordem` | bigint | ✓ | — | — |
| 3 | `numero_pedido` | character varying | ✓ | — | — |
| 4 | `data` | date | ✓ | — | — |
| 5 | `situacao` | character varying | ✓ | — | — |
| 6 | `desconto` | character varying | ✓ | — | — |
| 7 | `frete` | numeric | ✓ | — | — |
| 8 | `total_produtos` | numeric | ✓ | — | — |
| 9 | `total_compra` | numeric | ✓ | — | — |
| 10 | `fornecedor_id` | bigint | ✓ | — | — |
| 11 | `categoria` | character varying | ✓ | — | — |
| 12 | `frete_por_conta` | character varying | ✓ | — | — |
| 13 | `observacoes` | character varying | ✓ | — | — |
| 14 | `observacoes_internas` | character varying | ✓ | — | — |

### Chaves

- **UNIQUE** `ordem_compras_id_ordem_key` — (`id_ordem`)
- **PRIMARY KEY** `ordem_compras_pkey` — (`id`)

### Índices

- `ordem_compras_id_ordem_key` — `CREATE UNIQUE INDEX ordem_compras_id_ordem_key ON public.ordem_compras USING btree (id_ordem)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## pagamentos

**Aprox. linhas:** 5853

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `id_api_pagamento` | bigint | ✓ | — | — |
| 3 | `data` | date | ✓ | — | — |
| 4 | `conta_id_api` | bigint | ✓ | — | — |
| 5 | `valor_pago` | float8 | ✓ | — | — |
| 6 | `valor_taxa` | float8 | ✓ | — | — |
| 7 | `valor_juros` | float8 | ✓ | — | — |
| 8 | `valor_acrescimo` | float8 | ✓ | — | — |
| 9 | `tipo` | text | ✓ | — | — |

### Chaves

- **UNIQUE** `pagamentos_id_api_pagamento_key` — (`id_api_pagamento`)
- **PRIMARY KEY** `pagamentos_pkey` — (`id`)

### Índices

- `pagamentos_id_api_pagamento_key` — `CREATE UNIQUE INDEX pagamentos_id_api_pagamento_key ON public.pagamentos USING btree (id_api_pagamento)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_pagamentos` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_pagamentos` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_pagamentos` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_pagamentos` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.pagamentos` — 222 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4117`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:5425`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:5583`
  - `src/app/(dashboard)/devolucoes/nova/NovaDevolucaoClient.tsx:38`
  - `src/app/(dashboard)/financeiro/FinanceiroClient.tsx:783`

---

## parametros

**Aprox. linhas:** 1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `ouro` | float4 | ✓ | — | — |
| 3 | `dollar` | float8 | ✓ | — | — |
| 4 | `euro` | float8 | ✓ | — | — |
| 5 | `prata_api` | float4 | ✓ | — | — |
| 6 | `prata_manual` | float8 | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `parametros_pkey` — (`id`)

### Triggers

- `trigger_parametros_atualizados` — AFTER UPDATE → `public.disparar_atualizacao_produtos` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 5
  - `APPOrcamento` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`
  - `directus_delete_parametros` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_parametros` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_parametros` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_parametros` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.parametros` — 58 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:132`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:141`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:159`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:163`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:164`

---

## parcelas_da_ordem

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `ordem_id` | bigint | — | — | — |
| 3 | `numero` | integer | ✓ | — | — |
| 4 | `data_vencimento` | timestamp without time zone | ✓ | — | — |
| 5 | `valor` | numeric(10,2) | ✓ | — | — |
| 6 | `meio_pagamento` | character varying(50) | ✓ | — | — |
| 7 | `observacoes` | character varying(255) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `parcelas_da_ordem_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## parcelas_pedidos

**Aprox. linhas:** 35687

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_parcela` | bigint | — | — | — |
| 2 | `dias` | bigint | ✓ | — | — |
| 3 | `data` | date | ✓ | — | — |
| 4 | `valor` | float8 | ✓ | — | — |
| 5 | `observacao` | text | ✓ | — | — |
| 6 | `forma_pagamento` | text | ✓ | — | — |
| 7 | `meio_pagamento` | text | ✓ | — | — |
| 8 | `pedido_id_api` | bigint | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `parcelas_pedidos_pkey` — (`id_parcela`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 5
  - `directus_delete_parcelas_pedidos` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_parcelas_pedidos` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_parcelas_pedidos` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_parcelas_pedidos` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## pedidos

**Aprox. linhas:** 14408

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `id_api_pedido` | bigint | ✓ | — | — |
| 3 | `numero_pedido` | text | ✓ | — | — |
| 4 | `data_pedido` | date | ✓ | — | — |
| 5 | `observacoes` | text | ✓ | — | — |
| 6 | `obs_internas` | text | ✓ | — | — |
| 7 | `data_prevista` | date | ✓ | — | — |
| 8 | `data_envio` | date | ✓ | — | — |
| 9 | `data_entrega` | date | ✓ | — | — |
| 10 | `data_faturamento` | date | ✓ | — | — |
| 11 | `situacao` | text | ✓ | — | — |
| 12 | `ordem_compra` | text | ✓ | — | — |
| 13 | `cliente_id_api` | bigint | ✓ | — | — |
| 14 | `vendedor_id_api` | bigint | ✓ | — | — |
| 15 | `transportador` | text | ✓ | — | — |
| 16 | `frete_por_conta` | text | ✓ | — | — |
| 17 | `forma_envio` | text | ✓ | — | — |
| 18 | `forma_frete` | text | ✓ | — | — |
| 19 | `codigo_rastreamento` | text | ✓ | — | — |
| 20 | `url_rastreamento` | text | ✓ | — | — |
| 21 | `deposito` | text | ✓ | — | — |
| 22 | `natureza_operacao` | text | ✓ | — | — |
| 23 | `ecommerce` | text | ✓ | — | — |
| 24 | `n_pedido_ecommerce` | text | ✓ | — | — |
| 25 | `canal_venda` | text | ✓ | — | — |
| 26 | `n_canal_venda` | text | ✓ | — | — |
| 27 | `condicao_pagamento` | text | ✓ | — | — |
| 28 | `forma_pagamento` | text | ✓ | — | — |
| 29 | `meio_pagamento` | text | ✓ | — | — |
| 30 | `valor_produtos` | float8 | ✓ | — | — |
| 31 | `valor_frete` | float8 | ✓ | — | — |
| 32 | `valor_outras_despesas` | float8 | ✓ | — | — |
| 33 | `valor_total_pedido` | float8 | ✓ | — | — |
| 34 | `valor_desconto` | float8 | ✓ | — | — |
| 35 | `marcador` | text | ✓ | — | — |
| 36 | `cpf_cnpj` | text | ✓ | — | — |
| 37 | `etapa` | character varying | ✓ | — | — |
| 38 | `consultora_lead` | bigint | ✓ | — | — |
| 39 | `id_lead` | bigint | ✓ | — | — |
| 41 | `endereco_entrega` | jsonb | ✓ | — | — |

### Chaves

- **UNIQUE** `pedidos_id_api_pedido_key` — (`id_api_pedido`)
- **UNIQUE** `pedidos_id_lead_key` — (`id_lead`)
- **PRIMARY KEY** `pedidos_pkey` — (`id`)

### Índices

- `pedidos_id_api_pedido_key` — `CREATE UNIQUE INDEX pedidos_id_api_pedido_key ON public.pedidos USING btree (id_api_pedido)`
- `pedidos_id_lead_key` — `CREATE UNIQUE INDEX pedidos_id_lead_key ON public.pedidos USING btree (id_lead)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 5
  - `directus_delete_pedidos` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_pedidos` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_pedidos` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_pedidos` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`
  - `front-end` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.pedidos` — 23 ocorrência(s)
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:3459`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:3553`
  - `src/app/api/vendas/[id]/route.ts:505`
  - `src/app/api/vendas/[id]/route.ts:670`
  - `src/lib/vendas-aprovar.ts:271`

---

## produtos

**Aprox. linhas:** 15827

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_produto` | bigint | — | — | — |
| 2 | `id_api_produto` | bigint | ✓ | — | — |
| 3 | `sku` | character varying | ✓ | — | — |
| 4 | `nome` | character varying | ✓ | — | — |
| 5 | `tipo_metal` | character varying | ✓ | — | — |
| 6 | `tipo` | character varying | ✓ | — | — |
| 7 | `situacao` | character varying | ✓ | — | — |
| 8 | `unidade` | character varying | ✓ | — | — |
| 9 | `gtin` | character varying | ✓ | — | — |
| 10 | `categoria` | character varying | ✓ | — | — |
| 11 | `marca` | character varying | ✓ | — | — |
| 12 | `qtd_estoque` | bigint | ✓ | — | — |
| 13 | `preco_tiny` | numeric | ✓ | — | — |
| 14 | `preco_promocional` | numeric | ✓ | — | — |
| 15 | `preco_custo` | numeric | ✓ | — | — |
| 16 | `preco_custo_medio` | numeric | ✓ | — | — |
| 17 | `preco_na_cotacao` | numeric | ✓ | — | — |
| 18 | `custo_na_cotacao` | numeric | ✓ | — | — |
| 19 | `peso_precificado` | float8 | ✓ | — | — |
| 20 | `markup` | float8 | ✓ | — | — |
| 21 | `fator` | float4 | ✓ | — | — |
| 22 | `fornecedor_etl` | character varying | ✓ | — | — |
| 23 | `preco_sync` | numeric | ✓ | — | — |
| 24 | `imagem` | text | ✓ | — | — |
| 25 | `data_atualizacao_preco` | timestamp without time zone | ✓ | — | — |
| 26 | `diferenca_percentual` | numeric(10,3) | ✓ | `NULL::numeric` | — |
| 27 | `fornecedor_id_api` | bigint | ✓ | — | — |
| 28 | `estoque_minimo` | integer | ✓ | — | — |
| 29 | `estoque_maximo` | integer | ✓ | — | — |
| 31 | `imagem_capa` | uuid | ✓ | — | — |
| 32 | `tipo_de_pedra` | character varying(255) | ✓ | — | — |
| 33 | `url_drive` | character varying(255) | ✓ | — | — |
| 34 | `peso_real` | float4 | ✓ | — | — |
| 36 | `iframe` | character varying(255) | ✓ | — | — |
| 38 | `data_atualizacao` | timestamp without time zone | ✓ | — | — |
| 39 | `id_kommo` | bigint | ✓ | — | — |
| 41 | `data_ultima_compra` | date | ✓ | — | — |
| 42 | `prompt_imagem_ia` | text | ✓ | — | — |
| 43 | `sob_encomenda` | character varying | ✓ | — | — |
| 44 | `prazo_producao` | integer | ✓ | — | — |
| 45 | `categoria_precificacao` | character varying | ✓ | — | — |
| 46 | `tem_pedra_preciosa` | boolean | ✓ | `false` | — |
| 47 | `preco_pedras` | numeric(10,2) | ✓ | `0` | — |
| 48 | `preco_total_sync` | numeric(10,2) | ✓ | — | — |

### Chaves

- **UNIQUE** `produtos_id_api_produto_key` — (`id_api_produto`)
- **PRIMARY KEY** `produtos_pkey` — (`id_produto`)

### Índices

- `idx_produtos_sku_fp1037` — `CREATE INDEX idx_produtos_sku_fp1037 ON public.produtos USING btree (sku) WHERE ((sku)::text ~~ 'FP1037-%'::text)`
- `idx_produtos_tem_pedra` — `CREATE INDEX idx_produtos_tem_pedra ON public.produtos USING btree (tem_pedra_preciosa) WHERE (tem_pedra_preciosa = true)`
- `produtos_id_api_produto_key` — `CREATE UNIQUE INDEX produtos_id_api_produto_key ON public.produtos USING btree (id_api_produto)`

### Triggers

- `on_product_update` — AFTER UPDATE → `public.atualiza_obs_produto` 
- `on_produto_update_notify_situacao` — AFTER UPDATE → `public.notificar_apenas_mudanca_situacao` 
- `on_produtos_update` — BEFORE UPDATE → `public.registrar_modificacao_produtos` 
- `trg_notifica_estoque` — AFTER UPDATE → `public.notificar_mudanca_estoque` 
- `trigger_arredondar_peso` — BEFORE INSERT/UPDATE → `public.arredondar_peso_para_cima` 
- `trigger_atualizar_preco_produto` — BEFORE INSERT/UPDATE → `public.atualizar_preco_produto` 
- `z_trigger_atualiza_diferenca_percentual` — BEFORE INSERT/UPDATE → `public.calcular_diferenca_percentual` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 5
  - `directus_delete_produtos` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_produtos` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_produtos` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_produtos` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.produtos` — 564 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1833`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1844`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:3459`
  - `src/app/(dashboard)/estoque-comercial/EstoqueComercialClient.tsx:76`
  - `src/app/(dashboard)/estoque-comercial/EstoqueComercialClient.tsx:356`

---

## public_links

**Aprox. linhas:** 92

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `resource_type` | text | — | — | — |
| 3 | `resource_id` | text | — | — | — |
| 4 | `created_by` | uuid | ✓ | — | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `expires_at` | timestamp with time zone | ✓ | — | — |
| 7 | `extra_json` | jsonb | ✓ | `'{}'::jsonb` | — |

### Chaves

- **PRIMARY KEY** `public_links_pkey` — (`id`)

### Índices

- `idx_public_links_resource` — `CREATE INDEX idx_public_links_resource ON public.public_links USING btree (resource_type, resource_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `front_end` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## recebimentos

**Aprox. linhas:** 3722

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | — | — |
| 2 | `id_api_recebimento` | bigint | ✓ | — | — |
| 3 | `conta_id_api` | bigint | ✓ | — | — |
| 4 | `data` | date | ✓ | — | — |
| 5 | `valor_pago` | numeric | ✓ | — | — |
| 6 | `valor_taxa` | numeric | ✓ | — | — |
| 7 | `valor_juros` | numeric | ✓ | — | — |
| 8 | `valor_desconto` | numeric | ✓ | — | — |
| 9 | `valor_acrescimo` | numeric | ✓ | — | — |
| 10 | `tipo` | character varying | ✓ | — | — |

### Chaves

- **UNIQUE** `recebimentos_id_api_recebimento_key` — (`id_api_recebimento`)
- **PRIMARY KEY** `recebimentos_pkey` — (`id`)

### Índices

- `recebimentos_id_api_recebimento_key` — `CREATE UNIQUE INDEX recebimentos_id_api_recebimento_key ON public.recebimentos USING btree (id_api_recebimento)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

**Uso no código:**
- `public.recebimentos` — 3 ocorrência(s)
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:3842`
  - `src/app/(dashboard)/financeiro/FinanceiroClient.tsx:1115`
  - `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx:1515`

---

## relacao_tinny_moura

**Aprox. linhas:** 772

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_tiny` | bigint | — | — | — |
| 3 | `produto_id_moura` | bigint | ✓ | — | — |
| 4 | `sku` | character varying | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `relacao_tinny_moura_pkey` — (`id_tiny`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## solicitacoes_vale_troca

**Aprox. linhas:** 1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `venda_id` | integer | — | — | — |
| 3 | `cliente_id` | integer | — | — | — |
| 4 | `vale_origem_id` | uuid | ✓ | — | — |
| 5 | `valor` | numeric(10,2) | — | — | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `id_asana` | text | ✓ | — | Id da tarefa criada no Asana |

### Chaves

- **PRIMARY KEY** `solicitacoes_vale_troca_pkey` — (`id`)

### Triggers

- `handle_updated_at` — BEFORE UPDATE → `public.update_entregas_updated_at` 
- `trg_solicitacao_vale_troca` — AFTER INSERT → `public.notify_n8n_solicitacao_vale_troca` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## staging_markup_aprovacao

**Aprox. linhas:** 9990

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('staging_markup_aprovacao_id_seq'::regclass)` | — |
| 2 | `dados_json` | jsonb | — | — | — |
| 3 | `status` | character varying(20) | ✓ | `'pendente'::character varying` | — |
| 4 | `criado_em` | timestamp without time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 5 | `atualizado_em` | timestamp without time zone | ✓ | `CURRENT_TIMESTAMP` | — |
| 6 | `sku` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `staging_markup_aprovacao_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `Dashboard de aprovação` (SELECT, PERMISSIVE) roles=anon
    USING: `true`

_Sem referência identificada no código._

---

## suporte_conversas

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('suporte_conversas_id_seq'::regclass)` | — |
| 2 | `telefone` | text | — | — | — |
| 3 | `historico` | jsonb | — | `'[]'::jsonb` | — |
| 4 | `dados_temp` | jsonb | — | `'{}'::jsonb` | — |
| 5 | `escalado` | boolean | — | `false` | — |
| 6 | `updated_at` | timestamp without time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `suporte_conversas_pkey` — (`id`)
- **UNIQUE** `suporte_conversas_telefone_key` — (`telefone`)

### Índices

- `idx_suporte_telefone` — `CREATE INDEX idx_suporte_telefone ON public.suporte_conversas USING btree (telefone)`
- `suporte_conversas_telefone_key` — `CREATE UNIQUE INDEX suporte_conversas_telefone_key ON public.suporte_conversas USING btree (telefone)`

_Sem referência identificada no código._

---

## teste

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | ✓ | — | — |
| 2 | `teste` | character varying | ✓ | — | — |

**Uso no código:**
- `public.teste` — 46 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:284`
  - `src/app/(dashboard)/site/SiteClient.tsx:8`
  - `src/app/api/pcp/ordem-teste/route.ts:5`
  - `src/app/api/pcp/ordem-teste/route.ts:6`
  - `src/app/api/site/test/route.ts:167`

---

## tipos_contatos

**Aprox. linhas:** 10

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_tipo` | bigint | — | — | — |
| 2 | `id_api_tipo` | bigint | ✓ | — | — |
| 3 | `descrição` | text | ✓ | — | — |

### Chaves

- **UNIQUE** `tipos_contatos_id_api_tipo_key` — (`id_api_tipo`)
- **PRIMARY KEY** `tipos_contatos_pkey` — (`id_tipo`)

### Índices

- `tipos_contatos_id_api_tipo_key` — `CREATE UNIQUE INDEX tipos_contatos_id_api_tipo_key ON public.tipos_contatos USING btree (id_api_tipo)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `directus_delete_tipos_contatos` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_tipos_contatos` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_tipos_contatos` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_tipos_contatos` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

_Sem referência identificada no código._

---

## user_profiles

**Aprox. linhas:** 27

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_user` | uuid | — | `gen_random_uuid()` | — |
| 2 | `email` | character varying(255) | — | — | — |
| 3 | `password_hash` | character varying(255) | — | — | — |
| 4 | `name` | character varying(255) | — | — | — |
| 5 | `role` | character varying(50) | — | `'user'::character varying` | — |
| 6 | `avatar_url` | text | ✓ | — | — |
| 7 | `phone` | character varying(20) | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 10 | `last_login` | timestamp with time zone | ✓ | — | — |
| 11 | `is_active` | boolean | ✓ | `true` | — |
| 12 | `vendedor_id` | bigint | ✓ | — | — |
| 13 | `mx_desconto_permitido` | numeric | ✓ | — | — |

### Chaves

- **UNIQUE** `user_profiles_id_user_key` — (`id_user`)
- **UNIQUE** `users_email_key` — (`email`)
- **PRIMARY KEY** `users_pkey` — (`id_user`)

### CHECK constraints

- `user_profiles_role_check` — `CHECK (((role)::text = ANY (ARRAY[('admin'::character varying)::text, ('consultora'::character varying)::text, ('user'::character varying)::text, ('gerente'::character varying)::text, ('producao'::character varying)::text, ('logistica'::character ...`

### Índices

- `idx_users_email` — `CREATE INDEX idx_users_email ON public.user_profiles USING btree (email)`
- `idx_users_is_active` — `CREATE INDEX idx_users_is_active ON public.user_profiles USING btree (is_active)`
- `idx_users_role` — `CREATE INDEX idx_users_role ON public.user_profiles USING btree (role)`
- `user_profiles_id_user_key` — `CREATE UNIQUE INDEX user_profiles_id_user_key ON public.user_profiles USING btree (id_user)`
- `users_email_key` — `CREATE UNIQUE INDEX users_email_key ON public.user_profiles USING btree (email)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `plataforma_admin` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.user_profiles` — 28 ocorrência(s)
  - `src/app/(dashboard)/precificacao/page.tsx:24`
  - `src/app/api/user/avatar/route.ts:9`
  - `src/app/api/user/avatar/route.ts:68`
  - `src/app/api/user/[id]/route.ts:163`
  - `scripts/apply_073.mjs:473`

---

## vales_troca

**Aprox. linhas:** 45

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `codigo_voucher` | text | — | — | — |
| 3 | `valor` | numeric(10,2) | — | — | — |
| 4 | `cliente_id` | integer | — | — | — |
| 5 | `criado_por` | uuid | ✓ | — | — |
| 6 | `status` | character varying(100) | — | `'ativo'::character varying` | tipos possíveis: ativo, pendente, utilizado, cancelado |
| 7 | `created_at` | timestamp with time zone | — | `now()` | — |
| 8 | `observacao` | text | ✓ | — | — |
| 9 | `venda_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `vales_troca_pkey` — (`id`)

### CHECK constraints

- `vales_troca_status_check` — `CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying, 'utilizado'::character varying, 'cancelado'::character varying, 'pendente'::character varying])::text[])))`
- `vales_troca_valor_check` — `CHECK ((valor > (0)::numeric))`

### Índices

- `idx_codigo_voucher_ativo` — `CREATE UNIQUE INDEX idx_codigo_voucher_ativo ON public.vales_troca USING btree (codigo_voucher) WHERE ((status)::text <> 'cancelado'::text)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `front-end` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.vales_troca` — 2 ocorrência(s)
  - `src/app/(dashboard)/devolucoes/[id]/DevolucaoDetalheClient.tsx:90`
  - `src/app/api/devolucoes/[id]/route.ts:76`

---

## vendas

**Aprox. linhas:** 14444

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('vendas_id_seq'::regclass)` | — |
| 2 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 3 | `updated_at` | timestamp without time zone | ✓ | `now()` | — |
| 4 | `cliente_id` | integer | ✓ | — | — |
| 5 | `vendedor_id` | integer | ✓ | — | — |
| 6 | `data_venda` | date | ✓ | — | — |
| 7 | `data_envio` | timestamp with time zone | ✓ | — | — |
| 8 | `status` | integer | ✓ | — | — |
| 9 | `total_produtos` | numeric(10,2) | ✓ | — | — |
| 10 | `total_venda` | numeric(10,2) | ✓ | — | — |
| 11 | `total_itens_qnt` | integer | ✓ | — | — |
| 12 | `total_itens_unidades` | integer | ✓ | — | — |
| 13 | `forma_envio_id` | integer | ✓ | — | — |
| 14 | `forma_frete_id` | integer | ✓ | — | — |
| 15 | `endereco_cobranca` | jsonb | ✓ | — | — |
| 16 | `dados_entrega` | jsonb | ✓ | — | — |
| 17 | `dados_pagamento` | jsonb | ✓ | — | — |
| 18 | `observacoes_internas` | text | ✓ | — | — |
| 19 | `observacoes` | text | ✓ | — | — |
| 20 | `arquivos_path` | _text | ✓ | — | — |
| 21 | `frete_pago_cliente` | float8 | ✓ | — | — |
| 22 | `lead_id` | bigint | ✓ | — | — |
| 23 | `numero_pedido_tiny` | text | ✓ | — | — |
| 24 | `id_api_tiny` | bigint | ✓ | — | — |
| 25 | `public_link_uuid` | text | ✓ | — | — |
| 26 | `entregue` | boolean | — | `false` | Indica se a venda já foi entregue (possui registro na tabela controle_entregas) |
| 27 | `numero_pedido` | bigint | ✓ | — | — |
| 28 | `pedido_numero` | integer | ✓ | — | — |

### Chaves

- **UNIQUE** `vendas_id_api_tiny_key` — (`id_api_tiny`)
- **UNIQUE** `vendas_lead_id_key` — (`lead_id`)
- **PRIMARY KEY** `vendas_pkey` — (`id`)

### Índices

- `idx_vendas_entregue` — `CREATE INDEX idx_vendas_entregue ON public.vendas USING btree (entregue)`
- `idx_vendas_id_api_tiny` — `CREATE UNIQUE INDEX idx_vendas_id_api_tiny ON public.vendas USING btree (id_api_tiny)`
- `vendas_id_api_tiny_key` — `CREATE UNIQUE INDEX vendas_id_api_tiny_key ON public.vendas USING btree (id_api_tiny)`
- `vendas_lead_id_key` — `CREATE UNIQUE INDEX vendas_lead_id_key ON public.vendas USING btree (lead_id)`

### Triggers

- `on_update_vendas` — BEFORE UPDATE → `public.handle_updated_at` 
- `trg_notificar_n8n` — AFTER INSERT/UPDATE → `public.notificar_n8n_nova_venda` 
- `trg_sync_venda_insert_from_public` — AFTER INSERT → `alissonerp.fn_sync_venda_from_public` 
- `trg_sync_venda_update_from_public` — AFTER UPDATE → `alissonerp.fn_sync_venda_update_from_public` 
- `trg_venda_sequencial` — BEFORE INSERT → `public.fn_gerar_venda_sequencial_manual` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `alisson erp` (ALL, PERMISSIVE) roles=public
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.vendas` — 527 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1831`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1844`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:3479`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:3682`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4140`

---

## vendedores

**Aprox. linhas:** 38

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_vendedor` | bigint | — | — | — |
| 2 | `nome` | text | ✓ | — | — |
| 3 | `id_api_vendedor` | bigint | ✓ | — | — |
| 4 | `foto` | text | ✓ | — | — |
| 5 | `situacao` | situacao | ✓ | — | — |
| 6 | `id_api_kommo` | bigint | ✓ | — | — |
| 7 | `cpf` | text | ✓ | — | — |
| 8 | `email` | text | ✓ | — | — |
| 9 | `user_id` | uuid | ✓ | — | — |
| 10 | `comissao` | bigint | ✓ | — | — |
| 11 | `gerente_orcamento` | boolean | ✓ | — | — |

### Chaves

- **UNIQUE** `vendedores_cpf_key` — (`cpf`)
- **UNIQUE** `vendedores_email_key` — (`email`)
- **UNIQUE** `vendedores_id_api_kommo_key` — (`id_api_kommo`)
- **UNIQUE** `vendedores_id_api_vendedor_key` — (`id_api_vendedor`)
- **PRIMARY KEY** `vendedores_pkey` — (`id_vendedor`)

### Índices

- `vendedores_cpf_key` — `CREATE UNIQUE INDEX vendedores_cpf_key ON public.vendedores USING btree (cpf)`
- `vendedores_email_key` — `CREATE UNIQUE INDEX vendedores_email_key ON public.vendedores USING btree (email)`
- `vendedores_id_api_kommo_key` — `CREATE UNIQUE INDEX vendedores_id_api_kommo_key ON public.vendedores USING btree (id_api_kommo)`
- `vendedores_id_api_vendedor_key` — `CREATE UNIQUE INDEX vendedores_id_api_vendedor_key ON public.vendedores USING btree (id_api_vendedor)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 6
  - `Select` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`
  - `Sistema de Metas` (ALL, PERMISSIVE) roles=anon
    USING: `true`
    WITH CHECK: `true`
  - `directus_delete_vendedores` (DELETE, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_insert_vendedores` (INSERT, PERMISSIVE) roles=directus
    WITH CHECK: `true`
  - `directus_select_vendedores` (SELECT, PERMISSIVE) roles=directus
    USING: `true`
  - `directus_update_vendedores` (UPDATE, PERMISSIVE) roles=directus
    USING: `true`
    WITH CHECK: `true`

**Uso no código:**
- `public.vendedores` — 87 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4327`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4350`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4439`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4559`
  - `src/app/(dashboard)/vendas/metas/registrar/MetasRegistrarClient.tsx:35`

---

