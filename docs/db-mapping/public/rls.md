# `public` — Row Level Security (RLS)

> 114 políticas em 55 de 65 tabelas

## Tabelas com RLS habilitada

| Tabela | RLS | Forced | # Policies |
|---|---|---|---|
| `banco_imagens` | ✓ | — | 0 |
| `categoria_precificação` | ✓ | — | 0 |
| `categorias` | ✓ | — | 1 |
| `categorias_receitas_despesas` | ✓ | — | 4 |
| `comissoes` | ✓ | — | 1 |
| `complementos_contatos` | ✓ | — | 4 |
| `config_orcamento_aliancas` | ✓ | — | 3 |
| `contas_a_pagar` | ✓ | — | 4 |
| `contas_a_receber` | ✓ | — | 2 |
| `contatos` | ✓ | — | 5 |
| `controle_de_execucao` | ✓ | — | 4 |
| `controle_entregas` | ✓ | — | 1 |
| `controle_requisicao` | ✓ | — | 4 |
| `cotacao` | ✓ | — | 4 |
| `estoque` | ✓ | — | 1 |
| `ficha_tecnica` | ✓ | — | 2 |
| `ficha_tecnica_orcamento` | ✓ | — | 3 |
| `ficha_tecnica_produto` | ✓ | — | 2 |
| `fonte_entrada_kommo` | ✓ | — | 0 |
| `forma_envio` | ✓ | — | 1 |
| `forma_frete` | ✓ | — | 1 |
| `forma_pagamento` | ✓ | — | 1 |
| `historico_ordem` | ✓ | — | 0 |
| `historico_preco` | ✓ | — | 4 |
| `historico_venda_ja` | ✓ | — | 0 |
| `indicadores_marketing` | ✓ | — | 0 |
| `itens_da_ordem` | ✓ | — | 0 |
| `itens_pedido` | ✓ | — | 4 |
| `itens_venda` | ✓ | — | 6 |
| `leads` | ✓ | — | 2 |
| `loock` | ✓ | — | 4 |
| `map_asana` | ✓ | — | 0 |
| `map_vendedor_kommo` | ✓ | — | 0 |
| `meio_pagamento` | ✓ | — | 1 |
| `metas_mensais` | ✓ | — | 1 |
| `metas_por_hora` | ✓ | — | 1 |
| `notificacoes` | ✓ | — | 1 |
| `orcamento` | ✓ | — | 2 |
| `ordem_compras` | ✓ | — | 0 |
| `pagamentos` | ✓ | — | 4 |
| `parametros` | ✓ | — | 5 |
| `parcelas_da_ordem` | ✓ | — | 0 |
| `parcelas_pedidos` | ✓ | — | 5 |
| `pedidos` | ✓ | — | 5 |
| `produtos` | ✓ | — | 5 |
| `public_links` | ✓ | — | 1 |
| `recebimentos` | ✓ | — | 0 |
| `relacao_tinny_moura` | ✓ | — | 0 |
| `solicitacoes_vale_troca` | ✓ | — | 1 |
| `staging_markup_aprovacao` | ✓ | — | 1 |
| `tipos_contatos` | ✓ | — | 4 |
| `user_profiles` | ✓ | — | 1 |
| `vales_troca` | ✓ | — | 1 |
| `vendas` | ✓ | — | 1 |
| `vendedores` | ✓ | — | 6 |

## Políticas

### `categorias`

- **Directus** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`

### `categorias_receitas_despesas`

- **directus_delete_categorias_receitas_despesas** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_categorias_receitas_despesas** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_categorias_receitas_despesas** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_categorias_receitas_despesas** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `comissoes`

- **erp** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`

### `complementos_contatos`

- **directus_delete_complementos_contatos** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_complementos_contatos** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_complementos_contatos** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_complementos_contatos** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `config_orcamento_aliancas`

- **config_select_by_manager_flag** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `(EXISTS ( SELECT 1    FROM vendedores v   WHERE ((TRIM(BOTH FROM lower(v.email)) = TRIM(BOTH FROM lower(auth.email()))) AND (v.gerente_orcamento = true))))`
- **config_write_insert_by_manager_flag** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `(EXISTS ( SELECT 1    FROM vendedores v   WHERE ((TRIM(BOTH FROM lower(v.email)) = TRIM(BOTH FROM lower(auth.email()))) AND (v.gerente_orcamento = true))))`
- **config_write_update_by_manager_flag** — UPDATE (PERMISSIVE) roles=`authenticated`
  - USING: `true`
  - WITH CHECK: `(EXISTS ( SELECT 1    FROM vendedores v   WHERE ((TRIM(BOTH FROM lower(v.email)) = TRIM(BOTH FROM lower(auth.email()))) AND (v.gerente_orcamento = true))))`

### `contas_a_pagar`

- **directus_delete_contas_a_pagar** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_contas_a_pagar** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_contas_a_pagar** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_contas_a_pagar** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `contas_a_receber`

- **Directus-select** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **consulta_get_n8n** — SELECT (PERMISSIVE) roles=`anon`
  - USING: `true`

### `contatos`

- **Enable read access for all users** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
- **directus_delete_contatos** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_contatos** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_contatos** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_contatos** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `controle_de_execucao`

- **directus_delete_controle_de_execucao** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_controle_de_execucao** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_controle_de_execucao** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_controle_de_execucao** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `controle_entregas`

- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `controle_requisicao`

- **directus_delete_controle_requisicao** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_controle_requisicao** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_controle_requisicao** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_controle_requisicao** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `cotacao`

- **directus_delete_cotacao** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_cotacao** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_cotacao** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_cotacao** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `estoque`

- **erp** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`

### `ficha_tecnica`

- **Alisson ERP** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `ficha_tecnica_orcamento`

- **Allow insert ficha tecnica** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `true`
- **Allow select ficha tecnica** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`
- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `ficha_tecnica_produto`

- **Directus** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`
- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `forma_envio`

- **Alisson ERP** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`

### `forma_frete`

- **Alisson ERP** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`

### `forma_pagamento`

- **Alisson ERP** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`

### `historico_preco`

- **directus_delete_historico_preco** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_historico_preco** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_historico_preco** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_historico_preco** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `itens_pedido`

- **directus_delete_itens_pedido** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_itens_pedido** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_itens_pedido** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_itens_pedido** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `itens_venda`

- **Directus** — ALL (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`
- **Directus-Select** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **Directus-delete** — DELETE (PERMISSIVE) roles=`public`
  - USING: `true`
- **Directus-upadte** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`
- **Direcuts-insert** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **alisson erp** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`

### `leads`

- **Alisson erp** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`
- **directus-leads** — ALL (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `loock`

- **directus_delete_loock** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_loock** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_loock** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_loock** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `meio_pagamento`

- **Alisson ERP** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`

### `metas_mensais`

- **Sistema de Metas** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `metas_por_hora`

- **Sistema de Metas** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`

### `notificacoes`

- **front-end** — ALL (PERMISSIVE) roles=`anon,service_role`
  - USING: `true`
  - WITH CHECK: `true`

### `orcamento`

- **Allow insert orcamento** — INSERT (PERMISSIVE) roles=`authenticated`
  - WITH CHECK: `true`
- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `pagamentos`

- **directus_delete_pagamentos** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_pagamentos** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_pagamentos** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_pagamentos** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `parametros`

- **APPOrcamento** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`
- **directus_delete_parametros** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_parametros** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_parametros** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_parametros** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `parcelas_pedidos`

- **directus_delete_parcelas_pedidos** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_parcelas_pedidos** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_parcelas_pedidos** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_parcelas_pedidos** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`
- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `pedidos`

- **directus_delete_pedidos** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_pedidos** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_pedidos** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_pedidos** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`
- **front-end** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`

### `produtos`

- **directus_delete_produtos** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_produtos** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_produtos** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_produtos** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`
- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `public_links`

- **front_end** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`

### `solicitacoes_vale_troca`

- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `staging_markup_aprovacao`

- **Dashboard de aprovação** — SELECT (PERMISSIVE) roles=`anon`
  - USING: `true`

### `tipos_contatos`

- **directus_delete_tipos_contatos** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_tipos_contatos** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_tipos_contatos** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_tipos_contatos** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

### `user_profiles`

- **plataforma_admin** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`

### `vales_troca`

- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `vendas`

- **alisson erp** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`

### `vendedores`

- **Select** — SELECT (PERMISSIVE) roles=`authenticated`
  - USING: `true`
- **Sistema de Metas** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`
- **directus_delete_vendedores** — DELETE (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_insert_vendedores** — INSERT (PERMISSIVE) roles=`directus`
  - WITH CHECK: `true`
- **directus_select_vendedores** — SELECT (PERMISSIVE) roles=`directus`
  - USING: `true`
- **directus_update_vendedores** — UPDATE (PERMISSIVE) roles=`directus`
  - USING: `true`
  - WITH CHECK: `true`

