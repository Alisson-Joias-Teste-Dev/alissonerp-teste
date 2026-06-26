# Schema public (READONLY)

> Gerado em: 2026-04-29 | Tabelas: 65 | Views: 45

> **READONLY** — não usar INSERT/UPDATE/DELETE neste schema

## backup_itens_venda_3313

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | YES | — |
| venda_id | integer | YES | — |
| produto_id | integer | YES | — |
| sku | text | YES | — |
| quantidade | numeric | YES | — |
| preco_tabela | numeric | YES | — |
| preco_unitario_final | numeric | YES | — |
| preco_total | numeric | YES | — |
| desconto_percentual | numeric | YES | — |
| desconto_valor | numeric | YES | — |
| comissao_valor | numeric | YES | — |
| comissao_percentual | numeric | YES | — |
| n8n | boolean | YES | — |

---

## backup_itens_venda_pre_correcao_marco

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | YES | — |
| venda_id | integer | YES | — |
| produto_id | integer | YES | — |
| sku | text | YES | — |
| quantidade | numeric | YES | — |
| preco_tabela | numeric | YES | — |
| preco_unitario_final | numeric | YES | — |
| preco_total | numeric | YES | — |
| desconto_percentual | numeric | YES | — |
| desconto_valor | numeric | YES | — |
| comissao_valor | numeric | YES | — |
| comissao_percentual | numeric | YES | — |
| n8n | boolean | YES | — |

---

## backup_itens_venda_test_3313

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | YES | — |
| venda_id | integer | YES | — |
| produto_id | integer | YES | — |
| sku | text | YES | — |
| quantidade | numeric | YES | — |
| preco_tabela | numeric | YES | — |
| preco_unitario_final | numeric | YES | — |
| preco_total | numeric | YES | — |
| desconto_percentual | numeric | YES | — |
| desconto_valor | numeric | YES | — |
| comissao_valor | numeric | YES | — |
| comissao_percentual | numeric | YES | — |
| n8n | boolean | YES | — |

---

## banco_imagens

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| produto_id_api | bigint | YES | — |
| imagem | text | YES | — |

---

## categoria_precificação

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| categoryName | character varying | YES | — |
| range | character varying | YES | — |
| curvePoints | ARRAY | YES | — |

---

## categorias

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| descricao | character varying(255) | NO | — |
| pai_id | bigint | YES | — |

**Índices:**
- `idx_categorias_pai_id` — CREATE INDEX idx_categorias_pai_id ON public.categorias USING btree (pai_id)

---

## categorias_receitas_despesas

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_categoria | bigint | NO | — |
| id_api_categoria | bigint | YES | — |
| descricao | text | YES | — |
| grupo | text | YES | — |

**Índices:**
- `categorias_receitas_despesas_id_key` — CREATE UNIQUE INDEX categorias_receitas_despesas_id_key ON public.categorias_receitas_despesas US...
- `categorias_receitas_despesas_id_categoria_key` — CREATE UNIQUE INDEX categorias_receitas_despesas_id_categoria_key ON public.categorias_receitas_d...

---

## comissoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| nome | character varying | YES | — |
| tabela | json | YES | — |

---

## complementos_contatos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| produtos_interessse | text | YES | — |
| instagram | text | YES | — |
| orcamento_mensal | text | YES | — |
| data_casamento | text | YES | — |
| data_noivado | text | YES | — |
| contato_id_api | bigint | YES | — |
| estado_civil | text | YES | — |

**Índices:**
- `complementos_contatos_contato_id_api_key` — CREATE UNIQUE INDEX complementos_contatos_contato_id_api_key ON public.complementos_contatos USIN...

---

## config_orcamento_aliancas

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| name | text | NO | — |
| start_mkp | numeric | YES | — |
| discount_percent | numeric | YES | — |
| gold_price | numeric | YES | — |
| camera_override | numeric | YES | — |
| profile | text | YES | — |
| pricing_categories | jsonb | NO | — |
| groove_rules | jsonb | NO | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Índices:**
- `config_orcamento_aliancas_name_idx` — CREATE UNIQUE INDEX config_orcamento_aliancas_name_idx ON public.config_orcamento_aliancas USING ...
- `config_orcamento_aliancas_name_key` — CREATE UNIQUE INDEX config_orcamento_aliancas_name_key ON public.config_orcamento_aliancas USING ...

**Triggers:**
- `set_updated_at` (BEFORE UPDATE)

---

## contas_a_pagar

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| id_api_conta | bigint | YES | — |
| situacao | text | YES | — |
| data | date | YES | — |
| data_vencimento | date | YES | — |
| data_competencia | date | YES | — |
| data_liquidacao | date | YES | — |
| dia_vencimento | text | YES | — |
| dia_semanavencimento | text | YES | — |
| numero_documento | text | YES | — |
| serie_documento | text | YES | — |
| ocorrencia | text | YES | — |
| qtd_parcelas | text | YES | — |
| valor | double precision | YES | — |
| saldo | double precision | YES | — |
| valor_pago | double precision | YES | — |
| multa | double precision | YES | — |
| juros | double precision | YES | — |
| forma_pagamento | text | YES | — |
| historico | text | YES | — |
| marcador | text | YES | — |
| fornecedor_id_api | bigint | YES | — |
| categoria_id_api | bigint | YES | — |
| hash | text | YES | — |

**Índices:**
- `contas_a_pagar_id_api_conta_key` — CREATE UNIQUE INDEX contas_a_pagar_id_api_conta_key ON public.contas_a_pagar USING btree (id_api_...

---

## contas_a_receber

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| id_api_conta | bigint | YES | — |
| situacao | character varying | YES | — |
| data | date | YES | — |
| data_vencimento | date | YES | — |
| data_competencia | date | YES | — |
| data_liquidacao | date | YES | — |
| dia_vencimento | numeric | YES | — |
| dia_semana_vencimento | numeric | YES | — |
| numero_documento | character varying | YES | — |
| serie_documento | numeric | YES | — |
| ocorrencia | character varying | YES | — |
| quantidade_parcelas | numeric | YES | — |
| valor | numeric | YES | — |
| saldo | numeric | YES | — |
| juros | numeric | YES | — |
| multa | numeric | YES | — |
| valor_pago | numeric | YES | — |
| cliente_id_api | bigint | YES | — |
| categoria_id_api | bigint | YES | — |
| forma_recebimento | character varying | YES | — |
| historico | character varying | YES | — |
| link_boleto | character varying | YES | — |
| qtd_parcelas_antecipadas | numeric | YES | — |
| marcadores | character varying | YES | — |
| hash | text | YES | — |
| pedido_id_api | bigint | YES | — |

**Índices:**
- `contas_a_receber_id_api_conta_key` — CREATE UNIQUE INDEX contas_a_receber_id_api_conta_key ON public.contas_a_receber USING btree (id_...

---

## contatos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_contato | bigint | NO | — |
| id_api_contato | bigint | YES | — |
| tipo_idapi | bigint | YES | — |
| nome | text | YES | — |
| codigo | text | YES | — |
| fantasia | text | YES | — |
| tipo_pessoa | text | YES | — |
| cpf_cnpj | text | YES | — |
| inscricao_estadual | text | YES | — |
| rg | text | YES | — |
| telefone | text | YES | — |
| celular | text | YES | — |
| email | text | YES | — |
| endereco | text | YES | — |
| numero | text | YES | — |
| complemento | text | YES | — |
| bairro | text | YES | — |
| municipio | text | YES | — |
| cep | text | YES | — |
| uf | text | YES | — |
| pais | text | YES | — |
| vendedor_idapi | bigint | YES | — |
| data_atualizacao | timestamp with time zone | YES | — |
| id_kommo | bigint | YES | — |

**Índices:**
- `contatos_id_api_contato_key` — CREATE UNIQUE INDEX contatos_id_api_contato_key ON public.contatos USING btree (id_api_contato)
- `contatos_cpf_cnpj_key` — CREATE UNIQUE INDEX contatos_cpf_cnpj_key ON public.contatos USING btree (cpf_cnpj)

**Triggers:**
- `on_contatos_update` (BEFORE INSERT)
- `on_contatos_update` (BEFORE UPDATE)
- `Webhook Contatos Envio tiny` (AFTER INSERT)
- `Webhook Contatos Envio tiny` (AFTER UPDATE)

---

## controle_de_execucao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| timestamp | timestamp with time zone | YES | — |
| descricao | text | YES | — |

---

## controle_entregas

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('controle_entregas_id_seq'::regclass) |
| pedido_id | bigint | YES | — |
| entregador_responsavel | text | NO | — |
| data_entrega | timestamp with time zone | NO | — |
| valor_entrega | numeric | NO | — |
| observacoes | text | YES | — |
| anexos_path | ARRAY | NO | — |
| numero_pedido_plataforma | text | YES | — |
| numero_pedido_tiny | text | YES | — |
| nome_cliente | text | NO | — |
| frete_pago_cliente | numeric | YES | — |
| bairro_entrega | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| vendedor_responsavel_id | bigint | NO | — |
| entrega_type | character varying(100) | NO | — |
| status_aprovacao | character varying(100) | NO | '3'::character varying |
| descricao_entrega | text | YES | — |

**Índices:**
- `idx_entregas_type` — CREATE INDEX idx_entregas_type ON public.controle_entregas USING btree (entrega_type)
- `idx_entregas_status` — CREATE INDEX idx_entregas_status ON public.controle_entregas USING btree (status_aprovacao)
- `idx_entregas_data_entrega` — CREATE INDEX idx_entregas_data_entrega ON public.controle_entregas USING btree (data_entrega DESC)
- `idx_entregas_data` — CREATE INDEX idx_entregas_data ON public.controle_entregas USING btree (data_entrega)
- `idx_entregas_type_and_data` — CREATE INDEX idx_entregas_type_and_data ON public.controle_entregas USING btree (entrega_type, da...
- `idx_entregas_status_data` — CREATE INDEX idx_entregas_status_data ON public.controle_entregas USING btree (status_aprovacao, ...
- `idx_entregas_pedido_id` — CREATE INDEX idx_entregas_pedido_id ON public.controle_entregas USING btree (pedido_id)
- `idx_entregas_entregador` — CREATE INDEX idx_entregas_entregador ON public.controle_entregas USING btree (entregador_responsa...
- `idx_entregas_created_at` — CREATE INDEX idx_entregas_created_at ON public.controle_entregas USING btree (created_at DESC)

**Triggers:**
- `trigger_entregas_updated_at` (BEFORE UPDATE)
- `trigger_sync_venda_entregue` (AFTER INSERT)
- `trigger_sync_venda_entregue` (AFTER DELETE)

---

## controle_requisicao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| nome_fluxo | text | YES | — |
| duração | text | YES | — |
| total_reqs | text | YES | — |
| reqs_minuto | text | YES | — |

---

## controle_sequencia

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| nome_tabela | text | NO | — |
| ultimo_numero | integer | YES | — |

---

## cotacao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| data_hora | timestamp without time zone | YES | — |
| moeda | text | YES | — |
| cotacao | real | YES | — |

---

## estoque

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_estoque | bigint | NO | — |
| produto_id_api | bigint | YES | — |
| sku | character varying | YES | — |
| estoque_loja | numeric | YES | — |
| estoque_reposicao_srvc | numeric | YES | — |
| estoque_marketing | numeric | YES | — |
| estoque_alisson | numeric | YES | — |
| estoque_dara | numeric | YES | — |
| estoque_service | numeric | YES | — |
| estoque_fabrica | numeric | YES | — |
| saldo | bigint | YES | — |
| reserva | bigint | YES | — |

**Índices:**
- `estoque_produto_id_api_key` — CREATE UNIQUE INDEX estoque_produto_id_api_key ON public.estoque USING btree (produto_id_api)

**Triggers:**
- `trigger_atualizar_saldo_estoque` (BEFORE INSERT)
- `trigger_atualizar_saldo_estoque` (BEFORE UPDATE)
- `webhook_estoque_update_seguro` (AFTER UPDATE)
- `webhook_estoque_insert_seguro` (AFTER INSERT)

---

## ficha_tecnica

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| descricao | text | YES | — |
| ficha_tecnica | json | YES | — |

---

## ficha_tecnica_orcamento

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| modelo | character varying | YES | — |
| aro_numeracao | character varying | YES | — |
| largura | character varying | YES | — |
| espessura | character varying | YES | — |
| peso_estimado | character varying | YES | — |
| tipo_fonte | character varying | YES | — |
| texto | text | YES | — |
| qtd_pedras | character varying | YES | — |
| tamanho_pedra | character varying | YES | — |
| tipo_aplicacao_pedra | character varying | YES | — |

**Índices:**
- `idx_ficha_tecnica_orc_id` — CREATE INDEX idx_ficha_tecnica_orc_id ON public.ficha_tecnica_orcamento USING btree (id)

---

## ficha_tecnica_produto

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| produto_id | bigint | YES | — |
| modelo | character varying | YES | — |
| largura | numeric | YES | — |
| espessura | numeric | YES | — |
| peso_estimado | numeric | YES | — |
| tipo_fonte | character varying | YES | — |
| texto | character varying | YES | — |
| qtd_pedras | numeric | YES | — |
| tamanho_pedra | numeric | YES | — |
| tipo_apilicacao_pedra | numeric | YES | — |
| aro_numeracao | character varying | YES | — |

---

## fila_webhooks_n8n

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| produto_id | bigint | NO | — |
| enviado | boolean | NO | false |
| criado_em | timestamp with time zone | NO | now() |
| enviado_em | timestamp with time zone | YES | — |

**Índices:**
- `idx_fila_webhooks_pendentes` — CREATE INDEX idx_fila_webhooks_pendentes ON public.fila_webhooks_n8n USING btree (enviado) WHERE ...

**Triggers:**
- `trg_webhook_novo_produto` (AFTER INSERT)

---

## fin_conciliacoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('fin_conciliacoes_id_seq'::regclass) |
| lancamento_id | bigint | NO | — |
| conta_pagar_id | bigint | NO | — |
| status | text | NO | 'confirmado'::text |
| diferenca_valor | numeric | NO | 0 |
| diferenca_dias | integer | NO | 0 |
| confirmado_em | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `lancamento_id` → `public.fin_lancamentos_bancarios.id`

**Índices:**
- `fin_conciliacoes_lancamento_id_key` — CREATE UNIQUE INDEX fin_conciliacoes_lancamento_id_key ON public.fin_conciliacoes USING btree (la...
- `fin_conciliacoes_conta_pagar_id_key` — CREATE UNIQUE INDEX fin_conciliacoes_conta_pagar_id_key ON public.fin_conciliacoes USING btree (c...
- `idx_fin_conc_status` — CREATE INDEX idx_fin_conc_status ON public.fin_conciliacoes USING btree (status)

---

## fin_extratos_bancarios

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('fin_extratos_bancarios_id_seq'::regclass) |
| banco | text | NO | — |
| nome_arquivo | text | YES | — |
| status | text | NO | 'processando'::text |
| total_importado | integer | YES | 0 |
| total_conciliado | integer | YES | 0 |
| total_divergencias | integer | YES | 0 |
| importado_em | timestamp with time zone | NO | now() |
| arquivo_id | uuid | YES | — |
| conteudo_ofx | text | YES | — |
| n8n_execution_id | character varying(255) | YES | — |

---

## fin_lancamentos_bancarios

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('fin_lancamentos_bancarios_id_seq'::regclass) |
| extrato_id | bigint | NO | — |
| data_lancamento | date | NO | — |
| descricao | text | YES | — |
| valor | numeric | NO | — |
| tipo | text | NO | — |
| fitid | text | NO | — |

**FKs:**
- `extrato_id` → `public.fin_extratos_bancarios.id`

**Índices:**
- `fin_lancamentos_bancarios_extrato_id_fitid_key` — CREATE UNIQUE INDEX fin_lancamentos_bancarios_extrato_id_fitid_key ON public.fin_lancamentos_banc...
- `idx_fin_lanc_extrato` — CREATE INDEX idx_fin_lanc_extrato ON public.fin_lancamentos_bancarios USING btree (extrato_id)
- `idx_fin_lanc_data` — CREATE INDEX idx_fin_lanc_data ON public.fin_lancamentos_bancarios USING btree (data_lancamento)

---

## fonte_entrada_kommo

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| id_fonte | bigint | YES | — |
| descricao | character varying | YES | — |

**Índices:**
- `fonte_entrada_kommo_id_fonte_key` — CREATE UNIQUE INDEX fonte_entrada_kommo_id_fonte_key ON public.fonte_entrada_kommo USING btree (i...

---

## forma_envio

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| id_api | bigint | YES | — |
| tipo | character varying | YES | — |
| situacao | character varying | YES | — |
| nome | character varying | YES | — |

**Índices:**
- `logistica_id_api_key` — CREATE UNIQUE INDEX logistica_id_api_key ON public.forma_envio USING btree (id_api)

---

## forma_frete

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| nome | character varying | YES | — |
| codigo | character varying | YES | — |
| codigo_externo | character varying | YES | — |
| tipo_entrega | character varying | YES | — |
| id_api | bigint | YES | — |
| id_api_logistica | bigint | YES | — |

**Índices:**
- `forma_frete_id_api_key` — CREATE UNIQUE INDEX forma_frete_id_api_key ON public.forma_frete USING btree (id_api)

---

## forma_pagamento

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| descricao | character varying | YES | — |
| slug | character varying(50) | NO | — |
| id_api_tiny | bigint | YES | — |
| status | boolean | YES | false |

**Índices:**
- `forma_pagamento_slug_unique` — CREATE UNIQUE INDEX forma_pagamento_slug_unique ON public.forma_pagamento USING btree (slug)

---

## historico_ordem

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| ordem | json | YES | — |

---

## historico_preco

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| id_api_produto | bigint | YES | — |
| preco_atualizado | double precision | YES | — |
| data | timestamp without time zone | YES | — |
| preco_antigo | double precision | YES | — |
| variacao_percentual | numeric | YES | — |

---

## historico_venda_ja

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| venda | json | YES | — |

---

## indicadores_marketing

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| gid | bigint | YES | — |
| c- | character varying | YES | — |
| data_publicacao | date | YES | — |
| responsavel | character varying | YES | — |
| campanha | character varying | YES | — |
| drive_url | character varying | YES | — |
| estrategia_storie | character varying | YES | — |
| produtos | character varying | YES | — |
| alcance | character varying | YES | — |
| conclusao | character varying | YES | — |
| engajamento | character varying | YES | — |
| qtd_comentarios | character varying | YES | — |
| ctr | character varying | YES | — |
| abandono | character varying | YES | — |
| descricao | character varying | YES | — |
| url_task | character varying | YES | — |

---

## itens_da_ordem

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| ordem_id | bigint | YES | — |
| produto_id | bigint | YES | — |
| gtin | character varying | YES | — |
| qtd | numeric | YES | — |
| preco | numeric | YES | — |
| ipi | numeric | YES | — |

---

## itens_pedido

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_item | bigint | NO | — |
| produto_id_api | bigint | YES | — |
| inf_adicional | text | YES | — |
| quantidade | bigint | YES | — |
| valor_unitario | double precision | YES | — |
| pedido_id_api | bigint | YES | — |

---

## itens_venda

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('itens_venda_id_seq'::regclass) |
| venda_id | integer | YES | — |
| produto_id | integer | YES | — |
| sku | text | YES | — |
| quantidade | numeric | YES | — |
| preco_tabela | numeric | YES | — |
| preco_unitario_final | numeric | YES | — |
| preco_total | numeric | YES | — |
| desconto_percentual | numeric | YES | — |
| desconto_valor | numeric | YES | — |
| comissao_valor | numeric | YES | — |
| comissao_percentual | numeric | YES | — |
| n8n | boolean | YES | — |

**Triggers:**
- `trg_sync_item_venda_insert_from_public` (AFTER INSERT)
- `trg_proteger_preco_itens_venda` (BEFORE UPDATE)
- `trg_proteger_delete_itens_venda` (BEFORE DELETE)

---

## leads

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| id_lead | bigint | NO | — |
| fonte_entrada_id | bigint | YES | — |
| consultor | character varying | YES | — |
| data_entrada | date | YES | — |
| data_fechamento | date | YES | — |
| motivo_perda | character varying | YES | — |
| pedido_tiny | character varying | YES | — |
| contao_nome | character varying | YES | — |
| contato_telefone | character varying | YES | — |
| etapa_lead | character varying | YES | — |
| nome_lead | character varying | YES | — |
| data_criacao | timestamp with time zone | YES | now() |
| data_atualizacao | timestamp with time zone | YES | now() |
| id_vendedor | bigint | YES | — |
| status_pedido | boolean | YES | — |
| status_id | bigint | YES | — |

**Índices:**
- `leads_id_lead_key` — CREATE UNIQUE INDEX leads_id_lead_key ON public.leads USING btree (id_lead)

**Triggers:**
- `trg_leads_update` (BEFORE UPDATE)

---

## loock

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| flow_name | character varying | YES | — |
| timestamp | timestamp without time zone | YES | — |
| status | character varying | YES | — |

**Índices:**
- `look_id_key` — CREATE UNIQUE INDEX look_id_key ON public.loock USING btree (id)

---

## map_asana

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| numero_pedido | text | NO | — |
| gid | bigint | YES | — |

**Índices:**
- `map_asana_gid_key` — CREATE UNIQUE INDEX map_asana_gid_key ON public.map_asana USING btree (gid)

---

## map_vendedor_kommo

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| id_api_kommo | bigint | YES | — |

**Índices:**
- `map_vendedor_kommo_id_api_kommo_key` — CREATE UNIQUE INDEX map_vendedor_kommo_id_api_kommo_key ON public.map_vendedor_kommo USING btree ...

---

## meio_pagamento

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| descricao | character varying | YES | — |
| forma_pagamento_id | bigint | YES | — |
| slug | character varying(50) | YES | — |
| id_api_tiny | bigint | YES | — |
| status | boolean | YES | true |

**Índices:**
- `meio_pagamento_slug_forma_unique` — CREATE UNIQUE INDEX meio_pagamento_slug_forma_unique ON public.meio_pagamento USING btree (slug, ...
- `idx_meio_pagamento_forma` — CREATE INDEX idx_meio_pagamento_forma ON public.meio_pagamento USING btree (forma_pagamento_id)

---

## metas_mensais

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | now() |
| mes_ano | date | NO | — |
| horas_dia | integer | NO | — |
| hora_inicio | integer | NO | — |
| dias_trabalhados | integer | NO | — |
| valor_ouro | numeric | NO | — |
| valor_prata | numeric | NO | — |
| valor_diamante | numeric | NO | — |
| consultora | bigint | NO | — |
| dias_nao_trabalhados | text | YES | — |

**Triggers:**
- `trigger_gerar_metas_por_hora` (AFTER INSERT)
- `trigger_gerar_metas_por_hora` (AFTER UPDATE)

---

## metas_por_hora

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| meta_mensal_id | bigint | YES | — |
| created_at | timestamp without time zone | NO | now() |
| data_hora | timestamp without time zone | NO | — |
| consultora | bigint | NO | — |
| tipo_meta | text | NO | — |
| valor_meta | numeric | NO | — |
| meta_acumulada | numeric | YES | — |

**Índices:**
- `idx_metas_data_consultora` — CREATE INDEX idx_metas_data_consultora ON public.metas_por_hora USING btree (data_hora, consultora)
- `idx_metas_por_hora_data_hora` — CREATE INDEX idx_metas_por_hora_data_hora ON public.metas_por_hora USING btree (data_hora)

**Triggers:**
- `trg_definir_meta_acumulada` (BEFORE INSERT)
- `trg_definir_meta_acumulada` (BEFORE UPDATE)

---

## notificacoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('notificacoes_id_seq'::regclass) |
| user_id | uuid | NO | — |
| tipo | character varying(50) | NO | — |
| entidade_tipo | character varying(50) | NO | — |
| entidade_id | integer | NO | — |
| dados_contexto | jsonb | NO | '{}'::jsonb |
| lida | boolean | NO | false |
| lida_em | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | NO | now() |
| deleted_at | timestamp with time zone | YES | — |

**Índices:**
- `idx_notificacoes_user_id` — CREATE INDEX idx_notificacoes_user_id ON public.notificacoes USING btree (user_id) WHERE (deleted...
- `idx_notificacoes_user_lida` — CREATE INDEX idx_notificacoes_user_lida ON public.notificacoes USING btree (user_id, lida) WHERE ...
- `idx_notificacoes_entidade` — CREATE INDEX idx_notificacoes_entidade ON public.notificacoes USING btree (entidade_tipo, entidad...
- `idx_notificacoes_date_created` — CREATE INDEX idx_notificacoes_date_created ON public.notificacoes USING btree (user_id, created_a...

---

## orcamento

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| created_at | timestamp with time zone | NO | — |
| vendedor_id | bigint | YES | — |
| sku | character varying | YES | — |
| status | bigint | YES | — |
| nome_cliente | character varying | YES | — |
| nome_modelo | character varying | YES | — |
| peso | numeric | YES | — |
| valor | numeric | YES | — |
| fichaTecnica_id | bigint | YES | — |
| cliente_id | bigint | YES | — |
| numero_orcamento | character varying | YES | — |
| cancelamento_descricao | text | YES | — |
| cancelado_by | uuid | YES | — |
| aprovado_by | uuid | YES | — |
| cancelado_at | timestamp with time zone | YES | — |
| aprovado_at | timestamp with time zone | YES | — |

**Triggers:**
- `trg_aprovacao_orcamento` (BEFORE UPDATE)
- `trg_gerar_numero_orcamento` (BEFORE INSERT)
- `trg_antes_inserir_orcamento` (BEFORE INSERT)

---

## ordem_compras

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| id_ordem | bigint | YES | — |
| numero_pedido | character varying | YES | — |
| data | date | YES | — |
| situacao | character varying | YES | — |
| desconto | character varying | YES | — |
| frete | numeric | YES | — |
| total_produtos | numeric | YES | — |
| total_compra | numeric | YES | — |
| fornecedor_id | bigint | YES | — |
| categoria | character varying | YES | — |
| frete_por_conta | character varying | YES | — |
| observacoes | character varying | YES | — |
| observacoes_internas | character varying | YES | — |

**Índices:**
- `ordem_compras_id_ordem_key` — CREATE UNIQUE INDEX ordem_compras_id_ordem_key ON public.ordem_compras USING btree (id_ordem)

---

## pagamentos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| id_api_pagamento | bigint | YES | — |
| data | date | YES | — |
| conta_id_api | bigint | YES | — |
| valor_pago | double precision | YES | — |
| valor_taxa | double precision | YES | — |
| valor_juros | double precision | YES | — |
| valor_acrescimo | double precision | YES | — |
| tipo | text | YES | — |

**Índices:**
- `pagamentos_id_api_pagamento_key` — CREATE UNIQUE INDEX pagamentos_id_api_pagamento_key ON public.pagamentos USING btree (id_api_paga...

---

## parametros

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| ouro | real | YES | — |
| dollar | double precision | YES | — |
| euro | double precision | YES | — |
| prata_api | real | YES | — |
| prata_manual | double precision | YES | — |

**Triggers:**
- `trigger_parametros_atualizados` (AFTER UPDATE)

---

## parcelas_da_ordem

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| ordem_id | bigint | NO | — |
| numero | integer | YES | — |
| data_vencimento | timestamp without time zone | YES | — |
| valor | numeric | YES | — |
| meio_pagamento | character varying(50) | YES | — |
| observacoes | character varying(255) | YES | — |

---

## parcelas_pedidos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_parcela | bigint | NO | — |
| dias | bigint | YES | — |
| data | date | YES | — |
| valor | double precision | YES | — |
| observacao | text | YES | — |
| forma_pagamento | text | YES | — |
| meio_pagamento | text | YES | — |
| pedido_id_api | bigint | YES | — |

---

## pedidos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| id_api_pedido | bigint | YES | — |
| numero_pedido | text | YES | — |
| data_pedido | date | YES | — |
| observacoes | text | YES | — |
| obs_internas | text | YES | — |
| data_prevista | date | YES | — |
| data_envio | date | YES | — |
| data_entrega | date | YES | — |
| data_faturamento | date | YES | — |
| situacao | text | YES | — |
| ordem_compra | text | YES | — |
| cliente_id_api | bigint | YES | — |
| vendedor_id_api | bigint | YES | — |
| transportador | text | YES | — |
| frete_por_conta | text | YES | — |
| forma_envio | text | YES | — |
| forma_frete | text | YES | — |
| codigo_rastreamento | text | YES | — |
| url_rastreamento | text | YES | — |
| deposito | text | YES | — |
| natureza_operacao | text | YES | — |
| ecommerce | text | YES | — |
| n_pedido_ecommerce | text | YES | — |
| canal_venda | text | YES | — |
| n_canal_venda | text | YES | — |
| condicao_pagamento | text | YES | — |
| forma_pagamento | text | YES | — |
| meio_pagamento | text | YES | — |
| valor_produtos | double precision | YES | — |
| valor_frete | double precision | YES | — |
| valor_outras_despesas | double precision | YES | — |
| valor_total_pedido | double precision | YES | — |
| valor_desconto | double precision | YES | — |
| marcador | text | YES | — |
| cpf_cnpj | text | YES | — |
| etapa | character varying | YES | — |
| consultora_lead | bigint | YES | — |
| id_lead | bigint | YES | — |
| endereco_entrega | jsonb | YES | — |

**Índices:**
- `pedidos_id_api_pedido_key` — CREATE UNIQUE INDEX pedidos_id_api_pedido_key ON public.pedidos USING btree (id_api_pedido)
- `pedidos_id_lead_key` — CREATE UNIQUE INDEX pedidos_id_lead_key ON public.pedidos USING btree (id_lead)

---

## produtos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_produto | bigint | NO | — |
| id_api_produto | bigint | YES | — |
| sku | character varying | YES | — |
| nome | character varying | YES | — |
| tipo_metal | character varying | YES | — |
| tipo | character varying | YES | — |
| situacao | character varying | YES | — |
| unidade | character varying | YES | — |
| gtin | character varying | YES | — |
| categoria | character varying | YES | — |
| marca | character varying | YES | — |
| qtd_estoque | bigint | YES | — |
| preco_tiny | numeric | YES | — |
| preco_promocional | numeric | YES | — |
| preco_custo | numeric | YES | — |
| preco_custo_medio | numeric | YES | — |
| preco_na_cotacao | numeric | YES | — |
| custo_na_cotacao | numeric | YES | — |
| peso_precificado | double precision | YES | — |
| markup | double precision | YES | — |
| fator | real | YES | — |
| fornecedor_etl | character varying | YES | — |
| preco_sync | numeric | YES | — |
| imagem | text | YES | — |
| data_atualizacao_preco | timestamp without time zone | YES | — |
| diferenca_percentual | numeric | YES | NULL::numeric |
| fornecedor_id_api | bigint | YES | — |
| estoque_minimo | integer | YES | — |
| estoque_maximo | integer | YES | — |
| imagem_capa | uuid | YES | — |
| tipo_de_pedra | character varying(255) | YES | — |
| url_drive | character varying(255) | YES | — |
| peso_real | real | YES | — |
| iframe | character varying(255) | YES | — |
| data_atualizacao | timestamp without time zone | YES | — |
| id_kommo | bigint | YES | — |
| data_ultima_compra | date | YES | — |
| prompt_imagem_ia | text | YES | — |
| sob_encomenda | character varying | YES | — |
| prazo_producao | integer | YES | — |
| categoria_precificacao | character varying | YES | — |
| tem_pedra_preciosa | boolean | YES | false |
| preco_pedras | numeric | YES | 0 |
| preco_total_sync | numeric | YES | — |

**Índices:**
- `produtos_id_api_produto_key` — CREATE UNIQUE INDEX produtos_id_api_produto_key ON public.produtos USING btree (id_api_produto)
- `idx_produtos_tem_pedra` — CREATE INDEX idx_produtos_tem_pedra ON public.produtos USING btree (tem_pedra_preciosa) WHERE (te...
- `idx_produtos_sku_fp1037` — CREATE INDEX idx_produtos_sku_fp1037 ON public.produtos USING btree (sku) WHERE ((sku)::text ~~ '...

**Triggers:**
- `trg_notifica_estoque` (AFTER UPDATE)
- `trigger_atualizar_preco_produto` (BEFORE INSERT)
- `trigger_atualizar_preco_produto` (BEFORE UPDATE)
- `z_trigger_atualiza_diferenca_percentual` (BEFORE INSERT)
- `z_trigger_atualiza_diferenca_percentual` (BEFORE UPDATE)
- `on_produtos_update` (BEFORE UPDATE)
- `on_produto_update_notify_situacao` (AFTER UPDATE)
- `trigger_arredondar_peso` (BEFORE INSERT)
- `trigger_arredondar_peso` (BEFORE UPDATE)
- `on_product_update` (AFTER UPDATE)

---

## public_links

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| resource_type | text | NO | — |
| resource_id | text | NO | — |
| created_by | uuid | YES | — |
| created_at | timestamp with time zone | YES | now() |
| expires_at | timestamp with time zone | YES | — |
| extra_json | jsonb | YES | '{}'::jsonb |

**Índices:**
- `idx_public_links_resource` — CREATE INDEX idx_public_links_resource ON public.public_links USING btree (resource_type, resourc...

---

## recebimentos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | — |
| id_api_recebimento | bigint | YES | — |
| conta_id_api | bigint | YES | — |
| data | date | YES | — |
| valor_pago | numeric | YES | — |
| valor_taxa | numeric | YES | — |
| valor_juros | numeric | YES | — |
| valor_desconto | numeric | YES | — |
| valor_acrescimo | numeric | YES | — |
| tipo | character varying | YES | — |

**Índices:**
- `recebimentos_id_api_recebimento_key` — CREATE UNIQUE INDEX recebimentos_id_api_recebimento_key ON public.recebimentos USING btree (id_ap...

---

## relacao_tinny_moura

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_tiny | bigint | NO | — |
| produto_id_moura | bigint | YES | — |
| sku | character varying | YES | — |

---

## solicitacoes_vale_troca

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| venda_id | integer | NO | — |
| cliente_id | integer | NO | — |
| vale_origem_id | uuid | YES | — |
| valor | numeric | NO | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| id_asana | text | YES | — |

**Triggers:**
- `handle_updated_at` (BEFORE UPDATE)
- `trg_solicitacao_vale_troca` (AFTER INSERT)

---

## staging_markup_aprovacao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('staging_markup_aprovacao_id_seq'::regclass) |
| dados_json | jsonb | NO | — |
| status | character varying(20) | YES | 'pendente'::character varying |
| criado_em | timestamp without time zone | YES | CURRENT_TIMESTAMP |
| atualizado_em | timestamp without time zone | YES | CURRENT_TIMESTAMP |
| sku | text | YES | — |

---

## suporte_conversas

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('suporte_conversas_id_seq'::regclass) |
| telefone | text | NO | — |
| historico | jsonb | NO | '[]'::jsonb |
| dados_temp | jsonb | NO | '{}'::jsonb |
| escalado | boolean | NO | false |
| updated_at | timestamp without time zone | YES | now() |

**Índices:**
- `suporte_conversas_telefone_key` — CREATE UNIQUE INDEX suporte_conversas_telefone_key ON public.suporte_conversas USING btree (telef...
- `idx_suporte_telefone` — CREATE INDEX idx_suporte_telefone ON public.suporte_conversas USING btree (telefone)

---

## teste

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | YES | — |
| teste | character varying | YES | — |

---

## tipos_contatos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_tipo | bigint | NO | — |
| id_api_tipo | bigint | YES | — |
| descrição | text | YES | — |

**Índices:**
- `tipos_contatos_id_api_tipo_key` — CREATE UNIQUE INDEX tipos_contatos_id_api_tipo_key ON public.tipos_contatos USING btree (id_api_t...

---

## user_profiles

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_user | uuid | NO | gen_random_uuid() |
| email | character varying(255) | NO | — |
| password_hash | character varying(255) | NO | — |
| name | character varying(255) | NO | — |
| role | character varying(50) | NO | 'user'::character varying |
| avatar_url | text | YES | — |
| phone | character varying(20) | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| last_login | timestamp with time zone | YES | — |
| is_active | boolean | YES | true |
| vendedor_id | bigint | YES | — |
| mx_desconto_permitido | numeric | YES | — |

**Índices:**
- `users_email_key` — CREATE UNIQUE INDEX users_email_key ON public.user_profiles USING btree (email)
- `idx_users_email` — CREATE INDEX idx_users_email ON public.user_profiles USING btree (email)
- `idx_users_role` — CREATE INDEX idx_users_role ON public.user_profiles USING btree (role)
- `idx_users_is_active` — CREATE INDEX idx_users_is_active ON public.user_profiles USING btree (is_active)
- `user_profiles_id_user_key` — CREATE UNIQUE INDEX user_profiles_id_user_key ON public.user_profiles USING btree (id_user)

---

## vales_troca

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| codigo_voucher | text | NO | — |
| valor | numeric | NO | — |
| cliente_id | integer | NO | — |
| criado_por | uuid | YES | — |
| status | character varying(100) | NO | 'ativo'::character varying |
| created_at | timestamp with time zone | NO | now() |
| observacao | text | YES | — |
| venda_id | integer | YES | — |

**Índices:**
- `idx_codigo_voucher_ativo` — CREATE UNIQUE INDEX idx_codigo_voucher_ativo ON public.vales_troca USING btree (codigo_voucher) W...

---

## vendas

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('vendas_id_seq'::regclass) |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp without time zone | YES | now() |
| cliente_id | integer | YES | — |
| vendedor_id | integer | YES | — |
| data_venda | date | YES | — |
| data_envio | timestamp with time zone | YES | — |
| status | integer | YES | — |
| total_produtos | numeric | YES | — |
| total_venda | numeric | YES | — |
| total_itens_qnt | integer | YES | — |
| total_itens_unidades | integer | YES | — |
| forma_envio_id | integer | YES | — |
| forma_frete_id | integer | YES | — |
| endereco_cobranca | jsonb | YES | — |
| dados_entrega | jsonb | YES | — |
| dados_pagamento | jsonb | YES | — |
| observacoes_internas | text | YES | — |
| observacoes | text | YES | — |
| arquivos_path | ARRAY | YES | — |
| frete_pago_cliente | double precision | YES | — |
| lead_id | bigint | YES | — |
| numero_pedido_tiny | text | YES | — |
| id_api_tiny | bigint | YES | — |
| public_link_uuid | text | YES | — |
| entregue | boolean | NO | false |
| numero_pedido | bigint | YES | — |
| pedido_numero | integer | YES | — |

**Índices:**
- `vendas_lead_id_key` — CREATE UNIQUE INDEX vendas_lead_id_key ON public.vendas USING btree (lead_id)
- `idx_vendas_id_api_tiny` — CREATE UNIQUE INDEX idx_vendas_id_api_tiny ON public.vendas USING btree (id_api_tiny)
- `idx_vendas_entregue` — CREATE INDEX idx_vendas_entregue ON public.vendas USING btree (entregue)
- `vendas_id_api_tiny_key` — CREATE UNIQUE INDEX vendas_id_api_tiny_key ON public.vendas USING btree (id_api_tiny)

**Triggers:**
- `trg_venda_sequencial` (BEFORE INSERT)
- `on_update_vendas` (BEFORE UPDATE)
- `trg_notificar_n8n` (AFTER INSERT)
- `trg_notificar_n8n` (AFTER UPDATE)
- `trg_sync_venda_insert_from_public` (AFTER INSERT)
- `trg_sync_venda_update_from_public` (AFTER UPDATE)

---

## vendedores

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_vendedor | bigint | NO | — |
| nome | text | YES | — |
| id_api_vendedor | bigint | YES | — |
| foto | text | YES | — |
| situacao | USER-DEFINED | YES | — |
| id_api_kommo | bigint | YES | — |
| cpf | text | YES | — |
| email | text | YES | — |
| user_id | uuid | YES | — |
| comissao | bigint | YES | — |
| gerente_orcamento | boolean | YES | — |

**Índices:**
- `vendedores_id_api_kommo_key` — CREATE UNIQUE INDEX vendedores_id_api_kommo_key ON public.vendedores USING btree (id_api_kommo)
- `vendedores_cpf_key` — CREATE UNIQUE INDEX vendedores_cpf_key ON public.vendedores USING btree (cpf)
- `vendedores_id_api_vendedor_key` — CREATE UNIQUE INDEX vendedores_id_api_vendedor_key ON public.vendedores USING btree (id_api_vende...
- `vendedores_email_key` — CREATE UNIQUE INDEX vendedores_email_key ON public.vendedores USING btree (email)

---

## Views (45)

### contasareceberdetalhada

```sql

...
```

### crm_agente_runs

```sql
 SELECT agente_runs.id,
    agente_runs.agente_id,
    agente_runs.conversa_id,
...
```

### crm_agentes_ia

```sql
 SELECT agentes_ia.id,
    agentes_ia.codigo,
    agentes_ia.nome,
...
```

### crm_audit_log

```sql
 SELECT audit_log.id,
    audit_log.schema_name,
    audit_log.table_name,
...
```

### crm_automacao_etapas

```sql
 SELECT automacao_etapas.id,
    automacao_etapas.legacy_id,
    automacao_etapas.funil_id,
...
```

### crm_automacao_execucoes

```sql
 SELECT automacao_execucoes.id,
    automacao_execucoes.automacao_id,
    automacao_execucoes.conversa_id,
...
```

### crm_automacao_gatilhos

```sql
 SELECT automacao_gatilhos.automacao_id,
    automacao_gatilhos.gatilho,
    automacao_gatilhos.parametros
...
```

### crm_automacoes

```sql
 SELECT automacoes.id,
    automacoes.nome,
    automacoes.descricao,
...
```

### crm_brechas

```sql
 SELECT brechas.id,
    brechas.conversa_id,
    brechas.contato_id,
...
```

### crm_ciclo_vida_eventos

```sql
 SELECT ciclo_vida_eventos.id,
    ciclo_vida_eventos.conversa_id,
    ciclo_vida_eventos.contato_id,
...
```

### crm_config_geral

```sql
 SELECT config_geral.chave,
    config_geral.valor,
    config_geral.descricao,
...
```

### crm_contato_canais

```sql
 SELECT contato_canais.id,
    contato_canais.contato_id,
    contato_canais.canal,
...
```

### crm_conversas

```sql
 SELECT conversas.id,
    conversas.contato_id,
    conversas.lead_id,
...
```

### crm_conversas_completas

```sql
 SELECT c.id,
    c.contato_id,
    c.lead_id,
...
```

### crm_funil_blocos

```sql
 SELECT funil_blocos.id,
    funil_blocos.nome,
    funil_blocos.ordem,
...
```

### crm_funil_etapas

```sql
 SELECT funil_etapas.id,
    funil_etapas.bloco_id,
    funil_etapas.nome,
...
```

### crm_funil_etapas_completas

```sql
 SELECT fe.id,
    fe.bloco_id,
    fe.nome,
...
```

### crm_funil_movimentos

```sql
 SELECT funil_movimentos.id,
    funil_movimentos.conversa_id,
    funil_movimentos.etapa_de,
...
```

### crm_funis

```sql
 SELECT funis.id,
    funis.legacy_id,
    funis.nome,
...
```

### crm_instagram_posts

```sql
 SELECT instagram_posts.id,
    instagram_posts.tipo,
    instagram_posts.caption,
...
```

### crm_kommo_config

```sql
 SELECT kommo_config.id,
    kommo_config.subdomain,
    kommo_config.client_id,
...
```

### crm_mensagens

```sql
 SELECT mensagens.id,
    mensagens.conversa_id,
    mensagens.canal_message_id,
...
```

### crm_meta_config

```sql
 SELECT meta_config.id,
    meta_config.app_id,
    meta_config.app_secret,
...
```

### crm_motivos_perda

```sql
 SELECT motivos_perda.id,
    motivos_perda.legacy_id,
    motivos_perda.nome,
...
```

### crm_notificacoes

```sql
 SELECT notificacoes.id,
    notificacoes.user_id,
    notificacoes.tipo,
...
```

### crm_oportunidade_historico

```sql
 SELECT oportunidade_historico.id,
    oportunidade_historico.oportunidade_id,
    oportunidade_historico.etapa_anterior_id,
...
```

### crm_oportunidades

```sql
 SELECT oportunidades.id,
    oportunidades.legacy_id,
    oportunidades.contato_id,
...
```

### crm_oportunidades_completas

```sql
 SELECT o.id,
    o.legacy_id,
    o.contato_id,
...
```

### crm_origens_lead

```sql
 SELECT origens_lead.id,
    origens_lead.legacy_id,
    origens_lead.nome,
...
```

### crm_prompt_templates

```sql
 SELECT prompt_templates.id,
    prompt_templates.codigo,
    prompt_templates.nome,
...
```

### crm_sdr_runs

```sql
 SELECT sdr_runs.id,
    sdr_runs.conversa_id,
    sdr_runs.score_budget,
...
```

### crm_tarefas

```sql
 SELECT tarefas.id,
    tarefas.titulo,
    tarefas.descricao,
...
```

### crm_unipile_config

```sql
 SELECT unipile_config.id,
    unipile_config.api_key,
    unipile_config.dsn,
...
```

### crm_user_perfil

```sql
 SELECT au.id AS user_id,
    au.email,
    eu.nome,
...
```

### crm_webhook_config

```sql
 SELECT webhook_config.id,
    webhook_config.nome,
    webhook_config.source,
...
```

### crm_webhook_log

```sql
 SELECT webhook_log.id,
    webhook_log.source,
    webhook_log.event,
...
```

### fin_divergencias_pendentes

```sql
 SELECT c.id AS conciliacao_id,
    cp.id AS conta_pagar_id,
    cp.historico AS descricao,
...
```

### pedidos_dashboard

```sql

...
```

### pedidos_parcelas_detalhado

```sql

...
```

### produtos_views

```sql

...
```

### users

```sql

...
```

### v_estoque_detalhado_insumo

```sql

...
```

### v_quebra_distribuicao

```sql

...
```

### v_saldo_quebra_final

```sql

...
```

### view_monitoramento_ordens

```sql

...
```

