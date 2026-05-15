# `alissonerp` — Tabelas

> 139 tabelas | gerado 2026-04-29

## Índice

- [`_backup_fn_processar_fechamento_dist_pre_guard_20260429`](#_backup_fn_processar_fechamento_dist_pre_guard_20260429)
- [`_backup_servicos_20260331`](#_backup_servicos_20260331)
- [`_backup_tedmd_20260313`](#_backup_tedmd_20260313)
- [`_backup_transferservice_20260331`](#_backup_transferservice_20260331)
- [`api_chaves`](#api_chaves) — Chaves de API para integração com o site externo
- [`api_log`](#api_log) — Log de requisições da API pública — retidos 90 dias
- [`apontamentos_distribuicao`](#apontamentos_distribuicao)
- [`apontamentos_pcp`](#apontamentos_pcp)
- [`apontamentos_pote`](#apontamentos_pote)
- [`apontamentos_servico`](#apontamentos_servico)
- [`aprovacoes_consultora`](#aprovacoes_consultora)
- [`aprovacoes_tarefa`](#aprovacoes_tarefa)
- [`audit_log`](#audit_log)
- [`auditorias`](#auditorias) — Auditoria de qualidade pós-PCP. Criada automaticamente ao concluir saída.
- [`automacoes_execucoes`](#automacoes_execucoes)
- [`automacoes_tarefa`](#automacoes_tarefa)
- [`backup_pre_limpeza_20260315`](#backup_pre_limpeza_20260315)
- [`categorias_insumo`](#categorias_insumo)
- [`comentarios_ordem`](#comentarios_ordem)
- [`comentarios_tarefa`](#comentarios_tarefa)
- [`compras`](#compras)
- [`comunicacoes_crediario`](#comunicacoes_crediario)
- [`config_orcamento`](#config_orcamento)
- [`configuracoes_secrets`](#configuracoes_secrets)
- [`configuracoes_sistema`](#configuracoes_sistema)
- [`contas_pagar`](#contas_pagar)
- [`contas_receber`](#contas_receber)
- [`contatos_fiscais`](#contatos_fiscais) — Campos fiscais de cliente/fornecedor. PK = public.contatos.id_contato (FK logica).
- [`curva_categorias`](#curva_categorias) — Faixas de peso da curva de precificacao. Interpolacao linear entre pontos.
- [`curva_config`](#curva_config) — Configuracao global da curva de precificacao (singleton id=1)
- [`dashboard_configs`](#dashboard_configs)
- [`depositos`](#depositos)
- [`devolucoes_itens`](#devolucoes_itens)
- [`devolucoes_venda`](#devolucoes_venda)
- [`distribuicao_ordens`](#distribuicao_ordens)
- [`distribuicao_saida_pedras`](#distribuicao_saida_pedras)
- [`distribuicoes`](#distribuicoes)
- [`editor_ia_historico`](#editor_ia_historico) — Historico global do Editor IA com deduplicacao por hash (input + params).
- [`empresas_emitentes`](#empresas_emitentes) — Emitentes fiscais (fabrica + lojas). Multi-CNPJ.
- [`epc_serial`](#epc_serial) — Controle atomico do serial sequencial de EPC por ano. Uma linha por ano.
- [`erp_produtos`](#erp_produtos) — Produtos ERP com relação pai/variação. Referencia public.produtos sem alterá-lo.
- [`estoque_comercial_config`](#estoque_comercial_config)
- [`estornos_distribuicao`](#estornos_distribuicao) — Registro imutável de cada estorno — quem, quando, por quê, snapshot JSONB do que foi revertido
- [`faixas_comissao`](#faixas_comissao)
- [`fechamentos_distribuicao`](#fechamentos_distribuicao)
- [`fechamentos_fabrica`](#fechamentos_fabrica)
- [`fichas_tecnicas`](#fichas_tecnicas)
- [`fichas_tecnicas_produto`](#fichas_tecnicas_produto)
- [`fila_sync_externo`](#fila_sync_externo)
- [`fin_caixa_baixas`](#fin_caixa_baixas)
- [`fin_conciliacoes`](#fin_conciliacoes)
- [`fin_extratos_bancarios`](#fin_extratos_bancarios)
- [`fin_gateways`](#fin_gateways)
- [`fin_lancamentos_bancarios`](#fin_lancamentos_bancarios)
- [`fornecedores`](#fornecedores) — Cadastro mestre opcional de fornecedores. Usado para autocomplete em produtos.
- [`fretes_bairro`](#fretes_bairro)
- [`gateways_pagamento`](#gateways_pagamento)
- [`insumos`](#insumos)
- [`inter_sync_log`](#inter_sync_log)
- [`inventarios_comercial`](#inventarios_comercial)
- [`itens_compra`](#itens_compra)
- [`itens_distribuicao`](#itens_distribuicao)
- [`itens_inventario_comercial`](#itens_inventario_comercial)
- [`itens_ordem`](#itens_ordem)
- [`itens_ordem_insumos`](#itens_ordem_insumos)
- [`itens_ordem_produtos`](#itens_ordem_produtos)
- [`itens_venda_erp`](#itens_venda_erp)
- [`joias_leituras`](#joias_leituras) — Timeline de eventos RFID: cadastro, reimpressao, inventario, movimentacao, cancelamento. EPC nao tem FK — permite manter
- [`joias_rfid`](#joias_rfid) — 1 linha = 1 joia fisica com EPC unico. Dados do produto desnormalizados no momento do cadastro (snapshot).
- [`lancamentos_avulso`](#lancamentos_avulso)
- [`liga_tipo_ouro`](#liga_tipo_ouro) — Mapeia qual liga usar para cada tipo de Ouro 18k. teor_default = teor alvo da fundição (ex: 0.75 para 18k).
- [`ligacoes`](#ligacoes) — Ligação: transforma Ouro 24k fino em Ouro 18k adicionando liga metálica italiana.
- [`locais_estoque`](#locais_estoque)
- [`markup_alteracoes`](#markup_alteracoes) — Fila de aprovação de mudanças de markup (ouro ou pedra). Criado quando usuário simula e envia pra aprovação. Aprovação r
- [`markup_pedras`](#markup_pedras) — Faixas de markup por tamanho de pedra.
- [`metas_vendedoras`](#metas_vendedoras)
- [`movimentacoes_estoque`](#movimentacoes_estoque)
- [`movimentacoes_estoque_comercial`](#movimentacoes_estoque_comercial)
- [`mp_point_devices`](#mp_point_devices)
- [`notas_fiscais`](#notas_fiscais) — Notas fiscais (55 + 65). Polimorfica via (origem_tabela, origem_id).
- [`notas_fiscais_eventos`](#notas_fiscais_eventos) — Eventos pos-emissao: cancelamento, CC-e, inutilizacao, manifestacao.
- [`notas_fiscais_itens`](#notas_fiscais_itens) — Snapshot fiscal por item da nota (imutavel apos autorizacao).
- [`notificacoes`](#notificacoes)
- [`orcamento_fichas_tecnicas`](#orcamento_fichas_tecnicas)
- [`orcamentos`](#orcamentos)
- [`ordem_comentario_mencoes`](#ordem_comentario_mencoes)
- [`ordem_comentarios`](#ordem_comentarios)
- [`ordens`](#ordens) — Tabela central. FKs cross-schema: vendedor/cliente→public, setor→alissonerp. directus_ordem_id cruza dados durante migra
- [`outros_insumos_distribuicao`](#outros_insumos_distribuicao)
- [`outros_insumos_pcp`](#outros_insumos_pcp)
- [`pagamentos_venda`](#pagamentos_venda)
- [`parametros`](#parametros)
- [`parametros_sistema`](#parametros_sistema)
- [`pcp`](#pcp)
- [`pedras_ordens`](#pedras_ordens)
- [`permissoes_usuario`](#permissoes_usuario)
- [`precificacao_config`](#precificacao_config) — Snapshots de configuração do app de precificação (categorias, MKP, comissões). Histórico eterno.
- [`precificacao_historico`](#precificacao_historico) — Log de cada cálculo feito no app de precificação.
- [`preparacoes_entrega`](#preparacoes_entrega)
- [`produto_composicao`](#produto_composicao) — BOM (Bill of Materials) — composição do produto em insumos.
- [`produto_curva_aplicada`](#produto_curva_aplicada) — Comissao, max desconto e markup aplicados em cada produto pela curva dinamica. Populada por /api/precificacao/curva/apli
- [`produto_imagens`](#produto_imagens) — Galeria de imagens por produto. Migrado do Directus (legado mantido como backup).
- [`produto_pedra_extras`](#produto_pedra_extras) — Extensão de public.produtos para pedras-produto: custo USD e quantidade em estoque. preco_tiny (em public.produtos) = pr
- [`produto_personalizacao`](#produto_personalizacao) — Config de personalizacao por produto (ex: nome gravado com max N letras). 1 linha = 1 produto. Validacao aplicada no wiz
- [`produto_tipo_item`](#produto_tipo_item)
- [`produtos_fiscais`](#produtos_fiscais) — Campos fiscais de produto. PK = public.produtos.id_produto (FK logica).
- [`protocolo_fotos`](#protocolo_fotos)
- [`protocolo_ordens`](#protocolo_ordens)
- [`protocolos`](#protocolos)
- [`purificacoes`](#purificacoes)
- [`quebra_operador`](#quebra_operador) — Quebra de ouro por operador. Registrada em transferências operador→operador e saídas PCP. Pote (dep ID=1) NUNCA registra
- [`reembolsos`](#reembolsos)
- [`regras_fiscais`](#regras_fiscais) — Matriz fiscal: por NCM x UF destino, define CFOP/CSOSN/CST/aliquotas
- [`reservas_estoque_comercial`](#reservas_estoque_comercial)
- [`role_permissoes`](#role_permissoes)
- [`roles`](#roles)
- [`saidas_distribuicao`](#saidas_distribuicao)
- [`saidas_ordem`](#saidas_ordem)
- [`saldo_credito_loja`](#saldo_credito_loja)
- [`servicos`](#servicos) — Módulo Service v2.13.0: rastreio de serviços e garantias com controle de solda e pedras
- [`setores`](#setores)
- [`site_config`](#site_config) — Configuração global da loja WooCommerce/WordPress (1 linha: id=1).
- [`site_produtos`](#site_produtos) — Mapping produto_id ↔ wc_product_id com status de sincronização.
- [`solicitacoes_desconto`](#solicitacoes_desconto)
- [`tarefas`](#tarefas)
- [`teores_ouro`](#teores_ouro)
- [`tiny_sync_produtos`](#tiny_sync_produtos)
- [`tipos_apontamento`](#tipos_apontamento)
- [`tipos_servico`](#tipos_servico)
- [`transferencias_estoque_comercial`](#transferencias_estoque_comercial)
- [`transferencias_ordem`](#transferencias_ordem)
- [`user_views`](#user_views) — Filtros nomeados por usuario/modulo (Inteligencia de Estoque e futuros dashboards)
- [`uso_maquina_reserva`](#uso_maquina_reserva)
- [`usuarios`](#usuarios)
- [`vale_troca`](#vale_troca)
- [`vendas_erp`](#vendas_erp)
- [`vendedores_fiscais`](#vendedores_fiscais) — Vinculo fiscal vendedor x empresa emitente. PK = public.vendedores.id_vendedor (FK logica).
- [`webhook_config`](#webhook_config) — Configuracao dos 9 webhooks n8n. URLs e status.
- [`webhook_log`](#webhook_log) — Log de todos os disparos de webhooks.

---

## _backup_fn_processar_fechamento_dist_pre_guard_20260429

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `info` | text | ✓ | — | — |

_Sem referência identificada no código._

---

## _backup_servicos_20260331

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | ✓ | — | — |
| 2 | `ordem_id` | integer | ✓ | — | — |
| 3 | `pcp_id` | integer | ✓ | — | — |
| 4 | `operador_id` | integer | ✓ | — | — |
| 5 | `tentativa` | integer | ✓ | — | — |
| 6 | `peso_entrada` | numeric(10,2) | ✓ | — | — |
| 7 | `peso_saida` | numeric(10,2) | ✓ | — | — |
| 8 | `usou_solda` | boolean | ✓ | — | — |
| 9 | `peso_fio_antes` | numeric(10,2) | ✓ | — | — |
| 10 | `peso_fio_depois` | numeric(10,2) | ✓ | — | — |
| 11 | `consumo_solda` | numeric(10,2) | ✓ | — | — |
| 12 | `colocou_pedra` | boolean | ✓ | — | — |
| 13 | `pedras_colocadas` | jsonb | ✓ | — | — |
| 14 | `status` | character varying(20) | ✓ | — | — |
| 15 | `foto_recebimento` | text | ✓ | — | — |
| 16 | `foto_conclusao` | text | ✓ | — | — |
| 17 | `foto_fio_solda` | text | ✓ | — | — |
| 18 | `recebido_em` | timestamp with time zone | ✓ | — | — |
| 19 | `concluido_em` | timestamp with time zone | ✓ | — | — |
| 20 | `concluido_por` | uuid | ✓ | — | — |
| 21 | `created_at` | timestamp with time zone | ✓ | — | — |
| 22 | `motivo_reprovacao` | text | ✓ | — | — |
| 23 | `foto_reprovacao` | text | ✓ | — | — |
| 24 | `reprovado_em` | timestamp with time zone | ✓ | — | — |
| 25 | `reprovado_por` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## _backup_tedmd_20260313

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | ✓ | — | — |
| 2 | `entrada` | float4 | ✓ | — | — |
| 3 | `saida` | float4 | ✓ | — | — |
| 4 | `insumo_id` | integer | ✓ | — | — |
| 5 | `deposito_id` | integer | ✓ | — | — |
| 6 | `setor_id` | integer | ✓ | — | — |
| 7 | `ordem_id` | integer | ✓ | — | — |
| 8 | `marcador` | enum_marcador_estoque | ✓ | — | — |
| 9 | `obs` | text | ✓ | — | — |
| 10 | `data_hora` | timestamp with time zone | ✓ | — | — |
| 11 | `valor_total` | numeric(12,2) | ✓ | — | — |
| 12 | `preco_compra` | numeric(12,2) | ✓ | — | — |
| 13 | `created_at` | timestamp with time zone | ✓ | — | — |
| 14 | `created_by` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## _backup_transferservice_20260331

**Aprox. linhas:** 70

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | ✓ | — | — |
| 2 | `pcp_id` | integer | ✓ | — | — |
| 3 | `ordem_id` | integer | ✓ | — | — |
| 4 | `setor_id` | integer | ✓ | — | — |
| 5 | `deposito_id` | integer | ✓ | — | — |
| 6 | `obs` | text | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | — | — |
| 8 | `updated_at` | timestamp with time zone | ✓ | — | — |
| 9 | `created_by` | uuid | ✓ | — | — |

_Sem referência identificada no código._

---

## api_chaves

> Chaves de API para integração com o site externo

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.api_chaves_id_seq'::regclass)` | — |
| 2 | `nome` | text | — | — | — |
| 3 | `chave_hash` | text | — | — | SHA-256(key) — a chave real nunca é armazenada |
| 4 | `chave_preview` | text | — | — | sk_live_XXXXXXXX... mostrado na UI para identificação |
| 5 | `ativa` | boolean | — | `true` | — |
| 6 | `rate_limit_por_minuto` | integer | — | `60` | — |
| 7 | `total_requisicoes` | bigint | — | `0` | — |
| 8 | `ultimo_uso` | timestamp with time zone | ✓ | — | — |
| 9 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `api_chaves_chave_hash_key` — (`chave_hash`)
- **PRIMARY KEY** `api_chaves_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.api_log.chave_id` (constraint `api_log_chave_id_fkey`)

### Índices

- `api_chaves_chave_hash_key` — `CREATE UNIQUE INDEX api_chaves_chave_hash_key ON alissonerp.api_chaves USING btree (chave_hash)`

_Sem referência identificada no código._

---

## api_log

> Log de requisições da API pública — retidos 90 dias

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('alissonerp.api_log_id_seq'::regclass)` | — |
| 2 | `chave_id` | integer | ✓ | — | — |
| 3 | `endpoint` | text | — | — | — |
| 4 | `metodo` | text | — | `'GET'::text` | — |
| 5 | `status_code` | integer | ✓ | — | — |
| 6 | `ip` | text | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `api_log_pkey` — (`id`)

### Foreign Keys (saída)

- `chave_id` → `alissonerp.api_chaves.id` (UPDATE NO ACTION, DELETE SET NULL)

### Índices

- `idx_api_log_chave_id` — `CREATE INDEX idx_api_log_chave_id ON alissonerp.api_log USING btree (chave_id)`
- `idx_api_log_created_at` — `CREATE INDEX idx_api_log_created_at ON alissonerp.api_log USING btree (created_at DESC)`

_Sem referência identificada no código._

---

## apontamentos_distribuicao

**Aprox. linhas:** 100

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.apontamentos_distribuicao_id_seq'::regclass)` | — |
| 2 | `tipo_apontamento_id` | integer | ✓ | — | — |
| 3 | `deposito_id` | integer | ✓ | — | — |
| 4 | `setor_id` | integer | ✓ | — | — |
| 5 | `insumo_id` | integer | ✓ | — | — |
| 6 | `distribuicao_id` | integer | ✓ | — | — |
| 7 | `qtd` | float4 | — | — | — |
| 8 | `obs` | text | ✓ | — | — |
| 9 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 10 | `created_by` | uuid | ✓ | — | — |
| 11 | `foto_balanca` | text | ✓ | — | — |
| 12 | `peso_ct` | numeric(10,4) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `apontamentos_distribuicao_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `distribuicao_id` → `alissonerp.distribuicoes.id` (UPDATE NO ACTION, DELETE SET NULL)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `setor_id` → `alissonerp.setores.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `tipo_apontamento_id` → `alissonerp.tipos_apontamento.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Triggers

- `trg_after_insert_apontamento_dist` — AFTER INSERT → `alissonerp.fn_processar_apontamento_dist` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `admin_full_apt_dist` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`

**Uso no código:**
- `alissonerp.apontamentos_distribuicao` — 6 ocorrência(s)
  - `src/app/api/distribuicao/apontamentos/route.ts:74`
  - `src/app/api/distribuicao/[id]/estorno-lote/route.ts:211`
  - `src/app/api/pcp/[id]/historico/route.ts:42`
  - `scripts/validar_golive.mjs:45`
  - `supabase/migrations/049_apontamentos_distribuicao_foto.sql:2`

---

## apontamentos_pcp

**Aprox. linhas:** 8

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.apontamentos_pcp_id_seq'::regclass)` | — |
| 2 | `tipo_apontamento_id` | integer | ✓ | — | — |
| 3 | `deposito_id` | integer | ✓ | — | — |
| 4 | `setor_id` | integer | ✓ | — | — |
| 5 | `insumo_id` | integer | ✓ | — | — |
| 6 | `pcp_id` | integer | ✓ | — | — |
| 7 | `qtd` | float4 | — | — | — |
| 8 | `marcador` | jsonb | ✓ | — | — |
| 9 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 10 | `created_by` | uuid | ✓ | — | — |
| 11 | `foto_balanca` | text | ✓ | — | — |
| 12 | `peso_ct` | numeric(10,4) | ✓ | — | — |
| 13 | `peso_g_pedra` | numeric(10,4) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `apontamentos_pcp_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `pcp_id` → `alissonerp.pcp.id` (UPDATE NO ACTION, DELETE SET NULL)
- `setor_id` → `alissonerp.setores.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `tipo_apontamento_id` → `alissonerp.tipos_apontamento.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_apt_pcp_pcp` — `CREATE INDEX idx_apt_pcp_pcp ON alissonerp.apontamentos_pcp USING btree (pcp_id)`

### Triggers

- `trg_after_insert_apontamento_pcp` — AFTER INSERT → `alissonerp.fn_processar_apontamento_pcp` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `admin_full_apt_pcp` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - `ourives_apontamentos` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'ourives'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'ourives'::text)`

**Uso no código:**
- `alissonerp.apontamentos_pcp` — 17 ocorrência(s)
  - `src/app/api/pcp/apontamentos/route.ts:220`
  - `src/app/api/pcp/saida/route.ts:10`
  - `src/app/api/pcp/saida/route.ts:195`
  - `src/app/api/pcp/[id]/insumos-transferencia/route.ts:14`
  - `src/app/api/pcp/[id]/insumos-transferencia/route.ts:17`

---

## apontamentos_pote

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.apontamentos_pote_id_seq'::regclass)` | — |
| 2 | `pcp_id` | integer | ✓ | — | — |
| 3 | `peso_bruto` | float4 | ✓ | — | — |
| 4 | `peso_liquido` | float4 | ✓ | — | — |
| 5 | `foto_balanca` | uuid | ✓ | — | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `created_by` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `apontamentos_pote_pkey` — (`id`)

### Foreign Keys (saída)

- `pcp_id` → `alissonerp.pcp.id` (UPDATE NO ACTION, DELETE SET NULL)

_Sem referência identificada no código._

---

## apontamentos_servico

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('alissonerp.apontamentos_servico_id_seq'::regclass)` | — |
| 2 | `servico_id` | integer | — | — | — |
| 3 | `operador_id` | integer | ✓ | — | — |
| 4 | `operador_nome` | text | ✓ | — | — |
| 5 | `insumo_id` | integer | — | — | — |
| 6 | `insumo_nome` | text | ✓ | — | — |
| 7 | `quantidade` | numeric(10,4) | — | — | — |
| 8 | `movimentacao_id` | bigint | ✓ | — | — |
| 9 | `foto_url` | text | ✓ | — | — |
| 10 | `obs` | text | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `apontamentos_servico_pkey` — (`id`)

### Foreign Keys (saída)

- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `movimentacao_id` → `alissonerp.movimentacoes_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `operador_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `servico_id` → `alissonerp.servicos.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_apontamentos_servico_operador_id` — `CREATE INDEX idx_apontamentos_servico_operador_id ON alissonerp.apontamentos_servico USING btree (operador_id)`
- `idx_apontamentos_servico_servico_id` — `CREATE INDEX idx_apontamentos_servico_servico_id ON alissonerp.apontamentos_servico USING btree (servico_id)`

_Sem referência identificada no código._

---

## aprovacoes_consultora

**Aprox. linhas:** 239

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.aprovacoes_consultora_id_seq'::regclass)` | — |
| 2 | `etapas` | enum_etapas_aprovacao | ✓ | `'pendente'::alissonerp.enum_etapas_aprovacao` | — |
| 3 | `ordem_id` | integer | ✓ | — | — |
| 4 | `consultora_id` | bigint | ✓ | — | — |
| 5 | `obs` | text | ✓ | — | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `created_by` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `aprovacoes_consultora_pkey` — (`id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)

### Triggers

- `trg_aprovacao_entrega` — AFTER UPDATE → `alissonerp.fn_aprovacao_para_entrega` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `admin_full_aprovacoes` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - `consultora_aprovacoes` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'consultora'::text)`

**Uso no código:**
- `alissonerp.aprovacoes_consultora` — 8 ocorrência(s)
  - `scripts/diag_outros_schemas.mjs:6`
  - `scripts/validar_golive.mjs:52`
  - `supabase/migrations/021_triggers_protocolo.sql:217`
  - `supabase/migrations/021_triggers_protocolo.sql:219`
  - `supabase/migrations/068_role_varchar.sql:88`

---

## aprovacoes_tarefa

**Aprox. linhas:** 20

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.aprovacoes_tarefa_id_seq'::regclass)` | — |
| 2 | `tarefa_id` | integer | — | — | — |
| 3 | `solicitante_id` | uuid | ✓ | — | — |
| 4 | `aprovador_id` | uuid | ✓ | — | — |
| 5 | `status` | character varying(20) | ✓ | `'pendente'::character varying` | — |
| 6 | `motivo` | text | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `respondido_em` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `aprovacoes_tarefa_pkey` — (`id`)

### Foreign Keys (saída)

- `tarefa_id` → `alissonerp.tarefas.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_aprovacoes_aprovador` — `CREATE INDEX idx_aprovacoes_aprovador ON alissonerp.aprovacoes_tarefa USING btree (aprovador_id)`
- `idx_aprovacoes_status` — `CREATE INDEX idx_aprovacoes_status ON alissonerp.aprovacoes_tarefa USING btree (status)`
- `idx_aprovacoes_tarefa_id` — `CREATE INDEX idx_aprovacoes_tarefa_id ON alissonerp.aprovacoes_tarefa USING btree (tarefa_id)`

**Uso no código:**
- `alissonerp.aprovacoes_tarefa` — 5 ocorrência(s)
  - `src/lib/devolucoes.ts:217`
  - `src/__tests__/aprovacao-desconto.test.ts:67`
  - `src/__tests__/aprovacao-desconto.test.ts:69`
  - `src/__tests__/solicitar-aprovacao-desconto.test.ts:66`
  - `scripts/cleanup_jonathan_teste.mjs:35`

---

## audit_log

**Aprox. linhas:** 9098

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('alissonerp.audit_log_id_seq'::regclass)` | — |
| 2 | `tabela` | text | — | — | — |
| 3 | `operacao` | text | — | — | — |
| 4 | `registro_id` | text | — | — | — |
| 5 | `dados_antes` | jsonb | ✓ | — | — |
| 6 | `dados_depois` | jsonb | ✓ | — | — |
| 7 | `usuario_id` | uuid | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `audit_log_pkey` — (`id`)

### CHECK constraints

- `audit_log_operacao_check` — `CHECK ((operacao = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text])))`

### Índices

- `idx_audit_data` — `CREATE INDEX idx_audit_data ON alissonerp.audit_log USING btree (created_at)`
- `idx_audit_tabela` — `CREATE INDEX idx_audit_tabela ON alissonerp.audit_log USING btree (tabela)`

**Uso no código:**
- `alissonerp.audit_log` — 3 ocorrência(s)
  - `src/lib/audit.ts:37`
  - `scripts/migrar_ordens_legado.mjs:50`
  - `scripts/_db_mapping_build_docs.mjs:480`

---

## auditorias

> Auditoria de qualidade pós-PCP. Criada automaticamente ao concluir saída.

**Aprox. linhas:** 753

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.auditorias_id_seq'::regclass)` | — |
| 2 | `situacao` | character varying(10) | ✓ | `'1'::character varying` | — |
| 3 | `tipo_auditoria` | character varying(10) | ✓ | — | — |
| 4 | `rota_processo` | character varying(20) | ✓ | — | — |
| 5 | `ordem_id` | integer | ✓ | — | — |
| 6 | `data_conclusao` | timestamp with time zone | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `created_by` | uuid | ✓ | — | — |
| 10 | `responsavel_id` | uuid | ✓ | — | — |
| 11 | `parecer` | text | ✓ | — | — |
| 12 | `motivo_reprovacao` | text | ✓ | — | — |
| 13 | `tipo_retrabalho` | character varying(50) | ✓ | — | — |
| 14 | `peso_negociado` | float4 | ✓ | `0` | — |
| 15 | `peso_final` | float4 | ✓ | `0` | — |
| 16 | `pmc` | float4 | ✓ | `0` | — |
| 17 | `quebra` | float4 | ✓ | `0` | — |
| 18 | `quebra_percentual` | float4 | ✓ | `0` | — |
| 19 | `total_metal` | float4 | ✓ | `0` | — |
| 20 | `retorno_metal` | float4 | ✓ | `0` | — |
| 21 | `metal_externo` | float4 | ✓ | `0` | — |
| 22 | `ourives_nome` | text | ✓ | — | — |
| 23 | `ordem_retrabalho_id` | integer | ✓ | — | — |
| 24 | `ficha_tecnica_obs` | text | ✓ | — | — |
| 25 | `dados_ordem` | jsonb | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `auditorias_pkey` — (`id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)
- `ordem_retrabalho_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_auditoria_ordem_tipo` — `CREATE UNIQUE INDEX idx_auditoria_ordem_tipo ON alissonerp.auditorias USING btree (ordem_id, tipo_auditoria) WHERE ((situacao)::text <> 'reprovado'::text)`
- `idx_auditorias_ordem_id` — `CREATE INDEX idx_auditorias_ordem_id ON alissonerp.auditorias USING btree (ordem_id)`
- `idx_auditorias_situacao` — `CREATE INDEX idx_auditorias_situacao ON alissonerp.auditorias USING btree (situacao)`
- `idx_auditorias_tipo` — `CREATE INDEX idx_auditorias_tipo ON alissonerp.auditorias USING btree (tipo_auditoria)`

### Triggers

- `trg_processar_auditoria` — BEFORE UPDATE → `alissonerp.fn_processar_auditoria` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `admin_full_auditorias` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'gerente_fabrica'::text, 'gerente_loja'::text]))`
    WITH CHECK: `((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'gerente_fabrica'::text, 'gerente_loja'::text]))`
  - `read_auditorias` (SELECT, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = ANY (ARRAY['pcp'::text, 'ourives'::text, 'consultora'::text]))`

**Uso no código:**
- `alissonerp.auditorias` — 30 ocorrência(s)
  - `src/app/(dashboard)/auditoria/AuditoriaClient.tsx:86`
  - `src/app/(dashboard)/auditoria/AuditoriaClient.tsx:530`
  - `src/app/(dashboard)/auditoria/AuditoriaClient.tsx:638`
  - `src/app/(dashboard)/auditoria/AuditoriaClient.tsx:651`
  - `src/app/(dashboard)/auditoria/AuditoriaClient.tsx:666`

---

## automacoes_execucoes

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.automacoes_execucoes_id_seq'::regclass)` | — |
| 2 | `automacao_id` | integer | — | — | — |
| 3 | `tarefa_id` | integer | ✓ | — | — |
| 4 | `executado_em` | date | — | `CURRENT_DATE` | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `automacoes_execucoes_pkey` — (`id`)

### Foreign Keys (saída)

- `automacao_id` → `alissonerp.automacoes_tarefa.id` (UPDATE NO ACTION, DELETE CASCADE)
- `tarefa_id` → `alissonerp.tarefas.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_exec_automacao` — `CREATE INDEX idx_exec_automacao ON alissonerp.automacoes_execucoes USING btree (automacao_id)`

_Sem referência identificada no código._

---

## automacoes_tarefa

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.automacoes_tarefa_id_seq'::regclass)` | — |
| 2 | `titulo` | text | — | — | — |
| 3 | `descricao` | text | ✓ | — | — |
| 4 | `responsavel_id` | uuid | ✓ | — | — |
| 5 | `prioridade` | character varying(10) | ✓ | `'media'::character varying` | — |
| 6 | `recorrencia` | character varying(20) | — | `'diaria'::character varying` | — |
| 7 | `dia_semana` | integer | ✓ | — | — |
| 8 | `dia_mes` | integer | ✓ | — | — |
| 9 | `tags` | _text | ✓ | `'{}'::text[]` | — |
| 10 | `ativa` | boolean | ✓ | `true` | — |
| 11 | `criado_por` | uuid | ✓ | — | — |
| 12 | `ultima_execucao` | date | ✓ | — | — |
| 13 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 14 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `automacoes_tarefa_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.automacoes_execucoes.automacao_id` (constraint `automacoes_execucoes_automacao_id_fkey`)

### Índices

- `idx_automacoes_ativa` — `CREATE INDEX idx_automacoes_ativa ON alissonerp.automacoes_tarefa USING btree (ativa)`

**Uso no código:**
- `alissonerp.automacoes_tarefa` — 1 ocorrência(s)
  - `supabase/migrations/191_crediario_aging_automacao.sql:2`

---

## backup_pre_limpeza_20260315

**Aprox. linhas:** 1972

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `src` | text | ✓ | — | — |
| 2 | `id` | bigint | ✓ | — | — |
| 3 | `ordem_id` | integer | ✓ | — | — |
| 4 | `insumo_id` | integer | ✓ | — | — |
| 5 | `deposito_id` | integer | ✓ | — | — |
| 6 | `entrada` | float4 | ✓ | — | — |
| 7 | `saida` | float4 | ✓ | — | — |
| 8 | `marcador` | enum_marcador_estoque | ✓ | — | — |
| 9 | `data_hora` | timestamp with time zone | ✓ | — | — |

_Sem referência identificada no código._

---

## categorias_insumo

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.categorias_insumo_id_seq'::regclass)` | — |
| 2 | `nome` | character varying(100) | — | — | — |
| 3 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `categorias_insumo_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.insumos.categoria_id` (constraint `insumos_categoria_id_fkey`)

**Uso no código:**
- `alissonerp.categorias_insumo` — 8 ocorrência(s)
  - `scripts/pre_reset_check.mjs:50`
  - `scripts/pre_reset_check.mjs:86`
  - `scripts/validar_golive.mjs:68`
  - `scripts/validar_golive.mjs:76`
  - `supabase/migrations/002_tabelas_config.sql:37`

---

## comentarios_ordem

**Aprox. linhas:** 640

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.comentarios_ordem_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | — | — | — |
| 3 | `autor_id` | uuid | — | — | — |
| 4 | `texto` | text | — | — | — |
| 5 | `mencoes` | _uuid | ✓ | `'{}'::uuid[]` | — |
| 6 | `editado` | boolean | ✓ | `false` | — |
| 7 | `editado_em` | timestamp with time zone | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `excluido` | boolean | ✓ | `false` | — |
| 10 | `excluido_em` | timestamp with time zone | ✓ | — | — |
| 11 | `excluido_por` | uuid | ✓ | — | — |
| 12 | `texto_original` | text | ✓ | — | — |
| 13 | `foto_path` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `comentarios_ordem_pkey` — (`id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `alissonerp.notificacoes.comentario_id` (constraint `notificacoes_comentario_id_fkey`)

### Índices

- `idx_comentarios_autor` — `CREATE INDEX idx_comentarios_autor ON alissonerp.comentarios_ordem USING btree (autor_id)`
- `idx_comentarios_created` — `CREATE INDEX idx_comentarios_created ON alissonerp.comentarios_ordem USING btree (created_at DESC)`
- `idx_comentarios_ordem_id` — `CREATE INDEX idx_comentarios_ordem_id ON alissonerp.comentarios_ordem USING btree (ordem_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `comentarios_delete` (DELETE, PERMISSIVE) roles=authenticated
    USING: `((autor_id = auth.uid()) OR ((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'desenvolvedor'::text])))`
  - `comentarios_insert` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `(autor_id = auth.uid())`
  - `comentarios_select` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`
  - `comentarios_update` (UPDATE, PERMISSIVE) roles=authenticated
    USING: `(autor_id = auth.uid())`

**Uso no código:**
- `alissonerp.comentarios_ordem` — 21 ocorrência(s)
  - `src/components/ComentariosOrdem.tsx:173`
  - `scripts/apply_069.mjs:6`
  - `scripts/apply_069.mjs:21`
  - `scripts/apply_069.mjs:26`
  - `scripts/apply_069.mjs:48`

---

## comentarios_tarefa

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.comentarios_tarefa_id_seq'::regclass)` | — |
| 2 | `tarefa_id` | integer | — | — | — |
| 3 | `autor_id` | uuid | ✓ | — | — |
| 4 | `texto` | text | — | — | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `comentarios_tarefa_pkey` — (`id`)

### Foreign Keys (saída)

- `tarefa_id` → `alissonerp.tarefas.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_comentarios_tarefa` — `CREATE INDEX idx_comentarios_tarefa ON alissonerp.comentarios_tarefa USING btree (tarefa_id)`

_Sem referência identificada no código._

---

## compras

**Aprox. linhas:** 1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.compras_id_seq'::regclass)` | — |
| 2 | `fornecedor_id` | bigint | ✓ | — | — |
| 3 | `situacao` | character varying(20) | ✓ | `'pendente'::character varying` | — |
| 4 | `total` | numeric(12,3) | ✓ | `0` | — |
| 5 | `obs` | text | ✓ | — | — |
| 6 | `bloqueado` | boolean | ✓ | `false` | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `created_by` | uuid | ✓ | — | — |
| 10 | `local_destino_id` | integer | ✓ | — | — |
| 11 | `numero_nf` | character varying(50) | ✓ | — | — |
| 12 | `data_compra` | date | ✓ | — | — |
| 13 | `data_recebimento` | date | ✓ | — | — |
| 14 | `recebido_por` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `compras_pkey` — (`id`)

### Foreign Keys (saída)

- `local_destino_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.contas_pagar.compra_id` (constraint `contas_pagar_compra_id_fkey`)
- `alissonerp.itens_compra.compra_id` (constraint `itens_compra_compra_id_fkey`)

### Índices

- `idx_compras_data_compra` — `CREATE INDEX idx_compras_data_compra ON alissonerp.compras USING btree (data_compra)`
- `idx_compras_local_destino` — `CREATE INDEX idx_compras_local_destino ON alissonerp.compras USING btree (local_destino_id)`

### Triggers

- `trg_aa_bloquear_compra` — BEFORE UPDATE → `alissonerp.fn_bloquear_compra` 
- `trg_compra_gerar_conta_pagar` — AFTER UPDATE → `alissonerp.fn_compra_gerar_conta_pagar` 
- `trg_concluir_compra` — BEFORE UPDATE → `alissonerp.fn_concluir_compra` 

**Uso no código:**
- `alissonerp.compras` — 68 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/compras/page.tsx:26`
  - `src/app/(dashboard)/compras/page.tsx:28`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1826`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1841`
  - `src/app/api/compras/fornecedores/route.ts:4`

---

## comunicacoes_crediario

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.comunicacoes_crediario_id_seq'::regclass)` | — |
| 2 | `conta_receber_id` | integer | — | — | — |
| 3 | `tipo` | character varying(30) | — | — | — |
| 4 | `mensagem` | text | — | — | — |
| 5 | `usuario_id` | uuid | ✓ | — | — |
| 6 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `comunicacoes_crediario_pkey` — (`id`)

### Foreign Keys (saída)

- `conta_receber_id` → `alissonerp.contas_receber.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `comunicacoes_crediario_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['aviso_recebimento'::character varying, 'cobranca'::character varying, 'observacao'::character varying])::text[])))`

### Índices

- `idx_com_cr_conta` — `CREATE INDEX idx_com_cr_conta ON alissonerp.comunicacoes_crediario USING btree (conta_receber_id, created_at DESC)`

**Uso no código:**
- `alissonerp.comunicacoes_crediario` — 4 ocorrência(s)
  - `src/app/api/crediario/aging-cron/route.ts:14`
  - `src/app/api/crediario/aging-cron/route.ts:45`
  - `src/app/api/crediario/[id]/registrar-pagamento/route.ts:18`
  - `supabase/migrations/190_modulo_crediario.sql:2`

---

## config_orcamento

**Aprox. linhas:** 1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.config_orcamento_id_seq'::regclass)` | — |
| 2 | `name` | character varying(50) | — | `'default'::character varying` | — |
| 3 | `start_mkp` | numeric(6,2) | — | `3.5` | — |
| 4 | `discount_percent` | numeric(5,2) | — | `0` | — |
| 5 | `gold_price` | numeric(10,2) | — | `0` | — |
| 6 | `camera_override` | numeric(6,1) | ✓ | — | — |
| 7 | `profile` | character varying(30) | ✓ | `'Anatomica'::character varying` | — |
| 8 | `pricing_categories` | jsonb | — | `'[]'::jsonb` | — |
| 9 | `groove_rules` | jsonb | — | `'[]'::jsonb` | — |
| 10 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 11 | `updated_by` | uuid | ✓ | — | — |
| 12 | `stone_markup` | numeric(6,2) | — | `2.5` | — |
| 13 | `stone_prices` | jsonb | — | `'[{"tipo": "diamante", "preco_usd_ct": 80}, {"tipo": "moissanita", "preco_usd...` | — |
| 14 | `calibracao` | jsonb | ✓ | `'{"largura_min": {"grao": 0.8, "pave": 1.4, "canaleta": 1.0}, "folga_pedras":...` | Parametros de validacao do orcamento de aliancas. Espessura minima = pedra*multiplicador + constante. Largura minima varia por tipo de cravacao (canaleta/grao/pave). Folga = espaco minimo entre pedras. |
| 15 | `risco_width` | numeric(5,2) | ✓ | `0.10` | — |
| 16 | `risco_depth` | numeric(5,2) | ✓ | `0.20` | — |
| 17 | `preco_gravacao` | numeric(10,2) | ✓ | `100.00` | — |
| 18 | `stone_markups_table` | jsonb | ✓ | `'{}'::jsonb` | Markups por pedra por tamanho. Ex: {"diamante":{"0":3.9,"1":3.7,...}} |

### Chaves

- **UNIQUE** `config_orcamento_name_key` — (`name`)
- **PRIMARY KEY** `config_orcamento_pkey` — (`id`)

### Índices

- `config_orcamento_name_key` — `CREATE UNIQUE INDEX config_orcamento_name_key ON alissonerp.config_orcamento USING btree (name)`

**Uso no código:**
- `alissonerp.config_orcamento` — 14 ocorrência(s)
  - `src/app/(dashboard)/orcamento/constants.ts:293`
  - `src/app/(dashboard)/orcamento/OrcamentoClient.tsx:121`
  - `src/app/(dashboard)/orcamento/validations.ts:12`
  - `scripts/apply_132.mjs:2`
  - `scripts/apply_132.mjs:57`

---

## configuracoes_secrets

**Aprox. linhas:** 11

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.configuracoes_secrets_id_seq'::regclass)` | — |
| 2 | `chave` | character varying(100) | — | — | — |
| 3 | `valor_encrypted` | text | — | — | — |
| 4 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 5 | `updated_by` | uuid | ✓ | — | — |

### Chaves

- **UNIQUE** `configuracoes_secrets_chave_key` — (`chave`)
- **PRIMARY KEY** `configuracoes_secrets_pkey` — (`id`)

### Índices

- `configuracoes_secrets_chave_key` — `CREATE UNIQUE INDEX configuracoes_secrets_chave_key ON alissonerp.configuracoes_secrets USING btree (chave)`

**Uso no código:**
- `alissonerp.configuracoes_secrets` — 8 ocorrência(s)
  - `src/app/api/configuracoes/cotacoes/route.ts:61`
  - `src/app/api/configuracoes/integracoes/route.ts:56`
  - `src/lib/mercado-pago.ts:406`
  - `scripts/diagnose_pix_502.mjs:21`
  - `scripts/diagnose_tiny.mjs:1`

---

## configuracoes_sistema

**Aprox. linhas:** 20

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.configuracoes_sistema_id_seq'::regclass)` | — |
| 2 | `chave` | character varying(100) | — | — | — |
| 3 | `valor` | text | — | — | — |
| 4 | `descricao` | text | ✓ | — | — |
| 5 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `updated_by` | uuid | ✓ | — | — |

### Chaves

- **UNIQUE** `configuracoes_sistema_chave_key` — (`chave`)
- **PRIMARY KEY** `configuracoes_sistema_pkey` — (`id`)

### Índices

- `configuracoes_sistema_chave_key` — `CREATE UNIQUE INDEX configuracoes_sistema_chave_key ON alissonerp.configuracoes_sistema USING btree (chave)`

**Uso no código:**
- `alissonerp.configuracoes_sistema` — 17 ocorrência(s)
  - `src/app/api/editor-ia/config/route.ts:8`
  - `src/app/api/precificacao/regras/route.ts:3`
  - `src/app/api/webhooks/mercado-pago/route.ts:31`
  - `src/app/api/webhooks/mercado-pago/route.ts:58`
  - `src/lib/editor-ia/api-keys.ts:3`

---

## contas_pagar

**Aprox. linhas:** 2

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.contas_pagar_id_seq'::regclass)` | — |
| 2 | `descricao` | text | — | — | — |
| 3 | `fornecedor_id` | bigint | ✓ | — | — |
| 4 | `valor` | numeric(12,2) | — | — | — |
| 5 | `data_vencimento` | date | ✓ | — | — |
| 6 | `data_pagamento` | date | ✓ | — | — |
| 7 | `situacao` | character varying(20) | ✓ | `'pendente'::character varying` | — |
| 8 | `categoria` | character varying(50) | ✓ | — | — |
| 9 | `compra_id` | integer | ✓ | — | — |
| 10 | `obs` | text | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 12 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 13 | `created_by` | uuid | ✓ | — | — |
| 14 | `fornecedor_nome` | text | ✓ | — | — |
| 15 | `inter_pagamento_id` | character varying(100) | ✓ | — | — |
| 16 | `inter_status` | character varying(30) | ✓ | — | — |
| 17 | `inter_tipo` | character varying(10) | ✓ | — | — |
| 18 | `inter_dados` | jsonb | ✓ | — | — |
| 19 | `inter_enviado_em` | timestamp with time zone | ✓ | — | — |
| 20 | `inter_atualizado_em` | timestamp with time zone | ✓ | — | — |
| 21 | `inter_erro` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `contas_pagar_pkey` — (`id`)

### Foreign Keys (saída)

- `compra_id` → `alissonerp.compras.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.fin_conciliacoes.conta_pagar_id` (constraint `fin_conciliacoes_conta_pagar_id_fkey`)
- `alissonerp.inter_sync_log.conta_pagar_id` (constraint `inter_sync_log_conta_pagar_id_fkey`)
- `alissonerp.reembolsos.conta_pagar_id` (constraint `reembolsos_conta_pagar_id_fkey`)

### CHECK constraints

- `ck_contas_pagar_inter_tipo` — `CHECK (((inter_tipo IS NULL) OR ((inter_tipo)::text = ANY ((ARRAY['pix'::character varying, 'boleto'::character varying, 'ted'::character varying])::text[]))))`

### Índices

- `idx_contas_pagar_inter_pagamento` — `CREATE INDEX idx_contas_pagar_inter_pagamento ON alissonerp.contas_pagar USING btree (inter_pagamento_id) WHERE (inter_pagamento_id IS NOT NULL)`
- `idx_contas_pagar_inter_status_pendente` — `CREATE INDEX idx_contas_pagar_inter_status_pendente ON alissonerp.contas_pagar USING btree (inter_status) WHERE ((inter_status IS NOT NULL) AND ((situacao)::text = 'pendente'::text))`
- `idx_cp_situacao` — `CREATE INDEX idx_cp_situacao ON alissonerp.contas_pagar USING btree (situacao)`
- `idx_cp_vencimento` — `CREATE INDEX idx_cp_vencimento ON alissonerp.contas_pagar USING btree (data_vencimento)`

**Uso no código:**
- `alissonerp.contas_pagar` — 26 ocorrência(s)
  - `src/app/api/financeiro/conciliar/route.ts:33`
  - `src/__tests__/conciliar.test.ts:7`
  - `src/__tests__/conciliar.test.ts:113`
  - `src/__tests__/conciliar.test.ts:121`
  - `src/__tests__/conciliar.test.ts:155`

---

## contas_receber

**Aprox. linhas:** 242

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.contas_receber_id_seq'::regclass)` | — |
| 2 | `descricao` | text | — | — | — |
| 3 | `cliente_id` | bigint | ✓ | — | — |
| 4 | `venda_id` | integer | ✓ | — | — |
| 5 | `valor` | numeric(12,2) | — | — | — |
| 6 | `data_vencimento` | date | ✓ | — | — |
| 7 | `data_recebimento` | date | ✓ | — | — |
| 8 | `situacao` | character varying(20) | ✓ | `'pendente'::character varying` | — |
| 9 | `categoria` | character varying(50) | ✓ | — | — |
| 10 | `obs` | text | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 12 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 13 | `created_by` | uuid | ✓ | — | — |
| 14 | `venda_erp_id` | integer | ✓ | — | — |
| 15 | `cliente_nome` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `contas_receber_pkey` — (`id`)

### Foreign Keys (saída)

- `venda_erp_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.comunicacoes_crediario.conta_receber_id` (constraint `comunicacoes_crediario_conta_receber_id_fkey`)
- `alissonerp.fin_conciliacoes.conta_receber_id` (constraint `fin_conciliacoes_conta_receber_id_fkey`)

### Índices

- `idx_cr_situacao` — `CREATE INDEX idx_cr_situacao ON alissonerp.contas_receber USING btree (situacao)`
- `idx_cr_situacao_venda` — `CREATE INDEX idx_cr_situacao_venda ON alissonerp.contas_receber USING btree (situacao, venda_erp_id) WHERE ((categoria)::text = 'venda'::text)`
- `idx_cr_vencimento` — `CREATE INDEX idx_cr_vencimento ON alissonerp.contas_receber USING btree (data_vencimento)`
- `idx_cr_venda_erp_id` — `CREATE INDEX idx_cr_venda_erp_id ON alissonerp.contas_receber USING btree (venda_erp_id) WHERE ((categoria)::text = 'venda'::text)`

**Uso no código:**
- `alissonerp.contas_receber` — 57 ocorrência(s) _(amostra abaixo)_
  - `src/app/api/crediario/[id]/registrar-pagamento/route.ts:14`
  - `src/app/api/crediario/[id]/registrar-pagamento/route.ts:100`
  - `src/app/api/financeiro/conciliar/route.ts:43`
  - `src/app/api/vendas/[id]/pagamentos/[pagId]/confirmar/route.ts:98`
  - `src/app/api/webhooks/mercado-pago/route.ts:23`

---

## contatos_fiscais

> Campos fiscais de cliente/fornecedor. PK = public.contatos.id_contato (FK logica).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_contato` | bigint | — | — | Ref logica a public.contatos.id_contato (sem FK fisica) |
| 2 | `ie` | character varying(20) | ✓ | — | Inscricao Estadual (so dig). Vazio se isento ou nao contribuinte. |
| 3 | `indicador_ie` | smallint | ✓ | — | 1=Contribuinte ICMS, 2=Isento, 9=Nao contribuinte |
| 4 | `codigo_ibge_municipio` | character varying(7) | ✓ | — | Codigo IBGE do municipio (7 digitos) — obrigatorio na NF-e |
| 5 | `regime_tributario` | smallint | ✓ | — | 1=Simples, 2=Lucro Presumido, 3=Lucro Real |
| 6 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `contatos_fiscais_pkey` — (`id_contato`)

### CHECK constraints

- `contatos_fiscais_indicador_ie_check` — `CHECK ((indicador_ie = ANY (ARRAY[1, 2, 9])))`

### Índices

- `idx_contatos_fiscais_ibge` — `CREATE INDEX idx_contatos_fiscais_ibge ON alissonerp.contatos_fiscais USING btree (codigo_ibge_municipio) WHERE (codigo_ibge_municipio IS NOT NULL)`

**Uso no código:**
- `alissonerp.contatos_fiscais` — 2 ocorrência(s)
  - `scripts/apply_145_150_fiscal.mjs:46`
  - `supabase/migrations/147_fiscal_produtos_contatos_fiscais.sql:56`

---

## curva_categorias

> Faixas de peso da curva de precificacao. Interpolacao linear entre pontos.

**Aprox. linhas:** 9

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.curva_categorias_id_seq'::regclass)` | — |
| 2 | `nome` | character varying(60) | — | — | — |
| 3 | `max_weight` | numeric(10,3) | — | — | Peso maximo da faixa em gramas (limite superior) |
| 4 | `variation` | numeric(6,3) | — | `0` | Quanto reduz o MKP em relacao ao degrau anterior |
| 5 | `comm_variation` | numeric(6,3) | — | `0` | Quanto reduz a comissao em relacao ao degrau anterior |
| 6 | `max_discount` | numeric(5,2) | — | `0` | %% maximo de desconto permitido para produtos desta faixa |
| 7 | `ativo` | boolean | — | `true` | — |
| 8 | `ordem` | integer | — | — | Ordem de aplicacao (sequencial por peso crescente) |
| 9 | `created_at` | timestamp with time zone | — | `now()` | — |
| 10 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `curva_categorias_pkey` — (`id`)

### CHECK constraints

- `curva_categorias_comm_variation_check` — `CHECK ((comm_variation >= (0)::numeric))`
- `curva_categorias_max_discount_check` — `CHECK (((max_discount >= (0)::numeric) AND (max_discount <= (100)::numeric)))`
- `curva_categorias_max_weight_check` — `CHECK ((max_weight > (0)::numeric))`
- `curva_categorias_variation_check` — `CHECK ((variation >= (0)::numeric))`

### Índices

- `idx_curva_categorias_ativo_peso` — `CREATE INDEX idx_curva_categorias_ativo_peso ON alissonerp.curva_categorias USING btree (ativo, max_weight) WHERE (ativo = true)`
- `idx_curva_categorias_ordem` — `CREATE UNIQUE INDEX idx_curva_categorias_ordem ON alissonerp.curva_categorias USING btree (ordem)`

### Triggers

- `trg_curva_categorias_updated_at` — BEFORE UPDATE → `alissonerp.fn_curva_touch_updated_at` 

**Uso no código:**
- `alissonerp.curva_categorias` — 3 ocorrência(s)
  - `src/app/(dashboard)/precificacao/page.tsx:64`
  - `scripts/apply_144.mjs:24`
  - `supabase/migrations/144_precificacao_curva_dinamica.sql:44`

---

## curva_config

> Configuracao global da curva de precificacao (singleton id=1)

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | smallint | — | — | — |
| 2 | `start_mkp` | numeric(6,3) | — | `5.000` | Markup inicial (peso = 0.1g). Ex: 5.000 |
| 3 | `start_commission` | numeric(6,3) | — | `8.000` | Comissao inicial em % (peso = 0.1g). Ex: 8.000 |
| 4 | `gold_cost_percentage` | numeric(6,3) | — | `100.000` | %% da cotacao que entra como custo do ouro (100 = 100%%) |
| 5 | `sucata_compra_min_pct` | numeric(6,3) | — | `80.000` | %% minimo da cotacao pago na compra de sucata |
| 6 | `sucata_compra_max_pct` | numeric(6,3) | — | `85.000` | %% maximo da cotacao pago na compra de sucata |
| 7 | `arredondamento` | character varying(20) | — | `'dezena'::character varying` | dezena \| unidade \| centena |
| 8 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 9 | `updated_by` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `curva_config_pkey` — (`id`)

### CHECK constraints

- `curva_config_arredondamento_check` — `CHECK (((arredondamento)::text = ANY ((ARRAY['dezena'::character varying, 'unidade'::character varying, 'centena'::character varying])::text[])))`
- `curva_config_id_check` — `CHECK ((id = 1))`

### Triggers

- `trg_curva_config_updated_at` — BEFORE UPDATE → `alissonerp.fn_curva_touch_updated_at` 

**Uso no código:**
- `alissonerp.curva_config` — 4 ocorrência(s)
  - `src/app/(dashboard)/precificacao/page.tsx:64`
  - `scripts/apply_144.mjs:15`
  - `scripts/apply_144.mjs:21`
  - `supabase/migrations/144_precificacao_curva_dinamica.sql:17`

---

## dashboard_configs

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.dashboard_configs_id_seq'::regclass)` | — |
| 2 | `usuario_id` | uuid | — | — | — |
| 3 | `layout` | jsonb | — | `'[]'::jsonb` | — |
| 4 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 5 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `dashboard_configs_pkey` — (`id`)
- **UNIQUE** `dashboard_configs_usuario_id_key` — (`usuario_id`)

### Foreign Keys (saída)

- `usuario_id` → `alissonerp.usuarios.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `dashboard_configs_usuario_id_key` — `CREATE UNIQUE INDEX dashboard_configs_usuario_id_key ON alissonerp.dashboard_configs USING btree (usuario_id)`
- `idx_dashboard_configs_usuario` — `CREATE INDEX idx_dashboard_configs_usuario ON alissonerp.dashboard_configs USING btree (usuario_id)`

_Sem referência identificada no código._

---

## depositos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.depositos_id_seq'::regclass)` | — |
| 2 | `nome` | character varying(100) | — | — | — |
| 3 | `tipo` | enum_tipo_deposito | — | `'producao'::alissonerp.enum_tipo_deposito` | — |
| 4 | `ativo` | boolean | ✓ | `true` | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `local_estoque_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `depositos_pkey` — (`id`)

### Foreign Keys (saída)

- `local_estoque_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.apontamentos_distribuicao.deposito_id` (constraint `apontamentos_distribuicao_deposito_id_fkey`)
- `alissonerp.apontamentos_pcp.deposito_id` (constraint `apontamentos_pcp_deposito_id_fkey`)
- `alissonerp.apontamentos_servico.operador_id` (constraint `apontamentos_servico_operador_id_fkey`)
- `alissonerp.distribuicoes.deposito_id` (constraint `distribuicoes_deposito_id_fkey`)
- `alissonerp.fechamentos_fabrica.deposito_id` (constraint `fechamentos_fabrica_deposito_id_fkey`)
- `alissonerp.itens_compra.deposito_id` (constraint `itens_compra_deposito_id_fkey`)
- `alissonerp.itens_distribuicao.deposito_id` (constraint `itens_distribuicao_deposito_id_fkey`)
- `alissonerp.itens_ordem_insumos.deposito_id` (constraint `itens_ordem_insumos_deposito_id_fkey`)
- `alissonerp.lancamentos_avulso.deposito_destino_id` (constraint `lancamentos_avulso_deposito_destino_id_fkey`)
- `alissonerp.lancamentos_avulso.deposito_id` (constraint `lancamentos_avulso_deposito_id_fkey`)
- `alissonerp.movimentacoes_estoque.deposito_id` (constraint `movimentacoes_estoque_deposito_id_fkey`)
- `alissonerp.ordens.local_atual` (constraint `ordens_local_atual_fkey`)
- `alissonerp.outros_insumos_pcp.deposito_id` (constraint `outros_insumos_pcp_deposito_id_fkey`)
- `alissonerp.pcp.deposito_id` (constraint `pcp_deposito_id_fkey`)
- `alissonerp.pedras_ordens.deposito_id` (constraint `pedras_ordens_deposito_id_fkey`)
- `alissonerp.saidas_distribuicao.deposito_id` (constraint `saidas_distribuicao_deposito_id_fkey`)
- `alissonerp.saidas_ordem.deposito_id` (constraint `saidas_ordem_deposito_id_fkey`)
- `alissonerp.servicos.operador_id` (constraint `servicos_operador_id_fkey`)
- `alissonerp.setores.deposito_id` (constraint `setores_deposito_id_fkey`)
- `alissonerp.transferencias_ordem.deposito_id` (constraint `transferencias_ordem_deposito_id_fkey`)
- `alissonerp.transferencias_ordem.deposito_origem_id` (constraint `transferencias_ordem_deposito_origem_id_fkey`)

**Uso no código:**
- `alissonerp.depositos` — 88 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:136`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:141`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:457`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:459`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:775`

---

## devolucoes_itens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.devolucoes_itens_id_seq'::regclass)` | — |
| 2 | `devolucao_id` | integer | — | — | — |
| 3 | `item_venda_id` | integer | — | — | — |
| 4 | `produto_id` | bigint | ✓ | — | — |
| 5 | `quantidade` | numeric(10,3) | — | — | — |
| 6 | `valor_unitario` | numeric(12,2) | — | — | — |
| 7 | `valor_total` | numeric(12,2) | — | — | — |
| 8 | `condicao` | character varying(30) | — | `'pendente'::character varying` | — |
| 9 | `inspecao_por` | uuid | ✓ | — | — |
| 10 | `inspecao_em` | timestamp with time zone | ✓ | — | — |
| 11 | `inspecao_observacao` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `devolucoes_itens_pkey` — (`id`)

### Foreign Keys (saída)

- `devolucao_id` → `alissonerp.devolucoes_venda.id` (UPDATE NO ACTION, DELETE CASCADE)
- `item_venda_id` → `alissonerp.itens_venda_erp.id` (UPDATE NO ACTION, DELETE NO ACTION)

### CHECK constraints

- `devolucoes_itens_condicao_check` — `CHECK (((condicao)::text = ANY ((ARRAY['pendente'::character varying, 'aprovado_retorno'::character varying, 'reprovado_descarte'::character varying, 'garantia'::character varying])::text[])))`

### Índices

- `idx_devolucoes_itens_devolucao` — `CREATE INDEX idx_devolucoes_itens_devolucao ON alissonerp.devolucoes_itens USING btree (devolucao_id)`
- `idx_devolucoes_itens_item` — `CREATE INDEX idx_devolucoes_itens_item ON alissonerp.devolucoes_itens USING btree (item_venda_id)`
- `idx_devolucoes_itens_produto` — `CREATE INDEX idx_devolucoes_itens_produto ON alissonerp.devolucoes_itens USING btree (produto_id)`

**Uso no código:**
- `alissonerp.devolucoes_itens` — 6 ocorrência(s)
  - `scripts/apply_142.mjs:18`
  - `scripts/check_fiscal_s5.mjs:9`
  - `scripts/check_fiscal_s5.mjs:10`
  - `scripts/check_fiscal_s5.mjs:11`
  - `scripts/check_schemas.mjs:4`

---

## devolucoes_venda

**Aprox. linhas:** 1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.devolucoes_venda_id_seq'::regclass)` | — |
| 2 | `numero` | character varying(20) | — | — | — |
| 3 | `venda_id` | integer | — | — | — |
| 4 | `tipo` | character varying(20) | — | — | — |
| 5 | `motivo` | text | ✓ | — | — |
| 6 | `status` | character varying(30) | — | `'rascunho'::character varying` | — |
| 7 | `tipo_compensacao` | character varying(30) | — | — | — |
| 8 | `valor_total_devolvido` | numeric(12,2) | — | `0` | — |
| 9 | `valor_retido` | numeric(12,2) | — | `0` | — |
| 10 | `valor_compensacao` | numeric(12,2) | — | `0` | — |
| 11 | `percentual_retencao` | numeric(5,2) | — | `0` | — |
| 12 | `foi_entregue` | boolean | — | `false` | — |
| 13 | `tarefa_id` | integer | ✓ | — | — |
| 14 | `aprovador_id` | uuid | ✓ | — | — |
| 15 | `rejeitado_motivo` | text | ✓ | — | — |
| 16 | `criado_por` | uuid | — | — | — |
| 17 | `created_at` | timestamp with time zone | — | `now()` | — |
| 18 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 19 | `aprovado_em` | timestamp with time zone | ✓ | — | — |
| 20 | `nota_fiscal_devolucao_id` | integer | ✓ | — | FK logica para alissonerp.notas_fiscais.id (FK fisica adicionada em 149) |
| 21 | `nfe_numero` | integer | ✓ | — | — |
| 22 | `nfe_chave_44` | character varying(44) | ✓ | — | Chave da NF-e de entrada (devolucao) — CFOP tipicamente 1202/2202 |
| 23 | `nfe_emitida_em` | timestamp with time zone | ✓ | — | — |

### Chaves

- **UNIQUE** `devolucoes_venda_numero_key` — (`numero`)
- **PRIMARY KEY** `devolucoes_venda_pkey` — (`id`)

### Foreign Keys (saída)

- `tarefa_id` → `alissonerp.tarefas.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `venda_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `nota_fiscal_devolucao_id` → `alissonerp.notas_fiscais.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.devolucoes_itens.devolucao_id` (constraint `devolucoes_itens_devolucao_id_fkey`)
- `alissonerp.movimentacoes_estoque_comercial.devolucao_id` (constraint `movimentacoes_estoque_comercial_devolucao_id_fkey`)
- `alissonerp.reembolsos.devolucao_id` (constraint `reembolsos_devolucao_id_fkey`)
- `alissonerp.vale_troca.devolucao_id` (constraint `vale_troca_devolucao_id_fkey`)

### CHECK constraints

- `devolucoes_venda_status_check` — `CHECK (((status)::text = ANY ((ARRAY['rascunho'::character varying, 'aguardando_aprovacao'::character varying, 'aprovado'::character varying, 'rejeitado'::character varying, 'concluido'::character varying, 'cancelado'::character varying])::text[])))`
- `devolucoes_venda_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['parcial'::character varying, 'total'::character varying])::text[])))`
- `devolucoes_venda_tipo_compensacao_check` — `CHECK (((tipo_compensacao)::text = ANY ((ARRAY['vale_troca'::character varying, 'reembolso_mp'::character varying, 'reembolso_manual'::character varying])::text[])))`

### Índices

- `devolucoes_venda_numero_key` — `CREATE UNIQUE INDEX devolucoes_venda_numero_key ON alissonerp.devolucoes_venda USING btree (numero)`
- `idx_devolucoes_created` — `CREATE INDEX idx_devolucoes_created ON alissonerp.devolucoes_venda USING btree (created_at DESC)`
- `idx_devolucoes_criado_por` — `CREATE INDEX idx_devolucoes_criado_por ON alissonerp.devolucoes_venda USING btree (criado_por)`
- `idx_devolucoes_nfe_chave` — `CREATE INDEX idx_devolucoes_nfe_chave ON alissonerp.devolucoes_venda USING btree (nfe_chave_44) WHERE (nfe_chave_44 IS NOT NULL)`
- `idx_devolucoes_status` — `CREATE INDEX idx_devolucoes_status ON alissonerp.devolucoes_venda USING btree (status)`
- `idx_devolucoes_tarefa` — `CREATE INDEX idx_devolucoes_tarefa ON alissonerp.devolucoes_venda USING btree (tarefa_id) WHERE (tarefa_id IS NOT NULL)`
- `idx_devolucoes_venda` — `CREATE INDEX idx_devolucoes_venda ON alissonerp.devolucoes_venda USING btree (venda_id)`

### Triggers

- `trg_devolucoes_updated_at` — BEFORE UPDATE → `alissonerp.fn_devolucoes_updated_at` 

**Uso no código:**
- `alissonerp.devolucoes_venda` — 16 ocorrência(s)
  - `src/app/api/fiscal/emitir/nfe-devolucao/route.ts:183`
  - `src/app/api/fiscal/notas/[id]/cancelar/route.ts:211`
  - `src/app/api/fiscal/webhook/focus/route.ts:96`
  - `src/app/api/fiscal/webhook/focus/route.ts:97`
  - `src/__tests__/aprovacao-desconto.test.ts:250`

---

## distribuicao_ordens

**Aprox. linhas:** 129

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.distribuicao_ordens_id_seq'::regclass)` | — |
| 2 | `distribuicao_id` | integer | ✓ | — | — |
| 3 | `ordens_id` | integer | ✓ | — | — |
| 4 | `peso_bruto` | numeric(10,4) | ✓ | — | — |
| 5 | `peso_pedras` | numeric(10,4) | ✓ | `0` | — |
| 6 | `peso_ouro_real` | numeric(10,4) | ✓ | — | — |
| 7 | `quebra` | numeric(10,4) | ✓ | — | — |
| 8 | `ouro_entregue` | numeric(10,4) | ✓ | — | — |
| 9 | `data_baixa` | timestamp with time zone | ✓ | — | — |
| 10 | `saida_por` | uuid | ✓ | — | — |
| 11 | `foto_balanca` | text | ✓ | — | — |
| 12 | `sem_peso` | boolean | ✓ | `false` | Se true, ordem saiu do lote sem peso (serviço, cancelada, fundição falha, etc.) |
| 13 | `justificativa_sem_peso` | text | ✓ | — | Obrigatória quando sem_peso=true. Motivo pelo qual a ordem não tem peso. |

### Chaves

- **UNIQUE** `distribuicao_ordens_distribuicao_id_ordens_id_key` — (`distribuicao_id`, `ordens_id`)
- **PRIMARY KEY** `distribuicao_ordens_pkey` — (`id`)

### Foreign Keys (saída)

- `distribuicao_id` → `alissonerp.distribuicoes.id` (UPDATE NO ACTION, DELETE SET NULL)
- `ordens_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)

### Referenciada por (entrada)

- `alissonerp.distribuicao_saida_pedras.distribuicao_ordem_id` (constraint `distribuicao_saida_pedras_distribuicao_ordem_id_fkey`)

### Índices

- `distribuicao_ordens_distribuicao_id_ordens_id_key` — `CREATE UNIQUE INDEX distribuicao_ordens_distribuicao_id_ordens_id_key ON alissonerp.distribuicao_ordens USING btree (distribuicao_id, ordens_id)`

### Triggers

- `trg_after_insert_distribuicao_ordem` — AFTER INSERT → `alissonerp.fn_criar_fechamento_por_ordem` 

**Uso no código:**
- `alissonerp.distribuicao_ordens` — 23 ocorrência(s)
  - `src/app/api/distribuicao/[id]/estorno/route.ts:18`
  - `src/app/api/distribuicao/[id]/estorno/route.ts:208`
  - `src/app/api/distribuicao/[id]/estorno-lote/route.ts:16`
  - `src/app/api/distribuicao/[id]/estorno-lote/route.ts:254`
  - `src/app/api/distribuicao/[id]/saida/route.ts:174`

---

## distribuicao_saida_pedras

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.distribuicao_saida_pedras_id_seq'::regclass)` | — |
| 2 | `distribuicao_ordem_id` | integer | — | — | — |
| 3 | `insumo_id` | integer | — | — | — |
| 4 | `qtd_utilizada` | integer | — | — | — |
| 5 | `peso_unitario` | numeric(10,4) | ✓ | — | — |
| 6 | `peso_total` | numeric(10,4) | ✓ | — | — |
| 7 | `peso_ct_utilizado` | numeric(10,4) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `distribuicao_saida_pedras_pkey` — (`id`)

### Foreign Keys (saída)

- `distribuicao_ordem_id` → `alissonerp.distribuicao_ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)

**Uso no código:**
- `alissonerp.distribuicao_saida_pedras` — 13 ocorrência(s)
  - `src/app/api/distribuicao/[id]/estorno/route.ts:17`
  - `src/app/api/pcp/[id]/insumos-transferencia/route.ts:10`
  - `src/lib/recalcular-totais-pcp.ts:8`
  - `src/lib/recalcular-totais-pcp.ts:9`
  - `scripts/backup_pre_golive.mjs:26`

---

## distribuicoes

**Aprox. linhas:** 54

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.distribuicoes_id_seq'::regclass)` | — |
| 2 | `etapas` | enum_etapas_distribuicao | ✓ | `'em_andamento'::alissonerp.enum_etapas_distribuicao` | — |
| 3 | `setor` | enum_setor_distribuicao | ✓ | — | — |
| 4 | `operador` | uuid | ✓ | — | — |
| 5 | `saida_id` | integer | ✓ | — | — |
| 6 | `total_metal` | float4 | ✓ | `0` | — |
| 7 | `retorno_metal` | float4 | ✓ | `0` | — |
| 8 | `total_pedras_un` | float4 | ✓ | `0` | — |
| 9 | `total_pedras_g` | float4 | ✓ | `0` | — |
| 10 | `total_outros_pesos` | float4 | ✓ | `0` | — |
| 11 | `total_geral_outros_pesos` | float4 | ✓ | `0` | — |
| 12 | `pmc` | float4 | ✓ | `0` | — |
| 13 | `quebra` | float4 | ✓ | `0` | — |
| 14 | `porcentagem_de_quebra` | float4 | ✓ | `0` | — |
| 15 | `peso_final` | float4 | ✓ | `0` | — |
| 16 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 17 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 18 | `created_by` | uuid | ✓ | — | — |
| 19 | `deposito_id` | integer | ✓ | — | — |
| 20 | `setor_id` | integer | ✓ | — | — |
| 21 | `ouro_entregue` | float4 | ✓ | — | Ouro líquido entregue ao lote: (tipos 1+2) − retorno (tipo 5), categoria metal |
| 22 | `ouro_pecas` | float4 | ✓ | — | Soma de distribuicao_ordens.peso_ouro_real para todas as ordens do lote |
| 23 | `quebra_lote` | float4 | ✓ | — | Resultado do lote: ouro_entregue − ouro_pecas (positivo = quebra, negativo = saldo) |
| 24 | `total_pedras_ct` | numeric(10,4) | ✓ | `0` | — |

### Chaves

- **PRIMARY KEY** `distribuicoes_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `saida_id` → `alissonerp.saidas_distribuicao.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `setor_id` → `alissonerp.setores.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.apontamentos_distribuicao.distribuicao_id` (constraint `apontamentos_distribuicao_distribuicao_id_fkey`)
- `alissonerp.distribuicao_ordens.distribuicao_id` (constraint `distribuicao_ordens_distribuicao_id_fkey`)
- `alissonerp.estornos_distribuicao.distribuicao_id` (constraint `estornos_distribuicao_distribuicao_id_fkey`)
- `alissonerp.fechamentos_distribuicao.distribuicao_id` (constraint `fechamentos_distribuicao_distribuicao_id_fkey`)
- `alissonerp.itens_distribuicao.distribuicao_id` (constraint `itens_distribuicao_distribuicao_id_fkey`)
- `alissonerp.ordens.distribuicao_id` (constraint `fk_ordens_distribuicao`)
- `alissonerp.outros_insumos_distribuicao.distribuicao_id` (constraint `outros_insumos_distribuicao_distribuicao_id_fkey`)

### Triggers

- `trg_audit_distribuicoes` — AFTER INSERT/DELETE/UPDATE → `alissonerp.fn_audit_log` 
- `trg_concluir_distribuicao` — BEFORE UPDATE → `alissonerp.fn_concluir_distribuicao` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `admin_full_distribuicoes` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - `gerente_fab_distribuicoes` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`

**Uso no código:**
- `alissonerp.distribuicoes` — 14 ocorrência(s)
  - `scripts/backup_pre_golive.mjs:24`
  - `scripts/pre_migration_check.mjs:112`
  - `scripts/pre_reset_check.mjs:18`
  - `scripts/pre_reset_check.mjs:30`
  - `scripts/pre_reset_check.mjs:65`

---

## editor_ia_historico

> Historico global do Editor IA com deduplicacao por hash (input + params).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('alissonerp.editor_ia_historico_id_seq'::regclass)` | — |
| 2 | `user_id` | uuid | ✓ | — | — |
| 3 | `user_nome` | text | ✓ | — | — |
| 4 | `input_hash` | text | — | — | — |
| 5 | `params_hash` | text | — | — | — |
| 6 | `categoria` | text | ✓ | — | — |
| 7 | `cenario_id` | text | ✓ | — | — |
| 8 | `cenario_nome` | text | ✓ | — | — |
| 9 | `modelo` | text | — | — | — |
| 10 | `aspect_ratio` | text | ✓ | — | — |
| 11 | `detalhes` | text | ✓ | — | — |
| 12 | `prompt_final` | text | ✓ | — | — |
| 13 | `imagem_url` | text | — | — | — |
| 14 | `storage_path` | text | — | — | — |
| 15 | `elapsed_ms` | integer | ✓ | — | — |
| 16 | `cache_hits` | integer | — | `0` | Incrementa cada vez que a mesma combinacao input+params eh solicitada novamente. |
| 17 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `editor_ia_historico_pkey` — (`id`)

### Índices

- `idx_editor_ia_historico_created` — `CREATE INDEX idx_editor_ia_historico_created ON alissonerp.editor_ia_historico USING btree (created_at DESC)`
- `idx_editor_ia_historico_dedup` — `CREATE UNIQUE INDEX idx_editor_ia_historico_dedup ON alissonerp.editor_ia_historico USING btree (input_hash, params_hash)`
- `idx_editor_ia_historico_user_created` — `CREATE INDEX idx_editor_ia_historico_user_created ON alissonerp.editor_ia_historico USING btree (user_id, created_at DESC)`

**Uso no código:**
- `alissonerp.editor_ia_historico` — 1 ocorrência(s)
  - `scripts/sync_db.mjs:25`

---

## empresas_emitentes

> Emitentes fiscais (fabrica + lojas). Multi-CNPJ.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.empresas_emitentes_id_seq'::regclass)` | — |
| 2 | `nome_fantasia` | character varying(100) | ✓ | — | — |
| 3 | `razao_social` | character varying(150) | — | — | — |
| 4 | `cnpj` | character varying(14) | — | — | — |
| 5 | `ie` | character varying(20) | ✓ | — | — |
| 6 | `im` | character varying(20) | ✓ | — | — |
| 7 | `regime_tributario` | smallint | — | `1` | 1=Simples Nacional, 2=Lucro Presumido, 3=Lucro Real |
| 8 | `logradouro` | character varying(120) | ✓ | — | — |
| 9 | `numero` | character varying(20) | ✓ | — | — |
| 10 | `complemento` | character varying(60) | ✓ | — | — |
| 11 | `bairro` | character varying(60) | ✓ | — | — |
| 12 | `codigo_ibge_municipio` | character varying(7) | ✓ | — | — |
| 13 | `municipio` | character varying(60) | ✓ | — | — |
| 14 | `uf` | character(2) | ✓ | — | — |
| 15 | `cep` | character varying(8) | ✓ | — | — |
| 16 | `focus_token_criptografado` | text | ✓ | — | Token Focus NFe cifrado (pgp_sym_encrypt no app) |
| 17 | `ambiente` | character varying(15) | — | `'homologacao'::character varying` | homologacao (SEFAZ testes) \| producao |
| 18 | `serie_nfe` | smallint | — | `1` | — |
| 19 | `serie_nfce` | smallint | — | `1` | — |
| 20 | `proxima_nfe` | integer | — | `1` | Proximo numero de NF-e 55 a emitir (por serie) |
| 21 | `proxima_nfce` | integer | — | `1` | Proximo numero de NFC-e 65 a emitir (por serie) |
| 22 | `local_estoque_id` | integer | ✓ | — | Local fisico que este CNPJ representa (fabrica ou loja) |
| 23 | `ativo` | boolean | — | `true` | — |
| 24 | `created_at` | timestamp with time zone | — | `now()` | — |
| 25 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `empresas_emitentes_cnpj_key` — (`cnpj`)
- **PRIMARY KEY** `empresas_emitentes_pkey` — (`id`)

### Foreign Keys (saída)

- `local_estoque_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.notas_fiscais.empresa_emitente_id` (constraint `notas_fiscais_empresa_emitente_id_fkey`)
- `alissonerp.regras_fiscais.empresa_emitente_id` (constraint `regras_fiscais_empresa_emitente_id_fkey`)
- `alissonerp.vendas_erp.empresa_emitente_id` (constraint `vendas_erp_empresa_emitente_id_fkey`)
- `alissonerp.vendedores_fiscais.empresa_emitente_id` (constraint `vendedores_fiscais_empresa_emitente_id_fkey`)

### CHECK constraints

- `empresas_emitentes_ambiente_check` — `CHECK (((ambiente)::text = ANY ((ARRAY['homologacao'::character varying, 'producao'::character varying])::text[])))`
- `empresas_emitentes_regime_tributario_check` — `CHECK ((regime_tributario = ANY (ARRAY[1, 2, 3])))`

### Índices

- `empresas_emitentes_cnpj_key` — `CREATE UNIQUE INDEX empresas_emitentes_cnpj_key ON alissonerp.empresas_emitentes USING btree (cnpj)`
- `idx_empresas_emitentes_ativo` — `CREATE INDEX idx_empresas_emitentes_ativo ON alissonerp.empresas_emitentes USING btree (ativo) WHERE (ativo = true)`
- `idx_empresas_emitentes_cnpj` — `CREATE INDEX idx_empresas_emitentes_cnpj ON alissonerp.empresas_emitentes USING btree (cnpj)`
- `idx_empresas_emitentes_local` — `CREATE INDEX idx_empresas_emitentes_local ON alissonerp.empresas_emitentes USING btree (local_estoque_id) WHERE (local_estoque_id IS NOT NULL)`

**Uso no código:**
- `alissonerp.empresas_emitentes` — 3 ocorrência(s)
  - `scripts/apply_145_150_fiscal.mjs:9`
  - `scripts/apply_145_150_fiscal.mjs:45`
  - `supabase/migrations/146_fiscal_regras_fiscais.sql:16`

---

## epc_serial

> Controle atomico do serial sequencial de EPC por ano. Uma linha por ano.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `ano` | integer | — | — | Ano em 2 digitos (ex: 26 para 2026) — igual ao {AA} do EPC. |
| 2 | `proximo_serial` | bigint | — | `1` | Proximo serial a ser alocado. Atualizado pela funcao gerar_proximo_epc(). |
| 3 | `atualizado_em` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `epc_serial_pkey` — (`ano`)

_Sem referência identificada no código._

---

## erp_produtos

> Produtos ERP com relação pai/variação. Referencia public.produtos sem alterá-lo.

**Aprox. linhas:** 15143

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.erp_produtos_id_seq'::regclass)` | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `sku` | character varying(100) | — | — | — |
| 4 | `nome` | character varying(500) | ✓ | — | — |
| 5 | `parent_sku` | character varying(100) | ✓ | — | SKU do produto pai: split_part(sku, "-", 1) quando tem "-" e não começa com "AJ". |
| 6 | `parent_id` | integer | ✓ | — | — |
| 7 | `eh_variacao` | boolean | — | `false` | — |
| 8 | `eh_pai` | boolean | — | `false` | — |
| 9 | `sufixo_variacao` | character varying(20) | ✓ | — | — |
| 10 | `numeracao` | character varying(10) | ✓ | — | — |
| 11 | `cor_metal` | character varying(30) | ✓ | — | — |
| 12 | `comprimento` | numeric(10,2) | ✓ | — | — |
| 13 | `largura_aro` | numeric(10,2) | ✓ | — | — |
| 14 | `altura_aro` | numeric(10,2) | ✓ | — | — |
| 15 | `base` | numeric(10,2) | ✓ | — | — |
| 16 | `observacao_erp` | text | ✓ | — | — |
| 17 | `ativo` | boolean | — | `true` | — |
| 18 | `date_created` | timestamp with time zone | — | `now()` | — |
| 19 | `date_updated` | timestamp with time zone | — | `now()` | — |
| 20 | `fornecedor` | character varying(120) | ✓ | — | Nome livre do fornecedor do produto. Pode coincidir com alissonerp.fornecedores.nome, mas sem FK. |

### Chaves

- **PRIMARY KEY** `erp_produtos_pkey` — (`id`)
- **UNIQUE** `erp_produtos_produto_id_key` — (`produto_id`)
- **UNIQUE** `erp_produtos_sku_key` — (`sku`)

### Foreign Keys (saída)

- `parent_id` → `alissonerp.erp_produtos.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.erp_produtos.parent_id` (constraint `erp_produtos_parent_id_fkey`)

### Índices

- `erp_produtos_produto_id_key` — `CREATE UNIQUE INDEX erp_produtos_produto_id_key ON alissonerp.erp_produtos USING btree (produto_id)`
- `erp_produtos_sku_key` — `CREATE UNIQUE INDEX erp_produtos_sku_key ON alissonerp.erp_produtos USING btree (sku)`
- `idx_erp_produtos_eh_pai` — `CREATE INDEX idx_erp_produtos_eh_pai ON alissonerp.erp_produtos USING btree (eh_pai) WHERE (eh_pai = true)`
- `idx_erp_produtos_eh_variacao` — `CREATE INDEX idx_erp_produtos_eh_variacao ON alissonerp.erp_produtos USING btree (eh_variacao) WHERE (eh_variacao = true)`
- `idx_erp_produtos_fornecedor` — `CREATE INDEX idx_erp_produtos_fornecedor ON alissonerp.erp_produtos USING btree (fornecedor) WHERE (fornecedor IS NOT NULL)`
- `idx_erp_produtos_parent_id` — `CREATE INDEX idx_erp_produtos_parent_id ON alissonerp.erp_produtos USING btree (parent_id) WHERE (parent_id IS NOT NULL)`
- `idx_erp_produtos_parent_sku` — `CREATE INDEX idx_erp_produtos_parent_sku ON alissonerp.erp_produtos USING btree (parent_sku) WHERE (parent_sku IS NOT NULL)`
- `idx_erp_produtos_produto_id` — `CREATE INDEX idx_erp_produtos_produto_id ON alissonerp.erp_produtos USING btree (produto_id)`
- `idx_erp_produtos_sku` — `CREATE INDEX idx_erp_produtos_sku ON alissonerp.erp_produtos USING btree (sku)`

**Uso no código:**
- `alissonerp.erp_produtos` — 56 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/produtos/ProdutosClient.tsx:42`
  - `src/app/api/fornecedores/route.ts:6`
  - `src/app/api/fornecedores/route.ts:27`
  - `src/app/api/produtos/pedras-bulk/route.ts:109`
  - `src/app/api/produtos/pedras-bulk/route.ts:151`

---

## estoque_comercial_config

**Aprox. linhas:** 807

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.estoque_comercial_config_id_seq'::regclass)` | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `estoque_minimo` | integer | — | `0` | — |
| 4 | `ativo` | boolean | — | `true` | — |
| 5 | `created_by` | uuid | ✓ | — | — |
| 6 | `created_at` | timestamp with time zone | — | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `estoque_comercial_config_pkey` — (`id`)
- **UNIQUE** `estoque_comercial_config_produto_id_key` — (`produto_id`)

### Índices

- `estoque_comercial_config_produto_id_key` — `CREATE UNIQUE INDEX estoque_comercial_config_produto_id_key ON alissonerp.estoque_comercial_config USING btree (produto_id)`

### Triggers

- `trg_update_estoque_comercial_config_ts` — BEFORE UPDATE → `alissonerp.fn_update_estoque_comercial_config_ts` 

**Uso no código:**
- `alissonerp.estoque_comercial_config` — 10 ocorrência(s)
  - `supabase/migrations/111_estoque_comercial_auto_venda.sql:3`
  - `supabase/migrations/140_estoque_comercial_v2.sql:183`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:24`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:99`
  - `supabase/migrations/141_triggers_estoque_comercial_v2.sql:215`

---

## estornos_distribuicao

> Registro imutável de cada estorno — quem, quando, por quê, snapshot JSONB do que foi revertido

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.estornos_distribuicao_id_seq'::regclass)` | — |
| 2 | `distribuicao_id` | integer | — | — | — |
| 3 | `ordem_id` | integer | ✓ | — | — |
| 4 | `motivo` | character varying(50) | — | — | — |
| 5 | `justificativa` | text | — | — | — |
| 6 | `estornado_por` | uuid | — | — | — |
| 7 | `dados_revertidos` | jsonb | — | `'{}'::jsonb` | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `estornos_distribuicao_pkey` — (`id`)

### Foreign Keys (saída)

- `distribuicao_id` → `alissonerp.distribuicoes.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_estornos_dist_dist` — `CREATE INDEX idx_estornos_dist_dist ON alissonerp.estornos_distribuicao USING btree (distribuicao_id)`
- `idx_estornos_dist_ordem` — `CREATE INDEX idx_estornos_dist_ordem ON alissonerp.estornos_distribuicao USING btree (ordem_id)`

_Sem referência identificada no código._

---

## faixas_comissao

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.faixas_comissao_id_seq'::regclass)` | — |
| 2 | `desconto_pct` | numeric(5,2) | — | — | — |
| 3 | `comissao_pct` | numeric(5,2) | — | — | — |
| 4 | `ativo` | boolean | — | `true` | — |
| 5 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 6 | `updated_by` | uuid | ✓ | — | — |

### Chaves

- **UNIQUE** `faixas_comissao_desconto_pct_key` — (`desconto_pct`)
- **PRIMARY KEY** `faixas_comissao_pkey` — (`id`)

### Índices

- `faixas_comissao_desconto_pct_key` — `CREATE UNIQUE INDEX faixas_comissao_desconto_pct_key ON alissonerp.faixas_comissao USING btree (desconto_pct)`

_Sem referência identificada no código._

---

## fechamentos_distribuicao

**Aprox. linhas:** 129

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fechamentos_distribuicao_id_seq'::regclass)` | — |
| 2 | `distribuicao_id` | integer | ✓ | — | — |
| 3 | `ordem_id` | integer | ✓ | — | — |
| 4 | `peso` | float4 | ✓ | `0` | — |
| 5 | `pmc` | float4 | ✓ | `0` | — |
| 6 | `total_pedras_un` | float4 | ✓ | `0` | — |
| 7 | `total_pedras_g` | float4 | ✓ | `0` | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 10 | `created_by` | uuid | ✓ | — | — |
| 11 | `foto_balanca` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `fechamentos_distribuicao_pkey` — (`id`)

### Foreign Keys (saída)

- `distribuicao_id` → `alissonerp.distribuicoes.id` (UPDATE NO ACTION, DELETE SET NULL)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)

### Índices

- `idx_unico_fechamento_dist` — `CREATE UNIQUE INDEX idx_unico_fechamento_dist ON alissonerp.fechamentos_distribuicao USING btree (distribuicao_id, ordem_id)`

### Triggers

- `trg_fechamento_distribuicao` — AFTER INSERT/UPDATE → `alissonerp.fn_processar_fechamento_dist` 

**Uso no código:**
- `alissonerp.fechamentos_distribuicao` — 8 ocorrência(s)
  - `src/app/api/distribuicao/[id]/estorno/route.ts:19`
  - `src/app/api/distribuicao/[id]/estorno/route.ts:222`
  - `src/app/api/distribuicao/[id]/saida/route.ts:21`
  - `src/app/api/distribuicao/[id]/saida/route.ts:188`
  - `scripts/validar_golive.mjs:48`

---

## fechamentos_fabrica

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fechamentos_fabrica_id_seq'::regclass)` | — |
| 2 | `setor_id` | integer | ✓ | — | — |
| 3 | `deposito_id` | integer | ✓ | — | — |
| 4 | `entrada` | float4 | ✓ | `0` | — |
| 5 | `saida` | float4 | ✓ | `0` | — |
| 6 | `quebra` | float4 | ✓ | `0` | — |
| 7 | `quebra_percentual` | float4 | ✓ | `0` | — |
| 8 | `ids_processados` | jsonb | ✓ | — | — |
| 9 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `fechamentos_fabrica_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `setor_id` → `alissonerp.setores.id` (UPDATE NO ACTION, DELETE NO ACTION)

_Sem referência identificada no código._

---

## fichas_tecnicas

**Aprox. linhas:** 52

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fichas_tecnicas_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | ✓ | — | — |
| 3 | `tipo_item` | character varying(50) | — | — | — |
| 4 | `dados` | jsonb | — | `'{}'::jsonb` | — |
| 5 | `created_by` | uuid | ✓ | — | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `fichas_tecnicas_pkey` — (`id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_fichas_tecnicas_ordem_id` — `CREATE INDEX idx_fichas_tecnicas_ordem_id ON alissonerp.fichas_tecnicas USING btree (ordem_id)`

_Sem referência identificada no código._

---

## fichas_tecnicas_produto

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fichas_tecnicas_produto_id_seq'::regclass)` | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `tipo_peca` | character varying(50) | ✓ | — | — |
| 4 | `largura` | numeric(8,2) | ✓ | — | — |
| 5 | `altura` | numeric(8,2) | ✓ | — | — |
| 6 | `profundidade` | numeric(8,2) | ✓ | — | — |
| 7 | `diametro_interno` | numeric(8,2) | ✓ | — | — |
| 8 | `peso_estimado_metal` | numeric(10,2) | ✓ | — | — |
| 9 | `qtd_pedras` | integer | ✓ | `0` | — |
| 10 | `tamanho_pedras_mm` | numeric(6,2) | ✓ | — | — |
| 11 | `tamanho_pedras_ct` | numeric(6,3) | ✓ | — | — |
| 12 | `tipo_cravacao` | character varying(50) | ✓ | — | — |
| 13 | `qtd_garras` | integer | ✓ | `0` | — |
| 14 | `largura_garra` | numeric(6,2) | ✓ | — | — |
| 15 | `altura_garra` | numeric(6,2) | ✓ | — | — |
| 16 | `modelo` | character varying(100) | ✓ | — | — |
| 17 | `modelo_interno` | character varying(50) | ✓ | — | — |
| 18 | `arquivo_3dm` | text | ✓ | — | — |
| 19 | `arquivo_glb` | text | ✓ | — | — |
| 20 | `ia_provider` | character varying(20) | ✓ | — | — |
| 21 | `ia_raw_response` | jsonb | ✓ | — | — |
| 22 | `ia_confianca` | numeric(3,0) | ✓ | — | — |
| 23 | `revisado_por` | uuid | ✓ | — | — |
| 24 | `revisado_em` | timestamp with time zone | ✓ | — | — |
| 25 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 26 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `fichas_tecnicas_produto_pkey` — (`id`)
- **UNIQUE** `fichas_tecnicas_produto_produto_id_key` — (`produto_id`)

### Índices

- `fichas_tecnicas_produto_produto_id_key` — `CREATE UNIQUE INDEX fichas_tecnicas_produto_produto_id_key ON alissonerp.fichas_tecnicas_produto USING btree (produto_id)`
- `idx_fichas_tecnicas_produto_id` — `CREATE INDEX idx_fichas_tecnicas_produto_id ON alissonerp.fichas_tecnicas_produto USING btree (produto_id)`

_Sem referência identificada no código._

---

## fila_sync_externo

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('alissonerp.fila_sync_externo_id_seq'::regclass)` | — |
| 2 | `sistema` | character varying(50) | — | — | — |
| 3 | `acao` | character varying(100) | — | `'sync'::character varying` | — |
| 4 | `payload` | jsonb | — | — | — |
| 5 | `status` | character varying(20) | — | `'pendente'::character varying` | — |
| 6 | `tentativas` | integer | — | `0` | — |
| 7 | `ultimo_erro` | text | ✓ | — | — |
| 8 | `criado_em` | timestamp with time zone | — | `now()` | — |
| 9 | `processado_em` | timestamp with time zone | ✓ | — | — |
| 10 | `proxima_execucao` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `fila_sync_externo_pkey` — (`id`)

### CHECK constraints

- `fila_sync_externo_status_check` — `CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'processando'::character varying, 'processado'::character varying, 'falha_definitiva'::character varying])::text[])))`

### Índices

- `idx_fila_sync_pendente` — `CREATE INDEX idx_fila_sync_pendente ON alissonerp.fila_sync_externo USING btree (status, proxima_execucao) WHERE ((status)::text = 'pendente'::text)`
- `idx_fila_sync_sistema` — `CREATE INDEX idx_fila_sync_sistema ON alissonerp.fila_sync_externo USING btree (sistema, status)`
- `idx_fila_sync_status_criado` — `CREATE INDEX idx_fila_sync_status_criado ON alissonerp.fila_sync_externo USING btree (status, criado_em)`

**Uso no código:**
- `alissonerp.fila_sync_externo` — 1 ocorrência(s)
  - `supabase/migrations/200_fila_sync_proxima_execucao.sql:1`

---

## fin_caixa_baixas

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fin_caixa_baixas_id_seq'::regclass)` | — |
| 2 | `total` | numeric(12,2) | — | — | — |
| 3 | `qtd_pagamentos` | integer | — | — | — |
| 4 | `realizado_por` | uuid | ✓ | — | — |
| 5 | `realizado_nome` | text | ✓ | — | — |
| 6 | `obs` | text | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `fin_caixa_baixas_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.pagamentos_venda.caixa_baixa_id` (constraint `pagamentos_venda_caixa_baixa_id_fkey`)

**Uso no código:**
- `alissonerp.fin_caixa_baixas` — 7 ocorrência(s)
  - `src/__tests__/caixa-baixa.test.ts:14`
  - `src/__tests__/caixa-baixa.test.ts:130`
  - `src/__tests__/caixa-baixa.test.ts:322`
  - `src/__tests__/caixa-baixa.test.ts:394`
  - `src/__tests__/caixa-baixa.test.ts:414`

---

## fin_conciliacoes

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fin_conciliacoes_id_seq'::regclass)` | — |
| 2 | `lancamento_id` | integer | ✓ | — | — |
| 3 | `conta_pagar_id` | integer | ✓ | — | — |
| 4 | `conta_receber_id` | integer | ✓ | — | — |
| 5 | `tipo` | character varying(20) | ✓ | `'manual'::character varying` | — |
| 6 | `status` | character varying(20) | ✓ | `'pendente'::character varying` | — |
| 7 | `obs` | text | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `created_by` | uuid | ✓ | — | — |
| 10 | `pagamento_venda_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `fin_conciliacoes_pkey` — (`id`)

### Foreign Keys (saída)

- `conta_pagar_id` → `alissonerp.contas_pagar.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `conta_receber_id` → `alissonerp.contas_receber.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `lancamento_id` → `alissonerp.fin_lancamentos_bancarios.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `pagamento_venda_id` → `alissonerp.pagamentos_venda.id` (UPDATE NO ACTION, DELETE SET NULL)

### Índices

- `idx_fin_conciliacoes_pagamento_venda_id` — `CREATE INDEX idx_fin_conciliacoes_pagamento_venda_id ON alissonerp.fin_conciliacoes USING btree (pagamento_venda_id)`

**Uso no código:**
- `alissonerp.fin_conciliacoes` — 8 ocorrência(s)
  - `src/__tests__/conciliar.test.ts:19`
  - `src/__tests__/conciliar.test.ts:374`
  - `src/__tests__/conciliar.test.ts:421`
  - `src/__tests__/conciliar.test.ts:439`
  - `src/__tests__/conciliar.test.ts:470`

---

## fin_extratos_bancarios

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fin_extratos_bancarios_id_seq'::regclass)` | — |
| 2 | `banco` | character varying(50) | ✓ | — | — |
| 3 | `agencia` | character varying(20) | ✓ | — | — |
| 4 | `conta` | character varying(30) | ✓ | — | — |
| 5 | `data_inicio` | date | ✓ | — | — |
| 6 | `data_fim` | date | ✓ | — | — |
| 7 | `arquivo_nome` | text | ✓ | — | — |
| 8 | `arquivo_url` | text | ✓ | — | — |
| 9 | `processado` | boolean | ✓ | `false` | — |
| 10 | `total_lancamentos` | integer | ✓ | `0` | — |
| 11 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 12 | `created_by` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `fin_extratos_bancarios_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.fin_lancamentos_bancarios.extrato_id` (constraint `fin_lancamentos_bancarios_extrato_id_fkey`)

**Uso no código:**
- `alissonerp.fin_extratos_bancarios` — 3 ocorrência(s)
  - `src/__tests__/extratos.test.ts:120`
  - `src/__tests__/lancamentos.test.ts:94`
  - `src/__tests__/lancamentos.test.ts:100`

---

## fin_gateways

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fin_gateways_id_seq'::regclass)` | — |
| 2 | `nome` | text | — | — | — |
| 3 | `tipo` | character varying(20) | — | `'outro'::character varying` | — |
| 4 | `ativo` | boolean | — | `true` | — |
| 5 | `cor` | character varying(7) | ✓ | `'#6B7280'::character varying` | — |
| 6 | `obs` | text | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `fin_gateways_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.pagamentos_venda.fin_gateway_id` (constraint `pagamentos_venda_fin_gateway_id_fkey`)

### CHECK constraints

- `fin_gateways_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['pix'::character varying, 'cartao'::character varying, 'dinheiro'::character varying, 'ouro'::character varying, 'outro'::character varying])::text[])))`

_Sem referência identificada no código._

---

## fin_lancamentos_bancarios

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fin_lancamentos_bancarios_id_seq'::regclass)` | — |
| 2 | `extrato_id` | integer | ✓ | — | — |
| 3 | `fitid` | character varying(100) | ✓ | — | — |
| 4 | `tipo` | character varying(10) | ✓ | — | — |
| 5 | `valor` | numeric(12,2) | — | — | — |
| 6 | `data_transacao` | date | ✓ | — | — |
| 7 | `descricao` | text | ✓ | — | — |
| 8 | `memo` | text | ✓ | — | — |
| 9 | `conciliado` | boolean | ✓ | `false` | — |
| 10 | `conciliacao_id` | integer | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **UNIQUE** `fin_lancamentos_bancarios_fitid_key` — (`fitid`)
- **PRIMARY KEY** `fin_lancamentos_bancarios_pkey` — (`id`)

### Foreign Keys (saída)

- `extrato_id` → `alissonerp.fin_extratos_bancarios.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `alissonerp.fin_conciliacoes.lancamento_id` (constraint `fin_conciliacoes_lancamento_id_fkey`)

### Índices

- `fin_lancamentos_bancarios_fitid_key` — `CREATE UNIQUE INDEX fin_lancamentos_bancarios_fitid_key ON alissonerp.fin_lancamentos_bancarios USING btree (fitid)`
- `idx_flb_data` — `CREATE INDEX idx_flb_data ON alissonerp.fin_lancamentos_bancarios USING btree (data_transacao)`
- `idx_flb_extrato` — `CREATE INDEX idx_flb_extrato ON alissonerp.fin_lancamentos_bancarios USING btree (extrato_id)`
- `idx_flb_fitid` — `CREATE INDEX idx_flb_fitid ON alissonerp.fin_lancamentos_bancarios USING btree (fitid)`

**Uso no código:**
- `alissonerp.fin_lancamentos_bancarios` — 2 ocorrência(s)
  - `src/__tests__/conciliar.test.ts:375`
  - `src/__tests__/conciliar.test.ts:446`

---

## fornecedores

> Cadastro mestre opcional de fornecedores. Usado para autocomplete em produtos.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fornecedores_id_seq'::regclass)` | — |
| 2 | `nome` | character varying(120) | — | — | — |
| 3 | `cnpj` | character varying(20) | ✓ | — | — |
| 4 | `contato` | character varying(120) | ✓ | — | — |
| 5 | `observacao` | text | ✓ | — | — |
| 6 | `ativo` | boolean | — | `true` | — |
| 7 | `created_at` | timestamp with time zone | — | `now()` | — |
| 8 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `fornecedores_nome_key` — (`nome`)
- **PRIMARY KEY** `fornecedores_pkey` — (`id`)

### Índices

- `fornecedores_nome_key` — `CREATE UNIQUE INDEX fornecedores_nome_key ON alissonerp.fornecedores USING btree (nome)`

### Triggers

- `trg_fornecedores_updated_at` — BEFORE UPDATE → `alissonerp.fn_touch_updated_at` 

**Uso no código:**
- `alissonerp.fornecedores` — 39 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/site/SiteClient.tsx:116`
  - `src/app/api/compras/fornecedores/route.ts:4`
  - `src/app/api/compras/fornecedores/route.ts:5`
  - `src/app/api/fornecedores/route.ts:2`
  - `src/app/api/fornecedores/route.ts:3`

---

## fretes_bairro

**Aprox. linhas:** 118

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.fretes_bairro_id_seq'::regclass)` | — |
| 2 | `bairro` | text | — | — | — |
| 3 | `municipio` | text | — | `'Fortaleza'::text` | — |
| 4 | `valor` | numeric(10,2) | — | `0` | — |
| 5 | `ativo` | boolean | — | `true` | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `fretes_bairro_pkey` — (`id`)

### Índices

- `idx_fretes_bairro_uniq` — `CREATE UNIQUE INDEX idx_fretes_bairro_uniq ON alissonerp.fretes_bairro USING btree (bairro, municipio)`

**Uso no código:**
- `alissonerp.fretes_bairro` — 1 ocorrência(s)
  - `supabase/migrations/153_novo_fluxo_venda.sql:1`

---

## gateways_pagamento

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.gateways_pagamento_id_seq'::regclass)` | — |
| 2 | `nome` | text | — | — | — |
| 3 | `ativo` | boolean | — | `true` | — |
| 4 | `ordem` | integer | — | `0` | — |
| 5 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `gateways_pagamento_nome_key` — (`nome`)
- **PRIMARY KEY** `gateways_pagamento_pkey` — (`id`)

### Índices

- `gateways_pagamento_nome_key` — `CREATE UNIQUE INDEX gateways_pagamento_nome_key ON alissonerp.gateways_pagamento USING btree (nome)`

_Sem referência identificada no código._

---

## insumos

**Aprox. linhas:** 260

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.insumos_id_seq'::regclass)` | — |
| 2 | `sku` | character varying(50) | ✓ | — | — |
| 3 | `nome` | character varying(255) | — | — | — |
| 4 | `categoria_id` | integer | ✓ | — | — |
| 5 | `saldo` | float4 | ✓ | `0` | — |
| 6 | `peso_pedra` | float4 | ✓ | `0` | — |
| 7 | `peso_total` | float4 | ✓ | `0` | — |
| 8 | `custo_compra` | float4 | ✓ | `0` | — |
| 9 | `estoque_minimo` | float4 | ✓ | `0` | — |
| 10 | `estoque_maximo` | float4 | ✓ | `0` | — |
| 11 | `fornecedor_id` | bigint | ✓ | — | — |
| 12 | `ativo` | boolean | ✓ | `true` | — |
| 13 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 14 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 15 | `unidade` | character varying(10) | ✓ | `'g'::character varying` | — |
| 16 | `descricao` | text | ✓ | — | — |
| 17 | `foto` | text | ✓ | — | — |
| 18 | `observacao` | text | ✓ | — | — |
| 19 | `sku_interno` | text | ✓ | — | — |
| 20 | `peso_pedra_ct` | numeric(10,3) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `insumos_pkey` — (`id`)

### Foreign Keys (saída)

- `categoria_id` → `alissonerp.categorias_insumo.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.apontamentos_distribuicao.insumo_id` (constraint `apontamentos_distribuicao_insumo_id_fkey`)
- `alissonerp.apontamentos_pcp.insumo_id` (constraint `apontamentos_pcp_insumo_id_fkey`)
- `alissonerp.apontamentos_servico.insumo_id` (constraint `apontamentos_servico_insumo_id_fkey`)
- `alissonerp.distribuicao_saida_pedras.insumo_id` (constraint `distribuicao_saida_pedras_insumo_id_fkey`)
- `alissonerp.itens_compra.insumo_id` (constraint `itens_compra_insumo_id_fkey`)
- `alissonerp.itens_distribuicao.insumo_id` (constraint `itens_distribuicao_insumo_id_fkey`)
- `alissonerp.itens_ordem_insumos.insumo_id` (constraint `itens_ordem_insumos_insumo_id_fkey`)
- `alissonerp.lancamentos_avulso.insumo_id` (constraint `lancamentos_avulso_insumo_id_fkey`)
- `alissonerp.liga_tipo_ouro.liga_insumo_id` (constraint `liga_tipo_ouro_liga_insumo_id_fkey`)
- `alissonerp.liga_tipo_ouro.tipo_18k_insumo_id` (constraint `liga_tipo_ouro_tipo_18k_insumo_id_fkey`)
- `alissonerp.ligacoes.liga_insumo_id` (constraint `ligacoes_liga_insumo_id_fkey`)
- `alissonerp.ligacoes.tipo_18k_insumo_id` (constraint `ligacoes_tipo_18k_insumo_id_fkey`)
- `alissonerp.movimentacoes_estoque.insumo_id` (constraint `movimentacoes_estoque_insumo_id_fkey`)
- `alissonerp.outros_insumos_distribuicao.insumo_id` (constraint `outros_insumos_distribuicao_insumo_id_fkey`)
- `alissonerp.outros_insumos_pcp.insumo_id` (constraint `outros_insumos_pcp_insumo_id_fkey`)
- `alissonerp.teores_ouro.insumo_id` (constraint `teores_ouro_insumo_id_fkey`)

### Índices

- `idx_insumos_categoria` — `CREATE INDEX idx_insumos_categoria ON alissonerp.insumos USING btree (categoria_id)`
- `idx_insumos_sku` — `CREATE INDEX idx_insumos_sku ON alissonerp.insumos USING btree (sku)`

### Triggers

- `trg_calcular_peso_pedra` — BEFORE INSERT/UPDATE → `alissonerp.fn_calcular_peso_pedra_gramas` 

**Uso no código:**
- `alissonerp.insumos` — 245 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1825`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1841`
  - `src/app/(dashboard)/estoque/page.tsx:7`
  - `src/app/(dashboard)/estoque/page.tsx:60`
  - `src/app/(dashboard)/insumos/InsumosClient.tsx:6`

---

## inter_sync_log

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.inter_sync_log_id_seq'::regclass)` | — |
| 2 | `conta_pagar_id` | integer | ✓ | — | — |
| 3 | `operacao` | character varying(20) | — | — | — |
| 4 | `inter_pagamento_id` | character varying(100) | ✓ | — | — |
| 5 | `status_retornado` | character varying(30) | ✓ | — | — |
| 6 | `sucesso` | boolean | — | — | — |
| 7 | `erro` | text | ✓ | — | — |
| 8 | `request_body` | jsonb | ✓ | — | — |
| 9 | `response_body` | jsonb | ✓ | — | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `inter_sync_log_pkey` — (`id`)

### Foreign Keys (saída)

- `conta_pagar_id` → `alissonerp.contas_pagar.id` (UPDATE NO ACTION, DELETE NO ACTION)

### CHECK constraints

- `inter_sync_log_operacao_check` — `CHECK (((operacao)::text = ANY ((ARRAY['criar'::character varying, 'consultar'::character varying, 'cancelar'::character varying])::text[])))`

### Índices

- `idx_inter_sync_log_conta` — `CREATE INDEX idx_inter_sync_log_conta ON alissonerp.inter_sync_log USING btree (conta_pagar_id)`
- `idx_inter_sync_log_created` — `CREATE INDEX idx_inter_sync_log_created ON alissonerp.inter_sync_log USING btree (created_at DESC)`

**Uso no código:**
- `alissonerp.inter_sync_log` — 3 ocorrência(s)
  - `src/lib/inter.ts:188`
  - `scripts/apply_143.mjs:26`
  - `scripts/apply_143.mjs:28`

---

## inventarios_comercial

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.inventarios_comercial_id_seq'::regclass)` | — |
| 2 | `local_estoque_id` | integer | — | — | — |
| 3 | `status` | character varying(20) | — | `'aberto'::character varying` | — |
| 4 | `obs` | text | ✓ | — | — |
| 5 | `data_abertura` | timestamp with time zone | — | `now()` | — |
| 6 | `data_conclusao` | timestamp with time zone | ✓ | — | — |
| 7 | `created_by` | uuid | ✓ | — | — |
| 8 | `concluido_por` | uuid | ✓ | — | — |
| 9 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `inventarios_comercial_pkey` — (`id`)

### Foreign Keys (saída)

- `local_estoque_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.itens_inventario_comercial.inventario_id` (constraint `itens_inventario_comercial_inventario_id_fkey`)

### CHECK constraints

- `inventarios_comercial_status_check` — `CHECK (((status)::text = ANY ((ARRAY['aberto'::character varying, 'em_contagem'::character varying, 'concluido'::character varying, 'cancelado'::character varying])::text[])))`

### Índices

- `idx_inv_ec_status` — `CREATE INDEX idx_inv_ec_status ON alissonerp.inventarios_comercial USING btree (status) WHERE ((status)::text = ANY ((ARRAY['aberto'::character varying, 'em_contagem'::character varying])::text[]))`

**Uso no código:**
- `alissonerp.inventarios_comercial` — 5 ocorrência(s)
  - `src/app/api/estoque-comercial/inventario/[id]/concluir/route.ts:72`
  - `supabase/migrations/140_estoque_comercial_v2.sql:90`
  - `supabase/migrations/140_estoque_comercial_v2.sql:105`
  - `supabase/migrations/140_estoque_comercial_v2.sql:133`
  - `supabase/migrations/140_estoque_comercial_v2.sql:240`

---

## itens_compra

**Aprox. linhas:** 1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.itens_compra_id_seq'::regclass)` | — |
| 2 | `compra_id` | integer | ✓ | — | — |
| 3 | `insumo_id` | integer | ✓ | — | — |
| 4 | `deposito_id` | integer | ✓ | `1` | — |
| 5 | `qtd` | float4 | — | — | — |
| 6 | `valor_unitario` | numeric(12,2) | ✓ | — | — |
| 7 | `valor_total` | numeric(12,2) | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `unidade` | character varying(20) | ✓ | — | — |
| 10 | `peso_ct` | numeric(10,4) | ✓ | — | — |
| 11 | `qtd_pecas` | integer | ✓ | — | — |
| 12 | `custo_por_ct` | numeric(12,4) | ✓ | — | — |
| 13 | `lote_referencia` | character varying(100) | ✓ | — | — |
| 14 | `observacao` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `itens_compra_pkey` — (`id`)

### Foreign Keys (saída)

- `compra_id` → `alissonerp.compras.id` (UPDATE NO ACTION, DELETE CASCADE)
- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_itens_compra_lote` — `CREATE INDEX idx_itens_compra_lote ON alissonerp.itens_compra USING btree (lote_referencia)`

### Triggers

- `trg_calcular_item_compra` — BEFORE INSERT/UPDATE → `alissonerp.fn_calcular_item_compra` 

**Uso no código:**
- `alissonerp.itens_compra` — 1 ocorrência(s)
  - `supabase/migrations/096_compras_expandidas.sql:15`

---

## itens_distribuicao

**Aprox. linhas:** 55

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.itens_distribuicao_id_seq'::regclass)` | — |
| 2 | `distribuicao_id` | integer | ✓ | — | — |
| 3 | `deposito_id` | integer | ✓ | — | — |
| 4 | `insumo_id` | integer | ✓ | — | — |
| 5 | `peso` | float4 | ✓ | `0` | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `itens_distribuicao_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `distribuicao_id` → `alissonerp.distribuicoes.id` (UPDATE NO ACTION, DELETE SET NULL)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)

**Uso no código:**
- `alissonerp.itens_distribuicao` — 2 ocorrência(s)
  - `scripts/validar_golive.mjs:46`
  - `supabase/migrations/020_triggers_distribuicao.sql:320`

---

## itens_inventario_comercial

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.itens_inventario_comercial_id_seq'::regclass)` | — |
| 2 | `inventario_id` | integer | — | — | — |
| 3 | `produto_id` | bigint | — | — | — |
| 4 | `quantidade_sistema` | integer | — | `0` | — |
| 5 | `quantidade_contada` | integer | ✓ | — | — |
| 6 | `diferenca` | integer | ✓ | — | — |
| 7 | `movimento_ajuste_id` | integer | ✓ | — | — |
| 8 | `contado_por` | uuid | ✓ | — | — |
| 9 | `contado_em` | timestamp with time zone | ✓ | — | — |

### Chaves

- **UNIQUE** `itens_inventario_comercial_inventario_id_produto_id_key` — (`inventario_id`, `produto_id`)
- **PRIMARY KEY** `itens_inventario_comercial_pkey` — (`id`)

### Foreign Keys (saída)

- `inventario_id` → `alissonerp.inventarios_comercial.id` (UPDATE NO ACTION, DELETE CASCADE)
- `movimento_ajuste_id` → `alissonerp.movimentacoes_estoque_comercial.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_itens_inv_ec_inv` — `CREATE INDEX idx_itens_inv_ec_inv ON alissonerp.itens_inventario_comercial USING btree (inventario_id)`
- `itens_inventario_comercial_inventario_id_produto_id_key` — `CREATE UNIQUE INDEX itens_inventario_comercial_inventario_id_produto_id_key ON alissonerp.itens_inventario_comercial USING btree (inventario_id, produto_id)`

**Uso no código:**
- `alissonerp.itens_inventario_comercial` — 3 ocorrência(s)
  - `supabase/migrations/140_estoque_comercial_v2.sql:103`
  - `supabase/migrations/140_estoque_comercial_v2.sql:135`
  - `supabase/migrations/140_estoque_comercial_v2.sql:242`

---

## itens_ordem

**Aprox. linhas:** 301

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.itens_ordem_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | — | — | — |
| 3 | `produto_id` | bigint | ✓ | — | — |
| 4 | `nome_produto` | text | ✓ | — | — |
| 5 | `sku` | text | ✓ | — | — |
| 6 | `quantidade` | integer | — | `1` | — |
| 7 | `peso_estimado` | numeric(10,2) | ✓ | — | — |
| 8 | `observacao` | text | ✓ | — | — |
| 9 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 10 | `personalizacao` | jsonb | ✓ | — | Personalizacao propagada da venda (copia do itens_venda_erp.personalizacao). Ourives/fabrica le pra saber o que gravar na peca. |

### Chaves

- **PRIMARY KEY** `itens_ordem_pkey` — (`id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_itens_ordem_ordem_id` — `CREATE INDEX idx_itens_ordem_ordem_id ON alissonerp.itens_ordem USING btree (ordem_id)`
- `idx_itens_ordem_produto_id` — `CREATE INDEX idx_itens_ordem_produto_id ON alissonerp.itens_ordem USING btree (produto_id)`

**Uso no código:**
- `alissonerp.itens_ordem` — 16 ocorrência(s)
  - `src/lib/personalizacao-validacao.ts:5`
  - `src/lib/personalizacao-validacao.ts:38`
  - `src/lib/personalizacao-validacao.ts:64`
  - `scripts/apply_074.mjs:1`
  - `scripts/apply_074.mjs:8`

---

## itens_ordem_insumos

**Aprox. linhas:** 79

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.itens_ordem_insumos_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | ✓ | — | — |
| 3 | `deposito_id` | integer | ✓ | — | — |
| 4 | `insumo_id` | integer | ✓ | — | — |
| 5 | `peso` | float4 | ✓ | `0` | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `itens_ordem_insumos_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)

**Uso no código:**
- `alissonerp.itens_ordem_insumos` — 10 ocorrência(s)
  - `src/app/api/distribuicao/[id]/estorno/route.ts:17`
  - `src/app/api/distribuicao/[id]/estorno-lote/route.ts:286`
  - `scripts/validar_golive.mjs:50`
  - `supabase/migrations/018_trigger_apontamento_pcp.sql:153`
  - `supabase/migrations/018_trigger_apontamento_pcp.sql:192`

---

## itens_ordem_produtos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.itens_ordem_produtos_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | ✓ | — | — |
| 3 | `produto_id` | bigint | ✓ | — | — |
| 4 | `quantidade` | float4 | ✓ | `1` | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `itens_ordem_produtos_pkey` — (`id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)

_Sem referência identificada no código._

---

## itens_venda_erp

**Aprox. linhas:** 37758

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.itens_venda_erp_id_seq'::regclass)` | — |
| 2 | `venda_id` | integer | — | — | — |
| 3 | `produto_id` | bigint | ✓ | — | — |
| 4 | `nome_produto` | text | — | — | — |
| 5 | `sku` | text | ✓ | — | — |
| 6 | `quantidade` | integer | — | `1` | — |
| 7 | `preco_lista` | numeric(12,2) | — | — | — |
| 8 | `pct_desconto` | numeric(5,2) | — | `0` | — |
| 9 | `preco_unitario` | numeric(12,2) | — | — | — |
| 10 | `total_item` | numeric(12,2) | — | — | — |
| 11 | `pct_comissao` | numeric(5,2) | — | `0` | — |
| 12 | `valor_comissao` | numeric(12,2) | — | `0` | — |
| 13 | `desconto_autorizado_por` | uuid | ✓ | — | — |
| 14 | `observacao` | text | ✓ | — | — |
| 15 | `peso_estimado` | numeric(10,3) | ✓ | — | — |
| 16 | `created_at` | timestamp with time zone | — | `now()` | — |
| 17 | `personalizacao` | jsonb | ✓ | — | Personalizacao aplicada no item. Ex: {"tipo":"nome","valor":"JOAO","max_caracteres":4,"label":"Nome a gravar"}. Snapshot da config no momento da venda — preserva historia mesmo se admin mudar regra depois. Propaga para itens_ordem.personalizacao. |

### Chaves

- **PRIMARY KEY** `itens_venda_erp_pkey` — (`id`)

### Foreign Keys (saída)

- `venda_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `alissonerp.devolucoes_itens.item_venda_id` (constraint `devolucoes_itens_item_venda_id_fkey`)
- `alissonerp.reservas_estoque_comercial.item_venda_id` (constraint `reservas_estoque_comercial_item_venda_id_fkey`)
- `alissonerp.solicitacoes_desconto.item_id` (constraint `solicitacoes_desconto_item_id_fkey`)

### Triggers

- `trg_estoque_comercial_baixa_venda` — AFTER INSERT → `alissonerp.fn_estoque_comercial_baixa_venda` 
- `trg_estoque_comercial_reversao_item` — AFTER DELETE → `alissonerp.fn_estoque_comercial_reversao_item` 
- `trg_estoque_comercial_update_qtd_item` — AFTER UPDATE → `alissonerp.fn_estoque_comercial_update_qtd_item` 
- `trg_proteger_insert_itens_venda_fechada` — BEFORE INSERT → `alissonerp.fn_proteger_itens_venda_fechada` 
- `trg_proteger_itens_venda_fechada` — BEFORE DELETE/UPDATE → `alissonerp.fn_proteger_itens_venda_fechada` 
- `trg_recalcular_totais_venda` — AFTER INSERT/DELETE/UPDATE → `alissonerp.fn_recalcular_totais_venda` 

**Uso no código:**
- `alissonerp.itens_venda_erp` — 34 ocorrência(s) _(amostra abaixo)_
  - `src/app/api/ordens/route.ts:273`
  - `src/app/api/tarefas/[id]/aprovacao/route.ts:137`
  - `src/lib/fiscal/payload-nfe-devolucao.ts:163`
  - `src/lib/personalizacao-validacao.ts:37`
  - `src/lib/personalizacao-validacao.ts:64`

---

## joias_leituras

> Timeline de eventos RFID: cadastro, reimpressao, inventario, movimentacao, cancelamento. EPC nao tem FK — permite manter historico apos delete da joia.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('alissonerp.joias_leituras_id_seq'::regclass)` | — |
| 2 | `epc` | text | — | — | — |
| 3 | `evento` | text | — | — | Tipo de evento: cadastro (1a impressao), reimpressao, inventario (leitura em contagem), movimentacao (mudanca de local), cancelamento (rollback ou baixa). |
| 4 | `localizacao` | text | ✓ | — | — |
| 5 | `leitor_id` | text | ✓ | — | Identificador do dispositivo de leitura/gravacao. Ex: ZEBRA-ZD621R, TSL-1128-SN123. |
| 6 | `operador` | uuid | ✓ | — | — |
| 7 | `metadata` | jsonb | ✓ | — | — |
| 8 | `lido_em` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `joias_leituras_pkey` — (`id`)

### Foreign Keys (saída)

- `operador` → `alissonerp.usuarios.id` (UPDATE NO ACTION, DELETE SET NULL)

### CHECK constraints

- `joias_leituras_evento_check` — `CHECK ((evento = ANY (ARRAY['cadastro'::text, 'reimpressao'::text, 'inventario'::text, 'cancelamento'::text, 'movimentacao'::text])))`

### Índices

- `idx_joias_leituras_epc` — `CREATE INDEX idx_joias_leituras_epc ON alissonerp.joias_leituras USING btree (epc, lido_em DESC)`
- `idx_joias_leituras_evento` — `CREATE INDEX idx_joias_leituras_evento ON alissonerp.joias_leituras USING btree (evento, lido_em DESC)`
- `idx_joias_leituras_operador` — `CREATE INDEX idx_joias_leituras_operador ON alissonerp.joias_leituras USING btree (operador, lido_em DESC)`

_Sem referência identificada no código._

---

## joias_rfid

> 1 linha = 1 joia fisica com EPC unico. Dados do produto desnormalizados no momento do cadastro (snapshot).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `epc` | text | — | — | Electronic Product Code unico (AJ{AA}{NNNNNNNN}) gravado na tag RFID. |
| 3 | `produto_id` | bigint | ✓ | — | FK public.produtos.id_produto (BIGINT). SKU/nome/preco copiados como snapshot. |
| 4 | `sku` | text | — | — | — |
| 5 | `nome` | text | — | — | — |
| 6 | `categoria` | text | ✓ | — | — |
| 7 | `peso_g` | numeric(8,3) | ✓ | — | — |
| 8 | `preco_venda` | numeric(10,2) | ✓ | — | — |
| 9 | `localizacao_atual` | text | — | `'fabrica'::text` | Local atual da peca (ex: fabrica, vitrine, reposicao). Atualizado por eventos futuros. |
| 10 | `status` | text | — | `'ativo'::text` | ativo = rastreavel em producao \| pendente_impressao = aguarda confirmacao Zebra \| cancelado = removido |
| 11 | `criado_por` | uuid | ✓ | — | — |
| 12 | `created_at` | timestamp with time zone | — | `now()` | — |
| 13 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `joias_rfid_epc_key` — (`epc`)
- **PRIMARY KEY** `joias_rfid_pkey` — (`id`)

### Foreign Keys (saída)

- `criado_por` → `alissonerp.usuarios.id` (UPDATE NO ACTION, DELETE SET NULL)

### CHECK constraints

- `joias_rfid_status_check` — `CHECK ((status = ANY (ARRAY['ativo'::text, 'pendente_impressao'::text, 'cancelado'::text])))`

### Índices

- `idx_joias_rfid_criado_por` — `CREATE INDEX idx_joias_rfid_criado_por ON alissonerp.joias_rfid USING btree (criado_por, created_at DESC) WHERE (status = 'ativo'::text)`
- `idx_joias_rfid_epc` — `CREATE INDEX idx_joias_rfid_epc ON alissonerp.joias_rfid USING btree (epc)`
- `idx_joias_rfid_localizacao_ativo` — `CREATE INDEX idx_joias_rfid_localizacao_ativo ON alissonerp.joias_rfid USING btree (localizacao_atual) WHERE (status = 'ativo'::text)`
- `idx_joias_rfid_produto` — `CREATE INDEX idx_joias_rfid_produto ON alissonerp.joias_rfid USING btree (produto_id)`
- `idx_joias_rfid_sku` — `CREATE INDEX idx_joias_rfid_sku ON alissonerp.joias_rfid USING btree (sku)`
- `joias_rfid_epc_key` — `CREATE UNIQUE INDEX joias_rfid_epc_key ON alissonerp.joias_rfid USING btree (epc)`

### Triggers

- `trg_joias_rfid_touch_updated` — BEFORE UPDATE → `alissonerp.tg_joias_rfid_touch_updated` 

_Sem referência identificada no código._

---

## lancamentos_avulso

**Aprox. linhas:** 44

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.lancamentos_avulso_id_seq'::regclass)` | — |
| 2 | `tipo_lancamento` | enum_tipo_lancamento | — | — | — |
| 3 | `deposito_id` | integer | ✓ | — | — |
| 4 | `setor_id` | integer | ✓ | — | — |
| 5 | `insumo_id` | integer | ✓ | — | — |
| 6 | `peso` | float4 | ✓ | — | — |
| 7 | `obs` | text | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `created_by` | uuid | ✓ | — | — |
| 10 | `deposito_destino_id` | integer | ✓ | — | — |
| 11 | `local_estoque_id` | integer | ✓ | `1` | — |

### Chaves

- **PRIMARY KEY** `lancamentos_avulso_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_destino_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `local_estoque_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `setor_id` → `alissonerp.setores.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Triggers

- `trg_lancamento_avulso` — AFTER INSERT → `alissonerp.fn_processar_lancamento_avulso` 

**Uso no código:**
- `alissonerp.lancamentos_avulso` — 1 ocorrência(s)
  - `supabase/migrations/123_lancamento_avulso_local_estoque.sql:5`

---

## liga_tipo_ouro

> Mapeia qual liga usar para cada tipo de Ouro 18k. teor_default = teor alvo da fundição (ex: 0.75 para 18k).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.liga_tipo_ouro_id_seq'::regclass)` | — |
| 2 | `tipo_18k_insumo_id` | integer | — | — | — |
| 3 | `liga_insumo_id` | integer | — | — | — |
| 4 | `nome` | character varying(100) | — | — | — |
| 5 | `teor_default` | numeric(5,4) | — | `0.7500` | — |
| 6 | `ativo` | boolean | ✓ | `true` | — |

### Chaves

- **PRIMARY KEY** `liga_tipo_ouro_pkey` — (`id`)
- **UNIQUE** `liga_tipo_ouro_tipo_18k_insumo_id_key` — (`tipo_18k_insumo_id`)

### Foreign Keys (saída)

- `liga_insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `tipo_18k_insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `liga_tipo_ouro_tipo_18k_insumo_id_key` — `CREATE UNIQUE INDEX liga_tipo_ouro_tipo_18k_insumo_id_key ON alissonerp.liga_tipo_ouro USING btree (tipo_18k_insumo_id)`

_Sem referência identificada no código._

---

## ligacoes

> Ligação: transforma Ouro 24k fino em Ouro 18k adicionando liga metálica italiana.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.ligacoes_id_seq'::regclass)` | — |
| 2 | `status` | character varying(20) | — | `'em_processo'::character varying` | — |
| 3 | `tipo_18k_insumo_id` | integer | — | — | — |
| 4 | `tipo_18k_nome` | character varying(100) | — | — | — |
| 5 | `liga_insumo_id` | integer | — | — | — |
| 6 | `liga_nome` | character varying(100) | — | — | — |
| 7 | `peso_24k` | numeric(10,3) | — | — | — |
| 8 | `teor` | numeric(5,4) | — | — | — |
| 9 | `peso_liga_calculado` | numeric(10,3) | — | — | — |
| 10 | `peso_18k_esperado` | numeric(10,3) | — | — | — |
| 11 | `foto_envio` | text | ✓ | — | — |
| 12 | `observacao_envio` | text | ✓ | — | — |
| 13 | `data_envio` | timestamp with time zone | ✓ | `now()` | — |
| 14 | `criado_por` | uuid | — | — | — |
| 15 | `peso_18k_real` | numeric(10,3) | ✓ | — | — |
| 16 | `perda_processo` | numeric(10,3) | ✓ | — | — |
| 17 | `perda_percentual` | numeric(5,2) | ✓ | — | — |
| 18 | `foto_resultado` | text | ✓ | — | — |
| 19 | `observacao_resultado` | text | ✓ | — | — |
| 20 | `data_conclusao` | timestamp with time zone | ✓ | — | — |
| 21 | `concluido_por` | uuid | ✓ | — | — |
| 22 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 23 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 24 | `pureza` | numeric(5,2) | — | `100.00` | Pureza do ouro de entrada (100=24k puro, 75=18k, 58.3=14k) |

### Chaves

- **PRIMARY KEY** `ligacoes_pkey` — (`id`)

### Foreign Keys (saída)

- `liga_insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `tipo_18k_insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_ligacoes_data` — `CREATE INDEX idx_ligacoes_data ON alissonerp.ligacoes USING btree (data_envio)`
- `idx_ligacoes_status` — `CREATE INDEX idx_ligacoes_status ON alissonerp.ligacoes USING btree (status)`

**Uso no código:**
- `alissonerp.ligacoes` — 14 ocorrência(s)
  - `src/app/(dashboard)/purificacao/LigacaoTab.tsx:118`
  - `src/app/(dashboard)/purificacao/LigacaoTab.tsx:125`
  - `src/app/(dashboard)/purificacao/LigacaoTab.tsx:137`
  - `src/app/(dashboard)/purificacao/LigacaoTab.tsx:152`
  - `src/app/(dashboard)/purificacao/LigacaoTab.tsx:153`

---

## locais_estoque

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.locais_estoque_id_seq'::regclass)` | — |
| 2 | `nome` | character varying(100) | — | — | — |
| 3 | `ativo` | boolean | — | `true` | — |
| 4 | `created_at` | timestamp with time zone | — | `now()` | — |
| 5 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `locais_estoque_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.compras.local_destino_id` (constraint `compras_local_destino_id_fkey`)
- `alissonerp.depositos.local_estoque_id` (constraint `depositos_local_estoque_id_fkey`)
- `alissonerp.empresas_emitentes.local_estoque_id` (constraint `empresas_emitentes_local_estoque_id_fkey`)
- `alissonerp.inventarios_comercial.local_estoque_id` (constraint `inventarios_comercial_local_estoque_id_fkey`)
- `alissonerp.lancamentos_avulso.local_estoque_id` (constraint `lancamentos_avulso_local_estoque_id_fkey`)
- `alissonerp.movimentacoes_estoque.local_estoque_id` (constraint `movimentacoes_estoque_local_estoque_id_fkey`)
- `alissonerp.movimentacoes_estoque_comercial.local_estoque_id` (constraint `movimentacoes_estoque_comercial_local_estoque_id_fkey`)
- `alissonerp.reservas_estoque_comercial.local_estoque_id` (constraint `reservas_estoque_comercial_local_estoque_id_fkey`)
- `alissonerp.transferencias_estoque_comercial.local_destino_id` (constraint `transferencias_estoque_comercial_local_destino_id_fkey`)
- `alissonerp.transferencias_estoque_comercial.local_origem_id` (constraint `transferencias_estoque_comercial_local_origem_id_fkey`)

**Uso no código:**
- `alissonerp.locais_estoque` — 17 ocorrência(s)
  - `src/app/api/compras/route.ts:6`
  - `scripts/check_schemas.mjs:4`
  - `supabase/migrations/094_locais_estoque.sql:1`
  - `supabase/migrations/094_locais_estoque.sql:5`
  - `supabase/migrations/140_estoque_comercial_v2.sql:11`

---

## markup_alteracoes

> Fila de aprovação de mudanças de markup (ouro ou pedra). Criado quando usuário simula e envia pra aprovação. Aprovação real e aplicação são implementadas em P3.3.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.markup_alteracoes_id_seq'::regclass)` | — |
| 2 | `tipo` | character varying(20) | — | — | — |
| 3 | `faixa_id` | integer | — | — | — |
| 4 | `faixa_nome` | character varying(100) | — | — | — |
| 5 | `markup_anterior` | numeric(10,4) | — | — | — |
| 6 | `markup_novo` | numeric(10,4) | — | — | — |
| 7 | `produtos_afetados` | integer | ✓ | `0` | — |
| 8 | `variacao_media` | numeric(10,2) | ✓ | `0` | — |
| 9 | `variacao_min` | numeric(10,2) | ✓ | `0` | — |
| 10 | `variacao_max` | numeric(10,2) | ✓ | `0` | — |
| 11 | `simulacao_json` | jsonb | ✓ | — | — |
| 12 | `status` | character varying(20) | ✓ | `'pendente'::character varying` | — |
| 13 | `criado_por` | uuid | — | — | — |
| 14 | `data_criacao` | timestamp with time zone | ✓ | `now()` | — |
| 15 | `aprovado_por` | uuid | ✓ | — | — |
| 16 | `data_aprovacao` | timestamp with time zone | ✓ | — | — |
| 17 | `motivo_rejeicao` | text | ✓ | — | — |
| 18 | `aplicado` | boolean | ✓ | `false` | — |
| 19 | `data_aplicacao` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `markup_alteracoes_pkey` — (`id`)

### CHECK constraints

- `markup_alteracoes_markup_check` — `CHECK (((markup_novo > (0)::numeric) AND (markup_anterior > (0)::numeric)))`
- `markup_alteracoes_status_check` — `CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'aprovado'::character varying, 'rejeitado'::character varying])::text[])))`
- `markup_alteracoes_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['ouro'::character varying, 'pedra'::character varying])::text[])))`

### Índices

- `idx_markup_alteracoes_criado_por` — `CREATE INDEX idx_markup_alteracoes_criado_por ON alissonerp.markup_alteracoes USING btree (criado_por)`
- `idx_markup_alteracoes_status` — `CREATE INDEX idx_markup_alteracoes_status ON alissonerp.markup_alteracoes USING btree (status)`

**Uso no código:**
- `alissonerp.markup_alteracoes` — 8 ocorrência(s)
  - `scripts/backup_pre_golive.mjs:36`
  - `scripts/pre_migration_check.mjs:116`
  - `scripts/pre_reset_check.mjs:22`
  - `scripts/pre_reset_check.mjs:34`
  - `scripts/pre_reset_check.mjs:76`

---

## markup_pedras

> Faixas de markup por tamanho de pedra.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.markup_pedras_id_seq'::regclass)` | — |
| 2 | `nome` | character varying(100) | — | — | — |
| 3 | `tamanho_min` | numeric(10,4) | — | — | — |
| 4 | `tamanho_max` | numeric(10,4) | — | — | — |
| 5 | `unidade` | character varying(10) | ✓ | `'ct'::character varying` | — |
| 6 | `markup` | numeric(10,4) | — | — | Multiplicador aplicado sobre custo de compra. Ex: markup=2.5 → custo R$100 → preço R$250. |
| 7 | `ativo` | boolean | ✓ | `true` | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 10 | `created_by` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `markup_pedras_pkey` — (`id`)

### CHECK constraints

- `markup_pedras_range_check` — `CHECK ((tamanho_max > tamanho_min))`
- `markup_pedras_unidade_check` — `CHECK (((unidade)::text = ANY ((ARRAY['ct'::character varying, 'mm'::character varying])::text[])))`

### Índices

- `idx_markup_pedras_faixa` — `CREATE INDEX idx_markup_pedras_faixa ON alissonerp.markup_pedras USING btree (tamanho_min, tamanho_max) WHERE (ativo = true)`

**Uso no código:**
- `alissonerp.markup_pedras` — 10 ocorrência(s)
  - `src/app/api/produtos/[id]/route.ts:261`
  - `src/app/api/produtos/[id]/route.ts:268`
  - `src/components/produtos/ProdutoDrawer.tsx:525`
  - `scripts/pre_reset_check.mjs:52`
  - `scripts/validar_golive.mjs:73`

---

## metas_vendedoras

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.metas_vendedoras_id_seq'::regclass)` | — |
| 2 | `vendedor_id` | bigint | — | — | — |
| 3 | `mes` | integer | — | — | — |
| 4 | `ano` | integer | — | — | — |
| 5 | `meta_valor` | numeric(12,2) | — | — | — |
| 6 | `meta_quantidade` | integer | ✓ | — | — |
| 7 | `created_by` | uuid | ✓ | — | — |
| 8 | `created_at` | timestamp with time zone | — | `now()` | — |
| 9 | `meta_prata` | numeric(12,2) | ✓ | — | — |
| 10 | `meta_ouro` | numeric(12,2) | ✓ | — | — |
| 11 | `meta_diamante` | numeric(12,2) | ✓ | — | — |
| 12 | `horario_inicio` | time | ✓ | `'09:00:00'::time without time zone` | — |
| 13 | `horas_por_dia` | integer | ✓ | `8` | — |
| 14 | `dias_nao_trabalhados` | _int4 | ✓ | `'{}'::integer[]` | — |

### Chaves

- **PRIMARY KEY** `metas_vendedoras_pkey` — (`id`)
- **UNIQUE** `metas_vendedoras_vendedor_id_mes_ano_key` — (`vendedor_id`, `mes`, `ano`)

### CHECK constraints

- `metas_vendedoras_mes_check` — `CHECK (((mes >= 1) AND (mes <= 12)))`

### Índices

- `metas_vendedoras_vendedor_id_mes_ano_key` — `CREATE UNIQUE INDEX metas_vendedoras_vendedor_id_mes_ano_key ON alissonerp.metas_vendedoras USING btree (vendedor_id, mes, ano)`

**Uso no código:**
- `alissonerp.metas_vendedoras` — 1 ocorrência(s)
  - `scripts/apply_139.mjs:20`

---

## movimentacoes_estoque

**Aprox. linhas:** 1204

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('alissonerp.movimentacoes_estoque_id_seq'::regclass)` | — |
| 2 | `entrada` | float4 | ✓ | `0` | — |
| 3 | `saida` | float4 | ✓ | `0` | — |
| 4 | `insumo_id` | integer | — | — | — |
| 5 | `deposito_id` | integer | ✓ | — | — |
| 6 | `setor_id` | integer | ✓ | — | — |
| 7 | `ordem_id` | integer | ✓ | — | — |
| 8 | `marcador` | enum_marcador_estoque | ✓ | — | — |
| 9 | `obs` | text | ✓ | — | — |
| 10 | `data_hora` | timestamp with time zone | ✓ | `now()` | — |
| 11 | `valor_total` | numeric(12,2) | ✓ | — | — |
| 12 | `preco_compra` | numeric(12,2) | ✓ | — | — |
| 13 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 14 | `created_by` | uuid | ✓ | — | — |
| 15 | `local_estoque_id` | integer | — | — | — |

### Chaves

- **PRIMARY KEY** `movimentacoes_estoque_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `local_estoque_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `setor_id` → `alissonerp.setores.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.apontamentos_servico.movimentacao_id` (constraint `apontamentos_servico_movimentacao_id_fkey`)

### Índices

- `idx_mov_data` — `CREATE INDEX idx_mov_data ON alissonerp.movimentacoes_estoque USING btree (data_hora)`
- `idx_mov_dep_ins` — `CREATE INDEX idx_mov_dep_ins ON alissonerp.movimentacoes_estoque USING btree (deposito_id, insumo_id)`
- `idx_mov_deposito` — `CREATE INDEX idx_mov_deposito ON alissonerp.movimentacoes_estoque USING btree (deposito_id)`
- `idx_mov_insumo` — `CREATE INDEX idx_mov_insumo ON alissonerp.movimentacoes_estoque USING btree (insumo_id)`
- `idx_mov_marcador` — `CREATE INDEX idx_mov_marcador ON alissonerp.movimentacoes_estoque USING btree (marcador)`
- `idx_mov_ordem` — `CREATE INDEX idx_mov_ordem ON alissonerp.movimentacoes_estoque USING btree (ordem_id)`
- `idx_movimentacoes_local_estoque` — `CREATE INDEX idx_movimentacoes_local_estoque ON alissonerp.movimentacoes_estoque USING btree (local_estoque_id)`

### Triggers

- `trg_audit_mov_estoque` — AFTER INSERT → `alissonerp.fn_audit_log` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `admin_full_mov_estoque` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - `gerente_fab_estoque` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`

**Uso no código:**
- `alissonerp.movimentacoes_estoque` — 18 ocorrência(s)
  - `src/app/api/pcp/transferir/route.ts:14`
  - `scripts/backup_pre_golive.mjs:33`
  - `scripts/diag_estoque.js:30`
  - `scripts/diag_estoque.js:33`
  - `scripts/diag_estoque2.js:25`

---

## movimentacoes_estoque_comercial

**Aprox. linhas:** 1133

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.movimentacoes_estoque_comercial_id_seq'::regclass)` | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `tipo` | character varying(10) | — | — | — |
| 4 | `quantidade` | integer | — | — | — |
| 5 | `motivo` | character varying(50) | — | — | — |
| 6 | `referencia_id` | integer | ✓ | — | — |
| 7 | `referencia_tipo` | character varying(30) | ✓ | — | — |
| 8 | `observacao` | text | ✓ | — | — |
| 9 | `created_by` | uuid | ✓ | — | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |
| 11 | `devolucao_id` | integer | ✓ | — | — |
| 12 | `status` | character varying(20) | — | `'efetivado'::character varying` | — |
| 13 | `local_estoque_id` | integer | — | — | Local físico onde a movimentação ocorreu (1=Fábrica, 2=Loja, 3=Service, 4=Cofre). NOT NULL desde a Fase 6 da centralização (migration 187, 2026-04-27). |
| 14 | `estorno_de_id` | integer | ✓ | — | — |
| 15 | `estornado_por_id` | integer | ✓ | — | — |
| 16 | `ordem_id` | integer | ✓ | — | — |
| 17 | `protocolo_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `movimentacoes_estoque_comercial_pkey` — (`id`)

### Foreign Keys (saída)

- `devolucao_id` → `alissonerp.devolucoes_venda.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `estornado_por_id` → `alissonerp.movimentacoes_estoque_comercial.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `estorno_de_id` → `alissonerp.movimentacoes_estoque_comercial.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `local_estoque_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.itens_inventario_comercial.movimento_ajuste_id` (constraint `itens_inventario_comercial_movimento_ajuste_id_fkey`)
- `alissonerp.movimentacoes_estoque_comercial.estornado_por_id` (constraint `movimentacoes_estoque_comercial_estornado_por_id_fkey`)
- `alissonerp.movimentacoes_estoque_comercial.estorno_de_id` (constraint `movimentacoes_estoque_comercial_estorno_de_id_fkey`)
- `alissonerp.reservas_estoque_comercial.movimento_id` (constraint `reservas_estoque_comercial_movimento_id_fkey`)
- `alissonerp.transferencias_estoque_comercial.movimento_entrada_id` (constraint `transferencias_estoque_comercial_movimento_entrada_id_fkey`)
- `alissonerp.transferencias_estoque_comercial.movimento_saida_id` (constraint `transferencias_estoque_comercial_movimento_saida_id_fkey`)

### CHECK constraints

- `chk_mov_ec_status` — `CHECK (((status)::text = ANY ((ARRAY['efetivado'::character varying, 'estornado'::character varying])::text[])))`
- `movimentacoes_estoque_comercial_quantidade_check` — `CHECK ((quantidade > 0))`
- `movimentacoes_estoque_comercial_status_check` — `CHECK (((status)::text = ANY ((ARRAY['efetivado'::character varying, 'estornado'::character varying])::text[])))`
- `movimentacoes_estoque_comercial_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['entrada'::character varying, 'saida'::character varying])::text[])))`

### Índices

- `idx_mov_ec_created_at` — `CREATE INDEX idx_mov_ec_created_at ON alissonerp.movimentacoes_estoque_comercial USING btree (created_at DESC)`
- `idx_mov_ec_devolucao` — `CREATE INDEX idx_mov_ec_devolucao ON alissonerp.movimentacoes_estoque_comercial USING btree (devolucao_id) WHERE (devolucao_id IS NOT NULL)`
- `idx_mov_ec_estorno_de` — `CREATE INDEX idx_mov_ec_estorno_de ON alissonerp.movimentacoes_estoque_comercial USING btree (estorno_de_id) WHERE (estorno_de_id IS NOT NULL)`
- `idx_mov_ec_local` — `CREATE INDEX idx_mov_ec_local ON alissonerp.movimentacoes_estoque_comercial USING btree (local_estoque_id)`
- `idx_mov_ec_produto_id` — `CREATE INDEX idx_mov_ec_produto_id ON alissonerp.movimentacoes_estoque_comercial USING btree (produto_id)`
- `idx_mov_ec_referencia` — `CREATE INDEX idx_mov_ec_referencia ON alissonerp.movimentacoes_estoque_comercial USING btree (referencia_tipo, referencia_id)`
- `idx_mov_ec_status` — `CREATE INDEX idx_mov_ec_status ON alissonerp.movimentacoes_estoque_comercial USING btree (status)`

**Uso no código:**
- `alissonerp.movimentacoes_estoque_comercial` — 48 ocorrência(s) _(amostra abaixo)_
  - `src/app/api/estoque-comercial/movimentos/route.ts:47`
  - `src/lib/devolucoes.ts:12`
  - `scripts/debug_concluir.mjs:7`
  - `scripts/debug_concluir.mjs:10`
  - `supabase/migrations/140_estoque_comercial_v2.sql:21`

---

## mp_point_devices

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.mp_point_devices_id_seq'::regclass)` | — |
| 2 | `device_id` | text | — | — | — |
| 3 | `nome_legivel` | text | — | — | — |
| 4 | `store_id` | text | ✓ | — | — |
| 5 | `pos_id` | text | ✓ | — | — |
| 6 | `operating_mode` | text | ✓ | — | — |
| 7 | `ativo` | boolean | — | `true` | — |
| 8 | `loja` | text | ✓ | — | — |
| 9 | `last_sync_at` | timestamp with time zone | ✓ | — | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |
| 11 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 12 | `vendedor_id` | bigint | ✓ | — | — |
| 13 | `is_reserva` | boolean | — | `false` | — |

### Chaves

- **UNIQUE** `mp_point_devices_device_id_key` — (`device_id`)
- **PRIMARY KEY** `mp_point_devices_pkey` — (`id`)

### Índices

- `idx_mp_point_devices_ativo` — `CREATE INDEX idx_mp_point_devices_ativo ON alissonerp.mp_point_devices USING btree (ativo) WHERE (ativo = true)`
- `mp_point_devices_device_id_key` — `CREATE UNIQUE INDEX mp_point_devices_device_id_key ON alissonerp.mp_point_devices USING btree (device_id)`

### Triggers

- `trg_updated_at_mp_point_devices` — BEFORE UPDATE → `alissonerp.fn_updated_at_mp_point_devices` 

**Uso no código:**
- `alissonerp.mp_point_devices` — 9 ocorrência(s)
  - `src/app/api/mercado-pago/devices/route.ts:78`
  - `scripts/apply_135.mjs:3`
  - `scripts/apply_135.mjs:33`
  - `scripts/apply_135.mjs:49`
  - `scripts/apply_135.mjs:115`

---

## notas_fiscais

> Notas fiscais (55 + 65). Polimorfica via (origem_tabela, origem_id).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.notas_fiscais_id_seq'::regclass)` | — |
| 2 | `modelo` | smallint | — | — | 55 = NF-e \| 65 = NFC-e |
| 3 | `serie` | smallint | — | — | — |
| 4 | `numero` | integer | — | — | — |
| 5 | `chave_44` | character varying(44) | ✓ | — | Chave de acesso SEFAZ (NULL ate autorizacao) |
| 6 | `empresa_emitente_id` | integer | — | — | — |
| 7 | `tipo_operacao` | character varying(20) | — | — | — |
| 8 | `origem_tabela` | character varying(50) | — | — | vendas_erp \| transferencias_estoque_comercial \| devolucoes_venda |
| 9 | `origem_id` | bigint | — | — | — |
| 10 | `cliente_contato_id` | bigint | ✓ | — | Ref logica a public.contatos.id_contato (NULL em remessa interna) |
| 11 | `natureza_operacao` | character varying(60) | — | — | — |
| 12 | `cfop` | character varying(4) | ✓ | — | — |
| 13 | `valor_produtos` | numeric(15,2) | — | `0` | — |
| 14 | `valor_desconto` | numeric(15,2) | — | `0` | — |
| 15 | `valor_frete` | numeric(15,2) | — | `0` | — |
| 16 | `valor_total` | numeric(15,2) | — | `0` | — |
| 17 | `status` | character varying(20) | — | `'rascunho'::character varying` | — |
| 18 | `focus_ref` | character varying(80) | ✓ | — | Idempotency key enviado ao Focus NFe (evita dupla emissao em retry) |
| 19 | `xml_assinado` | text | ✓ | — | — |
| 20 | `xml_protocolo` | text | ✓ | — | — |
| 21 | `pdf_danfe_url` | text | ✓ | — | — |
| 22 | `codigo_sefaz` | character varying(10) | ✓ | — | — |
| 23 | `mensagem_sefaz` | text | ✓ | — | — |
| 24 | `emitida_por_user_id` | uuid | ✓ | — | Ref auth.users.id (sem FK fisica pois auth eh gerenciado pelo Supabase) |
| 25 | `ambiente` | character varying(15) | — | — | Snapshot do ambiente em que foi emitida (homolog vs prod) |
| 26 | `created_at` | timestamp with time zone | — | `now()` | — |
| 27 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `notas_fiscais_chave_44_key` — (`chave_44`)
- **UNIQUE** `notas_fiscais_focus_ref_key` — (`focus_ref`)
- **PRIMARY KEY** `notas_fiscais_pkey` — (`id`)

### Foreign Keys (saída)

- `empresa_emitente_id` → `alissonerp.empresas_emitentes.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.devolucoes_venda.nota_fiscal_devolucao_id` (constraint `fk_devolucoes_nota_fiscal`)
- `alissonerp.notas_fiscais_eventos.nota_fiscal_id` (constraint `notas_fiscais_eventos_nota_fiscal_id_fkey`)
- `alissonerp.notas_fiscais_itens.nota_fiscal_id` (constraint `notas_fiscais_itens_nota_fiscal_id_fkey`)
- `alissonerp.vendas_erp.nota_fiscal_id` (constraint `fk_vendas_erp_nota_fiscal`)

### CHECK constraints

- `notas_fiscais_ambiente_check` — `CHECK (((ambiente)::text = ANY ((ARRAY['homologacao'::character varying, 'producao'::character varying])::text[])))`
- `notas_fiscais_modelo_check` — `CHECK ((modelo = ANY (ARRAY[55, 65])))`
- `notas_fiscais_status_check` — `CHECK (((status)::text = ANY ((ARRAY['rascunho'::character varying, 'processando'::character varying, 'autorizada'::character varying, 'rejeitada'::character varying, 'cancelada'::character varying, 'denegada'::character varying, 'inutilizada'::ch...`
- `notas_fiscais_tipo_operacao_check` — `CHECK (((tipo_operacao)::text = ANY ((ARRAY['venda'::character varying, 'remessa'::character varying, 'devolucao'::character varying, 'conserto'::character varying, 'retorno'::character varying, 'outro'::character varying])::text[])))`

### Índices

- `idx_notas_fiscais_cliente` — `CREATE INDEX idx_notas_fiscais_cliente ON alissonerp.notas_fiscais USING btree (cliente_contato_id) WHERE (cliente_contato_id IS NOT NULL)`
- `idx_notas_fiscais_created` — `CREATE INDEX idx_notas_fiscais_created ON alissonerp.notas_fiscais USING btree (created_at DESC)`
- `idx_notas_fiscais_empresa_modelo_num` — `CREATE INDEX idx_notas_fiscais_empresa_modelo_num ON alissonerp.notas_fiscais USING btree (empresa_emitente_id, modelo, numero DESC)`
- `idx_notas_fiscais_origem` — `CREATE INDEX idx_notas_fiscais_origem ON alissonerp.notas_fiscais USING btree (origem_tabela, origem_id)`
- `idx_notas_fiscais_status` — `CREATE INDEX idx_notas_fiscais_status ON alissonerp.notas_fiscais USING btree (status)`
- `notas_fiscais_chave_44_key` — `CREATE UNIQUE INDEX notas_fiscais_chave_44_key ON alissonerp.notas_fiscais USING btree (chave_44)`
- `notas_fiscais_focus_ref_key` — `CREATE UNIQUE INDEX notas_fiscais_focus_ref_key ON alissonerp.notas_fiscais USING btree (focus_ref)`
- `uq_notas_fiscais_numeracao` — `CREATE UNIQUE INDEX uq_notas_fiscais_numeracao ON alissonerp.notas_fiscais USING btree (empresa_emitente_id, modelo, serie, numero)`

**Uso no código:**
- `alissonerp.notas_fiscais` — 8 ocorrência(s)
  - `src/app/api/fiscal/notas/[id]/cancelar/route.ts:28`
  - `scripts/apply_145_150_fiscal.mjs:13`
  - `scripts/apply_145_150_fiscal.mjs:46`
  - `scripts/apply_145_150_fiscal.mjs:74`
  - `supabase/migrations/148_fiscal_add_columns.sql:10`

---

## notas_fiscais_eventos

> Eventos pos-emissao: cancelamento, CC-e, inutilizacao, manifestacao.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.notas_fiscais_eventos_id_seq'::regclass)` | — |
| 2 | `nota_fiscal_id` | integer | — | — | — |
| 3 | `tipo` | character varying(20) | — | — | — |
| 4 | `sequencia` | smallint | — | `1` | Sequencia do evento na SEFAZ (CC-e pode ter varias) |
| 5 | `justificativa` | text | ✓ | — | Obrigatoria em cancelamento (min 15 chars) e CC-e |
| 6 | `xml_evento` | text | ✓ | — | — |
| 7 | `xml_protocolo` | text | ✓ | — | — |
| 8 | `status` | character varying(20) | — | `'processando'::character varying` | — |
| 9 | `codigo_sefaz` | character varying(10) | ✓ | — | — |
| 10 | `mensagem_sefaz` | text | ✓ | — | — |
| 11 | `criado_por_user_id` | uuid | ✓ | — | — |
| 12 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `notas_fiscais_eventos_pkey` — (`id`)

### Foreign Keys (saída)

- `nota_fiscal_id` → `alissonerp.notas_fiscais.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `notas_fiscais_eventos_status_check` — `CHECK (((status)::text = ANY ((ARRAY['processando'::character varying, 'registrado'::character varying, 'rejeitado'::character varying])::text[])))`
- `notas_fiscais_eventos_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['cancelamento'::character varying, 'cce'::character varying, 'inutilizacao'::character varying, 'manifestacao'::character varying])::text[])))`

### Índices

- `idx_notas_eventos_created` — `CREATE INDEX idx_notas_eventos_created ON alissonerp.notas_fiscais_eventos USING btree (created_at DESC)`
- `idx_notas_eventos_nota_tipo` — `CREATE INDEX idx_notas_eventos_nota_tipo ON alissonerp.notas_fiscais_eventos USING btree (nota_fiscal_id, tipo, sequencia)`

**Uso no código:**
- `alissonerp.notas_fiscais_eventos` — 4 ocorrência(s)
  - `src/app/api/fiscal/notas/[id]/cce/route.ts:28`
  - `scripts/apply_145_150_fiscal.mjs:46`
  - `supabase/migrations/150_fiscal_notas_fiscais_itens_eventos.sql:10`
  - `supabase/migrations/150_fiscal_notas_fiscais_itens_eventos.sql:67`

---

## notas_fiscais_itens

> Snapshot fiscal por item da nota (imutavel apos autorizacao).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.notas_fiscais_itens_id_seq'::regclass)` | — |
| 2 | `nota_fiscal_id` | integer | — | — | — |
| 3 | `numero_item` | smallint | — | — | — |
| 4 | `produto_id` | bigint | ✓ | — | Ref logica a public.produtos.id_produto |
| 5 | `codigo_produto` | character varying(60) | ✓ | — | — |
| 6 | `descricao` | character varying(120) | — | — | — |
| 7 | `ncm` | character varying(8) | ✓ | — | — |
| 8 | `cest` | character varying(7) | ✓ | — | — |
| 9 | `cfop` | character varying(4) | — | — | — |
| 10 | `unidade` | character varying(6) | — | — | — |
| 11 | `ean` | character varying(14) | ✓ | — | — |
| 12 | `origem` | smallint | ✓ | — | — |
| 13 | `quantidade` | numeric(15,4) | — | — | — |
| 14 | `valor_unitario` | numeric(15,4) | — | — | — |
| 15 | `valor_total` | numeric(15,2) | — | — | — |
| 16 | `valor_desconto` | numeric(15,2) | — | `0` | — |
| 17 | `csosn` | character varying(4) | ✓ | — | — |
| 18 | `cst_icms` | character varying(3) | ✓ | — | — |
| 19 | `vbc_icms` | numeric(15,2) | — | `0` | — |
| 20 | `aliq_icms` | numeric(5,2) | — | `0` | — |
| 21 | `valor_icms` | numeric(15,2) | — | `0` | — |
| 22 | `vbc_icms_st` | numeric(15,2) | — | `0` | — |
| 23 | `valor_icms_st` | numeric(15,2) | — | `0` | — |
| 24 | `valor_aprox_tributos` | numeric(15,2) | — | `0` | IBPT (Lei 12.741) — valor aproximado de tributos por item |

### Chaves

- **PRIMARY KEY** `notas_fiscais_itens_pkey` — (`id`)

### Foreign Keys (saída)

- `nota_fiscal_id` → `alissonerp.notas_fiscais.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_notas_itens_produto` — `CREATE INDEX idx_notas_itens_produto ON alissonerp.notas_fiscais_itens USING btree (produto_id) WHERE (produto_id IS NOT NULL)`
- `uq_notas_itens_numero` — `CREATE UNIQUE INDEX uq_notas_itens_numero ON alissonerp.notas_fiscais_itens USING btree (nota_fiscal_id, numero_item)`

**Uso no código:**
- `alissonerp.notas_fiscais_itens` — 4 ocorrência(s)
  - `scripts/apply_145_150_fiscal.mjs:14`
  - `scripts/apply_145_150_fiscal.mjs:46`
  - `supabase/migrations/150_fiscal_notas_fiscais_itens_eventos.sql:6`
  - `supabase/migrations/150_fiscal_notas_fiscais_itens_eventos.sql:26`

---

## notificacoes

**Aprox. linhas:** 589

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.notificacoes_id_seq'::regclass)` | — |
| 2 | `usuario_id` | uuid | — | — | — |
| 3 | `tipo` | character varying(50) | — | `'mencao'::character varying` | — |
| 4 | `titulo` | character varying(200) | — | — | — |
| 5 | `mensagem` | text | ✓ | — | — |
| 6 | `lida` | boolean | ✓ | `false` | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `link` | character varying(200) | ✓ | — | — |
| 10 | `ordem_id` | integer | ✓ | — | — |
| 11 | `comentario_id` | integer | ✓ | — | — |
| 12 | `remetente_id` | uuid | ✓ | — | — |
| 13 | `lida_em` | timestamp with time zone | ✓ | — | — |
| 14 | `aguardando_resposta` | boolean | ✓ | `false` | — |
| 15 | `respondida_em` | timestamp with time zone | ✓ | — | — |
| 16 | `venda_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `notificacoes_pkey` — (`id`)

### Foreign Keys (saída)

- `comentario_id` → `alissonerp.comentarios_ordem.id` (UPDATE NO ACTION, DELETE SET NULL)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)
- `usuario_id` → `alissonerp.usuarios.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `venda_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE SET NULL)

### Índices

- `idx_notif_aguardando_resposta` — `CREATE INDEX idx_notif_aguardando_resposta ON alissonerp.notificacoes USING btree (usuario_id, created_at DESC) WHERE (aguardando_resposta = true)`
- `idx_notif_usuario_id` — `CREATE INDEX idx_notif_usuario_id ON alissonerp.notificacoes USING btree (usuario_id) WHERE (usuario_id IS NOT NULL)`
- `idx_notificacoes_created` — `CREATE INDEX idx_notificacoes_created ON alissonerp.notificacoes USING btree (created_at DESC)`
- `idx_notificacoes_lida` — `CREATE INDEX idx_notificacoes_lida ON alissonerp.notificacoes USING btree (usuario_id, lida) WHERE (lida = false)`
- `idx_notificacoes_usuario` — `CREATE INDEX idx_notificacoes_usuario ON alissonerp.notificacoes USING btree (usuario_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `notificacoes_admin` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'desenvolvedor'::text]))`
    WITH CHECK: `((alissonerp.fn_user_role())::text = ANY (ARRAY['admin'::text, 'desenvolvedor'::text]))`
  - `notificacoes_insert` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `true`
  - `notificacoes_select` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(usuario_id = auth.uid())`
  - `notificacoes_update` (UPDATE, PERMISSIVE) roles=authenticated
    USING: `(usuario_id = auth.uid())`

**Uso no código:**
- `alissonerp.notificacoes` — 56 ocorrência(s) _(amostra abaixo)_
  - `src/app/api/notificacoes/adiar/route.ts:5`
  - `src/app/api/notificacoes/contagem/route.ts:5`
  - `src/app/api/notificacoes/ler-todas/route.ts:5`
  - `src/app/api/notificacoes/pendentes-resposta/route.ts:5`
  - `src/app/api/notificacoes/route.ts:5`

---

## orcamento_fichas_tecnicas

**Aprox. linhas:** 41

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.orcamento_fichas_tecnicas_id_seq'::regclass)` | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `modelo` | character varying(50) | ✓ | — | — |
| 4 | `aro_numeracao` | character varying(20) | ✓ | — | — |
| 5 | `largura` | numeric(5,2) | ✓ | — | — |
| 6 | `espessura` | numeric(5,2) | ✓ | — | — |
| 7 | `peso_estimado` | numeric(8,3) | ✓ | — | — |
| 8 | `tipo_fonte` | character varying(20) | ✓ | — | — |
| 9 | `texto` | character varying(200) | ✓ | — | — |
| 10 | `qtd_pedras` | integer | ✓ | — | — |
| 11 | `tamanho_pedra` | numeric(4,2) | ✓ | — | — |
| 12 | `tipo_aplicacao_pedra` | character varying(30) | ✓ | — | — |
| 13 | `perfil` | character varying(30) | ✓ | — | — |
| 14 | `diametro` | numeric(6,2) | ✓ | — | — |
| 15 | `densidade_ouro` | numeric(6,2) | ✓ | — | — |
| 16 | `cor_metal` | character varying(30) | ✓ | — | — |
| 17 | `profundidade_concava` | numeric(4,2) | ✓ | — | — |
| 18 | `friso_lado` | character varying(10) | ✓ | — | — |
| 19 | `friso_largura` | numeric(4,2) | ✓ | — | — |
| 20 | `friso_profundidade` | numeric(4,2) | ✓ | — | — |
| 21 | `friso_offset` | numeric(4,2) | ✓ | — | — |
| 22 | `canal_largura` | numeric(4,2) | ✓ | — | — |
| 23 | `canal_borda_altura` | numeric(4,2) | ✓ | — | — |
| 24 | `chanfro_tamanho` | numeric(4,2) | ✓ | — | — |
| 25 | `dome_porcentagem` | integer | ✓ | — | — |
| 26 | `pedra_fileiras` | integer | ✓ | — | — |
| 27 | `pedra_drill` | boolean | ✓ | `false` | — |
| 28 | `pedra_meia_lua` | boolean | ✓ | `false` | — |
| 29 | `pedra_volta_completa` | boolean | ✓ | `false` | — |
| 30 | `pedras_detalhadas` | jsonb | — | `'[]'::jsonb` | — |
| 31 | `has_friso` | boolean | ✓ | `false` | Se true, aliança tem friso (groove) aplicado sobre o perfil base |
| 32 | `friso_tipo` | character varying(20) | ✓ | — | Tipo de friso: lateral (um lado), centro (centralizado), duplo (ambos os lados) |
| 33 | `friso_kind` | character varying(10) | ✓ | `'friso'::character varying` | Variante: friso (sulco largo) ou risco (sulco fino ~0.1mm) |
| 34 | `tipo_pedra` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `orcamento_fichas_tecnicas_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.orcamentos.ficha_tecnica_2_id` (constraint `orcamentos_ficha_tecnica_2_id_fkey`)
- `alissonerp.orcamentos.ficha_tecnica_id` (constraint `orcamentos_ficha_tecnica_id_fkey`)

**Uso no código:**
- `alissonerp.orcamento_fichas_tecnicas` — 5 ocorrência(s)
  - `src/app/(dashboard)/orcamento/validations.ts:269`
  - `scripts/apply_140.mjs:7`
  - `scripts/apply_140.mjs:11`
  - `scripts/apply_140.mjs:30`
  - `scripts/apply_140.mjs:40`

---

## orcamentos

**Aprox. linhas:** 32

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.orcamentos_id_seq'::regclass)` | — |
| 2 | `created_at` | timestamp with time zone | — | `now()` | — |
| 3 | `numero_orcamento` | character varying(30) | — | — | — |
| 4 | `tipo` | character varying(20) | — | `'alianca'::character varying` | — |
| 5 | `vendedor_id` | integer | ✓ | — | — |
| 6 | `usuario_id` | uuid | ✓ | — | — |
| 7 | `nome_cliente` | character varying(200) | — | — | — |
| 8 | `nome_modelo` | character varying(100) | ✓ | — | — |
| 9 | `peso` | numeric(8,3) | ✓ | — | — |
| 10 | `valor` | numeric(12,2) | ✓ | — | — |
| 11 | `markup` | numeric(6,2) | ✓ | — | — |
| 12 | `desconto_pct` | numeric(5,2) | ✓ | `0` | — |
| 13 | `cotacao_ouro` | numeric(10,2) | ✓ | — | — |
| 14 | `ficha_tecnica_id` | integer | ✓ | — | — |
| 15 | `status` | character varying(20) | — | `'rascunho'::character varying` | — |
| 16 | `observacoes` | text | ✓ | — | — |
| 17 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 18 | `valor_ouro` | numeric(12,2) | ✓ | — | — |
| 19 | `valor_pedras` | numeric(12,2) | ✓ | — | — |
| 20 | `cotacao_dolar` | numeric(10,2) | ✓ | — | — |
| 21 | `cliente_id` | bigint | ✓ | — | — |
| 22 | `ordem_gerada_id` | integer | ✓ | — | — |
| 23 | `foto_3d` | text | ✓ | — | — |
| 24 | `venda_gerada_id` | integer | ✓ | — | — |
| 25 | `quantidade` | integer | ✓ | `1` | — |
| 26 | `ficha_tecnica_2_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `orcamentos_pkey` — (`id`)

### Foreign Keys (saída)

- `ficha_tecnica_2_id` → `alissonerp.orcamento_fichas_tecnicas.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ficha_tecnica_id` → `alissonerp.orcamento_fichas_tecnicas.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_gerada_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `venda_gerada_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.vendas_erp.orcamento_id` (constraint `vendas_erp_orcamento_id_fkey`)

### Índices

- `idx_orcamentos_cliente` — `CREATE INDEX idx_orcamentos_cliente ON alissonerp.orcamentos USING btree (cliente_id)`
- `idx_orcamentos_created` — `CREATE INDEX idx_orcamentos_created ON alissonerp.orcamentos USING btree (created_at DESC)`
- `idx_orcamentos_status` — `CREATE INDEX idx_orcamentos_status ON alissonerp.orcamentos USING btree (status)`
- `idx_orcamentos_usuario` — `CREATE INDEX idx_orcamentos_usuario ON alissonerp.orcamentos USING btree (usuario_id)`
- `idx_orcamentos_vendedor` — `CREATE INDEX idx_orcamentos_vendedor ON alissonerp.orcamentos USING btree (vendedor_id)`

**Uso no código:**
- `alissonerp.orcamentos` — 14 ocorrência(s)
  - `src/app/(dashboard)/orcamento/detalhe/[id]/page.tsx:46`
  - `src/app/(dashboard)/orcamento/OrcamentoClient.tsx:196`
  - `src/app/(dashboard)/orcamento/OrcamentoClient.tsx:977`
  - `src/app/(dashboard)/orcamento/OrcamentoClient.tsx:978`
  - `src/app/(dashboard)/orcamento/OrcamentoClient.tsx:979`

---

## ordem_comentario_mencoes

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.ordem_comentario_mencoes_id_seq'::regclass)` | — |
| 2 | `comentario_id` | integer | — | — | — |
| 3 | `ordem_id` | integer | — | — | — |
| 4 | `user_id_mencionado` | uuid | — | — | — |
| 5 | `user_id_mencionador` | uuid | — | — | — |
| 6 | `lido` | boolean | ✓ | `false` | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `ordem_comentario_mencoes_pkey` — (`id`)

### Foreign Keys (saída)

- `comentario_id` → `alissonerp.ordem_comentarios.id` (UPDATE NO ACTION, DELETE CASCADE)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE CASCADE)
- `user_id_mencionado` → `alissonerp.usuarios.id` (UPDATE NO ACTION, DELETE CASCADE)
- `user_id_mencionador` → `alissonerp.usuarios.id` (UPDATE NO ACTION, DELETE CASCADE)

_Sem referência identificada no código._

---

## ordem_comentarios

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.ordem_comentarios_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | — | — | — |
| 3 | `user_id` | uuid | — | — | — |
| 4 | `texto` | text | — | — | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `ordem_comentarios_pkey` — (`id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE CASCADE)
- `user_id` → `alissonerp.usuarios.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `alissonerp.ordem_comentario_mencoes.comentario_id` (constraint `ordem_comentario_mencoes_comentario_id_fkey`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 3
  - `admin_full_comentarios` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - `all_read_comentarios` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`
  - `author_write_comentarios` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `(user_id = auth.uid())`

**Uso no código:**
- `alissonerp.ordem_comentarios` — 1 ocorrência(s)
  - `supabase/migrations/068_role_varchar.sql:148`

---

## ordens

> Tabela central. FKs cross-schema: vendedor/cliente→public, setor→alissonerp. directus_ordem_id cruza dados durante migração.

**Aprox. linhas:** 798

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.ordens_id_seq'::regclass)` | — |
| 2 | `numero_ordem` | text | ✓ | — | — |
| 3 | `cliente_id` | bigint | ✓ | — | — |
| 4 | `vendedor_id` | bigint | ✓ | — | — |
| 5 | `pedido_id` | integer | ✓ | — | — |
| 6 | `tipo_ordem` | enum_tipo_ordem | ✓ | — | — |
| 7 | `data_entrega` | date | ✓ | — | — |
| 8 | `peso_metal_negociado` | float4 | ✓ | `0` | — |
| 9 | `peso_metal_externo` | float4 | ✓ | `0` | — |
| 10 | `ficha_tecnica_id` | integer | ✓ | — | — |
| 11 | `itens_para_fabricacao` | character varying(50) | ✓ | — | — |
| 12 | `situacao` | enum_situacao_ordem | ✓ | `'criado'::alissonerp.enum_situacao_ordem` | — |
| 13 | `status` | enum_status_ordem | ✓ | `'aguardando'::alissonerp.enum_status_ordem` | — |
| 14 | `rota` | enum_rota_ordem | ✓ | — | — |
| 15 | `tipo_controle` | character varying(20) | ✓ | `'individual'::character varying` | — |
| 16 | `setor_atual` | integer | ✓ | — | — |
| 17 | `local_atual` | integer | ✓ | — | — |
| 18 | `distribuicao_id` | integer | ✓ | — | — |
| 19 | `protocolo_loja` | boolean | ✓ | `false` | — |
| 20 | `id_ordem_relacionada` | integer | ✓ | — | — |
| 21 | `id_asana` | bigint | ✓ | — | — |
| 22 | `directus_ordem_id` | integer | ✓ | — | — |
| 23 | `motivo_reprovacao` | integer | ✓ | — | — |
| 24 | `origem_reprovacao` | text | ✓ | — | — |
| 25 | `data_conclusao` | timestamp with time zone | ✓ | — | — |
| 26 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 27 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 28 | `created_by` | uuid | ✓ | — | — |
| 29 | `updated_by` | uuid | ✓ | — | — |
| 30 | `numero_pedido` | text | ✓ | — | — |
| 31 | `eh_teste` | boolean | ✓ | `false` | — |
| 32 | `fotos_paths` | _text | ✓ | — | — |
| 33 | `origem` | character varying(20) | — | `'erp'::character varying` | Origem da ordem: legado (importado do Directus) \| erp (criado no novo sistema) |
| 34 | `foto_peca_servico` | text | ✓ | — | — |
| 35 | `peso_peca_servico` | numeric(10,2) | ✓ | — | — |
| 36 | `video_observacao` | text | ✓ | — | — |
| 37 | `detalhes_ordem` | text | ✓ | — | Detalhes/observações da ordem — migrado do directus.ordens.detalhes_ordem via directus_ordem_id |
| 38 | `tipos_servico_ids` | _int4 | ✓ | `'{}'::integer[]` | — |
| 39 | `venda_id` | integer | ✓ | — | — |
| 40 | `venda_item_ids` | _int4 | ✓ | — | — |
| 41 | `ficha_pendente` | boolean | — | `false` | TRUE = ficha técnica incompleta; ordem aguarda preenchimento antes de ir para PCP |

### Chaves

- **UNIQUE** `ordens_numero_ordem_key` — (`numero_ordem`)
- **PRIMARY KEY** `ordens_pkey` — (`id`)

### Foreign Keys (saída)

- `distribuicao_id` → `alissonerp.distribuicoes.id` (UPDATE NO ACTION, DELETE SET NULL)
- `id_ordem_relacionada` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `local_atual` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `setor_atual` → `alissonerp.setores.id` (UPDATE NO ACTION, DELETE SET NULL)
- `venda_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.aprovacoes_consultora.ordem_id` (constraint `aprovacoes_consultora_ordem_id_fkey`)
- `alissonerp.auditorias.ordem_id` (constraint `auditorias_ordem_id_fkey`)
- `alissonerp.auditorias.ordem_retrabalho_id` (constraint `auditorias_ordem_retrabalho_id_fkey`)
- `alissonerp.comentarios_ordem.ordem_id` (constraint `comentarios_ordem_ordem_id_fkey`)
- `alissonerp.distribuicao_ordens.ordens_id` (constraint `distribuicao_ordens_ordens_id_fkey`)
- `alissonerp.estornos_distribuicao.ordem_id` (constraint `estornos_distribuicao_ordem_id_fkey`)
- `alissonerp.fechamentos_distribuicao.ordem_id` (constraint `fechamentos_distribuicao_ordem_id_fkey`)
- `alissonerp.fichas_tecnicas.ordem_id` (constraint `fichas_tecnicas_ordem_id_fkey`)
- `alissonerp.itens_ordem.ordem_id` (constraint `itens_ordem_ordem_id_fkey`)
- `alissonerp.itens_ordem_insumos.ordem_id` (constraint `itens_ordem_insumos_ordem_id_fkey`)
- `alissonerp.itens_ordem_produtos.ordem_id` (constraint `itens_ordem_produtos_ordem_id_fkey`)
- `alissonerp.movimentacoes_estoque.ordem_id` (constraint `movimentacoes_estoque_ordem_id_fkey`)
- `alissonerp.notificacoes.ordem_id` (constraint `notificacoes_ordem_id_fkey`)
- `alissonerp.orcamentos.ordem_gerada_id` (constraint `orcamentos_ordem_gerada_id_fkey`)
- `alissonerp.ordem_comentario_mencoes.ordem_id` (constraint `ordem_comentario_mencoes_ordem_id_fkey`)
- `alissonerp.ordem_comentarios.ordem_id` (constraint `ordem_comentarios_ordem_id_fkey`)
- `alissonerp.ordens.id_ordem_relacionada` (constraint `ordens_id_ordem_relacionada_fkey`)
- `alissonerp.outros_insumos_pcp.ordem_id` (constraint `outros_insumos_pcp_ordem_id_fkey`)
- `alissonerp.pcp.ordem_id` (constraint `pcp_ordem_id_fkey`)
- `alissonerp.pedras_ordens.ordem_id` (constraint `pedras_ordens_ordem_id_fkey`)
- `alissonerp.preparacoes_entrega.ordem_id` (constraint `preparacoes_entrega_ordem_id_fkey`)
- `alissonerp.protocolo_ordens.ordem_id` (constraint `protocolo_ordens_ordem_id_fkey`)
- `alissonerp.saidas_ordem.ordem_id` (constraint `saidas_ordem_ordem_id_fkey`)
- `alissonerp.servicos.ordem_id` (constraint `servicos_ordem_id_fkey`)
- `alissonerp.tarefas.ordem_id` (constraint `tarefas_ordem_id_fkey`)
- `alissonerp.transferencias_ordem.ordem_id` (constraint `transferencias_ordem_ordem_id_fkey`)

### Índices

- `idx_ordens_cliente` — `CREATE INDEX idx_ordens_cliente ON alissonerp.ordens USING btree (cliente_id)`
- `idx_ordens_directus` — `CREATE INDEX idx_ordens_directus ON alissonerp.ordens USING btree (directus_ordem_id)`
- `idx_ordens_directus_unique` — `CREATE UNIQUE INDEX idx_ordens_directus_unique ON alissonerp.ordens USING btree (directus_ordem_id)`
- `idx_ordens_distribuicao` — `CREATE INDEX idx_ordens_distribuicao ON alissonerp.ordens USING btree (distribuicao_id)`
- `idx_ordens_local` — `CREATE INDEX idx_ordens_local ON alissonerp.ordens USING btree (local_atual)`
- `idx_ordens_numero` — `CREATE INDEX idx_ordens_numero ON alissonerp.ordens USING btree (numero_ordem)`
- `idx_ordens_setor` — `CREATE INDEX idx_ordens_setor ON alissonerp.ordens USING btree (setor_atual)`
- `idx_ordens_situacao` — `CREATE INDEX idx_ordens_situacao ON alissonerp.ordens USING btree (situacao)`
- `idx_ordens_status` — `CREATE INDEX idx_ordens_status ON alissonerp.ordens USING btree (status)`
- `idx_ordens_venda_id` — `CREATE INDEX idx_ordens_venda_id ON alissonerp.ordens USING btree (venda_id) WHERE (venda_id IS NOT NULL)`
- `idx_ordens_vendedor` — `CREATE INDEX idx_ordens_vendedor ON alissonerp.ordens USING btree (vendedor_id)`
- `ordens_numero_ordem_key` — `CREATE UNIQUE INDEX ordens_numero_ordem_key ON alissonerp.ordens USING btree (numero_ordem)`

### Triggers

- `trg_audit_ordens` — AFTER INSERT/DELETE/UPDATE → `alissonerp.fn_audit_log` 
- `trg_auto_auditoria_loja` — AFTER INSERT → `alissonerp.fn_auto_auditoria_loja` 
- `trg_cancelar_pcp_ordem` — AFTER UPDATE → `alissonerp.fn_cancelar_pcp_ordem` 
- `trg_ordens_proteger_pdv` — BEFORE UPDATE → `alissonerp.fn_proteger_campos_pdv` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `admin_full_ordens` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - `gerente_fab_ordens` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`

**Uso no código:**
- `alissonerp.ordens` — 487 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/auditoria/AuditoriaClient.tsx:922`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:414`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:517`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:591`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1819`

---

## outros_insumos_distribuicao

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.outros_insumos_distribuicao_id_seq'::regclass)` | — |
| 2 | `distribuicao_id` | integer | ✓ | — | — |
| 3 | `insumo_id` | integer | ✓ | — | — |
| 4 | `peso` | float4 | ✓ | `0` | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `created_by` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `outros_insumos_distribuicao_pkey` — (`id`)

### Foreign Keys (saída)

- `distribuicao_id` → `alissonerp.distribuicoes.id` (UPDATE NO ACTION, DELETE SET NULL)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Triggers

- `trg_after_insert_outros_insumos_dist` — AFTER INSERT → `alissonerp.fn_processar_outros_insumos_dist` 

**Uso no código:**
- `alissonerp.outros_insumos_distribuicao` — 1 ocorrência(s)
  - `scripts/validar_golive.mjs:47`

---

## outros_insumos_pcp

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.outros_insumos_pcp_id_seq'::regclass)` | — |
| 2 | `pcp_id` | integer | ✓ | — | — |
| 3 | `ordem_id` | integer | ✓ | — | — |
| 4 | `insumo_id` | integer | ✓ | — | — |
| 5 | `deposito_id` | integer | ✓ | — | — |
| 6 | `peso` | float4 | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `created_by` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `outros_insumos_pcp_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `pcp_id` → `alissonerp.pcp.id` (UPDATE NO ACTION, DELETE SET NULL)

### Triggers

- `trg_after_insert_outros_insumos_pcp` — AFTER INSERT → `alissonerp.fn_processar_outros_insumos_pcp` 

**Uso no código:**
- `alissonerp.outros_insumos_pcp` — 1 ocorrência(s)
  - `scripts/validar_golive.mjs:49`

---

## pagamentos_venda

**Aprox. linhas:** 121

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.pagamentos_venda_id_seq'::regclass)` | — |
| 2 | `venda_id` | integer | — | — | — |
| 3 | `forma` | character varying(30) | — | — | — |
| 4 | `gateway` | character varying(30) | ✓ | — | — |
| 5 | `valor` | numeric(12,2) | — | — | — |
| 6 | `parcelas` | integer | — | `1` | — |
| 7 | `status` | character varying(20) | — | `'pendente'::character varying` | — |
| 8 | `gateway_id` | text | ✓ | — | — |
| 9 | `gateway_payload` | jsonb | ✓ | — | — |
| 10 | `data_confirmacao` | timestamp with time zone | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | — | `now()` | — |
| 12 | `valor_liquido` | numeric(12,2) | ✓ | — | — |
| 13 | `taxas_mp` | numeric(12,2) | ✓ | — | — |
| 14 | `vale_troca_id` | integer | ✓ | — | — |
| 15 | `caixa_baixa_id` | integer | ✓ | — | — |
| 16 | `fin_gateway_id` | integer | ✓ | — | — |
| 17 | `ouro_gramas` | numeric(10,3) | ✓ | — | — |
| 18 | `ouro_valor_grama` | numeric(10,2) | ✓ | — | — |
| 19 | `source` | character varying(20) | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `pagamentos_venda_pkey` — (`id`)
- **UNIQUE** `uq_pagamentos_gateway_id` — (`gateway_id`)

### Foreign Keys (saída)

- `caixa_baixa_id` → `alissonerp.fin_caixa_baixas.id` (UPDATE NO ACTION, DELETE SET NULL)
- `fin_gateway_id` → `alissonerp.fin_gateways.id` (UPDATE NO ACTION, DELETE SET NULL)
- `vale_troca_id` → `alissonerp.vale_troca.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `venda_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `alissonerp.fin_conciliacoes.pagamento_venda_id` (constraint `fin_conciliacoes_pagamento_venda_id_fkey`)
- `alissonerp.saldo_credito_loja.pagamento_id` (constraint `saldo_credito_loja_pagamento_id_fkey`)

### CHECK constraints

- `pagamentos_venda_source_check` — `CHECK (((source)::text = ANY ((ARRAY['webhook_mp'::character varying, 'manual_mp'::character varying, 'pdv'::character varying, 'manual'::character varying, 'ouro'::character varying, 'dinheiro'::character varying, 'vale_troca'::character varying,...`

### Índices

- `idx_pagamentos_vale_troca` — `CREATE INDEX idx_pagamentos_vale_troca ON alissonerp.pagamentos_venda USING btree (vale_troca_id) WHERE (vale_troca_id IS NOT NULL)`
- `idx_pagamentos_venda_baixa` — `CREATE INDEX idx_pagamentos_venda_baixa ON alissonerp.pagamentos_venda USING btree (caixa_baixa_id) WHERE (((forma)::text = 'Dinheiro'::text) AND ((status)::text = 'confirmado'::text))`
- `idx_pagamentos_venda_gateway_id` — `CREATE INDEX idx_pagamentos_venda_gateway_id ON alissonerp.pagamentos_venda USING btree (gateway_id) WHERE (gateway_id IS NOT NULL)`
- `uq_pagamentos_gateway_id` — `CREATE UNIQUE INDEX uq_pagamentos_gateway_id ON alissonerp.pagamentos_venda USING btree (gateway_id)`

**Uso no código:**
- `alissonerp.pagamentos_venda` — 46 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/vendas/nova/NovaVendaClientV2.tsx:120`
  - `src/app/api/crediario/[id]/verificar-mp/route.ts:40`
  - `src/app/api/vendas/[id]/mercado-pago/criar-link/route.ts:115`
  - `src/app/api/vendas/[id]/mercado-pago/criar-pix/route.ts:98`
  - `src/app/api/webhooks/mercado-pago/route.ts:20`

---

## parametros

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `1` | — |
| 2 | `cotacao_ouro` | numeric(12,2) | ✓ | — | — |
| 3 | `cotacao_dolar` | numeric(12,2) | ✓ | — | — |
| 4 | `cotacao_euro` | numeric(12,2) | ✓ | — | — |
| 5 | `cotacao_prata` | numeric(12,2) | ✓ | — | — |
| 6 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `parametros_pkey` — (`id`)

### CHECK constraints

- `parametros_id_check` — `CHECK ((id = 1))`

**Uso no código:**
- `alissonerp.parametros` — 58 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:132`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:141`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:159`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:163`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:164`

---

## parametros_sistema

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `chave` | character varying(100) | — | — | — |
| 2 | `valor` | text | — | — | — |
| 3 | `tipo` | character varying(20) | — | `'number'::character varying` | — |
| 4 | `descricao` | text | ✓ | — | — |
| 5 | `atualizado_em` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `atualizado_por` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `parametros_sistema_pkey` — (`chave`)

### Foreign Keys (saída)

- `atualizado_por` → `alissonerp.usuarios.id` (UPDATE NO ACTION, DELETE SET NULL)

### CHECK constraints

- `parametros_sistema_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['number'::character varying, 'string'::character varying, 'boolean'::character varying, 'json'::character varying])::text[])))`

### Triggers

- `trg_atualizar_parametros_sistema` — BEFORE UPDATE → `alissonerp.fn_atualizar_parametros_sistema` 

_Sem referência identificada no código._

---

## pcp

**Aprox. linhas:** 460

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.pcp_id_seq'::regclass)` | — |
| 2 | `etapas` | enum_etapas_pcp | ✓ | `'novas_ordens'::alissonerp.enum_etapas_pcp` | — |
| 3 | `ordem_id` | integer | ✓ | — | — |
| 4 | `saida_ordem_id` | integer | ✓ | — | — |
| 5 | `operador` | uuid | ✓ | — | — |
| 6 | `bloqueado` | boolean | ✓ | `false` | — |
| 7 | `local_atual` | boolean | ✓ | `true` | — |
| 8 | `total_metal` | float4 | ✓ | `0` | — |
| 9 | `retorno_metal` | float4 | ✓ | `0` | — |
| 10 | `total_pedras_un` | float4 | ✓ | `0` | — |
| 11 | `total_pedras_g` | float4 | ✓ | `0` | — |
| 12 | `total_geral_outros_pesos` | float4 | ✓ | `0` | — |
| 13 | `total_outros_pesos_g` | float4 | ✓ | `0` | — |
| 14 | `pmc` | float4 | ✓ | `0` | — |
| 15 | `quebra` | float4 | ✓ | `0` | — |
| 16 | `porcentagem_de_quebra` | float4 | ✓ | `0` | — |
| 17 | `peso_final` | float4 | ✓ | `0` | — |
| 18 | `peso_unitario` | float4 | ✓ | `0` | — |
| 19 | `quantidade` | float4 | ✓ | `0` | — |
| 20 | `metal_externo` | float4 | ✓ | `0` | — |
| 21 | `data_conclusao` | timestamp with time zone | ✓ | — | — |
| 22 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 23 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 24 | `created_by` | uuid | ✓ | — | — |
| 25 | `updated_by` | uuid | ✓ | — | — |
| 26 | `deposito_id` | integer | ✓ | — | — |
| 27 | `dist_ouro_real` | float4 | ✓ | `0` | Soma de distribuicao_ordens.peso_ouro_real para todas as saídas desta ordem |
| 28 | `dist_pedras_qtd` | float4 | ✓ | `0` | Soma de qtd_utilizada de distribuicao_saida_pedras para esta ordem |
| 29 | `dist_pedras_g` | float4 | ✓ | `0` | Soma de peso_total de distribuicao_saida_pedras para esta ordem |
| 30 | `dist_quebra` | float4 | ✓ | `0` | Soma de distribuicao_ordens.quebra para todas as saídas desta ordem |
| 31 | `total_pedras_ct` | numeric(10,4) | ✓ | `0` | — |

### Chaves

- **PRIMARY KEY** `pcp_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)
- `saida_ordem_id` → `alissonerp.saidas_ordem.id` (UPDATE NO ACTION, DELETE SET NULL)

### Referenciada por (entrada)

- `alissonerp.apontamentos_pcp.pcp_id` (constraint `apontamentos_pcp_pcp_id_fkey`)
- `alissonerp.apontamentos_pote.pcp_id` (constraint `apontamentos_pote_pcp_id_fkey`)
- `alissonerp.outros_insumos_pcp.pcp_id` (constraint `outros_insumos_pcp_pcp_id_fkey`)
- `alissonerp.servicos.pcp_id` (constraint `servicos_pcp_id_fkey`)
- `alissonerp.transferencias_ordem.pcp_id` (constraint `transferencias_ordem_pcp_id_fkey`)

### Índices

- `idx_pcp_etapas` — `CREATE INDEX idx_pcp_etapas ON alissonerp.pcp USING btree (etapas)`
- `idx_pcp_ordem` — `CREATE INDEX idx_pcp_ordem ON alissonerp.pcp USING btree (ordem_id)`

### Triggers

- `trg_audit_pcp` — AFTER INSERT/DELETE/UPDATE → `alissonerp.fn_audit_log` 
- `trg_criar_servico_from_pcp` — AFTER INSERT → `alissonerp.fn_criar_servico_from_pcp` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 3
  - `admin_full_pcp` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - `gerente_fab_pcp` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`
  - `ourives_select_pcp` (SELECT, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'ourives'::text)`

**Uso no código:**
- `alissonerp.pcp` — 476 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:472`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:485`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1138`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1820`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1840`

---

## pedras_ordens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.pedras_ordens_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | ✓ | — | — |
| 3 | `deposito_id` | integer | ✓ | — | — |
| 4 | `peso` | float4 | ✓ | — | — |
| 5 | `peso_pedra` | float4 | ✓ | — | — |
| 6 | `qtd_pedras` | float4 | ✓ | — | — |
| 7 | `data_hora` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `pedras_ordens_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)

**Uso no código:**
- `alissonerp.pedras_ordens` — 3 ocorrência(s)
  - `scripts/validar_golive.mjs:51`
  - `supabase/migrations/018_trigger_apontamento_pcp.sql:104`
  - `supabase/migrations/098_triggers_pedras_ct_compras.sql:161`

---

## permissoes_usuario

**Aprox. linhas:** 76

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.permissoes_usuario_id_seq'::regclass)` | — |
| 2 | `usuario_id` | uuid | — | — | — |
| 3 | `acao` | character varying(50) | — | — | — |
| 4 | `permitido` | boolean | — | `false` | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `permissoes_usuario_pkey` — (`id`)
- **UNIQUE** `permissoes_usuario_usuario_id_acao_key` — (`usuario_id`, `acao`)

### Foreign Keys (saída)

- `usuario_id` → `alissonerp.usuarios.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `idx_permissoes_usuario_acao` — `CREATE INDEX idx_permissoes_usuario_acao ON alissonerp.permissoes_usuario USING btree (usuario_id, acao)`
- `permissoes_usuario_usuario_id_acao_key` — `CREATE UNIQUE INDEX permissoes_usuario_usuario_id_acao_key ON alissonerp.permissoes_usuario USING btree (usuario_id, acao)`

_Sem referência identificada no código._

---

## precificacao_config

> Snapshots de configuração do app de precificação (categorias, MKP, comissões). Histórico eterno.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `content` | jsonb | — | — | — |
| 3 | `label` | text | ✓ | — | — |
| 4 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `precificacao_config_pkey` — (`id`)

### Índices

- `idx_precificacao_config_updated` — `CREATE INDEX idx_precificacao_config_updated ON alissonerp.precificacao_config USING btree (updated_at DESC)`

_Sem referência identificada no código._

---

## precificacao_historico

> Log de cada cálculo feito no app de precificação.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | `gen_random_uuid()` | — |
| 2 | `gold_price` | numeric | ✓ | — | — |
| 3 | `weight` | numeric | ✓ | — | — |
| 4 | `mkp` | numeric | ✓ | — | — |
| 5 | `commission_percent` | numeric | ✓ | — | — |
| 6 | `commission_value` | numeric | ✓ | — | — |
| 7 | `base_price` | numeric | ✓ | — | — |
| 8 | `final_price` | numeric | ✓ | — | — |
| 9 | `discount_percent` | numeric | ✓ | — | — |
| 10 | `category_name` | text | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `precificacao_historico_pkey` — (`id`)

### Índices

- `idx_precificacao_historico_created` — `CREATE INDEX idx_precificacao_historico_created ON alissonerp.precificacao_historico USING btree (created_at DESC)`

_Sem referência identificada no código._

---

## preparacoes_entrega

**Aprox. linhas:** 230

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.preparacoes_entrega_id_seq'::regclass)` | — |
| 2 | `etapas` | enum_etapas_entrega | ✓ | `'pendente'::alissonerp.enum_etapas_entrega` | — |
| 3 | `ordem_id` | integer | ✓ | — | — |
| 4 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 5 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `created_by` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `preparacoes_entrega_pkey` — (`id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `admin_full_preparacoes` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`

**Uso no código:**
- `alissonerp.preparacoes_entrega` — 7 ocorrência(s)
  - `scripts/diag_outros_schemas.mjs:6`
  - `scripts/validar_golive.mjs:53`
  - `supabase/migrations/021_triggers_protocolo.sql:219`
  - `supabase/migrations/068_role_varchar.sql:194`
  - `supabase/migrations/125_fix_timeline_proto_duplicado.sql:100`

---

## produto_composicao

> BOM (Bill of Materials) — composição do produto em insumos.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.produto_composicao_id_seq'::regclass)` | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `insumo_id` | integer | — | — | — |
| 4 | `tipo` | character varying(20) | — | — | — |
| 5 | `quantidade` | numeric(10,4) | — | `1` | — |
| 6 | `tamanho` | numeric(10,4) | ✓ | — | Tamanho da pedra em quilates (ct) ou mm. Usado para buscar faixa de markup em markup_pedras. |
| 7 | `unidade_tamanho` | character varying(10) | ✓ | `'ct'::character varying` | — |
| 8 | `preco_compra_usd` | numeric(10,4) | ✓ | — | Preço unitário de compra em USD. custo_pedra = preco_compra_usd × cotacao_dolar × markup_pedra. |
| 9 | `obrigatorio` | boolean | ✓ | `true` | — |
| 10 | `observacao` | text | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 12 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `produto_composicao_pkey` — (`id`)
- **UNIQUE** `produto_composicao_produto_id_insumo_id_key` — (`produto_id`, `insumo_id`)

### CHECK constraints

- `produto_composicao_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['metal'::character varying, 'pedra'::character varying, 'outro'::character varying])::text[])))`
- `produto_composicao_unidade_tamanho_check` — `CHECK (((unidade_tamanho)::text = ANY ((ARRAY['ct'::character varying, 'mm'::character varying])::text[])))`

### Índices

- `idx_produto_composicao_insumo_id` — `CREATE INDEX idx_produto_composicao_insumo_id ON alissonerp.produto_composicao USING btree (insumo_id)`
- `idx_produto_composicao_produto_id` — `CREATE INDEX idx_produto_composicao_produto_id ON alissonerp.produto_composicao USING btree (produto_id)`
- `idx_produto_composicao_tipo` — `CREATE INDEX idx_produto_composicao_tipo ON alissonerp.produto_composicao USING btree (tipo)`
- `produto_composicao_produto_id_insumo_id_key` — `CREATE UNIQUE INDEX produto_composicao_produto_id_insumo_id_key ON alissonerp.produto_composicao USING btree (produto_id, insumo_id)`

**Uso no código:**
- `alissonerp.produto_composicao` — 14 ocorrência(s)
  - `src/app/api/produtos/insumos/route.ts:3`
  - `src/app/api/produtos/insumos/route.ts:11`
  - `src/app/api/produtos/insumos/route.ts:91`
  - `src/app/api/produtos/[id]/propagar/route.ts:10`
  - `src/app/api/produtos/[id]/propagar/route.ts:94`

---

## produto_curva_aplicada

> Comissao, max desconto e markup aplicados em cada produto pela curva dinamica. Populada por /api/precificacao/curva/aplicar.

**Aprox. linhas:** 8817

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `produto_id` | bigint | — | — | FK para public.produtos.id_produto |
| 2 | `comissao_pct` | numeric(6,3) | ✓ | — | Comissao %% calculada pela curva |
| 3 | `max_desconto_pct` | numeric(5,2) | ✓ | — | %% maximo de desconto permitido em venda/orcamento |
| 4 | `markup_aplicado` | numeric(10,4) | ✓ | — | Markup calculado pela curva no momento da aplicacao (auditoria) |
| 5 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `produto_curva_aplicada_pkey` — (`produto_id`)

### Índices

- `idx_produto_curva_aplicada_updated` — `CREATE INDEX idx_produto_curva_aplicada_updated ON alissonerp.produto_curva_aplicada USING btree (updated_at DESC)`

**Uso no código:**
- `alissonerp.produto_curva_aplicada` — 1 ocorrência(s)
  - `src/app/api/produtos/route.ts:313`

---

## produto_imagens

> Galeria de imagens por produto. Migrado do Directus (legado mantido como backup).

**Aprox. linhas:** 2140

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('alissonerp.produto_imagens_id_seq'::regclass)` | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `bucket` | text | — | `'imagens'::text` | — |
| 4 | `bucket_path` | text | — | — | — |
| 5 | `url_publica` | text | — | — | — |
| 6 | `ordem` | integer | — | `0` | — |
| 7 | `eh_capa` | boolean | — | `false` | — |
| 8 | `origem` | text | ✓ | — | — |
| 9 | `origem_uuid` | uuid | ✓ | — | UUID do arquivo original no Directus (directus_files.id) — usado para idempotência da migração. |
| 10 | `origem_tabela` | text | ✓ | — | Tabela de origem no Directus: produtos_files_1 (galeria principal/capa), produtos_files_2, etc, ou imagem_capa (campo de public.produtos). |
| 11 | `filename` | text | ✓ | — | — |
| 12 | `mime_type` | text | ✓ | — | — |
| 13 | `filesize` | bigint | ✓ | — | — |
| 14 | `created_at` | timestamp with time zone | — | `now()` | — |
| 15 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **UNIQUE** `produto_imagens_origem_uuid_key` — (`origem_uuid`)
- **PRIMARY KEY** `produto_imagens_pkey` — (`id`)

### Índices

- `idx_produto_imagens_produto` — `CREATE INDEX idx_produto_imagens_produto ON alissonerp.produto_imagens USING btree (produto_id, ordem)`
- `produto_imagens_origem_uuid_key` — `CREATE UNIQUE INDEX produto_imagens_origem_uuid_key ON alissonerp.produto_imagens USING btree (origem_uuid)`
- `uniq_produto_imagens_capa` — `CREATE UNIQUE INDEX uniq_produto_imagens_capa ON alissonerp.produto_imagens USING btree (produto_id) WHERE eh_capa`

### Triggers

- `trg_produto_imagens_touch` — BEFORE UPDATE → `alissonerp.fn_produto_imagens_touch` 

**Uso no código:**
- `alissonerp.produto_imagens` — 5 ocorrência(s)
  - `scripts/apply_185.mjs:11`
  - `scripts/apply_185.mjs:40`
  - `scripts/apply_185.mjs:42`
  - `scripts/apply_185.mjs:47`
  - `supabase/migrations/186_vw_produto_imagens.sql:4`

---

## produto_pedra_extras

> Extensão de public.produtos para pedras-produto: custo USD e quantidade em estoque. preco_tiny (em public.produtos) = preco_compra_usd × dolar × markup_faixa(ct).

**Aprox. linhas:** 71

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `produto_id` | bigint | — | — | — |
| 2 | `preco_compra_usd` | numeric(12,4) | ✓ | — | Custo de compra em USD. Usado junto com cotação do dólar e markup por tamanho. |
| 3 | `quantidade` | integer | ✓ | `0` | Quantidade em estoque (unidades avulsas da pedra-produto). |
| 4 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 5 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `peso_ct` | numeric(10,4) | ✓ | — | Peso da pedra em quilates (ct). Fonte de verdade para pedras-produto, pois public.produtos.peso_precificado é arredondado pelo trigger arredondar_peso_para_cima. Pontos = peso_ct × 100. |

### Chaves

- **PRIMARY KEY** `produto_pedra_extras_pkey` — (`produto_id`)

**Uso no código:**
- `alissonerp.produto_pedra_extras` — 7 ocorrência(s)
  - `src/app/api/produtos/route.ts:266`
  - `src/app/api/produtos/[id]/route.ts:559`
  - `src/app/api/produtos/[id]/route.ts:560`
  - `src/components/produtos/ProdutoDrawer.tsx:869`
  - `scripts/apply_171.mjs:17`

---

## produto_personalizacao

> Config de personalizacao por produto (ex: nome gravado com max N letras). 1 linha = 1 produto. Validacao aplicada no wizard de venda e na criacao de itens de ordem.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.produto_personalizacao_id_seq'::regclass)` | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `tipo` | character varying(20) | — | `'nome'::character varying` | Tipo de dado a personalizar: nome \| iniciais \| data \| numero \| simbolo \| livre. |
| 4 | `obrigatorio` | boolean | — | `true` | Se true, venda nao pode ser finalizada sem o campo preenchido. |
| 5 | `min_caracteres` | integer | — | `1` | — |
| 6 | `max_caracteres` | integer | — | — | — |
| 7 | `caracteres_permitidos` | character varying(30) | — | `'alfa_acento_espaco'::character varying` | alfa=A-Z \| alfa_acento=A-Z+acentos \| alfa_acento_espaco=A-Z+acentos+espacos \| alfanum=A-Z+0-9 \| alfanum_acento_espaco \| numero=0-9 \| qualquer. |
| 8 | `label` | character varying(100) | — | `'Nome a gravar'::character varying` | — |
| 9 | `placeholder` | character varying(100) | ✓ | — | — |
| 10 | `exemplo` | character varying(100) | ✓ | — | — |
| 11 | `observacao` | text | ✓ | — | — |
| 12 | `ativo` | boolean | — | `true` | — |
| 13 | `created_at` | timestamp with time zone | — | `now()` | — |
| 14 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 15 | `preco_por_letra` | numeric(10,2) | ✓ | — | Se preenchido, preco do item na venda = qtd_letras * preco_por_letra (recalculado server-side em POST /api/vendas). Se NULL, usa preco_tiny do produto. |
| 16 | `peso_por_letra` | numeric(8,2) | ✓ | — | Se preenchido, peso_estimado do item na venda = qtd_letras * peso_por_letra (recalculado server-side em POST /api/vendas). Se NULL, usa peso_precificado do produto. |

### Chaves

- **PRIMARY KEY** `produto_personalizacao_pkey` — (`id`)
- **UNIQUE** `produto_personalizacao_produto_id_key` — (`produto_id`)

### CHECK constraints

- `produto_personalizacao_caracteres_permitidos_check` — `CHECK (((caracteres_permitidos)::text = ANY ((ARRAY['alfa'::character varying, 'alfa_acento'::character varying, 'alfa_acento_espaco'::character varying, 'alfanum'::character varying, 'alfanum_acento_espaco'::character varying, 'numero'::character...`
- `produto_personalizacao_check` — `CHECK ((max_caracteres >= min_caracteres))`
- `produto_personalizacao_min_caracteres_check` — `CHECK ((min_caracteres >= 0))`
- `produto_personalizacao_peso_por_letra_check` — `CHECK (((peso_por_letra IS NULL) OR (peso_por_letra >= (0)::numeric)))`
- `produto_personalizacao_preco_por_letra_check` — `CHECK (((preco_por_letra IS NULL) OR (preco_por_letra >= (0)::numeric)))`
- `produto_personalizacao_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['nome'::character varying, 'iniciais'::character varying, 'data'::character varying, 'numero'::character varying, 'simbolo'::character varying, 'livre'::character varying])::text[])))`

### Índices

- `idx_produto_personalizacao_ativo` — `CREATE INDEX idx_produto_personalizacao_ativo ON alissonerp.produto_personalizacao USING btree (produto_id) WHERE (ativo = true)`
- `produto_personalizacao_produto_id_key` — `CREATE UNIQUE INDEX produto_personalizacao_produto_id_key ON alissonerp.produto_personalizacao USING btree (produto_id)`

### Triggers

- `trg_produto_personalizacao_touch_updated` — BEFORE UPDATE → `alissonerp.tg_produto_personalizacao_touch_updated` 

**Uso no código:**
- `alissonerp.produto_personalizacao` — 1 ocorrência(s)
  - `src/app/(dashboard)/vendas/nova/NovaVendaClientV2.tsx:971`

---

## produto_tipo_item

**Aprox. linhas:** 12678

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `produto_id` | bigint | — | — | — |
| 2 | `tipo_item` | text | — | — | — |
| 3 | `created_at` | timestamp with time zone | — | `now()` | — |
| 4 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `produto_tipo_item_pkey` — (`produto_id`)

### CHECK constraints

- `produto_tipo_item_tipo_item_check` — `CHECK ((tipo_item = ANY (ARRAY['joia'::text, 'insumo'::text])))`

### Índices

- `idx_produto_tipo_item_tipo` — `CREATE INDEX idx_produto_tipo_item_tipo ON alissonerp.produto_tipo_item USING btree (tipo_item)`

**Uso no código:**
- `alissonerp.produto_tipo_item` — 2 ocorrência(s)
  - `src/app/api/produtos/classificar-tipo/route.ts:72`
  - `supabase/migrations/138_produto_tipo_item.sql:2`

---

## produtos_fiscais

> Campos fiscais de produto. PK = public.produtos.id_produto (FK logica).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_produto` | bigint | — | — | Ref logica a public.produtos.id_produto (sem FK fisica) |
| 2 | `ncm` | character varying(8) | ✓ | — | Nomenclatura Comum do Mercosul (8 digitos). Ex: 71131910 (joia ouro) |
| 3 | `cest` | character varying(7) | ✓ | — | Codigo Especificador da Substituicao Tributaria (7 digitos) |
| 4 | `cfop_saida` | character varying(4) | ✓ | — | — |
| 5 | `origem` | smallint | — | `0` | 0=Nacional,1=Importacao direta,2=Importado de terceiros,... |
| 6 | `unidade_comercial` | character varying(6) | — | `'UN'::character varying` | UN, PC, CT (carat), GR, DZ, etc. |
| 7 | `ean` | character varying(14) | ✓ | — | — |
| 8 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `produtos_fiscais_pkey` — (`id_produto`)

### CHECK constraints

- `produtos_fiscais_origem_check` — `CHECK (((origem >= 0) AND (origem <= 8)))`

### Índices

- `idx_produtos_fiscais_ncm` — `CREATE INDEX idx_produtos_fiscais_ncm ON alissonerp.produtos_fiscais USING btree (ncm)`

**Uso no código:**
- `alissonerp.produtos_fiscais` — 3 ocorrência(s)
  - `scripts/apply_145_150_fiscal.mjs:11`
  - `scripts/apply_145_150_fiscal.mjs:45`
  - `supabase/migrations/147_fiscal_produtos_contatos_fiscais.sql:32`

---

## protocolo_fotos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.protocolo_fotos_id_seq'::regclass)` | — |
| 2 | `protocolo_id` | integer | ✓ | — | — |
| 3 | `arquivo_id` | uuid | ✓ | — | — |
| 4 | `tipo` | character varying(50) | ✓ | — | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `foto_url` | text | ✓ | — | — |
| 7 | `foto_base64` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `protocolo_fotos_pkey` — (`id`)

### Foreign Keys (saída)

- `protocolo_id` → `alissonerp.protocolos.id` (UPDATE NO ACTION, DELETE CASCADE)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 2
  - `protocolo_fotos_insert` (INSERT, PERMISSIVE) roles=authenticated
    WITH CHECK: `true`
  - `protocolo_fotos_read` (SELECT, PERMISSIVE) roles=authenticated
    USING: `true`

**Uso no código:**
- `alissonerp.protocolo_fotos` — 20 ocorrência(s)
  - `scripts/apply_041.mjs:21`
  - `scripts/backup_pre_golive.mjs:30`
  - `scripts/diag_protocolo_fotos.mjs:4`
  - `scripts/diag_protocolo_fotos.mjs:7`
  - `scripts/diag_protocolo_fotos.mjs:9`

---

## protocolo_ordens

**Aprox. linhas:** 560

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.protocolo_ordens_id_seq'::regclass)` | — |
| 2 | `protocolo_id` | integer | ✓ | — | — |
| 3 | `ordem_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `protocolo_ordens_pkey` — (`id`)
- **UNIQUE** `protocolo_ordens_protocolo_id_ordem_id_key` — (`protocolo_id`, `ordem_id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)
- `protocolo_id` → `alissonerp.protocolos.id` (UPDATE NO ACTION, DELETE SET NULL)

### Índices

- `protocolo_ordens_protocolo_id_ordem_id_key` — `CREATE UNIQUE INDEX protocolo_ordens_protocolo_id_ordem_id_key ON alissonerp.protocolo_ordens USING btree (protocolo_id, ordem_id)`

**Uso no código:**
- `alissonerp.protocolo_ordens` — 14 ocorrência(s)
  - `scripts/backup_pre_golive.mjs:29`
  - `scripts/diag_protocolo_spec.mjs:13`
  - `scripts/diag_protocolo_spec.mjs:17`
  - `scripts/diag_tabelas_protocolo.mjs:7`
  - `scripts/pre_migration_check.mjs:114`

---

## protocolos

**Aprox. linhas:** 501

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.protocolos_id_seq'::regclass)` | — |
| 2 | `direcao` | enum_direcao_protocolo | — | — | — |
| 3 | `etapas` | enum_etapas_protocolo | ✓ | `'pendente'::alissonerp.enum_etapas_protocolo` | — |
| 4 | `motoboy_id` | uuid | ✓ | — | — |
| 5 | `recebedor_id` | uuid | ✓ | — | — |
| 6 | `data_conclusao` | timestamp with time zone | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `created_by` | uuid | ✓ | — | — |
| 10 | `foto_criacao` | text | ✓ | — | Path no Storage (protocolo-fotos) da foto tirada na criação |
| 11 | `foto_conclusao` | text | ✓ | — | Path no Storage (protocolo-fotos) da foto tirada na conclusão |
| 12 | `tipo_protocolo` | character varying(20) | — | `'fabrica'::character varying` | Tipo: fabrica (vai pra fábrica via motoboy) ou service (vai pra service ao lado) |

### Chaves

- **PRIMARY KEY** `protocolos_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.protocolo_fotos.protocolo_id` (constraint `protocolo_fotos_protocolo_id_fkey`)
- `alissonerp.protocolo_ordens.protocolo_id` (constraint `protocolo_ordens_protocolo_id_fkey`)
- `alissonerp.transferencias_ordem.protocolo_id` (constraint `transferencias_ordem_protocolo_id_fkey`)

### Triggers

- `trg_audit_protocolos` — AFTER INSERT/DELETE/UPDATE → `alissonerp.fn_audit_log` 
- `trg_concluir_protocolo` — BEFORE UPDATE → `alissonerp.fn_concluir_protocolo` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 4
  - `admin_full_protocolos` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - `gerente_fab_protocolos` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'gerente_fabrica'::text)`
  - `motoboy_select_protocolos` (SELECT, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'motoboy'::text)`
  - `motoboy_update_protocolos` (UPDATE, PERMISSIVE) roles=authenticated
    USING: `(((alissonerp.fn_user_role())::text = 'motoboy'::text) AND (motoboy_id = auth.uid()))`

**Uso no código:**
- `alissonerp.protocolos` — 35 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/protocolo/ProtocoloClient.tsx:330`
  - `src/app/api/protocolo/route.ts:6`
  - `src/app/api/protocolo/route.ts:102`
  - `src/app/api/service/pendentes/route.ts:7`
  - `src/app/api/service/pendentes/route.ts:60`

---

## purificacoes

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.purificacoes_id_seq'::regclass)` | — |
| 2 | `status` | character varying(20) | — | `'em_processo'::character varying` | — |
| 3 | `itens` | jsonb | — | `'[]'::jsonb` | — |
| 4 | `peso_total_enviado` | numeric(10,2) | — | — | — |
| 5 | `teor_medio` | numeric(5,4) | — | — | — |
| 6 | `peso_esperado_24k` | numeric(10,2) | — | — | — |
| 7 | `foto_envio` | text | ✓ | — | — |
| 8 | `observacao_envio` | text | ✓ | — | — |
| 9 | `data_envio` | timestamp with time zone | ✓ | `now()` | — |
| 10 | `criado_por` | uuid | — | — | — |
| 11 | `peso_retornado_24k` | numeric(10,2) | ✓ | — | — |
| 12 | `perda_processo` | numeric(10,2) | ✓ | — | — |
| 13 | `perda_percentual` | numeric(5,2) | ✓ | — | — |
| 14 | `foto_retorno` | text | ✓ | — | — |
| 15 | `observacao_retorno` | text | ✓ | — | — |
| 16 | `data_retorno` | timestamp with time zone | ✓ | — | — |
| 17 | `concluido_por` | uuid | ✓ | — | — |
| 18 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 19 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `purificacoes_pkey` — (`id`)

### Índices

- `idx_purificacoes_data` — `CREATE INDEX idx_purificacoes_data ON alissonerp.purificacoes USING btree (data_envio)`
- `idx_purificacoes_status` — `CREATE INDEX idx_purificacoes_status ON alissonerp.purificacoes USING btree (status)`

**Uso no código:**
- `alissonerp.purificacoes` — 10 ocorrência(s)
  - `src/app/(dashboard)/purificacao/page.tsx:43`
  - `src/app/(dashboard)/purificacao/page.tsx:161`
  - `src/app/(dashboard)/purificacao/page.tsx:197`
  - `src/app/(dashboard)/purificacao/PurificacaoClient.tsx:81`
  - `src/app/(dashboard)/purificacao/PurificacaoClient.tsx:128`

---

## quebra_operador

> Quebra de ouro por operador. Registrada em transferências operador→operador e saídas PCP. Pote (dep ID=1) NUNCA registra.

**Aprox. linhas:** 90

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.quebra_operador_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | ✓ | — | — |
| 3 | `pcp_id` | integer | ✓ | — | — |
| 4 | `deposito_id` | integer | — | — | — |
| 5 | `setor_id` | integer | ✓ | — | — |
| 6 | `insumo_id` | integer | — | `1` | — |
| 7 | `numero_ordem` | character varying(20) | ✓ | — | — |
| 8 | `deposito_nome` | character varying(100) | ✓ | — | — |
| 9 | `setor_nome` | character varying(100) | ✓ | — | — |
| 10 | `insumo_nome` | character varying(100) | ✓ | `'Ouro 18k Amarelo'::character varying` | — |
| 11 | `tipo` | character varying(30) | — | — | — |
| 12 | `ouro_recebido` | numeric(10,4) | — | — | — |
| 13 | `ouro_entregue` | numeric(10,4) | — | — | — |
| 14 | `quebra` | numeric(10,4) | — | — | — |
| 15 | `percentual_quebra` | numeric(10,2) | ✓ | — | — |
| 16 | `data_registro` | timestamp with time zone | ✓ | `now()` | — |
| 17 | `created_by` | uuid | ✓ | — | — |
| 18 | `distribuicao_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `quebra_operador_pkey` — (`id`)

### CHECK constraints

- `quebra_operador_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['transferencia'::character varying, 'saida_pcp'::character varying, 'conclusao_lote'::character varying])::text[])))`

### Índices

- `idx_quebra_op_deposito_periodo` — `CREATE INDEX idx_quebra_op_deposito_periodo ON alissonerp.quebra_operador USING btree (deposito_id, data_registro)`
- `idx_quebra_op_ordem` — `CREATE INDEX idx_quebra_op_ordem ON alissonerp.quebra_operador USING btree (ordem_id)`
- `idx_quebra_op_periodo` — `CREATE INDEX idx_quebra_op_periodo ON alissonerp.quebra_operador USING btree (data_registro)`
- `idx_quebra_op_setor_periodo` — `CREATE INDEX idx_quebra_op_setor_periodo ON alissonerp.quebra_operador USING btree (setor_id, data_registro)`
- `idx_quebra_op_tipo` — `CREATE INDEX idx_quebra_op_tipo ON alissonerp.quebra_operador USING btree (tipo, data_registro)`

**Uso no código:**
- `alissonerp.quebra_operador` — 11 ocorrência(s)
  - `src/app/api/distribuicao/[id]/estorno/route.ts:13`
  - `src/app/api/distribuicao/[id]/estorno-lote/route.ts:14`
  - `src/app/api/distribuicao/[id]/estorno-lote/route.ts:143`
  - `scripts/backup_pre_golive.mjs:32`
  - `scripts/pre_migration_check.mjs:115`

---

## reembolsos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.reembolsos_id_seq'::regclass)` | — |
| 2 | `devolucao_id` | integer | — | — | — |
| 3 | `metodo` | character varying(30) | — | — | — |
| 4 | `valor` | numeric(12,2) | — | — | — |
| 5 | `mp_payment_id` | character varying(100) | ✓ | — | — |
| 6 | `mp_refund_id` | character varying(100) | ✓ | — | — |
| 7 | `mp_status` | character varying(30) | ✓ | — | — |
| 8 | `mp_erro` | text | ✓ | — | — |
| 9 | `conta_pagar_id` | integer | ✓ | — | — |
| 10 | `status` | character varying(20) | — | `'pendente'::character varying` | — |
| 11 | `processado_em` | timestamp with time zone | ✓ | — | — |
| 12 | `criado_por` | uuid | — | — | — |
| 13 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `reembolsos_pkey` — (`id`)

### Foreign Keys (saída)

- `conta_pagar_id` → `alissonerp.contas_pagar.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `devolucao_id` → `alissonerp.devolucoes_venda.id` (UPDATE NO ACTION, DELETE NO ACTION)

### CHECK constraints

- `reembolsos_metodo_check` — `CHECK (((metodo)::text = ANY ((ARRAY['mp_automatico'::character varying, 'contas_pagar_manual'::character varying])::text[])))`
- `reembolsos_status_check` — `CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'processando'::character varying, 'concluido'::character varying, 'falhou'::character varying])::text[])))`

### Índices

- `idx_reembolsos_devolucao` — `CREATE INDEX idx_reembolsos_devolucao ON alissonerp.reembolsos USING btree (devolucao_id)`
- `idx_reembolsos_status` — `CREATE INDEX idx_reembolsos_status ON alissonerp.reembolsos USING btree (status)`

**Uso no código:**
- `alissonerp.reembolsos` — 8 ocorrência(s)
  - `src/app/(dashboard)/devolucoes/DevolucoesClient.tsx:141`
  - `src/app/(dashboard)/devolucoes/[id]/DevolucaoDetalheClient.tsx:91`
  - `src/app/api/devolucoes/[id]/route.ts:56`
  - `src/app/api/devolucoes/[id]/route.ts:81`
  - `src/lib/reembolso.ts:10`

---

## regras_fiscais

> Matriz fiscal: por NCM x UF destino, define CFOP/CSOSN/CST/aliquotas

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.regras_fiscais_id_seq'::regclass)` | — |
| 2 | `empresa_emitente_id` | integer | ✓ | — | NULL = regra geral (fallback) |
| 3 | `ncm` | character varying(8) | — | — | — |
| 4 | `uf_destino` | character(2) | ✓ | — | NULL = qualquer UF (fallback) |
| 5 | `cfop_saida` | character varying(4) | — | — | — |
| 6 | `cfop_devolucao` | character varying(4) | ✓ | — | — |
| 7 | `csosn` | character varying(4) | ✓ | — | Simples Nacional: 101/102/103/201/202/203/300/400/500/900 |
| 8 | `cst_icms` | character varying(3) | ✓ | — | Usado em devolucao/entrada ou regime nao-Simples |
| 9 | `origem` | smallint | — | `0` | 0=Nacional,1=Importacao direta,2=Importado terceirizado,...8 |
| 10 | `aliq_ibpt_federal` | numeric(5,2) | — | `0` | IBPT federal (Lei 12.741) em % |
| 11 | `aliq_ibpt_estadual` | numeric(5,2) | — | `0` | — |
| 12 | `aliq_ibpt_municipal` | numeric(5,2) | — | `0` | — |
| 13 | `mva_st` | numeric(7,4) | ✓ | — | — |
| 14 | `aliq_icms_st` | numeric(5,2) | ✓ | — | — |
| 15 | `ativo` | boolean | — | `true` | — |
| 16 | `created_at` | timestamp with time zone | — | `now()` | — |
| 17 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `regras_fiscais_pkey` — (`id`)

### Foreign Keys (saída)

- `empresa_emitente_id` → `alissonerp.empresas_emitentes.id` (UPDATE NO ACTION, DELETE NO ACTION)

### CHECK constraints

- `regras_fiscais_origem_check` — `CHECK (((origem >= 0) AND (origem <= 8)))`

### Índices

- `idx_regras_fiscais_ativo` — `CREATE INDEX idx_regras_fiscais_ativo ON alissonerp.regras_fiscais USING btree (ativo) WHERE (ativo = true)`
- `idx_regras_fiscais_ncm` — `CREATE INDEX idx_regras_fiscais_ncm ON alissonerp.regras_fiscais USING btree (ncm)`
- `uq_regras_fiscais_full` — `CREATE UNIQUE INDEX uq_regras_fiscais_full ON alissonerp.regras_fiscais USING btree (empresa_emitente_id, ncm, uf_destino) WHERE ((empresa_emitente_id IS NOT NULL) AND (uf_destino IS NOT NULL))`
- `uq_regras_fiscais_geral` — `CREATE UNIQUE INDEX uq_regras_fiscais_geral ON alissonerp.regras_fiscais USING btree (ncm) WHERE ((empresa_emitente_id IS NULL) AND (uf_destino IS NULL))`
- `uq_regras_fiscais_sem_empresa` — `CREATE UNIQUE INDEX uq_regras_fiscais_sem_empresa ON alissonerp.regras_fiscais USING btree (ncm, uf_destino) WHERE ((empresa_emitente_id IS NULL) AND (uf_destino IS NOT NULL))`
- `uq_regras_fiscais_sem_uf` — `CREATE UNIQUE INDEX uq_regras_fiscais_sem_uf ON alissonerp.regras_fiscais USING btree (empresa_emitente_id, ncm) WHERE ((empresa_emitente_id IS NOT NULL) AND (uf_destino IS NULL))`

**Uso no código:**
- `alissonerp.regras_fiscais` — 2 ocorrência(s)
  - `scripts/apply_145_150_fiscal.mjs:10`
  - `scripts/apply_145_150_fiscal.mjs:45`

---

## reservas_estoque_comercial

**Aprox. linhas:** 38

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.reservas_estoque_comercial_id_seq'::regclass)` | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `venda_id` | integer | — | — | — |
| 4 | `item_venda_id` | integer | — | — | — |
| 5 | `quantidade` | integer | — | — | — |
| 6 | `local_estoque_id` | integer | — | `2` | — |
| 7 | `status` | character varying(20) | — | `'ativo'::character varying` | — |
| 8 | `efetivado_em` | timestamp with time zone | ✓ | — | — |
| 9 | `cancelado_em` | timestamp with time zone | ✓ | — | — |
| 10 | `movimento_id` | integer | ✓ | — | — |
| 11 | `created_by` | uuid | ✓ | — | — |
| 12 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `reservas_estoque_comercial_pkey` — (`id`)

### Foreign Keys (saída)

- `item_venda_id` → `alissonerp.itens_venda_erp.id` (UPDATE NO ACTION, DELETE CASCADE)
- `local_estoque_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `movimento_id` → `alissonerp.movimentacoes_estoque_comercial.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `venda_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `reservas_estoque_comercial_quantidade_check` — `CHECK ((quantidade > 0))`
- `reservas_estoque_comercial_status_check` — `CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying, 'efetivado'::character varying, 'cancelado'::character varying])::text[])))`

### Índices

- `idx_reservas_ec_ativo` — `CREATE INDEX idx_reservas_ec_ativo ON alissonerp.reservas_estoque_comercial USING btree (status) WHERE ((status)::text = 'ativo'::text)`
- `idx_reservas_ec_item` — `CREATE INDEX idx_reservas_ec_item ON alissonerp.reservas_estoque_comercial USING btree (item_venda_id)`
- `idx_reservas_ec_produto` — `CREATE INDEX idx_reservas_ec_produto ON alissonerp.reservas_estoque_comercial USING btree (produto_id)`
- `idx_reservas_ec_status` — `CREATE INDEX idx_reservas_ec_status ON alissonerp.reservas_estoque_comercial USING btree (status)`
- `idx_reservas_ec_venda` — `CREATE INDEX idx_reservas_ec_venda ON alissonerp.reservas_estoque_comercial USING btree (venda_id)`

**Uso no código:**
- `alissonerp.reservas_estoque_comercial` — 32 ocorrência(s) _(amostra abaixo)_
  - `supabase/migrations/140_estoque_comercial_v2.sql:46`
  - `supabase/migrations/140_estoque_comercial_v2.sql:48`
  - `supabase/migrations/140_estoque_comercial_v2.sql:124`
  - `supabase/migrations/140_estoque_comercial_v2.sql:125`
  - `supabase/migrations/140_estoque_comercial_v2.sql:126`

---

## role_permissoes

**Aprox. linhas:** 220

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.role_permissoes_id_seq'::regclass)` | — |
| 2 | `role` | character varying(50) | — | — | — |
| 3 | `modulo` | character varying(50) | — | — | — |
| 4 | `pode_ler` | boolean | — | `false` | — |
| 5 | `pode_escrever` | boolean | — | `false` | — |
| 6 | `criado_em` | timestamp with time zone | — | `now()` | — |
| 7 | `atualizado_em` | timestamp with time zone | — | `now()` | — |
| 8 | `ativo` | boolean | — | `true` | — |

### Chaves

- **PRIMARY KEY** `role_permissoes_pkey` — (`id`)
- **UNIQUE** `role_permissoes_role_modulo_key` — (`role`, `modulo`)

### Índices

- `idx_role_permissoes_modulo` — `CREATE INDEX idx_role_permissoes_modulo ON alissonerp.role_permissoes USING btree (modulo)`
- `idx_role_permissoes_role` — `CREATE INDEX idx_role_permissoes_role ON alissonerp.role_permissoes USING btree (role)`
- `role_permissoes_role_modulo_key` — `CREATE UNIQUE INDEX role_permissoes_role_modulo_key ON alissonerp.role_permissoes USING btree (role, modulo)`

**Uso no código:**
- `alissonerp.role_permissoes` — 13 ocorrência(s)
  - `src/app/api/configuracoes/roles/route.ts:67`
  - `src/app/api/user/permissoes/route.ts:6`
  - `src/components/Sidebar.tsx:125`
  - `src/lib/auth/permissions.ts:122`
  - `src/lib/auth/permissions.ts:165`

---

## roles

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `nome` | character varying(50) | — | — | — |
| 2 | `descricao` | character varying(200) | ✓ | — | — |
| 3 | `ativo` | boolean | — | `true` | — |
| 4 | `criado_em` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `roles_pkey` — (`nome`)

**Uso no código:**
- `alissonerp.roles` — 192 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/admin/fila-sync/page.tsx:3`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:48`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:505`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:507`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:509`

---

## saidas_distribuicao

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.saidas_distribuicao_id_seq'::regclass)` | — |
| 2 | `deposito_id` | integer | ✓ | — | — |
| 3 | `pf` | float4 | ✓ | — | — |
| 4 | `obs` | text | ✓ | — | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `created_by` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `saidas_distribuicao_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.distribuicoes.saida_id` (constraint `distribuicoes_saida_id_fkey`)

_Sem referência identificada no código._

---

## saidas_ordem

**Aprox. linhas:** 418

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.saidas_ordem_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | ✓ | — | — |
| 3 | `deposito_id` | integer | ✓ | — | — |
| 4 | `peso` | float4 | ✓ | — | — |
| 5 | `obs` | text | ✓ | — | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `created_by` | uuid | ✓ | — | — |
| 9 | `metal_externo` | numeric | ✓ | `0` | Peso do metal externo (ouro do cliente) na saída. Descontado do PMC mas não da movimentação de estoque. |

### Chaves

- **PRIMARY KEY** `saidas_ordem_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)

### Referenciada por (entrada)

- `alissonerp.pcp.saida_ordem_id` (constraint `pcp_saida_ordem_id_fkey`)

### Triggers

- `trg_after_saida_ordem` — AFTER INSERT → `alissonerp.fn_processar_saida_ordem` 

**Uso no código:**
- `alissonerp.saidas_ordem` — 12 ocorrência(s)
  - `scripts/backup_pre_golive.mjs:22`
  - `scripts/diag_tabelas_protocolo.mjs:7`
  - `scripts/pre_migration_check.mjs:112`
  - `scripts/pre_reset_check.mjs:18`
  - `scripts/pre_reset_check.mjs:30`

---

## saldo_credito_loja

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.saldo_credito_loja_id_seq'::regclass)` | — |
| 2 | `tipo` | character varying(20) | — | — | — |
| 3 | `valor` | numeric(12,2) | — | — | — |
| 4 | `saldo_antes` | numeric(12,2) | — | — | — |
| 5 | `saldo_depois` | numeric(12,2) | — | — | — |
| 6 | `venda_id` | integer | ✓ | — | — |
| 7 | `pagamento_id` | integer | ✓ | — | — |
| 8 | `descricao` | text | ✓ | — | — |
| 9 | `usuario_id` | uuid | ✓ | — | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `saldo_credito_loja_pkey` — (`id`)

### Foreign Keys (saída)

- `pagamento_id` → `alissonerp.pagamentos_venda.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `venda_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE NO ACTION)

### CHECK constraints

- `saldo_credito_loja_tipo_check` — `CHECK (((tipo)::text = ANY ((ARRAY['debito'::character varying, 'credito'::character varying, 'ajuste'::character varying])::text[])))`

### Índices

- `idx_saldo_credito_created` — `CREATE INDEX idx_saldo_credito_created ON alissonerp.saldo_credito_loja USING btree (created_at DESC)`
- `idx_saldo_credito_pagamento` — `CREATE INDEX idx_saldo_credito_pagamento ON alissonerp.saldo_credito_loja USING btree (pagamento_id) WHERE (pagamento_id IS NOT NULL)`
- `idx_saldo_credito_venda` — `CREATE INDEX idx_saldo_credito_venda ON alissonerp.saldo_credito_loja USING btree (venda_id) WHERE (venda_id IS NOT NULL)`

**Uso no código:**
- `alissonerp.saldo_credito_loja` — 6 ocorrência(s)
  - `scripts/apply_138.mjs:8`
  - `scripts/apply_138.mjs:9`
  - `scripts/apply_138.mjs:90`
  - `scripts/apply_138.mjs:93`
  - `scripts/cleanup_jonathan_teste.mjs:22`

---

## servicos

> Módulo Service v2.13.0: rastreio de serviços e garantias com controle de solda e pedras

**Aprox. linhas:** 235

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.servicos_id_seq'::regclass)` | — |
| 2 | `ordem_id` | integer | — | — | — |
| 3 | `pcp_id` | integer | ✓ | — | — |
| 4 | `operador_id` | integer | ✓ | — | — |
| 5 | `tentativa` | integer | — | `1` | — |
| 6 | `peso_entrada` | numeric(10,2) | — | — | — |
| 7 | `peso_saida` | numeric(10,2) | ✓ | — | — |
| 8 | `usou_solda` | boolean | ✓ | — | — |
| 9 | `peso_fio_antes` | numeric(10,2) | ✓ | — | — |
| 10 | `peso_fio_depois` | numeric(10,2) | ✓ | — | — |
| 11 | `consumo_solda` | numeric(10,2) | ✓ | — | — |
| 12 | `colocou_pedra` | boolean | ✓ | `false` | — |
| 13 | `pedras_colocadas` | jsonb | ✓ | `'[]'::jsonb` | — |
| 14 | `status` | character varying(20) | — | `'aguardando'::character varying` | — |
| 15 | `foto_recebimento` | text | ✓ | — | — |
| 16 | `foto_conclusao` | text | ✓ | — | — |
| 17 | `foto_fio_solda` | text | ✓ | — | — |
| 18 | `recebido_em` | timestamp with time zone | ✓ | — | — |
| 19 | `concluido_em` | timestamp with time zone | ✓ | — | — |
| 20 | `concluido_por` | uuid | ✓ | — | — |
| 21 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 22 | `motivo_reprovacao` | text | ✓ | — | — |
| 23 | `foto_reprovacao` | text | ✓ | — | — |
| 24 | `reprovado_em` | timestamp with time zone | ✓ | — | — |
| 25 | `reprovado_por` | uuid | ✓ | — | — |
| 26 | `transferencia_service_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `servicos_pkey` — (`id`)

### Foreign Keys (saída)

- `operador_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `pcp_id` → `alissonerp.pcp.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `transferencia_service_id` → `alissonerp.transferencias_ordem.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.apontamentos_servico.servico_id` (constraint `apontamentos_servico_servico_id_fkey`)

### Índices

- `idx_servicos_operador` — `CREATE INDEX idx_servicos_operador ON alissonerp.servicos USING btree (operador_id)`
- `idx_servicos_ordem` — `CREATE INDEX idx_servicos_ordem ON alissonerp.servicos USING btree (ordem_id)`
- `idx_servicos_pcp` — `CREATE INDEX idx_servicos_pcp ON alissonerp.servicos USING btree (pcp_id)`
- `idx_servicos_status` — `CREATE INDEX idx_servicos_status ON alissonerp.servicos USING btree (status)`

**Uso no código:**
- `alissonerp.servicos` — 32 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:70`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:433`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:436`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:437`
  - `src/app/(dashboard)/conferencia/ConferenciaClient.tsx:445`

---

## setores

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.setores_id_seq'::regclass)` | — |
| 2 | `nome` | character varying(100) | — | — | — |
| 3 | `ativo` | boolean | ✓ | `true` | — |
| 4 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 5 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 6 | `deposito_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `setores_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.apontamentos_distribuicao.setor_id` (constraint `apontamentos_distribuicao_setor_id_fkey`)
- `alissonerp.apontamentos_pcp.setor_id` (constraint `apontamentos_pcp_setor_id_fkey`)
- `alissonerp.distribuicoes.setor_id` (constraint `distribuicoes_setor_id_fkey`)
- `alissonerp.fechamentos_fabrica.setor_id` (constraint `fechamentos_fabrica_setor_id_fkey`)
- `alissonerp.lancamentos_avulso.setor_id` (constraint `lancamentos_avulso_setor_id_fkey`)
- `alissonerp.movimentacoes_estoque.setor_id` (constraint `movimentacoes_estoque_setor_id_fkey`)
- `alissonerp.ordens.setor_atual` (constraint `ordens_setor_atual_fkey`)
- `alissonerp.transferencias_ordem.setor_id` (constraint `transferencias_ordem_setor_id_fkey`)

**Uso no código:**
- `alissonerp.setores` — 50 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1510`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1531`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1579`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1585`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:1598`

---

## site_config

> Configuração global da loja WooCommerce/WordPress (1 linha: id=1).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `1` | — |
| 2 | `plataforma` | character varying(40) | — | `'woocommerce'::character varying` | — |
| 3 | `site_url` | character varying(255) | ✓ | — | — |
| 4 | `consumer_key` | character varying(255) | ✓ | — | — |
| 5 | `consumer_secret` | character varying(255) | ✓ | — | — |
| 6 | `ativo` | boolean | — | `false` | — |
| 7 | `sincronizar_estoque` | boolean | — | `true` | — |
| 8 | `sincronizar_preco` | boolean | — | `true` | — |
| 9 | `categoria_padrao_wc` | integer | ✓ | — | — |
| 10 | `ultima_sync_at` | timestamp with time zone | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | — | `now()` | — |
| 12 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `site_config_pkey` — (`id`)

### CHECK constraints

- `site_config_id_check` — `CHECK ((id = 1))`

### Triggers

- `trg_site_config_updated_at` — BEFORE UPDATE → `alissonerp.fn_touch_updated_at` 

**Uso no código:**
- `alissonerp.site_config` — 8 ocorrência(s)
  - `src/app/api/site/config/route.ts:27`
  - `src/app/api/site/config/route.ts:91`
  - `src/app/api/site/sync/route.ts:68`
  - `src/app/api/site/sync/route.ts:96`
  - `src/app/api/site/sync/[id]/route.ts:48`

---

## site_produtos

> Mapping produto_id ↔ wc_product_id com status de sincronização.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.site_produtos_id_seq'::regclass)` | — |
| 2 | `produto_id` | integer | — | — | — |
| 3 | `sku` | character varying(120) | — | — | — |
| 4 | `wc_product_id` | integer | ✓ | — | — |
| 5 | `wc_permalink` | character varying(500) | ✓ | — | — |
| 6 | `publicado_no_site` | boolean | — | `false` | — |
| 7 | `status_sync` | character varying(20) | — | `'pendente'::character varying` | — |
| 8 | `hash_enviado` | character varying(64) | ✓ | — | — |
| 9 | `ultimo_erro` | text | ✓ | — | — |
| 10 | `ultima_tentativa_at` | timestamp with time zone | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | — | `now()` | — |
| 12 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `site_produtos_pkey` — (`id`)
- **UNIQUE** `site_produtos_produto_id_unique` — (`produto_id`)

### Índices

- `idx_site_produtos_sku` — `CREATE INDEX idx_site_produtos_sku ON alissonerp.site_produtos USING btree (sku)`
- `idx_site_produtos_status` — `CREATE INDEX idx_site_produtos_status ON alissonerp.site_produtos USING btree (status_sync) WHERE (publicado_no_site = true)`
- `site_produtos_produto_id_unique` — `CREATE UNIQUE INDEX site_produtos_produto_id_unique ON alissonerp.site_produtos USING btree (produto_id)`

### Triggers

- `trg_site_produtos_updated_at` — BEFORE UPDATE → `alissonerp.fn_touch_updated_at` 

**Uso no código:**
- `alissonerp.site_produtos` — 10 ocorrência(s)
  - `src/app/(dashboard)/site/SiteClient.tsx:116`
  - `src/app/api/site/produtos/route.ts:37`
  - `src/app/api/site/produtos/[id]/route.ts:40`
  - `src/app/api/site/sync/route.ts:67`
  - `src/app/api/site/sync/route.ts:97`

---

## solicitacoes_desconto

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.solicitacoes_desconto_id_seq'::regclass)` | — |
| 2 | `venda_id` | integer | ✓ | — | — |
| 3 | `item_id` | integer | ✓ | — | — |
| 4 | `produto_nome` | text | — | — | — |
| 5 | `preco_lista` | numeric(12,2) | — | — | — |
| 6 | `pct_desconto_solicitado` | numeric(5,2) | — | — | — |
| 7 | `preco_solicitado` | numeric(12,2) | — | — | — |
| 8 | `status` | text | — | `'pendente'::text` | — |
| 9 | `solicitado_por_id` | uuid | ✓ | — | — |
| 10 | `solicitado_por_nome` | text | ✓ | — | — |
| 11 | `autorizado_por_id` | uuid | ✓ | — | — |
| 12 | `autorizado_por_nome` | text | ✓ | — | — |
| 13 | `observacao` | text | ✓ | — | — |
| 14 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 15 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `solicitacoes_desconto_pkey` — (`id`)

### Foreign Keys (saída)

- `item_id` → `alissonerp.itens_venda_erp.id` (UPDATE NO ACTION, DELETE SET NULL)
- `venda_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE SET NULL)

### CHECK constraints

- `solicitacoes_desconto_status_check` — `CHECK ((status = ANY (ARRAY['pendente'::text, 'aprovado'::text, 'rejeitado'::text])))`

### Índices

- `solicitacoes_desconto_item_id_idx` — `CREATE INDEX solicitacoes_desconto_item_id_idx ON alissonerp.solicitacoes_desconto USING btree (item_id)`
- `solicitacoes_desconto_status_idx` — `CREATE INDEX solicitacoes_desconto_status_idx ON alissonerp.solicitacoes_desconto USING btree (status) WHERE (status = 'pendente'::text)`
- `solicitacoes_desconto_venda_id_idx` — `CREATE INDEX solicitacoes_desconto_venda_id_idx ON alissonerp.solicitacoes_desconto USING btree (venda_id)`

**Uso no código:**
- `alissonerp.solicitacoes_desconto` — 1 ocorrência(s)
  - `scripts/sync_db.mjs:21`

---

## tarefas

**Aprox. linhas:** 40

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.tarefas_id_seq'::regclass)` | — |
| 2 | `titulo` | text | — | — | — |
| 3 | `descricao` | text | ✓ | — | — |
| 4 | `responsavel_id` | uuid | ✓ | — | — |
| 5 | `criado_por` | uuid | ✓ | — | — |
| 6 | `prioridade` | character varying(10) | — | `'media'::character varying` | — |
| 7 | `status` | character varying(20) | — | `'pendente'::character varying` | — |
| 8 | `data_limite` | date | ✓ | — | — |
| 9 | `ordem_id` | integer | ✓ | — | — |
| 10 | `tags` | _text | ✓ | `'{}'::text[]` | — |
| 11 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 12 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 13 | `concluida_em` | timestamp with time zone | ✓ | — | — |
| 14 | `posicao` | integer | ✓ | `0` | — |
| 15 | `venda_id` | integer | ✓ | — | — |
| 16 | `tipo` | text | ✓ | — | — |
| 17 | `peso_metal` | numeric | ✓ | — | — |
| 18 | `ordem_ids` | _int8 | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `tarefas_pkey` — (`id`)

### Foreign Keys (saída)

- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `venda_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.aprovacoes_tarefa.tarefa_id` (constraint `aprovacoes_tarefa_tarefa_id_fkey`)
- `alissonerp.automacoes_execucoes.tarefa_id` (constraint `automacoes_execucoes_tarefa_id_fkey`)
- `alissonerp.comentarios_tarefa.tarefa_id` (constraint `comentarios_tarefa_tarefa_id_fkey`)
- `alissonerp.devolucoes_venda.tarefa_id` (constraint `devolucoes_venda_tarefa_id_fkey`)
- `alissonerp.vendas_erp.aprovacao_credito_tarefa_id` (constraint `vendas_erp_aprovacao_credito_tarefa_id_fkey`)

### CHECK constraints

- `tarefas_prioridade_check` — `CHECK (((prioridade)::text = ANY ((ARRAY['baixa'::character varying, 'media'::character varying, 'alta'::character varying, 'urgente'::character varying])::text[])))`
- `tarefas_status_check` — `CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'em_andamento'::character varying, 'concluida'::character varying, 'cancelada'::character varying, 'aguardando_aprovacao'::character varying])::text[])))`

### Índices

- `idx_tarefas_data_limite` — `CREATE INDEX idx_tarefas_data_limite ON alissonerp.tarefas USING btree (data_limite)`
- `idx_tarefas_ordem` — `CREATE INDEX idx_tarefas_ordem ON alissonerp.tarefas USING btree (ordem_id)`
- `idx_tarefas_responsavel` — `CREATE INDEX idx_tarefas_responsavel ON alissonerp.tarefas USING btree (responsavel_id)`
- `idx_tarefas_status` — `CREATE INDEX idx_tarefas_status ON alissonerp.tarefas USING btree (status)`
- `idx_tarefas_venda` — `CREATE INDEX idx_tarefas_venda ON alissonerp.tarefas USING btree (venda_id) WHERE (venda_id IS NOT NULL)`

### Triggers

- `trg_updated_at_tarefas` — BEFORE UPDATE → `alissonerp.fn_updated_at_tarefas` 

**Uso no código:**
- `alissonerp.tarefas` — 68 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/devolucoes/[id]/DevolucaoDetalheClient.tsx:373`
  - `src/app/(dashboard)/tarefas/AutomacoesTab.tsx:209`
  - `src/app/(dashboard)/tarefas/TarefaDrawer.tsx:84`
  - `src/app/(dashboard)/tarefas/TarefaDrawer.tsx:94`
  - `src/app/(dashboard)/tarefas/TarefaDrawer.tsx:108`

---

## teores_ouro

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.teores_ouro_id_seq'::regclass)` | — |
| 2 | `insumo_id` | integer | — | — | — |
| 3 | `nome` | character varying(100) | — | — | — |
| 4 | `teor` | numeric(5,4) | — | — | — |
| 5 | `ativo` | boolean | ✓ | `true` | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **UNIQUE** `teores_ouro_insumo_id_key` — (`insumo_id`)
- **PRIMARY KEY** `teores_ouro_pkey` — (`id`)

### Foreign Keys (saída)

- `insumo_id` → `alissonerp.insumos.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `teores_ouro_insumo_id_key` — `CREATE UNIQUE INDEX teores_ouro_insumo_id_key ON alissonerp.teores_ouro USING btree (insumo_id)`

**Uso no código:**
- `alissonerp.teores_ouro` — 1 ocorrência(s)
  - `supabase/migrations/085_ligacao.sql:31`

---

## tiny_sync_produtos

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `produto_id` | bigint | — | — | — |
| 2 | `operacao` | text | — | — | — |
| 3 | `status` | text | — | `'pendente'::text` | — |
| 4 | `tentativas` | integer | — | `0` | — |
| 5 | `erro` | text | ✓ | — | — |
| 6 | `created_at` | timestamp with time zone | — | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `tiny_sync_produtos_pkey` — (`produto_id`)

### CHECK constraints

- `tiny_sync_produtos_operacao_check` — `CHECK ((operacao = ANY (ARRAY['create'::text, 'update'::text])))`
- `tiny_sync_produtos_status_check` — `CHECK ((status = ANY (ARRAY['pendente'::text, 'processando'::text, 'ok'::text, 'erro'::text])))`

### Índices

- `idx_tiny_sync_produtos_status` — `CREATE INDEX idx_tiny_sync_produtos_status ON alissonerp.tiny_sync_produtos USING btree (status, updated_at)`

_Sem referência identificada no código._

---

## tipos_apontamento

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.tipos_apontamento_id_seq'::regclass)` | — |
| 2 | `descricao` | character varying(100) | — | — | — |
| 3 | `scope` | enum_tipo_apontamento_scope | — | — | — |
| 4 | `ativo` | boolean | ✓ | `true` | — |
| 5 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `tipos_apontamento_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.apontamentos_distribuicao.tipo_apontamento_id` (constraint `apontamentos_distribuicao_tipo_apontamento_id_fkey`)
- `alissonerp.apontamentos_pcp.tipo_apontamento_id` (constraint `apontamentos_pcp_tipo_apontamento_id_fkey`)

**Uso no código:**
- `alissonerp.tipos_apontamento` — 10 ocorrência(s)
  - `scripts/pre_reset_check.mjs:50`
  - `scripts/pre_reset_check.mjs:89`
  - `scripts/validar_golive.mjs:71`
  - `scripts/validar_golive.mjs:76`
  - `scripts/validar_migracao.mjs:157`

---

## tipos_servico

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.tipos_servico_id_seq'::regclass)` | — |
| 2 | `nome` | text | — | — | — |
| 3 | `ativo` | boolean | — | `true` | — |
| 4 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `tipos_servico_pkey` — (`id`)

**Uso no código:**
- `alissonerp.tipos_servico` — 7 ocorrência(s)
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:141`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4719`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4735`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:4795`
  - `src/app/api/service/[id]/route.ts:96`

---

## transferencias_estoque_comercial

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.transferencias_estoque_comercial_id_seq'::regclass)` | — |
| 2 | `produto_id` | bigint | — | — | — |
| 3 | `quantidade` | integer | — | — | — |
| 4 | `local_origem_id` | integer | — | — | — |
| 5 | `local_destino_id` | integer | — | — | — |
| 6 | `status` | character varying(20) | — | `'pendente'::character varying` | — |
| 7 | `obs` | text | ✓ | — | — |
| 8 | `enviado_por` | uuid | ✓ | — | — |
| 9 | `recebido_por` | uuid | ✓ | — | — |
| 10 | `recebido_em` | timestamp with time zone | ✓ | — | — |
| 11 | `cancelado_em` | timestamp with time zone | ✓ | — | — |
| 12 | `movimento_saida_id` | integer | ✓ | — | — |
| 13 | `movimento_entrada_id` | integer | ✓ | — | — |
| 14 | `created_by` | uuid | ✓ | — | — |
| 15 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `transferencias_estoque_comercial_pkey` — (`id`)

### Foreign Keys (saída)

- `local_destino_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `local_origem_id` → `alissonerp.locais_estoque.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `movimento_entrada_id` → `alissonerp.movimentacoes_estoque_comercial.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `movimento_saida_id` → `alissonerp.movimentacoes_estoque_comercial.id` (UPDATE NO ACTION, DELETE NO ACTION)

### CHECK constraints

- `transferencias_estoque_comercial_check` — `CHECK ((local_origem_id <> local_destino_id))`
- `transferencias_estoque_comercial_quantidade_check` — `CHECK ((quantidade > 0))`
- `transferencias_estoque_comercial_status_check` — `CHECK (((status)::text = ANY ((ARRAY['pendente'::character varying, 'concluido'::character varying, 'cancelado'::character varying])::text[])))`

### Índices

- `idx_transf_ec_produto` — `CREATE INDEX idx_transf_ec_produto ON alissonerp.transferencias_estoque_comercial USING btree (produto_id)`
- `idx_transf_ec_status` — `CREATE INDEX idx_transf_ec_status ON alissonerp.transferencias_estoque_comercial USING btree (status) WHERE ((status)::text = 'pendente'::text)`

**Uso no código:**
- `alissonerp.transferencias_estoque_comercial` — 20 ocorrência(s)
  - `scripts/apply_145_150_fiscal.mjs:60`
  - `scripts/check_fiscal_s5.mjs:15`
  - `scripts/check_fiscal_s5.mjs:16`
  - `scripts/check_schemas.mjs:4`
  - `supabase/migrations/140_estoque_comercial_v2.sql:65`

---

## transferencias_ordem

**Aprox. linhas:** 348

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.transferencias_ordem_id_seq'::regclass)` | — |
| 2 | `pcp_id` | integer | ✓ | — | — |
| 3 | `ordem_id` | integer | ✓ | — | — |
| 4 | `setor_id` | integer | ✓ | — | — |
| 5 | `deposito_id` | integer | ✓ | — | — |
| 6 | `obs` | text | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 8 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `created_by` | uuid | ✓ | — | — |
| 10 | `tipo_transferencia` | character varying(20) | ✓ | `'interna'::character varying` | — |
| 11 | `protocolo_id` | integer | ✓ | — | — |
| 12 | `deposito_origem_id` | integer | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `transferencias_ordem_pkey` — (`id`)

### Foreign Keys (saída)

- `deposito_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `deposito_origem_id` → `alissonerp.depositos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `ordem_id` → `alissonerp.ordens.id` (UPDATE NO ACTION, DELETE SET NULL)
- `pcp_id` → `alissonerp.pcp.id` (UPDATE NO ACTION, DELETE SET NULL)
- `protocolo_id` → `alissonerp.protocolos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `setor_id` → `alissonerp.setores.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.servicos.transferencia_service_id` (constraint `servicos_transferencia_service_id_fkey`)

### Triggers

- `trg_after_transferencia_ordem` — AFTER INSERT/UPDATE → `alissonerp.fn_processar_transferencia` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 1
  - `admin_full_transf` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`

**Uso no código:**
- `alissonerp.transferencias_ordem` — 14 ocorrência(s)
  - `src/app/api/pcp/transferir/route.ts:16`
  - `src/app/api/pcp/transferir/route.ts:188`
  - `src/app/api/pcp/transferir-service/route.ts:8`
  - `src/app/api/pcp/transferir-service/route.ts:111`
  - `src/app/api/service/[id]/transferir/route.ts:9`

---

## user_views

> Filtros nomeados por usuario/modulo (Inteligencia de Estoque e futuros dashboards)

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.user_views_id_seq'::regclass)` | — |
| 2 | `user_auth_id` | uuid | — | — | — |
| 3 | `scope` | text | — | — | — |
| 4 | `nome` | text | — | — | — |
| 5 | `filtros` | jsonb | — | — | — |
| 6 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 7 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `user_views_pkey` — (`id`)
- **UNIQUE** `user_views_user_auth_id_scope_nome_key` — (`user_auth_id`, `scope`, `nome`)

### Índices

- `idx_user_views_user_scope` — `CREATE INDEX idx_user_views_user_scope ON alissonerp.user_views USING btree (user_auth_id, scope)`
- `user_views_user_auth_id_scope_nome_key` — `CREATE UNIQUE INDEX user_views_user_auth_id_scope_nome_key ON alissonerp.user_views USING btree (user_auth_id, scope, nome)`

### Triggers

- `trg_user_views_touch` — BEFORE UPDATE → `alissonerp.fn_user_views_touch_updated` 

_Sem referência identificada no código._

---

## uso_maquina_reserva

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.uso_maquina_reserva_id_seq'::regclass)` | — |
| 2 | `venda_id` | bigint | ✓ | — | — |
| 3 | `vendedor_id` | bigint | — | — | — |
| 4 | `device_id_reserva` | text | — | — | — |
| 5 | `justificativa` | text | — | — | — |
| 6 | `created_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `uso_maquina_reserva_pkey` — (`id`)

_Sem referência identificada no código._

---

## usuarios

**Aprox. linhas:** 22

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `email` | character varying(255) | — | — | — |
| 3 | `nome` | character varying(255) | — | — | — |
| 4 | `role` | character varying(50) | — | `'ourives'::character varying` | — |
| 5 | `vendedor_id` | bigint | ✓ | — | — |
| 6 | `mx_desconto_permitido` | numeric(5,2) | ✓ | `0` | — |
| 7 | `ativo` | boolean | ✓ | `true` | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |
| 9 | `updated_at` | timestamp with time zone | ✓ | `now()` | — |
| 10 | `deposito_id` | integer | ✓ | — | — |
| 11 | `tipos_ordem_permitidos` | jsonb | ✓ | `'[]'::jsonb` | — |
| 12 | `is_operador_service` | boolean | ✓ | `false` | Flag: usuário tem acesso ao app Service (dark mobile). Independente da role. |
| 13 | `tipos_protocolo_permitidos` | jsonb | ✓ | `'[]'::jsonb` | Array de tipos de protocolo que o usuário pode criar: ["fabrica","service"]. Vazio = sem permissão. Admin/dev ignoram. |
| 14 | `is_transportador` | boolean | — | `false` | — |
| 15 | `notif_alarme_silenciado_ate` | timestamp with time zone | ✓ | — | — |
| 16 | `parcelas_padrao_mp` | integer | — | `1` | — |

### Chaves

- **UNIQUE** `usuarios_email_key` — (`email`)
- **PRIMARY KEY** `usuarios_pkey` — (`id`)

### Referenciada por (entrada)

- `alissonerp.dashboard_configs.usuario_id` (constraint `dashboard_configs_usuario_id_fkey`)
- `alissonerp.joias_leituras.operador` (constraint `joias_leituras_operador_fkey`)
- `alissonerp.joias_rfid.criado_por` (constraint `joias_rfid_criado_por_fkey`)
- `alissonerp.notificacoes.usuario_id` (constraint `notificacoes_user_id_fkey`)
- `alissonerp.ordem_comentario_mencoes.user_id_mencionado` (constraint `ordem_comentario_mencoes_user_id_mencionado_fkey`)
- `alissonerp.ordem_comentario_mencoes.user_id_mencionador` (constraint `ordem_comentario_mencoes_user_id_mencionador_fkey`)
- `alissonerp.ordem_comentarios.user_id` (constraint `ordem_comentarios_user_id_fkey`)
- `alissonerp.parametros_sistema.atualizado_por` (constraint `parametros_sistema_atualizado_por_fkey`)
- `alissonerp.permissoes_usuario.usuario_id` (constraint `permissoes_usuario_usuario_id_fkey`)

### CHECK constraints

- `usuarios_parcelas_padrao_mp_check` — `CHECK (((parcelas_padrao_mp >= 1) AND (parcelas_padrao_mp <= 12)))`

### Índices

- `usuarios_email_key` — `CREATE UNIQUE INDEX usuarios_email_key ON alissonerp.usuarios USING btree (email)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 3
  - `admin_full_usuarios` (ALL, PERMISSIVE) roles=authenticated
    USING: `((alissonerp.fn_user_role())::text = 'admin'::text)`
    WITH CHECK: `((alissonerp.fn_user_role())::text = 'admin'::text)`
  - `user_own_profile` (SELECT, PERMISSIVE) roles=authenticated
    USING: `(id = auth.uid())`
  - `usuarios_select_own` (SELECT, PERMISSIVE) roles=public
    USING: `((id = auth.uid()) OR ((alissonerp.fn_user_role())::text = 'admin'::text))`

**Uso no código:**
- `alissonerp.usuarios` — 74 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:135`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:141`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:457`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:458`
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:490`

---

## vale_troca

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.vale_troca_id_seq'::regclass)` | — |
| 2 | `numero` | character varying(20) | — | — | — |
| 3 | `devolucao_id` | integer | ✓ | — | — |
| 4 | `cliente_id` | integer | ✓ | — | — |
| 5 | `valor_original` | numeric(12,2) | — | — | — |
| 6 | `valor_disponivel` | numeric(12,2) | — | — | — |
| 7 | `status` | character varying(20) | — | `'ativo'::character varying` | — |
| 8 | `venda_utilizado_id` | integer | ✓ | — | — |
| 9 | `utilizado_em` | timestamp with time zone | ✓ | — | — |
| 10 | `vale_origem_id` | integer | ✓ | — | — |
| 11 | `created_at` | timestamp with time zone | — | `now()` | — |
| 12 | `created_by` | uuid | ✓ | — | — |

### Chaves

- **UNIQUE** `vale_troca_numero_key` — (`numero`)
- **PRIMARY KEY** `vale_troca_pkey` — (`id`)

### Foreign Keys (saída)

- `devolucao_id` → `alissonerp.devolucoes_venda.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `vale_origem_id` → `alissonerp.vale_troca.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `venda_utilizado_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.pagamentos_venda.vale_troca_id` (constraint `pagamentos_venda_vale_troca_id_fkey`)
- `alissonerp.vale_troca.vale_origem_id` (constraint `vale_troca_vale_origem_id_fkey`)

### CHECK constraints

- `vale_troca_status_check` — `CHECK (((status)::text = ANY ((ARRAY['ativo'::character varying, 'utilizado'::character varying, 'cancelado'::character varying])::text[])))`

### Índices

- `idx_vale_troca_cliente` — `CREATE INDEX idx_vale_troca_cliente ON alissonerp.vale_troca USING btree (cliente_id) WHERE (cliente_id IS NOT NULL)`
- `idx_vale_troca_devolucao` — `CREATE INDEX idx_vale_troca_devolucao ON alissonerp.vale_troca USING btree (devolucao_id) WHERE (devolucao_id IS NOT NULL)`
- `idx_vale_troca_numero` — `CREATE INDEX idx_vale_troca_numero ON alissonerp.vale_troca USING btree (numero)`
- `idx_vale_troca_origem` — `CREATE INDEX idx_vale_troca_origem ON alissonerp.vale_troca USING btree (vale_origem_id) WHERE (vale_origem_id IS NOT NULL)`
- `idx_vale_troca_status` — `CREATE INDEX idx_vale_troca_status ON alissonerp.vale_troca USING btree (status)`
- `vale_troca_numero_key` — `CREATE UNIQUE INDEX vale_troca_numero_key ON alissonerp.vale_troca USING btree (numero)`

**Uso no código:**
- `alissonerp.vale_troca` — 37 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/devolucoes/DevolucoesClient.tsx:26`
  - `src/app/(dashboard)/devolucoes/DevolucoesClient.tsx:62`
  - `src/app/(dashboard)/devolucoes/nova/NovaDevolucaoClient.tsx:43`
  - `src/app/(dashboard)/devolucoes/nova/NovaDevolucaoClient.tsx:75`
  - `src/app/(dashboard)/devolucoes/nova/NovaDevolucaoClient.tsx:487`

---

## vendas_erp

**Aprox. linhas:** 14548

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.vendas_erp_id_seq'::regclass)` | — |
| 2 | `numero_venda` | text | — | — | — |
| 3 | `cliente_id` | bigint | ✓ | — | — |
| 4 | `vendedor_id` | bigint | ✓ | — | — |
| 5 | `data_venda` | date | — | `CURRENT_DATE` | — |
| 6 | `data_entrega` | date | ✓ | — | — |
| 7 | `total_produtos` | numeric(12,2) | — | `0` | — |
| 8 | `total_desconto` | numeric(12,2) | — | `0` | — |
| 9 | `total_frete` | numeric(12,2) | — | `0` | — |
| 10 | `total_venda` | numeric(12,2) | — | `0` | — |
| 11 | `total_comissao` | numeric(12,2) | — | `0` | — |
| 12 | `situacao` | character varying(20) | — | `'rascunho'::character varying` | — |
| 13 | `forma_envio` | character varying(50) | ✓ | — | — |
| 14 | `forma_frete` | character varying(50) | ✓ | — | — |
| 15 | `observacoes` | text | ✓ | — | — |
| 16 | `observacoes_internas` | text | ✓ | — | — |
| 17 | `tiny_pedido_id` | bigint | ✓ | — | — |
| 18 | `tiny_sync_status` | character varying(20) | ✓ | `'pendente'::character varying` | — |
| 19 | `tiny_sync_at` | timestamp with time zone | ✓ | — | — |
| 20 | `tiny_sync_erro` | text | ✓ | — | — |
| 21 | `bloqueado` | boolean | — | `false` | — |
| 22 | `created_by` | uuid | ✓ | — | — |
| 23 | `created_at` | timestamp with time zone | — | `now()` | — |
| 24 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 25 | `video_obs_interna` | text | ✓ | — | — |
| 26 | `token_compartilhamento` | uuid | ✓ | `gen_random_uuid()` | — |
| 27 | `public_venda_id` | integer | ✓ | — | — |
| 28 | `orcamento_id` | integer | ✓ | — | — |
| 29 | `endereco_entrega` | text | ✓ | — | — |
| 30 | `endereco_entrega_numero` | text | ✓ | — | — |
| 31 | `endereco_entrega_complemento` | text | ✓ | — | — |
| 32 | `endereco_entrega_bairro` | text | ✓ | — | — |
| 33 | `endereco_entrega_cidade` | text | ✓ | — | — |
| 34 | `endereco_entrega_cep` | text | ✓ | — | — |
| 35 | `endereco_entrega_uf` | character varying(2) | ✓ | — | — |
| 36 | `credito_gerente_usado` | numeric(12,2) | ✓ | `0` | — |
| 37 | `aprovacao_credito_tipo` | character varying(20) | ✓ | — | — |
| 38 | `aprovacao_credito_tarefa_id` | integer | ✓ | — | — |
| 39 | `empresa_emitente_id` | integer | ✓ | — | CNPJ que emite a NFC-e desta venda (derivado do vendedor/loja) |
| 40 | `nota_fiscal_id` | integer | ✓ | — | FK logica para alissonerp.notas_fiscais.id (FK fisica adicionada em 149) |
| 41 | `nfce_numero` | integer | ✓ | — | — |
| 42 | `nfce_chave_44` | character varying(44) | ✓ | — | Chave de acesso de 44 digitos (snapshot — fonte de verdade fica em notas_fiscais) |
| 43 | `nfce_emitida_em` | timestamp with time zone | ✓ | — | — |
| 44 | `tipo_venda` | text | ✓ | — | — |
| 45 | `numero_rastreio` | text | ✓ | — | — |
| 46 | `venda_garantia_id` | integer | ✓ | — | — |
| 47 | `desconto_aprovado_por` | uuid | ✓ | — | — |
| 48 | `desconto_aprovado_em` | timestamp with time zone | ✓ | — | — |

### Chaves

- **UNIQUE** `vendas_erp_numero_venda_key` — (`numero_venda`)
- **PRIMARY KEY** `vendas_erp_pkey` — (`id`)

### Foreign Keys (saída)

- `nota_fiscal_id` → `alissonerp.notas_fiscais.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `aprovacao_credito_tarefa_id` → `alissonerp.tarefas.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `empresa_emitente_id` → `alissonerp.empresas_emitentes.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `orcamento_id` → `alissonerp.orcamentos.id` (UPDATE NO ACTION, DELETE NO ACTION)
- `venda_garantia_id` → `alissonerp.vendas_erp.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Referenciada por (entrada)

- `alissonerp.contas_receber.venda_erp_id` (constraint `contas_receber_venda_erp_id_fkey`)
- `alissonerp.devolucoes_venda.venda_id` (constraint `devolucoes_venda_venda_id_fkey`)
- `alissonerp.itens_venda_erp.venda_id` (constraint `itens_venda_erp_venda_id_fkey`)
- `alissonerp.notificacoes.venda_id` (constraint `notificacoes_venda_id_fkey`)
- `alissonerp.orcamentos.venda_gerada_id` (constraint `orcamentos_venda_gerada_id_fkey`)
- `alissonerp.ordens.venda_id` (constraint `ordens_venda_id_fkey`)
- `alissonerp.pagamentos_venda.venda_id` (constraint `pagamentos_venda_venda_id_fkey`)
- `alissonerp.reservas_estoque_comercial.venda_id` (constraint `reservas_estoque_comercial_venda_id_fkey`)
- `alissonerp.saldo_credito_loja.venda_id` (constraint `saldo_credito_loja_venda_id_fkey`)
- `alissonerp.solicitacoes_desconto.venda_id` (constraint `solicitacoes_desconto_venda_id_fkey`)
- `alissonerp.tarefas.venda_id` (constraint `tarefas_venda_id_fkey`)
- `alissonerp.vale_troca.venda_utilizado_id` (constraint `vale_troca_venda_utilizado_id_fkey`)
- `alissonerp.vendas_erp.venda_garantia_id` (constraint `vendas_erp_venda_garantia_id_fkey`)

### CHECK constraints

- `vendas_erp_tipo_venda_check` — `CHECK ((tipo_venda = ANY (ARRAY['produto'::text, 'servico'::text, 'fabricacao'::text, 'garantia'::text])))`

### Índices

- `idx_vendas_erp_empresa_emitente` — `CREATE INDEX idx_vendas_erp_empresa_emitente ON alissonerp.vendas_erp USING btree (empresa_emitente_id) WHERE (empresa_emitente_id IS NOT NULL)`
- `idx_vendas_erp_nfce_chave` — `CREATE INDEX idx_vendas_erp_nfce_chave ON alissonerp.vendas_erp USING btree (nfce_chave_44) WHERE (nfce_chave_44 IS NOT NULL)`
- `idx_vendas_erp_public_venda_id` — `CREATE UNIQUE INDEX idx_vendas_erp_public_venda_id ON alissonerp.vendas_erp USING btree (public_venda_id) WHERE (public_venda_id IS NOT NULL)`
- `idx_vendas_orcamento` — `CREATE INDEX idx_vendas_orcamento ON alissonerp.vendas_erp USING btree (orcamento_id) WHERE (orcamento_id IS NOT NULL)`
- `vendas_erp_numero_venda_key` — `CREATE UNIQUE INDEX vendas_erp_numero_venda_key ON alissonerp.vendas_erp USING btree (numero_venda)`

### Triggers

- `trg_aa_proteger_venda_fechada` — BEFORE UPDATE → `alissonerp.fn_proteger_venda_fechada` (DISABLED)
- `trg_bloquear_venda` — BEFORE UPDATE → `alissonerp.fn_bloquear_venda` 
- `trg_estoque_comercial_cancelamento_venda` — BEFORE UPDATE → `alissonerp.fn_estoque_comercial_cancelamento_venda` 
- `trg_estoque_comercial_entrega_venda` — BEFORE UPDATE → `alissonerp.fn_estoque_comercial_entrega_venda` 
- `trg_updated_at_vendas_erp` — BEFORE UPDATE → `alissonerp.fn_updated_at_vendas_erp` 
- `trg_venda_cancelar_conta_receber` — BEFORE UPDATE → `alissonerp.fn_venda_cancelar_conta_receber` 
- `trg_venda_gerar_conta_receber` — AFTER UPDATE → `alissonerp.fn_venda_gerar_conta_receber` 
- `trg_venda_gerar_conta_receber_insert` — AFTER INSERT → `alissonerp.fn_venda_gerar_conta_receber_on_insert` 

**Uso no código:**
- `alissonerp.vendas_erp` — 111 ocorrência(s) _(amostra abaixo)_
  - `src/app/(dashboard)/fiscal/notas/NotasFiscaisClient.tsx:78`
  - `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx:419`
  - `src/app/api/fiscal/emitir/nfce/route.ts:180`
  - `src/app/api/fiscal/notas/[id]/cancelar/route.ts:202`
  - `src/app/api/fiscal/webhook/focus/route.ts:82`

---

## vendedores_fiscais

> Vinculo fiscal vendedor x empresa emitente. PK = public.vendedores.id_vendedor (FK logica).

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id_vendedor` | bigint | — | — | Ref logica a public.vendedores.id_vendedor (sem FK fisica) |
| 2 | `empresa_emitente_id` | integer | ✓ | — | CNPJ emitente que este vendedor representa (NULL = generico/fabrica) |
| 3 | `updated_at` | timestamp with time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `vendedores_fiscais_pkey` — (`id_vendedor`)

### Foreign Keys (saída)

- `empresa_emitente_id` → `alissonerp.empresas_emitentes.id` (UPDATE NO ACTION, DELETE NO ACTION)

### Índices

- `idx_vendedores_fiscais_empresa` — `CREATE INDEX idx_vendedores_fiscais_empresa ON alissonerp.vendedores_fiscais USING btree (empresa_emitente_id) WHERE (empresa_emitente_id IS NOT NULL)`

**Uso no código:**
- `alissonerp.vendedores_fiscais` — 1 ocorrência(s)
  - `supabase/migrations/147_fiscal_produtos_contatos_fiscais.sql:78`

---

## webhook_config

> Configuracao dos 9 webhooks n8n. URLs e status.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | integer | — | `nextval('alissonerp.webhook_config_id_seq'::regclass)` | — |
| 2 | `nome` | character varying(50) | — | — | — |
| 3 | `url` | text | — | — | — |
| 4 | `ativo` | boolean | ✓ | `true` | — |
| 5 | `descricao` | text | ✓ | — | — |
| 6 | `ultimo_disparo` | timestamp with time zone | ✓ | — | — |
| 7 | `total_disparos` | integer | ✓ | `0` | — |
| 8 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **UNIQUE** `webhook_config_nome_key` — (`nome`)
- **PRIMARY KEY** `webhook_config_pkey` — (`id`)

### Índices

- `webhook_config_nome_key` — `CREATE UNIQUE INDEX webhook_config_nome_key ON alissonerp.webhook_config USING btree (nome)`

**Uso no código:**
- `alissonerp.webhook_config` — 9 ocorrência(s)
  - `src/app/(dashboard)/configuracoes/ConfiguracoesClient.tsx:275`
  - `src/lib/webhooks.ts:16`
  - `scripts/apply_135.mjs:2`
  - `scripts/apply_135.mjs:23`
  - `scripts/apply_135.mjs:142`

---

## webhook_log

> Log de todos os disparos de webhooks.

**Aprox. linhas:** 239

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | bigint | — | `nextval('alissonerp.webhook_log_id_seq'::regclass)` | — |
| 2 | `webhook_nome` | character varying(50) | ✓ | — | — |
| 3 | `payload` | jsonb | ✓ | — | — |
| 4 | `response_status` | integer | ✓ | — | — |
| 5 | `response_body` | text | ✓ | — | — |
| 6 | `erro` | text | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | `now()` | — |

### Chaves

- **PRIMARY KEY** `webhook_log_pkey` — (`id`)

### Índices

- `idx_wh_log_data` — `CREATE INDEX idx_wh_log_data ON alissonerp.webhook_log USING btree (created_at)`
- `idx_wh_log_nome` — `CREATE INDEX idx_wh_log_nome ON alissonerp.webhook_log USING btree (webhook_nome)`

**Uso no código:**
- `alissonerp.webhook_log` — 5 ocorrência(s)
  - `src/app/api/webhooks/mercado-pago/route.ts:13`
  - `src/lib/webhooks.ts:43`
  - `scripts/diagnose_pix_502.mjs:34`
  - `scripts/diagnose_pix_aguardando.mjs:35`
  - `supabase/migrations/135_mercado_pago_integracao.sql:18`

---

