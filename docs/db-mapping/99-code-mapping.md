# Mapeamento Banco ↔ Código

> Gerado em: 2026-04-29
> Arquivos de código varridos: **1013** (8.1 MB)
> Objetos buscados: **796** (tabelas + views + funções + triggers de `alissonerp`, `public`, `directus`, `crm`)

## Visão geral

| Métrica | Valor |
|---|---:|
| Objetos com pelo menos 1 referência | **322** |
| Objetos sem referência identificada | **474** |
| Chamadas `supabase.from(...)` | 2 |
| Migrations indexadas | 219 |

### Aviso sobre ambiguidade

O regex usa apenas o **nome** do objeto, não o schema. Quando o código escreve `FROM ordens`, o `search_path = alissonerp,public` (configurado em `src/lib/db.ts`) define que vai pra `alissonerp.ordens`. Mas a contagem aqui marca match para QUALQUER schema com esse nome de tabela. Tabelas com nomes idênticos em múltiplos schemas (`ordens`, `pcp`, `protocolo`, `insumos`, `audit_log`) terão a mesma contagem listada para cada schema.

## Top 30 objetos mais referenciados

| # | Objeto | Ocorrências |
|--:|--------|------------:|
| 1 | `public.produtos` | 564 |
| 2 | `public.vendas` | 527 |
| 3 | `alissonerp.ordens` | 487 |
| 4 | `directus.ordens` | 487 |
| 5 | `alissonerp.pcp` | 476 |
| 6 | `directus.pcp` | 476 |
| 7 | `public.estoque` | 356 |
| 8 | `alissonerp.insumos` | 245 |
| 9 | `directus.insumos` | 245 |
| 10 | `directus.protocolo` | 245 |
| 11 | `public.pagamentos` | 222 |
| 12 | `alissonerp.roles` | 192 |
| 13 | `public.categorias` | 130 |
| 14 | `alissonerp.vendas_erp` | 111 |
| 15 | `alissonerp.depositos` | 88 |
| 16 | `public.vendedores` | 87 |
| 17 | `directus.distribuicao` | 83 |
| 18 | `public.orcamento` | 78 |
| 19 | `alissonerp.usuarios` | 74 |
| 20 | `alissonerp.compras` | 68 |
| 21 | `alissonerp.tarefas` | 68 |
| 22 | `crm.tarefas` | 68 |
| 23 | `directus.compras` | 68 |
| 24 | `directus.apontamento` | 59 |
| 25 | `public.contatos` | 59 |
| 26 | `alissonerp.parametros` | 58 |
| 27 | `public.parametros` | 58 |
| 28 | `alissonerp.contas_receber` | 57 |
| 29 | `alissonerp.erp_produtos` | 56 |
| 30 | `alissonerp.notificacoes` | 56 |

## Objetos SEM uso identificado no código

_Podem ser: (a) legado / dead code, (b) chamados via PostgREST por clientes externos, (c) usados apenas dentro de outras funções/views/triggers do banco, (d) chamados por sistemas externos não auditados._

### Quebra por schema

- **alissonerp**: 94 objeto(s) sem uso identificado
- **auth**: 18 objeto(s) sem uso identificado
- **crm**: 67 objeto(s) sem uso identificado
- **directus**: 114 objeto(s) sem uso identificado
- **extensions**: 4 objeto(s) sem uso identificado
- **public**: 169 objeto(s) sem uso identificado
- **storage**: 8 objeto(s) sem uso identificado

### Quebra por tipo

- **table**: 200
- **view**: 82
- **function**: 118
- **trigger**: 74

### Lista completa (sem uso identificado)

<details><summary>Mostrar 474 objetos</summary>

- `alissonerp._backup_fn_processar_fechamento_dist_pre_guard_20260429`
- `alissonerp._backup_servicos_20260331`
- `alissonerp._backup_tedmd_20260313`
- `alissonerp._backup_transferservice_20260331`
- `alissonerp.api_chaves`
- `alissonerp.api_log`
- `alissonerp.apontamentos_pote`
- `alissonerp.apontamentos_servico`
- `alissonerp.atualizar_preco_produto_v2`
- `alissonerp.automacoes_execucoes`
- `alissonerp.backup_pre_limpeza_20260315`
- `alissonerp.comentarios_tarefa`
- `alissonerp.dashboard_configs`
- `alissonerp.epc_serial`
- `alissonerp.estornos_distribuicao`
- `alissonerp.faixas_comissao`
- `alissonerp.fechamentos_fabrica`
- `alissonerp.fichas_tecnicas`
- `alissonerp.fichas_tecnicas_produto`
- `alissonerp.fin_gateways`
- `alissonerp.fn_adicionar_dias_uteis`
- `alissonerp.fn_aprovacao_para_entrega`
- `alissonerp.fn_atualizar_parametros_sistema`
- `alissonerp.fn_audit_log`
- `alissonerp.fn_auto_auditoria_loja`
- `alissonerp.fn_bloquear_compra`
- `alissonerp.fn_bloquear_venda`
- `alissonerp.fn_calcular_pmc_distribuicao`
- `alissonerp.fn_cancelar_pcp_ordem`
- `alissonerp.fn_criar_fechamento_por_ordem`
- `alissonerp.fn_criar_item_distribuicao`
- `alissonerp.fn_curva_touch_updated_at`
- `alissonerp.fn_devolucoes_updated_at`
- `alissonerp.fn_produto_imagens_touch`
- `alissonerp.fn_recalcular_totais_venda`
- `alissonerp.fn_sync_item_venda_from_public`
- `alissonerp.fn_sync_venda_from_public`
- `alissonerp.fn_sync_venda_update_from_public`
- `alissonerp.fn_touch_updated_at`
- `alissonerp.fn_update_estoque_comercial_config_ts`
- `alissonerp.fn_updated_at_mp_point_devices`
- `alissonerp.fn_updated_at_vendas_erp`
- `alissonerp.fn_user_views_touch_updated`
- `alissonerp.gateways_pagamento`
- `alissonerp.itens_ordem_produtos`
- `alissonerp.joias_leituras`
- `alissonerp.joias_rfid`
- `alissonerp.liga_tipo_ouro`
- `alissonerp.ordem_comentario_mencoes`
- `alissonerp.parametros_sistema`
- `alissonerp.permissoes_usuario`
- `alissonerp.precificacao_config`
- `alissonerp.precificacao_historico`
- `alissonerp.proximo_sku_pz`
- `alissonerp.saidas_distribuicao`
- `alissonerp.tg_joias_rfid_touch_updated`
- `alissonerp.tg_produto_personalizacao_touch_updated`
- `alissonerp.tiny_sync_produtos`
- `alissonerp.user_views`
- `alissonerp.uso_maquina_reserva`
- `alissonerp.vw_aging_contas`
- `alissonerp.vw_apontamentos_ordem`
- `alissonerp.vw_comissoes`
- `alissonerp.vw_contatos`
- `alissonerp.vw_dash_comissoes`
- `alissonerp.vw_dash_controle_entregas`
- `alissonerp.vw_dash_forma_envio`
- `alissonerp.vw_dash_forma_frete`
- `alissonerp.vw_dash_itens_venda`
- `alissonerp.vw_dash_leads`
- `alissonerp.vw_dash_metas_mensais`
- `alissonerp.vw_dash_metas_por_hora`
- `alissonerp.vw_dash_parcelas_pedidos`
- `alissonerp.vw_dash_pedidos_parcelas_detalhado`
- `alissonerp.vw_dash_vendas`
- `alissonerp.vw_dash_vendedores`
- `alissonerp.vw_estoque_directus`
- `alissonerp.vw_estoque_ordem`
- `alissonerp.vw_kpis_gerais`
- `alissonerp.vw_pcp_completa`
- `alissonerp.vw_producao_mensal`
- `alissonerp.vw_produtividade_ourives`
- `alissonerp.vw_produtos`
- `alissonerp.vw_protocolo_ordens`
- `alissonerp.vw_protocolos_completo`
- `alissonerp.vw_protocolos_loja_completo`
- `alissonerp.vw_quebra_operadores`
- `alissonerp.vw_quebra_por_deposito`
- `alissonerp.vw_saldo_unificado`
- `alissonerp.vw_transferencias_ordem`
- `alissonerp.vw_user_profiles`
- `alissonerp.vw_vendas`
- `alissonerp.vw_vendas_completa`
- `alissonerp.vw_vendedores`
- `auth.audit_log_entries`
- `auth.flow_state`
- `auth.identities`
- `auth.mfa_amr_claims`
- `auth.mfa_challenges`
- `auth.mfa_factors`
- `auth.oauth_authorizations`
- `auth.oauth_client_states`
- `auth.oauth_clients`
- `auth.oauth_consents`
- `auth.one_time_tokens`
- `auth.refresh_tokens`
- `auth.saml_providers`
- `auth.saml_relay_states`
- `auth.schema_migrations`
- `auth.sessions`
- `auth.sso_domains`
- `auth.sso_providers`
- `crm.adicionar_mensagem`
- `crm.agente_runs`
- `crm.agentes_ia`
- `crm.atribuir_vendedor`
- `crm.audit_trigger`
- `crm.automacao_etapas`
- `crm.automacao_execucoes`
- `crm.automacao_gatilhos`
- `crm.brechas`
- `crm.buscar_ou_criar_contato_dm`
- `crm.ciclo_vida_eventos`
- `crm.config_geral`
- `crm.contato_canais`
- `crm.conversas`
- `crm.criar_conversa_se_necessario`
- `crm.criar_oportunidade`
- `crm.funil_blocos`
- `crm.funil_etapas`
- `crm.funil_movimentos`
- `crm.funis`
- `crm.instagram_posts`
- `crm.kommo_config`
- `crm.marcar_conversa_lida`
- `crm.meta_config`
- `crm.motivos_perda`
- `crm.mover_etapa_funil`
- `crm.mover_oportunidade_etapa`
- `crm.normalizar_nome`
- `crm.oportunidade_historico`
- `crm.origens_lead`
- `crm.prompt_templates`
- `crm.sdr_runs`
- `crm.set_updated_at`
- `crm.trg_agentes_ia_updated`
- `crm.trg_audit_agentes_ia`
- `crm.trg_audit_automacoes`
- `crm.trg_audit_brechas`
- `crm.trg_audit_config_geral`
- `crm.trg_audit_conversas`
- `crm.trg_audit_funil_blocos`
- `crm.trg_audit_funil_etapas`
- `crm.trg_audit_kommo_config`
- `crm.trg_audit_meta_config`
- `crm.trg_audit_prompt_templates`
- `crm.trg_audit_tarefas`
- `crm.trg_audit_unipile_config`
- `crm.trg_automacao_etapas_updated`
- `crm.trg_automacoes_updated`
- `crm.trg_brechas_updated`
- `crm.trg_config_geral_updated`
- `crm.trg_contato_canais_updated`
- `crm.trg_conversas_updated`
- `crm.trg_funil_blocos_updated`
- `crm.trg_funil_etapas_updated`
- `crm.trg_funis_updated`
- `crm.trg_instagram_posts_updated`
- `crm.trg_kommo_config_updated`
- `crm.trg_mensagens_updated`
- `crm.trg_meta_config_updated`
- `crm.trg_oportunidades_updated`
- `crm.trg_prompt_templates_updated`
- `crm.trg_tarefas_updated`
- `crm.trg_unipile_config_updated`
- `crm.trg_webhook_config_updated`
- `crm.unipile_config`
- `crm.user_eh_admin`
- `crm.user_vendedor_id`
- `directus.ai_prompts`
- `directus.apontamento_distribuicao_files`
- `directus.apontamento_files`
- `directus.apontamentos_pote`
- `directus.aprovar_consultora`
- `directus.aprovar_consultora_files`
- `directus.atualizar_outros_pesos_pcp`
- `directus.atualizar_totais_pedras_pcp`
- `directus.atualizar_total_metal_pcp`
- `directus.auditar_financeiro`
- `directus.cadastro_produtos`
- `directus.calc_peso_ourofino`
- `directus.calc_totais_ordem_compra`
- `directus.calcular_peso_unitario_pcp`
- `directus.calcular_total_geral_pcp`
- `directus.categoria_insumo`
- `directus.compras_files`
- `directus.criar_comentario_com_mencoes`
- `directus.directus_access`
- `directus.directus_activity`
- `directus.directus_collections`
- `directus.directus_collections_backup`
- `directus.directus_comments`
- `directus.directus_dashboards`
- `directus.directus_extensions`
- `directus.directus_fields`
- `directus.directus_flows`
- `directus.directus_folders`
- `directus.directus_migrations`
- `directus.directus_notifications`
- `directus.directus_operations`
- `directus.directus_panels`
- `directus.directus_permissions`
- `directus.directus_policies`
- `directus.directus_presets`
- `directus.directus_relations`
- `directus.directus_revisions`
- `directus.directus_roles`
- `directus.directus_sessions`
- `directus.directus_settings`
- `directus.directus_shares`
- `directus.directus_translations`
- `directus.directus_users`
- `directus.directus_versions`
- `directus.directus_webhooks`
- `directus.distribuicao_ordens_1`
- `directus.fechamento_distribuicao`
- `directus.fechamento_distribuicao_files`
- `directus.fechamento_distribuicao_itens_disttribuicao`
- `directus.fechamento_distribuicao_ordens`
- `directus.fechamento_distribuicao_outros_insumos_distribuicao`
- `directus.fechamento_fabrica`
- `directus.ficha_tecnica_ordem`
- `directus.fn_atualizar_conclusao_universal`
- `directus.fn_ordens_comentarios_update_date_column`
- `directus.fn_vinculo_entrega_ordens`
- `directus.formulario_venda_antiga`
- `directus.formulario_venda_antiga_produtos`
- `directus.func_gerar_numero_ordem`
- `directus.insumos_files`
- `directus.itens_compras`
- `directus.itens_disttribuicao`
- `directus.itens_disttribuicao_outros_insumos_distribuicao`
- `directus.itens_ordem_compra`
- `directus.itens_ordem_compra_files`
- `directus.lancamento_avulso`
- `directus.lancamento_avulso_files`
- `directus.logistica_ordens`
- `directus.ordemCompra`
- `directus.ordemCompra_produtos`
- `directus.ordem_comentario_mencoes`
- `directus.ordem_comentarios_populados`
- `directus.ordens_estoque`
- `directus.ordens_files`
- `directus.outros_insumos`
- `directus.pcp_fechamento`
- `directus.pcp_teste`
- `directus.peca_pre_acabada`
- `directus.peca_pre_acabada_insumos`
- `directus.preencher_numero_ordem`
- `directus.preparando_entrega`
- `directus.protocolo_files`
- `directus.protocolo_loja_files`
- `directus.protocolo_loja_ordens`
- `directus.protocolo_loja_ordens_1`
- `directus.protocolo_ordens_1`
- `directus.protocolo_ordens_2`
- `directus.protocolo_ordens_3`
- `directus.protocolo_ordens_4`
- `directus.replicar_pmc_controle_estoque`
- `directus.saida_distribuicao_files`
- `directus.saida_distribuicao_itens_disttribuicao`
- `directus.saida_ordem_files`
- `directus.saida_ordem_itens_ordem`
- `directus.tipo_apontamento`
- `directus.tipo_ocorrencia`
- `directus.transferencia_ordem_itens_ordem`
- `directus.trg_atualiza_peso_unitario`
- `directus.trg_calc_peso_ourofino`
- `directus.trg_concl_financeiro`
- `directus.trg_concl_preparando`
- `directus.trg_preencher_numero_ordem`
- `directus.trg_set_numero_ordem`
- `directus.trg_totais_ordem_compra`
- `directus.trg_upd_ordens_comentarios`
- `directus.trg_vinculo_entrega_ordem`
- `directus.trg_vinculo_ordens`
- `directus.trigger_calc_total_geral`
- `directus.trigger_criar_notificacao_mencao`
- `directus.trigger_nova_ordem`
- `directus.trigger_soma_metal`
- `directus.trigger_soma_outros_insumos`
- `directus.trigger_soma_pedras`
- `directus.v_saldo_quebra_final`
- `extensions.hypopg_hidden_indexes`
- `extensions.hypopg_list_indexes`
- `extensions.pg_stat_statements_info`
- `extensions.wrappers_fdw_stats`
- `public.Webhook Contatos Envio tiny`
- `public.atualiza_obs_produto`
- `public.atualizar_item_comissao`
- `public.atualizar_metas_horarias_fortaleza`
- `public.atualizar_saldo_estoque`
- `public.atualizar_total_metal_pcp`
- `public.backup_itens_venda_3313`
- `public.backup_itens_venda_pre_correcao_marco`
- `public.backup_itens_venda_test_3313`
- `public.banco_imagens`
- `public.buscar_pedido`
- `public.calcular_diferenca_percentual`
- `public.categorias_receitas_despesas`
- `public.chamar_atualizacao_de_metas_trigger_func`
- `public.complementos_contatos`
- `public.config_orcamento_aliancas`
- `public.contas_a_pagar`
- `public.contas_a_receber`
- `public.contasareceberdetalhada`
- `public.controle_de_execucao`
- `public.controle_entregas`
- `public.controle_requisicao`
- `public.controle_sequencia`
- `public.criar_notificacao_mencao`
- `public.crm_adicionar_mensagem`
- `public.crm_agente_runs`
- `public.crm_agentes_ia`
- `public.crm_atribuir_vendedor`
- `public.crm_audit_log`
- `public.crm_automacao_etapas`
- `public.crm_automacao_execucoes`
- `public.crm_automacao_gatilhos`
- `public.crm_automacoes`
- `public.crm_brechas`
- `public.crm_buscar_ou_criar_contato_dm`
- `public.crm_ciclo_vida_eventos`
- `public.crm_config_geral`
- `public.crm_contato_canais`
- `public.crm_conversas`
- `public.crm_conversas_completas`
- `public.crm_criar_conversa_se_necessario`
- `public.crm_criar_oportunidade`
- `public.crm_funil_blocos`
- `public.crm_funil_etapas`
- `public.crm_funil_etapas_completas`
- `public.crm_funil_movimentos`
- `public.crm_funis`
- `public.crm_instagram_posts`
- `public.crm_kommo_config`
- `public.crm_marcar_conversa_lida`
- `public.crm_mensagens`
- `public.crm_meta_config`
- `public.crm_motivos_perda`
- `public.crm_mover_etapa_funil`
- `public.crm_mover_oportunidade_etapa`
- `public.crm_notificacoes`
- `public.crm_oportunidade_historico`
- `public.crm_oportunidades`
- `public.crm_oportunidades_completas`
- `public.crm_origens_lead`
- `public.crm_processar_webhook_unipile`
- `public.crm_prompt_templates`
- `public.crm_sdr_runs`
- `public.crm_tarefas`
- `public.crm_unipile_config`
- `public.crm_user_eh_admin`
- `public.crm_user_perfil`
- `public.crm_user_vendedor_id`
- `public.crm_webhook_config`
- `public.crm_webhook_log`
- `public.definir_meta_acumulada_inicial`
- `public.disparar_atualizacao_produtos`
- `public.disparar_webhook_n8n`
- `public.ficha_tecnica_orcamento`
- `public.ficha_tecnica_produto`
- `public.fila_webhooks_n8n`
- `public.fin_auto_conciliar`
- `public.fin_divergencias_pendentes`
- `public.fn_atualizar_ordem_por_entrega`
- `public.fn_gerar_numero_orcamento`
- `public.fn_gerar_venda_sequencial`
- `public.fn_gerar_venda_sequencial_manual`
- `public.fn_inicializar_orcamento`
- `public.fn_proteger_delete_itens_venda`
- `public.fn_proteger_preco_itens_venda`
- `public.fn_users_profile_updated_date_column`
- `public.fonte_entrada_kommo`
- `public.gerar_metas_por_hora_final`
- `public.get_auditoria_completa`
- `public.get_auditoria_operadores`
- `public.get_auditoria_v4`
- `public.get_consolidado_estoque`
- `public.get_quebra_por_periodo`
- `public.get_saldo_absoluto_cofre`
- `public.get_saldo_real_cofre`
- `public.handle_updated_at`
- `public.handle_updated_at`
- `public.historico_ordem`
- `public.historico_preco`
- `public.historico_venda_ja`
- `public.indicadores_marketing`
- `public.itens_da_ordem`
- `public.itens_pedido`
- `public.map_asana`
- `public.map_vendedor_kommo`
- `public.metas_por_hora`
- `public.n8n_trigger_function_240c32bc_cedc_46cd_a8e7_e2f6e780268f`
- `public.n8n_trigger_function_be0584e3_2e2d_424a_b038_a20d0519b999`
- `public.n8n_trigger_function_e82b0522_503c_44a5_9c54_a4c9e621379d`
- `public.notificar_apenas_mudanca_situacao`
- `public.notificar_mudanca_estoque`
- `public.notificar_n8n_nova_venda`
- `public.notificar_nova_ordem`
- `public.notify_n8n_solicitacao_vale_troca`
- `public.obter_saldo_pote_geral`
- `public.on_contatos_update`
- `public.on_product_update`
- `public.on_produto_update_notify_situacao`
- `public.on_produtos_update`
- `public.on_update_vendas`
- `public.ordem_compras`
- `public.parcelas_da_ordem`
- `public.parcelas_pedidos`
- `public.pedidos_dashboard`
- `public.preencher_numero_ordem`
- `public.processar_aprovacao_orcamento`
- `public.produtos_views`
- `public.public_links`
- `public.recalcular_diferenca_produto`
- `public.registrar_modificacao_contatos`
- `public.registrar_modificacao_produtos`
- `public.registrar_mudanca_situacao`
- `public.relacao_tinny_moura`
- `public.set_updated_at`
- `public.set_updated_at`
- `public.solicitacoes_vale_troca`
- `public.staging_markup_aprovacao`
- `public.suporte_conversas`
- `public.sync_venda_entregue`
- `public.texto_para_numeric`
- `public.tipos_contatos`
- `public.trg_antes_inserir_orcamento`
- `public.trg_aprovacao_orcamento`
- `public.trg_definir_meta_acumulada`
- `public.trg_gerar_numero_orcamento`
- `public.trg_leads_update`
- `public.trg_notifica_estoque`
- `public.trg_notificar_n8n`
- `public.trg_solicitacao_vale_troca`
- `public.trg_venda_sequencial`
- `public.trg_webhook_novo_produto`
- `public.trigger_arredondar_peso`
- `public.trigger_atualizar_saldo_estoque`
- `public.trigger_entregas_updated_at`
- `public.trigger_gerar_metas_por_hora`
- `public.trigger_parametros_atualizados`
- `public.trigger_sync_venda_entregue`
- `public.unaccent_init`
- `public.unaccent_lexize`
- `public.update_data_atualizacao`
- `public.update_entregas_updated_at`
- `public.update_timestamp_columns`
- `public.v_estoque_detalhado_insumo`
- `public.v_quebra_distribuicao`
- `public.v_saldo_quebra_final`
- `public.view_monitoramento_ordens`
- `public.webhook_estoque_insert_seguro`
- `public.webhook_estoque_update_seguro`
- `public.z_trigger_atualiza_diferenca_percentual`
- `storage.buckets_analytics`
- `storage.buckets_vectors`
- `storage.iceberg_namespaces`
- `storage.iceberg_tables`
- `storage.prefixes`
- `storage.s3_multipart_uploads`
- `storage.s3_multipart_uploads_parts`
- `storage.vector_indexes`

</details>

## Chamadas `supabase.from(...)`

| Tabela | Arquivo | Linha |
|---|---|---:|
| `webhook_log` | `src/lib/webhooks.ts` | 43 |
| `...` | `scripts/_build_code_references.mjs` | 259 |

## Migrations (219)

<details><summary>Mostrar lista completa</summary>

| Arquivo | Resumo |
|---|---|
| `001_enums.sql` | ============================================= |
| `002_tabelas_config.sql` | ============================================= |
| `003_tabelas_usuarios_comercial.sql` | ============================================= |
| `004_seed_dados_iniciais.sql` | ============================================= |
| `005_correcao_cross_schema.sql` | ============================================= |
| `006_ordens.sql` | ============================================= |
| `007_pcp_auxiliares.sql` | ============================================= |
| `008_distribuicao.sql` | ============================================= |
| `009_estoque.sql` | ============================================= |
| `010_protocolo_pos_producao.sql` | ============================================= |
| `011_audit_triggers_funcoes.sql` | ============================================== |
| `012_rls_basico.sql` | ============================================== |
| `013_realtime.sql` | ============================================== |
| `014_view_ordens_enriquecida.sql` | ============================================= |
| `015_correcoes_views.sql` | ═══ 1. RECRIAR vw_ordens_completa COM ACENTOS ═══ |
| `016_views_detalhe_ordem.sql` | ═══ 1. VIEW DETALHE COMPLETO DA ORDEM ═══ |
| `017_auth_trigger.sql` | ═══ 1. FUNCTION: Auto-criar perfil quando auth.user é criado ═══ |
| `018_trigger_apontamento_pcp.sql` | ============================================= |
| `019_trigger_transferencia_saida.sql` | ═══════════════════════════════════════════════════════════════════════ |
| `020_triggers_distribuicao.sql` | ============================================= |
| `021_triggers_protocolo.sql` | ============================================= |
| `022_lancamento_avulso_compras.sql` | ═══ FLOW 1006 — LANÇAMENTO AVULSO ═══ |
| `023_storage_protocolo.sql` | ============================================= |
| `024_financeiro.sql` | ═══ CONTAS A PAGAR ═══ |
| `025_webhooks_dashboard.sql` | ═══ WEBHOOK CONFIG ═══ |
| `026_auditoria_completa.sql` | ============================================= |
| `027_trigger_ponte_pdv.sql` | ============================================= |
| `028_auditoria_dupla.sql` | ============================================= |
| `029_corrigir_enum_tipo_ordem.sql` | ============================================= |
| `030_ficha_tecnica_view.sql` | ============================================= |
| `031_timeline_ordem.sql` | ============================================= |
| `032_grants_views.sql` | ============================================= |
| `033_ficha_tecnica_labels.sql` | ============================================= |
| `034_numero_pedido.sql` | ============================================= |
| `035_numero_pedido_na_tabela.sql` | ============================================= |
| `036_fix_numero_pedido_vendas.sql` | ============================================= |
| `037_auditoria_data_entrega.sql` | ============================================= |
| `038_pcp_ao_aprovar_auditoria_loja.sql` | ============================================= |
| `039_auditoria_peso_metal_externo.sql` | ============================================= |
| `040_servico_rota_protocolo.sql` | ============================================= |
| `041_protocolo_foto_rastreio_views.sql` | ============================================= |
| `043_apontamento_foto_balanca.sql` | ============================================= |
| `044_configuracoes_ia.sql` | ============================================= |
| `045_fix_configuracoes_secrets.sql` | ============================================= |
| `046_depositos_setores_fix.sql` | ============================================= |
| `047_distribuicao_deposito.sql` | ============================================= |
| `048_pcp_deposito_id.sql` | ============================================= |
| `049_apontamentos_distribuicao_foto.sql` | ============================================= |
| `050_fechamentos_distribuicao_foto.sql` | ============================================= |
| `051_distribuicao_ordens_saida.sql` | ============================================= |
| `052_fix_vw_detalhe_pote.sql` | ============================================= |
| `053_pcp_dist_totais.sql` | Migration 053: Campos de rastreamento da saída de distribuição no PCP |
| `054_distribuicoes_lote_quebra.sql` | Migration 054: Campos de rastreamento do balanço do lote na conclusão |
| `055_produtos_campos_pedra.sql` | ============================================= |
| `056_produto_composicao.sql` | ============================================= |
| `057_markup_pedras.sql` | ============================================= |
| `058_precificacao_config.sql` | ============================================= |
| `059_markup_alteracoes.sql` | ============================================= |
| `060_produtos_campos_erp.sql` | ============================================= |
| `061_insumos_preco_compra.sql` | ============================================= |
| `062_composicao_medidas_metal.sql` | ============================================= |
| `063_erp_produtos.sql` | ============================================= |
| `064_seq_produto_id.sql` | ============================================= |
| `065_ordens_eh_teste.sql` | Migration 065: Adiciona flag eh_teste à tabela ordens |
| `066_quebra_operador.sql` | Migration 066: Tabela quebra_operador + views dashboard ouro |
| `067_role_permissoes.sql` | Migration 067: Tabela RBAC — role_permissoes |
| `068_role_varchar.sql` | Migration 068: Migrar enum_role → VARCHAR(50) + tabela roles |
| `069_comentarios_notificacoes.sql` | ============================================ |
| `070_rls_comentarios_notificacoes.sql` | ============================================================ |
| `071_comentarios_foto_excluido.sql` | Migration 071: Adicionar foto e soft-delete em comentarios_ordem |
| `072_user_profiles_unique_avatar.sql` | ============================================= |
| `073_tipo_servico_venda_loja.sql` | ============================================================================ |
| `074_itens_ordem_erp_e_permissoes.sql` | Migration 074: Tabela itens_ordem (ERP) + permissão granular por tipo |
| `075_detalhes_ordem.sql` | ============================================================================ |
| `076_insumos_edicao_completa.sql` | Migration 076: Edição completa de insumos |
| `077_saida_sem_peso.sql` | Flag indicando que a ordem saiu sem peso (justificativa obrigatória) |
| `078_saida_metal_externo.sql` | Migration 078: adiciona coluna metal_externo em saidas_ordem |
| `079_marcadores_pedras.sql` | 079_marcadores_pedras.sql |
| `080_sync_user_profiles_id_user.sql` | ============================================= |
| `081_estorno_distribuicao.sql` | migration 081: estorno de ordem em distribuição |
| `082_estorno_lote_distribuicao.sql` | Migration 082: Estorno de lote inteiro |
| `083_transferencia_avulsa_destino.sql` | Migration 083: Adicionar destino configurável na transferência avulsa |
| `084_purificacao.sql` | ═══════════════════════════════════════════════════ |
| `085_ligacao.sql` | ═══════════════════════════════════════════════════════════════════════════════ |
| `086_ligacao_pureza.sql` | MIGRATION 086: Adicionar coluna pureza em ligacoes |
| `086_wa_assistant.sql` | ============================================= |
| `087_wa_kb_seed.sql` | ============================================= |
| `088_user_profiles_phone.sql` | ============================================= |
| `089_permissoes_purificacao_ligacao.sql` | Migration 089: Permissões granulares por usuário (purificação/ligação) |
| `090_editar_teor_ligacao.sql` | Migration 090: Adiciona permissão editar_teor_ligacao para admin/desenvolvedor |
| `092_modulo_service.sql` | ============================================================ |
| `093_tipo_protocolo.sql` | Migration 093: tipo_protocolo em protocolos + tipos_protocolo_permitidos em usuarios |
| `094_locais_estoque.sql` | Migration 094: locais_estoque — estoque multi-local (Fábrica + Loja) |
| `095_pedras_quilates_ct.sql` | Migration 095: pedras em quilates (ct) — rastreio em pcp e apontamentos |
| `096_compras_expandidas.sql` | Migration 096: compras expandidas — NF, data, local destino, lote |
| `097_views_saldo_multilocal_ct.sql` | Migration 097: views saldo multi-local + ct |
| `098_triggers_pedras_ct_compras.sql` | Migration 098: Triggers pedras CT + compras local |
| `099_data_entrega_fabricacao.sql` | Migration 099: Data de entrega automática para ordens de fabricação |
| `100_tipos_servico.sql` | Migration 100: Tipos de Serviço Interno (v2.15.0) |
| `101_fix_triggers_pedras_local.sql` | Migration 101: Fix emergencia -- mismatch unidade pedras + local_estoque_id ausente |
| `102_fix_local_estoque_functions.sql` | Migration 102: Fix local_estoque_id em funcoes de trigger |
| `103_transferencia_service.sql` | Migration 103: Transferência Service |
| `104_modulo_comercial_base.sql` | ============================================= |
| `105_comercial_view_video.sql` | Migration 105: adiciona video_obs_interna na vw_vendas_erp_completa |
| `106_vendas_token_compartilhamento.sql` | Migration 106: token de compartilhamento público para orçamentos |
| `107_estoque_comercial.sql` | ============================================================ |
| `108_ordens_garantia.sql` | ============================================================ |
| `109_sync_public_vendas.sql` | ============================================================ |
| `110_fix_trigger_sync_exception.sql` | ============================================================ |
| `111_estoque_comercial_auto_venda.sql` | Migration 111: Auto-redução de estoque comercial na venda |
| `111_fichas_tecnicas_erp.sql` | ============================================================ |
| `112_modulo_tarefas.sql` | Migration 112: Módulo de Tarefas (substitui Asana) |
| `113_financeiro_auto.sql` | Migration 113: Triggers financeiros automáticos |
| `114_blindar_vendas_fechadas.sql` | Migration 114: Blindar vendas fechadas contra alterações |
| `115_fix_sync_triggers.sql` | Migration 115: Corrigir triggers de sync public.vendas → alissonerp.vendas_erp |
| `116_blindar_itens_venda_public.sql` | Migration 116: Blindar public.itens_venda contra alteração de preços/comissões |
| `117_fix_sync_itens_faltantes.sql` | Migration 117: Fix sync itens faltantes |
| `118_sync_bypass_blindagem.sql` | Migration 118: Sync triggers bypass blindagem via session variable |
| `119_tarefas_avancadas.sql` | Migration 119: Tarefas Avançadas — aprovações, automações, posição kanban |
| `120_modulo_orcamento.sql` | ============================================================ |
| `121_fix_saldo_ct_formula.sql` | ============================================================ |
| `122_views_local_estoque_display.sql` | ============================================================ |
| `123_lancamento_avulso_local_estoque.sql` | ============================================================ |
| `124_is_transportador.sql` | ============================================================ |
| `125_fix_timeline_proto_duplicado.sql` | ============================================================ |
| `126_orcamento_pedras_config.sql` | ============================================================ |
| `127_orcamento_cliente_ordem.sql` | ============================================================ |
| `128_orcamento_foto_3d.sql` | 128 — Orçamento: foto 3D da aliança |
| `129_orcamento_venda_ordem.sql` | ============================================================ |
| `130_endereco_entrega_venda.sql` | Migration 130: Endereço de entrega na venda (separado do endereço de cobrança do cliente) |
| `130_itens_venda_produto_nullable.sql` | ============================================================ |
| `131_orcamento_par_aliancas.sql` | Migration 131: Orçamento par de alianças |
| `132_orcamento_validacao_zirconia.sql` | ══════════════════════════════════════════════════════════════════════════ |
| `133_notif_aguardando_resposta.sql` | Migration 133 — Notificações de menção: aguardando resposta |
| `134_modulo_rfid.sql` | ============================================================================ |
| `134_notif_alarme_snooze.sql` | Migration 134 — Snooze do alarme de menções |
| `135_categorias_produtos_estoque.sql` | ============================================================ |
| `135_mercado_pago_integracao.sql` | ============================================= |
| `136_normalizar_metal_ouro.sql` | ============================================================ |
| `136_unaccent_extension.sql` | ══════════════════════════════════════════════════════════════════════════ |
| `137_pagamentos_valor_liquido.sql` | ═══════════════════════════════════════════════════════════════════════════ |
| `137_unificar_metal_ouro_amarelo.sql` | ============================================================ |
| `138_pagamento_ouro.sql` | v2.30.11 — Pagamento em Ouro |
| `138_produto_tipo_item.sql` | ============================================================ |
| `138_saldo_gerente_credito.sql` | Migration 138: Saldo Crédito Gerente + Aprovação em Cascata |
| `139_metas_tiers_horario.sql` | Migration 139: Metas com tiers (Prata/Ouro/Diamante) + horário/dias trabalhados |
| `140_estoque_comercial_v2.sql` | ============================================================ |
| `140_friso_desacoplado.sql` | ══════════════════════════════════════════════════════════════════════════ |
| `141_triggers_estoque_comercial_v2.sql` | ============================================================ |
| `142_devolucoes_vale_troca.sql` | ============================================================ |
| `143_contas_pagar_inter.sql` | ============================================================ |
| `144_precificacao_curva_dinamica.sql` | ============================================================ |
| `145_fiscal_empresas_emitentes.sql` | ============================================================ |
| `146_fiscal_regras_fiscais.sql` | ============================================================ |
| `147_fiscal_produtos_contatos_fiscais.sql` | ============================================================ |
| `148_fiscal_add_columns.sql` | ============================================================ |
| `149_fiscal_notas_fiscais.sql` | ============================================================ |
| `150_fiscal_notas_fiscais_itens_eventos.sql` | ============================================================ |
| `151_mp_point_devices_vendedor.sql` | Migration 151: maquininhas por vendedor |
| `152_parcelas_padrao_mp.sql` | Migration 152: parcelas padrão por vendedor no Mercado Pago |
| `153_novo_fluxo_venda.sql` | Migration 153: novos campos em vendas_erp + tabela fretes_bairro |
| `154_caixa_baixas.sql` | Migration 154: Módulo de Baixa de Caixa (Dinheiro) |
| `154_quebra_percentual_sobre_pmc.sql` | ============================================================================ |
| `155_fin_gateways.sql` | Migration 155: Gateways de Pagamento |
| `155_quebra_drilldown_views.sql` | ============================================================================ |
| `156_apontamentos_servico.sql` | Migration 156: tabela de apontamentos intermediários de serviço |
| `156_precificacao_tables.sql` | ============================================================================ |
| `157_fix_trigger_preco_produto_ouro_amarelo.sql` | ============================================================ |
| `157_sync_pdv_vendas.sql` | ============================================================ |
| `158_categoria_pedras.sql` | ============================================================ |
| `158_ordens_ficha_pendente.sql` | Migration 158: ficha_pendente em ordens |
| `159_fornecedor_e_site_wordpress.sql` | ============================================================ |
| `160_seed_estoque_comercial_public.sql` | ============================================================ |
| `161_reserva_entrega_venda.sql` | ============================================================ |
| `162_fix_auditoria_ordem_1846_auto_aprovacao.sql` | ═══════════════════════════════════════════════════════════════════════════ |
| `162_produto_personalizacao.sql` | ============================================================================ |
| `163_produto_personalizacao_preco_por_letra.sql` | ============================================================================ |
| `164_sku_ap_sequence.sql` | ============================================================================ |
| `165_produto_personalizado_prefixo_pz.sql` | ============================================================================ |
| `166_produto_personalizacao_peso_por_letra.sql` | ============================================================================ |
| `167_fix_trigger_preco_produto.sql` | ============================================================================ |
| `167_sync_public_vendas_to_erp.sql` | Migration 167: Sincronizar vendas do Tiny (public.vendas) para alissonerp.vendas_erp |
| `168_user_views.sql` | ============================================================================ |
| `168_vendas_erp_desconto_aprovado.sql` | Registra quem aprovou o desconto e quando |
| `169_drop_fk_desconto_aprovado_por.sql` | Remove FK constraint que causava falha silenciosa na aprovação de desconto. |
| `169_fix_trigger_search_path.sql` | ============================================================ |
| `170_solicitacoes_desconto.sql` | ============================================================ |
| `171_produto_pedra_preco_quantidade.sql` | ============================================= |
| `172_editor_ia_historico.sql` | ============================================================ |
| `172_notificacoes_venda_id.sql` | Adiciona venda_id em notificacoes para permitir ações inline (ex: aprovar desconto) |
| `173_pedra_peso_ct.sql` | ============================================= |
| `173_tiny_sync_produtos.sql` | Migration 173: fila de sincronização produtos → Tiny |
| `174_dashboard_comercial_views.sql` | ===================================================================== |
| `175_dashboard_comercial_permissoes.sql` | ===================================================================== |
| `176_dashboard_comercial_union_erp.sql` | ===================================================================== |
| `176_estoque_comercial.sql` | Migration 176: tabelas de estoque comercial (produtos de prateleira/loja) |
| `177_api_publica.sql` | ─── Migration 177: API Pública de Produtos ──────────────────────────────────── |
| `178_financeiro_aging_source_cofre.sql` | v2.31.14 — Financeiro: aging, source, cofre ouro, unique gateway_id |
| `178_vendas_transicoes.sql` | ─── Tabela de auditoria de transições de situação ─────────────────────────── |
| `179_fin_lancamentos.sql` | ─── Tabela de lançamentos financeiros (dupla entrada) ───────────────────────── |
| `180_desconto_revalidacao.sql` | Sinaliza que um item com desconto alto foi adicionado após aprovação anterior |
| `181_financeiro_aging_source_cofre.sql` | Migration 181: Aging de contas, source em pagamentos, cofre de ouro |
| `182_fix_vw_dash_vendas_todas_pre_cutoff.sql` | ===================================================================== |
| `183_auditoria_automatica.sql` | Migration 183: Auditoria automática para todas as ordens |
| `184_backfill_auditorias_pendentes.sql` | Migration 184: Backfill — aprovar auditorias loja pendentes |
| `185_produto_imagens.sql` | ============================================================================ |
| `186_trigger_auto_auditoria_loja.sql` | 186_trigger_auto_auditoria_loja.sql |
| `186_vw_produto_imagens.sql` | ============================================================================ |
| `187_fix_vw_ordens_completa_status_cancelado.sql` | 187_fix_vw_ordens_completa_status_cancelado.sql |
| `188_trigger_cancelar_pcp_ordem.sql` | 188_trigger_cancelar_pcp_ordem.sql |
| `189_foto_peca_servico_2.sql` | ============================================================================ |
| `190_modulo_crediario.sql` | Migration 190: Módulo Crediário — VIEW + tabela de comunicações |
| `191_crediario_aging_automacao.sql` | Migration 191: Crediário Aging — Automação diária de notificações |
| `192_parametros_sistema.sql` | Migration 192: alissonerp.parametros_sistema |
| `193_fila_sync_externo.sql` | Migration 193: alissonerp.fila_sync_externo |
| `197_guard_fechamento_dist.sql` | Migration 197: Guard anti-duplicação em fechamentos_distribuicao |
| `198_par_movimentacao_returns_ids.sql` | Migration 198: fn_criar_par_movimentacao agora retorna (saida_id, entrada_id) |
| `200_fila_sync_proxima_execucao.sql` | Migration 200: adicionar proxima_execucao à fila_sync_externo |
| `backup_090_permissoes_20260324_094952.sql` | — |

</details>
