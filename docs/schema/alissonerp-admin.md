# Schema alissonerp — admin

> Gerado em: 2026-04-29 | Tabelas: 16

## aprovacoes_tarefa

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.aprovacoes_tarefa_id_seq'::regclass) |
| tarefa_id | integer | NO | — |
| solicitante_id | uuid | YES | — |
| aprovador_id | uuid | YES | — |
| status | character varying(20) | YES | 'pendente'::character varying |
| motivo | text | YES | — |
| created_at | timestamp with time zone | YES | now() |
| respondido_em | timestamp with time zone | YES | — |

**FKs:**
- `tarefa_id` → `alissonerp.tarefas.id`

**Índices:**
- `idx_aprovacoes_tarefa_id` — CREATE INDEX idx_aprovacoes_tarefa_id ON alissonerp.aprovacoes_tarefa USING btree (tarefa_id)
- `idx_aprovacoes_aprovador` — CREATE INDEX idx_aprovacoes_aprovador ON alissonerp.aprovacoes_tarefa USING btree (aprovador_id)
- `idx_aprovacoes_status` — CREATE INDEX idx_aprovacoes_status ON alissonerp.aprovacoes_tarefa USING btree (status)

---

## audit_log

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('alissonerp.audit_log_id_seq'::regclass) |
| tabela | text | NO | — |
| operacao | text | NO | — |
| registro_id | text | NO | — |
| dados_antes | jsonb | YES | — |
| dados_depois | jsonb | YES | — |
| usuario_id | uuid | YES | — |
| created_at | timestamp with time zone | YES | now() |

**Índices:**
- `idx_audit_tabela` — CREATE INDEX idx_audit_tabela ON alissonerp.audit_log USING btree (tabela)
- `idx_audit_data` — CREATE INDEX idx_audit_data ON alissonerp.audit_log USING btree (created_at)

---

## auditorias

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.auditorias_id_seq'::regclass) |
| situacao | character varying(10) | YES | '1'::character varying |
| tipo_auditoria | character varying(10) | YES | — |
| rota_processo | character varying(20) | YES | — |
| ordem_id | integer | YES | — |
| data_conclusao | timestamp with time zone | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| created_by | uuid | YES | — |
| responsavel_id | uuid | YES | — |
| parecer | text | YES | — |
| motivo_reprovacao | text | YES | — |
| tipo_retrabalho | character varying(50) | YES | — |
| peso_negociado | real | YES | 0 |
| peso_final | real | YES | 0 |
| pmc | real | YES | 0 |
| quebra | real | YES | 0 |
| quebra_percentual | real | YES | 0 |
| total_metal | real | YES | 0 |
| retorno_metal | real | YES | 0 |
| metal_externo | real | YES | 0 |
| ourives_nome | text | YES | — |
| ordem_retrabalho_id | integer | YES | — |
| ficha_tecnica_obs | text | YES | — |
| dados_ordem | jsonb | YES | — |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`
- `ordem_retrabalho_id` → `alissonerp.ordens.id`

**Índices:**
- `idx_auditorias_situacao` — CREATE INDEX idx_auditorias_situacao ON alissonerp.auditorias USING btree (situacao)
- `idx_auditorias_tipo` — CREATE INDEX idx_auditorias_tipo ON alissonerp.auditorias USING btree (tipo_auditoria)
- `idx_auditorias_ordem_id` — CREATE INDEX idx_auditorias_ordem_id ON alissonerp.auditorias USING btree (ordem_id)
- `idx_auditoria_ordem_tipo` — CREATE UNIQUE INDEX idx_auditoria_ordem_tipo ON alissonerp.auditorias USING btree (ordem_id, tipo...

**Triggers:**
- `trg_processar_auditoria` (BEFORE UPDATE)

---

## automacoes_tarefa

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.automacoes_tarefa_id_seq'::regclass) |
| titulo | text | NO | — |
| descricao | text | YES | — |
| responsavel_id | uuid | YES | — |
| prioridade | character varying(10) | YES | 'media'::character varying |
| recorrencia | character varying(20) | NO | 'diaria'::character varying |
| dia_semana | integer | YES | — |
| dia_mes | integer | YES | — |
| tags | ARRAY | YES | '{}'::text[] |
| ativa | boolean | YES | true |
| criado_por | uuid | YES | — |
| ultima_execucao | date | YES | — |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**Índices:**
- `idx_automacoes_ativa` — CREATE INDEX idx_automacoes_ativa ON alissonerp.automacoes_tarefa USING btree (ativa)

---

## comentarios_tarefa

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.comentarios_tarefa_id_seq'::regclass) |
| tarefa_id | integer | NO | — |
| autor_id | uuid | YES | — |
| texto | text | NO | — |
| created_at | timestamp with time zone | YES | now() |

**FKs:**
- `tarefa_id` → `alissonerp.tarefas.id`

**Índices:**
- `idx_comentarios_tarefa` — CREATE INDEX idx_comentarios_tarefa ON alissonerp.comentarios_tarefa USING btree (tarefa_id)

---

## configuracoes_secrets

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.configuracoes_secrets_id_seq'::regclass) |
| chave | character varying(100) | NO | — |
| valor_encrypted | text | NO | — |
| updated_at | timestamp with time zone | YES | now() |
| updated_by | uuid | YES | — |

**Índices:**
- `configuracoes_secrets_chave_key` — CREATE UNIQUE INDEX configuracoes_secrets_chave_key ON alissonerp.configuracoes_secrets USING btr...

---

## configuracoes_sistema

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.configuracoes_sistema_id_seq'::regclass) |
| chave | character varying(100) | NO | — |
| valor | text | NO | — |
| descricao | text | YES | — |
| updated_at | timestamp with time zone | YES | now() |
| updated_by | uuid | YES | — |

**Índices:**
- `configuracoes_sistema_chave_key` — CREATE UNIQUE INDEX configuracoes_sistema_chave_key ON alissonerp.configuracoes_sistema USING btr...

---

## fila_sync_externo

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('alissonerp.fila_sync_externo_id_seq'::regclass) |
| sistema | character varying(50) | NO | — |
| acao | character varying(100) | NO | 'sync'::character varying |
| payload | jsonb | NO | — |
| status | character varying(20) | NO | 'pendente'::character varying |
| tentativas | integer | NO | 0 |
| ultimo_erro | text | YES | — |
| criado_em | timestamp with time zone | NO | now() |
| processado_em | timestamp with time zone | YES | — |
| proxima_execucao | timestamp with time zone | YES | — |

**Índices:**
- `idx_fila_sync_status_criado` — CREATE INDEX idx_fila_sync_status_criado ON alissonerp.fila_sync_externo USING btree (status, cri...
- `idx_fila_sync_sistema` — CREATE INDEX idx_fila_sync_sistema ON alissonerp.fila_sync_externo USING btree (sistema, status)
- `idx_fila_sync_pendente` — CREATE INDEX idx_fila_sync_pendente ON alissonerp.fila_sync_externo USING btree (status, proxima_...

---

## notificacoes

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.notificacoes_id_seq'::regclass) |
| usuario_id | uuid | NO | — |
| tipo | character varying(50) | NO | 'mencao'::character varying |
| titulo | character varying(200) | NO | — |
| mensagem | text | YES | — |
| lida | boolean | YES | false |
| created_at | timestamp with time zone | YES | now() |
| link | character varying(200) | YES | — |
| ordem_id | integer | YES | — |
| comentario_id | integer | YES | — |
| remetente_id | uuid | YES | — |
| lida_em | timestamp with time zone | YES | — |
| aguardando_resposta | boolean | YES | false |
| respondida_em | timestamp with time zone | YES | — |
| venda_id | integer | YES | — |

**FKs:**
- `comentario_id` → `alissonerp.comentarios_ordem.id`
- `ordem_id` → `alissonerp.ordens.id`
- `usuario_id` → `alissonerp.usuarios.id`
- `venda_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `idx_notificacoes_usuario` — CREATE INDEX idx_notificacoes_usuario ON alissonerp.notificacoes USING btree (usuario_id)
- `idx_notificacoes_lida` — CREATE INDEX idx_notificacoes_lida ON alissonerp.notificacoes USING btree (usuario_id, lida) WHER...
- `idx_notificacoes_created` — CREATE INDEX idx_notificacoes_created ON alissonerp.notificacoes USING btree (created_at DESC)
- `idx_notif_aguardando_resposta` — CREATE INDEX idx_notif_aguardando_resposta ON alissonerp.notificacoes USING btree (usuario_id, cr...
- `idx_notif_usuario_id` — CREATE INDEX idx_notif_usuario_id ON alissonerp.notificacoes USING btree (usuario_id) WHERE (usua...

---

## parametros

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | 1 |
| cotacao_ouro | numeric | YES | — |
| cotacao_dolar | numeric | YES | — |
| cotacao_euro | numeric | YES | — |
| cotacao_prata | numeric | YES | — |
| updated_at | timestamp with time zone | YES | now() |

---

## parametros_sistema

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| chave | character varying(100) | NO | — |
| valor | text | NO | — |
| tipo | character varying(20) | NO | 'number'::character varying |
| descricao | text | YES | — |
| atualizado_em | timestamp with time zone | YES | now() |
| atualizado_por | uuid | YES | — |

**FKs:**
- `atualizado_por` → `alissonerp.usuarios.id`

**Triggers:**
- `trg_atualizar_parametros_sistema` (BEFORE UPDATE)

---

## permissoes_usuario

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.permissoes_usuario_id_seq'::regclass) |
| usuario_id | uuid | NO | — |
| acao | character varying(50) | NO | — |
| permitido | boolean | NO | false |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |

**FKs:**
- `usuario_id` → `alissonerp.usuarios.id`

**Índices:**
- `permissoes_usuario_usuario_id_acao_key` — CREATE UNIQUE INDEX permissoes_usuario_usuario_id_acao_key ON alissonerp.permissoes_usuario USING...
- `idx_permissoes_usuario_acao` — CREATE INDEX idx_permissoes_usuario_acao ON alissonerp.permissoes_usuario USING btree (usuario_id...

---

## tarefas

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.tarefas_id_seq'::regclass) |
| titulo | text | NO | — |
| descricao | text | YES | — |
| responsavel_id | uuid | YES | — |
| criado_por | uuid | YES | — |
| prioridade | character varying(10) | NO | 'media'::character varying |
| status | character varying(20) | NO | 'pendente'::character varying |
| data_limite | date | YES | — |
| ordem_id | integer | YES | — |
| tags | ARRAY | YES | '{}'::text[] |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| concluida_em | timestamp with time zone | YES | — |
| posicao | integer | YES | 0 |
| venda_id | integer | YES | — |
| tipo | text | YES | — |
| peso_metal | numeric | YES | — |
| ordem_ids | ARRAY | YES | — |

**FKs:**
- `ordem_id` → `alissonerp.ordens.id`
- `venda_id` → `alissonerp.vendas_erp.id`

**Índices:**
- `idx_tarefas_responsavel` — CREATE INDEX idx_tarefas_responsavel ON alissonerp.tarefas USING btree (responsavel_id)
- `idx_tarefas_status` — CREATE INDEX idx_tarefas_status ON alissonerp.tarefas USING btree (status)
- `idx_tarefas_ordem` — CREATE INDEX idx_tarefas_ordem ON alissonerp.tarefas USING btree (ordem_id)
- `idx_tarefas_data_limite` — CREATE INDEX idx_tarefas_data_limite ON alissonerp.tarefas USING btree (data_limite)
- `idx_tarefas_venda` — CREATE INDEX idx_tarefas_venda ON alissonerp.tarefas USING btree (venda_id) WHERE (venda_id IS NO...

**Triggers:**
- `trg_updated_at_tarefas` (BEFORE UPDATE)

---

## usuarios

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | uuid | NO | — |
| email | character varying(255) | NO | — |
| nome | character varying(255) | NO | — |
| role | character varying(50) | NO | 'ourives'::character varying |
| vendedor_id | bigint | YES | — |
| mx_desconto_permitido | numeric | YES | 0 |
| ativo | boolean | YES | true |
| created_at | timestamp with time zone | YES | now() |
| updated_at | timestamp with time zone | YES | now() |
| deposito_id | integer | YES | — |
| tipos_ordem_permitidos | jsonb | YES | '[]'::jsonb |
| is_operador_service | boolean | YES | false |
| tipos_protocolo_permitidos | jsonb | YES | '[]'::jsonb |
| is_transportador | boolean | NO | false |
| notif_alarme_silenciado_ate | timestamp with time zone | YES | — |
| parcelas_padrao_mp | integer | NO | 1 |

**Índices:**
- `usuarios_email_key` — CREATE UNIQUE INDEX usuarios_email_key ON alissonerp.usuarios USING btree (email)

---

## webhook_config

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | integer | NO | nextval('alissonerp.webhook_config_id_seq'::regclass) |
| nome | character varying(50) | NO | — |
| url | text | NO | — |
| ativo | boolean | YES | true |
| descricao | text | YES | — |
| ultimo_disparo | timestamp with time zone | YES | — |
| total_disparos | integer | YES | 0 |
| created_at | timestamp with time zone | YES | now() |

**Índices:**
- `webhook_config_nome_key` — CREATE UNIQUE INDEX webhook_config_nome_key ON alissonerp.webhook_config USING btree (nome)

---

## webhook_log

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|--------|
| id | bigint | NO | nextval('alissonerp.webhook_log_id_seq'::regclass) |
| webhook_nome | character varying(50) | YES | — |
| payload | jsonb | YES | — |
| response_status | integer | YES | — |
| response_body | text | YES | — |
| erro | text | YES | — |
| created_at | timestamp with time zone | YES | now() |

**Índices:**
- `idx_wh_log_nome` — CREATE INDEX idx_wh_log_nome ON alissonerp.webhook_log USING btree (webhook_nome)
- `idx_wh_log_data` — CREATE INDEX idx_wh_log_data ON alissonerp.webhook_log USING btree (created_at)

---

## Views (3)

### vw_auditorias_completa

```sql
 SELECT a.id,
    a.situacao,
        CASE a.situacao
...
```

### vw_dashboard_auditoria

```sql
 SELECT auditorias.tipo_auditoria,
    count(*) FILTER (WHERE ((auditorias.situacao)::text = 'pendente'::text)) AS pendentes,
    count(*) FILTER (WHERE ((auditorias.situacao)::text = 'em_analise'::text)) AS em_analise,
...
```

### vw_ordens_aguardando_auditoria_loja

```sql
 SELECT o.id,
    o.numero_ordem,
    (o.status)::text AS status,
...
```

