# `alissonerp` — Views e Materialized Views

> 71 entradas | gerado 2026-04-29

## Índice

- [`vw_aging_contas`](#vw_aging_contas)
- [`vw_apontamentos_ordem`](#vw_apontamentos_ordem)
- [`vw_auditorias_completa`](#vw_auditorias_completa)
- [`vw_cofre_ouro`](#vw_cofre_ouro)
- [`vw_comissoes`](#vw_comissoes)
- [`vw_contatos`](#vw_contatos)
- [`vw_crediario`](#vw_crediario)
- [`vw_dash_comissoes`](#vw_dash_comissoes)
- [`vw_dash_controle_entregas`](#vw_dash_controle_entregas)
- [`vw_dash_forma_envio`](#vw_dash_forma_envio)
- [`vw_dash_forma_frete`](#vw_dash_forma_frete)
- [`vw_dash_itens_venda`](#vw_dash_itens_venda)
- [`vw_dash_leads`](#vw_dash_leads)
- [`vw_dash_metas_mensais`](#vw_dash_metas_mensais)
- [`vw_dash_metas_por_hora`](#vw_dash_metas_por_hora)
- [`vw_dash_parcelas_pedidos`](#vw_dash_parcelas_pedidos)
- [`vw_dash_pedidos_parcelas_detalhado`](#vw_dash_pedidos_parcelas_detalhado)
- [`vw_dash_vendas`](#vw_dash_vendas)
- [`vw_dash_vendas_todas`](#vw_dash_vendas_todas)
- [`vw_dash_vendedores`](#vw_dash_vendedores)
- [`vw_dashboard_auditoria`](#vw_dashboard_auditoria)
- [`vw_detalhe_pote`](#vw_detalhe_pote)
- [`vw_estoque_comercial_alerta_v2`](#vw_estoque_comercial_alerta_v2)
- [`vw_estoque_directus`](#vw_estoque_directus)
- [`vw_estoque_directus_saldo`](#vw_estoque_directus_saldo)
- [`vw_estoque_ordem`](#vw_estoque_ordem)
- [`vw_fichas_tecnicas`](#vw_fichas_tecnicas)
- [`vw_insumos_directus`](#vw_insumos_directus)
- [`vw_kpis_gerais`](#vw_kpis_gerais)
- [`vw_movimentacoes_directus`](#vw_movimentacoes_directus)
- [`vw_ordem_detalhe`](#vw_ordem_detalhe)
- [`vw_ordens_aguardando_auditoria_loja`](#vw_ordens_aguardando_auditoria_loja)
- [`vw_ordens_completa`](#vw_ordens_completa)
- [`vw_ordens_por_tipo`](#vw_ordens_por_tipo)
- [`vw_ordens_prontas_ida`](#vw_ordens_prontas_ida)
- [`vw_ordens_prontas_pcp`](#vw_ordens_prontas_pcp)
- [`vw_ordens_prontas_volta`](#vw_ordens_prontas_volta)
- [`vw_ouro_em_producao`](#vw_ouro_em_producao)
- [`vw_pcp_completa`](#vw_pcp_completa)
- [`vw_pcp_erp`](#vw_pcp_erp)
- [`vw_producao_mensal`](#vw_producao_mensal)
- [`vw_produtividade_ourives`](#vw_produtividade_ourives)
- [`vw_produto_capa`](#vw_produto_capa)
- [`vw_produto_imagens`](#vw_produto_imagens)
- [`vw_produtos`](#vw_produtos)
- [`vw_produtos_erp`](#vw_produtos_erp)
- [`vw_protocolo_ordens`](#vw_protocolo_ordens)
- [`vw_protocolos_completo`](#vw_protocolos_completo)
- [`vw_protocolos_loja_completo`](#vw_protocolos_loja_completo)
- [`vw_quebra_mensal`](#vw_quebra_mensal)
- [`vw_quebra_operadores`](#vw_quebra_operadores)
- [`vw_quebra_por_deposito`](#vw_quebra_por_deposito)
- [`vw_quebra_por_ourives`](#vw_quebra_por_ourives)
- [`vw_quebra_por_setor`](#vw_quebra_por_setor)
- [`vw_quebra_setor_operador`](#vw_quebra_setor_operador)
- [`vw_resumo_financeiro`](#vw_resumo_financeiro)
- [`vw_saldo_estoque`](#vw_saldo_estoque)
- [`vw_saldo_estoque_comercial`](#vw_saldo_estoque_comercial)
- [`vw_saldo_estoque_comercial_consolidado`](#vw_saldo_estoque_comercial_consolidado)
- [`vw_saldo_estoque_comercial_v2`](#vw_saldo_estoque_comercial_v2)
- [`vw_saldo_por_local`](#vw_saldo_por_local)
- [`vw_saldo_pote`](#vw_saldo_pote)
- [`vw_saldo_pote_ouro`](#vw_saldo_pote_ouro)
- [`vw_saldo_unificado`](#vw_saldo_unificado)
- [`vw_timeline_ordem`](#vw_timeline_ordem)
- [`vw_transferencias_ordem`](#vw_transferencias_ordem)
- [`vw_user_profiles`](#vw_user_profiles)
- [`vw_vendas`](#vw_vendas)
- [`vw_vendas_completa`](#vw_vendas_completa)
- [`vw_vendas_erp_completa`](#vw_vendas_erp_completa)
- [`vw_vendedores`](#vw_vendedores)

---

## vw_aging_contas

Owner: `postgres`

```sql
 SELECT 'pagar'::text AS tipo,
    cp.id,
    cp.descricao,
    cp.fornecedor_id AS contato_id,
    cp.fornecedor_nome AS contato_nome,
    cp.valor,
    cp.data_vencimento,
    cp.data_pagamento AS data_liquidacao,
    cp.situacao,
    cp.categoria,
    cp.obs,
    cp.created_at,
        CASE
            WHEN ((cp.situacao)::text = ANY ((ARRAY['pago'::character varying, 'cancelado'::character varying])::text[])) THEN cp.situacao
            WHEN (cp.data_vencimento IS NULL) THEN 'sem_vencimento'::character varying
            WHEN (cp.data_vencimento < CURRENT_DATE) THEN 'atrasado'::character varying
            WHEN (cp.data_vencimento = CURRENT_DATE) THEN 'vence_hoje'::character varying
            ELSE 'a_vencer'::character varying
        END AS maturidade,
        CASE
            WHEN (((cp.situacao)::text = 'pendente'::text) AND (cp.data_vencimento IS NOT NULL) AND (cp.data_vencimento < CURRENT_DATE)) THEN (CURRENT_DATE - cp.data_vencimento)
            ELSE 0
        END AS dias_atraso
   FROM alissonerp.contas_pagar cp
UNION ALL
 SELECT 'receber'::text AS tipo,
    cr.id,
    cr.descricao,
    cr.cliente_id AS contato_id,
    cr.cliente_nome AS contato_nome,
    cr.valor,
    cr.data_vencimento,
    cr.data_recebimento AS data_liquidacao,
    cr.situacao,
    cr.categoria,
    cr.obs,
    cr.created_at,
        CASE
            WHEN ((cr.situacao)::text = ANY ((ARRAY['recebido'::character varying, 'cancelado'::character varying])::text[])) THEN cr.situacao
            WHEN (cr.data_vencimento IS NULL) THEN 'sem_vencimento'::character varying
            WHEN (cr.data_vencimento < CURRENT_DATE) THEN 'atrasado'::character varying
            WHEN (cr.data_vencimento = CURRENT_DATE) THEN 'vence_hoje'::character varying
            ELSE 'a_vencer'::character varying
        END AS maturidade,
        CASE
            WHEN (((cr.situacao)::text = 'pendente'::text) AND (cr.data_vencimento IS NOT NULL) AND (cr.data_vencimento < CURRENT_DATE)) THEN (CURRENT_DATE - cr.data_vencimento)
            ELSE 0
        END AS dias_atraso
   FROM alissonerp.contas_receber cr;
```

_Sem referência identificada no código._

---

## vw_apontamentos_ordem

Owner: `postgres`

```sql
 SELECT a.id,
    a.pcp_id,
    p.ordem_id,
    o.numero_ordem,
    a.qtd,
    a.created_at AS data,
    ta.id AS tipo_id,
    ta.descricao AS tipo_descricao,
    ins.id AS insumo_id,
    ins.nome AS insumo_nome,
    ins.sku AS insumo_sku,
    cat.nome AS insumo_categoria,
    dep.nome AS deposito_nome,
    st.nome AS setor_nome,
    COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''::text), (au.email)::text, 'Sistema'::text) AS criado_por
   FROM (((((((((alissonerp.apontamentos_pcp a
     LEFT JOIN alissonerp.pcp p ON ((p.id = a.pcp_id)))
     LEFT JOIN alissonerp.ordens o ON ((o.id = p.ordem_id)))
     LEFT JOIN alissonerp.tipos_apontamento ta ON ((ta.id = a.tipo_apontamento_id)))
     LEFT JOIN alissonerp.insumos ins ON ((ins.id = a.insumo_id)))
     LEFT JOIN alissonerp.categorias_insumo cat ON ((cat.id = ins.categoria_id)))
     LEFT JOIN alissonerp.depositos dep ON ((dep.id = a.deposito_id)))
     LEFT JOIN alissonerp.setores st ON ((st.id = a.setor_id)))
     LEFT JOIN auth.users au ON ((au.id = a.created_by)))
     LEFT JOIN user_profiles up ON ((up.id_user = au.id)));
```

_Sem referência identificada no código._

---

## vw_auditorias_completa

Owner: `postgres`

```sql
 SELECT a.id,
    a.situacao,
        CASE a.situacao
            WHEN 'pendente'::text THEN 'Pendente'::character varying
            WHEN 'em_analise'::text THEN 'Em Análise'::character varying
            WHEN 'aprovado'::text THEN 'Aprovada'::character varying
            WHEN 'reprovado'::text THEN 'Reprovada'::character varying
            WHEN 'pendenciado'::text THEN 'Pendenciada'::character varying
            ELSE a.situacao
        END AS situacao_label,
    a.tipo_auditoria,
        CASE a.tipo_auditoria
            WHEN 'loja'::text THEN 'Auditoria Loja'::character varying
            WHEN 'fabrica'::text THEN 'Auditoria Fábrica'::character varying
            ELSE COALESCE(a.tipo_auditoria, 'Outro'::character varying)
        END AS tipo_auditoria_label,
    a.rota_processo,
    a.ordem_id,
    o.numero_ordem,
    o.numero_pedido,
    (o.tipo_ordem)::text AS tipo_ordem,
    (o.rota)::text AS rota_ordem,
    a.ourives_nome,
    COALESCE(a.peso_negociado, (0)::real) AS peso_negociado,
    COALESCE(a.peso_final, (0)::real) AS peso_final,
    COALESCE(a.pmc, (0)::real) AS pmc,
    COALESCE(a.quebra, (0)::real) AS quebra,
    COALESCE(a.quebra_percentual, (0)::real) AS quebra_percentual,
    COALESCE(a.total_metal, (0)::real) AS total_metal,
    COALESCE(a.retorno_metal, (0)::real) AS retorno_metal,
    COALESCE(a.metal_externo, (0)::real) AS metal_externo,
    a.ficha_tecnica_obs,
    a.dados_ordem,
        CASE
            WHEN ((COALESCE(a.peso_negociado, (0)::real) > (0)::double precision) AND (COALESCE(a.peso_final, (0)::real) > (0)::double precision)) THEN round(((((a.peso_final - a.peso_negociado) / a.peso_negociado) * (100)::double precision))::numeric, 1)
            ELSE (0)::numeric
        END AS diff_peso_pct,
    a.responsavel_id,
    up.name AS responsavel_nome,
    a.parecer,
    a.motivo_reprovacao,
    a.tipo_retrabalho,
    a.ordem_retrabalho_id,
    oret.numero_ordem AS ordem_retrabalho_numero,
    c.nome AS cliente_nome,
    v.nome AS vendedor_nome,
    a.created_at,
    a.data_conclusao,
    round((EXTRACT(epoch FROM (COALESCE(a.data_conclusao, now()) - a.created_at)) / 86400.0), 1) AS dias_analise,
    o.data_entrega,
    COALESCE(o.peso_metal_externo, (0)::real) AS peso_metal_externo,
    o.detalhes_ordem
   FROM (((((alissonerp.auditorias a
     LEFT JOIN alissonerp.ordens o ON ((o.id = a.ordem_id)))
     LEFT JOIN user_profiles up ON ((up.id_user = a.responsavel_id)))
     LEFT JOIN alissonerp.ordens oret ON ((oret.id = a.ordem_retrabalho_id)))
     LEFT JOIN contatos c ON ((c.id_contato = o.cliente_id)))
     LEFT JOIN vendedores v ON ((v.id_vendedor = o.vendedor_id)));
```

**Uso no código:**
- `alissonerp.vw_auditorias_completa` — 6 ocorrência(s)
  - `supabase/migrations/028_auditoria_dupla.sql:362`
  - `supabase/migrations/029_corrigir_enum_tipo_ordem.sql:235`
  - `supabase/migrations/034_numero_pedido.sql:8`
  - `supabase/migrations/035_numero_pedido_na_tabela.sql:141`
  - `supabase/migrations/037_auditoria_data_entrega.sql:2`

---

## vw_cofre_ouro

Owner: `postgres`

```sql
 SELECT (count(*))::integer AS total_transacoes,
    COALESCE(sum(pv.ouro_gramas), (0)::numeric) AS total_gramas,
    COALESCE(sum(pv.valor), (0)::numeric) AS total_valor_brl,
    COALESCE(avg(pv.ouro_valor_grama), (0)::numeric) AS preco_medio_grama,
    (count(*) FILTER (WHERE (pv.created_at >= (now() - '30 days'::interval))))::integer AS transacoes_30d,
    COALESCE(sum(pv.ouro_gramas) FILTER (WHERE (pv.created_at >= (now() - '30 days'::interval))), (0)::numeric) AS gramas_30d,
    COALESCE(sum(pv.valor) FILTER (WHERE (pv.created_at >= (now() - '30 days'::interval))), (0)::numeric) AS valor_brl_30d
   FROM alissonerp.pagamentos_venda pv
  WHERE (((pv.forma)::text = 'Ouro'::text) AND ((pv.status)::text = 'confirmado'::text));
```

**Uso no código:**
- `alissonerp.vw_cofre_ouro` — 1 ocorrência(s)
  - `supabase/migrations/178_financeiro_aging_source_cofre.sql:3`

---

## vw_comissoes

Owner: `postgres`

```sql
 SELECT comissoes.id,
    comissoes.created_at,
    comissoes.nome,
    comissoes.tabela
   FROM comissoes;
```

_Sem referência identificada no código._

---

## vw_contatos

Owner: `postgres`

```sql
 SELECT contatos.id_contato,
    contatos.id_api_contato,
    contatos.tipo_idapi,
    contatos.nome,
    contatos.codigo,
    contatos.fantasia,
    contatos.tipo_pessoa,
    contatos.cpf_cnpj,
    contatos.inscricao_estadual,
    contatos.rg,
    contatos.telefone,
    contatos.celular,
    contatos.email,
    contatos.endereco,
    contatos.numero,
    contatos.complemento,
    contatos.bairro,
    contatos.municipio,
    contatos.cep,
    contatos.uf,
    contatos.pais,
    contatos.vendedor_idapi,
    contatos.data_atualizacao,
    contatos.id_kommo
   FROM contatos;
```

_Sem referência identificada no código._

---

## vw_crediario

Owner: `postgres`

```sql
 SELECT cr.id AS conta_receber_id,
    cr.descricao,
    cr.valor,
    cr.data_vencimento,
    cr.data_recebimento,
    cr.situacao,
    cr.obs,
    cr.created_at,
    cr.created_by AS criado_por_uuid,
    cr.venda_erp_id AS venda_id,
    v.numero_venda,
    v.total_venda,
    v.situacao AS venda_situacao,
    v.bloqueado AS venda_bloqueada,
    v.credito_gerente_usado,
    v.created_at AS venda_created_at,
    cr.cliente_id,
    COALESCE(cr.cliente_nome, c.nome) AS cliente_nome,
    c.telefone AS cliente_telefone,
    c.email AS cliente_email,
    v.vendedor_id,
    vend.nome AS vendedor_nome,
    u_cons.id AS consultora_uuid,
    u_cons.nome AS consultora_nome,
        CASE
            WHEN ((cr.situacao)::text = 'pago'::text) THEN 'pago'::text
            WHEN (cr.data_vencimento < CURRENT_DATE) THEN 'vencido'::text
            WHEN (cr.data_vencimento <= (CURRENT_DATE + '7 days'::interval)) THEN 'vence_em_breve'::text
            ELSE 'em_dia'::text
        END AS status_aging,
        CASE
            WHEN ((cr.situacao)::text <> 'pendente'::text) THEN 0
            WHEN (cr.data_vencimento IS NULL) THEN 0
            ELSE GREATEST(0, (CURRENT_DATE - cr.data_vencimento))
        END AS dias_atraso
   FROM ((((alissonerp.contas_receber cr
     LEFT JOIN alissonerp.vendas_erp v ON ((v.id = cr.venda_erp_id)))
     LEFT JOIN contatos c ON ((c.id_contato = cr.cliente_id)))
     LEFT JOIN vendedores vend ON ((vend.id_vendedor = v.vendedor_id)))
     LEFT JOIN alissonerp.usuarios u_cons ON ((u_cons.id = v.created_by)))
  WHERE ((cr.categoria)::text = 'venda'::text);
```

**Uso no código:**
- `alissonerp.vw_crediario` — 2 ocorrência(s)
  - `supabase/migrations/190_modulo_crediario.sql:2`
  - `supabase/migrations/190_modulo_crediario.sql:16`

---

## vw_dash_comissoes

Owner: `postgres`

```sql
 SELECT comissoes.id,
    comissoes.created_at,
    comissoes.nome,
    comissoes.tabela
   FROM comissoes;
```

_Sem referência identificada no código._

---

## vw_dash_controle_entregas

Owner: `postgres`

```sql
 SELECT controle_entregas.id,
    controle_entregas.pedido_id,
    controle_entregas.entregador_responsavel,
    controle_entregas.data_entrega,
    controle_entregas.valor_entrega,
    controle_entregas.observacoes,
    controle_entregas.anexos_path,
    controle_entregas.numero_pedido_plataforma,
    controle_entregas.numero_pedido_tiny,
    controle_entregas.nome_cliente,
    controle_entregas.frete_pago_cliente,
    controle_entregas.bairro_entrega,
    controle_entregas.created_at,
    controle_entregas.updated_at,
    controle_entregas.created_by,
    controle_entregas.vendedor_responsavel_id,
    controle_entregas.entrega_type,
    controle_entregas.status_aprovacao,
    controle_entregas.descricao_entrega,
    ((controle_entregas.status_aprovacao)::text = '2'::text) AS aprovada
   FROM controle_entregas;
```

_Sem referência identificada no código._

---

## vw_dash_forma_envio

Owner: `postgres`

```sql
 SELECT forma_envio.id,
    forma_envio.created_at,
    forma_envio.id_api,
    forma_envio.tipo,
    forma_envio.situacao,
    forma_envio.nome
   FROM forma_envio;
```

_Sem referência identificada no código._

---

## vw_dash_forma_frete

Owner: `postgres`

```sql
 SELECT forma_frete.id,
    forma_frete.created_at,
    forma_frete.nome,
    forma_frete.codigo,
    forma_frete.codigo_externo,
    forma_frete.tipo_entrega,
    forma_frete.id_api,
    forma_frete.id_api_logistica
   FROM forma_frete;
```

_Sem referência identificada no código._

---

## vw_dash_itens_venda

Owner: `postgres`

```sql
 SELECT itens_venda.id,
    itens_venda.venda_id,
    itens_venda.produto_id,
    itens_venda.sku,
    itens_venda.quantidade,
    itens_venda.preco_tabela,
    itens_venda.preco_unitario_final,
    itens_venda.preco_total,
    itens_venda.desconto_percentual,
    itens_venda.desconto_valor,
    itens_venda.comissao_valor,
    itens_venda.comissao_percentual,
    itens_venda.n8n
   FROM itens_venda;
```

_Sem referência identificada no código._

---

## vw_dash_leads

Owner: `postgres`

```sql
 SELECT leads.id,
    leads.id_lead,
    leads.fonte_entrada_id,
    leads.consultor,
    leads.data_entrada,
    leads.data_fechamento,
    leads.motivo_perda,
    leads.pedido_tiny,
    leads.contao_nome AS contato_nome,
    leads.contato_telefone,
    leads.etapa_lead,
    leads.nome_lead,
    leads.data_criacao,
    leads.data_atualizacao,
    leads.id_vendedor,
    leads.status_pedido,
    leads.status_id
   FROM leads;
```

_Sem referência identificada no código._

---

## vw_dash_metas_mensais

Owner: `postgres`

```sql
 SELECT metas_mensais.id,
    metas_mensais.created_at,
    metas_mensais.mes_ano,
    metas_mensais.horas_dia,
    metas_mensais.hora_inicio,
    metas_mensais.dias_trabalhados,
    metas_mensais.valor_ouro,
    metas_mensais.valor_prata,
    metas_mensais.valor_diamante,
    metas_mensais.consultora,
    metas_mensais.dias_nao_trabalhados
   FROM metas_mensais;
```

_Sem referência identificada no código._

---

## vw_dash_metas_por_hora

Owner: `postgres`

```sql
 SELECT metas_por_hora.id,
    metas_por_hora.meta_mensal_id,
    metas_por_hora.created_at,
    metas_por_hora.data_hora,
    metas_por_hora.consultora,
    metas_por_hora.tipo_meta,
    metas_por_hora.valor_meta,
    metas_por_hora.meta_acumulada
   FROM metas_por_hora;
```

_Sem referência identificada no código._

---

## vw_dash_parcelas_pedidos

Owner: `postgres`

```sql
 SELECT parcelas_pedidos.id_parcela,
    parcelas_pedidos.dias,
    parcelas_pedidos.data,
    parcelas_pedidos.valor,
    parcelas_pedidos.observacao,
    parcelas_pedidos.forma_pagamento,
    parcelas_pedidos.meio_pagamento,
    parcelas_pedidos.pedido_id_api
   FROM parcelas_pedidos;
```

_Sem referência identificada no código._

---

## vw_dash_pedidos_parcelas_detalhado

Owner: `postgres`

```sql
 SELECT pedidos_parcelas_detalhado.numero_pedido,
    pedidos_parcelas_detalhado.data_pedido,
    pedidos_parcelas_detalhado.situacao,
    pedidos_parcelas_detalhado.cliente_id_api,
    pedidos_parcelas_detalhado.id_vendedor,
    pedidos_parcelas_detalhado.forma_pagamento_pedido,
    pedidos_parcelas_detalhado.meio_pagamento_pedido,
    pedidos_parcelas_detalhado.data_vencimento_parcela,
    pedidos_parcelas_detalhado.valor_parcela,
    pedidos_parcelas_detalhado.forma_pagamento_parcela,
    pedidos_parcelas_detalhado.meio_pagamento_parcela,
    pedidos_parcelas_detalhado.eh_devolucao
   FROM pedidos_parcelas_detalhado;
```

_Sem referência identificada no código._

---

## vw_dash_vendas

Owner: `postgres`

```sql
 SELECT vendas.id,
    vendas.created_at,
    vendas.updated_at,
    vendas.cliente_id,
    vendas.vendedor_id,
    vendas.data_venda,
    vendas.data_envio,
    vendas.status,
    vendas.total_produtos,
    vendas.total_venda,
    vendas.total_itens_qnt,
    vendas.total_itens_unidades,
    vendas.forma_envio_id,
    vendas.forma_frete_id,
    vendas.endereco_cobranca,
    vendas.dados_entrega,
    vendas.dados_pagamento,
    vendas.observacoes_internas,
    vendas.observacoes,
    vendas.arquivos_path,
    vendas.frete_pago_cliente,
    vendas.lead_id,
    vendas.numero_pedido_tiny,
    vendas.id_api_tiny,
    vendas.public_link_uuid,
    vendas.entregue,
    vendas.numero_pedido,
    vendas.pedido_numero
   FROM vendas;
```

_Sem referência identificada no código._

---

## vw_dash_vendas_todas

Owner: `postgres`

```sql
 SELECT 'legado'::text AS fonte,
    (v.id)::bigint AS id,
    v.data_venda,
    v.status,
    (v.vendedor_id)::bigint AS vendedor_id,
    (v.cliente_id)::bigint AS cliente_id,
    v.total_venda,
    v.frete_pago_cliente,
    v.forma_envio_id,
    v.numero_pedido,
    v.numero_pedido_tiny,
    v.id_api_tiny,
    v.entregue,
    NULL::text AS forma_envio_texto,
    (COALESCE(( SELECT sum(p.valor) AS sum
           FROM parcelas_pedidos p
          WHERE ((p.pedido_id_api = v.id_api_tiny) AND (p.forma_pagamento = 'Vale-troca'::text))), (0)::double precision))::numeric AS valor_vale_troca
   FROM vendas v
  WHERE ((NOT (EXISTS ( SELECT 1
           FROM alissonerp.vendas_erp ve
          WHERE (((ve.situacao)::text = ANY ((ARRAY['aprovado'::character varying, 'enviado'::character varying, 'concluido'::character varying])::text[])) AND (ve.tiny_pedido_id IS NOT NULL) AND (ve.tiny_pedido_id = v.id_api_tiny) AND (ve.data_venda >= '2026-04-23'::date))))) AND (NOT (EXISTS ( SELECT 1
           FROM alissonerp.vendas_erp ve2
          WHERE (((ve2.situacao)::text = ANY ((ARRAY['aprovado'::character varying, 'enviado'::character varying, 'concluido'::character varying])::text[])) AND (ve2.tiny_pedido_id IS NULL) AND (ve2.numero_venda = (v.numero_pedido)::text) AND (ve2.data_venda < '2026-04-23'::date) AND (v.status <> 2))))) AND (NOT (EXISTS ( SELECT 1
           FROM alissonerp.vendas_erp ve3
          WHERE (((ve3.situacao)::text = ANY ((ARRAY['aprovado'::character varying, 'enviado'::character varying, 'concluido'::character varying])::text[])) AND (ve3.tiny_pedido_id IS NOT NULL) AND (ve3.tiny_pedido_id = v.id_api_tiny) AND (ve3.data_venda < '2026-04-23'::date) AND (v.status <> 2))))))
UNION ALL
 SELECT 'erp'::text AS fonte,
    (ve.id)::bigint AS id,
    ve.data_venda,
    2 AS status,
    ve.vendedor_id,
    ve.cliente_id,
    ve.total_venda,
    ve.total_frete AS frete_pago_cliente,
    NULL::integer AS forma_envio_id,
    NULL::bigint AS numero_pedido,
    COALESCE((ve.tiny_pedido_id)::text, ve.numero_venda) AS numero_pedido_tiny,
    ve.tiny_pedido_id AS id_api_tiny,
    false AS entregue,
    ve.forma_envio AS forma_envio_texto,
    COALESCE(( SELECT sum(pv.valor) AS sum
           FROM alissonerp.pagamentos_venda pv
          WHERE ((pv.venda_id = ve.id) AND ((pv.forma)::text = 'Vale-troca'::text) AND ((pv.status)::text = 'confirmado'::text))), (0)::numeric) AS valor_vale_troca
   FROM alissonerp.vendas_erp ve
  WHERE (((ve.situacao)::text = ANY ((ARRAY['aprovado'::character varying, 'enviado'::character varying, 'concluido'::character varying])::text[])) AND ((ve.data_venda >= '2026-04-23'::date) OR ((ve.data_venda < '2026-04-23'::date) AND (ve.tiny_pedido_id IS NULL) AND (ve.total_venda > (0)::numeric) AND (EXISTS ( SELECT 1
           FROM vendas v2
          WHERE (((v2.numero_pedido)::text = ve.numero_venda) AND (v2.status <> 2))))) OR ((ve.data_venda < '2026-04-23'::date) AND (ve.tiny_pedido_id IS NOT NULL) AND (ve.total_venda > (0)::numeric) AND (EXISTS ( SELECT 1
           FROM vendas v3
          WHERE ((v3.id_api_tiny = ve.tiny_pedido_id) AND (v3.status IS DISTINCT FROM 2)))))));
```

**Uso no código:**
- `alissonerp.vw_dash_vendas_todas` — 2 ocorrência(s)
  - `supabase/migrations/176_dashboard_comercial_union_erp.sql:4`
  - `supabase/migrations/182_fix_vw_dash_vendas_todas_pre_cutoff.sql:2`

---

## vw_dash_vendedores

Owner: `postgres`

```sql
 SELECT vendedores.id_vendedor,
    vendedores.nome,
    vendedores.id_api_vendedor,
    vendedores.foto,
    vendedores.situacao,
    vendedores.id_api_kommo,
    vendedores.cpf,
    vendedores.email,
    vendedores.user_id,
    vendedores.comissao,
    vendedores.gerente_orcamento
   FROM vendedores;
```

_Sem referência identificada no código._

---

## vw_dashboard_auditoria

Owner: `postgres`

```sql
 SELECT auditorias.tipo_auditoria,
    count(*) FILTER (WHERE ((auditorias.situacao)::text = 'pendente'::text)) AS pendentes,
    count(*) FILTER (WHERE ((auditorias.situacao)::text = 'em_analise'::text)) AS em_analise,
    count(*) FILTER (WHERE ((auditorias.situacao)::text = 'aprovado'::text)) AS aprovadas,
    count(*) FILTER (WHERE ((auditorias.situacao)::text = 'reprovado'::text)) AS reprovadas,
    count(*) FILTER (WHERE ((auditorias.situacao)::text = 'pendenciado'::text)) AS pendenciadas,
    count(*) AS total,
        CASE
            WHEN (count(*) FILTER (WHERE ((auditorias.situacao)::text = ANY ((ARRAY['aprovado'::character varying, 'reprovado'::character varying])::text[]))) > 0) THEN round((((count(*) FILTER (WHERE ((auditorias.situacao)::text = 'aprovado'::text)))::numeric / (count(*) FILTER (WHERE ((auditorias.situacao)::text = ANY ((ARRAY['aprovado'::character varying, 'reprovado'::character varying])::text[]))))::numeric) * (100)::numeric), 1)
            ELSE (0)::numeric
        END AS taxa_aprovacao,
    COALESCE(round(avg(
        CASE
            WHEN (auditorias.data_conclusao IS NOT NULL) THEN (EXTRACT(epoch FROM (auditorias.data_conclusao - auditorias.created_at)) / 86400.0)
            ELSE NULL::numeric
        END), 1), (0)::numeric) AS media_dias,
    count(*) FILTER (WHERE (auditorias.quebra_percentual > (5)::double precision)) AS alertas_quebra
   FROM alissonerp.auditorias
  GROUP BY auditorias.tipo_auditoria;
```

**Uso no código:**
- `alissonerp.vw_dashboard_auditoria` — 2 ocorrência(s)
  - `supabase/migrations/028_auditoria_dupla.sql:436`
  - `supabase/migrations/029_corrigir_enum_tipo_ordem.sql:295`

---

## vw_detalhe_pote

Owner: `postgres`

```sql
 SELECT i.id AS insumo_id,
    i.sku,
    i.nome AS insumo_nome,
    COALESCE(i.unidade, 'g'::character varying) AS unidade,
    i.categoria_id,
    ci.nome AS categoria_nome,
    COALESCE(se.saldo_total, (0)::real) AS saldo_real,
        CASE
            WHEN (i.categoria_id = 2) THEN round(((COALESCE(se.saldo_total, (0)::real) / (0.2)::double precision))::numeric, 4)
            ELSE NULL::numeric
        END AS saldo_ct,
        CASE
            WHEN ((i.categoria_id = 2) AND (i.peso_pedra IS NOT NULL) AND (i.peso_pedra > (0)::double precision)) THEN round(((COALESCE(se.saldo_total, (0)::real) / i.peso_pedra))::numeric, 0)
            ELSE NULL::numeric
        END AS quantidade,
    i.estoque_minimo,
    i.estoque_maximo,
    i.custo_compra,
    i.descricao,
    i.ativo,
    i.foto,
    i.fornecedor_id,
    i.peso_pedra,
    i.peso_pedra_ct,
    i.observacao,
    i.created_at,
    i.updated_at
   FROM ((alissonerp.insumos i
     JOIN alissonerp.categorias_insumo ci ON ((ci.id = i.categoria_id)))
     LEFT JOIN ( SELECT vw_saldo_estoque.insumo_id,
            sum(vw_saldo_estoque.saldo) AS saldo_total
           FROM alissonerp.vw_saldo_estoque
          GROUP BY vw_saldo_estoque.insumo_id) se ON ((se.insumo_id = i.id)))
  WHERE (i.ativo = true)
  ORDER BY ci.nome, i.nome;
```

**Uso no código:**
- `alissonerp.vw_detalhe_pote` — 6 ocorrência(s)
  - `supabase/migrations/052_fix_vw_detalhe_pote.sql:2`
  - `supabase/migrations/052_fix_vw_detalhe_pote.sql:3`
  - `supabase/migrations/052_fix_vw_detalhe_pote.sql:5`
  - `supabase/migrations/097_views_saldo_multilocal_ct.sql:5`
  - `supabase/migrations/097_views_saldo_multilocal_ct.sql:34`

---

## vw_estoque_comercial_alerta_v2

Owner: `postgres`

```sql
 SELECT vw_saldo_estoque_comercial_consolidado.produto_id,
    vw_saldo_estoque_comercial_consolidado.nome_produto,
    vw_saldo_estoque_comercial_consolidado.sku,
    vw_saldo_estoque_comercial_consolidado.categoria,
    vw_saldo_estoque_comercial_consolidado.config_id,
    vw_saldo_estoque_comercial_consolidado.estoque_minimo,
    vw_saldo_estoque_comercial_consolidado.ativo,
    vw_saldo_estoque_comercial_consolidado.saldo_fisico,
    vw_saldo_estoque_comercial_consolidado.reservado,
    vw_saldo_estoque_comercial_consolidado.disponivel,
    vw_saldo_estoque_comercial_consolidado.em_transito,
    vw_saldo_estoque_comercial_consolidado.total_movimentacoes,
    vw_saldo_estoque_comercial_consolidado.ultima_movimentacao,
        CASE
            WHEN (vw_saldo_estoque_comercial_consolidado.disponivel < 0) THEN 'negativo'::text
            WHEN (vw_saldo_estoque_comercial_consolidado.disponivel = 0) THEN 'zerado'::text
            WHEN (vw_saldo_estoque_comercial_consolidado.disponivel < vw_saldo_estoque_comercial_consolidado.estoque_minimo) THEN 'abaixo_minimo'::text
            WHEN (vw_saldo_estoque_comercial_consolidado.disponivel = vw_saldo_estoque_comercial_consolidado.estoque_minimo) THEN 'no_minimo'::text
            ELSE 'ok'::text
        END AS alerta
   FROM alissonerp.vw_saldo_estoque_comercial_consolidado;
```

**Uso no código:**
- `alissonerp.vw_estoque_comercial_alerta_v2` — 4 ocorrência(s)
  - `src/app/api/estoque-comercial/route.ts:31`
  - `src/app/api/estoque-comercial/[produtoId]/route.ts:25`
  - `supabase/migrations/140_estoque_comercial_v2.sql:216`
  - `supabase/migrations/140_estoque_comercial_v2.sql:248`

---

## vw_estoque_directus

Owner: `postgres`

```sql
 SELECT ce.id,
    ce.entrada,
    ce.saida,
    ce.insumo_id,
    ce.deposito_id,
    ce.setor,
    ce.marcador,
    ce.ordem_id,
    ce.data_hora,
    ce.date_created
   FROM directus.controle_estoque ce;
```

_Sem referência identificada no código._

---

## vw_estoque_directus_saldo

Owner: `postgres`

```sql
 SELECT m.deposito_id,
    dep.nome AS deposito_nome,
    m.insumo_id,
    ins.nome AS insumo_nome,
    ins.sku AS insumo_sku,
    cat.nome AS categoria_nome,
    cat.id AS categoria_id,
    m.local_estoque_id,
    le.nome AS local_estoque_nome,
    COALESCE(sum(m.entrada), (0)::real) AS total_entrada,
    COALESCE(sum(m.saida), (0)::real) AS total_saida,
    (COALESCE(sum(m.entrada), (0)::real) - COALESCE(sum(m.saida), (0)::real)) AS saldo,
        CASE
            WHEN (cat.id = 2) THEN round((((COALESCE(sum(m.entrada), (0)::real) - COALESCE(sum(m.saida), (0)::real)) / (0.2)::double precision))::numeric, 4)
            ELSE NULL::numeric
        END AS saldo_ct,
        CASE
            WHEN ((cat.id = 2) AND (ins.peso_pedra IS NOT NULL) AND (ins.peso_pedra > (0)::double precision)) THEN round((((COALESCE(sum(m.entrada), (0)::real) - COALESCE(sum(m.saida), (0)::real)) / ins.peso_pedra))::numeric, 0)
            ELSE NULL::numeric
        END AS quantidade,
    ins.peso_pedra,
    ins.peso_pedra_ct,
    count(*) AS total_movimentacoes,
    max(m.created_at) AS ultima_movimentacao
   FROM ((((alissonerp.movimentacoes_estoque m
     LEFT JOIN alissonerp.depositos dep ON ((dep.id = m.deposito_id)))
     LEFT JOIN alissonerp.insumos ins ON ((ins.id = m.insumo_id)))
     LEFT JOIN alissonerp.categorias_insumo cat ON ((cat.id = ins.categoria_id)))
     LEFT JOIN alissonerp.locais_estoque le ON ((le.id = m.local_estoque_id)))
  GROUP BY m.deposito_id, dep.nome, m.insumo_id, ins.nome, ins.sku, cat.nome, cat.id, ins.peso_pedra, ins.peso_pedra_ct, m.local_estoque_id, le.nome;
```

**Uso no código:**
- `alissonerp.vw_estoque_directus_saldo` — 10 ocorrência(s)
  - `src/app/api/produtos/route.ts:193`
  - `src/app/api/site/produtos/route.ts:102`
  - `scripts/diag_estoque2.js:5`
  - `scripts/diag_estoque2.js:15`
  - `scripts/diag_estoque2.js:25`

---

## vw_estoque_ordem

Owner: `postgres`

```sql
 SELECT m.id,
    m.entrada,
    m.saida,
    (m.marcador)::text AS marcador,
    m.data_hora,
    m.created_at AS date_created,
    m.ordem_id,
    o.numero_ordem,
    ins.nome AS insumo_nome,
    dep.nome AS deposito_nome,
    st.nome AS setor_nome
   FROM ((((alissonerp.movimentacoes_estoque m
     LEFT JOIN alissonerp.ordens o ON ((o.id = m.ordem_id)))
     LEFT JOIN alissonerp.insumos ins ON ((ins.id = m.insumo_id)))
     LEFT JOIN alissonerp.depositos dep ON ((dep.id = m.deposito_id)))
     LEFT JOIN alissonerp.setores st ON ((st.id = m.setor_id)));
```

_Sem referência identificada no código._

---

## vw_fichas_tecnicas

Owner: `postgres`

```sql
 SELECT o.id AS ordem_id,
    o.numero_ordem,
    ft.id AS ficha_id,
    ft.date_created,
    ft.date_updated,
    ft.milimetragem_1,
    ft.milimetragem_2,
    ft.numeracao,
    ft.numeracao_2,
    ft.comprimento,
    ft.modelo_1,
        CASE ft.modelo_1
            WHEN '1'::text THEN 'Safira (Quadrada Lisa)'::character varying
            WHEN '2'::text THEN 'Esmeralda (Boleada Lisa)'::character varying
            WHEN '3'::text THEN 'Cristal (risco em cada lateral)'::character varying
            WHEN '4'::text THEN 'Opala (risco lateral)'::character varying
            WHEN '5'::text THEN 'Turquesa (risco no meio)'::character varying
            WHEN '6'::text THEN 'Granada (dois riscos mesma lateral)'::character varying
            WHEN '7'::text THEN 'Água Marinha (friso lateral)'::character varying
            WHEN '8'::text THEN 'Bordas Elevadas (centro cravejado)'::character varying
            WHEN '9'::text THEN 'Jade (risco lateral, escovado)'::character varying
            WHEN '10'::text THEN 'Quartzo Rosa (bordas chanfradas)'::character varying
            WHEN '11'::text THEN 'Ametista (risco no meio)'::character varying
            WHEN '12'::text THEN 'Turmalina Paraíba (friso diamantado)'::character varying
            WHEN '13'::text THEN 'Friso + corda + meia lua de pedras'::character varying
            WHEN '14'::text THEN 'Dois frisos + corda'::character varying
            ELSE ft.modelo_1
        END AS modelo_1_label,
    ft.outro_modelo_1,
    ft.modelo_2,
        CASE ft.modelo_2
            WHEN '1'::text THEN 'Safira (Quadrada Lisa)'::character varying
            WHEN '2'::text THEN 'Esmeralda (Boleada Lisa)'::character varying
            WHEN '3'::text THEN 'Cristal (risco em cada lateral)'::character varying
            WHEN '4'::text THEN 'Opala (risco lateral)'::character varying
            WHEN '5'::text THEN 'Turquesa (risco no meio)'::character varying
            WHEN '6'::text THEN 'Granada (dois riscos mesma lateral)'::character varying
            WHEN '7'::text THEN 'Água Marinha (friso lateral)'::character varying
            WHEN '8'::text THEN 'Bordas Elevadas (centro cravejado)'::character varying
            WHEN '9'::text THEN 'Jade (risco lateral, escovado)'::character varying
            WHEN '10'::text THEN 'Quartzo Rosa (bordas chanfradas)'::character varying
            WHEN '11'::text THEN 'Ametista (risco no meio)'::character varying
            WHEN '12'::text THEN 'Turmalina Paraíba (friso diamantado)'::character varying
            WHEN '13'::text THEN 'Friso + corda + meia lua de pedras'::character varying
            WHEN '14'::text THEN 'Dois frisos + corda'::character varying
            ELSE ft.modelo_2
        END AS modelo_2_label,
    ft.outro_modelo_2,
    ft.modelo_interno_1,
        CASE ft.modelo_interno_1
            WHEN '2'::text THEN 'Confort'::character varying
            WHEN '3'::text THEN 'Reta'::character varying
            ELSE ft.modelo_interno_1
        END AS modelo_interno_1_label,
    ft.modelo_interno_2,
        CASE ft.modelo_interno_2
            WHEN '2'::text THEN 'Confort'::character varying
            WHEN '3'::text THEN 'Reta'::character varying
            ELSE ft.modelo_interno_2
        END AS modelo_interno_2_label,
    ft.tipo_fonte_1,
        CASE ft.tipo_fonte_1
            WHEN '1'::text THEN 'Forma'::character varying
            WHEN '2'::text THEN 'Cursiva'::character varying
            WHEN '3'::text THEN 'Sem Gravação'::character varying
            ELSE ft.tipo_fonte_1
        END AS tipo_fonte_1_label,
    ft.texto_tipo_fonte_1,
    ft.tipo_fonte_2,
        CASE ft.tipo_fonte_2
            WHEN '1'::text THEN 'Forma'::character varying
            WHEN '2'::text THEN 'Cursiva'::character varying
            WHEN '3'::text THEN 'Sem Gravação'::character varying
            ELSE ft.tipo_fonte_2
        END AS tipo_fonte_2_label,
    ft.texto_tipo_fonte_2,
    ft.tipo_elo,
        CASE ft.tipo_elo
            WHEN '1'::text THEN 'Cartier Quadrado'::character varying
            WHEN '2'::text THEN 'Cartier Aberto'::character varying
            WHEN '3'::text THEN 'Veneziano'::character varying
            WHEN '4'::text THEN 'Piastrine'::character varying
            WHEN '5'::text THEN 'Elo Português'::character varying
            WHEN '6'::text THEN 'Cingapura'::character varying
            WHEN '7'::text THEN 'Corda'::character varying
            WHEN '8'::text THEN 'Bismarck'::character varying
            WHEN '9'::text THEN 'Garimpeiro'::character varying
            WHEN '10'::text THEN 'Palmeira'::character varying
            WHEN '11'::text THEN 'Escama de Peixe'::character varying
            WHEN '12'::text THEN 'Grummert'::character varying
            WHEN '13'::text THEN 'Baguet'::character varying
            WHEN '14'::text THEN '3 em 1'::character varying
            WHEN '15'::text THEN 'Outros'::character varying
            ELSE ft.tipo_elo
        END AS tipo_elo_label,
    ft.outro_tipo_elo,
    ft.tipo_fecho,
        CASE ft.tipo_fecho
            WHEN '1'::text THEN 'Boia'::character varying
            WHEN '2'::text THEN 'Anzol'::character varying
            WHEN '3'::text THEN 'Batom'::character varying
            WHEN '4'::text THEN 'Caixa'::character varying
            WHEN '5'::text THEN 'Imã'::character varying
            WHEN '6'::text THEN 'Ouro'::character varying
            ELSE ft.tipo_fecho
        END AS tipo_fecho_label,
    ft.outro_tipo_fecho,
    ft.modelo_anel,
    ft.milimetragem_da_base,
    ft.milimetragem_do_aro,
    ft.modelo_interno_anel,
    ft.modelo_externo_anel,
    ft.modelo_pingente,
        CASE ft.modelo_pingente
            WHEN '1'::text THEN 'Crucifixo'::character varying
            WHEN '2'::text THEN 'Medalha'::character varying
            WHEN '3'::text THEN 'Ponto de Luz'::character varying
            WHEN '4'::text THEN 'Coração'::character varying
            WHEN '6'::text THEN 'Outro'::character varying
            ELSE ft.modelo_pingente
        END AS modelo_pingente_label,
    ft."Outro_modelo_pingente" AS outro_modelo_pingente,
    ft."Altura_pingente" AS altura_pingente,
    ft.largura_pingente,
    ft.modelo_bracelete,
    ft.altura_placa,
    ft.largura_placa,
    ft.expessura_chapa,
    ft.nome_chapa,
    ft.tipo_tarraxa
   FROM ((alissonerp.ordens o
     JOIN directus.ordens dor ON ((dor.id = o.directus_ordem_id)))
     JOIN directus.ficha_tecnica_ordem ft ON ((ft.id = dor.ficha_tecnica_id)));
```

**Uso no código:**
- `alissonerp.vw_fichas_tecnicas` — 1 ocorrência(s)
  - `supabase/migrations/033_ficha_tecnica_labels.sql:2`

---

## vw_insumos_directus

Owner: `postgres`

```sql
 SELECT i.id,
    i.sku,
    i.nome,
    cat.nome AS categoria,
    cat.id AS categoria_id,
    i.saldo,
    i.peso_pedra,
    i.custo_compra,
    i.estoque_minimo,
    i.estoque_maximo,
        CASE
            WHEN (i.saldo <= (0)::double precision) THEN 'critico'::text
            WHEN ((i.estoque_minimo > (0)::double precision) AND (i.saldo < i.estoque_minimo)) THEN 'critico'::text
            WHEN ((i.estoque_minimo > (0)::double precision) AND (i.saldo < (i.estoque_minimo * (1.5)::double precision))) THEN 'atencao'::text
            ELSE 'ok'::text
        END AS status_estoque
   FROM (alissonerp.insumos i
     LEFT JOIN alissonerp.categorias_insumo cat ON ((cat.id = i.categoria_id)));
```

**Uso no código:**
- `alissonerp.vw_insumos_directus` — 4 ocorrência(s)
  - `scripts/diag_estoque2.js:60`
  - `scripts/diag_estoque2.js:64`
  - `scripts/diag_estoque2.js:67`
  - `scripts/diag_estoque2.js:70`

---

## vw_kpis_gerais

Owner: `postgres`

```sql
 SELECT ( SELECT count(*) AS count
           FROM alissonerp.ordens
          WHERE (ordens.status = 'em_andamento'::alissonerp.enum_status_ordem)) AS ordens_em_andamento,
    ( SELECT count(*) AS count
           FROM alissonerp.ordens
          WHERE (ordens.status = 'aguardando'::alissonerp.enum_status_ordem)) AS ordens_aguardando,
    ( SELECT count(*) AS count
           FROM alissonerp.ordens
          WHERE ((ordens.status = 'concluido'::alissonerp.enum_status_ordem) AND (ordens.created_at > date_trunc('month'::text, now())))) AS concluidas_mes,
    ( SELECT count(*) AS count
           FROM alissonerp.pcp
          WHERE (pcp.etapas = ANY (ARRAY['novas_ordens'::alissonerp.enum_etapas_pcp, 'aguardando'::alissonerp.enum_etapas_pcp, 'em_andamento'::alissonerp.enum_etapas_pcp]))) AS pcps_ativos,
    ( SELECT count(*) AS count
           FROM alissonerp.protocolos
          WHERE (protocolos.etapas = ANY (ARRAY['pendente'::alissonerp.enum_etapas_protocolo, 'concluido'::alissonerp.enum_etapas_protocolo]))) AS protocolos_pendentes,
    ( SELECT parametros.cotacao_ouro
           FROM alissonerp.parametros
          WHERE (parametros.id = 1)) AS cotacao_ouro,
    ( SELECT parametros.cotacao_dolar
           FROM alissonerp.parametros
          WHERE (parametros.id = 1)) AS cotacao_dolar,
    ( SELECT count(*) AS count
           FROM alissonerp.contas_pagar
          WHERE ((contas_pagar.situacao)::text = 'pendente'::text)) AS contas_pagar_pendentes,
    ( SELECT COALESCE(sum(contas_pagar.valor), (0)::numeric) AS "coalesce"
           FROM alissonerp.contas_pagar
          WHERE ((contas_pagar.situacao)::text = 'pendente'::text)) AS total_a_pagar,
    ( SELECT count(*) AS count
           FROM alissonerp.contas_receber
          WHERE ((contas_receber.situacao)::text = 'pendente'::text)) AS contas_receber_pendentes,
    ( SELECT COALESCE(sum(contas_receber.valor), (0)::numeric) AS "coalesce"
           FROM alissonerp.contas_receber
          WHERE ((contas_receber.situacao)::text = 'pendente'::text)) AS total_a_receber;
```

_Sem referência identificada no código._

---

## vw_movimentacoes_directus

Owner: `postgres`

```sql
 SELECT m.id,
    m.entrada,
    m.saida,
    m.insumo_id,
    ins.nome AS insumo_nome,
    m.deposito_id,
    dep.nome AS deposito_nome,
    m.setor_id AS setor,
    st.nome AS setor_nome,
    (m.marcador)::text AS marcador,
    m.ordem_id,
    o.numero_ordem,
    m.obs,
    m.data_hora,
    m.created_at AS date_created,
    m.local_estoque_id,
    le.nome AS local_estoque_nome
   FROM (((((alissonerp.movimentacoes_estoque m
     LEFT JOIN alissonerp.insumos ins ON ((ins.id = m.insumo_id)))
     LEFT JOIN alissonerp.depositos dep ON ((dep.id = m.deposito_id)))
     LEFT JOIN alissonerp.setores st ON ((st.id = m.setor_id)))
     LEFT JOIN alissonerp.ordens o ON ((o.id = m.ordem_id)))
     LEFT JOIN alissonerp.locais_estoque le ON ((le.id = m.local_estoque_id)));
```

**Uso no código:**
- `alissonerp.vw_movimentacoes_directus` — 1 ocorrência(s)
  - `supabase/migrations/122_views_local_estoque_display.sql:5`

---

## vw_ordem_detalhe

Owner: `postgres`

```sql
 SELECT o.id,
    o.numero_ordem,
    (o.situacao)::text AS situacao_cod,
        CASE (o.situacao)::text
            WHEN 'cancelado'::text THEN 'Cancelado'::text
            WHEN 'criado'::text THEN 'Criado'::text
            WHEN 'rascunho'::text THEN 'Rascunho'::text
            ELSE 'Desconhecido'::text
        END AS situacao,
    (o.status)::text AS status_cod,
        CASE (o.status)::text
            WHEN 'cancelado'::text THEN 'Cancelado'::text
            WHEN 'aguardando'::text THEN 'Aguardando'::text
            WHEN 'em_andamento'::text THEN 'Em Andamento'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            ELSE 'Aguardando'::text
        END AS status,
    (o.rota)::text AS rota_cod,
        CASE (o.rota)::text
            WHEN 'pcp'::text THEN 'PCP'::text
            WHEN 'protocolo'::text THEN 'Protocolo'::text
            ELSE '—'::text
        END AS rota,
    (o.tipo_ordem)::text AS tipo_ordem_cod,
        CASE (o.tipo_ordem)::text
            WHEN 'servico_venda'::text THEN 'Serviço Venda'::text
            WHEN 'servico_loja'::text THEN 'Serviço Loja'::text
            WHEN 'fabricacao'::text THEN 'Fabricação'::text
            WHEN 'reposicao_venda'::text THEN 'Reposição Venda'::text
            WHEN 'reposicao_loja'::text THEN 'Reposição Loja'::text
            WHEN 'compra_fornecedor'::text THEN 'Compra de Fornecedor'::text
            WHEN 'garantia'::text THEN 'Garantia'::text
            WHEN 'servico_interno'::text THEN 'Serviço Interno'::text
            ELSE '—'::text
        END AS tipo_ordem,
    o.setor_atual AS setor_id,
    s.nome AS setor_nome,
    o.local_atual AS deposito_id,
    d.nome AS deposito_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.created_at AS date_created,
    o.updated_at AS date_updated,
    p.id AS pcp_id,
    (p.etapas)::text AS pcp_etapas_cod,
        CASE (p.etapas)::text
            WHEN 'novas_ordens'::text THEN 'Novas Ordens'::text
            WHEN 'pendencia'::text THEN 'Pendência'::text
            WHEN 'aguardando'::text THEN 'Aguardando'::text
            WHEN 'em_andamento'::text THEN 'Em Andamento'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            WHEN 'cancelado'::text THEN 'Cancelado'::text
            ELSE '—'::text
        END AS pcp_etapas,
    p.total_metal AS pcp_total_metal,
    p.retorno_metal AS pcp_retorno_metal,
    p.total_pedras_un AS pcp_total_pedras_un,
    p.total_pedras_g AS pcp_total_pedras_g,
    p.total_geral_outros_pesos AS pcp_total_outros,
    p.pmc AS pcp_pmc,
    p.quebra AS pcp_quebra,
    p.porcentagem_de_quebra AS pcp_quebra_pct,
    p.peso_final AS pcp_peso_final,
    p.metal_externo AS pcp_metal_externo,
    p.bloqueado AS pcp_bloqueado,
    p.data_conclusao AS pcp_data_conclusao,
    p.local_atual AS pcp_local_atual,
    COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''::text), (au.email)::text, 'Sem operador'::text) AS pcp_operador_nome,
    dist.id AS dist_id,
    (dist.setor)::text AS dist_setor,
    (dist.etapas)::text AS dist_etapas_cod,
        CASE (dist.etapas)::text
            WHEN 'em_andamento'::text THEN 'Em Andamento'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            ELSE NULL::text
        END AS dist_etapas,
    dist.pmc AS dist_pmc,
    dist.quebra AS dist_quebra,
    dist.porcentagem_de_quebra AS dist_quebra_pct,
    o.foto_peca_servico,
    o.peso_peca_servico,
    o.video_observacao,
    o.detalhes_ordem
   FROM ((((((((alissonerp.ordens o
     LEFT JOIN alissonerp.setores s ON ((s.id = o.setor_atual)))
     LEFT JOIN alissonerp.depositos d ON ((d.id = o.local_atual)))
     LEFT JOIN vendedores v ON ((v.id_vendedor = o.vendedor_id)))
     LEFT JOIN contatos c ON ((c.id_contato = o.cliente_id)))
     LEFT JOIN alissonerp.pcp p ON ((p.ordem_id = o.id)))
     LEFT JOIN auth.users au ON ((au.id = p.operador)))
     LEFT JOIN user_profiles up ON ((up.id_user = au.id)))
     LEFT JOIN alissonerp.distribuicoes dist ON ((dist.id = o.distribuicao_id)));
```

**Uso no código:**
- `alissonerp.vw_ordem_detalhe` — 7 ocorrência(s)
  - `scripts/apply_073.mjs:476`
  - `scripts/fix_views_073.mjs:197`
  - `scripts/fix_views_073.mjs:232`
  - `supabase/migrations/029_corrigir_enum_tipo_ordem.sql:134`
  - `supabase/migrations/073_tipo_servico_venda_loja.sql:5`

---

## vw_ordens_aguardando_auditoria_loja

Owner: `postgres`

```sql
 SELECT o.id,
    o.numero_ordem,
    (o.status)::text AS status,
    (o.tipo_ordem)::text AS tipo_ordem,
    (o.rota)::text AS rota,
    a.id AS auditoria_id,
    a.situacao AS auditoria_situacao,
    a.created_at AS auditoria_criada_em
   FROM (alissonerp.ordens o
     JOIN alissonerp.auditorias a ON (((a.ordem_id = o.id) AND ((a.tipo_auditoria)::text = 'loja'::text))))
  WHERE ((a.situacao)::text = ANY ((ARRAY['pendente'::character varying, 'em_analise'::character varying, 'pendenciado'::character varying])::text[]))
  ORDER BY a.created_at DESC;
```

**Uso no código:**
- `alissonerp.vw_ordens_aguardando_auditoria_loja` — 2 ocorrência(s)
  - `supabase/migrations/028_auditoria_dupla.sql:502`
  - `supabase/migrations/029_corrigir_enum_tipo_ordem.sql:320`

---

## vw_ordens_completa

Owner: `postgres`

```sql
 SELECT o.id,
    o.numero_ordem,
    o.numero_pedido,
    o.venda_id,
    (o.situacao)::text AS situacao_cod,
        CASE (o.situacao)::text
            WHEN 'cancelado'::text THEN 'Cancelado'::text
            WHEN 'criado'::text THEN 'Criado'::text
            WHEN 'rascunho'::text THEN 'Rascunho'::text
            ELSE 'Desconhecido'::text
        END AS situacao,
    (o.status)::text AS status_cod,
        CASE (o.status)::text
            WHEN 'aguardando'::text THEN 'Aguardando'::text
            WHEN 'em_andamento'::text THEN 'Em Andamento'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            WHEN 'cancelado'::text THEN 'Cancelado'::text
            ELSE 'Desconhecido'::text
        END AS status,
    (o.rota)::text AS rota_cod,
        CASE (o.rota)::text
            WHEN 'pcp'::text THEN 'PCP'::text
            WHEN 'protocolo'::text THEN 'Protocolo'::text
            ELSE '—'::text
        END AS rota,
    (o.tipo_ordem)::text AS tipo_ordem_cod,
        CASE (o.tipo_ordem)::text
            WHEN 'servico_venda'::text THEN 'Serviço Venda'::text
            WHEN 'servico_loja'::text THEN 'Serviço Loja'::text
            WHEN 'fabricacao'::text THEN 'Fabricação'::text
            WHEN 'reposicao_venda'::text THEN 'Reposição Venda'::text
            WHEN 'reposicao_loja'::text THEN 'Reposição Loja'::text
            WHEN 'compra_fornecedor'::text THEN 'Compra de Fornecedor'::text
            WHEN 'garantia'::text THEN 'Garantia'::text
            WHEN 'servico_interno'::text THEN 'Serviço Interno'::text
            ELSE '—'::text
        END AS tipo_ordem,
    o.setor_atual AS setor_id,
    s.nome AS setor_nome,
    o.local_atual AS deposito_id,
    d.nome AS deposito_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.created_at AS date_created,
    o.updated_at AS date_updated
   FROM ((((alissonerp.ordens o
     LEFT JOIN alissonerp.setores s ON ((s.id = o.setor_atual)))
     LEFT JOIN alissonerp.depositos d ON ((d.id = o.local_atual)))
     LEFT JOIN vendedores v ON ((v.id_vendedor = o.vendedor_id)))
     LEFT JOIN contatos c ON ((c.id_contato = o.cliente_id)));
```

**Uso no código:**
- `alissonerp.vw_ordens_completa` — 9 ocorrência(s)
  - `scripts/apply_073.mjs:350`
  - `scripts/apply_136.mjs:40`
  - `scripts/diagnose_ordens.mjs:7`
  - `scripts/fix_views_073.mjs:68`
  - `supabase/migrations/015_correcoes_views.sql:4`

---

## vw_ordens_por_tipo

Owner: `postgres`

```sql
 SELECT
        CASE (o.tipo_ordem)::text
            WHEN 'servico_venda'::text THEN 'Serviço Venda'::text
            WHEN 'servico_loja'::text THEN 'Serviço Loja'::text
            WHEN 'fabricacao'::text THEN 'Fabricação'::text
            WHEN 'reposicao_venda'::text THEN 'Reposição Venda'::text
            WHEN 'reposicao_loja'::text THEN 'Reposição Loja'::text
            WHEN 'compra_fornecedor'::text THEN 'Compra de Fornecedor'::text
            WHEN 'garantia'::text THEN 'Garantia'::text
            WHEN 'servico_interno'::text THEN 'Serviço Interno'::text
            ELSE 'N/D'::text
        END AS tipo,
    count(*) AS total
   FROM alissonerp.ordens o
  WHERE (o.created_at > (now() - '6 mons'::interval))
  GROUP BY o.tipo_ordem
  ORDER BY (count(*)) DESC;
```

**Uso no código:**
- `alissonerp.vw_ordens_por_tipo` — 4 ocorrência(s)
  - `scripts/apply_073.mjs:372`
  - `scripts/fix_views_073.mjs:90`
  - `supabase/migrations/029_corrigir_enum_tipo_ordem.sql:115`
  - `supabase/migrations/073_tipo_servico_venda_loja.sql:5`

---

## vw_ordens_prontas_ida

Owner: `postgres`

```sql
 SELECT DISTINCT o.id,
    o.numero_ordem,
    (o.status)::text AS status
   FROM (alissonerp.ordens o
     JOIN alissonerp.auditorias a ON (((a.ordem_id = o.id) AND ((a.tipo_auditoria)::text = 'loja'::text) AND ((a.situacao)::text = 'aprovado'::text))))
  WHERE (((o.rota)::text = 'protocolo'::text) AND ((o.status)::text <> ALL (ARRAY['cancelado'::text, 'entregue'::text, 'concluido'::text])) AND (NOT (o.id IN ( SELECT po.ordem_id
           FROM (alissonerp.protocolo_ordens po
             JOIN alissonerp.protocolos p ON ((p.id = po.protocolo_id)))
          WHERE ((p.direcao)::text = 'ida'::text)))))
  ORDER BY o.id DESC;
```

**Uso no código:**
- `alissonerp.vw_ordens_prontas_ida` — 14 ocorrência(s)
  - `scripts/apply_040.mjs:20`
  - `scripts/apply_040.mjs:24`
  - `scripts/apply_041.mjs:25`
  - `scripts/apply_041.mjs:27`
  - `scripts/check_servico_interno.mjs:15`

---

## vw_ordens_prontas_pcp

Owner: `postgres`

```sql
 SELECT DISTINCT o.id,
    o.numero_ordem,
    (o.status)::text AS status
   FROM (alissonerp.ordens o
     JOIN alissonerp.auditorias a ON (((a.ordem_id = o.id) AND ((a.tipo_auditoria)::text = 'loja'::text) AND ((a.situacao)::text = 'aprovado'::text))))
  WHERE (((o.rota)::text = 'pcp'::text) AND ((o.status)::text <> ALL (ARRAY['cancelado'::text, 'entregue'::text, 'concluido'::text])) AND (NOT (EXISTS ( SELECT 1
           FROM alissonerp.pcp p
          WHERE (p.ordem_id = o.id)))))
  ORDER BY o.id DESC;
```

**Uso no código:**
- `alissonerp.vw_ordens_prontas_pcp` — 2 ocorrência(s)
  - `src/components/forms/NovaPCPModal.tsx:42`
  - `supabase/migrations/028_auditoria_dupla.sql:487`

---

## vw_ordens_prontas_volta

Owner: `postgres`

```sql
 SELECT DISTINCT o.id,
    o.numero_ordem,
    (o.status)::text AS status
   FROM ((alissonerp.ordens o
     JOIN alissonerp.pcp p2 ON (((p2.ordem_id = o.id) AND (p2.etapas = 'concluido'::alissonerp.enum_etapas_pcp))))
     JOIN alissonerp.auditorias a ON (((a.ordem_id = o.id) AND ((a.tipo_auditoria)::text = 'fabrica'::text) AND ((a.situacao)::text = 'aprovado'::text))))
  WHERE (((o.status)::text <> ALL (ARRAY['cancelado'::text, 'entregue'::text])) AND (NOT (o.id IN ( SELECT po.ordem_id
           FROM (alissonerp.protocolo_ordens po
             JOIN alissonerp.protocolos p ON ((p.id = po.protocolo_id)))
          WHERE ((p.direcao)::text = 'volta'::text)))))
  ORDER BY o.id DESC;
```

**Uso no código:**
- `alissonerp.vw_ordens_prontas_volta` — 9 ocorrência(s)
  - `scripts/fix_c1707.mjs:69`
  - `scripts/fix_c1707.mjs:115`
  - `scripts/query_auditorias_1707.mjs:37`
  - `scripts/query_views_protocolo.mjs:6`
  - `scripts/query_views_protocolo.mjs:22`

---

## vw_ouro_em_producao

Owner: `postgres`

```sql
 SELECT d.id AS deposito_id,
    d.nome AS deposito_nome,
    (COALESCE(sum(me.entrada), (0)::real) - COALESCE(sum(me.saida), (0)::real)) AS ouro_g
   FROM ((alissonerp.movimentacoes_estoque me
     JOIN alissonerp.insumos i ON ((i.id = me.insumo_id)))
     JOIN alissonerp.depositos d ON ((d.id = me.deposito_id)))
  WHERE ((me.deposito_id <> 1) AND (i.categoria_id = 1))
  GROUP BY d.id, d.nome
 HAVING ((COALESCE(sum(me.entrada), (0)::real) - COALESCE(sum(me.saida), (0)::real)) <> (0)::double precision);
```

**Uso no código:**
- `alissonerp.vw_ouro_em_producao` — 3 ocorrência(s)
  - `scripts/validar_golive.mjs:121`
  - `scripts/validar_golive.mjs:123`
  - `scripts/validar_golive.mjs:126`

---

## vw_pcp_completa

Owner: `postgres`

```sql
 SELECT p.id,
    p.ordem_id,
    p.etapas AS etapas_cod,
        CASE p.etapas
            WHEN '1'::text THEN 'Novas Ordens'::text
            WHEN '2'::text THEN 'Pendencia'::text
            WHEN '3'::text THEN 'Aguardando'::text
            WHEN '4'::text THEN 'Em Andamento'::text
            WHEN '5'::text THEN 'Concluido'::text
            WHEN '6'::text THEN 'Cancelado'::text
            ELSE 'Desconhecido'::text
        END AS etapas,
    p.total_metal,
    p.retorno_metal,
    p.total_pedras_un,
    p.total_pedras_g,
    p.pmc,
    p.quebra,
    p.porcentagem_de_quebra,
    p.peso_final,
    p.metal_externo,
    p."Bloqueado" AS bloqueado,
    p.local_atual,
    p.data_conclusao,
    p.date_created,
    p.operador,
    o.numero_ordem,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.peso_metal_negocido AS peso_metal_negociado,
    o.data_entrega,
    s.descricao AS setor_nome,
    d.nome AS deposito_nome,
    (o.local_atual)::integer AS deposito_id,
    o.setor_atual AS setor_id
   FROM (((((directus.pcp p
     LEFT JOIN directus.ordens o ON ((p.ordem_id = o.id)))
     LEFT JOIN contatos c ON ((o.cliente_id = c.id_contato)))
     LEFT JOIN vendedores v ON ((o.vendedor_id = v.id_vendedor)))
     LEFT JOIN directus.setor s ON ((o.setor_atual = s.id)))
     LEFT JOIN directus.deposito d ON ((o.local_atual = d.id)));
```

_Sem referência identificada no código._

---

## vw_pcp_erp

Owner: `postgres`

```sql
 SELECT p.id,
    p.ordem_id,
    (p.etapas)::text AS etapas_cod,
        CASE p.etapas
            WHEN 'novas_ordens'::alissonerp.enum_etapas_pcp THEN 'Novas Ordens'::text
            WHEN 'pendencia'::alissonerp.enum_etapas_pcp THEN 'Pendencia'::text
            WHEN 'aguardando'::alissonerp.enum_etapas_pcp THEN 'Aguardando'::text
            WHEN 'em_andamento'::alissonerp.enum_etapas_pcp THEN 'Em Andamento'::text
            WHEN 'concluido'::alissonerp.enum_etapas_pcp THEN 'Concluido'::text
            WHEN 'cancelado'::alissonerp.enum_etapas_pcp THEN 'Cancelado'::text
            ELSE 'Desconhecido'::text
        END AS etapas,
    p.total_metal,
    p.retorno_metal,
    p.total_pedras_un,
    p.total_pedras_g,
    p.pmc,
    p.quebra,
    p.porcentagem_de_quebra,
    p.peso_final,
    p.metal_externo,
    p.bloqueado,
    p.data_conclusao,
    p.created_at,
    p.operador,
    o.numero_ordem,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.peso_metal_negociado,
    o.data_entrega,
    o.local_atual AS deposito_id,
    o.setor_atual AS setor_id,
    dep.nome AS deposito_nome,
    set_.nome AS setor_nome,
    COALESCE(ap.total_apontamentos, 0) AS total_apontamentos
   FROM ((((((alissonerp.pcp p
     LEFT JOIN alissonerp.ordens o ON ((o.id = p.ordem_id)))
     LEFT JOIN contatos c ON ((c.id_contato = o.cliente_id)))
     LEFT JOIN vendedores v ON ((v.id_vendedor = o.vendedor_id)))
     LEFT JOIN alissonerp.depositos dep ON ((dep.id = o.local_atual)))
     LEFT JOIN alissonerp.setores set_ ON ((set_.id = o.setor_atual)))
     LEFT JOIN ( SELECT apontamentos_pcp.pcp_id,
            (count(*))::integer AS total_apontamentos
           FROM alissonerp.apontamentos_pcp
          GROUP BY apontamentos_pcp.pcp_id) ap ON ((ap.pcp_id = p.id)));
```

**Uso no código:**
- `alissonerp.vw_pcp_erp` — 7 ocorrência(s)
  - `src/app/api/dashboard/fabrica/route.ts:28`
  - `src/app/api/dashboard/fabrica/route.ts:29`
  - `src/app/api/pcp/transferir/route.ts:218`
  - `src/app/api/pcp/[id]/atribuir-operador/route.ts:49`
  - `scripts/apply_136.mjs:26`

---

## vw_producao_mensal

Owner: `postgres`

```sql
 SELECT (date_trunc('month'::text, o.created_at))::date AS mes,
    to_char(o.created_at, 'Mon/YY'::text) AS mes_label,
    count(*) AS total_ordens,
    count(*) FILTER (WHERE (o.status = 'concluido'::alissonerp.enum_status_ordem)) AS concluidas,
    count(*) FILTER (WHERE (o.status = 'em_andamento'::alissonerp.enum_status_ordem)) AS em_andamento,
    count(*) FILTER (WHERE (o.status = 'aguardando'::alissonerp.enum_status_ordem)) AS aguardando,
    COALESCE(sum(o.peso_metal_negociado), (0)::real) AS peso_total_negociado
   FROM alissonerp.ordens o
  WHERE (o.created_at > (now() - '1 year'::interval))
  GROUP BY (date_trunc('month'::text, o.created_at)), (to_char(o.created_at, 'Mon/YY'::text))
  ORDER BY ((date_trunc('month'::text, o.created_at))::date) DESC;
```

_Sem referência identificada no código._

---

## vw_produtividade_ourives

Owner: `postgres`

```sql
 SELECT COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''::text), (au.email)::text, 'Sem operador'::text) AS operador,
    count(p.id) AS total_ordens,
    COALESCE(sum(p.total_metal), (0)::real) AS total_metal_processado,
    COALESCE(sum(p.pmc), (0)::real) AS total_pmc,
    COALESCE(avg(p.porcentagem_de_quebra), (0)::double precision) AS media_quebra,
    COALESCE(sum(p.quebra), (0)::real) AS total_quebra,
    COALESCE(avg((EXTRACT(epoch FROM (p.data_conclusao - p.created_at)) / 86400.0)), (0)::numeric) AS media_dias_producao
   FROM ((alissonerp.pcp p
     LEFT JOIN auth.users au ON ((au.id = p.operador)))
     LEFT JOIN user_profiles up ON ((up.id_user = au.id)))
  WHERE ((p.etapas = 'concluido'::alissonerp.enum_etapas_pcp) AND (p.total_metal > (0)::double precision))
  GROUP BY up.name, au.email
  ORDER BY (count(p.id)) DESC;
```

_Sem referência identificada no código._

---

## vw_produto_capa

Owner: `postgres`

```sql
 WITH capa_propria AS (
         SELECT produto_imagens.produto_id,
            produto_imagens.url_publica
           FROM alissonerp.produto_imagens
          WHERE produto_imagens.eh_capa
        )
 SELECT p.id_produto AS produto_id,
    COALESCE(cp.url_publica, cp_pai.url_publica,
        CASE
            WHEN (p.imagem_capa IS NOT NULL) THEN ('https://base.alissonranyel.com.br/assets/'::text || (p.imagem_capa)::text)
            ELSE NULL::text
        END) AS url_capa,
        CASE
            WHEN (cp.url_publica IS NOT NULL) THEN 'propria'::text
            WHEN (cp_pai.url_publica IS NOT NULL) THEN 'pai'::text
            WHEN (p.imagem_capa IS NOT NULL) THEN 'directus_legacy'::text
            ELSE NULL::text
        END AS origem
   FROM (((produtos p
     LEFT JOIN capa_propria cp ON ((cp.produto_id = p.id_produto)))
     LEFT JOIN alissonerp.erp_produtos ep ON (((ep.produto_id = p.id_produto) AND ep.eh_variacao)))
     LEFT JOIN capa_propria cp_pai ON ((cp_pai.produto_id = ep.parent_id)));
```

**Uso no código:**
- `alissonerp.vw_produto_capa` — 4 ocorrência(s)
  - `scripts/apply_185.mjs:52`
  - `scripts/apply_185.mjs:53`
  - `scripts/migrate_directus_images.mjs:15`
  - `supabase/migrations/185_produto_imagens.sql:11`

---

## vw_produto_imagens

Owner: `postgres`

```sql
 WITH agregado AS (
         SELECT produto_imagens.produto_id,
            jsonb_agg(jsonb_build_object('id', produto_imagens.id, 'url', produto_imagens.url_publica, 'eh_capa', produto_imagens.eh_capa, 'ordem', produto_imagens.ordem, 'origem', produto_imagens.origem) ORDER BY produto_imagens.eh_capa DESC, produto_imagens.ordem) AS imagens
           FROM alissonerp.produto_imagens
          GROUP BY produto_imagens.produto_id
        )
 SELECT p.id_produto AS produto_id,
    COALESCE(prop.imagens, pai.imagens, '[]'::jsonb) AS imagens,
        CASE
            WHEN (prop.imagens IS NOT NULL) THEN 'propria'::text
            WHEN (pai.imagens IS NOT NULL) THEN 'pai'::text
            ELSE 'vazia'::text
        END AS origem_galeria
   FROM (((produtos p
     LEFT JOIN agregado prop ON ((prop.produto_id = p.id_produto)))
     LEFT JOIN alissonerp.erp_produtos ep ON (((ep.produto_id = p.id_produto) AND ep.eh_variacao)))
     LEFT JOIN agregado pai ON ((pai.produto_id = ep.parent_id)));
```

**Uso no código:**
- `alissonerp.vw_produto_imagens` — 4 ocorrência(s)
  - `scripts/apply_186.mjs:11`
  - `scripts/apply_186.mjs:19`
  - `scripts/apply_186.mjs:20`
  - `supabase/migrations/186_vw_produto_imagens.sql:2`

---

## vw_produtos

Owner: `postgres`

```sql
 SELECT produtos.id_produto,
    produtos.id_api_produto,
    produtos.sku,
    produtos.nome,
    produtos.tipo_metal,
    produtos.tipo,
    produtos.situacao,
    produtos.unidade,
    produtos.gtin,
    produtos.categoria,
    produtos.marca,
    produtos.qtd_estoque,
    produtos.preco_tiny,
    produtos.preco_promocional,
    produtos.preco_custo,
    produtos.preco_custo_medio,
    produtos.preco_na_cotacao,
    produtos.custo_na_cotacao,
    produtos.peso_precificado,
    produtos.markup,
    produtos.fator,
    produtos.fornecedor_etl,
    produtos.preco_sync,
    produtos.imagem,
    produtos.data_atualizacao_preco,
    produtos.diferenca_percentual,
    produtos.fornecedor_id_api,
    produtos.estoque_minimo,
    produtos.estoque_maximo,
    produtos.imagem_capa,
    produtos.tipo_de_pedra,
    produtos.url_drive,
    produtos.peso_real,
    produtos.iframe,
    produtos.data_atualizacao,
    produtos.id_kommo,
    produtos.data_ultima_compra,
    produtos.prompt_imagem_ia,
    produtos.sob_encomenda,
    produtos.prazo_producao,
    produtos.categoria_precificacao
   FROM produtos;
```

_Sem referência identificada no código._

---

## vw_produtos_erp

Owner: `postgres`

```sql
 SELECT ep.id AS erp_id,
    ep.produto_id,
    ep.sku,
    ep.nome,
    ep.parent_sku,
    ep.parent_id,
    ep.eh_variacao,
    ep.eh_pai,
    ep.sufixo_variacao,
    ep.numeracao,
    ep.cor_metal,
    ep.comprimento,
    ep.largura_aro,
    ep.altura_aro,
    ep.base,
    ep.observacao_erp,
    ep.ativo,
    NULL::text AS tipo_metal,
    p.peso_precificado,
    p.preco_sync,
    p.preco_tiny,
    p.diferenca_percentual,
    p.categoria_precificacao,
    p.tem_pedra_preciosa,
    p.preco_pedras,
    p.preco_total_sync,
    p.situacao,
    COALESCE(cnt.qtd, 0) AS qtd_variacoes
   FROM ((alissonerp.erp_produtos ep
     JOIN produtos p ON ((p.id_produto = ep.produto_id)))
     LEFT JOIN ( SELECT erp_produtos.parent_id,
            (count(*))::integer AS qtd
           FROM alissonerp.erp_produtos
          WHERE (erp_produtos.parent_id IS NOT NULL)
          GROUP BY erp_produtos.parent_id) cnt ON ((cnt.parent_id = ep.id)));
```

**Uso no código:**
- `alissonerp.vw_produtos_erp` — 1 ocorrência(s)
  - `supabase/migrations/063_erp_produtos.sql:120`

---

## vw_protocolo_ordens

Owner: `postgres`

```sql
 SELECT po.id,
    po.protocolo_id,
    po.ordem_id,
    o.numero_ordem,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.peso_metal_negociado,
    (o.status)::text AS status,
        CASE (o.status)::text
            WHEN 'aguardando'::text THEN 'Aguardando'::text
            WHEN 'em_andamento'::text THEN 'Em Andamento'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            ELSE '—'::text
        END AS status_label
   FROM ((alissonerp.protocolo_ordens po
     LEFT JOIN alissonerp.ordens o ON ((o.id = po.ordem_id)))
     LEFT JOIN contatos c ON ((c.id_contato = o.cliente_id)));
```

_Sem referência identificada no código._

---

## vw_protocolos_completo

Owner: `postgres`

```sql
 SELECT pr.id,
    (pr.direcao)::text AS direcao,
    (pr.etapas)::text AS etapas_cod,
        CASE (pr.etapas)::text
            WHEN 'pendente'::text THEN 'Pendente'::text
            WHEN 'concluido'::text THEN 'Concluído'::text
            ELSE 'Pendente'::text
        END AS etapas,
    pr.created_at AS data_criacao,
    pr.updated_at AS data_atualizacao,
    pr.data_conclusao,
    COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''::text), (au.email)::text) AS criado_por,
    ( SELECT count(*) AS count
           FROM alissonerp.protocolo_ordens po
          WHERE (po.protocolo_id = pr.id)) AS total_ordens
   FROM ((alissonerp.protocolos pr
     LEFT JOIN auth.users au ON ((au.id = pr.created_by)))
     LEFT JOIN user_profiles up ON ((up.id_user = au.id)));
```

_Sem referência identificada no código._

---

## vw_protocolos_loja_completo

Owner: `postgres`

```sql
 SELECT pl.id,
    pl.rota AS direcao,
    pl.etapas AS etapas_cod,
        CASE pl.etapas
            WHEN '1'::text THEN 'Pendente'::text
            WHEN '2'::text THEN 'Em Trânsito'::text
            WHEN '3'::text THEN 'Concluído'::text
            ELSE 'Pendente'::text
        END AS etapas,
    pl.date_created AS data_criacao,
    pl.data_conclusao,
    pl.obs,
    COALESCE(NULLIF(TRIM(BOTH FROM (((COALESCE(du.first_name, ''::character varying))::text || ' '::text) || (COALESCE(du.last_name, ''::character varying))::text)), ''::text), (du.email)::text) AS criado_por,
    ( SELECT count(*) AS count
           FROM directus.protocolo_loja_ordens_1 plo
          WHERE (plo.protocolo_loja_id = pl.id)) AS total_ordens
   FROM (directus.protocolo_loja pl
     LEFT JOIN directus.directus_users du ON ((pl.user_created = du.id)));
```

_Sem referência identificada no código._

---

## vw_quebra_mensal

Owner: `postgres`

```sql
 SELECT date_trunc('month'::text, p.data_conclusao) AS mes,
    to_char(p.data_conclusao, 'Mon/YY'::text) AS mes_label,
    count(p.id) AS total_ordens,
    COALESCE(sum(p.total_metal), (0)::real) AS total_metal,
    COALESCE(sum(p.pmc), (0)::real) AS total_pmc,
    COALESCE(sum(p.quebra), (0)::real) AS total_quebra,
        CASE
            WHEN (sum(p.pmc) > (0)::double precision) THEN round((((sum(p.quebra) / NULLIF(sum(p.pmc), (0)::double precision)) * (100)::double precision))::numeric, 2)
            ELSE (0)::numeric
        END AS percentual_quebra
   FROM alissonerp.pcp p
  WHERE ((p.etapas = 'concluido'::alissonerp.enum_etapas_pcp) AND (p.data_conclusao IS NOT NULL) AND (p.total_metal > (0)::double precision))
  GROUP BY (date_trunc('month'::text, p.data_conclusao)), (to_char(p.data_conclusao, 'Mon/YY'::text))
  ORDER BY (date_trunc('month'::text, p.data_conclusao)) DESC
 LIMIT 12;
```

**Uso no código:**
- `alissonerp.vw_quebra_mensal` — 1 ocorrência(s)
  - `scripts/apply_154.mjs:17`

---

## vw_quebra_operadores

Owner: `postgres`

```sql
 SELECT quebra_operador.deposito_id,
    quebra_operador.deposito_nome,
    quebra_operador.setor_nome,
    count(*) AS total_registros,
    sum(quebra_operador.ouro_recebido) AS total_recebido,
    sum(quebra_operador.ouro_entregue) AS total_entregue,
    sum(quebra_operador.quebra) AS total_quebra,
        CASE
            WHEN (sum(quebra_operador.ouro_recebido) > (0)::numeric) THEN round(((sum(quebra_operador.quebra) / sum(quebra_operador.ouro_recebido)) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS percentual_medio,
    min(quebra_operador.data_registro) AS primeiro_registro,
    max(quebra_operador.data_registro) AS ultimo_registro
   FROM alissonerp.quebra_operador
  GROUP BY quebra_operador.deposito_id, quebra_operador.deposito_nome, quebra_operador.setor_nome;
```

_Sem referência identificada no código._

---

## vw_quebra_por_deposito

Owner: `postgres`

```sql
 SELECT dep.id AS deposito_id,
    dep.nome AS deposito_nome,
    COALESCE(sum(
        CASE
            WHEN (m.entrada > (0)::double precision) THEN m.entrada
            ELSE (0)::real
        END), (0)::real) AS total_entrada,
    COALESCE(sum(
        CASE
            WHEN (m.saida > (0)::double precision) THEN m.saida
            ELSE (0)::real
        END), (0)::real) AS total_saida,
    (COALESCE(sum(COALESCE(m.entrada, (0)::real)), (0)::real) - COALESCE(sum(COALESCE(m.saida, (0)::real)), (0)::real)) AS saldo
   FROM (alissonerp.movimentacoes_estoque m
     JOIN alissonerp.depositos dep ON ((dep.id = m.deposito_id)))
  GROUP BY dep.id, dep.nome
  ORDER BY (COALESCE(sum(COALESCE(m.entrada, (0)::real)), (0)::real) - COALESCE(sum(COALESCE(m.saida, (0)::real)), (0)::real)) DESC;
```

_Sem referência identificada no código._

---

## vw_quebra_por_ourives

Owner: `postgres`

```sql
 SELECT p.operador AS operador_id,
    COALESCE(u.nome, 'Sem operador'::character varying) AS operador_nome,
    count(p.id) AS total_ordens,
    COALESCE(sum(p.total_metal), (0)::real) AS total_metal,
    COALESCE(sum(p.retorno_metal), (0)::real) AS total_retorno,
    COALESCE(sum(p.pmc), (0)::real) AS total_pmc,
    COALESCE(sum(p.quebra), (0)::real) AS total_quebra,
        CASE
            WHEN (sum(p.pmc) > (0)::double precision) THEN round((((sum(p.quebra) / NULLIF(sum(p.pmc), (0)::double precision)) * (100)::double precision))::numeric, 2)
            ELSE (0)::numeric
        END AS percentual_medio
   FROM (alissonerp.pcp p
     LEFT JOIN alissonerp.usuarios u ON ((p.operador = u.id)))
  WHERE ((p.etapas = 'concluido'::alissonerp.enum_etapas_pcp) AND (p.total_metal > (0)::double precision))
  GROUP BY p.operador, u.nome
  ORDER BY
        CASE
            WHEN (sum(p.pmc) > (0)::double precision) THEN round((((sum(p.quebra) / NULLIF(sum(p.pmc), (0)::double precision)) * (100)::double precision))::numeric, 2)
            ELSE (0)::numeric
        END DESC;
```

**Uso no código:**
- `alissonerp.vw_quebra_por_ourives` — 1 ocorrência(s)
  - `scripts/apply_154.mjs:14`

---

## vw_quebra_por_setor

Owner: `postgres`

```sql
 SELECT s.id AS setor_id,
    s.nome AS setor_nome,
    count(DISTINCT p.id) AS total_ordens,
    COALESCE(sum(p.total_metal), (0)::real) AS total_metal,
    COALESCE(sum(p.pmc), (0)::real) AS total_pmc,
    COALESCE(sum(p.retorno_metal), (0)::real) AS total_retorno,
    COALESCE(sum(p.quebra), (0)::real) AS total_quebra,
        CASE
            WHEN (sum(p.pmc) > (0)::double precision) THEN round((((sum(p.quebra) / NULLIF(sum(p.pmc), (0)::double precision)) * (100)::double precision))::numeric, 2)
            ELSE (0)::numeric
        END AS percentual_quebra
   FROM (((alissonerp.pcp p
     JOIN alissonerp.distribuicao_ordens doo ON ((doo.ordens_id = p.ordem_id)))
     JOIN alissonerp.distribuicoes d ON ((d.id = doo.distribuicao_id)))
     JOIN alissonerp.setores s ON ((s.id = d.setor_id)))
  WHERE ((p.etapas = 'concluido'::alissonerp.enum_etapas_pcp) AND (p.total_metal > (0)::double precision))
  GROUP BY s.id, s.nome
  ORDER BY COALESCE(sum(p.quebra), (0)::real) DESC;
```

**Uso no código:**
- `alissonerp.vw_quebra_por_setor` — 1 ocorrência(s)
  - `scripts/apply_155.mjs:13`

---

## vw_quebra_setor_operador

Owner: `postgres`

```sql
 SELECT s.id AS setor_id,
    s.nome AS setor_nome,
    p.operador AS operador_id,
    COALESCE(u.nome, 'Sem operador'::character varying) AS operador_nome,
    count(DISTINCT p.id) AS total_ordens,
    COALESCE(sum(p.total_metal), (0)::real) AS total_metal,
    COALESCE(sum(p.pmc), (0)::real) AS total_pmc,
    COALESCE(sum(p.retorno_metal), (0)::real) AS total_retorno,
    COALESCE(sum(p.quebra), (0)::real) AS total_quebra,
        CASE
            WHEN (sum(p.pmc) > (0)::double precision) THEN round((((sum(p.quebra) / NULLIF(sum(p.pmc), (0)::double precision)) * (100)::double precision))::numeric, 2)
            ELSE (0)::numeric
        END AS percentual_medio
   FROM ((((alissonerp.pcp p
     JOIN alissonerp.distribuicao_ordens doo ON ((doo.ordens_id = p.ordem_id)))
     JOIN alissonerp.distribuicoes d ON ((d.id = doo.distribuicao_id)))
     JOIN alissonerp.setores s ON ((s.id = d.setor_id)))
     LEFT JOIN alissonerp.usuarios u ON ((p.operador = u.id)))
  WHERE ((p.etapas = 'concluido'::alissonerp.enum_etapas_pcp) AND (p.total_metal > (0)::double precision))
  GROUP BY s.id, s.nome, p.operador, u.nome
  ORDER BY COALESCE(sum(p.quebra), (0)::real) DESC;
```

**Uso no código:**
- `alissonerp.vw_quebra_setor_operador` — 1 ocorrência(s)
  - `scripts/apply_155.mjs:16`

---

## vw_resumo_financeiro

Owner: `postgres`

```sql
 SELECT 'pagar'::text AS tipo,
    contas_pagar.situacao,
    (count(*))::integer AS total,
    COALESCE(sum(contas_pagar.valor), (0)::numeric) AS valor_total,
    COALESCE(sum(
        CASE
            WHEN ((contas_pagar.data_vencimento < CURRENT_DATE) AND ((contas_pagar.situacao)::text = 'pendente'::text)) THEN contas_pagar.valor
            ELSE (0)::numeric
        END), (0)::numeric) AS vencido
   FROM alissonerp.contas_pagar
  GROUP BY contas_pagar.situacao
UNION ALL
 SELECT 'receber'::text AS tipo,
    contas_receber.situacao,
    (count(*))::integer AS total,
    COALESCE(sum(contas_receber.valor), (0)::numeric) AS valor_total,
    COALESCE(sum(
        CASE
            WHEN ((contas_receber.data_vencimento < CURRENT_DATE) AND ((contas_receber.situacao)::text = 'pendente'::text)) THEN contas_receber.valor
            ELSE (0)::numeric
        END), (0)::numeric) AS vencido
   FROM alissonerp.contas_receber
  GROUP BY contas_receber.situacao;
```

**Uso no código:**
- `alissonerp.vw_resumo_financeiro` — 1 ocorrência(s)
  - `scripts/check_contas_receber.mjs:55`

---

## vw_saldo_estoque

Owner: `postgres`

```sql
 SELECT me.deposito_id,
    me.insumo_id,
    me.local_estoque_id,
    (COALESCE(sum(me.entrada), (0)::real) - COALESCE(sum(me.saida), (0)::real)) AS saldo,
    count(*) AS total_movimentacoes,
    max(me.data_hora) AS ultima_movimentacao
   FROM alissonerp.movimentacoes_estoque me
  GROUP BY me.deposito_id, me.insumo_id, me.local_estoque_id;
```

**Uso no código:**
- `alissonerp.vw_saldo_estoque` — 12 ocorrência(s)
  - `supabase/migrations/046_depositos_setores_fix.sql:17`
  - `supabase/migrations/046_depositos_setores_fix.sql:18`
  - `supabase/migrations/046_depositos_setores_fix.sql:20`
  - `supabase/migrations/046_depositos_setores_fix.sql:21`
  - `supabase/migrations/097_views_saldo_multilocal_ct.sql:4`

---

## vw_saldo_estoque_comercial

Owner: `postgres`

```sql
 SELECT m.produto_id,
    p.nome,
    p.sku,
    sum(
        CASE
            WHEN ((m.tipo)::text = 'entrada'::text) THEN m.quantidade
            ELSE 0
        END) AS total_entradas,
    sum(
        CASE
            WHEN ((m.tipo)::text = 'saida'::text) THEN m.quantidade
            ELSE 0
        END) AS total_saidas,
    sum(
        CASE
            WHEN ((m.tipo)::text = 'entrada'::text) THEN m.quantidade
            ELSE (- m.quantidade)
        END) AS saldo_atual,
    sum(
        CASE
            WHEN ((m.tipo)::text = 'entrada'::text) THEN m.quantidade
            ELSE (- m.quantidade)
        END) AS saldo,
    COALESCE(( SELECT sum(r.quantidade) AS sum
           FROM alissonerp.reservas_estoque_comercial r
          WHERE ((r.produto_id = m.produto_id) AND ((r.status)::text = 'ativo'::text))), (0)::bigint) AS reservado,
    (sum(
        CASE
            WHEN ((m.tipo)::text = 'entrada'::text) THEN m.quantidade
            ELSE (- m.quantidade)
        END) - COALESCE(( SELECT sum(r.quantidade) AS sum
           FROM alissonerp.reservas_estoque_comercial r
          WHERE ((r.produto_id = m.produto_id) AND ((r.status)::text = 'ativo'::text))), (0)::bigint)) AS disponivel
   FROM (alissonerp.movimentacoes_estoque_comercial m
     JOIN produtos p ON ((p.id_produto = m.produto_id)))
  WHERE ((m.status)::text = 'efetivado'::text)
  GROUP BY m.produto_id, p.nome, p.sku;
```

**Uso no código:**
- `alissonerp.vw_saldo_estoque_comercial` — 5 ocorrência(s)
  - `src/app/api/vendas/produtos/busca/route.ts:50`
  - `supabase/migrations/161_reserva_entrega_venda.sql:284`
  - `supabase/migrations/161_reserva_entrega_venda.sql:287`
  - `supabase/migrations/161_reserva_entrega_venda.sql:288`
  - `supabase/migrations/161_reserva_entrega_venda.sql:333`

---

## vw_saldo_estoque_comercial_consolidado

Owner: `postgres`

```sql
 SELECT vw_saldo_estoque_comercial_v2.produto_id,
    vw_saldo_estoque_comercial_v2.nome_produto,
    vw_saldo_estoque_comercial_v2.sku,
    vw_saldo_estoque_comercial_v2.categoria,
    vw_saldo_estoque_comercial_v2.config_id,
    vw_saldo_estoque_comercial_v2.estoque_minimo,
    vw_saldo_estoque_comercial_v2.ativo,
    (sum(vw_saldo_estoque_comercial_v2.saldo_fisico))::integer AS saldo_fisico,
    (sum(vw_saldo_estoque_comercial_v2.reservado))::integer AS reservado,
    (sum(vw_saldo_estoque_comercial_v2.disponivel))::integer AS disponivel,
    (sum(vw_saldo_estoque_comercial_v2.em_transito))::integer AS em_transito,
    (sum(vw_saldo_estoque_comercial_v2.total_movimentacoes))::integer AS total_movimentacoes,
    max(vw_saldo_estoque_comercial_v2.ultima_movimentacao) AS ultima_movimentacao
   FROM alissonerp.vw_saldo_estoque_comercial_v2
  GROUP BY vw_saldo_estoque_comercial_v2.produto_id, vw_saldo_estoque_comercial_v2.nome_produto, vw_saldo_estoque_comercial_v2.sku, vw_saldo_estoque_comercial_v2.categoria, vw_saldo_estoque_comercial_v2.config_id, vw_saldo_estoque_comercial_v2.estoque_minimo, vw_saldo_estoque_comercial_v2.ativo;
```

**Uso no código:**
- `alissonerp.vw_saldo_estoque_comercial_consolidado` — 3 ocorrência(s)
  - `supabase/migrations/140_estoque_comercial_v2.sql:195`
  - `supabase/migrations/140_estoque_comercial_v2.sql:226`
  - `supabase/migrations/140_estoque_comercial_v2.sql:247`

---

## vw_saldo_estoque_comercial_v2

Owner: `postgres`

```sql
 WITH mov_agg AS (
         SELECT movimentacoes_estoque_comercial.produto_id,
            movimentacoes_estoque_comercial.local_estoque_id,
            (COALESCE(sum(
                CASE
                    WHEN ((movimentacoes_estoque_comercial.tipo)::text = 'entrada'::text) THEN movimentacoes_estoque_comercial.quantidade
                    ELSE 0
                END), (0)::bigint) - COALESCE(sum(
                CASE
                    WHEN ((movimentacoes_estoque_comercial.tipo)::text = 'saida'::text) THEN movimentacoes_estoque_comercial.quantidade
                    ELSE 0
                END), (0)::bigint)) AS saldo_fisico,
            count(movimentacoes_estoque_comercial.id) AS total_movimentacoes,
            max(movimentacoes_estoque_comercial.created_at) AS ultima_movimentacao
           FROM alissonerp.movimentacoes_estoque_comercial
          WHERE ((movimentacoes_estoque_comercial.status)::text = 'efetivado'::text)
          GROUP BY movimentacoes_estoque_comercial.produto_id, movimentacoes_estoque_comercial.local_estoque_id
        ), reservas_agg AS (
         SELECT reservas_estoque_comercial.produto_id,
            reservas_estoque_comercial.local_estoque_id,
            sum(reservas_estoque_comercial.quantidade) AS total_reservado
           FROM alissonerp.reservas_estoque_comercial
          WHERE ((reservas_estoque_comercial.status)::text = 'ativo'::text)
          GROUP BY reservas_estoque_comercial.produto_id, reservas_estoque_comercial.local_estoque_id
        ), transito_agg AS (
         SELECT transferencias_estoque_comercial.produto_id,
            transferencias_estoque_comercial.local_destino_id AS local_estoque_id,
            sum(transferencias_estoque_comercial.quantidade) AS em_transito
           FROM alissonerp.transferencias_estoque_comercial
          WHERE ((transferencias_estoque_comercial.status)::text = 'pendente'::text)
          GROUP BY transferencias_estoque_comercial.produto_id, transferencias_estoque_comercial.local_destino_id
        )
 SELECT p.id_produto AS produto_id,
    p.nome AS nome_produto,
    p.sku,
    COALESCE(p.categoria, ''::character varying) AS categoria,
    cfg.id AS config_id,
    COALESCE(cfg.estoque_minimo, 0) AS estoque_minimo,
    cfg.ativo,
    m.local_estoque_id,
    le.nome AS local_nome,
    (COALESCE(m.saldo_fisico, (0)::bigint))::integer AS saldo_fisico,
    (COALESCE(r.total_reservado, (0)::bigint))::integer AS reservado,
    ((COALESCE(m.saldo_fisico, (0)::bigint) - COALESCE(r.total_reservado, (0)::bigint)))::integer AS disponivel,
    (COALESCE(t.em_transito, (0)::bigint))::integer AS em_transito,
    (COALESCE(m.total_movimentacoes, (0)::bigint))::integer AS total_movimentacoes,
    m.ultima_movimentacao
   FROM (((((produtos p
     JOIN alissonerp.estoque_comercial_config cfg ON (((cfg.produto_id = p.id_produto) AND (cfg.ativo = true))))
     LEFT JOIN mov_agg m ON ((m.produto_id = p.id_produto)))
     LEFT JOIN alissonerp.locais_estoque le ON ((le.id = m.local_estoque_id)))
     LEFT JOIN reservas_agg r ON (((r.produto_id = p.id_produto) AND (r.local_estoque_id = m.local_estoque_id))))
     LEFT JOIN transito_agg t ON (((t.produto_id = p.id_produto) AND (t.local_estoque_id = m.local_estoque_id))));
```

**Uso no código:**
- `alissonerp.vw_saldo_estoque_comercial_v2` — 4 ocorrência(s)
  - `src/app/api/gestao-estoque/produtos/route.ts:36`
  - `supabase/migrations/140_estoque_comercial_v2.sql:140`
  - `supabase/migrations/140_estoque_comercial_v2.sql:210`
  - `supabase/migrations/140_estoque_comercial_v2.sql:246`

---

## vw_saldo_por_local

Owner: `postgres`

```sql
 SELECT le.id AS local_estoque_id,
    le.nome AS local_nome,
    me.insumo_id,
    i.nome AS insumo_nome,
    i.sku,
    i.categoria_id,
    ci.nome AS categoria_nome,
    COALESCE(i.unidade, 'g'::character varying) AS unidade,
    i.peso_pedra,
    i.peso_pedra_ct,
    (COALESCE(sum(me.entrada), (0)::real) - COALESCE(sum(me.saida), (0)::real)) AS saldo,
        CASE
            WHEN (i.categoria_id = 2) THEN round((((COALESCE(sum(me.entrada), (0)::real) - COALESCE(sum(me.saida), (0)::real)) / (0.2)::double precision))::numeric, 4)
            ELSE NULL::numeric
        END AS saldo_ct,
        CASE
            WHEN ((i.categoria_id = 2) AND (i.peso_pedra IS NOT NULL) AND (i.peso_pedra > (0)::double precision)) THEN round((((COALESCE(sum(me.entrada), (0)::real) - COALESCE(sum(me.saida), (0)::real)) / i.peso_pedra))::numeric, 0)
            ELSE NULL::numeric
        END AS quantidade
   FROM (((alissonerp.locais_estoque le
     LEFT JOIN alissonerp.movimentacoes_estoque me ON ((me.local_estoque_id = le.id)))
     LEFT JOIN alissonerp.insumos i ON ((i.id = me.insumo_id)))
     LEFT JOIN alissonerp.categorias_insumo ci ON ((ci.id = i.categoria_id)))
  WHERE (le.ativo = true)
  GROUP BY le.id, le.nome, me.insumo_id, i.nome, i.sku, i.categoria_id, ci.nome, i.unidade, i.peso_pedra, i.peso_pedra_ct;
```

**Uso no código:**
- `alissonerp.vw_saldo_por_local` — 4 ocorrência(s)
  - `src/app/api/insumos/pote/route.ts:7`
  - `supabase/migrations/097_views_saldo_multilocal_ct.sql:7`
  - `supabase/migrations/097_views_saldo_multilocal_ct.sql:105`
  - `supabase/migrations/121_fix_saldo_ct_formula.sql:55`

---

## vw_saldo_pote

Owner: `postgres`

```sql
 SELECT ci.id AS categoria_id,
    ci.nome AS categoria_nome,
    count(DISTINCT i.id) AS total_insumos,
    COALESCE(sum(se.saldo_total), (0)::real) AS saldo_total,
    COALESCE(( SELECT insumos.unidade
           FROM alissonerp.insumos
          WHERE ((insumos.categoria_id = ci.id) AND (insumos.ativo = true))
         LIMIT 1), 'g'::character varying) AS unidade
   FROM ((alissonerp.categorias_insumo ci
     LEFT JOIN alissonerp.insumos i ON (((i.categoria_id = ci.id) AND (i.ativo = true))))
     LEFT JOIN ( SELECT vw_saldo_estoque.insumo_id,
            sum(vw_saldo_estoque.saldo) AS saldo_total
           FROM alissonerp.vw_saldo_estoque
          WHERE (vw_saldo_estoque.deposito_id = 1)
          GROUP BY vw_saldo_estoque.insumo_id) se ON ((se.insumo_id = i.id)))
  GROUP BY ci.id, ci.nome
  ORDER BY ci.id;
```

**Uso no código:**
- `alissonerp.vw_saldo_pote` — 15 ocorrência(s)
  - `src/app/api/insumos/pote/route.ts:6`
  - `src/app/api/insumos/pote/route.ts:31`
  - `scripts/diag_estoque2.js:20`
  - `scripts/diag_estoque2.js:22`
  - `scripts/validar_golive.mjs:96`

---

## vw_saldo_pote_ouro

Owner: `postgres`

```sql
 SELECT i.id AS insumo_id,
    i.nome AS insumo_nome,
    (COALESCE(sum(me.entrada), (0)::real) - COALESCE(sum(me.saida), (0)::real)) AS saldo_g
   FROM (alissonerp.movimentacoes_estoque me
     JOIN alissonerp.insumos i ON ((i.id = me.insumo_id)))
  WHERE ((me.deposito_id = 1) AND (i.categoria_id = 1))
  GROUP BY i.id, i.nome
 HAVING ((COALESCE(sum(me.entrada), (0)::real) - COALESCE(sum(me.saida), (0)::real)) <> (0)::double precision);
```

**Uso no código:**
- `alissonerp.vw_saldo_pote_ouro` — 5 ocorrência(s)
  - `scripts/validar_golive.mjs:111`
  - `scripts/validar_golive.mjs:113`
  - `scripts/validar_golive.mjs:116`
  - `scripts/validar_migracao.mjs:185`
  - `scripts/validar_migracao.mjs:187`

---

## vw_saldo_unificado

Owner: `postgres`

```sql
 WITH saldo_erp AS (
         SELECT vw_saldo_estoque_comercial_v2.produto_id,
            (COALESCE(sum(vw_saldo_estoque_comercial_v2.saldo_fisico), (0)::bigint))::integer AS qtd
           FROM alissonerp.vw_saldo_estoque_comercial_v2
          GROUP BY vw_saldo_estoque_comercial_v2.produto_id
        ), reservado_erp AS (
         SELECT vw_saldo_estoque_comercial_v2.produto_id,
            (COALESCE(sum(vw_saldo_estoque_comercial_v2.reservado), (0)::bigint))::integer AS qtd
           FROM alissonerp.vw_saldo_estoque_comercial_v2
          GROUP BY vw_saldo_estoque_comercial_v2.produto_id
        ), config_ativa AS (
         SELECT estoque_comercial_config.produto_id,
            true AS tem
           FROM alissonerp.estoque_comercial_config
          WHERE (estoque_comercial_config.ativo = true)
        ), saldo_tiny AS (
         SELECT p_1.id_produto AS produto_id,
            (COALESCE(sum(e.saldo), (0)::numeric))::integer AS qtd
           FROM (produtos p_1
             LEFT JOIN estoque e ON ((((e.sku)::text = (p_1.sku)::text) AND (p_1.sku IS NOT NULL) AND ((p_1.sku)::text <> ''::text))))
          GROUP BY p_1.id_produto
        ), saldo_directus AS (
         SELECT p_1.id_produto AS produto_id,
            (COALESCE(sum(v.saldo), (0)::real))::integer AS qtd
           FROM (produtos p_1
             LEFT JOIN alissonerp.vw_estoque_directus_saldo v ON ((((v.insumo_sku)::text = (p_1.sku)::text) AND (p_1.sku IS NOT NULL) AND ((p_1.sku)::text <> ''::text))))
          GROUP BY p_1.id_produto
        ), saldo_pedra_extras AS (
         SELECT produto_pedra_extras.produto_id,
            COALESCE(produto_pedra_extras.quantidade, 0) AS qtd
           FROM alissonerp.produto_pedra_extras
        ), saldo_filhos_tiny AS (
         SELECT pai.produto_id,
            (COALESCE(sum(e_f.saldo), (0)::numeric))::integer AS qtd
           FROM (((alissonerp.erp_produtos pai
             JOIN alissonerp.erp_produtos filho ON ((filho.parent_id = pai.id)))
             JOIN produtos prod_f ON ((prod_f.id_produto = filho.produto_id)))
             LEFT JOIN estoque e_f ON ((((e_f.sku)::text = (prod_f.sku)::text) AND (prod_f.sku IS NOT NULL) AND ((prod_f.sku)::text <> ''::text))))
          GROUP BY pai.produto_id
        )
 SELECT p.id_produto AS produto_id,
    p.sku,
    p.nome,
    p.categoria,
    COALESCE(se.qtd, 0) AS saldo_erp,
    COALESCE(re.qtd, 0) AS reservado_erp,
    COALESCE(st.qtd, 0) AS saldo_tiny,
    COALESCE(sd.qtd, 0) AS saldo_directus,
    COALESCE(spe.qtd, 0) AS saldo_pedra_extras,
    COALESCE(sft.qtd, 0) AS saldo_filhos_tiny,
        CASE
            WHEN ca.tem THEN COALESCE(se.qtd, 0)
            ELSE GREATEST(COALESCE(st.qtd, 0), COALESCE(sd.qtd, 0), COALESCE(spe.qtd, 0), COALESCE(sft.qtd, 0), 0)
        END AS saldo_efetivo,
        CASE
            WHEN ca.tem THEN GREATEST((COALESCE(se.qtd, 0) - COALESCE(re.qtd, 0)), 0)
            ELSE GREATEST(COALESCE(st.qtd, 0), COALESCE(sd.qtd, 0), COALESCE(spe.qtd, 0), COALESCE(sft.qtd, 0), 0)
        END AS disponivel,
    COALESCE(ca.tem, false) AS tem_config
   FROM (((((((produtos p
     LEFT JOIN saldo_erp se ON ((se.produto_id = p.id_produto)))
     LEFT JOIN reservado_erp re ON ((re.produto_id = p.id_produto)))
     LEFT JOIN config_ativa ca ON ((ca.produto_id = p.id_produto)))
     LEFT JOIN saldo_tiny st ON ((st.produto_id = p.id_produto)))
     LEFT JOIN saldo_directus sd ON ((sd.produto_id = p.id_produto)))
     LEFT JOIN saldo_pedra_extras spe ON ((spe.produto_id = p.id_produto)))
     LEFT JOIN saldo_filhos_tiny sft ON ((sft.produto_id = p.id_produto)));
```

_Sem referência identificada no código._

---

## vw_timeline_ordem

Owner: `postgres`

```sql
 WITH ev_criacao AS (
         SELECT o.id AS ordem_id,
            1 AS passo,
            'criacao'::text AS evento_cod,
            'Criação da Ordem'::text AS evento,
            o.created_at AS data_evento,
            'concluido'::text AS status,
            NULL::text AS detalhe
           FROM alissonerp.ordens o
        ), ev_audit_loja AS (
         SELECT o.id AS ordem_id,
            2 AS passo,
            'auditoria_loja'::text AS evento_cod,
            'Auditoria Loja'::text AS evento,
                CASE
                    WHEN ((a.situacao)::text = 'aprovado'::text) THEN a.data_conclusao
                    ELSE NULL::timestamp with time zone
                END AS data_evento,
                CASE
                    WHEN ((a.situacao)::text = 'aprovado'::text) THEN 'concluido'::text
                    WHEN (a.id IS NOT NULL) THEN 'em_andamento'::text
                    ELSE 'pendente'::text
                END AS status,
            a.parecer AS detalhe
           FROM (alissonerp.ordens o
             LEFT JOIN alissonerp.auditorias a ON (((a.ordem_id = o.id) AND ((a.tipo_auditoria)::text = 'loja'::text) AND ((a.situacao)::text <> 'reprovado'::text))))
        ), ev_proto_ida AS (
         SELECT o.id AS ordem_id,
            3 AS passo,
            'protocolo_ida'::text AS evento_cod,
            'Protocolo Ida'::text AS evento,
                CASE
                    WHEN (p.etapas = 'concluido'::alissonerp.enum_etapas_protocolo) THEN p.data_conclusao
                    ELSE NULL::timestamp with time zone
                END AS data_evento,
                CASE
                    WHEN (p.etapas = 'concluido'::alissonerp.enum_etapas_protocolo) THEN 'concluido'::text
                    WHEN (p.id IS NOT NULL) THEN 'em_andamento'::text
                    ELSE 'pendente'::text
                END AS status,
            NULL::text AS detalhe
           FROM (alissonerp.ordens o
             LEFT JOIN LATERAL ( SELECT p2.id,
                    p2.etapas,
                    p2.data_conclusao
                   FROM (alissonerp.protocolo_ordens po2
                     JOIN alissonerp.protocolos p2 ON (((p2.id = po2.protocolo_id) AND (p2.direcao = 'ida'::alissonerp.enum_direcao_protocolo))))
                  WHERE (po2.ordem_id = o.id)
                  ORDER BY p2.id DESC
                 LIMIT 1) p ON (true))
        ), ev_pcp AS (
         SELECT o.id AS ordem_id,
            4 AS passo,
            'pcp'::text AS evento_cod,
            'PCP'::text AS evento,
                CASE
                    WHEN (pcp.etapas = 'concluido'::alissonerp.enum_etapas_pcp) THEN pcp.data_conclusao
                    ELSE pcp.created_at
                END AS data_evento,
                CASE
                    WHEN (pcp.etapas = 'concluido'::alissonerp.enum_etapas_pcp) THEN 'concluido'::text
                    WHEN (pcp.id IS NOT NULL) THEN 'em_andamento'::text
                    ELSE 'pendente'::text
                END AS status,
            NULL::text AS detalhe
           FROM (alissonerp.ordens o
             LEFT JOIN LATERAL ( SELECT pcp_1.id,
                    pcp_1.etapas,
                    pcp_1.data_conclusao,
                    pcp_1.created_at
                   FROM alissonerp.pcp pcp_1
                  WHERE (pcp_1.ordem_id = o.id)
                  ORDER BY pcp_1.created_at DESC NULLS LAST
                 LIMIT 1) pcp ON (true))
        ), ev_audit_fab AS (
         SELECT o.id AS ordem_id,
            5 AS passo,
            'auditoria_fabrica'::text AS evento_cod,
            'Auditoria Fábrica'::text AS evento,
                CASE
                    WHEN ((a.situacao)::text = 'aprovado'::text) THEN a.data_conclusao
                    ELSE NULL::timestamp with time zone
                END AS data_evento,
                CASE
                    WHEN ((a.situacao)::text = 'aprovado'::text) THEN 'concluido'::text
                    WHEN (a.id IS NOT NULL) THEN 'em_andamento'::text
                    ELSE 'pendente'::text
                END AS status,
            a.parecer AS detalhe
           FROM (alissonerp.ordens o
             LEFT JOIN alissonerp.auditorias a ON (((a.ordem_id = o.id) AND ((a.tipo_auditoria)::text = 'fabrica'::text) AND ((a.situacao)::text <> 'reprovado'::text))))
        ), ev_proto_volta AS (
         SELECT o.id AS ordem_id,
            6 AS passo,
            'protocolo_volta'::text AS evento_cod,
            'Protocolo Volta'::text AS evento,
                CASE
                    WHEN (p.etapas = 'concluido'::alissonerp.enum_etapas_protocolo) THEN p.data_conclusao
                    ELSE NULL::timestamp with time zone
                END AS data_evento,
                CASE
                    WHEN (p.etapas = 'concluido'::alissonerp.enum_etapas_protocolo) THEN 'concluido'::text
                    WHEN (p.id IS NOT NULL) THEN 'em_andamento'::text
                    ELSE 'pendente'::text
                END AS status,
            NULL::text AS detalhe
           FROM (alissonerp.ordens o
             LEFT JOIN LATERAL ( SELECT p2.id,
                    p2.etapas,
                    p2.data_conclusao
                   FROM (alissonerp.protocolo_ordens po2
                     JOIN alissonerp.protocolos p2 ON (((p2.id = po2.protocolo_id) AND (p2.direcao = 'volta'::alissonerp.enum_direcao_protocolo))))
                  WHERE (po2.ordem_id = o.id)
                  ORDER BY p2.id DESC
                 LIMIT 1) p ON (true))
        ), ev_aprovacao AS (
         SELECT o.id AS ordem_id,
            7 AS passo,
            'aprovacao_consultora'::text AS evento_cod,
            'Aprovação Consultora'::text AS evento,
                CASE
                    WHEN (ac.etapas = 'aprovado'::alissonerp.enum_etapas_aprovacao) THEN ac.updated_at
                    ELSE NULL::timestamp with time zone
                END AS data_evento,
                CASE
                    WHEN (ac.etapas = 'aprovado'::alissonerp.enum_etapas_aprovacao) THEN 'concluido'::text
                    WHEN (ac.id IS NOT NULL) THEN 'em_andamento'::text
                    ELSE 'pendente'::text
                END AS status,
            ac.obs AS detalhe
           FROM (alissonerp.ordens o
             LEFT JOIN LATERAL ( SELECT aprovacoes_consultora.id,
                    aprovacoes_consultora.etapas,
                    aprovacoes_consultora.updated_at,
                    aprovacoes_consultora.obs
                   FROM alissonerp.aprovacoes_consultora
                  WHERE (aprovacoes_consultora.ordem_id = o.id)
                  ORDER BY aprovacoes_consultora.updated_at DESC NULLS LAST
                 LIMIT 1) ac ON (true))
        ), ev_entrega AS (
         SELECT o.id AS ordem_id,
            8 AS passo,
            'preparacao_entrega'::text AS evento_cod,
            'Preparação Entrega'::text AS evento,
                CASE
                    WHEN (pe.etapas = 'concluido'::alissonerp.enum_etapas_entrega) THEN pe.updated_at
                    ELSE NULL::timestamp with time zone
                END AS data_evento,
                CASE
                    WHEN (pe.etapas = 'concluido'::alissonerp.enum_etapas_entrega) THEN 'concluido'::text
                    WHEN (pe.id IS NOT NULL) THEN 'em_andamento'::text
                    ELSE 'pendente'::text
                END AS status,
            NULL::text AS detalhe
           FROM (alissonerp.ordens o
             LEFT JOIN LATERAL ( SELECT preparacoes_entrega.id,
                    preparacoes_entrega.etapas,
                    preparacoes_entrega.updated_at
                   FROM alissonerp.preparacoes_entrega
                  WHERE (preparacoes_entrega.ordem_id = o.id)
                  ORDER BY preparacoes_entrega.updated_at DESC NULLS LAST
                 LIMIT 1) pe ON (true))
        )
 SELECT ev_criacao.ordem_id,
    ev_criacao.passo,
    ev_criacao.evento_cod,
    ev_criacao.evento,
    ev_criacao.data_evento,
    ev_criacao.status,
    ev_criacao.detalhe
   FROM ev_criacao
UNION ALL
 SELECT ev_audit_loja.ordem_id,
    ev_audit_loja.passo,
    ev_audit_loja.evento_cod,
    ev_audit_loja.evento,
    ev_audit_loja.data_evento,
    ev_audit_loja.status,
    ev_audit_loja.detalhe
   FROM ev_audit_loja
UNION ALL
 SELECT ev_proto_ida.ordem_id,
    ev_proto_ida.passo,
    ev_proto_ida.evento_cod,
    ev_proto_ida.evento,
    ev_proto_ida.data_evento,
    ev_proto_ida.status,
    ev_proto_ida.detalhe
   FROM ev_proto_ida
UNION ALL
 SELECT ev_pcp.ordem_id,
    ev_pcp.passo,
    ev_pcp.evento_cod,
    ev_pcp.evento,
    ev_pcp.data_evento,
    ev_pcp.status,
    ev_pcp.detalhe
   FROM ev_pcp
UNION ALL
 SELECT ev_audit_fab.ordem_id,
    ev_audit_fab.passo,
    ev_audit_fab.evento_cod,
    ev_audit_fab.evento,
    ev_audit_fab.data_evento,
    ev_audit_fab.status,
    ev_audit_fab.detalhe
   FROM ev_audit_fab
UNION ALL
 SELECT ev_proto_volta.ordem_id,
    ev_proto_volta.passo,
    ev_proto_volta.evento_cod,
    ev_proto_volta.evento,
    ev_proto_volta.data_evento,
    ev_proto_volta.status,
    ev_proto_volta.detalhe
   FROM ev_proto_volta
UNION ALL
 SELECT ev_aprovacao.ordem_id,
    ev_aprovacao.passo,
    ev_aprovacao.evento_cod,
    ev_aprovacao.evento,
    ev_aprovacao.data_evento,
    ev_aprovacao.status,
    ev_aprovacao.detalhe
   FROM ev_aprovacao
UNION ALL
 SELECT ev_entrega.ordem_id,
    ev_entrega.passo,
    ev_entrega.evento_cod,
    ev_entrega.evento,
    ev_entrega.data_evento,
    ev_entrega.status,
    ev_entrega.detalhe
   FROM ev_entrega
  ORDER BY 1, 2;
```

**Uso no código:**
- `alissonerp.vw_timeline_ordem` — 3 ocorrência(s)
  - `scripts/fix_vw_timeline_ordem.mjs:191`
  - `scripts/query_ordem_pcp.mjs:50`
  - `scripts/query_ordem_pcp.mjs:51`

---

## vw_transferencias_ordem

Owner: `postgres`

```sql
 SELECT t.id,
    t.pcp_id,
    t.ordem_id,
    o.numero_ordem,
    t.created_at AS data,
    dep.nome AS deposito_nome,
    st.nome AS setor_nome,
    COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''::text), (au.email)::text, 'Sistema'::text) AS criado_por
   FROM (((((alissonerp.transferencias_ordem t
     LEFT JOIN alissonerp.ordens o ON ((o.id = t.ordem_id)))
     LEFT JOIN alissonerp.depositos dep ON ((dep.id = t.deposito_id)))
     LEFT JOIN alissonerp.setores st ON ((st.id = t.setor_id)))
     LEFT JOIN auth.users au ON ((au.id = t.created_by)))
     LEFT JOIN user_profiles up ON ((up.id_user = au.id)));
```

_Sem referência identificada no código._

---

## vw_user_profiles

Owner: `postgres`

```sql
 SELECT user_profiles.id_user,
    user_profiles.email,
    user_profiles.password_hash,
    user_profiles.name,
    user_profiles.role,
    user_profiles.avatar_url,
    user_profiles.phone,
    user_profiles.created_at,
    user_profiles.updated_at,
    user_profiles.last_login,
    user_profiles.is_active,
    user_profiles.vendedor_id,
    user_profiles.mx_desconto_permitido
   FROM user_profiles;
```

_Sem referência identificada no código._

---

## vw_vendas

Owner: `postgres`

```sql
 SELECT vendas.id,
    vendas.created_at,
    vendas.updated_at,
    vendas.cliente_id,
    vendas.vendedor_id,
    vendas.data_venda,
    vendas.data_envio,
    vendas.status,
    vendas.total_produtos,
    vendas.total_venda,
    vendas.total_itens_qnt,
    vendas.total_itens_unidades,
    vendas.forma_envio_id,
    vendas.forma_frete_id,
    vendas.endereco_cobranca,
    vendas.dados_entrega,
    vendas.dados_pagamento,
    vendas.observacoes_internas,
    vendas.observacoes,
    vendas.arquivos_path,
    vendas.frete_pago_cliente,
    vendas.lead_id,
    vendas.numero_pedido_tiny,
    vendas.id_api_tiny,
    vendas.public_link_uuid,
    vendas.entregue,
    vendas.numero_pedido,
    vendas.pedido_numero
   FROM vendas;
```

_Sem referência identificada no código._

---

## vw_vendas_completa

Owner: `postgres`

```sql
 SELECT v.id,
    v.numero_pedido,
    v.data_venda,
    v.total_venda,
    v.total_produtos,
    v.total_itens_qnt,
    v.status,
    v.entregue,
    v.dados_pagamento,
    v.observacoes,
    c.nome AS cliente_nome,
    c.cpf_cnpj AS cliente_cpf,
    ve.nome AS vendedor_nome,
    ve.id_vendedor AS vendedor_id
   FROM ((vendas v
     LEFT JOIN contatos c ON ((c.id_contato = v.cliente_id)))
     LEFT JOIN vendedores ve ON ((ve.id_vendedor = v.vendedor_id)));
```

_Sem referência identificada no código._

---

## vw_vendas_erp_completa

Owner: `postgres`

```sql
 SELECT v.id,
    v.numero_venda,
    v.cliente_id,
    c.nome AS cliente_nome,
    c.cpf_cnpj AS cliente_cpf_cnpj,
    c.email AS cliente_email,
    c.telefone AS cliente_telefone,
    v.vendedor_id,
    vend.nome AS vendedor_nome,
    v.data_venda,
    v.data_entrega,
    v.total_produtos,
    v.total_desconto,
    v.total_frete,
    v.total_venda,
    v.total_comissao,
    v.situacao,
    v.forma_envio,
    v.forma_frete,
    v.observacoes,
    v.observacoes_internas,
    v.video_obs_interna,
    v.tiny_pedido_id,
    v.tiny_sync_status,
    v.tiny_sync_at,
    v.tiny_sync_erro,
    v.bloqueado,
    v.created_by,
    v.created_at,
    v.updated_at,
    count(DISTINCT i.id) AS qtd_itens,
    COALESCE(sum(p.valor) FILTER (WHERE ((p.status)::text = 'confirmado'::text)), (0)::numeric) AS total_pago
   FROM ((((alissonerp.vendas_erp v
     LEFT JOIN contatos c ON ((c.id_contato = v.cliente_id)))
     LEFT JOIN vendedores vend ON ((vend.id_vendedor = v.vendedor_id)))
     LEFT JOIN alissonerp.itens_venda_erp i ON ((i.venda_id = v.id)))
     LEFT JOIN alissonerp.pagamentos_venda p ON ((p.venda_id = v.id)))
  GROUP BY v.id, c.nome, c.cpf_cnpj, c.email, c.telefone, vend.nome;
```

**Uso no código:**
- `alissonerp.vw_vendas_erp_completa` — 4 ocorrência(s)
  - `scripts/check_view_vendas.mjs:6`
  - `scripts/check_view_vendas.mjs:9`
  - `supabase/migrations/104_modulo_comercial_base.sql:249`
  - `supabase/migrations/105_comercial_view_video.sql:1`

---

## vw_vendedores

Owner: `postgres`

```sql
 SELECT vendedores.id_vendedor,
    vendedores.nome,
    vendedores.id_api_vendedor,
    vendedores.foto,
    vendedores.situacao,
    vendedores.id_api_kommo,
    vendedores.cpf,
    vendedores.email,
    vendedores.user_id,
    vendedores.comissao,
    vendedores.gerente_orcamento
   FROM vendedores;
```

_Sem referência identificada no código._

---

