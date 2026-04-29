# `public` — Views e Materialized Views

> 45 entradas | gerado 2026-04-29

## Índice

- [`contasareceberdetalhada`](#contasareceberdetalhada)
- [`crm_agente_runs`](#crm_agente_runs)
- [`crm_agentes_ia`](#crm_agentes_ia)
- [`crm_audit_log`](#crm_audit_log)
- [`crm_automacao_etapas`](#crm_automacao_etapas)
- [`crm_automacao_execucoes`](#crm_automacao_execucoes)
- [`crm_automacao_gatilhos`](#crm_automacao_gatilhos)
- [`crm_automacoes`](#crm_automacoes)
- [`crm_brechas`](#crm_brechas)
- [`crm_ciclo_vida_eventos`](#crm_ciclo_vida_eventos)
- [`crm_config_geral`](#crm_config_geral)
- [`crm_contato_canais`](#crm_contato_canais)
- [`crm_conversas`](#crm_conversas)
- [`crm_conversas_completas`](#crm_conversas_completas)
- [`crm_funil_blocos`](#crm_funil_blocos)
- [`crm_funil_etapas`](#crm_funil_etapas)
- [`crm_funil_etapas_completas`](#crm_funil_etapas_completas)
- [`crm_funil_movimentos`](#crm_funil_movimentos)
- [`crm_funis`](#crm_funis)
- [`crm_instagram_posts`](#crm_instagram_posts)
- [`crm_kommo_config`](#crm_kommo_config)
- [`crm_mensagens`](#crm_mensagens)
- [`crm_meta_config`](#crm_meta_config)
- [`crm_motivos_perda`](#crm_motivos_perda)
- [`crm_notificacoes`](#crm_notificacoes)
- [`crm_oportunidade_historico`](#crm_oportunidade_historico)
- [`crm_oportunidades`](#crm_oportunidades)
- [`crm_oportunidades_completas`](#crm_oportunidades_completas)
- [`crm_origens_lead`](#crm_origens_lead)
- [`crm_prompt_templates`](#crm_prompt_templates)
- [`crm_sdr_runs`](#crm_sdr_runs)
- [`crm_tarefas`](#crm_tarefas)
- [`crm_unipile_config`](#crm_unipile_config)
- [`crm_user_perfil`](#crm_user_perfil)
- [`crm_webhook_config`](#crm_webhook_config)
- [`crm_webhook_log`](#crm_webhook_log)
- [`fin_divergencias_pendentes`](#fin_divergencias_pendentes)
- [`pedidos_dashboard`](#pedidos_dashboard)
- [`pedidos_parcelas_detalhado`](#pedidos_parcelas_detalhado)
- [`produtos_views`](#produtos_views)
- [`users`](#users)
- [`v_estoque_detalhado_insumo`](#v_estoque_detalhado_insumo)
- [`v_quebra_distribuicao`](#v_quebra_distribuicao)
- [`v_saldo_quebra_final`](#v_saldo_quebra_final)
- [`view_monitoramento_ordens`](#view_monitoramento_ordens)

---

## contasareceberdetalhada

Owner: `supabase_admin`

```sql
 SELECT cr.id_api_conta,
    cr.situacao,
    cr.data,
    cr.data_vencimento,
    cr.data_competencia,
    cr.data_liquidacao,
    cr.valor,
    cr.saldo,
    cr.juros,
    cr.multa,
    cr.valor_pago,
    cr.forma_recebimento,
    c.descricao AS nomecategoria,
    c.grupo AS nomegrupo,
    p.data_pedido,
    p.id_api_pedido AS numero_pedido,
    (cr.pedido_id_api IS NOT NULL) AS tem_relacao_com_pedido
   FROM ((contas_a_receber cr
     JOIN categorias_receitas_despesas c ON ((cr.categoria_id_api = c.id_api_categoria)))
     LEFT JOIN pedidos p ON ((cr.pedido_id_api = p.id_api_pedido)));
```

_Sem referência identificada no código._

---

## crm_agente_runs

Owner: `postgres`

```sql
 SELECT agente_runs.id,
    agente_runs.agente_id,
    agente_runs.conversa_id,
    agente_runs.prompt_final,
    agente_runs.resposta,
    agente_runs.modelo,
    agente_runs.tokens_input,
    agente_runs.tokens_output,
    agente_runs.custo_usd,
    agente_runs.elapsed_ms,
    agente_runs.erro,
    agente_runs.metadata,
    agente_runs.created_at
   FROM crm.agente_runs;
```

_Sem referência identificada no código._

---

## crm_agentes_ia

Owner: `postgres`

```sql
 SELECT agentes_ia.id,
    agentes_ia.codigo,
    agentes_ia.nome,
    agentes_ia.descricao,
    agentes_ia.prompt_template_id,
    agentes_ia.parametros,
    agentes_ia.ativo,
    agentes_ia.created_at,
    agentes_ia.updated_at
   FROM crm.agentes_ia;
```

_Sem referência identificada no código._

---

## crm_audit_log

Owner: `postgres`

```sql
 SELECT audit_log.id,
    audit_log.schema_name,
    audit_log.table_name,
    audit_log.operacao,
    audit_log.registro_id,
    audit_log.user_id,
    audit_log.dados_antes,
    audit_log.dados_depois,
    audit_log.diff,
    audit_log.ocorrido_em
   FROM crm.audit_log;
```

_Sem referência identificada no código._

---

## crm_automacao_etapas

Owner: `postgres`

```sql
 SELECT automacao_etapas.id,
    automacao_etapas.legacy_id,
    automacao_etapas.funil_id,
    automacao_etapas.gatilho,
    automacao_etapas.estagio_origem_id,
    automacao_etapas.estagio_destino_id,
    automacao_etapas.tipo_acao,
    automacao_etapas.config,
    automacao_etapas.descricao,
    automacao_etapas.ativo,
    automacao_etapas.total_execucoes,
    automacao_etapas.ultima_execucao,
    automacao_etapas.created_at,
    automacao_etapas.updated_at
   FROM crm.automacao_etapas;
```

_Sem referência identificada no código._

---

## crm_automacao_execucoes

Owner: `postgres`

```sql
 SELECT automacao_execucoes.id,
    automacao_execucoes.automacao_id,
    automacao_execucoes.conversa_id,
    automacao_execucoes.gatilho,
    automacao_execucoes.payload,
    automacao_execucoes.resultado,
    automacao_execucoes.sucesso,
    automacao_execucoes.erro,
    automacao_execucoes.elapsed_ms,
    automacao_execucoes.created_at
   FROM crm.automacao_execucoes;
```

_Sem referência identificada no código._

---

## crm_automacao_gatilhos

Owner: `postgres`

```sql
 SELECT automacao_gatilhos.automacao_id,
    automacao_gatilhos.gatilho,
    automacao_gatilhos.parametros
   FROM crm.automacao_gatilhos;
```

_Sem referência identificada no código._

---

## crm_automacoes

Owner: `postgres`

```sql
 SELECT automacoes.id,
    automacoes.nome,
    automacoes.descricao,
    automacoes.ativa,
    automacoes.prioridade,
    automacoes.condicoes,
    automacoes.acoes,
    automacoes.total_execucoes,
    automacoes.ultima_execucao,
    automacoes.criado_por,
    automacoes.created_at,
    automacoes.updated_at
   FROM crm.automacoes;
```

_Sem referência identificada no código._

---

## crm_brechas

Owner: `postgres`

```sql
 SELECT brechas.id,
    brechas.conversa_id,
    brechas.contato_id,
    brechas.tipo,
    brechas.titulo,
    brechas.descricao,
    brechas.prioridade,
    brechas.status,
    brechas.vencimento,
    brechas.metadata,
    brechas.detectada_em,
    brechas.fechada_em,
    brechas.fechada_por,
    brechas.created_at,
    brechas.updated_at
   FROM crm.brechas;
```

_Sem referência identificada no código._

---

## crm_ciclo_vida_eventos

Owner: `postgres`

```sql
 SELECT ciclo_vida_eventos.id,
    ciclo_vida_eventos.conversa_id,
    ciclo_vida_eventos.contato_id,
    ciclo_vida_eventos.evento,
    ciclo_vida_eventos.detalhes,
    ciclo_vida_eventos.ocorrido_em,
    ciclo_vida_eventos.created_at
   FROM crm.ciclo_vida_eventos;
```

_Sem referência identificada no código._

---

## crm_config_geral

Owner: `postgres`

```sql
 SELECT config_geral.chave,
    config_geral.valor,
    config_geral.descricao,
    config_geral.atualizado_por,
    config_geral.created_at,
    config_geral.updated_at
   FROM crm.config_geral;
```

_Sem referência identificada no código._

---

## crm_contato_canais

Owner: `postgres`

```sql
 SELECT contato_canais.id,
    contato_canais.contato_id,
    contato_canais.canal,
    contato_canais.canal_id,
    contato_canais.username,
    contato_canais.nome_canal,
    contato_canais.foto_url,
    contato_canais.metadata,
    contato_canais.created_at,
    contato_canais.updated_at
   FROM crm.contato_canais;
```

_Sem referência identificada no código._

---

## crm_conversas

Owner: `postgres`

```sql
 SELECT conversas.id,
    conversas.contato_id,
    conversas.lead_id,
    conversas.vendedor_id,
    conversas.canal,
    conversas.canal_contato_id,
    conversas.canal_thread_id,
    conversas.status,
    conversas.modo_auto,
    conversas.ultima_msg_em,
    conversas.ultima_msg_resumo,
    conversas.nao_lidas_count,
    conversas.metadata,
    conversas.created_at,
    conversas.updated_at,
    conversas.etapa_atual_id
   FROM crm.conversas;
```

_Sem referência identificada no código._

---

## crm_conversas_completas

Owner: `postgres`

```sql
 SELECT c.id,
    c.contato_id,
    c.lead_id,
    c.vendedor_id,
    c.canal,
    c.canal_contato_id,
    c.canal_thread_id,
    c.status,
    c.modo_auto,
    c.ultima_msg_em,
    c.ultima_msg_resumo,
    c.nao_lidas_count,
    c.etapa_atual_id,
    c.metadata,
    c.created_at,
    c.updated_at,
    ct.nome AS contato_nome,
    ct.telefone AS contato_telefone,
    ct.celular AS contato_celular,
    ct.email AS contato_email,
    v.nome AS vendedor_nome,
    v.foto AS vendedor_foto,
    fe.nome AS etapa_nome,
    fe.cor AS etapa_cor,
    fb.nome AS bloco_nome,
    fb.cor AS bloco_cor
   FROM ((((crm.conversas c
     LEFT JOIN contatos ct ON ((ct.id_contato = c.contato_id)))
     LEFT JOIN vendedores v ON ((v.id_vendedor = c.vendedor_id)))
     LEFT JOIN crm.funil_etapas fe ON ((fe.id = c.etapa_atual_id)))
     LEFT JOIN crm.funil_blocos fb ON ((fb.id = fe.bloco_id)));
```

_Sem referência identificada no código._

---

## crm_funil_blocos

Owner: `postgres`

```sql
 SELECT funil_blocos.id,
    funil_blocos.nome,
    funil_blocos.ordem,
    funil_blocos.cor,
    funil_blocos.created_at,
    funil_blocos.updated_at
   FROM crm.funil_blocos;
```

_Sem referência identificada no código._

---

## crm_funil_etapas

Owner: `postgres`

```sql
 SELECT funil_etapas.id,
    funil_etapas.bloco_id,
    funil_etapas.nome,
    funil_etapas.ordem,
    funil_etapas.cor,
    funil_etapas.ativo,
    funil_etapas.acao_entrada,
    funil_etapas.acao_saida,
    funil_etapas.sla_horas,
    funil_etapas.created_at,
    funil_etapas.updated_at
   FROM crm.funil_etapas;
```

_Sem referência identificada no código._

---

## crm_funil_etapas_completas

Owner: `postgres`

```sql
 SELECT fe.id,
    fe.bloco_id,
    fe.nome,
    fe.ordem,
    fe.cor,
    fe.ativo,
    fb.nome AS bloco_nome,
    fb.ordem AS bloco_ordem,
    fb.cor AS bloco_cor
   FROM (crm.funil_etapas fe
     LEFT JOIN crm.funil_blocos fb ON ((fb.id = fe.bloco_id)))
  ORDER BY fb.ordem, fe.ordem;
```

_Sem referência identificada no código._

---

## crm_funil_movimentos

Owner: `postgres`

```sql
 SELECT funil_movimentos.id,
    funil_movimentos.conversa_id,
    funil_movimentos.etapa_de,
    funil_movimentos.etapa_para,
    funil_movimentos.motivo,
    funil_movimentos.movido_por,
    funil_movimentos.movido_em,
    funil_movimentos.metadata
   FROM crm.funil_movimentos;
```

_Sem referência identificada no código._

---

## crm_funis

Owner: `postgres`

```sql
 SELECT funis.id,
    funis.legacy_id,
    funis.nome,
    funis.cor,
    funis.ordem,
    funis.ativo,
    funis.descricao,
    funis.created_at,
    funis.updated_at
   FROM crm.funis;
```

_Sem referência identificada no código._

---

## crm_instagram_posts

Owner: `postgres`

```sql
 SELECT instagram_posts.id,
    instagram_posts.tipo,
    instagram_posts.caption,
    instagram_posts.permalink,
    instagram_posts.thumbnail_url,
    instagram_posts.media_url,
    instagram_posts.thumbnail_storage_path,
    instagram_posts.media_storage_path,
    instagram_posts.thumbnail_url_local,
    instagram_posts.media_url_local,
    instagram_posts.timestamp_post,
    instagram_posts.metadata,
    instagram_posts.created_at,
    instagram_posts.updated_at
   FROM crm.instagram_posts;
```

_Sem referência identificada no código._

---

## crm_kommo_config

Owner: `postgres`

```sql
 SELECT kommo_config.id,
    kommo_config.subdomain,
    kommo_config.client_id,
    kommo_config.client_secret,
    kommo_config.access_token,
    kommo_config.refresh_token,
    kommo_config.expires_at,
    kommo_config.ativo,
    kommo_config.created_at,
    kommo_config.updated_at
   FROM crm.kommo_config;
```

_Sem referência identificada no código._

---

## crm_mensagens

Owner: `postgres`

```sql
 SELECT mensagens.id,
    mensagens.conversa_id,
    mensagens.canal_message_id,
    mensagens.papel,
    mensagens.conteudo,
    mensagens.tipo_midia,
    mensagens.midia_url,
    mensagens.midia_storage_path,
    mensagens.duracao_segundos,
    mensagens.instagram_media_id,
    mensagens.status,
    mensagens.erro,
    mensagens.enviado_em,
    mensagens.metadata,
    mensagens.created_at,
    mensagens.updated_at
   FROM crm.mensagens;
```

_Sem referência identificada no código._

---

## crm_meta_config

Owner: `postgres`

```sql
 SELECT meta_config.id,
    meta_config.app_id,
    meta_config.app_secret,
    meta_config.page_id,
    meta_config.page_access_token,
    meta_config.ig_business_id,
    meta_config.verify_token,
    meta_config.webhook_url,
    meta_config.ativo,
    meta_config.status,
    meta_config.ultimo_erro,
    meta_config.created_at,
    meta_config.updated_at
   FROM crm.meta_config;
```

_Sem referência identificada no código._

---

## crm_motivos_perda

Owner: `postgres`

```sql
 SELECT motivos_perda.id,
    motivos_perda.legacy_id,
    motivos_perda.nome,
    motivos_perda.ativo,
    motivos_perda.ordem,
    motivos_perda.created_at
   FROM crm.motivos_perda;
```

_Sem referência identificada no código._

---

## crm_notificacoes

Owner: `postgres`

```sql
 SELECT notificacoes.id,
    notificacoes.user_id,
    notificacoes.tipo,
    notificacoes.titulo,
    notificacoes.mensagem,
    notificacoes.link,
    notificacoes.conversa_id,
    notificacoes.contato_id,
    notificacoes.metadata,
    notificacoes.lida,
    notificacoes.lida_em,
    notificacoes.created_at
   FROM crm.notificacoes;
```

_Sem referência identificada no código._

---

## crm_oportunidade_historico

Owner: `postgres`

```sql
 SELECT oportunidade_historico.id,
    oportunidade_historico.oportunidade_id,
    oportunidade_historico.etapa_anterior_id,
    oportunidade_historico.etapa_nova_id,
    oportunidade_historico.etapa_anterior_nome,
    oportunidade_historico.etapa_nova_nome,
    oportunidade_historico.motivo,
    oportunidade_historico.user_id,
    oportunidade_historico.metadata,
    oportunidade_historico.ocorrido_em
   FROM crm.oportunidade_historico;
```

_Sem referência identificada no código._

---

## crm_oportunidades

Owner: `postgres`

```sql
 SELECT oportunidades.id,
    oportunidades.legacy_id,
    oportunidades.contato_id,
    oportunidades.vendedor_id,
    oportunidades.conversa_id,
    oportunidades.funil_id,
    oportunidades.etapa_id,
    oportunidades.titulo,
    oportunidades.valor,
    oportunidades.produto_interesse,
    oportunidades.notas,
    oportunidades.tags,
    oportunidades.origem_lead,
    oportunidades.canal_origem,
    oportunidades.motivo_perda,
    oportunidades.tipo_pedido,
    oportunidades.forma_atendimento,
    oportunidades.tipo_cliente,
    oportunidades.itens_pedido,
    oportunidades.desconto,
    oportunidades.parcelas,
    oportunidades.forma_pagamento,
    oportunidades.valor_frete,
    oportunidades.endereco_entrega,
    oportunidades.data_prevista_entrega,
    oportunidades.data_envio,
    oportunidades.transportador,
    oportunidades.observacao_pedido,
    oportunidades.forma_envio,
    oportunidades.codigo_rastreio,
    oportunidades.data_entrega,
    oportunidades.entrega_confirmada,
    oportunidades.score_bant,
    oportunidades.classificacao,
    oportunidades.perfil,
    oportunidades.decisor,
    oportunidades.orcamento_declarado,
    oportunidades.ocasiao,
    oportunidades.prazo,
    oportunidades.motivo_pos_venda,
    oportunidades.data_entrada_pos_venda,
    oportunidades.opt_out,
    oportunidades.opt_out_data,
    oportunidades.tentativas_reabordagem,
    oportunidades.campos_ia,
    oportunidades.metadata,
    oportunidades.created_at,
    oportunidades.updated_at
   FROM crm.oportunidades;
```

_Sem referência identificada no código._

---

## crm_oportunidades_completas

Owner: `postgres`

```sql
 SELECT o.id,
    o.legacy_id,
    o.contato_id,
    o.vendedor_id,
    o.conversa_id,
    o.funil_id,
    o.etapa_id,
    o.titulo,
    o.valor,
    o.produto_interesse,
    o.notas,
    o.tags,
    o.origem_lead,
    o.canal_origem,
    o.motivo_perda,
    o.tipo_pedido,
    o.forma_atendimento,
    o.tipo_cliente,
    o.itens_pedido,
    o.desconto,
    o.parcelas,
    o.forma_pagamento,
    o.valor_frete,
    o.endereco_entrega,
    o.data_prevista_entrega,
    o.data_envio,
    o.transportador,
    o.observacao_pedido,
    o.forma_envio,
    o.codigo_rastreio,
    o.data_entrega,
    o.entrega_confirmada,
    o.score_bant,
    o.classificacao,
    o.perfil,
    o.decisor,
    o.orcamento_declarado,
    o.ocasiao,
    o.prazo,
    o.motivo_pos_venda,
    o.data_entrada_pos_venda,
    o.opt_out,
    o.opt_out_data,
    o.tentativas_reabordagem,
    o.campos_ia,
    o.metadata,
    o.created_at,
    o.updated_at,
    ct.nome AS cliente_nome,
    ct.telefone AS cliente_telefone,
    ct.celular AS cliente_celular,
    ct.email AS cliente_email,
    v.nome AS vendedor_nome,
    v.foto AS vendedor_foto,
    e.nome AS etapa_nome,
    e.cor AS etapa_cor,
    e.tipo AS etapa_tipo,
    e.ordem AS etapa_ordem,
    b.nome AS bloco_nome,
    b.cor AS bloco_cor,
        CASE
            WHEN (ve.id IS NOT NULL) THEN 1
            ELSE 0
        END AS venda_registrada,
    ve.id AS venda_id,
    ve.data_venda,
    ve.total_venda AS venda_total,
    sdr.score_total AS bant_lead_score,
    sdr.classificacao AS bant_classificacao,
    sdr.score_budget AS bant_budget_score,
    sdr.score_authority AS bant_authority_score,
    sdr.score_need AS bant_need_score,
    sdr.score_timing AS bant_timeline_score,
    sdr.bonus_engajamento AS bant_bonus_score
   FROM ((((((crm.oportunidades o
     LEFT JOIN contatos ct ON ((ct.id_contato = o.contato_id)))
     LEFT JOIN vendedores v ON ((v.id_vendedor = o.vendedor_id)))
     LEFT JOIN crm.funil_etapas e ON ((e.id = o.etapa_id)))
     LEFT JOIN crm.funil_blocos b ON ((b.id = e.bloco_id)))
     LEFT JOIN alissonerp.vendas_erp ve ON (((ve.cliente_id = o.contato_id) AND (ve.created_at >= (o.created_at - '7 days'::interval)) AND (ve.created_at <= (o.created_at + '90 days'::interval)))))
     LEFT JOIN LATERAL ( SELECT sdr_runs.id,
            sdr_runs.conversa_id,
            sdr_runs.score_budget,
            sdr_runs.score_authority,
            sdr_runs.score_need,
            sdr_runs.score_timing,
            sdr_runs.score_total,
            sdr_runs.bonus_engajamento,
            sdr_runs.classificacao,
            sdr_runs.resumo,
            sdr_runs.proximos_passos,
            sdr_runs.agente_run_id,
            sdr_runs.created_at
           FROM crm.sdr_runs
          WHERE (sdr_runs.conversa_id = o.conversa_id)
          ORDER BY sdr_runs.created_at DESC
         LIMIT 1) sdr ON (true));
```

_Sem referência identificada no código._

---

## crm_origens_lead

Owner: `postgres`

```sql
 SELECT origens_lead.id,
    origens_lead.legacy_id,
    origens_lead.nome,
    origens_lead.ativo,
    origens_lead.ordem,
    origens_lead.created_at
   FROM crm.origens_lead;
```

_Sem referência identificada no código._

---

## crm_prompt_templates

Owner: `postgres`

```sql
 SELECT prompt_templates.id,
    prompt_templates.codigo,
    prompt_templates.nome,
    prompt_templates.descricao,
    prompt_templates.modelo,
    prompt_templates.temperatura,
    prompt_templates.system_prompt,
    prompt_templates.variaveis,
    prompt_templates.ativo,
    prompt_templates.created_at,
    prompt_templates.updated_at
   FROM crm.prompt_templates;
```

_Sem referência identificada no código._

---

## crm_sdr_runs

Owner: `postgres`

```sql
 SELECT sdr_runs.id,
    sdr_runs.conversa_id,
    sdr_runs.score_budget,
    sdr_runs.score_authority,
    sdr_runs.score_need,
    sdr_runs.score_timing,
    sdr_runs.score_total,
    sdr_runs.bonus_engajamento,
    sdr_runs.classificacao,
    sdr_runs.resumo,
    sdr_runs.proximos_passos,
    sdr_runs.agente_run_id,
    sdr_runs.created_at
   FROM crm.sdr_runs;
```

_Sem referência identificada no código._

---

## crm_tarefas

Owner: `postgres`

```sql
 SELECT tarefas.id,
    tarefas.titulo,
    tarefas.descricao,
    tarefas.conversa_id,
    tarefas.contato_id,
    tarefas.brecha_id,
    tarefas.responsavel_id,
    tarefas.prioridade,
    tarefas.status,
    tarefas.data_limite,
    tarefas.concluida_em,
    tarefas.criado_por,
    tarefas.created_at,
    tarefas.updated_at
   FROM crm.tarefas;
```

_Sem referência identificada no código._

---

## crm_unipile_config

Owner: `postgres`

```sql
 SELECT unipile_config.id,
    unipile_config.api_key,
    unipile_config.dsn,
    unipile_config.account_id,
    unipile_config.account_username,
    unipile_config.account_provider,
    unipile_config.webhook_id,
    unipile_config.webhook_url,
    unipile_config.webhook_source,
    unipile_config.ativo,
    unipile_config.status,
    unipile_config.ultimo_erro,
    unipile_config.created_at,
    unipile_config.updated_at
   FROM crm.unipile_config;
```

_Sem referência identificada no código._

---

## crm_user_perfil

Owner: `postgres`

```sql
 SELECT au.id AS user_id,
    au.email,
    eu.nome,
    eu.role,
    eu.vendedor_id,
    v.nome AS vendedor_nome,
    v.foto AS vendedor_foto,
    v.email AS vendedor_email
   FROM ((auth.users au
     LEFT JOIN alissonerp.usuarios eu ON ((eu.id = au.id)))
     LEFT JOIN vendedores v ON ((v.id_vendedor = eu.vendedor_id)));
```

_Sem referência identificada no código._

---

## crm_webhook_config

Owner: `postgres`

```sql
 SELECT webhook_config.id,
    webhook_config.nome,
    webhook_config.source,
    webhook_config.url_callback,
    webhook_config.ativo,
    webhook_config.total_eventos,
    webhook_config.ultimo_evento,
    webhook_config.ultimo_erro,
    webhook_config.configuracao,
    webhook_config.created_at,
    webhook_config.updated_at
   FROM crm.webhook_config;
```

_Sem referência identificada no código._

---

## crm_webhook_log

Owner: `postgres`

```sql
 SELECT webhook_log.id,
    webhook_log.source,
    webhook_log.event,
    webhook_log.payload,
    webhook_log.processado,
    webhook_log.resultado,
    webhook_log.erro,
    webhook_log.conversa_id,
    webhook_log.mensagem_id,
    webhook_log.recebido_em,
    webhook_log.processado_em
   FROM crm.webhook_log;
```

_Sem referência identificada no código._

---

## fin_divergencias_pendentes

Owner: `postgres`

```sql
 SELECT c.id AS conciliacao_id,
    cp.id AS conta_pagar_id,
    cp.historico AS descricao,
    cp.fornecedor_id_api,
    cp.valor AS valor_tiny,
    abs(lb.valor) AS valor_banco,
    c.diferenca_valor,
    c.diferenca_dias,
    cp.data_vencimento,
    lb.data_lancamento,
    lb.descricao AS historico_banco,
    eb.banco,
    c.created_at AS detectado_em
   FROM (((fin_conciliacoes c
     JOIN contas_a_pagar cp ON ((cp.id = c.conta_pagar_id)))
     JOIN fin_lancamentos_bancarios lb ON ((lb.id = c.lancamento_id)))
     JOIN fin_extratos_bancarios eb ON ((eb.id = lb.extrato_id)))
  WHERE (c.status = 'divergente'::text)
  ORDER BY cp.data_vencimento;
```

_Sem referência identificada no código._

---

## pedidos_dashboard

Owner: `supabase_admin`

```sql
 SELECT p.id_api_pedido,
    p.data_pedido,
    p.numero_pedido,
    p.valor_total_pedido,
    p.valor_frete,
    v.id_vendedor,
    (pp_vale.pedido_id_api IS NOT NULL) AS possui_vale_troca,
    COALESCE(sum(pp_vale.valor), (0)::double precision) AS valor_vale_troca
   FROM ((pedidos p
     LEFT JOIN vendedores v ON ((p.vendedor_id_api = v.id_api_vendedor)))
     LEFT JOIN parcelas_pedidos pp_vale ON (((p.id_api_pedido = pp_vale.pedido_id_api) AND (pp_vale.forma_pagamento = 'Vale-troca'::text))))
  GROUP BY p.id_api_pedido, p.numero_pedido, p.data_pedido, p.valor_total_pedido, p.valor_frete, v.id_vendedor, pp_vale.pedido_id_api;
```

_Sem referência identificada no código._

---

## pedidos_parcelas_detalhado

Owner: `supabase_admin`

```sql
 WITH analise_pagamentos_parcela AS (
         SELECT pp_1.pedido_id_api,
            count(DISTINCT pp_1.forma_pagamento) AS total_formas_distintas,
            max(
                CASE
                    WHEN (pp_1.forma_pagamento = 'Vale-troca'::text) THEN 1
                    ELSE 0
                END) AS tem_vale_troca
           FROM parcelas_pedidos pp_1
          GROUP BY pp_1.pedido_id_api
        )
 SELECT p.numero_pedido,
    p.data_pedido,
    p.situacao,
    p.cliente_id_api,
    v.id_vendedor,
    p.forma_pagamento AS forma_pagamento_pedido,
    p.meio_pagamento AS meio_pagamento_pedido,
    pp.data AS data_vencimento_parcela,
    pp.valor AS valor_parcela,
    pp.forma_pagamento AS forma_pagamento_parcela,
    pp.meio_pagamento AS meio_pagamento_parcela,
        CASE
            WHEN (p.forma_pagamento = 'Vale-troca'::text) THEN true
            WHEN ((ap.total_formas_distintas = 1) AND (ap.tem_vale_troca = 1)) THEN true
            ELSE false
        END AS eh_devolucao
   FROM (((pedidos p
     LEFT JOIN vendedores v ON ((p.vendedor_id_api = v.id_api_vendedor)))
     LEFT JOIN parcelas_pedidos pp ON ((p.id_api_pedido = pp.pedido_id_api)))
     LEFT JOIN analise_pagamentos_parcela ap ON ((p.id_api_pedido = ap.pedido_id_api)))
  ORDER BY p.data_pedido, p.numero_pedido;
```

**Uso no código:**
- `public.pedidos_parcelas_detalhado` — 1 ocorrência(s)
  - `src/app/api/dashboard-comercial/comparativo-anual/route.ts:35`

---

## produtos_views

Owner: `supabase_admin`

```sql
 SELECT p.id_api_produto,
    p.sku,
    p.nome,
    p.tipo_metal,
    p.peso_precificado,
    p.fornecedor_etl,
    p.tipo_de_pedra,
    p.data_atualizacao,
    pai.id_api_produto AS produto_pai_id,
        CASE
            WHEN (POSITION(('-'::text) IN (p.sku)) > 0) THEN 'Variação'::text
            WHEN (EXISTS ( SELECT 1
               FROM produtos v
              WHERE ((v.sku)::text ~~ ((p.sku)::text || '-%'::text)))) THEN 'Pai'::text
            ELSE 'Simples'::text
        END AS tipo_produto
   FROM (produtos p
     LEFT JOIN produtos pai ON (((pai.sku)::text =
        CASE
            WHEN (POSITION(('-'::text) IN (p.sku)) > 0) THEN "substring"((p.sku)::text, 1, (POSITION(('-'::text) IN (p.sku)) - 1))
            ELSE NULL::text
        END)));
```

_Sem referência identificada no código._

---

## users

Owner: `supabase_admin`

```sql
 SELECT users.instance_id,
    users.id,
    users.aud,
    users.role,
    users.email,
    users.encrypted_password,
    users.email_confirmed_at,
    users.invited_at,
    users.confirmation_token,
    users.confirmation_sent_at,
    users.recovery_token,
    users.recovery_sent_at,
    users.email_change_token_new,
    users.email_change,
    users.email_change_sent_at,
    users.last_sign_in_at,
    users.raw_app_meta_data,
    users.raw_user_meta_data,
    users.is_super_admin,
    users.created_at,
    users.updated_at,
    users.phone,
    users.phone_confirmed_at,
    users.phone_change,
    users.phone_change_token,
    users.phone_change_sent_at,
    users.confirmed_at,
    users.email_change_token_current,
    users.email_change_confirm_status,
    users.banned_until,
    users.reauthentication_token,
    users.reauthentication_sent_at,
    users.is_sso_user,
    users.deleted_at,
    users.is_anonymous
   FROM auth.users;
```

**Uso no código:**
- `public.users` — 3 ocorrência(s)
  - `src/lib/mercado-pago.ts:399`
  - `scripts/_build_code_references.mjs:159`
  - `scripts/_build_code_references.mjs:161`

---

## v_estoque_detalhado_insumo

Owner: `supabase_admin`

```sql
 SELECT ce.id,
    ce.data_hora,
    ce.entrada,
    ce.saida,
    ce.insumo_id,
    ce.obs,
    d.nome AS deposito_nome,
    i.nome AS insumo_nome,
    o.numero_ordem AS ordem_numero
   FROM (((directus.controle_estoque ce
     LEFT JOIN directus.deposito d ON ((ce.deposito_id = d.id)))
     LEFT JOIN directus.insumos i ON ((ce.insumo_id = i.id)))
     LEFT JOIN directus.ordens o ON ((ce.ordem_id = o.id)));
```

_Sem referência identificada no código._

---

## v_quebra_distribuicao

Owner: `supabase_admin`

```sql
 WITH dono_lote AS (
         SELECT apontamento_distribuicao.distribuicao_id,
            max(apontamento_distribuicao.deposito) AS id_deposito
           FROM directus.apontamento_distribuicao
          WHERE (apontamento_distribuicao.deposito IS NOT NULL)
          GROUP BY apontamento_distribuicao.distribuicao_id
        )
 SELECT d.id AS id_distribuicao,
    d.date_created AS data_criacao,
    dl.id_deposito,
    dep.nome AS nome_deposito,
    (((COALESCE(d.total_metal, (0)::real) - COALESCE(d.retorno_metal, (0)::real)) - COALESCE(d.quebra, (0)::real)))::numeric(10,2) AS saldo_atual,
    (COALESCE(d.quebra, (0)::real))::numeric(10,2) AS quebra_apurada
   FROM ((directus.distribuicao d
     LEFT JOIN dono_lote dl ON ((d.id = dl.distribuicao_id)))
     LEFT JOIN directus.deposito dep ON ((dl.id_deposito = dep.id)))
  WHERE ((((COALESCE(d.total_metal, (0)::real) - COALESCE(d.retorno_metal, (0)::real)) - COALESCE(d.quebra, (0)::real)) > (0)::double precision) OR (COALESCE(d.quebra, (0)::real) > (0)::double precision));
```

_Sem referência identificada no código._

---

## v_saldo_quebra_final

Owner: `supabase_admin`

```sql
 WITH pcp_convertido AS (
         SELECT pcp.id AS pcp_id,
            pcp.ordem_id
           FROM directus.pcp
        ), movimento_producao AS (
         SELECT ap.deposito AS id_deposito,
            pcp.ordem_id,
            max(ap.date_created) AS data_ultimo_apontamento,
            sum(
                CASE
                    WHEN (ap.tipo_apontamento = ANY (ARRAY[1, 2])) THEN ap.qtd
                    ELSE (0)::real
                END) AS entrada_apontamento,
            sum(
                CASE
                    WHEN (ap.tipo_apontamento = 5) THEN ap.qtd
                    ELSE (0)::real
                END) AS saida_apontamento,
            max(
                CASE
                    WHEN (ap.tipo_apontamento = 5) THEN 1
                    ELSE 0
                END) AS flag_teve_retorno
           FROM (directus.apontamento ap
             LEFT JOIN pcp_convertido pcp ON ((ap.pcp_id = pcp.pcp_id)))
          WHERE (ap.insumo = 1)
          GROUP BY ap.deposito, pcp.ordem_id
        ), movimento_logistica AS (
         SELECT ce.deposito_id AS id_deposito,
            ce.ordem_id,
            sum(
                CASE
                    WHEN (((ce.marcador)::text ~~* '%TED%'::text) AND (ce.entrada > (0)::double precision)) THEN ce.entrada
                    ELSE (0)::real
                END) AS entrada_estoque,
            sum(
                CASE
                    WHEN (((ce.marcador)::text ~~* '%TED%'::text) AND (ce.saida > (0)::double precision)) THEN ce.saida
                    ELSE (0)::real
                END) AS saida_estoque,
            max(
                CASE
                    WHEN (((ce.marcador)::text ~~* '%TED%'::text) AND (ce.saida > (0)::double precision)) THEN 1
                    ELSE 0
                END) AS flag_teve_saida_estoque
           FROM directus.controle_estoque ce
          WHERE (ce.insumo_id = 1)
          GROUP BY ce.deposito_id, ce.ordem_id
        )
 SELECT COALESCE(mp.id_deposito, ml.id_deposito) AS id_deposito,
    d.nome AS nome_deposito,
    COALESCE(mp.ordem_id, ml.ordem_id) AS id_ordem,
    o.numero_ordem,
    mp.data_ultimo_apontamento,
    (((COALESCE(mp.entrada_apontamento, (0)::real) + COALESCE(ml.entrada_estoque, (0)::real)) - (COALESCE(mp.saida_apontamento, (0)::real) + COALESCE(ml.saida_estoque, (0)::real))))::numeric(10,2) AS diferenca_calculada,
        CASE
            WHEN ((COALESCE(ml.flag_teve_saida_estoque, 0) = 0) AND (COALESCE(mp.flag_teve_retorno, 0) = 0)) THEN (((COALESCE(mp.entrada_apontamento, (0)::real) + COALESCE(ml.entrada_estoque, (0)::real)) - (COALESCE(mp.saida_apontamento, (0)::real) + COALESCE(ml.saida_estoque, (0)::real))))::numeric(10,2)
            ELSE 0.00
        END AS saldo_atual,
        CASE
            WHEN ((COALESCE(ml.flag_teve_saida_estoque, 0) = 1) OR (COALESCE(mp.flag_teve_retorno, 0) = 1)) THEN (((COALESCE(mp.entrada_apontamento, (0)::real) + COALESCE(ml.entrada_estoque, (0)::real)) - (COALESCE(mp.saida_apontamento, (0)::real) + COALESCE(ml.saida_estoque, (0)::real))))::numeric(10,2)
            ELSE 0.00
        END AS quebra_apurada
   FROM (((movimento_producao mp
     FULL JOIN movimento_logistica ml ON (((mp.id_deposito = ml.id_deposito) AND (mp.ordem_id = ml.ordem_id))))
     LEFT JOIN directus.deposito d ON ((COALESCE(mp.id_deposito, ml.id_deposito) = d.id)))
     LEFT JOIN directus.ordens o ON ((COALESCE(mp.ordem_id, ml.ordem_id) = o.id)))
  WHERE ((((COALESCE(mp.entrada_apontamento, (0)::real) + COALESCE(ml.entrada_estoque, (0)::real)) + COALESCE(mp.saida_apontamento, (0)::real)) + COALESCE(ml.saida_estoque, (0)::real)) > (0)::double precision);
```

_Sem referência identificada no código._

---

## view_monitoramento_ordens

Owner: `supabase_admin`

```sql
 SELECT ordens.id,
    ordens.numero_ordem,
    ordens.local_atual,
    ordens.date_updated AS ultima_atualizacao,
    ordens.data_conclusao,
        CASE
            WHEN (ordens.data_conclusao IS NOT NULL) THEN 'concluido'::text
            ELSE 'em_andamento'::text
        END AS status_logico
   FROM directus.ordens
  ORDER BY ordens.date_updated DESC;
```

_Sem referência identificada no código._

---

