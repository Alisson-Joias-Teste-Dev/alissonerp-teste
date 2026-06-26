# Schema alissonerp — outros

> Gerado em: 2026-04-29 | Tabelas: 75

## _backup_fn_processar_fechamento_dist_pre_guard_20260429

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| info | text | YES | — |

---

## _backup_servicos_20260331

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | YES | — |
| ordem_id | integer | YES | — |
| pcp_id | integer | YES | — |
| operador_id | integer | YES | — |
| tentativa | integer | YES | — |
| peso_entrada | numeric | YES | — |
| peso_saida | numeric | YES | — |
| usou_solda | boolean | YES | — |
| peso_fio_antes | numeric | YES | — |
| peso_fio_depois | numeric | YES | — |
| consumo_solda | numeric | YES | — |
| colocou_pedra | boolean | YES | — |
| pedras_colocadas | jsonb | YES | — |
| status | character varying(20) | YES | — |
| foto_recebimento | text | YES | — |
| foto_conclusao | text | YES | — |
| foto_fio_solda | text | YES | — |
| recebido_em | timestamp with time zone | YES | — |
| concluido_em | timestamp with time zone | YES | — |
| concluido_por | uuid | YES | — |
| created_at | timestamp with time zone | YES | — |
| motivo_reprovacao | text | YES | — |
| foto_reprovacao | text | YES | — |
| reprovado_em | timestamp with time zone | YES | — |
| reprovado_por | uuid | YES | — |

---

## _backup_tedmd_20260313

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | YES | — |
| entrada | real | YES | — |
| saida | real | YES | — |
| insumo_id | integer | YES | — |
| deposito_id | integer | YES | — |
| setor_id | integer | YES | — |
| ordem_id | integer | YES | — |
| marcador | USER-DEFINED | YES | — |
| obs | text | YES | — |
| data_hora | timestamp with time zone | YES | — |
| valor_total | numeric | YES | — |
| preco_compra | numeric | YES | — |
| created_at | timestamp with time zone | YES | — |
| created_by | uuid | YES | — |

---

## _backup_transferservice_20260331

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | YES | — |
| pcp_id | integer | YES | — |
| ordem_id | integer | YES | — |
| setor_id | integer | YES | — |
| deposito_id | integer | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | — |
| updated_at | timestamp with time zone | YES | — |
| created_by | uuid | YES | — |

---

## api_chaves

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.api_chaves_id_seq'::regclass) |
| nome | text | NO | — |
| chave_hash | text | NO | — |
| chave_preview | text | NO | — |
| ativa | boolean | NO | true |
| rate_limit_por_minuto | integer | NO | 60 |
| total_requisicoes | bigint | NO | 0 |
| ultimo_uso | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | NO | now() |

**Índices:**
- `api_chaves_chave_hash_key` — CREATE UNIQUE INDEX api_chaves_chave_hash_key ON alissonerp.api_chaves USING btree (chave_hash)

---

## api_log

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('alissonerp.api_log_id_seq'::regclass) |
| chave_id | integer | YES | — |
| endpoint | text | NO | — |
| metodo | text | NO | 'GET'::text |
| status_code | integer | YES | — |
| ip | text | YES | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `chave_id` → `alissonerp.api_chaves.id`

**Índices:**
- `idx_api_log_chave_id` — CREATE INDEX idx_api_log_chave_id ON alissonerp.api_log USING btree (chave_id)
- `idx_api_log_created_at` — CREATE INDEX idx_api_log_created_at ON alissonerp.api_log USING btree (created_at DESC)

---

## aprovacoes_consultora

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.aprovacoes_consultora_id_seq'::regclass) |
| etapas | USER-DEFINED | YES | 'pendente'::alissonerp.enum_etapas_aprovacao |
| ordem_id | integer | YES | — |
| consultora_id | bigint | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`

**Triggers:**
- `trg_aprovacao_entrega` (AFTER UPDATE)

---

## automacoes_execucoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.automacoes_execucoes_id_seq'::regclass) |
| automacao_id | integer | NO | — |
| tarefa_id | integer | YES | — |
| executado_em | date | NO | CURRENT_DATE |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `automacao_id` → `alissonerp.automacoes_tarefa.id`
- `tarefa_id` → `alissonerp.tarefas.id`

**Índices:**
- `idx_exec_automacao` — CREATE INDEX idx_exec_automacao ON alissonerp.automacoes_execucoes USING btree (automacao_id)

---

## backup_pre_limpeza_20260315

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| src | text | YES | — |
| id | bigint | YES | — |
| ordem_id | integer | YES | — |
| insumo_id | integer | YES | — |
| deposito_id | integer | YES | — |
| entrada | real | YES | — |
| saida | real | YES | — |
| marcador | USER-DEFINED | YES | — |
| data_hora | timestamp with time zone | YES | — |

---

## compras

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.compras_id_seq'::regclass) |
| fornecedor_id | bigint | YES | — |
| situacao | character varying(20) | YES | 'pendente'::character varying |
| total | numeric | YES | 0 |
| obs | text | YES | — |
| bloqueado | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| local_destino_id | integer | YES | — |
| numero_nf | character varying(50) | YES | — |
| data_compra | date | YES | — |
| data_recebimento | date | YES | — |
| recebido_por | uuid | YES | — |

**FKs:**
- `local_destino_id` → `alissonerp.locais_estoque.id`

**Índices:**
- `idx_compras_local_destino` — CREATE INDEX idx_compras_local_destino ON alissonerp.compras USING btree (local_destino_id)
- `idx_compras_data_compra` — CREATE INDEX idx_compras_data_compra ON alissonerp.compras USING btree (data_compra)

**Triggers:**
- `trg_aa_bloquear_compra` (BEFORE UPDATE)
- `trg_concluir_compra` (BEFORE UPDATE)
- `trg_compra_gerar_conta_pagar` (AFTER UPDATE)

---

## contas_pagar

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.contas_pagar_id_seq'::regclass) |
| descricao | text | NO | — |
| fornecedor_id | bigint | YES | — |
| valor | numeric | NO | — |
| data_vencimento | date | YES | — |
| data_pagamento | date | YES | — |
| situacao | character varying(20) | YES | 'pendente'::character varying |
| categoria | character varying(50) | YES | — |
| compra_id | integer | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| fornecedor_nome | text | YES | — |
| inter_pagamento_id | character varying(100) | YES | — |
| inter_status | character varying(30) | YES | — |
| inter_tipo | character varying(10) | YES | — |
| inter_dados | jsonb | YES | — |
| inter_enviado_em | timestamp with time zone | YES | — |
| inter_atualizado_em | timestamp with time zone | YES | — |
| inter_erro | text | YES | — |

**FKs:**
- `compra_id` → `alissonerp.compras.id`

**Índices:**
- `idx_cp_situacao` — CREATE INDEX idx_cp_situacao ON alissonerp.contas_pagar USING btree (situacao)
- `idx_cp_vencimento` — CREATE INDEX idx_cp_vencimento ON alissonerp.contas_pagar USING btree (data_vencimento)
- `idx_contas_pagar_inter_pagamento` — CREATE INDEX idx_contas_pagar_inter_pagamento ON alissonerp.contas_pagar USING btree (inter_pagam...
- `idx_contas_pagar_inter_status_pendente` — CREATE INDEX idx_contas_pagar_inter_status_pendente ON alissonerp.contas_pagar USING btree (inter...

---

## contatos_fiscais

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_contato | bigint | NO | — |
| ie | character varying(20) | YES | — |
| indicador_ie | smallint | YES | — |
| codigo_ibge_municipio | character varying(7) | YES | — |
| regime_tributario | smallint | YES | — |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `idx_contatos_fiscais_ibge` — CREATE INDEX idx_contatos_fiscais_ibge ON alissonerp.contatos_fiscais USING btree (codigo_ibge_mu...

---

## curva_categorias

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.curva_categorias_id_seq'::regclass) |
| nome | character varying(60) | NO | — |
| max_weight | numeric | NO | — |
| variation | numeric | NO | 0 |
| comm_variation | numeric | NO | 0 |
| max_discount | numeric | NO | 0 |
| ativo | boolean | NO | true |
| ordem | integer | NO | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `idx_curva_categorias_ordem` — CREATE UNIQUE INDEX idx_curva_categorias_ordem ON alissonerp.curva_categorias USING btree (ordem)
- `idx_curva_categorias_ativo_peso` — CREATE INDEX idx_curva_categorias_ativo_peso ON alissonerp.curva_categorias USING btree (ativo, m...

**Triggers:**
- `trg_curva_categorias_updated_at` (BEFORE UPDATE)

---

## curva_config

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | smallint | NO | — |
| start_mkp | numeric | NO | 5.000 |
| start_commission | numeric | NO | 8.000 |
| gold_cost_percentage | numeric | NO | 100.000 |
| sucata_compra_min_pct | numeric | NO | 80.000 |
| sucata_compra_max_pct | numeric | NO | 85.000 |
| arredondamento | character varying(20) | NO | 'dezena'::character varying |
| updated_at | timestamp with time zone | NO | now() |
| updated_by | uuid | YES | — |

**Triggers:**
- `trg_curva_config_updated_at` (BEFORE UPDATE)

---

## dashboard_configs

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.dashboard_configs_id_seq'::regclass) |
| usuario_id | uuid | NO | — |
| layout | jsonb | NO | '[]'::jsonb |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**FKs:**
- `usuario_id` → `alissonerp.usuarios.id`

**Índices:**
- `dashboard_configs_usuario_id_key` — CREATE UNIQUE INDEX dashboard_configs_usuario_id_key ON alissonerp.dashboard_configs USING btree ...
- `idx_dashboard_configs_usuario` — CREATE INDEX idx_dashboard_configs_usuario ON alissonerp.dashboard_configs USING btree (usuario_id)

---

## devolucoes_itens

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.devolucoes_itens_id_seq'::regclass) |
| devolucao_id | integer | NO | — |
| item_venda_id | integer | NO | — |
| produto_id | bigint | YES | — |
| quantidade | numeric | NO | — |
| valor_unitario | numeric | NO | — |
| valor_total | numeric | NO | — |
| condicao | character varying(30) | NO | 'pendente'::character varying |
| inspecao_por | uuid | YES | — |
| inspecao_em | timestamp with time zone | YES | — |
| inspecao_observacao | text | YES | — |

**FKs:**
- `devolucao_id` → `alissonerp.devolucoes_venda.id`
- `item_venda_id` → `alissonerp.itens_venda_erp.id`

**Índices:**
- `idx_devolucoes_itens_devolucao` — CREATE INDEX idx_devolucoes_itens_devolucao ON alissonerp.devolucoes_itens USING btree (devolucao...
- `idx_devolucoes_itens_item` — CREATE INDEX idx_devolucoes_itens_item ON alissonerp.devolucoes_itens USING btree (item_venda_id)
- `idx_devolucoes_itens_produto` — CREATE INDEX idx_devolucoes_itens_produto ON alissonerp.devolucoes_itens USING btree (produto_id)

---

## distribuicoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.distribuicoes_id_seq'::regclass) |
| etapas | USER-DEFINED | YES | 'em_andamento'::alissonerp.enum_etapas_distribuicao |
| setor | USER-DEFINED | YES | — |
| operador | uuid | YES | — |
| saida_id | integer | YES | — |
| total_metal | real | YES | 0 |
| retorno_metal | real | YES | 0 |
| total_pedras_un | real | YES | 0 |
| total_pedras_g | real | YES | 0 |
| total_outros_pesos | real | YES | 0 |
| total_geral_outros_pesos | real | YES | 0 |
| pmc | real | YES | 0 |
| quebra | real | YES | 0 |
| porcentagem_de_quebra | real | YES | 0 |
| peso_final | real | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| deposito_id | integer | YES | — |
| setor_id | integer | YES | — |
| ouro_entregue | real | YES | — |
| ouro_pecas | real | YES | — |
| quebra_lote | real | YES | — |
| total_pedras_ct | numeric | YES | 0 |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `saida_id` → `alissonerp.saidas_distribuicao.id`
- `setor_id` → `alissonerp.setores.id`

**Triggers:**
- `trg_audit_distribuicoes` (AFTER INSERT)
- `trg_audit_distribuicoes` (AFTER DELETE)
- `trg_audit_distribuicoes` (AFTER UPDATE)
- `trg_concluir_distribuicao` (BEFORE UPDATE)

---

## editor_ia_historico

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('alissonerp.editor_ia_historico_id_seq'::regclass) |
| user_id | uuid | YES | — |
| user_nome | text | YES | — |
| input_hash | text | NO | — |
| params_hash | text | NO | — |
| categoria | text | YES | — |
| cenario_id | text | YES | — |
| cenario_nome | text | YES | — |
| modelo | text | NO | — |
| aspect_ratio | text | YES | — |
| detalhes | text | YES | — |
| prompt_final | text | YES | — |
| imagem_url | text | NO | — |
| storage_path | text | NO | — |
| elapsed_ms | integer | YES | — |
| cache_hits | integer | NO | 0 |
| created_at | timestamp with time zone | NO | now() |

**Índices:**
- `idx_editor_ia_historico_dedup` — CREATE UNIQUE INDEX idx_editor_ia_historico_dedup ON alissonerp.editor_ia_historico USING btree (...
- `idx_editor_ia_historico_user_created` — CREATE INDEX idx_editor_ia_historico_user_created ON alissonerp.editor_ia_historico USING btree (...
- `idx_editor_ia_historico_created` — CREATE INDEX idx_editor_ia_historico_created ON alissonerp.editor_ia_historico USING btree (creat...

---

## empresas_emitentes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.empresas_emitentes_id_seq'::regclass) |
| nome_fantasia | character varying(100) | YES | — |
| razao_social | character varying(150) | NO | — |
| cnpj | character varying(14) | NO | — |
| ie | character varying(20) | YES | — |
| im | character varying(20) | YES | — |
| regime_tributario | smallint | NO | 1 |
| logradouro | character varying(120) | YES | — |
| numero | character varying(20) | YES | — |
| complemento | character varying(60) | YES | — |
| bairro | character varying(60) | YES | — |
| codigo_ibge_municipio | character varying(7) | YES | — |
| municipio | character varying(60) | YES | — |
| uf | character(2) | YES | — |
| cep | character varying(8) | YES | — |
| focus_token_criptografado | text | YES | — |
| ambiente | character varying(15) | NO | 'homologacao'::character varying |
| serie_nfe | smallint | NO | 1 |
| serie_nfce | smallint | NO | 1 |
| proxima_nfe | integer | NO | 1 |
| proxima_nfce | integer | NO | 1 |
| local_estoque_id | integer | YES | — |
| ativo | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**FKs:**
- `local_estoque_id` → `alissonerp.locais_estoque.id`

**Índices:**
- `empresas_emitentes_cnpj_key` — CREATE UNIQUE INDEX empresas_emitentes_cnpj_key ON alissonerp.empresas_emitentes USING btree (cnpj)
- `idx_empresas_emitentes_cnpj` — CREATE INDEX idx_empresas_emitentes_cnpj ON alissonerp.empresas_emitentes USING btree (cnpj)
- `idx_empresas_emitentes_local` — CREATE INDEX idx_empresas_emitentes_local ON alissonerp.empresas_emitentes USING btree (local_est...
- `idx_empresas_emitentes_ativo` — CREATE INDEX idx_empresas_emitentes_ativo ON alissonerp.empresas_emitentes USING btree (ativo) WH...

---

## epc_serial

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| ano | integer | NO | — |
| proximo_serial | bigint | NO | 1 |
| atualizado_em | timestamp with time zone | NO | now() |

---

## erp_produtos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.erp_produtos_id_seq'::regclass) |
| produto_id | bigint | NO | — |
| sku | character varying(100) | NO | — |
| nome | character varying(500) | YES | — |
| parent_sku | character varying(100) | YES | — |
| parent_id | integer | YES | — |
| eh_variacao | boolean | NO | false |
| eh_pai | boolean | NO | false |
| sufixo_variacao | character varying(20) | YES | — |
| numeracao | character varying(10) | YES | — |
| cor_metal | character varying(30) | YES | — |
| comprimento | numeric | YES | — |
| largura_aro | numeric | YES | — |
| altura_aro | numeric | YES | — |
| base | numeric | YES | — |
| observacao_erp | text | YES | — |
| ativo | boolean | NO | true |
| date_created | timestamp with time zone | NO | now() |
| date_updated | timestamp with time zone | NO | now() |
| fornecedor | character varying(120) | YES | — |

**FKs:**
- `parent_id` → `alissonerp.erp_produtos.id`

**Índices:**
- `erp_produtos_produto_id_key` — CREATE UNIQUE INDEX erp_produtos_produto_id_key ON alissonerp.erp_produtos USING btree (produto_id)
- `erp_produtos_sku_key` — CREATE UNIQUE INDEX erp_produtos_sku_key ON alissonerp.erp_produtos USING btree (sku)
- `idx_erp_produtos_produto_id` — CREATE INDEX idx_erp_produtos_produto_id ON alissonerp.erp_produtos USING btree (produto_id)
- `idx_erp_produtos_sku` — CREATE INDEX idx_erp_produtos_sku ON alissonerp.erp_produtos USING btree (sku)
- `idx_erp_produtos_parent_sku` — CREATE INDEX idx_erp_produtos_parent_sku ON alissonerp.erp_produtos USING btree (parent_sku) WHER...
- `idx_erp_produtos_parent_id` — CREATE INDEX idx_erp_produtos_parent_id ON alissonerp.erp_produtos USING btree (parent_id) WHERE ...
- `idx_erp_produtos_eh_pai` — CREATE INDEX idx_erp_produtos_eh_pai ON alissonerp.erp_produtos USING btree (eh_pai) WHERE (eh_pa...
- `idx_erp_produtos_eh_variacao` — CREATE INDEX idx_erp_produtos_eh_variacao ON alissonerp.erp_produtos USING btree (eh_variacao) WH...
- `idx_erp_produtos_fornecedor` — CREATE INDEX idx_erp_produtos_fornecedor ON alissonerp.erp_produtos USING btree (fornecedor) WHER...

---

## faixas_comissao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.faixas_comissao_id_seq'::regclass) |
| desconto_pct | numeric | NO | — |
| comissao_pct | numeric | NO | — |
| ativo | boolean | NO | true |
| updated_at | timestamp with time zone | NO | now() |
| updated_by | uuid | YES | — |

**Índices:**
- `faixas_comissao_desconto_pct_key` — CREATE UNIQUE INDEX faixas_comissao_desconto_pct_key ON alissonerp.faixas_comissao USING btree (d...

---

## fechamentos_fabrica

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fechamentos_fabrica_id_seq'::regclass) |
| setor_id | integer | YES | — |
| deposito_id | integer | YES | — |
| entrada | real | YES | 0 |
| saida | real | YES | 0 |
| quebra | real | YES | 0 |
| quebra_percentual | real | YES | 0 |
| ids_processados | jsonb | YES | — |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `setor_id` → `alissonerp.setores.id`

---

## fin_caixa_baixas

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fin_caixa_baixas_id_seq'::regclass) |
| total | numeric | NO | — |
| qtd_pagamentos | integer | NO | — |
| realizado_por | uuid | YES | — |
| realizado_nome | text | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |

---

## fin_conciliacoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fin_conciliacoes_id_seq'::regclass) |
| lancamento_id | integer | YES | — |
| conta_pagar_id | integer | YES | — |
| conta_receber_id | integer | YES | — |
| tipo | character varying(20) | YES | 'manual'::character varying |
| status | character varying(20) | YES | 'pendente'::character varying |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| pagamento_venda_id | integer | YES | — |

**FKs:**
- `conta_pagar_id` → `alissonerp.contas_pagar.id`
- `conta_receber_id` → `alissonerp.contas_receber.id`
- `lancamento_id` → `alissonerp.fin_lancamentos_bancarios.id`
- `pagamento_venda_id` → `alissonerp.pagamentos_venda.id`

**Índices:**
- `idx_fin_conciliacoes_pagamento_venda_id` — CREATE INDEX idx_fin_conciliacoes_pagamento_venda_id ON alissonerp.fin_conciliacoes USING btree (...

---

## fin_extratos_bancarios

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fin_extratos_bancarios_id_seq'::regcl... |
| banco | character varying(50) | YES | — |
| agencia | character varying(20) | YES | — |
| conta | character varying(30) | YES | — |
| data_inicio | date | YES | — |
| data_fim | date | YES | — |
| arquivo_nome | text | YES | — |
| arquivo_url | text | YES | — |
| processado | boolean | YES | false |
| total_lancamentos | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |

---

## fin_gateways

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fin_gateways_id_seq'::regclass) |
| nome | text | NO | — |
| tipo | character varying(20) | NO | 'outro'::character varying |
| ativo | boolean | NO | true |
| cor | character varying(7) | YES | '#6B7280'::character varying |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |

---

## fin_lancamentos_bancarios

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fin_lancamentos_bancarios_id_seq'::re... |
| extrato_id | integer | YES | — |
| fitid | character varying(100) | YES | — |
| tipo | character varying(10) | YES | — |
| valor | numeric | NO | — |
| data_transacao | date | YES | — |
| descricao | text | YES | — |
| memo | text | YES | — |
| conciliado | boolean | YES | false |
| conciliacao_id | integer | YES | — |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `extrato_id` → `alissonerp.fin_extratos_bancarios.id`

**Índices:**
- `fin_lancamentos_bancarios_fitid_key` — CREATE UNIQUE INDEX fin_lancamentos_bancarios_fitid_key ON alissonerp.fin_lancamentos_bancarios U...
- `idx_flb_fitid` — CREATE INDEX idx_flb_fitid ON alissonerp.fin_lancamentos_bancarios USING btree (fitid)
- `idx_flb_extrato` — CREATE INDEX idx_flb_extrato ON alissonerp.fin_lancamentos_bancarios USING btree (extrato_id)
- `idx_flb_data` — CREATE INDEX idx_flb_data ON alissonerp.fin_lancamentos_bancarios USING btree (data_transacao)

---

## fornecedores

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fornecedores_id_seq'::regclass) |
| nome | character varying(120) | NO | — |
| cnpj | character varying(20) | YES | — |
| contato | character varying(120) | YES | — |
| observacao | text | YES | — |
| ativo | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `fornecedores_nome_key` — CREATE UNIQUE INDEX fornecedores_nome_key ON alissonerp.fornecedores USING btree (nome)

**Triggers:**
- `trg_fornecedores_updated_at` (BEFORE UPDATE)

---

## fretes_bairro

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.fretes_bairro_id_seq'::regclass) |
| bairro | text | NO | — |
| municipio | text | NO | 'Fortaleza'::text |
| valor | numeric | NO | 0 |
| ativo | boolean | NO | true |
| created_at | timestamp with time zone | YES | now() |

**Índices:**
- `idx_fretes_bairro_uniq` — CREATE UNIQUE INDEX idx_fretes_bairro_uniq ON alissonerp.fretes_bairro USING btree (bairro, munic...

---

## inter_sync_log

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.inter_sync_log_id_seq'::regclass) |
| conta_pagar_id | integer | YES | — |
| operacao | character varying(20) | NO | — |
| inter_pagamento_id | character varying(100) | YES | — |
| status_retornado | character varying(30) | YES | — |
| sucesso | boolean | NO | — |
| erro | text | YES | — |
| request_body | jsonb | YES | — |
| response_body | jsonb | YES | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `conta_pagar_id` → `alissonerp.contas_pagar.id`

**Índices:**
- `idx_inter_sync_log_conta` — CREATE INDEX idx_inter_sync_log_conta ON alissonerp.inter_sync_log USING btree (conta_pagar_id)
- `idx_inter_sync_log_created` — CREATE INDEX idx_inter_sync_log_created ON alissonerp.inter_sync_log USING btree (created_at DESC)

---

## inventarios_comercial

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.inventarios_comercial_id_seq'::regclass) |
| local_estoque_id | integer | NO | — |
| status | character varying(20) | NO | 'aberto'::character varying |
| obs | text | YES | — |
| data_abertura | timestamp with time zone | NO | now() |
| data_conclusao | timestamp with time zone | YES | — |
| created_by | uuid | YES | — |
| concluido_por | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `local_estoque_id` → `alissonerp.locais_estoque.id`

**Índices:**
- `idx_inv_ec_status` — CREATE INDEX idx_inv_ec_status ON alissonerp.inventarios_comercial USING btree (status) WHERE ((s...

---

## itens_compra

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.itens_compra_id_seq'::regclass) |
| compra_id | integer | YES | — |
| insumo_id | integer | YES | — |
| deposito_id | integer | YES | 1 |
| qtd | real | NO | — |
| valor_unitario | numeric | YES | — |
| valor_total | numeric | YES | — |
| created_at | timestamp with time zone | YES | now() |
| unidade | character varying(20) | YES | — |
| peso_ct | numeric | YES | — |
| qtd_pecas | integer | YES | — |
| custo_por_ct | numeric | YES | — |
| lote_referencia | character varying(100) | YES | — |
| observacao | text | YES | — |

**FKs:**
- `compra_id` → `alissonerp.compras.id`
- `deposito_id` → `alissonerp.depositos.id`
- `insumo_id` → `alissonerp.insumos.id`

**Índices:**
- `idx_itens_compra_lote` — CREATE INDEX idx_itens_compra_lote ON alissonerp.itens_compra USING btree (lote_referencia)

**Triggers:**
- `trg_calcular_item_compra` (BEFORE INSERT)
- `trg_calcular_item_compra` (BEFORE UPDATE)

---

## itens_inventario_comercial

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.itens_inventario_comercial_id_seq'::r... |
| inventario_id | integer | NO | — |
| produto_id | bigint | NO | — |
| quantidade_sistema | integer | NO | 0 |
| quantidade_contada | integer | YES | — |
| diferenca | integer | YES | — |
| movimento_ajuste_id | integer | YES | — |
| contado_por | uuid | YES | — |
| contado_em | timestamp with time zone | YES | — |

**FKs:**
- `inventario_id` → `alissonerp.inventarios_comercial.id`
- `movimento_ajuste_id` → `alissonerp.movimentacoes_estoque_comercial.id`

**Índices:**
- `itens_inventario_comercial_inventario_id_produto_id_key` — CREATE UNIQUE INDEX itens_inventario_comercial_inventario_id_produto_id_key ON alissonerp.itens_i...
- `idx_itens_inv_ec_inv` — CREATE INDEX idx_itens_inv_ec_inv ON alissonerp.itens_inventario_comercial USING btree (inventari...

---

## joias_leituras

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('alissonerp.joias_leituras_id_seq'::regclass) |
| epc | text | NO | — |
| evento | text | NO | — |
| localizacao | text | YES | — |
| leitor_id | text | YES | — |
| operador | uuid | YES | — |
| metadata | jsonb | YES | — |
| lido_em | timestamp with time zone | NO | now() |

**FKs:**
- `operador` → `alissonerp.usuarios.id`

**Índices:**
- `idx_joias_leituras_epc` — CREATE INDEX idx_joias_leituras_epc ON alissonerp.joias_leituras USING btree (epc, lido_em DESC)
- `idx_joias_leituras_operador` — CREATE INDEX idx_joias_leituras_operador ON alissonerp.joias_leituras USING btree (operador, lido...
- `idx_joias_leituras_evento` — CREATE INDEX idx_joias_leituras_evento ON alissonerp.joias_leituras USING btree (evento, lido_em ...

---

## joias_rfid

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| epc | text | NO | — |
| produto_id | bigint | YES | — |
| sku | text | NO | — |
| nome | text | NO | — |
| categoria | text | YES | — |
| peso_g | numeric | YES | — |
| preco_venda | numeric | YES | — |
| localizacao_atual | text | NO | 'fabrica'::text |
| status | text | NO | 'ativo'::text |
| criado_por | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**FKs:**
- `criado_por` → `alissonerp.usuarios.id`

**Índices:**
- `joias_rfid_epc_key` — CREATE UNIQUE INDEX joias_rfid_epc_key ON alissonerp.joias_rfid USING btree (epc)
- `idx_joias_rfid_epc` — CREATE INDEX idx_joias_rfid_epc ON alissonerp.joias_rfid USING btree (epc)
- `idx_joias_rfid_sku` — CREATE INDEX idx_joias_rfid_sku ON alissonerp.joias_rfid USING btree (sku)
- `idx_joias_rfid_produto` — CREATE INDEX idx_joias_rfid_produto ON alissonerp.joias_rfid USING btree (produto_id)
- `idx_joias_rfid_localizacao_ativo` — CREATE INDEX idx_joias_rfid_localizacao_ativo ON alissonerp.joias_rfid USING btree (localizacao_a...
- `idx_joias_rfid_criado_por` — CREATE INDEX idx_joias_rfid_criado_por ON alissonerp.joias_rfid USING btree (criado_por, created_...

**Triggers:**
- `trg_joias_rfid_touch_updated` (BEFORE UPDATE)

---

## lancamentos_avulso

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.lancamentos_avulso_id_seq'::regclass) |
| tipo_lancamento | USER-DEFINED | NO | — |
| deposito_id | integer | YES | — |
| setor_id | integer | YES | — |
| insumo_id | integer | YES | — |
| peso | real | YES | — |
| obs | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| deposito_destino_id | integer | YES | — |
| local_estoque_id | integer | YES | 1 |

**FKs:**
- `deposito_destino_id` → `alissonerp.depositos.id`
- `deposito_id` → `alissonerp.depositos.id`
- `insumo_id` → `alissonerp.insumos.id`
- `local_estoque_id` → `alissonerp.locais_estoque.id`
- `setor_id` → `alissonerp.setores.id`

**Triggers:**
- `trg_lancamento_avulso` (AFTER INSERT)

---

## liga_tipo_ouro

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.liga_tipo_ouro_id_seq'::regclass) |
| tipo_18k_insumo_id | integer | NO | — |
| liga_insumo_id | integer | NO | — |
| nome | character varying(100) | NO | — |
| teor_default | numeric | NO | 0.7500 |
| ativo | boolean | YES | true |

**FKs:**
- `liga_insumo_id` → `alissonerp.insumos.id`
- `tipo_18k_insumo_id` → `alissonerp.insumos.id`

**Índices:**
- `liga_tipo_ouro_tipo_18k_insumo_id_key` — CREATE UNIQUE INDEX liga_tipo_ouro_tipo_18k_insumo_id_key ON alissonerp.liga_tipo_ouro USING btre...

---

## ligacoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.ligacoes_id_seq'::regclass) |
| status | character varying(20) | NO | 'em_processo'::character varying |
| tipo_18k_insumo_id | integer | NO | — |
| tipo_18k_nome | character varying(100) | NO | — |
| liga_insumo_id | integer | NO | — |
| liga_nome | character varying(100) | NO | — |
| peso_24k | numeric | NO | — |
| teor | numeric | NO | — |
| peso_liga_calculado | numeric | NO | — |
| peso_18k_esperado | numeric | NO | — |
| foto_envio | text | YES | — |
| observacao_envio | text | YES | — |
| data_envio | timestamp with time zone | YES | now() |
| criado_por | uuid | NO | — |
| peso_18k_real | numeric | YES | — |
| perda_processo | numeric | YES | — |
| perda_percentual | numeric | YES | — |
| foto_resultado | text | YES | — |
| observacao_resultado | text | YES | — |
| data_conclusao | timestamp with time zone | YES | — |
| concluido_por | uuid | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| pureza | numeric | NO | 100.00 |

**FKs:**
- `liga_insumo_id` → `alissonerp.insumos.id`
- `tipo_18k_insumo_id` → `alissonerp.insumos.id`

**Índices:**
- `idx_ligacoes_status` — CREATE INDEX idx_ligacoes_status ON alissonerp.ligacoes USING btree (status)
- `idx_ligacoes_data` — CREATE INDEX idx_ligacoes_data ON alissonerp.ligacoes USING btree (data_envio)

---

## markup_alteracoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.markup_alteracoes_id_seq'::regclass) |
| tipo | character varying(20) | NO | — |
| faixa_id | integer | NO | — |
| faixa_nome | character varying(100) | NO | — |
| markup_anterior | numeric | NO | — |
| markup_novo | numeric | NO | — |
| produtos_afetados | integer | YES | 0 |
| variacao_media | numeric | YES | 0 |
| variacao_min | numeric | YES | 0 |
| variacao_max | numeric | YES | 0 |
| simulacao_json | jsonb | YES | — |
| status | character varying(20) | YES | 'pendente'::character varying |
| criado_por | uuid | NO | — |
| data_criacao | timestamp with time zone | YES | now() |
| aprovado_por | uuid | YES | — |
| data_aprovacao | timestamp with time zone | YES | — |
| motivo_rejeicao | text | YES | — |
| aplicado | boolean | YES | false |
| data_aplicacao | timestamp with time zone | YES | — |

**Índices:**
- `idx_markup_alteracoes_status` — CREATE INDEX idx_markup_alteracoes_status ON alissonerp.markup_alteracoes USING btree (status)
- `idx_markup_alteracoes_criado_por` — CREATE INDEX idx_markup_alteracoes_criado_por ON alissonerp.markup_alteracoes USING btree (criado...

---

## markup_pedras

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.markup_pedras_id_seq'::regclass) |
| nome | character varying(100) | NO | — |
| tamanho_min | numeric | NO | — |
| tamanho_max | numeric | NO | — |
| unidade | character varying(10) | YES | 'ct'::character varying |
| markup | numeric | NO | — |
| ativo | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |

**Índices:**
- `idx_markup_pedras_faixa` — CREATE INDEX idx_markup_pedras_faixa ON alissonerp.markup_pedras USING btree (tamanho_min, tamanh...

---

## metas_vendedoras

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.metas_vendedoras_id_seq'::regclass) |
| vendedor_id | bigint | NO | — |
| mes | integer | NO | — |
| ano | integer | NO | — |
| meta_valor | numeric | NO | — |
| meta_quantidade | integer | YES | — |
| created_by | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |
| meta_prata | numeric | YES | — |
| meta_ouro | numeric | YES | — |
| meta_diamante | numeric | YES | — |
| horario_inicio | time without time zone | YES | '09:00:00'::time without time zone |
| horas_por_dia | integer | YES | 8 |
| dias_nao_trabalhados | ARRAY | YES | '{}'::integer[] |

**Índices:**
- `metas_vendedoras_vendedor_id_mes_ano_key` — CREATE UNIQUE INDEX metas_vendedoras_vendedor_id_mes_ano_key ON alissonerp.metas_vendedoras USING...

---

## mp_point_devices

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.mp_point_devices_id_seq'::regclass) |
| device_id | text | NO | — |
| nome_legivel | text | NO | — |
| store_id | text | YES | — |
| pos_id | text | YES | — |
| operating_mode | text | YES | — |
| ativo | boolean | NO | true |
| loja | text | YES | — |
| last_sync_at | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| vendedor_id | bigint | YES | — |
| is_reserva | boolean | NO | false |

**Índices:**
- `mp_point_devices_device_id_key` — CREATE UNIQUE INDEX mp_point_devices_device_id_key ON alissonerp.mp_point_devices USING btree (de...
- `idx_mp_point_devices_ativo` — CREATE INDEX idx_mp_point_devices_ativo ON alissonerp.mp_point_devices USING btree (ativo) WHERE ...

**Triggers:**
- `trg_updated_at_mp_point_devices` (BEFORE UPDATE)

---

## notas_fiscais

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.notas_fiscais_id_seq'::regclass) |
| modelo | smallint | NO | — |
| serie | smallint | NO | — |
| numero | integer | NO | — |
| chave_44 | character varying(44) | YES | — |
| empresa_emitente_id | integer | NO | — |
| tipo_operacao | character varying(20) | NO | — |
| origem_tabela | character varying(50) | NO | — |
| origem_id | bigint | NO | — |
| cliente_contato_id | bigint | YES | — |
| natureza_operacao | character varying(60) | NO | — |
| cfop | character varying(4) | YES | — |
| valor_produtos | numeric | NO | 0 |
| valor_desconto | numeric | NO | 0 |
| valor_frete | numeric | NO | 0 |
| valor_total | numeric | NO | 0 |
| status | character varying(20) | NO | 'rascunho'::character varying |
| focus_ref | character varying(80) | YES | — |
| xml_assinado | text | YES | — |
| xml_protocolo | text | YES | — |
| pdf_danfe_url | text | YES | — |
| codigo_sefaz | character varying(10) | YES | — |
| mensagem_sefaz | text | YES | — |
| emitida_por_user_id | uuid | YES | — |
| ambiente | character varying(15) | NO | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**FKs:**
- `empresa_emitente_id` → `alissonerp.empresas_emitentes.id`

**Índices:**
- `notas_fiscais_chave_44_key` — CREATE UNIQUE INDEX notas_fiscais_chave_44_key ON alissonerp.notas_fiscais USING btree (chave_44)
- `notas_fiscais_focus_ref_key` — CREATE UNIQUE INDEX notas_fiscais_focus_ref_key ON alissonerp.notas_fiscais USING btree (focus_ref)
- `idx_notas_fiscais_empresa_modelo_num` — CREATE INDEX idx_notas_fiscais_empresa_modelo_num ON alissonerp.notas_fiscais USING btree (empres...
- `idx_notas_fiscais_status` — CREATE INDEX idx_notas_fiscais_status ON alissonerp.notas_fiscais USING btree (status)
- `idx_notas_fiscais_origem` — CREATE INDEX idx_notas_fiscais_origem ON alissonerp.notas_fiscais USING btree (origem_tabela, ori...
- `idx_notas_fiscais_created` — CREATE INDEX idx_notas_fiscais_created ON alissonerp.notas_fiscais USING btree (created_at DESC)
- `idx_notas_fiscais_cliente` — CREATE INDEX idx_notas_fiscais_cliente ON alissonerp.notas_fiscais USING btree (cliente_contato_i...
- `uq_notas_fiscais_numeracao` — CREATE UNIQUE INDEX uq_notas_fiscais_numeracao ON alissonerp.notas_fiscais USING btree (empresa_e...

---

## notas_fiscais_eventos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.notas_fiscais_eventos_id_seq'::regclass) |
| nota_fiscal_id | integer | NO | — |
| tipo | character varying(20) | NO | — |
| sequencia | smallint | NO | 1 |
| justificativa | text | YES | — |
| xml_evento | text | YES | — |
| xml_protocolo | text | YES | — |
| status | character varying(20) | NO | 'processando'::character varying |
| codigo_sefaz | character varying(10) | YES | — |
| mensagem_sefaz | text | YES | — |
| criado_por_user_id | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `nota_fiscal_id` → `alissonerp.notas_fiscais.id`

**Índices:**
- `idx_notas_eventos_nota_tipo` — CREATE INDEX idx_notas_eventos_nota_tipo ON alissonerp.notas_fiscais_eventos USING btree (nota_fi...
- `idx_notas_eventos_created` — CREATE INDEX idx_notas_eventos_created ON alissonerp.notas_fiscais_eventos USING btree (created_a...

---

## notas_fiscais_itens

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.notas_fiscais_itens_id_seq'::regclass) |
| nota_fiscal_id | integer | NO | — |
| numero_item | smallint | NO | — |
| produto_id | bigint | YES | — |
| codigo_produto | character varying(60) | YES | — |
| descricao | character varying(120) | NO | — |
| ncm | character varying(8) | YES | — |
| cest | character varying(7) | YES | — |
| cfop | character varying(4) | NO | — |
| unidade | character varying(6) | NO | — |
| ean | character varying(14) | YES | — |
| origem | smallint | YES | — |
| quantidade | numeric | NO | — |
| valor_unitario | numeric | NO | — |
| valor_total | numeric | NO | — |
| valor_desconto | numeric | NO | 0 |
| csosn | character varying(4) | YES | — |
| cst_icms | character varying(3) | YES | — |
| vbc_icms | numeric | NO | 0 |
| aliq_icms | numeric | NO | 0 |
| valor_icms | numeric | NO | 0 |
| vbc_icms_st | numeric | NO | 0 |
| valor_icms_st | numeric | NO | 0 |
| valor_aprox_tributos | numeric | NO | 0 |

**FKs:**
- `nota_fiscal_id` → `alissonerp.notas_fiscais.id`

**Índices:**
- `uq_notas_itens_numero` — CREATE UNIQUE INDEX uq_notas_itens_numero ON alissonerp.notas_fiscais_itens USING btree (nota_fis...
- `idx_notas_itens_produto` — CREATE INDEX idx_notas_itens_produto ON alissonerp.notas_fiscais_itens USING btree (produto_id) W...

---

## ordens

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.ordens_id_seq'::regclass) |
| numero_ordem | text | YES | — |
| cliente_id | bigint | YES | — |
| vendedor_id | bigint | YES | — |
| pedido_id | integer | YES | — |
| tipo_ordem | USER-DEFINED | YES | — |
| data_entrega | date | YES | — |
| peso_metal_negociado | real | YES | 0 |
| peso_metal_externo | real | YES | 0 |
| ficha_tecnica_id | integer | YES | — |
| itens_para_fabricacao | character varying(50) | YES | — |
| situacao | USER-DEFINED | YES | 'criado'::alissonerp.enum_situacao_ordem |
| status | USER-DEFINED | YES | 'aguardando'::alissonerp.enum_status_ordem |
| rota | USER-DEFINED | YES | — |
| tipo_controle | character varying(20) | YES | 'individual'::character varying |
| setor_atual | integer | YES | — |
| local_atual | integer | YES | — |
| distribuicao_id | integer | YES | — |
| protocolo_loja | boolean | YES | false |
| id_ordem_relacionada | integer | YES | — |
| id_asana | bigint | YES | — |
| directus_ordem_id | integer | YES | — |
| motivo_reprovacao | integer | YES | — |
| origem_reprovacao | text | YES | — |
| data_conclusao | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| updated_by | uuid | YES | — |
| numero_pedido | text | YES | — |
| eh_teste | boolean | YES | false |
| fotos_paths | ARRAY | YES | — |
| origem | character varying(20) | NO | 'erp'::character varying |
| foto_peca_servico | text | YES | — |
| peso_peca_servico | numeric | YES | — |
| video_observacao | text | YES | — |
| detalhes_ordem | text | YES | — |
| tipos_servico_ids | ARRAY | YES | '{}'::integer[] |
| venda_id | integer | YES | — |
| venda_item_ids | ARRAY | YES | — |
| ficha_pendente | boolean | NO | false |

**FKs:**
- `distribuicao_id` → `alissonerp.distribuicoes.id`
- `id_ordem_relacionada` → `alissonerp.ordens.id`
- `local_atual` → `alissonerp.depositos.id`
- `setor_atual` → `alissonerp.setores.id`
- `venda_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `idx_ordens_directus_unique` — CREATE UNIQUE INDEX idx_ordens_directus_unique ON alissonerp.ordens USING btree (directus_ordem_id)
- `ordens_numero_ordem_key` — CREATE UNIQUE INDEX ordens_numero_ordem_key ON alissonerp.ordens USING btree (numero_ordem)
- `idx_ordens_status` — CREATE INDEX idx_ordens_status ON alissonerp.ordens USING btree (status)
- `idx_ordens_situacao` — CREATE INDEX idx_ordens_situacao ON alissonerp.ordens USING btree (situacao)
- `idx_ordens_setor` — CREATE INDEX idx_ordens_setor ON alissonerp.ordens USING btree (setor_atual)
- `idx_ordens_local` — CREATE INDEX idx_ordens_local ON alissonerp.ordens USING btree (local_atual)
- `idx_ordens_vendedor` — CREATE INDEX idx_ordens_vendedor ON alissonerp.ordens USING btree (vendedor_id)
- `idx_ordens_cliente` — CREATE INDEX idx_ordens_cliente ON alissonerp.ordens USING btree (cliente_id)
- `idx_ordens_numero` — CREATE INDEX idx_ordens_numero ON alissonerp.ordens USING btree (numero_ordem)
- `idx_ordens_directus` — CREATE INDEX idx_ordens_directus ON alissonerp.ordens USING btree (directus_ordem_id)
- `idx_ordens_distribuicao` — CREATE INDEX idx_ordens_distribuicao ON alissonerp.ordens USING btree (distribuicao_id)
- `idx_ordens_venda_id` — CREATE INDEX idx_ordens_venda_id ON alissonerp.ordens USING btree (venda_id) WHERE (venda_id IS N...

**Triggers:**
- `trg_auto_auditoria_loja` (AFTER INSERT)
- `trg_cancelar_pcp_ordem` (AFTER UPDATE)
- `trg_ordens_proteger_pdv` (BEFORE UPDATE)
- `trg_audit_ordens` (AFTER INSERT)
- `trg_audit_ordens` (AFTER DELETE)
- `trg_audit_ordens` (AFTER UPDATE)

---

## pedras_ordens

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.pedras_ordens_id_seq'::regclass) |
| ordem_id | integer | YES | — |
| deposito_id | integer | YES | — |
| peso | real | YES | — |
| peso_pedra | real | YES | — |
| qtd_pedras | real | YES | — |
| data_hora | timestamp with time zone | YES | now() |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`
- `ordem_id` → `alissonerp.ordens.id`

---

## precificacao_config

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| content | jsonb | NO | — |
| label | text | YES | — |
| updated_at | timestamp with time zone | YES | now() |

**Índices:**
- `idx_precificacao_config_updated` — CREATE INDEX idx_precificacao_config_updated ON alissonerp.precificacao_config USING btree (updat...

---

## precificacao_historico

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | gen_random_uuid() |
| gold_price | numeric | YES | — |
| weight | numeric | YES | — |
| mkp | numeric | YES | — |
| commission_percent | numeric | YES | — |
| commission_value | numeric | YES | — |
| base_price | numeric | YES | — |
| final_price | numeric | YES | — |
| discount_percent | numeric | YES | — |
| category_name | text | YES | — |
| created_at | timestamp with time zone | YES | now() |

**Índices:**
- `idx_precificacao_historico_created` — CREATE INDEX idx_precificacao_historico_created ON alissonerp.precificacao_historico USING btree ...

---

## preparacoes_entrega

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.preparacoes_entrega_id_seq'::regclass) |
| etapas | USER-DEFINED | YES | 'pendente'::alissonerp.enum_etapas_entrega |
| ordem_id | integer | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`

---

## produto_composicao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.produto_composicao_id_seq'::regclass) |
| produto_id | bigint | NO | — |
| insumo_id | integer | NO | — |
| tipo | character varying(20) | NO | — |
| quantidade | numeric | NO | 1 |
| tamanho | numeric | YES | — |
| unidade_tamanho | character varying(10) | YES | 'ct'::character varying |
| preco_compra_usd | numeric | YES | — |
| obrigatorio | boolean | YES | true |
| observacao | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Índices:**
- `produto_composicao_produto_id_insumo_id_key` — CREATE UNIQUE INDEX produto_composicao_produto_id_insumo_id_key ON alissonerp.produto_composicao ...
- `idx_produto_composicao_produto_id` — CREATE INDEX idx_produto_composicao_produto_id ON alissonerp.produto_composicao USING btree (prod...
- `idx_produto_composicao_insumo_id` — CREATE INDEX idx_produto_composicao_insumo_id ON alissonerp.produto_composicao USING btree (insum...
- `idx_produto_composicao_tipo` — CREATE INDEX idx_produto_composicao_tipo ON alissonerp.produto_composicao USING btree (tipo)

---

## produto_curva_aplicada

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| produto_id | bigint | NO | — |
| comissao_pct | numeric | YES | — |
| max_desconto_pct | numeric | YES | — |
| markup_aplicado | numeric | YES | — |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `idx_produto_curva_aplicada_updated` — CREATE INDEX idx_produto_curva_aplicada_updated ON alissonerp.produto_curva_aplicada USING btree ...

---

## produto_imagens

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('alissonerp.produto_imagens_id_seq'::regclass) |
| produto_id | bigint | NO | — |
| bucket | text | NO | 'imagens'::text |
| bucket_path | text | NO | — |
| url_publica | text | NO | — |
| ordem | integer | NO | 0 |
| eh_capa | boolean | NO | false |
| origem | text | YES | — |
| origem_uuid | uuid | YES | — |
| origem_tabela | text | YES | — |
| filename | text | YES | — |
| mime_type | text | YES | — |
| filesize | bigint | YES | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `produto_imagens_origem_uuid_key` — CREATE UNIQUE INDEX produto_imagens_origem_uuid_key ON alissonerp.produto_imagens USING btree (or...
- `idx_produto_imagens_produto` — CREATE INDEX idx_produto_imagens_produto ON alissonerp.produto_imagens USING btree (produto_id, o...
- `uniq_produto_imagens_capa` — CREATE UNIQUE INDEX uniq_produto_imagens_capa ON alissonerp.produto_imagens USING btree (produto_...

**Triggers:**
- `trg_produto_imagens_touch` (BEFORE UPDATE)

---

## produto_pedra_extras

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| produto_id | bigint | NO | — |
| preco_compra_usd | numeric | YES | — |
| quantidade | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| peso_ct | numeric | YES | — |

---

## produto_personalizacao

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.produto_personalizacao_id_seq'::regcl... |
| produto_id | bigint | NO | — |
| tipo | character varying(20) | NO | 'nome'::character varying |
| obrigatorio | boolean | NO | true |
| min_caracteres | integer | NO | 1 |
| max_caracteres | integer | NO | — |
| caracteres_permitidos | character varying(30) | NO | 'alfa_acento_espaco'::character varying |
| label | character varying(100) | NO | 'Nome a gravar'::character varying |
| placeholder | character varying(100) | YES | — |
| exemplo | character varying(100) | YES | — |
| observacao | text | YES | — |
| ativo | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |
| preco_por_letra | numeric | YES | — |
| peso_por_letra | numeric | YES | — |

**Índices:**
- `produto_personalizacao_produto_id_key` — CREATE UNIQUE INDEX produto_personalizacao_produto_id_key ON alissonerp.produto_personalizacao US...
- `idx_produto_personalizacao_ativo` — CREATE INDEX idx_produto_personalizacao_ativo ON alissonerp.produto_personalizacao USING btree (p...

**Triggers:**
- `trg_produto_personalizacao_touch_updated` (BEFORE UPDATE)

---

## produtos_fiscais

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_produto | bigint | NO | — |
| ncm | character varying(8) | YES | — |
| cest | character varying(7) | YES | — |
| cfop_saida | character varying(4) | YES | — |
| origem | smallint | NO | 0 |
| unidade_comercial | character varying(6) | NO | 'UN'::character varying |
| ean | character varying(14) | YES | — |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `idx_produtos_fiscais_ncm` — CREATE INDEX idx_produtos_fiscais_ncm ON alissonerp.produtos_fiscais USING btree (ncm)

---

## purificacoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.purificacoes_id_seq'::regclass) |
| status | character varying(20) | NO | 'em_processo'::character varying |
| itens | jsonb | NO | '[]'::jsonb |
| peso_total_enviado | numeric | NO | — |
| teor_medio | numeric | NO | — |
| peso_esperado_24k | numeric | NO | — |
| foto_envio | text | YES | — |
| observacao_envio | text | YES | — |
| data_envio | timestamp with time zone | YES | now() |
| criado_por | uuid | NO | — |
| peso_retornado_24k | numeric | YES | — |
| perda_processo | numeric | YES | — |
| perda_percentual | numeric | YES | — |
| foto_retorno | text | YES | — |
| observacao_retorno | text | YES | — |
| data_retorno | timestamp with time zone | YES | — |
| concluido_por | uuid | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Índices:**
- `idx_purificacoes_status` — CREATE INDEX idx_purificacoes_status ON alissonerp.purificacoes USING btree (status)
- `idx_purificacoes_data` — CREATE INDEX idx_purificacoes_data ON alissonerp.purificacoes USING btree (data_envio)

---

## quebra_operador

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.quebra_operador_id_seq'::regclass) |
| ordem_id | integer | YES | — |
| pcp_id | integer | YES | — |
| deposito_id | integer | NO | — |
| setor_id | integer | YES | — |
| insumo_id | integer | NO | 1 |
| numero_ordem | character varying(20) | YES | — |
| deposito_nome | character varying(100) | YES | — |
| setor_nome | character varying(100) | YES | — |
| insumo_nome | character varying(100) | YES | 'Ouro 18k Amarelo'::character varying |
| tipo | character varying(30) | NO | — |
| ouro_recebido | numeric | NO | — |
| ouro_entregue | numeric | NO | — |
| quebra | numeric | NO | — |
| percentual_quebra | numeric | YES | — |
| data_registro | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| distribuicao_id | integer | YES | — |

**Índices:**
- `idx_quebra_op_deposito_periodo` — CREATE INDEX idx_quebra_op_deposito_periodo ON alissonerp.quebra_operador USING btree (deposito_i...
- `idx_quebra_op_setor_periodo` — CREATE INDEX idx_quebra_op_setor_periodo ON alissonerp.quebra_operador USING btree (setor_id, dat...
- `idx_quebra_op_ordem` — CREATE INDEX idx_quebra_op_ordem ON alissonerp.quebra_operador USING btree (ordem_id)
- `idx_quebra_op_periodo` — CREATE INDEX idx_quebra_op_periodo ON alissonerp.quebra_operador USING btree (data_registro)
- `idx_quebra_op_tipo` — CREATE INDEX idx_quebra_op_tipo ON alissonerp.quebra_operador USING btree (tipo, data_registro)

---

## reembolsos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.reembolsos_id_seq'::regclass) |
| devolucao_id | integer | NO | — |
| metodo | character varying(30) | NO | — |
| valor | numeric | NO | — |
| mp_payment_id | character varying(100) | YES | — |
| mp_refund_id | character varying(100) | YES | — |
| mp_status | character varying(30) | YES | — |
| mp_erro | text | YES | — |
| conta_pagar_id | integer | YES | — |
| status | character varying(20) | NO | 'pendente'::character varying |
| processado_em | timestamp with time zone | YES | — |
| criado_por | uuid | NO | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `conta_pagar_id` → `alissonerp.contas_pagar.id`
- `devolucao_id` → `alissonerp.devolucoes_venda.id`

**Índices:**
- `idx_reembolsos_devolucao` — CREATE INDEX idx_reembolsos_devolucao ON alissonerp.reembolsos USING btree (devolucao_id)
- `idx_reembolsos_status` — CREATE INDEX idx_reembolsos_status ON alissonerp.reembolsos USING btree (status)

---

## regras_fiscais

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.regras_fiscais_id_seq'::regclass) |
| empresa_emitente_id | integer | YES | — |
| ncm | character varying(8) | NO | — |
| uf_destino | character(2) | YES | — |
| cfop_saida | character varying(4) | NO | — |
| cfop_devolucao | character varying(4) | YES | — |
| csosn | character varying(4) | YES | — |
| cst_icms | character varying(3) | YES | — |
| origem | smallint | NO | 0 |
| aliq_ibpt_federal | numeric | NO | 0 |
| aliq_ibpt_estadual | numeric | NO | 0 |
| aliq_ibpt_municipal | numeric | NO | 0 |
| mva_st | numeric | YES | — |
| aliq_icms_st | numeric | YES | — |
| ativo | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**FKs:**
- `empresa_emitente_id` → `alissonerp.empresas_emitentes.id`

**Índices:**
- `uq_regras_fiscais_full` — CREATE UNIQUE INDEX uq_regras_fiscais_full ON alissonerp.regras_fiscais USING btree (empresa_emit...
- `uq_regras_fiscais_sem_uf` — CREATE UNIQUE INDEX uq_regras_fiscais_sem_uf ON alissonerp.regras_fiscais USING btree (empresa_em...
- `uq_regras_fiscais_sem_empresa` — CREATE UNIQUE INDEX uq_regras_fiscais_sem_empresa ON alissonerp.regras_fiscais USING btree (ncm, ...
- `uq_regras_fiscais_geral` — CREATE UNIQUE INDEX uq_regras_fiscais_geral ON alissonerp.regras_fiscais USING btree (ncm) WHERE ...
- `idx_regras_fiscais_ncm` — CREATE INDEX idx_regras_fiscais_ncm ON alissonerp.regras_fiscais USING btree (ncm)
- `idx_regras_fiscais_ativo` — CREATE INDEX idx_regras_fiscais_ativo ON alissonerp.regras_fiscais USING btree (ativo) WHERE (ati...

---

## role_permissoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.role_permissoes_id_seq'::regclass) |
| role | character varying(50) | NO | — |
| modulo | character varying(50) | NO | — |
| pode_ler | boolean | NO | false |
| pode_escrever | boolean | NO | false |
| criado_em | timestamp with time zone | NO | now() |
| atualizado_em | timestamp with time zone | NO | now() |
| ativo | boolean | NO | true |

**Índices:**
- `role_permissoes_role_modulo_key` — CREATE UNIQUE INDEX role_permissoes_role_modulo_key ON alissonerp.role_permissoes USING btree (ro...
- `idx_role_permissoes_role` — CREATE INDEX idx_role_permissoes_role ON alissonerp.role_permissoes USING btree (role)
- `idx_role_permissoes_modulo` — CREATE INDEX idx_role_permissoes_modulo ON alissonerp.role_permissoes USING btree (modulo)

---

## roles

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| nome | character varying(50) | NO | — |
| descricao | character varying(200) | YES | — |
| ativo | boolean | NO | true |
| criado_em | timestamp with time zone | NO | now() |

---

## saldo_credito_loja

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.saldo_credito_loja_id_seq'::regclass) |
| tipo | character varying(20) | NO | — |
| valor | numeric | NO | — |
| saldo_antes | numeric | NO | — |
| saldo_depois | numeric | NO | — |
| venda_id | integer | YES | — |
| pagamento_id | integer | YES | — |
| descricao | text | YES | — |
| usuario_id | uuid | YES | — |
| created_at | timestamp with time zone | NO | now() |

**FKs:**
- `pagamento_id` → `alissonerp.pagamentos_venda.id`
- `venda_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `idx_saldo_credito_venda` — CREATE INDEX idx_saldo_credito_venda ON alissonerp.saldo_credito_loja USING btree (venda_id) WHER...
- `idx_saldo_credito_pagamento` — CREATE INDEX idx_saldo_credito_pagamento ON alissonerp.saldo_credito_loja USING btree (pagamento_...
- `idx_saldo_credito_created` — CREATE INDEX idx_saldo_credito_created ON alissonerp.saldo_credito_loja USING btree (created_at D...

---

## servicos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.servicos_id_seq'::regclass) |
| ordem_id | integer | NO | — |
| pcp_id | integer | YES | — |
| operador_id | integer | YES | — |
| tentativa | integer | NO | 1 |
| peso_entrada | numeric | NO | — |
| peso_saida | numeric | YES | — |
| usou_solda | boolean | YES | — |
| peso_fio_antes | numeric | YES | — |
| peso_fio_depois | numeric | YES | — |
| consumo_solda | numeric | YES | — |
| colocou_pedra | boolean | YES | false |
| pedras_colocadas | jsonb | YES | '[]'::jsonb |
| status | character varying(20) | NO | 'aguardando'::character varying |
| foto_recebimento | text | YES | — |
| foto_conclusao | text | YES | — |
| foto_fio_solda | text | YES | — |
| recebido_em | timestamp with time zone | YES | — |
| concluido_em | timestamp with time zone | YES | — |
| concluido_por | uuid | YES | — |
| created_at | timestamp with time zone | YES | now() |
| motivo_reprovacao | text | YES | — |
| foto_reprovacao | text | YES | — |
| reprovado_em | timestamp with time zone | YES | — |
| reprovado_por | uuid | YES | — |
| transferencia_service_id | integer | YES | — |

**FKs:**
- `operador_id` → `alissonerp.depositos.id`
- `ordem_id` → `alissonerp.ordens.id`
- `pcp_id` → `alissonerp.pcp.id`
- `transferencia_service_id` → `alissonerp.transferencias_ordem.id`

**Índices:**
- `idx_servicos_ordem` — CREATE INDEX idx_servicos_ordem ON alissonerp.servicos USING btree (ordem_id)
- `idx_servicos_operador` — CREATE INDEX idx_servicos_operador ON alissonerp.servicos USING btree (operador_id)
- `idx_servicos_status` — CREATE INDEX idx_servicos_status ON alissonerp.servicos USING btree (status)
- `idx_servicos_pcp` — CREATE INDEX idx_servicos_pcp ON alissonerp.servicos USING btree (pcp_id)

---

## setores

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.setores_id_seq'::regclass) |
| nome | character varying(100) | NO | — |
| ativo | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| deposito_id | integer | YES | — |

**FKs:**
- `deposito_id` → `alissonerp.depositos.id`

---

## site_config

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | 1 |
| plataforma | character varying(40) | NO | 'woocommerce'::character varying |
| site_url | character varying(255) | YES | — |
| consumer_key | character varying(255) | YES | — |
| consumer_secret | character varying(255) | YES | — |
| ativo | boolean | NO | false |
| sincronizar_estoque | boolean | NO | true |
| sincronizar_preco | boolean | NO | true |
| categoria_padrao_wc | integer | YES | — |
| ultima_sync_at | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Triggers:**
- `trg_site_config_updated_at` (BEFORE UPDATE)

---

## site_produtos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.site_produtos_id_seq'::regclass) |
| produto_id | integer | NO | — |
| sku | character varying(120) | NO | — |
| wc_product_id | integer | YES | — |
| wc_permalink | character varying(500) | YES | — |
| publicado_no_site | boolean | NO | false |
| status_sync | character varying(20) | NO | 'pendente'::character varying |
| hash_enviado | character varying(64) | YES | — |
| ultimo_erro | text | YES | — |
| ultima_tentativa_at | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `site_produtos_produto_id_unique` — CREATE UNIQUE INDEX site_produtos_produto_id_unique ON alissonerp.site_produtos USING btree (prod...
- `idx_site_produtos_status` — CREATE INDEX idx_site_produtos_status ON alissonerp.site_produtos USING btree (status_sync) WHERE...
- `idx_site_produtos_sku` — CREATE INDEX idx_site_produtos_sku ON alissonerp.site_produtos USING btree (sku)

**Triggers:**
- `trg_site_produtos_updated_at` (BEFORE UPDATE)

---

## solicitacoes_desconto

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.solicitacoes_desconto_id_seq'::regclass) |
| venda_id | integer | YES | — |
| item_id | integer | YES | — |
| produto_nome | text | NO | — |
| preco_lista | numeric | NO | — |
| pct_desconto_solicitado | numeric | NO | — |
| preco_solicitado | numeric | NO | — |
| status | text | NO | 'pendente'::text |
| solicitado_por_id | uuid | YES | — |
| solicitado_por_nome | text | YES | — |
| autorizado_por_id | uuid | YES | — |
| autorizado_por_nome | text | YES | — |
| observacao | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**FKs:**
- `item_id` → `alissonerp.itens_venda_erp.id`
- `venda_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `solicitacoes_desconto_status_idx` — CREATE INDEX solicitacoes_desconto_status_idx ON alissonerp.solicitacoes_desconto USING btree (st...
- `solicitacoes_desconto_venda_id_idx` — CREATE INDEX solicitacoes_desconto_venda_id_idx ON alissonerp.solicitacoes_desconto USING btree (...
- `solicitacoes_desconto_item_id_idx` — CREATE INDEX solicitacoes_desconto_item_id_idx ON alissonerp.solicitacoes_desconto USING btree (i...

---

## teores_ouro

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.teores_ouro_id_seq'::regclass) |
| insumo_id | integer | NO | — |
| nome | character varying(100) | NO | — |
| teor | numeric | NO | — |
| ativo | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**FKs:**
- `insumo_id` → `alissonerp.insumos.id`

**Índices:**
- `teores_ouro_insumo_id_key` — CREATE UNIQUE INDEX teores_ouro_insumo_id_key ON alissonerp.teores_ouro USING btree (insumo_id)

---

## tiny_sync_produtos

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| produto_id | bigint | NO | — |
| operacao | text | NO | — |
| status | text | NO | 'pendente'::text |
| tentativas | integer | NO | 0 |
| erro | text | YES | — |
| created_at | timestamp with time zone | NO | now() |
| updated_at | timestamp with time zone | NO | now() |

**Índices:**
- `idx_tiny_sync_produtos_status` — CREATE INDEX idx_tiny_sync_produtos_status ON alissonerp.tiny_sync_produtos USING btree (status, ...

---

## tipos_servico

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.tipos_servico_id_seq'::regclass) |
| nome | text | NO | — |
| ativo | boolean | NO | true |
| created_at | timestamp with time zone | NO | now() |

---

## user_views

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.user_views_id_seq'::regclass) |
| user_auth_id | uuid | NO | — |
| scope | text | NO | — |
| nome | text | NO | — |
| filtros | jsonb | NO | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Índices:**
- `user_views_user_auth_id_scope_nome_key` — CREATE UNIQUE INDEX user_views_user_auth_id_scope_nome_key ON alissonerp.user_views USING btree (...
- `idx_user_views_user_scope` — CREATE INDEX idx_user_views_user_scope ON alissonerp.user_views USING btree (user_auth_id, scope)

**Triggers:**
- `trg_user_views_touch` (BEFORE UPDATE)

---

## uso_maquina_reserva

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.uso_maquina_reserva_id_seq'::regclass) |
| venda_id | bigint | YES | — |
| vendedor_id | bigint | NO | — |
| device_id_reserva | text | NO | — |
| justificativa | text | NO | — |
| created_at | timestamp with time zone | NO | now() |

---

## vendedores_fiscais

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id_vendedor | bigint | NO | — |
| empresa_emitente_id | integer | YES | — |
| updated_at | timestamp with time zone | NO | now() |

**FKs:**
- `empresa_emitente_id` → `alissonerp.empresas_emitentes.id`

**Índices:**
- `idx_vendedores_fiscais_empresa` — CREATE INDEX idx_vendedores_fiscais_empresa ON alissonerp.vendedores_fiscais USING btree (empresa...

---

