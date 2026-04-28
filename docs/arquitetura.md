# Arquitetura — fabricaAJ ERP

> 📋 Última atualização automática: 11/04/2026 — Versão: v2.19.87 <!-- Revisado 11/04/2026 -->

Sistema ERP para a Joalheria ALISSON. Stack: Next.js 16.1.6 + PostgreSQL 15 (Supabase self-hosted).
**Versão atual: v2.19.87 | Atualizado: 11/04/2026 — Integração Mercado Pago completa (Preference + Payment API PIX nativo + Point Smart), valor líquido de recebimento, estorno automático, fix Tiny offline_access, commit-then-sync no webhook**

---

## Infraestrutura

| Item         | Valor                                      |
|--------------|--------------------------------------------|
| Host DB      | 72.60.55.140:5543                          |
| Banco         | postgres                                   |
| Supabase API | https://api.alisson.api.br                 |
| GoTrue versao | v2.184.0                                  |
| Framework    | Next.js 16.1.6 (App Router, TypeScript)    |
| CSS          | Tailwind v4 (`@theme` em globals.css)      |
| Fontes       | Playfair Display, DM Sans, JetBrains Mono  |

---

## Schemas e Responsabilidades

| Schema       | Dono        | Permissao       | Descricao                                    |
|--------------|-------------|-----------------|----------------------------------------------|
| `alissonerp` | Este sistema | Leitura/Escrita | Tabelas e views do ERP de fabrica            |
| `public`     | PDV (externo)| Somente leitura | vendedores, contatos, vendas, produtos       |
| `directus`   | Directus CMS | Somente leitura | ordens, pcp, setor, deposito (legado)        |

**Regra absoluta**: nunca alterar tabelas em `public` ou `directus`. Apenas criar views no `alissonerp` que fazem JOIN com esses schemas.

---

## Conexao com o Banco

Server Components usam conexao direta via `postgres` npm (bypassa REST API do Supabase):

```ts
// src/lib/db.ts
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { ssl: false, max: 5 });
```

O cliente Supabase (`src/lib/supabase/client.ts` e `server.ts`) esta configurado com `db: { schema: "alissonerp" }` e e usado para auth e Realtime.

---

## Migrations (supabase/migrations/)

| Arquivo | Descricao |
|---------|-----------|
| `001_enums.sql` | 18 ENUMs no schema alissonerp |
| `002_tabelas_config.sql` | depositos, setores, tipos_apontamento, categorias_insumo, parametros, comissoes |
| `003_tabelas_usuarios_comercial.sql` | vendedores (view), usuarios, contatos (view), insumos |
| `004_seed_dados_iniciais.sql` | 8 depositos, 7 setores, 9 tipos, parametros, Ouro 18k |
| `005_correcao_cross_schema.sql` | Views cross-schema: vw_vendedores, vw_contatos, vw_comissoes, vw_produtos, vw_vendas, vw_user_profiles |
| `006_ordens.sql` | Tabela alissonerp.ordens (29 colunas, 8 indexes) |
| `007_pcp_auxiliares.sql` | saidas_ordem, pcp, apontamentos, transferencias, outros_insumos, itens_ordem, pedras_ordens |
| `008_distribuicao.sql` | 8 tabelas de distribuicao + FK circular ordens->distribuicoes |
| `009_estoque.sql` | movimentacoes_estoque, lancamentos_avulso, vw_saldo_estoque |
| `010_protocolo_pos_producao.sql` | protocolos, aprovacoes, preparacoes, auditorias, comentarios, notificacoes |
| `011_audit_triggers_funcoes.sql` | audit_log, fn_audit_log, fn_proteger_campos_pdv, fn_calcular_pmc, vw_quebra |
| `012_rls_basico.sql` | RLS em 13 tabelas, fn_user_role(), 27 policies |
| `013_realtime.sql` | 5 tabelas no supabase_realtime publication |
| `014_view_ordens_enriquecida.sql` | vw_ordens_completa + vw_pcp_completa com mapeamento de codigos legados |
| `015_correcoes_views.sql` | Acentuacao correta nos mapeamentos + 5 novas views de estoque/quebra do Directus |
| `016_views_detalhe_ordem.sql` | 7 views: detalhe ordem, apontamentos, estoque/ordem, transferencias, protocolos ida/volta |
| `017_auth_trigger.sql` | Trigger fn_handle_new_user (auto-popula alissonerp.usuarios ao criar auth.user), fn_user_role() retorna NULL se nao cadastrado, RLS desabilitado em tabelas de configuracao, policy usuarios_select_own |
| `018_trigger_apontamento_pcp.sql` | fn_processar_apontamento_pcp (Flow 1000: branch tipos 1-7, CE dupla-entrada, totais PCP), fn_criar_itens_ordem (Flow 1001), fn_processar_outros_insumos_pcp (Flow 1004), Flow 1005 integrado |
| `019_trigger_transferencia_saida.sql` | fn_processar_transferencia_saida (Flow 1002), fn_processar_saida_multi_insumo (Flow 1003) |
| `020_triggers_distribuicao.sql` | fn_processar_apontamento_distribuicao (Flow 1003b), fn_processar_entrada_distribuicao |
| `021_triggers_protocolo.sql` | fn_processar_aprovacao_consultora, fn_processar_preparacao_entrega, protocolo_ordens |
| `022_lancamento_avulso_compras.sql` | Flow 1006: fn_processar_lancamento_avulso (4 tipos: TA/EA/SA/Sangria), fn_calcular_item_compra, fn_concluir_compra, fn_bloquear_compra, tabelas compras + itens_compra |
| `023_storage_protocolo.sql` | Bucket protocolo-fotos (privado, max 10MB), RLS storage, colunas foto_url + foto_base64 em protocolo_fotos |
| `024_financeiro.sql` | contas_pagar, contas_receber, fin_extratos_bancarios (OFX via n8n), fin_lancamentos_bancarios (fitid UNIQUE), fin_conciliacoes, vw_resumo_financeiro, vw_vendas_completa |
| `025_webhooks_dashboard.sql` | webhook_config (9 webhooks n8n), webhook_log, fn_disparar_webhook, vw_producao_mensal, vw_produtividade_ourives, vw_kpis_gerais, vw_ordens_por_tipo |
| `026_auditoria_completa.sql` | Modulo Auditoria: +14 colunas em auditorias, fn_processar_saida_ordem (insere auditoria pendente com PMC), fn_processar_auditoria (aprovado→data_conclusao; reprovado→ordem retrabalho tipo=reparo + PCP novas_ordens), vw_auditorias_completa, vw_dashboard_auditoria, vw_ordens_prontas_volta, RLS, indexes |
| `027_trigger_ponte_pdv.sql` | TEMPORÁRIO: trg_ponte_ordens (AFTER INSERT OR UPDATE em directus.ordens) copia situacao='2' para alissonerp via UPSERT em directus_ordem_id. Campos protegidos (tipo_ordem, peso_metal_negociado, etc) apenas no INSERT. Remover: `DROP TRIGGER trg_ponte_ordens ON directus.ordens;` |
| `028_auditoria_dupla.sql` | Auditoria Dupla (Loja + Fábrica): UNIQUE INDEX parcial `WHERE situacao != 'reprovado'`, cria auditoria Loja na ponte PDV, auditoria Fábrica via trigger saida_ordem |
| `029_corrigir_enum_tipo_ordem.sql` | Corrige enum_tipo_ordem: 7 valores reais do PDV (servico/fabricacao/reposicao_venda/reposicao_loja/compra_fornecedor/garantia/servico_interno), migra 430 ordens, recria 6 views |
| `030_ficha_tecnica_view.sql` | vw_fichas_tecnicas: JOIN alissonerp.ordens → directus.ordens → directus.ficha_tecnica_ordem. Atualiza fn_ponte para incluir ficha_tecnica_id no INSERT |
| `031_timeline_ordem.sql` | vw_timeline_ordem: 8 eventos por ordem (LATERAL joins, 1 row/passo sem duplicatas) com status concluido/em_andamento/pendente baseado em dados reais do banco |
| `032_grants_views.sql` | **CRÍTICO**: GRANT USAGE ON SCHEMA alissonerp + SELECT em todas as views para anon+authenticated + SELECT/INSERT/UPDATE em tabelas operacionais para authenticated + USAGE em sequences. Sem isso, todo acesso client-side (Supabase anon key) falha silenciosamente |
| `033_ficha_tecnica_labels.sql` | Recria vw_fichas_tecnicas adicionando colunas `*_label` para todos os campos numéricos (modelo_1/2, modelo_interno_1/2, tipo_fonte_1/2, tipo_elo, tipo_fecho, modelo_pingente). Ver tabela de mapeamento abaixo |
| `034_numero_pedido.sql` | Adiciona `numero_pedido` nas views `vw_auditorias_completa` e `vw_ordens_completa`. Exibido na tabela e modal de auditoria + tabela de ordens |
| `035_numero_pedido_na_tabela.sql` | Adiciona coluna `numero_pedido TEXT` em `alissonerp.ordens`, atualiza trigger ponte com lookup (usou public.pedidos — incorreto, corrigido em 036) |
| `036_fix_numero_pedido_vendas.sql` | **Corrige 035**: lookup de `numero_pedido` era em `public.pedidos` (tabela errada). A tabela correta é `public.vendas` (`v.id = o.pedido_id`). Reescreve trigger ponte + backfill completo (378/378 ordens). C-1042→#14367, C-1044→#14369 |
| `037_auditoria_data_entrega.sql` | Adiciona `data_entrega` (de `alissonerp.ordens`) na `vw_auditorias_completa`. Exibida no modal de auditoria loja. |
| `039_auditoria_peso_metal_externo.sql` | Adiciona `peso_metal_externo` (de `alissonerp.ordens`) na `vw_auditorias_completa`. Exibido no modal auditoria loja quando > 0. |
| `040_servico_rota_protocolo.sql` | Serviço SEMPRE rota=protocolo. Retrabalhos (id_ordem_relacionada IS NOT NULL) ficam rota=pcp intencionalmente. |
| `041_protocolo_foto_rastreio_views.sql` | Colunas de foto em protocolos; protocolo_fotos.arquivo_id nullable; vw_ordens_prontas_ida exclui ordens em protocolo ativo. |
| `042` | ⚠️ SEM arquivo .sql — aplicado diretamente ao banco. Conteúdo: roles motoboy + quebra_operador inicial. |
| `043_apontamento_foto_balanca.sql` | ADD `foto_balanca` em `apontamentos_pcp`. Cria bucket `apontamento-fotos`. |
| `044_configuracoes_ia.sql` | CREATE `configuracoes_sistema` + `configuracoes_secrets` (config IA multi-provedor). |
| `045_fix_configuracoes_secrets.sql` | Fix: garante que `configuracoes_secrets` foi criada (044 pode não ter rodado completamente). |
| `046_depositos_setores_fix.sql` | Fix `vw_saldo_pote`: agrega saldo SÓ do depósito ID=1 (Almoxarifado Central). Adiciona `deposito_id FK` em `setores`. |
| `047_distribuicao_deposito.sql` | ADD `deposito_id`, `setor_id` (FKs) em `distribuicoes`. Kanban C1: 2 colunas + modal criar + detalhe inline. |
| `048_pcp_deposito_id.sql` | ADD `deposito_id` em `pcp` — rastreia em qual operador a ordem está. Preenchido ao criar distribuição. |
| `049_apontamentos_distribuicao_foto.sql` | ADD `foto_balanca` em `apontamentos_distribuicao` (validação IA). |
| `050_fechamentos_distribuicao_foto.sql` | ADD `foto_balanca` em `fechamentos_distribuicao` (validação IA na saída por ordem). |
| `051_distribuicao_ordens_saida.sql` | ADD campos de saída em `distribuicao_ordens`. CREATE `detalhe_saida_pedras` (detalhamento de pedras na saída). |
| `052_fix_vw_detalhe_pote.sql` | Fix `vw_detalhe_pote`: `saldo_real` agora é APENAS do Almoxarifado Central (deposito_id=1). Garante que catálogo de insumos mostre saldo disponível, não saldo em produção. |
| `053_pcp_dist_totais.sql` | ADD `dist_ouro_real`, `dist_pedras_qtd`, `dist_pedras_g`, `dist_quebra` em `pcp`. |
| `054_distribuicoes_lote_quebra.sql` | ADD `ouro_entregue`, `ouro_pecas`, `quebra_lote` em `distribuicoes` (balanço do lote na conclusão). |
| `055_produtos_campos_pedra.sql` | ADD `tem_pedra_preciosa`, `preco_pedras`, `preco_total_sync` em `public.produtos`. Popula 1.138 produtos com pedra preciosa. NÃO altera triggers existentes. |
| `056_produto_composicao.sql` | CREATE `alissonerp.produto_composicao` (BOM): `produto_id BIGINT` → `public.produtos.id_produto`, `insumo_id INT` → `alissonerp.insumos.id`, tipo metal/pedra/outro. |
| `057_markup_pedras.sql` | CREATE `alissonerp.markup_pedras`: 5 faixas de markup por tamanho em quilates (0–0.03ct→3×, …, >1ct→1.5×). Configurável via UI. |
| `058_precificacao_config.sql` | SEED `alissonerp.configuracoes_sistema`: chaves `preco_limiar_subir` (2%), `preco_limiar_descer` (5%), `preco_arredondamento` (dezena). Usadas pela página /precificacao > Regras. |
| `059_markup_alteracoes.sql` | CREATE `alissonerp.markup_alteracoes`: fila de aprovação de mudanças de markup. Colunas: tipo (ouro/pedra), faixa_id, faixa_nome, markup_anterior, markup_novo, produtos_afetados, simulacao_json JSONB, status (pendente/aprovado/rejeitado), criado_por UUID, aprovado_por UUID. Não aplica markup — só armazena intenção + simulação. |
| `060_produtos_campos_erp.sql` | ADD campos ERP em `public.produtos` (campos de medidas/observação). NÃO altera triggers existentes (14.812 registros). |
| `061_insumos_preco_compra.sql` | ADD colunas de rastreamento do último preço de compra em `alissonerp.insumos`. |
| `062_composicao_medidas_metal.sql` | ADD campos de medidas do produto (ficha técnica) em `public.produtos`. Campos fixos do produto, não do BOM. |
| `063_erp_produtos.sql` | CREATE `alissonerp.erp_produtos`: tabela pai/variação por SKU. Regra: SKU com "-" (exceto prefixo AJ) = variação. |
| `064_seq_produto_id.sql` | CREATE sequência para IDs de produtos criados internamente (public.produtos.id_produto não tem default — vem do Tiny ERP). |
| `065_ordens_eh_teste.sql` | ADD `eh_teste BOOLEAN` em `alissonerp.ordens`. Badge "🧪 TESTE" no Kanban. |
| `066_quebra_operador.sql` | CREATE `alissonerp.quebra_operador` + views `vw_quebra_operadores`, `vw_saldo_pote_ouro`, `vw_ouro_em_producao`. Dashboard ouro fábrica. |
| `067_role_permissoes.sql` | CREATE `alissonerp.role_permissoes` (módulo, leitura, escrita). APIs: /api/configuracoes/roles, /api/configuracoes/permissoes, /api/user/permissoes. |
| `068_role_varchar.sql` | MIGRAR `usuarios.role` de `enum_role` → `VARCHAR(50)`. DROP TYPE enum_role CASCADE (removeu fn_user_role + 26 RLS policies). RECRIAR fn_user_role, fn_handle_new_user, 26 policies. ADD `role_permissoes.ativo`. CREATE `alissonerp.roles` (seed 10 roles). |
| `069_comentarios_notificacoes.sql` | CREATE `alissonerp.comentarios_ordem` (tabela nova para comentários). RENAME `notificacoes.user_id` → `usuario_id`. ADD colunas em notificacoes (link, ordem_id, comentario_id, remetente_id, lida_em). ADD realtime. |
| `070_rls_comentarios_notificacoes.sql` | RLS para comentarios_ordem + notificacoes. |
| `071_comentarios_foto_excluido.sql` | ADD em `comentarios_ordem`: texto_original, excluido, excluido_em, excluido_por, `foto_path`. ADD `alissonerp.ordens.fotos_paths TEXT[]`. CREATE bucket `ordem-fotos` (privado, 10MB, inclui heic). RLS para storage.objects bucket='ordem-fotos'. |
| `072_user_profiles_unique_avatar.sql` | ADD `public.user_profiles.avatar_url IF NOT EXISTS`. ENSURE UNIQUE constraint em `id_user` (necessária para ON CONFLICT no upsert do avatar). |
| `073_criacao_ordens_enum_servico.sql` | RENAME enum value `servico` → `servico_venda` em `enum_tipo_ordem` (105 ordens atualizadas). ADD `servico_loja` ao enum (oculto no frontend). ADD em `alissonerp.ordens`: `origem VARCHAR(20) DEFAULT 'erp' NOT NULL`, `foto_peca_servico TEXT`, `peso_peca_servico NUMERIC(10,2)`, `video_observacao TEXT`. ADD em `alissonerp.usuarios`: `tipos_ordem_permitidos JSONB DEFAULT '[]'`. CREATE `alissonerp.itens_ordem` (id, ordem_id FK, produto_id BIGINT FK, nome_produto, sku, quantidade, peso_estimado, observacao, created_at). CREATE bucket `ordem-videos` (100MB, mp4/webm/quicktime/avi). RECREATE views: vw_ordens_completa, vw_ordens_por_tipo, vw_ordem_detalhe. UPDATE trigger ponte: "1" → 'servico_venda'. |
| `074_itens_ordem_erp_e_permissoes.sql` | CREATE `alissonerp.itens_ordem_erp` + permissões associadas. |
| `075_detalhes_ordem.sql` | ADD `alissonerp.ordens.detalhes_ordem TEXT` — campo texto livre por ordem. UPDATE 443 ordens Directus com dados legados. |
| `076_insumos_edicao_completa.sql` | ADD `alissonerp.insumos.foto TEXT` + `observacao TEXT`. CREATE bucket `insumo-fotos` (público, 10MB). InsumoEditDrawer: foto, fornecedor_id, peso_pedra, ativo. Recria `vw_detalhe_pote` com colunas novas. |
| `077_saida_sem_peso.sql` | ADD `distribuicao_ordens.sem_peso BOOLEAN` + `justificativa_sem_peso TEXT`. Dropdown de motivos no frontend. |
| `078_saida_metal_externo.sql` | ADD `alissonerp.saidas_ordem.metal_externo NUMERIC DEFAULT 0`. Fórmula PMC atualizada: `pmc = peso_ouro_real - total_outros - metal_externo`. `total_metal=0` → sem quebra, sem CE (peça do cliente). |
| `079_marcadores_pedras.sql` | ADD marcadores `SP` (Saída Pedra consumida) + `QBP` (Quebra Pedra) ao enum `controle_estoque`. Baixa definitiva de pedras na saída PCP. |
| `080_sync_user_profiles_id_user.sql` | Sync `public.user_profiles.id_user` — garante UNIQUE constraint necessária para ON CONFLICT. |
| `081_estorno_distribuicao.sql` | CREATE `alissonerp.estornos_distribuicao` (distribuicao_id INT FK, ordem_id INT NULLABLE FK, motivo TEXT, justificativa TEXT, estornado_por UUID, dados_revertidos JSONB). |
| `082_estorno_lote_distribuicao.sql` | ADD `estornos_distribuicao.ordem_id` como NULLABLE (era NOT NULL). Endpoint `POST /api/distribuicao/[id]/estorno-lote` com 5 fases atômicas. |
| `083_transferencia_avulsa_destino.sql` | ADD `lancamentos.deposito_destino_id INT FK` + trigger atualizado. Transferência avulsa agora registra depósito de destino. |
| `084_purificacao.sql` | Módulo Purificação de Ouro (18k→24k). CREATE `alissonerp.purificacoes`. |
| `085_ligacao.sql` | Módulo Ligação (24k→18k). CREATE `alissonerp.ligacoes`, `alissonerp.tipos_liga`. |
| `086_ligacao_pureza.sql` | ADD `pureza NUMERIC(5,2)` em `alissonerp.ligacoes`. |
| `086_wa_assistant.sql` | WhatsApp Assistant — CREATE tabelas `wa_assistants`, `wa_conversations`, `wa_messages`, `wa_kb_articles`. |
| `087_wa_kb_seed.sql` | WhatsApp Assistant — seed knowledge base inicial. |
| `088_user_profiles_phone.sql` | ADD `phone VARCHAR(20)` em `public.user_profiles`. Vinculação WhatsApp → usuário ERP. |
| `089_permissoes_purificacao_ligacao.sql` | CREATE `alissonerp.permissoes_usuario` (usuario_id, acao, permitido). 5 ações granulares: abrir/concluir purificação, abrir/concluir ligação, editar_teor_ligação. |
| `090_editar_teor_ligacao.sql` | Seed permissão `editar_teor_ligacao` para admin/desenvolvedor. |
| `091_fichas_tecnicas_produto.sql` | CREATE `alissonerp.fichas_tecnicas_produto` (ficha técnica por produto com IA). CREATE bucket `produto-3d`. ADD permissão `upload_modelo_3d`. |
| `092_modulo_service.sql` | Módulo Service v2.13.0. ADD `alissonerp.usuarios.is_operador_service BOOLEAN`. CREATE `alissonerp.servicos` (id, ordem_id, pcp_id, operador_id, tentativa, pesos, solda, pedras, status, fotos, timestamps, motivo_reprovacao). SEED `configuracoes_sistema`: `operador_servico_padrao`, `service_tipos_ordem`. CREATE TRIGGER `trg_criar_servico_from_pcp` (AFTER INSERT pcp → fn_criar_servico_from_pcp: cria servico automático para servico_venda e garantia). CREATE TRIGGER `trg_calcular_peso_pedra` (BEFORE INSERT/UPDATE insumos → fn_calcular_peso_pedra_gramas: peso_pedra = peso_pedra_ct × 0.2). ADD colunas `peso_pedra_ct NUMERIC`, `sku_interno TEXT` em insumos. CREATE bucket `service-fotos`. GRANTS. | <!-- Revisado 27/03/2026 -->
| `093_tipo_protocolo.sql` | Sprint protocolo tipos. ADD `protocolos.tipo_protocolo VARCHAR(20) DEFAULT 'fabrica'`. ADD `usuarios.tipos_protocolo_permitidos JSONB DEFAULT '[]'`. Backfill: 20 protocolos service, 3 fabrica. Seed permissões: motoboy→["fabrica"], gerente→["fabrica","service"], consultora→["service"]. |
| `094_locais_estoque.sql` | Sprint 1 v2.14.0. CREATE `alissonerp.locais_estoque` (id, nome, ativo). SEED: Fábrica=1, Loja=2. ADD `depositos.local_estoque_id FK`. Backfill: todos os 8 depósitos → local_id=1. ADD `movimentacoes_estoque.local_estoque_id FK` (nullable, dados históricos). INDEX `idx_movimentacoes_local_estoque`. |
| `095_pedras_quilates_ct.sql` | Sprint 1 v2.14.0. ADD `pcp.total_pedras_ct NUMERIC(10,4)`. ADD `apontamentos_pcp.peso_ct + peso_g_pedra NUMERIC(10,4)`. ADD `distribuicao_saida_pedras.peso_ct_utilizado NUMERIC(10,4)`. Backfill `insumos.peso_pedra_ct` onde null (peso_pedra/0.2) para categoria_id=2. NOTA: insumos.peso_pedra_ct já existia (migration 092). |
| `096_compras_expandidas.sql` | Sprint 1 v2.14.0. ADD compras: `local_destino_id FK`, `numero_nf`, `data_compra`, `data_recebimento`, `recebido_por UUID`. ADD itens_compra: `unidade`, `peso_ct`, `qtd_pecas`, `custo_por_ct`, `lote_referencia`, `observacao`. 3 indexes. |
| `097_views_saldo_multilocal_ct.sql` | Sprint 1 v2.14.0. Recria `vw_saldo_estoque` com `local_estoque_id` no GROUP BY. Recria `vw_detalhe_pote` com `saldo_ct + peso_pedra_ct`. Recria `vw_saldo_pote` (dependente). CREATE `vw_saldo_por_local` (saldo por local_estoque + saldo_ct para pedras). |
| `098_triggers_pedras_ct_compras.sql` | Sprint 2 v2.14.0. UPDATE `fn_criar_par_movimentacao` (add `p_local_id` 10º param). UPDATE `fn_processar_apontamento_pcp` (tipos 3/6 com ct; acumula `pcp.total_pedras_ct`; local=1). UPDATE `fn_processar_saida_ordem` (SP pedras ÷0.2; local=1). UPDATE `fn_calcular_item_compra` (pedras: peso_ct×custo_por_ct). UPDATE `fn_concluir_compra` (CE por categoria + local_destino_id + guard status). UPDATE `fn_processar_apontamento_dist` (tipos 3/6 ct; `distribuicoes.total_pedras_ct`; local=1). UPDATE `fn_processar_fechamento_dist` (acumula `pcp.total_pedras_ct`; TEDD local=1). ADD `distribuicoes.total_pedras_ct`, `apontamentos_distribuicao.peso_ct`. |
| `099_data_entrega_fabricacao.sql` | Função utilitária `fn_adicionar_dias_uteis` + trigger ponte calcula data_entrega=+10 dias úteis para ordens fabricacao. |
| `100_tipos_servico.sql` | v2.15.0. CREATE `alissonerp.tipos_servico` (id SERIAL, nome TEXT, ativo BOOLEAN, created_at). SEED 5 tipos: Solda Laser, Cravação Manual, Acabamento e polimento, Ajuste Manual, Solda e Limpeza. ADD `alissonerp.ordens.tipos_servico_ids INTEGER[]`. GRANTS authenticated/anon. |
| `101_fix_triggers_pedras_local.sql` | v2.14.1. Fix peso pedras (p_peso_gramas param), local_estoque_id em fn_processar_transferencia e fn_processar_lancamento_avulso. |
| `102_fix_local_estoque_functions.sql` | v2.14.1. COALESCE(p_local_id, 1) em fn_criar_par_movimentacao. local_estoque_id=1 em fn_processar_outros_insumos. |
| `103_transferencia_service.sql` | v2.15.1. ADD tipo_transferencia, protocolo_id, deposito_origem_id em transferencias_ordem. ADD transferencia_service_id FK em servicos. |
| `104_modulo_comercial_base.sql` | v2.16.0. CREATE faixas_comissao (31 faixas), vendas_erp, itens_venda_erp, pagamentos_venda, metas_vendedoras. Triggers totais + blindagem. |
| `105_comercial_view_video.sql` | v2.16.0. ADD video_obs_interna em vendas_erp. Recria vw_vendas_erp_completa. |
| `106_vendas_token_compartilhamento.sql` | v2.16.0. ADD token_compartilhamento UUID em vendas_erp (UNIQUE). |
| `107_estoque_comercial.sql` | v2.17.0. CREATE estoque_comercial_config, movimentacoes_estoque_comercial, vw_saldo_estoque_comercial, vw_estoque_comercial_com_alerta. |
| `108_ordens_garantia.sql` | v2.17.0. ADD venda_id e venda_item_ids em ordens. INSERT "Outros" em tipos_servico. |
| `109_sync_public_vendas.sql` | v2.17.0. ADD public_venda_id FK. Migra 14.301 vendas históricas + 75.956 itens. 3 triggers sync cross-schema. |
| `110_fix_trigger_sync_exception.sql` | v2.17.0. EXCEPTION WHEN OTHERS em sync functions (nunca bloqueia sistema externo). |
| `111_estoque_comercial_auto_venda.sql` | v2.17.0. 4 triggers: baixa automática na venda, reversão no delete, estorno no cancelamento, ajuste na atualização. |
| `111_fichas_tecnicas_erp.sql` | v2.17.0. CREATE fichas_tecnicas (ordem_id, tipo_item, dados JSONB). Fichas editáveis no ERP. |
| `112_modulo_tarefas.sql` | v2.17.0. CREATE tarefas + comentarios_tarefa. Status: pendente/em_andamento/concluida/cancelada. |
| `113_financeiro_auto.sql` | v2.17.0. 3 triggers: venda→conta_receber, cancelar venda→cancelar CR, compra→conta_pagar. ADD venda_erp_id/fornecedor_nome/cliente_nome. |
| `114_blindar_vendas_fechadas.sql` | v2.17.0. fn_proteger_itens_venda_fechada + fn_proteger_venda_fechada (bloqueia edição após confirmado/concluido). |
| `115_fix_sync_triggers.sql` | v2.18.1. Fix UPDATE trigger para não zerar total_venda. Respeita vendas fechadas. |
| `116_blindar_itens_venda_public.sql` | v2.17.0. fn_proteger_preco_itens_venda + fn_proteger_delete_itens_venda (bloqueia cascata de repricing). |
| `117_fix_sync_itens_faltantes.sql` | v2.18.1. fn_sync_venda_update_from_public re-sincroniza itens faltantes (race condition). |
| `118_sync_bypass_blindagem.sql` | v2.18.4. current_setting('app.sync_ativo') bypass para sync functions. |
| `119_tarefas_avancadas.sql` | v2.19.0. ADD posicao (kanban). CREATE aprovacoes_tarefa, automacoes_tarefa, automacoes_execucoes. |
| `120_modulo_orcamento.sql` | v2.19.35. CREATE config_orcamento, orcamento_fichas_tecnicas, orcamentos. |
| `121_fix_saldo_ct_formula.sql` | v2.19.1. Fix saldo_ct = gramas/0.2. ADD quantidade em views. |
| `122_views_local_estoque_display.sql` | v2.19.4. ADD local_estoque_id/nome em vw_movimentacoes_directus e vw_estoque_directus_saldo. |
| `123_lancamento_avulso_local_estoque.sql` | v2.19.7. ADD local_estoque_id em lancamentos_avulso. Update fn_processar_lancamento_avulso. |
| `124_is_transportador.sql` | v2.19.8. ADD is_transportador BOOLEAN em usuarios. Backfill motoboys existentes. |
| `125_fix_timeline_proto_duplicado.sql` | v2.19.29. Recria vw_timeline_ordem com LATERAL LIMIT 1 (evita duplicatas protocolo). |
| `126_orcamento_pedras_config.sql` | v2.19.30. ADD stone_markup, stone_prices JSONB em config_orcamento. ADD pedras_detalhadas em orcamento_fichas_tecnicas. |
| `127_orcamento_cliente_ordem.sql` | v2.19.39. ADD cliente_id FK e ordem_gerada_id FK em orcamentos. |
| `128_orcamento_foto_3d.sql` | v2.19.54. ADD foto_3d TEXT em orcamentos. |
| `129_orcamento_venda_ordem.sql` | v2.19.57. ADD venda_gerada_id em orcamentos. ADD orcamento_id em vendas_erp. |
| `130_endereco_entrega_venda.sql` | v2.19.60. ADD 7 colunas endereço entrega em vendas_erp. |
| `130_itens_venda_produto_nullable.sql` | v2.19.62. produto_id NULLABLE em itens_venda_erp (itens customizados). |
| `131_orcamento_par_aliancas.sql` | v2.19.65. Par de alianças: ADD ficha_tecnica_2_id em orcamentos. |
| `132_orcamento_validacao_zirconia.sql` | v2.19.66. ADD calibracao JSONB em config_orcamento (validações físicas). Zircônia em stone_prices. |
| `133_notif_aguardando_resposta.sql` | v2.19.87. Flag aguardando_resposta em notificacoes (módulo em progresso). |
| `134_notif_alarme_snooze.sql` | v2.19.87. Snooze de alarmes em notificacoes (módulo em progresso). |
| `135_mercado_pago_integracao.sql` | v2.19.72. **Integração MP base**: CREATE `mp_point_devices` (cadastro maquininhas), `fn_cr_marcar_pago_mp(p_venda_id)`, índice `idx_pagamentos_venda_gateway_id`, entry `mercado-pago-payment` em webhook_config. |
| `136_unaccent_extension.sql` | v2.19.71. `CREATE EXTENSION unaccent` (busca insensível a acentos em /ordens e /pcp). |
| `137_pagamentos_valor_liquido.sql` | v2.19.85. **Valor líquido MP**: ADD `valor_liquido NUMERIC(12,2)` e `taxas_mp NUMERIC(12,2)` em `pagamentos_venda`. Fix retroativo JSONB double-encoded (15 rows). `fn_resumo_recebido_mp(p_inicio, p_fim)` pra relatórios. |

---

## Módulo Service (v2.13.0) <!-- Revisado 27/03/2026 -->

### Páginas `/service` e `/service-painel`

**`/service`** — App dark theme para operadores service (requer `is_operador_service=true`)
**`/service-painel`** — Painel gerente com KPIs (requer ROLES_SERVICE_PANEL)

### Flag `is_operador_service`
```
Tabela: alissonerp.usuarios.is_operador_service BOOLEAN DEFAULT false
NÃO é role — qualquer role pode ter a flag ativa
useAuth() retorna isOperadorService via /api/user/permissoes
Sidebar: item "Service" aparece ANTES dos grupos (standalone) quando isOperadorService=true
Sidebar: item "Painel Service" aparece dentro do grupo PRODUÇÃO (após Purificação) para ROLES_SERVICE_PANEL
```

### DashboardShell e ServiceLayout
```
DashboardShell.tsx detecta pathname.startsWith('/service') → usa ServiceLayout (dark theme)
Isso afeta /service e /service-painel — ambos têm layout escuro
```

### Fluxo automático (migration 092)
```
PCP inserido para servico_venda ou garantia
  → TRIGGER trg_criar_servico_from_pcp (AFTER INSERT pcp)
  → fn_criar_servico_from_pcp():
      1. Busca tipo_ordem e peso_peca_servico da ordem
      2. Verifica se tipo está em configuracoes_sistema.service_tipos_ordem
      3. Busca operador_servico_padrao (deposito_id)
      4. INSERT alissonerp.servicos (status='em_servico')
      5. Auto-atribui PCP ao operador padrão (se pcp.deposito_id = NULL)
```

### Sidebar — grupo PRODUÇÃO (fix 27/03/2026)
```
ANTES: Painel Service aparecia como item solto (via serviceExtras hardcoded)
DEPOIS: Painel Service dentro do accordion PRODUÇÃO

Solução em Sidebar.tsx:
  modulosEfetivos = [...modulos_leitura, 'service_painel'] quando:
    - role está em ROLES_SERVICE_PANEL
    - 'service_painel' não veio do banco (banco pode não ter o módulo)
  getMenuGroupsForModulos(modulosEfetivos) → Produção inclui Painel Service

permissions.ts: MENU_GROUPS['Produção'] = [dashboard-fabrica, ordens, pcp, distribuicao, purificacao, service-painel]
```

### APIs Service
```
GET  /api/service/pendentes       — ordens aguardando (status=aguardando)
POST /api/service/receber         — operador recebe peça (foto obrigatória)
GET  /api/service/meus            — serviços em_servico do operador logado
GET  /api/service/[id]            — detalhe completo
POST /api/service/[id]/concluir   — finaliza serviço (peso_saida, foto, solda, pedras)
POST /api/service/[id]/transferir — transfere para outro operador
GET  /api/service/solda-saldo     — saldo de solda do operador
GET  /api/service/painel          — painel gerente (ROLES_SERVICE_PANEL)
GET  /api/service/concluidos      — histórico
GET  /api/service/operadores      — operadores service ativos
GET  /api/service/pedras          — pedras disponíveis no estoque do operador
POST /api/service/carregar-solda  — registra carregamento de solda
```

### Pitfalls específicos do Service
```
⚠️ câmera HTTP vs HTTPS:
   navigator.mediaDevices é undefined em HTTP (não-localhost)
   ServiceCamera.tsx usa fallback: <input type="file" accept="image/*" capture="environment">
   SEMPRE testar em HTTPS em produção

⚠️ valor::jsonb (configuracoes_sistema):
   configuracoes_sistema.valor é TEXT — SEMPRE usar ::jsonb ao comparar com JSONB
   Correto: WHERE valor::jsonb ? 'servico_venda'
   Errado:  WHERE valor = '["servico_venda"]'

⚠️ Quilates → gramas:
   1 quilate = 0.200 gramas (não 0.2 arredondado — usar ct × 0.2 exato)
   TRIGGER trg_calcular_peso_pedra → fn_calcular_peso_pedra_gramas
   Frontend exibe pedras em ct (quilates), backend armazena gramas em peso_pedra
```

---

## Módulo de Purificação e Ligação (v2.10.0)

### Página `/purificacao` (roles: admin, desenvolvedor, gerente_fabrica + permissões granulares)

2 abas:
1. **Purificação (18k→24k)** — transforma ouro 18k bruto em ouro 24k fino
2. **Ligação (24k→18k)** — adiciona liga metálica ao ouro 24k para criar ouro 18k

### Permissões granulares (5 ações):
- `abrir_purificacao`, `concluir_purificacao`, `abrir_ligacao`, `concluir_ligacao`, `editar_teor_ligacao`
- Verificadas via `src/lib/permissoes.ts` → `temPermissao(userId, acao, role)`
- Admin/dev sempre têm acesso (fullAccess)
- Configurável em `/configuracoes` aba Usuários

### Componentes:
- `src/app/(dashboard)/purificacao/PurificacaoClient.tsx`
- `src/app/(dashboard)/purificacao/LigacaoTab.tsx`

### APIs:
```
GET/POST  /api/purificacao              — lista/cria purificação
GET/PATCH /api/purificacao/[id]         — detalhe/atualiza purificação
GET/POST  /api/purificacao/teores       — lista/cria teores
PATCH     /api/purificacao/teores/[id]  — edita teor
GET/POST  /api/purificacao/liga-tipos   — lista/cria tipos de liga
PATCH     /api/purificacao/liga-tipos/[id] — edita tipo de liga
GET/POST  /api/purificacao/ligacao      — lista/cria ligação
GET/PATCH /api/purificacao/ligacao/[id] — detalhe/atualiza ligação
```

---

## Módulo de Precificação (P1/P3)

### Página `/precificacao` (roles: admin, desenvolvedor, gerente_loja)

5 abas:
1. **Markup Ouro** — tabela de `public."categoria_precificação"` (IDs 102-110). Botão editar abre ModalSimulacao (aprovação obrigatória).
2. **Markup Pedras** — CRUD em `alissonerp.markup_pedras`. Botão editar abre ModalSimulacao com opção "Salvar Direto" OU "Enviar pra Aprovação".
3. **Cotações** — cards de ouro 24K, ouro 18K (×0.75), dólar, fator. Fonte: `public.parametros`.
4. **Regras** — limiares de atualização de preço salvos em `configuracoes_sistema`.
5. **Pendentes** — lista `markup_alteracoes` status=pendente. Badge vermelho no tab. Botões Aprovar/Rejeitar (implementação real em P3.3).

### Fluxo de Simulação (P3.2)
```
1. Usuário clica ✏️ numa faixa
2. ModalSimulacao abre com markup_anterior preenchido
3. Usuário digita markup_novo → clica "Simular Impacto"
4. POST /api/precificacao/simular → calcula preços SEM aplicar
   - Ouro: custo_na_cotacao × markup_novo (arredondado)
   - Pedras: preco_compra_usd × dollar × markup_novo × qtd
5. Cards stats: afetados, variação média/min/max, sobem, descem
6. Preview tabela top 20 produtos com antes/depois
7. "Exportar CSV" → download client-side
8. "Enviar pra Aprovação" → POST /api/precificacao/solicitar-aprovacao
   → INSERT markup_alteracoes status='pendente'
   → Badge +1 na aba Pendentes
9. Aprovação real (P3.3): outro admin aprova → aplica markup
```

### Regra quem não pode aprovar:
Quem CRIOU a alteração NÃO pode APROVAR. Verificado via `criado_por === currentUserId` no frontend e será validado no backend em P3.3.

### Fórmula de custo de pedras (lib/recalcular-preco-pedras.ts)
```
custo_pedra = preco_compra_usd × cotacao_dolar × markup_faixa × quantidade
preco_pedras = Σ custo_pedras
preco_total_sync = preco_sync (ouro, trigger) + preco_pedras
```
Chamada após INSERT/UPDATE/DELETE em `produto_composicao`.
NÃO recalcula `preco_sync` — isso é EXCLUSIVO do trigger `trigger_atualizar_preco_produto`.

### Tabela markup_pedras
```
Colunas: id, nome, tamanho_min, tamanho_max, unidade (ct/mm), markup, ativo
Lookup: WHERE tamanho_min <= :tamanho AND tamanho_max > :tamanho AND ativo = true
Fallback: faixa mais próxima pelo tamanho_min (maior menor ou menor disponível)
```

---

## Módulo de Produtos (P2)

### Página `/produtos` (P2.1 — roles: admin, desenvolvedor, gerente_loja)

Listagem paginada (50/pág) de `public.produtos` com:
- Busca por nome ou SKU
- Filtros: tipo_metal, tem_pedra_preciosa, situacao (A/I/todos)
- Ordenação por: nome, sku, preco_sync, diferenca_percentual, preco_tiny, peso_precificado
- Colunas: SKU, Nome (+ badge 💎 se tem_pedra_preciosa), Metal, Peso, Situação, Preço Sync, Preço Tiny, Δ%
- Variação Δ%: +% vermelho (subiu), -% verde (desceu), 0 cinza
- Clique na linha → abre ProdutoDrawer

### Drawer de Produto (P2.2)

Componente `src/components/produtos/ProdutoDrawer.tsx` (w-[480px], slide from right):

**Seções:**
1. **Dados Básicos** — nome, sku, metal, situação, referência, categoria (readonly)
2. **Precificação** — peso_precificado, preco_tiny, preco_sync, preco_pedras, preco_total_sync, diferenca_percentual (readonly — calculado por triggers)
3. **Dados ERP** — `tem_pedra_preciosa` (toggle), `observacao_erp` (textarea) — campos editáveis via PATCH /api/produtos/[id]
4. **Composição (BOM)** — lista `alissonerp.produto_composicao` com tipo, insumo, qtd, tamanho, preço USD — add/edit/remove inline
5. **Ficha Técnica** — placeholder (readonly, remete à tela de Ordens)

### Endpoints usados

```
GET  /api/produtos                           — listagem com filtros + paginação
GET  /api/produtos/[id]                      — detalhe + composicao[]
PATCH /api/produtos/[id]                     — campos editáveis: tem_pedra_preciosa, observacao_erp
GET  /api/produtos/[id]/composicao           — lista BOM
POST /api/produtos/[id]/composicao           — upsert item BOM
PATCH /api/produtos/[id]/composicao/[itemId] — editar item BOM
DELETE /api/produtos/[id]/composicao/[itemId]— remover item BOM
GET  /api/produtos/insumos?categoria_id=N    — lista insumos para dropdown do BOM form
GET  /api/produtos/[id]/variacoes           — variações ativas de produto pai (reposição loja)
```

### Sidebar

Entrada "Produtos" (ícone Tag) no grupo "Comercial":
Comercial → Vendas, Financeiro, **Produtos**, Precificação

Roles com acesso: `desenvolvedor`, `admin`, `gerente_loja`

---

### Mapeamento Ficha Técnica (Migration 033)

Campos numéricos de `directus.ficha_tecnica_ordem` mapeados para labels na `vw_fichas_tecnicas`:

| Campo(s) | Valores | Exemplo |
|----------|---------|---------|
| `modelo_1`, `modelo_2` | 1–14 (Safira, Esmeralda, Cristal...) | `"2"` → `"Esmeralda (Boleada Lisa)"` |
| `modelo_interno_1`, `modelo_interno_2` | 2=Confort, 3=Reta | `"2"` → `"Confort"` |
| `tipo_fonte_1`, `tipo_fonte_2` | 1=Forma, 2=Cursiva, 3=Sem Gravação | `"1"` → `"Forma"` |
| `tipo_elo` | 1–15 (Cartier, Veneziano, Corda...) | `"3"` → `"Veneziano"` |
| `tipo_fecho` | 1–6 (Boia, Anzol, Batom, Caixa, Imã, Ouro) | `"1"` → `"Boia"` |
| `modelo_pingente` | 1–4, 6 (Crucifixo, Medalha, Ponto de Luz, Coração, Outro) | `"3"` → `"Ponto de Luz"` |

Cada campo gera duas colunas: `campo` (código bruto) + `campo_label` (texto mapeado). O frontend usa `campo_label ?? campo` para compatibilidade com valores fora do mapeamento.

Atenção: `Outro_modelo_pingente` e `Altura_pingente` têm maiúscula no banco — a view os aliasa como `outro_modelo_pingente` / `altura_pingente` (snake_case) via `ft."Campo" AS campo`.

---

## Views Principais

### `alissonerp.vw_ordens_completa`
Enriquece `directus.ordens` com:
- Mapeamento de codigos numericos → textos (situacao, status, rota, tipo_ordem)
- JOIN com `directus.setor` (coluna `descricao`) → `setor_nome`
- JOIN com `directus.deposito` → `deposito_nome`
- JOIN com `public.vendedores` → `vendedor_nome`
- JOIN com `public.contatos` → `cliente_nome`

Atencao: `directus.ordens` tem typo `peso_metal_negocido` — a view expoe como `peso_metal_negociado`.

### `alissonerp.vw_pcp_completa`
Enriquece `directus.pcp` com:
- Mapeamento de `etapas` (1-6) → textos
- JOIN com `directus.ordens` → numero_ordem, cliente_id, vendedor_id, etc.
- JOINs transitivos com contatos, vendedores, setor, deposito
- Coluna `"Bloqueado"` (B maiusculo) exposta como `bloqueado`

### Outras views cross-schema
- `vw_vendedores` → `public.vendedores`
- `vw_contatos` → `public.contatos`
- `vw_produtos` → `public.produtos`
- `vw_vendas` → `public.vendas`
- `vw_saldo_estoque` — saldo calculado por insumo/deposito (alissonerp.movimentacoes_estoque — vazio por ora)
- `vw_estoque_directus_saldo` — saldo real por deposito/insumo (directus.controle_estoque)
- `vw_movimentacoes_directus` — movimentacoes recentes com nomes (directus.controle_estoque)
- `vw_insumos_directus` — catalogo de insumos com status OK/Atencao/Critico (directus.insumos)
- `vw_quebra_por_ourives` — quebra de ouro por operador, JOIN com directus_users
- `vw_quebra_mensal` — tendencia mensal de quebra dos ultimos 12 meses
- `vw_quebra_por_deposito` — saldo de controle_estoque agrupado por deposito

### Trigger Ponte PDV (TEMPORÁRIO — Migration 027)
- `trg_ponte_ordens` em `directus.ordens` (AFTER INSERT OR UPDATE)
- Copia ordens com `situacao='2'` para `alissonerp.ordens` via UPSERT
- Chave deduplicacao: `directus_ordem_id` (UNIQUE INDEX `idx_ordens_directus_unique`)
- ON CONFLICT DO UPDATE: apenas campos operacionais (status, rota, local_atual, setor_atual, peso_metal_externo)
- Campos protegidos por `fn_proteger_campos_pdv` apenas no INSERT (numero_ordem, cliente_id, tipo_ordem, peso_metal_negociado, etc.)
- `DROP TRIGGER trg_ponte_ordens ON directus.ordens; DROP FUNCTION alissonerp.fn_ponte_directus_para_alissonerp();`
- Nota: `postgres` tem TRIGGER privilege mas nao e owner de `directus.ordens` — usar `CREATE OR REPLACE TRIGGER` (nao DROP+CREATE)

---

## Armadilhas / Pitfalls

### Retorno de Pedra (tipo 6) — resumo de implementação
- Trigger 018 (marcador `RP`): saída depósito PCP → entrada Almoxarifado. Sem código manual.
- Frontend: `TIPO_RETORNO_PEDRA=6` — `isPedra = TIPO_PEDRA.includes(tipoId)` cobre tipos 3 e 6
- Insumos: `/api/pcp/insumos?categoria_id=2` (todos, sem filtro estoque; retorna `peso_pedra`)
- Autocomplete, peso calculado, validação IA com margem — idêntico à Entrada de Pedra (tipo 3)
- Diferença: sem validação de estoque na API; banner "Devolvendo de X → Almoxarifado"

### Validação IA — Metal vs Pedra
| | Metal | Pedra |
|---|---|---|
| Usuário fornece | Peso (gramas) | Quantidade (unidades) |
| Sistema calcula | — | peso = qtd × insumo.peso_pedra |
| IA lê da foto | Peso na balança | Peso na balança (mesmo prompt) |
| Comparação | peso_digitado vs balança | peso_calculado vs balança |
| Tolerância | Zero (0.005g) | Configurável (%) |
| Config | Fixa | `ia_margem_pedra_pct` (default 10%) |
| Endpoint | `POST /api/pcp/validar-peso` | mesma rota, param `tipo=pedra` |

A função `validarPesoBalanca(base64, mediaType, pesoRef, tipo)` em `ia-validar-peso.ts` serve AMBOS os casos.
Pedras: `pesoRef = qtd × peso_pedra`; metal: `pesoRef = peso digitado`.
Config salva em `alissonerp.configuracoes_sistema WHERE chave='ia_margem_pedra_pct'`.
Editável em `/configuracoes` aba IA > "Tolerância de Validação".

### Formatação de pesos (ouro/metal)
Todos os pesos exibidos ao usuário usam **2 casas decimais** (`.toFixed(2)`).
- Utilitário: `src/lib/formatters.ts` → `formatPeso(valor)` (trata null/undefined → "—")
- Aplicado em: OrdemDetalheClient, DistribuicaoClient, EstoqueClient, PCPDetalheModal, SaidaOrdemModal, ConcluirDistModal, FecharOrdemDistModal, ApontamentoPCPModal, QuebraClient, ComprasClient
- Exceções mantidas: porcentagem de quebra (`.toFixed(2)%`), cotação R$ (`.toFixed(2)`)
- NÃO alterar: campos de input, cálculos internos, valores no banco

### Saldo de pedras — migração 10/03/2026
As movimentações originais do Directus (90 rows, marcador `EP`) estavam inconsistentes:
moviam saída do almoxarifado sem entrada prévia, resultando em saldo=0 para todas as pedras.

**O que foi feito:**
1. Backup: `alissonerp.backup_mov_pedras_20260310` (90 rows)
2. Deletadas as 90 movimentações de pedras erradas
3. Criadas 232 entradas iniciais no Almoxarifado (deposito_id=1) com `marcador='ENTRADA'`,
   `data_hora='2020-01-01'`, qtd = `insumos.saldo` (campo legado), para cada pedra com saldo > 0
4. Resultado: 232 pedras visíveis no autocomplete, saldo_legado = saldo_view, zero negativos

**Schema `movimentacoes_estoque`:** sem coluna `tipo` — usa `entrada` e `saida` (dupla entrada).
`vw_saldo_estoque` tem colunas: `deposito_id, insumo_id, saldo, total_movimentacoes, ultima_movimentacao`.
**NÃO existe `saldo_real`** — é `saldo`.

### IDs: alissonerp vs directus
`alissonerp.ordens.id` ≠ `directus.ordens.id` em geral (ex: alissonerp id=487, directus id=456).
Views que leem de `directus.*` SEMPRE usam `alissonerp.ordens.directus_ordem_id` como ponte.
Nunca assumir que `o.id = directus_id`. A `vw_fichas_tecnicas` já faz isso corretamente via
`directus.ordens.ficha_tecnica_id` (a tabela `directus.ficha_tecnica_ordem` não tem `ordem_id`).

### Grants: server vs client
Server components (`sql` direto) conectam como `postgres` — ignoram RLS e grants.
Client-side (Supabase anon key) usa role `anon` ou `authenticated` — PRECISA de grants explícitos.
Migration 032 configura GRANT USAGE no schema + SELECT em views para anon+authenticated +
SELECT/INSERT/UPDATE em tabelas para authenticated. Novas views/tabelas criadas após 032
precisam de grants explícitos para funcionar no client-side.

---

## Rotas Next.js

Estrutura com Route Groups (Next.js 16):
- `(auth)` — sem sidebar (login)
- `(dashboard)` — com sidebar (todas as paginas protegidas)

| Rota                | Arquivo                                              | Tipo          | Descricao                                          |
|---------------------|------------------------------------------------------|---------------|----------------------------------------------------|
| `/login`            | `app/(auth)/login/page.tsx`                          | Client        | Formulario de login (email+senha)                  |
| `/`                 | `app/(dashboard)/page.tsx`                           | Server+Client | Dashboard com stats e ultimas ordens               |
| `/ordens`           | `app/(dashboard)/ordens/page.tsx`                    | Server+Client | Tabela filtravel de todas as ordens                |
| `/ordens/[id]`      | `app/(dashboard)/ordens/[id]/page.tsx`               | Server+Client | Detalhe completo: info, PMC, timeline, 4 tabs      |
| `/pcp`              | `app/(dashboard)/pcp/page.tsx`                       | Server+Client | Kanban por etapa (6 colunas)                       |
| `/protocolo`        | `app/(dashboard)/protocolo/page.tsx`                 | Server+Client | Cards Ida/Volta + tabela com protocolos reais      |
| `/estoque`          | `app/(dashboard)/estoque/page.tsx`                   | Server+Client | 3 abas: Saldos, Movimentacoes, Catalogo de Insumos |
| `/quebra`           | `app/(dashboard)/quebra/page.tsx`                    | Server+Client | Dashboard de quebra de ouro com graficos Recharts  |
| `/auditoria`        | `app/(dashboard)/auditoria/page.tsx`                 | Server+Client | KPIs + tabela + modal aprovar/reprovar/pendenciar  |
| `/compras`          | `app/(dashboard)/compras/page.tsx`                   | Server+Client | Compras de insumos                                 |
| `/configuracoes`    | `app/(dashboard)/configuracoes/page.tsx`             | Server+Client | Configuracoes do sistema (IA, precos)              |
| `/dashboard-fabrica`| `app/(dashboard)/dashboard-fabrica/page.tsx`         | Client        | Dashboard producao fabrica (KPIs ouro, quebra, fin)|
| `/distribuicao`     | `app/(dashboard)/distribuicao/page.tsx`              | Server+Client | Distribuicao de ordens para operadores             |
| `/financeiro`       | `app/(dashboard)/financeiro/page.tsx`                | Server+Client | Financeiro                                         |
| `/insumos`          | `app/(dashboard)/insumos/page.tsx`                   | Server+Client | Catalogo de insumos                                |
| `/precificacao`     | `app/(dashboard)/precificacao/page.tsx`              | Server+Client | Precificacao de produtos                           |
| `/produtos`         | `app/(dashboard)/produtos/page.tsx`                  | Server+Client | Catalogo de produtos ERP (pai/variacao)            |
| `/vendas`           | `app/(dashboard)/vendas/page.tsx`                    | Server+Client | Vendas                                             |
| `/purificacao`      | `app/(dashboard)/purificacao/page.tsx`                | Server+Client | Purificação (18k→24k) e Ligação (24k→18k)         |
| `/conferencia`      | `app/(dashboard)/conferencia/page.tsx`                | Server+Client | Conferência de ordens (consultora)                 |
| `/entrega`          | `app/(dashboard)/entrega/page.tsx`                    | Server+Client | Controle de entregas                               |
| `/service`          | `app/(dashboard)/service/page.tsx`                    | Client        | App operador service (dark theme, mobile-first) — requer is_operador_service=true |
| `/service-painel`   | `app/(dashboard)/service-painel/page.tsx`             | Server+Client | Painel gerente service (KPIs, lista serviços) — grupo PRODUÇÃO na sidebar |
| `/vendas/nova`          | `app/(dashboard)/vendas/nova/page.tsx`                   | Client        | Nova venda completa (cliente+itens+pgto+frete)     |
| `/vendas/[id]`          | `app/(dashboard)/vendas/[id]/page.tsx`                   | Client        | Detalhe venda editável + PDF + Tiny + compartilhar |
| `/vendas/analise-comissoes` | `app/(dashboard)/vendas/analise-comissoes/page.tsx`  | Client        | KPIs comissão por período e vendedora              |
| `/vendas/analise-frete` | `app/(dashboard)/vendas/analise-frete/page.tsx`          | Client        | Resumo frete + entregas pendentes                  |
| `/vendas/analise-resultado` | `app/(dashboard)/vendas/analise-resultado/page.tsx`  | Client        | Faturamento, ranking, meta achievement             |
| `/vendas/metas`         | `app/(dashboard)/vendas/metas/page.tsx`                  | Client        | Metas por vendedora com progresso                  |
| `/vendas/metas/registrar` | `app/(dashboard)/vendas/metas/registrar/page.tsx`      | Client        | Registrar nova meta                                |
| `/vendas/ranking`       | `app/(dashboard)/vendas/ranking/page.tsx`                | Client        | Ranking mensal vendedoras                          |
| `/estoque-comercial`    | `app/(dashboard)/estoque-comercial/page.tsx`             | Server+Client | Estoque comercial com alertas                      |
| `/estoque-comercial/[produtoId]` | `app/(dashboard)/estoque-comercial/[produtoId]/page.tsx` | Server+Client | Detalhe estoque produto + movimentos       |
| `/orcamento`            | `app/(dashboard)/orcamento/page.tsx`                     | Client        | Orçamento 3D alianças + peças                      |
| `/orcamento/[token]`    | `app/orcamento/[token]/page.tsx`                         | Client        | Orçamento público compartilhado (sem auth)         |
| `/relatorios`           | `app/(dashboard)/relatorios/page.tsx`                    | Client        | Relatórios (produção/comercial/financeiro/estoque) |
| `/tarefas`              | `app/(dashboard)/tarefas/page.tsx`                       | Client        | Tarefas kanban + automações (substitui Asana)      |
<!-- Revisado 09/04/2026 -->

---

## Componentes

| Componente                                           | Caminho                                                   | Descricao |
|------------------------------------------------------|-----------------------------------------------------------|-----------|
| `Sidebar.tsx`                                        | `src/components/Sidebar.tsx`                              | Navegacao lateral fixa (w-56), icones Lucide, menus filtrados por role, footer nome/role/Sair |
| `DashboardClient.tsx`                                | `src/components/DashboardClient.tsx`                      | Stats cards + tabela de ordens + depositos + vendedores |
| `OrdensClient.tsx`                                   | `src/components/OrdensClient.tsx`                         | Tabela com busca por texto e filtros por status |
| `KanbanClient.tsx`                                   | `src/components/KanbanClient.tsx`                         | Board kanban do PCP com 6 colunas |
| `EstoqueClient.tsx`                                  | `src/components/EstoqueClient.tsx`                        | Estoque com 3 abas, busca e filtro por categoria |
| `QuebraClient.tsx`                                   | `src/components/QuebraClient.tsx`                         | Dashboard de quebra com PieChart + BarChart (Recharts) |
| `DistribuicaoClient.tsx`                             | `src/components/DistribuicaoClient.tsx`                   | Distribuicao de ordens para operadores |
| `ComprasClient.tsx`                                  | `src/components/ComprasClient.tsx`                        | Compras de insumos — lista+detalhe, form condicional por categoria, fluxo 3 etapas, zero supabase.from() (v2.14.0) |
| `OrdemDetalheClient.tsx`                             | `app/(dashboard)/ordens/[id]/OrdemDetalheClient.tsx`      | Detalhe da ordem: header, cards, card PMC, 4 tabs, timeline |
| `ProtocoloClient.tsx`                                | `app/(dashboard)/protocolo/ProtocoloClient.tsx`           | Cards Ida/Volta + tabela com busca, protocolo.directus |
| `AuditoriaClient.tsx`                                | `app/(dashboard)/auditoria/AuditoriaClient.tsx`           | KPIs + tabela quebra% colorida + modal. Ficha tecnica visivel no modal sem sair da pagina |
| `ConfiguracoesClient.tsx`                            | `app/(dashboard)/configuracoes/ConfiguracoesClient.tsx`   | Configuracoes do sistema (IA: provedor/modelo/chave, precos: limiar/arredondamento) |
| `FinanceiroClient.tsx`                               | `app/(dashboard)/financeiro/FinanceiroClient.tsx`         | Financeiro |
| `InsumosClient.tsx`                                  | `app/(dashboard)/insumos/InsumosClient.tsx`               | Catalogo de insumos com busca e filtro por categoria |
| `PrecificacaoClient.tsx`                             | `app/(dashboard)/precificacao/PrecificacaoClient.tsx`     | Precificacao de produtos |
| `ProdutosClient.tsx`                                 | `app/(dashboard)/produtos/ProdutosClient.tsx`             | Catalogo de produtos ERP (pai/variacao, SKU, medidas) |
| `VendasClient.tsx`                                   | `app/(dashboard)/vendas/VendasClient.tsx`                 | Vendas |
| `login/page.tsx`                                     | `app/(auth)/login/page.tsx`                               | Formulario de login: supabase.auth.signInWithPassword, redireciona para `next` param |
| `GaleriaFotosOrdem.tsx`                              | `src/components/ordem/GaleriaFotosOrdem.tsx`              | Galeria de fotos da ordem: duas fontes (PDV público + ERP signed 1h), lightbox teclado, upload, delete admin-only |
| `ComentariosOrdem.tsx`                               | `src/components/ComentariosOrdem.tsx`                     | Comentários com realtime Supabase, @mentions autocomplete, edição, soft delete, foto anexo |
| `PerfilDrawer.tsx`                                   | `src/components/PerfilDrawer.tsx`                         | Drawer perfil: avatar (comprime 200x200 JPEG 0.85 via canvas), nome, senha, dispara evento perfil:foto-atualizada |
| `UserAvatar.tsx`                                     | `src/components/UserAvatar.tsx`                           | Exibe avatar com fallback para iniciais |
| `UserEditDrawer.tsx`                                 | `src/components/UserEditDrawer.tsx`                       | Edicao de usuario pelo admin |
| `NotificacoesDrawer.tsx`                             | `src/components/NotificacoesDrawer.tsx`                   | Drawer de notificacoes (mencoes, sistema) — left-0 md:left-56 |
| `ProtocoloMotoboy.tsx`                               | `src/components/motoboy/ProtocoloMotoboy.tsx`             | PWA dark theme para motoboy (protocolo simplificado) |
| `NovaOrdemButton.tsx`                                | `src/components/ordens/NovaOrdemButton.tsx`               | Dropdown 7 tipos: 5 modais ativos (4 independentes + 1 base) + 2 wrappers finos; useAuth para userName |
| `NovaOrdemReposicaoLojaModal.tsx`                    | `src/components/ordens/NovaOrdemReposicaoLojaModal.tsx`   | Modal reposição loja: busca produto, checklist variações+qtd, fotos referência (canvas→base64→upload server) |
| `_shared/` (ordens)                                  | `src/components/ordens/_shared/`                          | Utilitários compartilhados: `compressImage` (retry até quality 0.3, máx 2MB), `formatters` (fmtData/fmtBRL), `useDebounce`, `constants` (SITUACAO_LABEL, paleta C), `types` (Cliente/Venda/ItemVenda) |
| `ItensOrdemSection.tsx`                              | `src/components/ordens/ItensOrdemSection.tsx`             | Exibe itens da ordem em /ordens/[id]: duas fontes (directus.itens_ordem_1 legado, alissonerp.itens_ordem ERP) |
| `MobileHeader.tsx`                                   | `src/components/MobileHeader.tsx`                         | Header fixo h-14 mobile: ☰ toggle sidebar + logo + avatar (visível apenas < 768px) |
| `MobileCard.tsx`                                     | `src/components/ui/MobileCard.tsx`                        | Componente reutilizável para cards de tabela no mobile (dual-render pattern) |
| `SidebarContext.tsx`                                 | `src/contexts/SidebarContext.tsx`                         | Context React para controle abrir/fechar sidebar no mobile |
| `ServiceWorkerRegister.tsx`                          | `src/components/ServiceWorkerRegister.tsx`                | Registro do Service Worker via componente React (incluído em layout.tsx) |
| `PurificacaoClient.tsx`                              | `app/(dashboard)/purificacao/PurificacaoClient.tsx`      | Purificação 18k→24k com aba dedicada |
| `LigacaoTab.tsx`                                     | `app/(dashboard)/purificacao/LigacaoTab.tsx`             | Aba Ligação 24k→18k dentro de Purificação |
| `ConferenciaClient.tsx`                              | `app/(dashboard)/conferencia/ConferenciaClient.tsx`      | Conferência de ordens por consultora |
| `EntregaClient.tsx`                                  | `app/(dashboard)/entrega/EntregaClient.tsx`              | Controle de entregas |
| `InsumoEditDrawer.tsx`                               | `src/components/insumos/InsumoEditDrawer.tsx`            | Drawer de edição de insumo (foto, fornecedor, peso_pedra, ativo) |
| `Paginacao.tsx`                                      | `src/components/ui/Paginacao.tsx`                        | Componente reutilizável de paginação |
| `ServiceLayout.tsx`                                  | `src/components/layout/ServiceLayout.tsx`                | Layout dark theme para /service (detectado pelo DashboardShell via pathname) |
| `ServiceApp.tsx`                                     | `src/components/service/ServiceApp.tsx`                  | App operador service: 4 views (pendentes, em_servico, concluidos, painel) |
| `ServiceCamera.tsx`                                  | `src/components/service/ServiceCamera.tsx`               | Câmera mobile: navigator.mediaDevices (HTTPS) + fallback input[type=file] (HTTP) |
| `ServicePainelClient.tsx`                            | `src/components/service/ServicePainelClient.tsx`         | Painel gerente: stats, KPIs, lista serviços por status |
| `ServiceDetalheDrawer.tsx`                           | `src/components/service/ServiceDetalheDrawer.tsx`        | Drawer detalhe do serviço (peso, solda, pedras, fotos, timeline) |
| `CarregarSoldaModal.tsx`                             | `src/components/service/CarregarSoldaModal.tsx`          | Modal para carregar solda para operador service |
| `LocaisEstoqueTab.tsx`                               | `src/components/LocaisEstoqueTab.tsx`                    | Aba CRUD de locais de estoque em /configuracoes (v2.14.0) |
| `TransferirLocalModal.tsx`                           | `src/components/forms/TransferirLocalModal.tsx`          | Modal transferência de insumos entre locais físicos — CE dupla marcador TA (v2.14.0) |
<!-- Revisado 28/03/2026 — v2.14.0 -->

---

## Libs adicionais

| Arquivo | O que faz |
|---------|-----------|
| `src/lib/permissoes.ts` | `temPermissao(userId, acao, role)`: verifica permissão granular via `alissonerp.permissoes_usuario`. Admin/dev passam direto (fullAccess). |

---

## Comentarios e Fotos de Ordens (Migrations 069-072)

### Tabela alissonerp.comentarios_ordem
```
id             SERIAL PK
ordem_id       INTEGER FK → alissonerp.ordens.id
autor_id       UUID FK → alissonerp.usuarios.id
texto          TEXT
mencoes        TEXT[]          — array de UUIDs dos usuarios mencionados
editado        BOOLEAN
editado_em     TIMESTAMPTZ
texto_original TEXT            — preserva texto antes da edicao (migration 071)
excluido       BOOLEAN         — soft delete (migration 071)
excluido_em    TIMESTAMPTZ
excluido_por   UUID
foto_path      TEXT            — path no bucket 'ordem-fotos' (migration 071)
created_at     TIMESTAMPTZ
```

### Coluna alissonerp.ordens.fotos_paths (migration 071)
```
fotos_paths   TEXT[]   — array de paths no bucket 'ordem-fotos'
  Adicionado junto com bucket 'ordem-fotos' (privado, 10MB, HEIC incluso)
  Path padrao: ordens/{ordemId}/{timestamp}-{userId[0:8]}.{ext}
```

### Tabela alissonerp.notificacoes (migration 069)
```
Colunas adicionadas: link, ordem_id, comentario_id, remetente_id, lida_em
Renomeado: user_id → usuario_id
Realtime habilitado em migration 069
```

### Fluxo fotos da ordem — duas fontes
```
GET /api/ordens/[id]/fotos retorna array com origem marcada:
  PDV: directus.ordens.arquivos_path → bucket 'imagens' (publico) → URL direta, origin="pdv"
  ERP: alissonerp.ordens.fotos_paths → bucket 'ordem-fotos' (privado) → signed URL 1h, origin="erp"

POST /api/ordens/[id]/fotos → body: { path } → array_append em fotos_paths
DELETE /api/ordens/[id]/fotos → body: { path } → array_remove + Storage delete (admin/dev only)
```

### Fluxo comentarios com @mention
```
1. Usuario digita "@" → busca /api/usuarios/busca?q= (debounce 150ms)
2. Seleciona usuario → substitui "@query " por "@firstname ", add UUID em mencoes[]
3. POST /api/ordens/[id]/comentarios → body: { texto, mencoes?, foto_path? }
4. API cria comentario + notificacoes tipo='mencao' para cada UUID em mencoes
5. Realtime: canal "comentarios-ordem-{ordemId}" → INSERT → recarrega lista

Fotos em comentarios: path = comentarios/{ordemId}/{timestamp}-{userId[0:8]}.{ext}
  bucket: 'ordem-fotos' (privado), signed URL 1h gerado ao carregar lista
```

### Perfil do Usuario — PerfilDrawer.tsx + /api/user/avatar
```
PerfilDrawer comprime imagem ANTES de enviar:
  canvas.toBlob(JPEG, 0.85) com max 200×200px preservando aspect ratio

/api/user/avatar (POST):
  Recebe File (sem compressao server-side — feita no client)
  Upload para bucket 'avatars' como {userId}.{ext}
  Upsert em public.user_profiles com mapeamento de role:
    desenvolvedor/admin → 'admin'
    gerente_fabrica/gerente_loja → 'gerente'
    pcp/ourives/estoquista_fabrica → 'producao'
    motoboy/logistica → 'logistica'
    consultora → 'consultora' | financeiro → 'financeiro'
    estoquista_loja + outros → 'user'
  (Constraint user_profiles_role_check nao aceita roles ERP diretas)

Atualizacao em tempo real:
  API retorna { avatar_url } → PerfilDrawer dispara CustomEvent "perfil:foto-atualizada"
  useAuth() escuta evento → setState({ fotoUrl: url }) sem reload de pagina
```

---

## Design System

Paleta principal:
- Verde escuro (primario): `#184036`
- Fundo escuro: `#0F2922`
- Bege claro (cards): `#F3EADA`
- Dourado (accent): `#DB9864`
- Dourado claro: `#FEDDB4`
- Verde medio: `#80A795`
- Fundo pagina: `#FAFAF7`
- Bordas: `#E8DCC8`

Configurado via `@theme` em `src/app/globals.css` (Tailwind v4 — sem tailwind.config.ts).

---

## Autenticacao e Autorizacao (Sessao 3.1)

### Arquitetura de Auth

- **Supabase GoTrue** para autenticacao (email + senha)
- **`src/proxy.ts`** — intercepta todas as rotas (Next.js 16: `middleware.ts` foi renomeado para `proxy.ts`)
- **`src/hooks/useAuth.ts`** — hook client-side que retorna `{ user, role, nome, loading }`
- **`src/lib/auth/permissions.ts`** — mapeamento role → menus permitidos (`getMenusForRole`, `canAccess`)
- **`src/lib/supabase/client.ts`** — `createBrowserClient` para uso client-side
- **`src/lib/supabase/server.ts`** — `createServerClient` para Server Components

### Fluxo de autenticacao

1. Usuario acessa qualquer rota → `proxy.ts` chama `supabase.auth.getUser()`
2. Se nao autenticado → redireciona para `/login?next=<rota>`
3. Login bem-sucedido → GoTrue seta cookie de sessao → redirect para `next`
4. `Sidebar.tsx` lê role via `useAuth()` → filtra menus por `getMenusForRole(role)`

### Usuarios de teste

| Email | Senha | Role |
|-------|-------|------|
| admin@alisson.com | Admin@123 | desenvolvedor |
| gerente@alisson.com | Gerente@123 | gerente_fabrica |
| ourives1@alisson.com | Ourives@123 | ourives |
| motoboy@alisson.com | Motoboy@123 | motoboy |
| consultora@alisson.com | Consultora@123 | consultora |
| pcp@alisson.com | PCP@123 | pcp |

Script de criacao: `scripts/create-users.py`

### Menus por role

Fonte de verdade: `src/lib/auth/permissions.ts` — `ROLE_MENUS`.

| Role               | Menus visíveis                                                                         |
|--------------------|----------------------------------------------------------------------------------------|
| `desenvolvedor`    | TUDO (16 rotas + configurações)                                                        |
| `admin`            | TUDO (igual desenvolvedor)                                                             |
| `gerente_fabrica`  | Dashboard, Dashboard Fábrica, Ordens, PCP, Distribuição, Estoque, Quebra, Protocolo, Auditoria, Compras, Insumos, Vendas, Financeiro |
| `gerente_loja`     | Dashboard, Ordens, Estoque, Protocolo, Conferência, Entrega, Auditoria, Vendas, Produtos, Precificação |
| `ourives`          | Ordens, PCP                                                                            |
| `motoboy`          | Protocolo                                                                              |
| `consultora`       | Ordens, Estoque, Conferência                                                           |
| `estoquista_fabrica` | Estoque, Quebra, Compras, Insumos                                                    |
| `estoquista_loja`  | Estoque                                                                                |
| `pcp`              | Dashboard, Ordens, PCP, Distribuição, Quebra                                          |

---

## RLS — Row Level Security

Roles e permissoes:
- `admin` — acesso total a todas as tabelas
- `gerente_fabrica` — leitura total + escrita em ordens/pcp/estoque
- `ourives` — leitura de ordens, escrita em apontamentos proprios
- `motoboy` — leitura/escrita em protocolos
- `consultora` — leitura em aprovacoes proprias
- `pcp` — leitura em ordens/pcp, escrita em apontamentos

Helper: `alissonerp.fn_user_role()` — retorna NULL se usuario nao cadastrado (nao bloqueia durante dev).

---

## Armadilhas Conhecidas

| Problema | Solucao |
|----------|---------|
| `directus.setor` usa `descricao`, nao `nome` | Sempre usar `s.descricao AS setor_nome` |
| `directus.pcp` tem `"Bloqueado"` (B maiusculo) | Requer aspas duplas: `p."Bloqueado"` |
| `directus.ordens` tem typo `peso_metal_negocido` | Alias para `peso_metal_negociado` nas views |
| Dollar-quoting `$` conflita com heredoc bash | Escrever SQL em Python e executar com `python script.py` |
| `current_role` e palavra reservada no PostgreSQL | Renomear para `v_role` em PL/pgSQL |
| ENUMs devem ficar em `alissonerp`, nao `public` | Sempre usar `SET search_path TO alissonerp` |
| Policy names com aspas simples dao erro SQL | Usar aspas duplas: `CREATE POLICY "nome" ON ...` |
| Supabase REST nao expoe schema customizado | Server Components usam `postgres` npm direto |
| Tailwind v4 nao tem `tailwind.config.ts` | Configurar via `@theme` em globals.css |
| `directus.pcp.operador` e varchar (UUID como string) | Cast `p.operador::uuid` para JOIN com directus_users |
| `directus.insumos.saldo` pode ser NULL | Usar `COALESCE` ou verificar `!= null` no frontend |
| Supabase client nao usa para queries (schema nao exposto) | Todas as queries de Server Components usam `sql` de `@/lib/db` |
| `directus.protocolo` nao tem colunas motoboy/recebedor | Usar `user_created` JOIN directus_users como `criado_por` |
| `directus.protocolo.rota` e texto livre ("Loja -> Fabrica") | Nao mapear — usar direto como `direcao` |
| `directus.transferencia_ordem` usa coluna `pcp` (nao `pcp_id`) | JOIN: `t.pcp = p.id`; tem `ordem_id` direto |
| `directus.distribuicao.setor` e varchar (nao FK inteiro) | Nao fazer JOIN com setor — usar como texto direto |
| Next.js 16: `middleware.ts` foi depreciado | Renomear para `proxy.ts` e exportar funcao `proxy` (nao `middleware`) |
| Usuarios criados diretamente no banco nao conseguem logar | Exige `auth.identities` + tokens como `''` (nao NULL) — ver scripts/create-users.py |
| GoTrue retorna 500 "Database error querying schema" | Causa: campos token (`confirmation_token`, `recovery_token`, etc.) eram NULL; devem ser `''` |
| `auth.identities.provider_id` deve ser o UUID do usuario | Para email provider no GoTrue v2.x, `provider_id` = `user.id::text` (nao o email) |
| `auth.identities.email` e coluna gerada | Nao inserir manualmente — e derivada do `identity_data->>'email'` |

---

## Sessao 2.2 — Estoque + Quebra de Ouro + Correcoes

### O que foi feito

**Migration 015** — `supabase/migrations/015_correcoes_views.sql`:
- Recriou `vw_ordens_completa` com acentuacao correta: "Producao" → "Producao", "Reposicao" → "Reposicao", "Gravacao" → "Gravacao", "Concluido" → "Concluido"
- Criou 5 novas views lendo do Directus:
  - `vw_estoque_directus_saldo` — saldo por deposito/insumo (GROUP BY sobre controle_estoque)
  - `vw_movimentacoes_directus` — 100+ movimentacoes com nomes resolvidos
  - `vw_insumos_directus` — catalogo com status_estoque calculado (ok/atencao/critico)
  - `vw_quebra_por_ourives` — quebra por operador (JOIN directus_users via UUID cast)
  - `vw_quebra_mensal` — tendencia mensal (ultimos 12 meses com data_conclusao)
- Recriou `vw_quebra_por_deposito` usando directus.controle_estoque

**Dados reais encontrados:**
- Ouro18k: 257g no deposito Geral, 89g no Neneka
- Quebra: Carlos Eduardo 44.4%, Antonio walderly 16.7%, Antonio Natan 11.4% (todos acima de 5%)
- Quebra mensal: Feb/26 com 15.7%, Mar/26 com 13.7% — nivel critico
- Total views no alissonerp: 16

### Paginas criadas

**`/estoque`** — `app/estoque/page.tsx` + `components/EstoqueClient.tsx`:
- 3 abas com botoes toggle
- Aba "Saldos por Deposito": tabela com busca + filtro por categoria, entradas/saidas/saldo coloridos
- Aba "Movimentacoes (100)": tabela com MarcadorBadge (verde=entrada, vermelho=saida)
- Aba "Catalogo (N)": todos os insumos com StatusBadge (OK/Atencao/Critico)
- Stats: Ouro total (em gramas e R$), Pedras (un), Insumos cadastrados, Alertas

**`/quebra`** — `app/quebra/page.tsx` + `components/QuebraClient.tsx`:
- 4 stat cards: Metal Processado, Quebra Total, Percentual Medio, Valor Perdido (R$)
- Alertas vermelhos automaticos para ourives com quebra > 5%
- Ranking de ourives: avatar com iniciais + barra de progresso colorida (verde <3%, amarelo 3-5%, vermelho >5%)
- PieChart: distribuicao PMC + Retorno + Quebra
- BarChart: tendencia mensal com linha de referencia "Meta 5%"
- Card cotacao ouro

### Correcoes aplicadas

- Coluna "Situacao" removida da tabela de ordens (causava confusao — todos mostravam "Criado")
- Filtro "Concluido" atualizado para "Concluido" (com acento, compativel com a view)
- STATUS_COLORS atualizado para cobrir "Concluido" e "Concluido" (ambos)
- Peso "0" nos cards do Kanban PCP substituido por "—" (verificacao `> 0`)

### Decisoes tecnicas

- **Estoque lê do Directus:** `alissonerp.movimentacoes_estoque` esta vazia — o estoque real esta em `directus.controle_estoque`. Views criam ponte de leitura.
- **Quebra usa directus.pcp:** Campo `operador` e varchar com UUID; requer `::uuid` cast para JOIN com `directus.directus_users`
- **Nenhum cliente Supabase:** Todas as paginas usam `sql` direto de `@/lib/db` para consistencia e confiabilidade
- **Recharts ja estava instalado** (v3.8.0) — nao foi necessario instalar

### Proximos passos (Sessao 3.1)
- Detalhe da ordem `/ordens/[id]` — timeline + apontamentos + historico de PCP
- Realtime subscriptions em ordens e PCP
- Setup Supabase Auth com login + roles no JWT

---

## Sessao 2.3 — Detalhe da Ordem + Protocolo

### O que foi feito

**Migration 016** — `supabase/migrations/016_views_detalhe_ordem.sql`:
7 novas views de leitura do Directus:
- `vw_ordem_detalhe` — ordem completa + PCP + distribuicao + operador (JOIN directus_users via `::uuid` cast)
- `vw_apontamentos_ordem` — apontamentos com tipo, insumo, deposito, setor, quem fez
- `vw_estoque_ordem` — movimentacoes de controle_estoque por ordem
- `vw_transferencias_ordem` — transferencias (usa coluna `pcp` nao `pcp_id`, tem `ordem_id` direto)
- `vw_protocolos_completo` — protocolos ida com criador e subquery de contagem
- `vw_protocolo_ordens` — ordens vinculadas a cada protocolo (protocolo_ordens_4)
- `vw_protocolos_loja_completo` — protocolos volta (protocolo_loja_ordens_1)

**Dados reais encontrados:**
- 148 protocolos IDA (varios "Em Transito" de 03-06/Mar/2026 — dados vivos!)
- 86 protocolos VOLTA (maioria Concluido)
- Apontamentos: "Retorno de Metal", "Entrada Inicial Metal" com Ouro18k
- Transferencias: Robson Nunes entre setores/depositos
- Total views no alissonerp: 23

### Paginas criadas

**`/ordens/[id]`** — `app/ordens/[id]/page.tsx` + `OrdemDetalheClient.tsx`:
- Header com numero_ordem, badge de status, indicador "Bloqueado" (se PCP bloqueado)
- 2 info cards: Comercial (cliente, vendedor, entrega, peso) + Producao (PCP, operador, setor, metal externo)
- Card PMC gradient esmeralda (aparece SOMENTE quando PCP concluido = etapas_cod '5'): entrada / retorno / peso_final / PMC / quebra
- 4 tabs: Producao (grid 3x3), Apontamentos (tabela), Mov. Estoque (marcadores coloridos), Transferencias (lista)
- Timeline lateral dinamica: constroi eventos com base nos dados (PCP existe? metal > 0? transferencias? concluido? distribuicao?)
- Card resumo: contadores + datas

**`/protocolo`** — `app/protocolo/page.tsx` + `ProtocoloClient.tsx`:
- 2 cards summary (Ida esmeralda / Volta azul): total + em aberto + concluidos
- Tabs Ida/Volta + campo de busca
- Tabela: ID, Status badge, Direcao (texto livre), Criado por, Ordens, Data criacao, Data conclusao

**Tabela de ordens clicavel:**
- `OrdensClient.tsx` atualizado com `useRouter` + `onClick={() => router.push('/ordens/${id}')}`

### Correcoes de schema descobertas

| Tabela | Problema | Solucao |
|--------|----------|---------|
| `directus.protocolo` | Sem colunas motoboy/recebedor | Usar `user_created` como criado_por |
| `directus.protocolo.rota` | Texto livre, nao codigo | Usar direto como `direcao` |
| `directus.transferencia_ordem` | Coluna `pcp` (nao `pcp_id`) | `JOIN ON t.pcp = p.id` |
| `directus.distribuicao.setor` | varchar, nao FK | Usar como texto sem JOIN |

### Proximos passos (Sessao 4.x)
- Formularios de escrita (criar/editar ordens, apontamentos)
- Realtime subscriptions em ordens e PCP (Supabase Realtime)
- Notificacoes push no dashboard

---

## Sessao 3.1 — Autenticacao, Route Groups e Sidebar por Role

### O que foi feito

**Migration 017** — `supabase/migrations/017_auth_trigger.sql`:
- `fn_handle_new_user()` — trigger AFTER INSERT em auth.users auto-popula alissonerp.usuarios
- `trg_on_auth_user_created` — trigger ligado a fn_handle_new_user
- `fn_user_role()` — retorna NULL (nao erro) se usuario nao cadastrado
- RLS desabilitado em tabelas de config (depositos, setores, tipos_apontamento, categorias_insumo, parametros, insumos)
- Policy `usuarios_select_own` — usuarios veem apenas o proprio perfil (ou admin ve todos)

**Usuarios de teste criados** via `scripts/create-users.py` (6 usuarios, todos em auth.users + auth.identities)

**Route Groups reestruturados:**
- `src/app/(auth)/layout.tsx` — fundo creme, centralizado, sem sidebar
- `src/app/(auth)/login/page.tsx` — formulario de login com design esmeralda/creme
- `src/app/(dashboard)/layout.tsx` — layout com Sidebar
- Todas as paginas movidas de `app/` para `app/(dashboard)/`
- `src/app/layout.tsx` — simplificado (sem Sidebar, sem flex)

**Novos arquivos de auth:**
- `src/proxy.ts` — protege rotas (Next.js 16: usa `proxy` em vez de `middleware`)
- `src/lib/auth/permissions.ts` — `Role` type, `getMenusForRole()`, `canAccess()`
- `src/hooks/useAuth.ts` — hook com `user`, `role`, `nome`, `loading`; reage a `onAuthStateChange`

**Sidebar.tsx refatorada:**
- Icones Lucide (LayoutDashboard, ClipboardList, Kanban, Package, Scale, FileText, LogOut)
- Menus filtrados por `getMenusForRole(role)` — cada role ve apenas o que pode acessar
- Footer: nome do usuario, role, botao Sair (chama supabase.auth.signOut + redirect /login)

### Problemas resolvidos durante a sessao

| Problema | Causa | Solucao |
|----------|-------|---------|
| GoTrue 500 "Database error querying schema" | Campos token eram NULL; GoTrue exige `''` | UPDATE auth.users SET confirmation_token='' ... |
| Login falha apos criar usuario direto no banco | Faltava entrada em auth.identities | INSERT em auth.identities com provider='email' |
| `auth.identities` com `provider_id` errado | Usamos email; GoTrue v2 espera UUID | UPDATE SET provider_id = user_id::text |
| Next.js 16 warning sobre middleware.ts | `middleware` foi depreciado em v16 | Renomear para `proxy.ts`, exportar `proxy` |
| Supabase URL incorreta no .env.local | Usavamos IP:porta; URL real e dominio | NEXT_PUBLIC_SUPABASE_URL=https://api.alisson.api.br |
| Anon key nao encontrada | Nao estava no Studio | Encontrada em outro projeto: monitor-ordens/.env |

---

## Sessao 3.2 — Apontamento PCP (Flows 1000-1005) — Primeiro WRITE

### O que foi feito

**Migration 018** — `supabase/migrations/018_trigger_apontamento_pcp.sql`:
- `fn_processar_apontamento_pcp()` — Flow 1000: trigger AFTER INSERT em apontamentos_pcp, branch por tipo 1-7
  - Tipos 1(AD), 2(EM), 3(EP): CE dupla-entrada Dep1→DepOrdem, atualiza total_metal ou pedras no PCP
  - Tipos 4(BI), 5(RM), 6(RP): CE dupla-entrada DepOrdem→Dep1 (invertido), atualiza retorno_metal ou pedras
  - Tipo 7 (Ocorrencia): sem CE, apenas registra
  - Flow 1005 integrado no tipo 3 (EP): INSERT automatico em pedras_ordens se peso_pedra > 0
- `fn_criar_itens_ordem(ordem_id, insumo_id, deposito_id, qtd, tipo)` — Flow 1001
  - Se ja existe item para (ordem_id, insumo_id) → UPDATE soma peso (tipos 5,6 subtraem)
  - Se nao existe → INSERT novo item
- `fn_processar_outros_insumos_pcp()` — Flow 1004: trigger em outros_insumos_pcp
  - CE marcador SOI (saida dep1)
  - UPDATE pcp.total_geral_outros_pesos += peso

**Testes validados:**
- Tipo 2 (EM) 5g → 2 CEs (saida dep1 + entrada dep2), pcp.total_metal=5.0, itens_ordem.peso=5.0 ✅
- Tipo 5 (RM) 1g → +2 CEs (saida dep2 + entrada dep1), pcp.retorno_metal=1.0, itens_ordem.peso=4.0 ✅
- Tipo 7 (Ocorrencia) → 0 CEs, nenhuma mudanca no estoque ✅

**View atualizada:**
- `vw_pcp_completa`: adicionou `deposito_id` (o.local_atual::integer) e `setor_id` (o.setor_atual)

**Nova view:**
- `vw_pcp_erp`: le de `alissonerp.pcp` (nao directus.pcp) com JOIN em alissonerp.ordens, public.contatos, public.vendedores, alissonerp.depositos, alissonerp.setores
  - Mapeia enum etapas (novas_ordens → 'Novas Ordens', em_andamento → 'Em Andamento', etc.)
  - Expoe deposito_id e setor_id para o modal de apontamento

**Novo componente:**
- `src/components/forms/ApontamentoPCPModal.tsx`
  - Select tipo apontamento (scope pcp/ambos, ativo=true)
  - Select insumo filtrado por categoria: metal para tipos 1,2,5 | pedra para 3,6 | todos para 4
  - Tipo 7 (Ocorrencia) nao exibe select de insumo
  - Tipos 1 (AD), 3 (EP) e 5 (RM): deposito/setor do card PCP — read-only, nao seleciona
  - Tipo 2 (EM): usuario seleciona deposito/setor
  - Tipo 5 (RM): insumos Metal sem filtro de estoque (/api/pcp/insumos?categoria_id=1)
  - Tipo 3 (EP): insumos Pedra do Almoxarifado com saldo > 0; input em UNIDADES (inteiro)
    - peso calculado no frontend: qtd × insumo.peso_pedra
    - insumos-disponiveis agora inclui peso_pedra no SELECT
  - Tipos 1,2,3,5: foto obrigatoria + validacao IA (tolerancia zero)
  - Tipo 3 (EP): IA CONTA pedras — lib: validarQuantidadePedras() em ia-validar-peso.ts
    - POST /api/pcp/validar-peso aceita tipo=pedra + quantidade=N (vs tipo=metal + peso=X)
  - Tipo 5 (RM): sem validacao de estoque na API (metal voltando pro pote)
  - API /api/pcp/apontamentos valida estoque para tipos 1, 2 e 3 (Almoxarifado ID=1)
  - Info box: AD="🔩", EP="💎 Almoxarifado→Operador", RM="↩️ Operador→Almoxarifado", EM="📥 Almoxarifado→Operador"
  - Feedback: loading spinner, toast de sucesso, exibicao de erro
  - Usa API route /api/pcp/apontamentos (POST) com pg.Pool (nao supabase.from)

**Nova rota GET /api/pcp/[id]/resumo:**
- Agrupa apontamentos por tipo_apontamento com totais
- Retorna: resumo[] (tipo_id, tipo_nome, total_apontamentos, peso_metal, peso_pedras, qtd_pedras, categoria_id)
- Retorna: totais { metal_entrada, metal_retorno, metal_liquido, pedras_qtd, pedras_peso }
- PCPDetalheModal carrega e exibe secao "Resumo" antes da lista de apontamentos

**KanbanClient.tsx refatorado:**
- Botao "Apontar" nos cards das colunas Novas Ordens, Aguardando, Em Andamento
- Abre ApontamentoPCPModal com pcpId, ordemId, depositoId, setorId do card
- Apos sucesso: `router.refresh()` para recarregar totais do servidor

**PCP de teste criado:**
- Ordem `ERP-0001` (alissonerp.ordens id=3, local_atual=2, setor_atual=1)
- PCP id=2 vinculado, etapas=novas_ordens, aparece no kanban

**Decisao tecnica: Kanban lê de `alissonerp.pcp` (Opcao B)**
- `pcp/page.tsx` agora usa `vw_pcp_erp` (nao mais `vw_pcp_completa`)
- PCPs antigos do Directus serao migrados em sessao futura (5.1)

### Proximos passos (Sessao 3.3)
- Transferencia entre setores (Flow 1002): CE marcador TED, PCP → em_andamento
- Saida da ordem (Flow 1003): calcula PMC/quebra, PCP → concluido
- Referencia: Secao 7.1 (Flows 1002-1003), Secao 7.3 (formulas PMC)

---

## Sessao 3.3 — Transferencia entre Setores + Saida da Ordem (Flows 1002-1003)

### O que foi feito

**Migration 019** — `supabase/migrations/019_trigger_transferencia_saida.sql`:

- `fn_processar_transferencia()` — Flow 1002: trigger AFTER INSERT OR UPDATE em `transferencias_ordem`
  - Guard: retorna imediatamente se `setor_id IS NULL OR deposito_id IS NULL`
  - Guard UPDATE: nao reprocessa se `OLD.setor_id` ja estava preenchido
  - Busca localizacao atual da ordem em `ordens.local_atual` e `ordens.setor_atual`
  - CE TED: loop em `itens_ordem_insumos` WHERE `peso > 0` — cria par de movimentacao por insumo (old_dep/set → new_dep/set)
  - UPDATE ordens SET `setor_atual = NEW.setor_id`, `local_atual = NEW.deposito_id`
  - UPDATE pcp SET `etapas = 'em_andamento'`
  - INSERT nova `transferencias_ordem` vazia (pcp_id, ordem_id) — aguarda proximo destino

- `fn_processar_saida_ordem()` — Flow 1003: trigger AFTER INSERT em `saidas_ordem`
  - Busca PCP ativo da ordem (etapas NOT IN concluido/cancelado)
  - Calcula PMC/quebra via `fn_calcular_pmc_pcp(NEW.peso, total_geral_outros_pesos, metal_externo, total_metal, retorno_metal)`
  - CE SM (Saida de Metal) para insumos com `categoria_id = 1`
  - CE SP (Saida de Pedra) para demais insumos
  - UPDATE pcp: peso_final, pmc, quebra, porcentagem_de_quebra, saida_ordem_id, etapas='concluido', data_conclusao
  - UPDATE ordens: status='concluido', data_conclusao
  - INSERT auditorias: situacao='concluido', tipo_auditoria='saida_pcp', rota_processo='pcp'

**Correcao detectada:** `auditorias.tipo_auditoria` e `varchar(10)` — valor corrigido de 'saida_producao' para 'saida_pcp' (9 chars).

**Testes validados** via `scripts/apply_019_and_test.py`:
- Flow 1002: PCP→em_andamento, ordens.local_atual/setor_atual atualizados, transferencia vazia criada pelo trigger ✅
- Flow 1003: PMC=9.8g, Quebra=0.7g, %Quebra=6.67%, PCP→concluido, saida_ordem_id vinculado, ordem→concluido, auditoria criada ✅

**Novos componentes:**

- `src/components/forms/TransferenciaPCPModal.tsx`
  - Select de deposito destino (exclui Almoxarifado Central, id=1)
  - Select de setor destino
  - Visualizacao Origem → Destino com ArrowRight em tempo real
  - Campo de observacao opcional
  - INSERT em `transferencias_ordem` — trigger 1002 processa o restante
  - Props: `isOpen, onClose, pcpId, ordemId, depositoId, setorId, onSuccess`

- `src/components/forms/SaidaOrdemModal.tsx`
  - Busca dados do PCP (total_metal, retorno_metal, total_geral_outros_pesos, metal_externo) ao abrir
  - Grid de referencia com os 4 valores do PCP
  - Campo peso com `autoFocus` — preview PMC/quebra calculado em tempo real (client-side)
  - Preview PMC/Quebra: 4 colunas (Consumo / PMC / Quebra / %Quebra) com cores por severidade:
    - Verde ≤ 3% | Amber ≤ 8% | Vermelho > 8%
  - Botao desabilitado enquanto peso nao e informado
  - INSERT em `saidas_ordem` — trigger 1003 processa PMC/quebra, PCP→concluido e auditoria
  - Props: `isOpen, onClose, pcpId, ordemId, depositoId, onSuccess`

**KanbanClient.tsx refatorado:**
- Importa os 3 modais (Apontamento, Transferencia, Saida)
- Estado unificado: `activeModal: ActiveModal` (union discriminada com `type` e `data`)
- Botoes contextuais por etapa:
  - Novas Ordens / Aguardando / Em Andamento → "Apontar" (esmeralda)
  - Em Andamento → "Transferir" (sky-700) + "Saida" (amber-700)
- Handlers: `handleApontar`, `handleTransferir`, `handleSaida` — cada um seta `activeModal` com o `type` correto
- Apos qualquer sucesso: `router.refresh()` para recarregar do servidor

### Armadilha descoberta

| Problema | Causa | Solucao |
|----------|-------|---------|
| `auditorias.tipo_auditoria` truncado | Coluna e varchar(10); 'saida_producao' tem 14 chars | Usar 'saida_pcp' (9 chars) |
| Trigger em cadeia (INSERT vazia dispara trigger de novo) | INSERT da transferencia vazia tambem aciona o trigger | Guard `IF setor_id IS NULL RETURN NEW` — safe, sem loop infinito |
| `WHERE id = ${uuidVar}::uuid` em coluna INTEGER | notificacoes.id e INTEGER, nao UUID — PostgreSQL rejeita o cast | Usar `parseInt(id)` para colunas INT; NUNCA ::uuid em colunas nao-UUID |
| `auditorias.tipo` nao existe | Coluna real e `tipo_auditoria`, nao `tipo` | Sempre verificar: SELECT column_name FROM information_schema.columns WHERE table_name='auditorias' |
| itens_ordem duas fontes | Ordens legadas: directus.itens_ordem_1; Ordens ERP: alissonerp.itens_ordem | Detectar via ordens.origem ('legado' vs 'erp') — API /api/ordens/[id]/itens faz isso automaticamente |
| servico_loja escondido no frontend | enum value existe no banco mas nao deve aparecer no dropdown | grep de servico_loja no frontend deve retornar 0 ocorrencias — nao exibir nunca |

### Proximos passos (Sessao 4.x)
- Migracao de PCPs legados do Directus para alissonerp.pcp (Sessao 5.1)
- Realtime subscriptions em PCP (Supabase Realtime) — Kanban atualiza sem refresh manual
- Formulario de nova ordem via UI

---

## Sessao 3.4 — Distribuicao (Flows 1007-1014)

### O que foi feito

**Migration 020** — `supabase/migrations/020_triggers_distribuicao.sql`:

- `fn_criar_fechamento_por_ordem()` — Flow 1012: trigger AFTER INSERT em `distribuicao_ordens`
  - Cria 1 fechamento vazio automaticamente ao vincular cada ordem
  - Design: trigger na junction table (nao chamada manual do frontend)

- `fn_processar_apontamento_dist()` — Flow 1007: trigger AFTER INSERT em `apontamentos_distribuicao`
  - TIPO 1 (ADD), 2 (EIMD): CE Dep1→DepDist + dist.total_metal += qtd
  - TIPO 3 (EPD): CE Dep1→DepDist + dist.total_pedras_un/g acumuladas
  - TIPO 5 (RMD), 6 (RPD): CE invertido DepDist→Dep1 + subtrai totais
  - TIPO 8 (EOID): INSERT saida simples do almox (sem par de entrada)
  - TIPO 9 (Ocorrencia): NULL — sem CE
  - Chama fn_criar_item_distribuicao (Flow 1011) para tipos 1-6

- `fn_criar_item_distribuicao(dist_id, insumo_id, dep_id, qtd, tipo)` — Flow 1011
  - Upsert em itens_distribuicao: tipos 5,6 subtraem, demais somam

- `fn_processar_outros_insumos_dist()` — Flow 1010: trigger AFTER INSERT em `outros_insumos_distribuicao`
  - CE SOID (saida do almox)
  - dist.total_outros_pesos e total_geral_outros_pesos += peso

- `fn_processar_fechamento_dist()` — Flow 1013: trigger AFTER INSERT OR UPDATE em `fechamentos_distribuicao`
  - Guard INSERT: skip se peso IS NULL ou <= 0
  - Guard UPDATE: skip se OLD.peso ja era > 0 (evita duplo acumulo)
  - ACUMULA no PCP — SOMA, NAO SUBSTITUI: pcp.total_metal += fechamento.pmc
  - CE TEDD (dep dist → dep1, insumo_id=1 como proxy)
  - Move ordem para local_atual=1 (Almoxarifado)
  - Cria transferencias_ordem vazia para a ordem
  - Copia itens_distribuicao → itens_ordem_insumos

- `fn_concluir_distribuicao()` — Flow 1014: trigger BEFORE UPDATE em `distribuicoes`
  - Ativa ao mudar etapas → 'concluido'
  - PMC Dist = peso_final - total_geral_outros_pesos (SEM metal_externo)
  - Quebra = (total_metal - retorno_metal) - PMC
  - % Quebra = quebra / metal_liquido * 100 (metal_liquido = total_metal - retorno_metal)
  - CE TEDMD (saida metal) e CE TEDPD (saida pedras, se houver)
  - Escreve pmc/quebra/porcentagem_de_quebra no proprio row (BEFORE trigger)

**Testes validados** via `scripts/apply_020_and_test.py` (100% verde):
- Flow 1012: fechamento criado ao inserir em distribuicao_ordens ✅
- Flow 1007: CE EIMD Dep1→Dep2, dist.total_metal=15g, itens_distribuicao=15g ✅
- Flow 1010: CE SOID, total_outros_pesos=0.5g ✅
- Flow 1013: PCP_A acumulou +7g, PCP_B +6g (soma), ordens→dep1, CE TEDD, itens copiados ✅
- Guard duplo acumulo: segundo UPDATE ignorado ✅
- Flow 1014: PMC=12g, Quebra=3g, %=20% (quebra/metal_liquido), CE TEDMD ✅

**Novos componentes:**

- `src/components/forms/NovaDistribuicaoModal.tsx`
  - Select setor (enum_setor_distribuicao)
  - Checklist de ordens com status='aguardando'
  - INSERT em distribuicoes + distribuicao_ordens (trigger cria fechamentos)

- `src/components/forms/ApontamentoDistModal.tsx`
  - Tipos filtrados por scope in ('distribuicao','ambos')
  - Select deposito + setor separados (nao vem do PCP)
  - INSERT em apontamentos_distribuicao

- `src/components/forms/FecharOrdemDistModal.tsx`
  - Lista ordens com status visual (pendente/fechado)
  - Selecionando ordem pendente: inputs peso + PMC
  - UPDATE em fechamentos_distribuicao → trigger 1013 acumula no PCP

- `src/components/forms/ConcluirDistModal.tsx`
  - Grid com dados da dist (entrada, retorno, outros)
  - Preview PMC/quebra em tempo real (formula dist: % = quebra/metal_liquido)
  - UPDATE distribuicoes SET etapas='concluido', peso_final → trigger 1014

- `src/components/DistribuicaoClient.tsx`
  - Lista: tabela com ID, setor, etapa badge, ordens, metal, PMC, %quebra colorido
  - Detalhe: 4 stat cards + botoes Apontar/Fechar/Concluir (so se em_andamento)
  - Apos concluir: volta a lista automaticamente

- `src/app/(dashboard)/distribuicao/page.tsx`
  - Server Component, query SQL com COUNT(ordens) via GROUP BY

**Sidebar + Permissoes atualizados:**
- Icone Layers adicionado ao ICON_MAP
- Menu Distribuicao em /distribuicao entre PCP e Estoque
- Roles: admin, gerente_fabrica, pcp

### Decisoes criticas

| Decisao | Detalhe |
|---------|---------|
| Flow 1013 ACUMULA | pcp.total_metal += fechamento.pmc (SOMA, nao substitui) |
| Guard duplo acumulo | UPDATE so processa se OLD.peso era NULL ou <= 0 |
| Flow 1012 como trigger | Trigger em distribuicao_ordens AFTER INSERT (mais limpo que chamada manual) |
| PMC Dist vs PCP | Dist: PMC = pf - outros (sem metal_ext); % = quebra/metal_liquido |
| TEDD usa insumo_id=1 | Proxy Ouro 18k para a CE de fechamento (aceitavel enquanto s/o 1 categoria) |

### Diferenca PMC PCP vs Distribuicao

| | PCP | Distribuicao |
|---|---|---|
| Formula PMC | pf - outros - metal_externo | pf - outros |
| Formula % | quebra / consumo * 100 | quebra / metal_liquido * 100 |
| Marcadores entrada | AD, EM, EP | ADD, EIMD, EPD |
| Marcadores retorno | RM, RP | RMD, RPD |
| Fechamento | direto (saidas_ordem) | por ordem (fechamentos_distribuicao) |

### Proximos passos (Sessao 3.5)
- Protocolo funcional: criar/concluir ida→cria PCPs, volta→cria aprovacoes (Flows 02,03,05,06)
- Migracao de PCPs e distribuicoes legados do Directus

---

## Sessao 3.5 — Protocolo Funcional (Flows 02, 03, 05, 06)

### O que foi feito

**Migration 021** — `supabase/migrations/021_triggers_protocolo.sql`:

- **Patch em `fn_processar_saida_ordem()`** — Guard adicionado: `IF NEW.peso IS NULL OR NEW.peso <= 0 THEN RETURN NEW`
  - Necessario porque Flow 03 cria `saidas_ordem` vazias (peso=NULL) antes de haver PCP
  - Sem esse guard, o trigger antigo levantava exception ao nao encontrar PCP para uma saida vazia

- **`fn_concluir_protocolo()`** — Flow 03 + 05: trigger BEFORE UPDATE em `protocolos`
  - Guard: so executa se `NEW.etapas = 'concluido'` e nao era concluido antes
  - **Direcao ida (Flow 03):** para cada ordem do protocolo:
    - INSERT `saidas_ordem` vazia (peso=NULL)
    - INSERT `pcp` com etapas='novas_ordens', zeros iniciais, `metal_externo` copiado da ordem
    - UPDATE ordens SET status='em_andamento'
  - **Direcao volta (Flow 05):** para cada ordem do protocolo:
    - INSERT `aprovacoes_consultora` com etapas='pendente', `consultora_id = o.vendedor_id`
  - Define `NEW.data_conclusao = now()` antes de salvar (BEFORE trigger)

- **`fn_aprovacao_para_entrega()`** — Flow 06: trigger AFTER UPDATE em `aprovacoes_consultora`
  - Guard: so executa se `NEW.etapas = 'aprovado'` e nao era aprovado antes
  - INSERT `preparacoes_entrega` com etapas='pendente'

- **`fn_processar_auditoria()`** — Flow 02: trigger AFTER UPDATE em `auditorias`
  - Guard: so executa se `NEW.situacao = 'aprovado'` e nao era aprovado antes, e `NEW.ordem_id IS NOT NULL`
  - Reutiliza `saidas_ordem` existente (ou cria uma vazia se nao existir)
  - INSERT `pcp` com zeros iniciais — cria PCP via aprovacao de auditoria

**Triggers criados:**
- `trg_concluir_protocolo` BEFORE UPDATE ON protocolos → fn_concluir_protocolo
- `trg_aprovacao_entrega` AFTER UPDATE ON aprovacoes_consultora → fn_aprovacao_para_entrega
- `trg_processar_auditoria` AFTER UPDATE ON auditorias → fn_processar_auditoria

**Testes validados** via `scripts/apply_021_and_test.py` (100% verde):
- Flow 03: protocolo ida concluido → 2 PCPs criados (novas_ordens, zeros), metal_externo copiado, ordens→em_andamento, data_conclusao preenchido ✅
- Guard peso NULL: saidas_ordem vazias nao disparam exception ✅
- Flow 05: protocolo volta concluido → aprovacoes_consultora pendente ✅
- Flow 06: aprovacao→aprovado → preparacoes_entrega pendente ✅
- Flow 02: auditoria→aprovado → PCP criado com zeros ✅

**Frontend refatorado — `/protocolo`:**

- `src/app/(dashboard)/protocolo/page.tsx` — reescrito com 4 queries paralelas:
  - Ida: `protocolos WHERE direcao='ida'` + COUNT de protocolo_ordens
  - Volta: `protocolos WHERE direcao='volta'` + COUNT de protocolo_ordens
  - Aprovacoes: `aprovacoes_consultora` + JOIN ordens (numero_ordem) + JOIN vendedores (nome)
  - Entregas: `preparacoes_entrega` + JOIN ordens (numero_ordem)

- `src/app/(dashboard)/protocolo/ProtocoloClient.tsx` — reescrito com 4 tabs:
  - **Tab Ida/Volta**: tabela com ID, status badge, ordens, datas + botao "Concluir" por linha (so em_andamento)
  - **Tab Aprovacoes**: tabela com ordem, consultora, status + botao inline "Aprovar" (pendente→aprovado → trigger cria preparacao)
  - **Tab Entregas**: tabela com ordem, status + botao inline "Concluir" (pendente→concluido)
  - Badge no tab mostra contagem de pendentes/em_andamento
  - Botao "Novo Protocolo Ida/Volta" no header (visivel apenas nas tabs Ida e Volta)

- `src/components/forms/NovaProtocoloModal.tsx` — novo:
  - Aceita `direcao: 'ida' | 'volta'`
  - Busca ordens via Supabase client (sem canceladas/entregues)
  - Checklist com busca inline
  - INSERT `protocolos` + `protocolo_ordens`

- `src/components/forms/ConcluirProtocoloModal.tsx` — novo:
  - Confirma conclusao do protocolo
  - Mostra preview do que o trigger vai criar (PCPs para ida, aprovacoes para volta)
  - UPDATE `protocolos SET etapas='concluido'` → trigger dispara automaticamente

### Decisoes criticas

| Decisao | Detalhe |
|---------|---------|
| BEFORE trigger em protocolos | Necessario para setar data_conclusao antes de salvar |
| Guard peso NULL em fn_processar_saida_ordem | Flow 03 cria saidas_ordem vazias — sem guard, levanta exception |
| consultora_id = vendedor_id (bigint) | aprovacoes_consultora.consultora_id FK para public.vendedores(id_vendedor), NAO auth.users |
| PCP com zeros iniciais | INSERT com total_metal=0, retorno_metal=0, etc. — sem arithmetica NULL |
| Flow 02 reutiliza saida_ordem existente | Busca a mais recente via ORDER BY id DESC LIMIT 1 |

### Fluxo completo pos-producao

```
Protocolo Ida (Loja→Fabrica) → concluido
  ↓ fn_concluir_protocolo (direcao='ida')
  Cria saidas_ordem vazia + pcp (novas_ordens) por ordem
  UPDATE ordens → em_andamento

[Produção acontece no PCP — Flows 1000-1003]

Protocolo Volta (Fabrica→Loja) → concluido
  ↓ fn_concluir_protocolo (direcao='volta')
  Cria aprovacoes_consultora (pendente) por ordem

Consultora aprova → aprovacoes_consultora.etapas='aprovado'
  ↓ fn_aprovacao_para_entrega
  Cria preparacoes_entrega (pendente)

Entrega concluida → preparacoes_entrega.etapas='concluido'
  [Fim do ciclo]

OU: Auditoria aprovada → auditorias.situacao='aprovado'
  ↓ fn_processar_auditoria (Flow 02)
  Cria pcp (novas_ordens) — entrada alternativa
```

### Proximos passos (Sessao 4.x)
- Migracao de PCPs e distribuicoes legados do Directus para alissonerp
- Realtime subscriptions no Kanban PCP
- Formulario de nova ordem via UI

---

## Sessao 3.6 — Lancamento Avulso + Compras (ULTIMO FLOW!)

### O que foi feito

**Migration 022** — `supabase/migrations/022_lancamento_avulso_compras.sql`:

- **`fn_processar_lancamento_avulso()`** — Flow 1006: trigger AFTER INSERT em `lancamentos_avulso`
  - Branch por `tipo_lancamento::text` (enum_tipo_lancamento: transferencia/entrada/saida/sangria)
  - **transferencia (TA):** CE dupla — saida dep_selecionado + entrada dep1 (Almoxarifado)
  - **entrada (EA):** INSERT simples — entrada no deposito selecionado (sem par)
  - **saida (SA):** INSERT simples — saida do deposito selecionado (sem par)
  - **sangria:** INSERT simples — entrada no dep1 (Almoxarifado), marcador 'Sangria'
  - Guard: tipo invalido levanta exception; tipo invalido de enum e bloqueado em nivel de DB

- **Tabelas novas:**
  - `alissonerp.compras` — id, fornecedor_id (FK public.contatos), situacao, total, obs, bloqueado, created_at
  - `alissonerp.itens_compra` — id, compra_id, insumo_id, deposito_id (default 1), qtd, valor_unitario, valor_total

- **`fn_calcular_item_compra()`** — BEFORE INSERT OR UPDATE em `itens_compra`
  - `NEW.valor_total = qtd * valor_unitario` (auto-calculado)

- **`fn_concluir_compra()`** — BEFORE UPDATE em `compras`
  - Guard: so executa se `NEW.situacao = 'concluido'` e nao era concluido antes
  - Para cada item: INSERT `movimentacoes_estoque` com marcador EA (entrada via compra)
  - Seta `NEW.bloqueado = true` e recalcula `NEW.total = SUM(itens_compra.valor_total)`

- **`fn_bloquear_compra()`** — BEFORE UPDATE em `compras`, trigger `trg_aa_bloquear_compra`
  - Prefixo `trg_aa_` garante execucao antes de `trg_concluir_` (ordem alfabetica do PostgreSQL)
  - Levanta exception se `OLD.bloqueado = true AND NEW.situacao != OLD.situacao`

**Testes validados** via `scripts/apply_022_and_test.py` (100% verde):
- Flow 1006 EA: entrada=50g dep=1 marcador=EA ✅
- Flow 1006 TA: CE dupla — saida dep2=10g + entrada dep1=10g marcador=TA ✅
- Flow 1006 SA: saida=2g dep=1 marcador=SA ✅
- Flow 1006 Sangria: entrada=5g dep=1 marcador=Sangria ✅
- Compras calcular: valor_total=39872.00 (qtd x valor_unitario automatico) ✅
- Compras concluir: CE EA criada, bloqueado=true, total calculado ✅
- Guard bloqueio: exception "Compra #X esta bloqueada para edicao" ✅

**Frontend novo:**

- `src/components/forms/LancamentoAvulsoModal.tsx` — modal no /estoque:
  - 4 botoes de tipo em grid 2x2 (Entrada, Saida, Transferencia, Sangria)
  - Info box dinamica com seta mostrando direcao (ex: "Dep Ourives 1 → Almoxarifado Central")
  - Label do deposito muda para "Deposito de Origem" na transferencia
  - Sangria: deposito destino fixo (Almoxarifado Central, readonly)
  - SELECT insumo + deposito carregados do Supabase ao abrir
  - INSERT em lancamentos_avulso → trigger Flow 1006 processa automaticamente
  - Botao "Lancamento Avulso" adicionado no header de EstoqueClient

- `src/app/(dashboard)/compras/page.tsx` — Server Component, query com JOIN contatos + COUNT itens

- `src/components/ComprasClient.tsx` — padrao lista/detalhe:
  - **Lista**: tabela ID, fornecedor, status badge, itens, total R$, data, icone cadeado
  - **Detalhe** (ao clicar): 3 stat cards + tabela itens + form inline "Adicionar Item" + botao "Concluir Compra"
  - Adicionar item: select insumo + deposito + qtd + valor_unitario (valor_total auto-calculado pelo trigger)
  - Concluir: UPDATE situacao='concluido' → trigger gera CE EA por item + bloqueia
  - Compra bloqueada: sem acoes, badge "Bloqueada" com icone cadeado
  - Modal "Nova Compra": select fornecedor (vw_contatos) + obs

- `permissions.ts` — /compras adicionado (admin, gerente_fabrica, estoquista_fabrica)
- `Sidebar.tsx` — ShoppingCart importado e no ICON_MAP

### Decisoes criticas

| Decisao | Detalhe |
|---------|---------|
| trg_aa_ prefixo | PostgreSQL executa triggers BEFORE na mesma tabela em ordem alfabetica — prefixo aa garante bloqueio antes de concluir |
| enum_tipo_lancamento protege | Tipos invalidos sao rejeitados pelo DB antes de chegar ao trigger |
| CE dupla so na transferencia | EA/SA/Sangria sao movimentacoes simples (sem par) — apenas TA tem CE completo |
| bloqueado via BEFORE trigger | BEFORE permite modificar NEW.bloqueado e NEW.total antes de salvar na mesma operacao |
| fornecedor_id → public.contatos | FK para id_contato (bigint) — tabela do PDV, readonly |

### Marcadores avulsos (Flow 1006)

| Tipo | Marcador | CE | Direcao |
|------|----------|----|---------|
| transferencia | TA | Sim (par) | dep_selecionado → dep1 |
| entrada | EA | Nao | externo → dep_selecionado |
| saida | SA | Nao | dep_selecionado → externo |
| sangria | Sangria | Nao | producao → dep1 (Almoxarifado) |

### MARCO — Todos os 22 flows reimplementados!

| Categoria | Flows | Sessao |
|-----------|-------|--------|
| PCP Apontamentos | 1000, 1001, 1004, 1005 | 3.2 |
| PCP Transferencia/Saida | 1002, 1003 | 3.3 |
| Distribuicao | 1007, 1008, 1010, 1011, 1012, 1013, 1014 | 3.4 |
| Protocolo | 02, 03, 05, 06 | 3.5 |
| Avulso/Compras | 1006, Compras, Bloqueio | 3.6 |

**FASE 3 COMPLETA.** Toda a logica de negocio do Directus foi reimplementada como triggers/functions no PostgreSQL (alissonerp).

**FASE 4 COMPLETA.**
- 4.1: PWA Motoboy ✅
- 4.2: Comercial + Financeiro ✅
- 4.3: Integracoes n8n + Dashboard Avancado + Configuracoes ✅

**Proximos passos (Fase 5):**
- 5.1: ETL directus→alissonerp (ordens, PCPs, distribuicoes, apontamentos)
- 5.2: Testes E2E ponta a ponta
- 5.3: Deploy + Go-Live

---

## Sessao 4.1 — PWA Motoboy

### O que foi feito

**Migration 023** — `supabase/migrations/023_storage_protocolo.sql`:
- Bucket `protocolo-fotos` criado (privado, 10MB, jpeg/png/webp)
- RLS Storage: `protocolo_fotos_upload` + `protocolo_fotos_select` para authenticated
- `protocolo_fotos` ampliada com `foto_url TEXT` (path Storage) + `foto_base64 TEXT` (fallback offline)

**PWA Assets:**
- `public/manifest.json` — `start_url=/protocolo`, `display=standalone`, tema `#184036`, 2 icones
- `public/icons/icon-192.png` + `icon-512.png` + `apple-touch-icon.png` — gerados via PIL: fundo esmeralda + "A" dourado
- `public/sw.js` — service worker: cache-first estaticos, network-first API/Supabase, pre-cache /protocolo + /login
- `src/app/layout.tsx` — meta tags PWA: `theme-color`, `apple-touch-icon`, `manifest`, `appleWebApp`; registro SW via script inline

**Layout Condicional por Role:**

- `src/components/layout/MotoboyLayout.tsx` — dark theme completo:
  - Header sticky: logo Gem dourado + "ALISSON/Motoboy" + nome usuario + bolinha pulsante Online + botao Sair
  - `main` com `pb-24` para nao sobrepor bottom nav
  - Bottom nav fixo: `safe-area-inset-bottom` (iOS notch) + icone Truck dourado
  - Cores: fundo `#184036`, cards `rgba(255,255,255,0.08)`, texto creme/sage, accent dourado

- `src/components/DashboardShell.tsx` — wrapper client que detecta role via `useAuth()`:
  - `loading` → spinner centralizado (evita flash de sidebar)
  - `role === 'motoboy'` → `MotoboyLayout` (dark, mobile, sem sidebar)
  - outros roles → layout desktop normal (Sidebar + main)

- `src/app/(dashboard)/layout.tsx` — simplificado para delegar ao `DashboardShell`

**Componente Mobile `ProtocoloMotoboy`:**

- `src/components/motoboy/ProtocoloMotoboy.tsx` — self-contained, 3 views internas:
  - **Lista**: cards em_andamento (dourado) + concluidos (esmaecidos), badge Realtime pulsante
    - Conta ordens por protocolo via query paralela
  - **Detalhe**: card info + lista ordens (FK join `protocolo_ordens → ordens.numero_ordem`) + area foto + botao concluir
  - **Camera**: fullscreen, `facingMode: environment` (camera traseira), moldura overlay esmeralda, botao shutter, erro amigavel
  - Realtime: subscription `postgres_changes` em `alissonerp.protocolos` → auto-recarrega lista
  - Upload foto: blob → `supabase.storage.from('protocolo-fotos').upload(path, blob)` → fallback `foto_base64` se Storage falhar
  - Salva `protocolo_fotos` row com `foto_url` ou `foto_base64`
  - Conclui: `UPDATE protocolos SET etapas='concluido'` → trigger `fn_concluir_protocolo` dispara automaticamente

- `src/app/(dashboard)/protocolo/page.tsx` — detecta role server-side:
  - `role === 'motoboy'` → retorna `<ProtocoloMotoboy />` sem SSR data desnecessario
  - outros roles → 4 queries SSR + `<ProtocoloClient />`

### Design Mobile (Tema Dark)

| Token | Valor |
|-------|-------|
| Fundo principal | `#184036` (esmeralda) |
| Cards | `rgba(255,255,255,0.08)` + backdrop-blur |
| Texto primario | `#F3EADA` (creme) |
| Texto secundario | `#80A795` (sage) |
| Accent / botao | `#DB9864` (dourado) |
| Botao concluir | `gradient(#DB9864 → #FEDDB4)`, `min-height: 56px`, `rounded-2xl` |
| Badge em andamento | `rgba(219,152,100,0.2)` text dourado |
| Badge concluido | `rgba(16,185,129,0.2)` text `#6EE7B7` |
| Touch targets | `min 48px`, `active:scale-[0.98]` |

### Decisoes criticas

| Decisao | Detalhe |
|---------|---------|
| DashboardShell vs layout server | Layout server nao tem acesso a role client-side — Shell e client component que detecta via useAuth() |
| role === 'motoboy' no page.tsx | Verificacao server-side via createServerSupabase() evita renderizar SSR queries desnecessarias para motoboy |
| Fallback foto_base64 | Se Storage offline, foto fica salva como base64 na tabela (campo adicionado na migration 023) |
| Realtime em alissonerp.protocolos | Tabela ja estava na publicacao supabase_realtime (migration 013) — subscription funciona sem configuracao extra |
| CameraTela useRef tipado | `useRef<HTMLVideoElement>(null)` — necessario para acessar videoWidth/videoHeight na captura |
| Camera traseira | `facingMode: 'environment'` — padrao para motoboy fotografar comprovante sem inverter |

---

## Sessao 4.2 — Comercial + Financeiro

### Migration 024 — `supabase/migrations/024_financeiro.sql`

Modulo financeiro completo:

| Tabela | Descricao |
|--------|-----------|
| `contas_pagar` | Contas a pagar, FK para compras + fornecedor |
| `contas_receber` | Contas a receber, FK para public.vendas + cliente |
| `fin_extratos_bancarios` | Extratos OFX importados via n8n |
| `fin_lancamentos_bancarios` | Lancamentos bancarios com `fitid VARCHAR(100) UNIQUE` (idempotencia OFX) |
| `fin_conciliacoes` | Vinculo lancamento bancario ↔ conta a pagar/receber |

Views criadas:
- `vw_resumo_financeiro` — UNION contas_pagar + contas_receber agrupadas por situacao
- `vw_vendas_completa` — public.vendas JOIN contatos JOIN vendedores (cross-schema, readonly)

**Testes validados** via `scripts/apply_024_and_test.py` (100% verde):
```
Migration 024 executada ✅
tabela contas_pagar ✅
tabela contas_receber ✅
tabela fin_extratos_bancarios ✅
tabela fin_lancamentos_bancarios ✅
tabela fin_conciliacoes ✅
view vw_resumo_financeiro ✅
view vw_vendas_completa ✅
vw_vendas_completa: 14146 vendas acessíveis ✅
contas_pagar INSERT: id=1, valor=1500.00, situacao=pendente ✅
contas_receber INSERT: id=1, valor=3200.00, situacao=pendente ✅
fin_lancamentos_bancarios INSERT: fitid=FIT-TEST-001, conciliado=False ✅
Guard fitid UNIQUE: duplicata rejeitada ✅
vw_resumo_financeiro com dados: 2 linhas ✅
```

### Pagina /vendas

`src/app/(dashboard)/vendas/page.tsx` — Server Component:
- Query `vw_vendas_completa` (LIMIT 500 ordenado DESC) + stats agregados
- `VendasClient.tsx` — 4 stat cards (total, valor, entregues, canceladas), filtro por busca livre + status, tabela completa

Roles com acesso: admin, gerente_fabrica, gerente_loja

### Pagina /financeiro

`src/app/(dashboard)/financeiro/page.tsx` — Server Component com 4 queries paralelas.

`FinanceiroClient.tsx` — 3 tabs:

| Tab | Conteudo |
|-----|----------|
| Contas a Pagar | Mini stats (pendente, vencido) + filtro status + tabela com badge vencimento |
| Contas a Receber | Mini stats (a receber, recebido) + filtro status + tabela |
| Conciliacao OFX | Selector de extratos + stats por extrato (entradas C, saidas D, conciliados) + tabela lancamentos com FITID |

Saldo liquido pendente no header (Receber - Pagar), com cor verde/vermelho.

Roles com acesso: admin, gerente_fabrica

### Sidebar

Adicionados `ShoppingBag` (Vendas) e `DollarSign` (Financeiro) em `Sidebar.tsx` e `permissions.ts`.

---

## Sessao 4.3 — Integrações n8n + Dashboard Avançado

### Migration 025 — `supabase/migrations/025_webhooks_dashboard.sql`

| Tabela / Objeto | Descricao |
|-----------------|-----------|
| `webhook_config` | 9 webhooks n8n configurados (nome UNIQUE, url, ativo, ultimo_disparo, total_disparos) |
| `webhook_log` | Log de todos os disparos (webhook_nome, payload JSONB, response_status, erro) |
| `fn_disparar_webhook(nome, payload)` | Registra no log + atualiza contador. HTTP feito pelo frontend. |
| `vw_producao_mensal` | Ordens por mes (ultimos 12 meses) de directus.ordens — usa `peso_metal_negocido` (typo historico do banco) |
| `vw_produtividade_ourives` | PCPs concluidos (etapas='5') por operador com media de quebra |
| `vw_kpis_gerais` | Snapshot: ordens em andamento/aguardando, concluidas no mes, PCPs ativos, protocolos pendentes, cotacoes, financeiro |
| `vw_ordens_por_tipo` | Contagem por tipo_ordem dos ultimos 6 meses |

**Testes validados** via `scripts/apply_025_and_test.py` (100% verde):
```
9 webhooks configurados ✅
KPIs: 46 ordens andamento, 45 aguardando, 11 concluidas no mes, cotacao_ouro=398.72 ✅
Producao mensal: Feb/26=198 ordens (158 concluidas), Mar/26=32 ✅
Tipos: Gravacao=115, Reparo=103, Producao=77 ✅
Ourives: 5 com PCPs concluidos, maior quebra Carlos Eduardo 35.92% ✅
fn_disparar_webhook: log registrado, contador atualizado ✅
```

### lib/webhooks.ts

`src/lib/webhooks.ts` — helper client-side para disparar webhooks n8n:
- Busca URL na `webhook_config` via Supabase (schema alissonerp)
- Faz `fetch POST` para o endpoint n8n
- Registra no log via `rpc fn_disparar_webhook`
- Em caso de erro de rede: registra no webhook_log com campo `erro`

### Integracoes ativas

| Componente | Evento | Webhook |
|------------|--------|---------|
| `ProtocoloMotoboy.tsx` | `handleConcluir` apos UPDATE etapas=concluido | `notificar-protocolo` |
| `ProtocoloClient.tsx` | `aprovarConsultora` apos UPDATE etapas=aprovado | `notificar-aprovacao` |
| `FinanceiroClient.tsx` (TabConciliacao) | Botao "Reprocessar" no card de extrato | `processar-ofx` |

Todos os disparos sao **fire-and-forget** (nao bloqueiam UI).

### Decisao: HTTP pelo frontend, nao pg_net

Supabase self-hosted nao garante extensao `pg_net`. Webhooks sao disparados via `fetch()` no frontend e logados no banco via `fn_disparar_webhook`.

### Dashboard Avancado — `src/components/DashboardClient.tsx`

`src/app/(dashboard)/page.tsx` reescrito com 5 queries paralelas via views da migration 025:

| Query | View |
|-------|------|
| KPIs | `vw_kpis_gerais` |
| Producao mensal | `vw_producao_mensal` (reversed para ordem cronologica) |
| Ordens por tipo | `vw_ordens_por_tipo` |
| Ranking ourives | `vw_produtividade_ourives` (top 5) |
| Atividade recente | `vw_ordens_completa` (LIMIT 8, DESC) |

`DashboardClient.tsx` — componente client com Recharts:
- **Header**: cotacao ouro (dourado) + cotacao dolar (sage)
- **4 KPI cards**: Em Andamento, Concluidas no Mes, Protocolos Pendentes, Saldo Financeiro (verde/vermelho)
- **AreaChart**: Producao mensal — Total (esmeralda) + Concluidas (dourado), gradiente fill, tooltip customizado dark
- **PieChart**: Tipos de ordem ultimos 6 meses — innerRadius=30 (donut), legenda lateral manual
- **BarChart horizontal**: Top 5 ourives — barras Ordens (esmeralda) + Quebra% (dourado), layout vertical
- **Feed recente**: Ultimas 8 ordens com badge de status colorido e barra lateral esquerda
- **4 mini cards financeiros**: A Pagar, A Receber, PCPs Ativos, Aguardando

Paleta Recharts:
```
Areas/barras: #184036 (esmeralda) com gradient fill
Linha concluidas: #DB9864 (dourado)
Tooltip: bg #0F2922, border #1C3D32, cor dourado no label
```

### Pagina /configuracoes (somente admin)

`src/app/(dashboard)/configuracoes/page.tsx` — Server Component com guard de role:
- Redireciona para `/` se `user_metadata.role !== 'admin'`
- 4 queries paralelas: parametros, webhook_config, webhook_log (30 recentes), usuarios

`ConfiguracoesClient.tsx` — 3 tabs:

| Tab | Funcionalidade |
|-----|---------------|
| Parametros | Editar cotacao_ouro, cotacao_dolar, cotacao_euro, cotacao_prata via UPDATE alissonerp.parametros WHERE id=1 |
| Webhooks | Tabela com toggle ativo/inativo + botao Testar (dispara com `{teste:true}`) + log scrollavel dos ultimos 30 disparos com badge HTTP status |
| Usuarios | Lista somente leitura dos usuarios cadastrados em alissonerp.usuarios com role badge |

Sidebar: adicionado icone `Settings` — visivel apenas para `admin`.

### Proximos passos (Sessao 5.x)
- 5.1: ETL directus→alissonerp (ordens, PCPs, distribuicoes)
- 5.2: Testes E2E ponta a ponta
- 5.3: Deploy + Go-Live

---

## Sessao 5.1 — ETL Migracao directus → alissonerp

### Contexto

O sistema anterior usava Directus como camada de acesso ao banco. Os dados ficavam no schema `directus` e o novo ERP (schema `alissonerp`) estava vazio. Esta sessao migrou todos os dados historicos.

**Regras criticas:**
- NUNCA deletar dados do directus — apenas COPIAR
- Scripts idempotentes (ON CONFLICT DO NOTHING)
- Triggers desabilitados durante INSERT (evitar audit log de migracao)
- Validacao de contagens apos cada etapa

### Backup Pre-Migracao

Backup criado antes de qualquer alteracao:
```
backups/backup_alissonerp_pre_migracao_20260307_223928.sql  (278 KB)
Ferramenta: pgAdmin 4 pg_dump (/c/Program Files/pgAdmin 4/runtime/pg_dump.exe)
```

### Scripts de Migracao

| Script | Origem → Destino | Registros |
|--------|-----------------|-----------|
| `scripts/migration/001_insumos.py` | directus.insumos → alissonerp.insumos | 250 |
| `scripts/migration/002_ordens.py` | directus.ordens → alissonerp.ordens | 428 |
| `scripts/migration/003_pcp.py` | directus.saida_ordem → saidas_ordem + directus.pcp → alissonerp.pcp | 482 + 382 |
| `scripts/migration/004_estoque.py` | directus.controle_estoque → alissonerp.movimentacoes_estoque | 1.711 |
| `scripts/migration/005_resto.py` | distribuicao + protocolo + transferencia_ordem + aprovar_consultora + preparando_entrega | 82+67+404+356+324 |
| `scripts/migration/006_views.py` | Recriar 17 views apontando para alissonerp.* | — |

### Mapeamentos criticos descobertos

| Campo | Tipo directus | Tipo alissonerp | Solucao |
|-------|--------------|-----------------|---------|
| `ordens.peso_metal_negocido` | real (TYPO historico) | `peso_metal_negociado` | Alias no SELECT |
| `ordens.protocolo_loja` | VARCHAR | boolean | `::boolean` cast |
| `ordens.local_atual` | int → deposito_id (FK) | deposito_id FK | CASE WHEN EXISTS |
| `pcp.saida_ordem` | int (coluna) | `saida_ordem_id` | Renomeado |
| `pcp.Bloqueado` | boolean (uppercase!) | `bloqueado` | Quoted `"Bloqueado"` |
| `controle_estoque.setor` | int | `setor_id` | Mesmo valor, col renomeada |
| `controle_estoque.marcador 'E'` | 1 linha | nao existe no enum | Mapeado → 'ENTRADA' |
| `distribuicao.setor` | varchar '1'-'7' | enum_setor_distribuicao | CASE mapeado |
| `protocolo.rota` | 'Loja -> Fabrica' | enum_direcao_protocolo | 'ida' |
| `user_created/operador` UUIDs | auth.users FK | auth.users FK | CASE WHEN EXISTS |
| depositos 9-12 | inexistentes em alissonerp | — | NULL |

### Views Recriadas (006_views.py)

Todas as views que referenciam `directus.*` foram reescritas para usar `alissonerp.*`.
Mudancas principais:
- ENUMs: comparacoes de texto ('1','2','3') → enum text values ('criado','em_andamento',...)
- Tabelas: `directus.setor.descricao` → `alissonerp.setores.nome`
- Colunas: `date_created/updated` → `created_at/updated_at`
- Usuarios: `directus.directus_users (first_name,last_name)` → `public.user_profiles.name`
- Views ainda em directus (nao usadas pelo frontend): `vw_estoque_directus`, `vw_pcp_completa`, `vw_protocolos_loja_completo`

### Estado pos-migracao

```
alissonerp.ordens:                428 (= directus) ✓
alissonerp.pcp:                   382 (= directus) ✓
alissonerp.saidas_ordem:          482 (directus=522; 40 ignoradas por ordens faltantes)
alissonerp.movimentacoes_estoque: 1721 (1711 migradas + 10 teste preexistentes) ✓
alissonerp.distribuicoes:         83 (82 migradas + 1 teste) ✓
alissonerp.protocolos:            69 (67 migradas + 2 teste) ✓
alissonerp.transferencias_ordem:  404 (= directus) ✓
alissonerp.aprovacoes_consultora: 356 (= directus) ✓
alissonerp.preparacoes_entrega:   324 (= directus) ✓
```

### Nao migrados (complexidade ou nao necessarios)

- `directus.apontamento` → `alissonerp.apontamentos_pcp` (vw_apontamentos_ordem retorna vazio por ora)
- `directus.distribuicao_ordens` → 0 linhas no directus, pular
- `distribuicao_id` nas ordens permanece NULL (nao havia dados em directus.distribuicao_ordens)

---

## PostgREST — Schema alissonerp não exposto

O schema `alissonerp` **NÃO** está no `PGRST_DB_SCHEMAS` do PostgREST.
Todo `supabase.from("tabela_alissonerp")` falha silenciosamente (retorna 406 ou vazio).

**Supabase Storage** (`supabase.storage.from()`) e **GoTrue** (`supabase.auth`) **NÃO são afetados** — usam endpoints próprios `/storage/v1/` e `/auth/v1/`.

**Solução:** API routes Next.js com SQL direto via `sql` de `@/lib/db`.

### API Routes existentes

| Rota | Método | Função |
|------|--------|--------|
| `/api/protocolo` | GET | Lista protocolos (filtro user_id ou todos=true) |
| `/api/protocolo` | POST | Criar protocolo + vincular ordens |
| `/api/protocolo/ordens` | GET | Ordens prontas para ida/volta (`?direcao=ida\|volta`) |
| `/api/protocolo/concluidos` | GET | Protocolos concluídos com ordens (histórico) |
| `/api/protocolo/[id]` | GET | Ordens de um protocolo específico |
| `/api/protocolo/[id]` | PATCH | Concluir protocolo (etapas, recebedor_id, foto_conclusao) |
| `/api/aprovacao/[id]` | PATCH | Aprovar consultora |
| `/api/entrega/[id]` | PATCH | Concluir preparação de entrega |
| `/api/user/role` | GET | Role do usuário (`?user_id=uuid`) via bridge auth.users→user_profiles |

| `GET/POST` | `/api/locais-estoque` | CRUD locais de estoque (GET: lista ativos; POST: criar — admin/dev) |
| `PATCH` | `/api/locais-estoque/[id]` | Editar local (id=1 Fábrica não pode ser desativado) |
| `POST` | `/api/estoque/transferir-local` | CE dupla entre locais com validação de saldo (marcador TA) |
| `PATCH` | `/api/compras/[id]/receber` | Marcar compra como recebida (data_recebimento, recebido_por) |

**Regra:** Todo novo acesso ao `alissonerp` a partir do client → API route. NUNCA `supabase.from()`.

### Bridge de roles (CRÍTICO)

`user_profiles.id_user` ≠ `auth.users.id` (sistemas diferentes geraram UUIDs distintos).
Lookup de role sempre via bridge por email:

```sql
SELECT up.role
FROM public.user_profiles up
JOIN auth.users au ON au.email = up.email
WHERE au.id = $user_id::uuid
```

---

## Protocolo — Regras de Negócio

### Criação
- Quem: `logistica` (motoboy) ou `admin`/`gerente`/`financeiro`
- Foto obrigatória → campo `foto_criacao` em `alissonerp.protocolos`
- `motoboy_id` = UUID do GoTrue de quem criou
- Ordem já vinculada a qualquer protocolo ida (qualquer etapa) → não pode ser selecionada novamente

### Conclusão
- Quem pode: `admin`, `gerente`, `financeiro`
- Quem NÃO pode: `logistica` (motoboy) — bloqueado no frontend E na API (403)
- Foto obrigatória → campo `foto_conclusao`
- `recebedor_id` = UUID do GoTrue de quem concluiu
- Validação dupla: frontend esconde botão + API verifica role antes do UPDATE

### Pós-conclusão — `fn_concluir_protocolo` (NÃO MEXER)
- **Ida:** cria `saida_ordem` + PCP em `novas_ordens` para cada ordem
- **Volta:** cria `aprovacao_consultora` para cada ordem

### Views de disponibilidade
- `vw_ordens_prontas_ida`: ordens com auditoria loja aprovada + rota=protocolo + sem nenhum protocolo ida (qualquer etapa)
- `vw_ordens_prontas_volta`: ordens com PCP concluído + auditoria fábrica aprovada + sem nenhum protocolo volta

### Tabs na tela `/protocolo`
- **Ida:** protocolos pendentes direção ida
- **Volta:** protocolos pendentes direção volta
- **Entregas:** protocolos concluídos — histórico com ordens, quem entregou, quem recebeu

---

## Roles — `public.user_profiles.role`

| Role | Acesso |
|------|--------|
| `admin` | TUDO |
| `gerente` | Ordens + protocolo (cria e conclui) + auditoria |
| `financeiro` | Auditoria fábrica + protocolo (cria e conclui) |
| `motoboy` | Motoboy: protocolo (só cria, NUNCA conclui) — PWA dark theme |
| `logistica` | **LEGADO** — não usar. Causa erro de constraint. Usar `motoboy`. |
| `consultora` | Só suas ordens + corrige reprovadas |
| `producao` | Só PCP (apontar/transferir) |
| `user` | Acesso básico |

**Constraint no banco:** `user_profiles_role_check` limita aos valores acima. Para adicionar novo role → `ALTER TABLE public.user_profiles DROP CONSTRAINT user_profiles_role_check` + recriar com novo valor.

**Roles que podem concluir protocolo:** `admin`, `gerente`, `financeiro` (verificado em `/api/protocolo/[id]` PATCH e no `ConcluirProtocoloModal`).

---

## PostgREST Bypass

`alissonerp` NÃO está exposto no `PGRST_DB_SCHEMAS`.
`supabase.from("alissonerp.*")` falha silenciosamente (retorna `[]`).
**Solução:** API routes Next.js com `pg.Pool` (SQL direto via `src/lib/db.ts`).
20+ endpoints criados. Ver MEMORY.md seção 12.

**Regra:** Todo acesso ao `alissonerp` a partir do client → API route. NUNCA `supabase.from()`.
`supabase.auth.getUser()` e `supabase.storage` funcionam normalmente.

---

## Apontamentos PCP

### Tipos (IDs 1-9 fixos no banco)
- **1 — Aditivo de Metal:** usa depósito/setor que já está no card PCP (read-only na UI)
- **2 — Entrada de Metal:** usuário seleciona depósito/operador + setor

### Fluxo Entrada de Metal (tipo 2)
1. Seleciona depósito/operador + setor + insumo (Metal/Ouro, cat. 1, estoque > 0)
2. Digita peso + tira foto da balança
3. IA valida: peso digitado vs. peso lido na foto (tolerância zero — bloqueia se divergir)
4. Salva → trigger `fn_processar_apontamento_pcp` cria movimentação dupla-entrada (saída almox → entrada depósito operador)

### Fluxo Aditivo de Metal (tipo 1)
- Idêntico ao tipo 2, exceto depósito/setor vêm do PCP (não editável)
- Validação de estoque no backend: `vw_saldo_estoque WHERE deposito_id=1 AND insumo_id=X`
- Erro HTTP 422 se saldo insuficiente

### IA multi-provedor
- Provedores: Claude (`claude-sonnet-4-20250514`), OpenAI (`gpt-4o`), Gemini (`gemini-2.5-flash`)
- ⚠️ Modelos reais em uso (28/03/2026 — configuracoes_sistema). Gemini: gemini-2.5-flash (NÃO gemini-2.0-flash).
- Config em `configuracoes_sistema` + `configuracoes_secrets`
- Lib: `src/lib/ia-validar-peso.ts`
- Tolerância: `Math.abs(a - b) < 0.005`
- IA desabilitada → aceita sem conferência

### Pós-apontamento
- PCP move automaticamente `novas_ordens` → `em_andamento`
- Card do kanban é clicável → abre `PCPDetalheModal` (drawer lateral)
- Painel: dados da ordem + histórico de apontamentos com fotos + botões Apontar/Transferir/Saída condicionais por etapa

### Storage
- Bucket `apontamento-fotos` (privado, 10 MB, jpg/png/webp)
- Signed URLs geradas no frontend via `supabase.storage.createSignedUrl` (3600s)

---

## Estoque

```
Ouro Total (pote) = SÓ depósito geral (ID=1) — outros são operadores
Saldo real: vw_saldo_estoque (NÃO insumos.saldo — legado/desatualizado)
Depósito = Operador (label "Depósito/Operador" na UI)
vw_saldo_pote: agrega por categoria, filtro WHERE deposito_id = 1
vw_detalhe_pote: saldo detalhado por insumo (usar no catálogo, não insumos.saldo)
```

---

## Cadastros Operacionais

| Módulo | Rota | Observação |
|--------|------|------------|
| Insumos | `/insumos` | CRUD completo + saldo do pote |
| Depósitos | `/configuracoes` aba Depósitos | CRUD — ID=1 protegido (Almoxarifado Central) |
| Setores | `/configuracoes` aba Depósitos | CRUD — vinculado ao depósito (`deposito_id` FK) |
| IA | `/configuracoes` aba IA | provedor, API keys, toggle on/off, teste |
| Usuários | `/configuracoes` aba Usuários | já existia |
| Categorias | — | 8 fixas no banco, sem tela |
| Tipos Apontamento | — | IDs 1-9 fixos no banco, sem tela |
| Conferência | `/conferencia` | Aprovar/reprovar `aprovacoes_consultora` (etapas: pendente→aprovado/reprovado). Roles: desenvolvedor, admin, gerente_loja, consultora |
| Entrega | `/entrega` | Concluir `preparacoes_entrega` (etapas: pendente→concluido). Roles: desenvolvedor, admin, gerente_loja |

---

## Sidebar — Estrutura de Navegação

```
📊 Dashboard
🏭 Fábrica       → Dashboard Fábrica
🔧 Produção      → Ordens, PCP, Distribuição
📦 Suprimentos   → Estoque, Quebra, Insumos, Compras
🚚 Logística     → Protocolo, Conferência, Entrega
✅ Qualidade     → Auditoria
💼 Comercial     → Vendas, Financeiro, Produtos, Precificação
⚙️ Configurações
```

Roles controlam visibilidade de cada item via `src/lib/permissions.ts`.


---

## Migration 047 — distribuicao_deposito

Adiciona deposito_id e setor_id (FKs) à tabela distribuicoes. Mudança aditiva.

Schema real distribuicoes: etapas (enum, NÃO status), setor (enum legado, nullable), deposito_id (novo FK), setor_id (novo FK).
distribuicao_ordens: coluna chama ordens_id (NÃO ordem_id).
contatos: PK é id_contato (NÃO id). Join: o.cliente_id = c.id_contato.
ordens: coluna peso_metal_negociado (NÃO peso_negociado).

## Módulo Distribuição C1 (11/03/2026)

Kanban 2 colunas + modal criar + detalhe inline ordens.

Arquivos:
- page.tsx: server component SQL com deposito_nome, setor_nome, criado_por
- DistribuicaoClient.tsx: Kanban + detalhe + lista ordens + barra progresso
- NovaDistribuicaoModal.tsx: deposito→filtra setores, ordens+busca, POST /api/distribuicao
- /api/distribuicao: GET (lista+filtro etapas) + POST (criar)
- /api/distribuicao/ordens-disponiveis: ordens sem dist. ativa
- /api/distribuicao/[id]: dist + ordens + fechamentos

Concluidas = fechamentos_distribuicao.peso > 0.
Deposito ID=1 excluído da seleção (é Almoxarifado, não operador).
Backward compat: cards antigos sem deposito_id usam SETOR_LABEL fallback.

Próximas: C2=Apontamentos, C3=Saída por ordem, C4/C5=Conclusão.

---

## Auditoria Completa do Projeto (17/03/2026)

### Totais reais (verificados via queries ao banco)

| Item | Valor |
|------|-------|
| Arquivos .ts/.tsx | 167 |
| API routes (route.ts) | 88 |
| Componentes .tsx | 32 |
| Hooks .ts | 1 (useAuth) |
| Libs .ts | 11 |
| Páginas (page.tsx) | 20 |
| Tabelas alissonerp | 60 (inclui backups) |
| Views alissonerp | 43 |
| Triggers alissonerp | 33 (22 trigger names, multi-event) |
| Funções alissonerp | 27 |
| Migrations | 072 (sem 042 em disco) |
| Buckets Storage | 5 |

### Módulo de Comentários de Ordem (migrations 069-071)

**Tabela principal:** `alissonerp.comentarios_ordem` (NÃO `ordem_comentarios`)

Colunas: id, ordem_id, autor_id UUID, texto, mencoes UUID[], editado, editado_em,
excluido (soft delete), excluido_em, excluido_por UUID, texto_original, foto_path TEXT, created_at

**Tabela legada (NÃO usar):** `alissonerp.ordem_comentarios` — sem foto_path/excluido, era a tabela antiga

**API routes:**
- `GET /api/ordens/[id]/comentarios` — lista comentários não excluídos, inclui foto_path
- `POST /api/ordens/[id]/comentarios` — body: {texto, mencoes?, foto_path?} + cria notificações
- `PATCH /api/ordens/[id]/comentarios/[id]` — editar texto (somente autor)
- `DELETE /api/ordens/[id]/comentarios/[id]` — soft delete (autor ou admin/desenvolvedor)

**Upload de fotos em comentários:**
1. Client faz upload direto: `supabase.storage.from("ordem-fotos").upload("comentarios/{ordemId}/...", file)`
2. Client envia `foto_path` junto com o texto via `POST /api/ordens/[id]/comentarios`
3. Signed URLs geradas no carregamento: `supabase.storage.from("ordem-fotos").createSignedUrl(path, 3600)`

**Notificações:** INSERT em `alissonerp.notificacoes` para cada mencao UUID que não seja o próprio autor

### Galeria de Fotos de Ordem (migration 071)

**Campo:** `alissonerp.ordens.fotos_paths TEXT[]`

**Duas fontes de fotos:**
1. PDV: `directus.ordens.arquivos_path` → bucket `imagens` (público, URL direta)
2. ERP: `alissonerp.ordens.fotos_paths` → bucket `ordem-fotos` (privado, signed URLs 1h)

**Componente:** `src/components/ordem/GaleriaFotosOrdem.tsx`
- Grid de thumbnails com badge "PDV" ou "ERP"
- Lightbox com navegação por teclado
- Upload client-side → register via API
- Remoção: somente admin/desenvolvedor, remove do storage também

### Storage Buckets (todos os 5)

Ver tabela completa em `project_storage_buckets.md`.

```
avatars         → PÚBLICO, 10MB — foto usuários
imagens         → PÚBLICO, sem limite — legado PDV (NÃO usar para ERP)
protocolo-fotos → privado, 10MB — fotos de protocolo
apontamento-fotos → privado, 10MB — fotos balança
ordem-fotos     → privado, 10MB, +heic — fotos ordens e comentários
```

### public.user_profiles — Estrutura real

Ver detalhes completos em `project_user_profiles.md`.

Colunas principais: id_user (PK+UNIQUE), email, password_hash, name, role, avatar_url, phone, created_at, updated_at, last_login, is_active, vendedor_id, mx_desconto_permitido

**BUG POTENCIAL:** `user_profiles_role_check` aceita apenas: admin, consultora, user, gerente, producao, logistica, financeiro — NÃO inclui roles ERP como desenvolvedor/ourives/gerente_fabrica. A API `/api/user/avatar` faz upsert com `COALESCE(u.role::text, 'user')` o que pode violar a constraint para roles como 'desenvolvedor'.

### Roles — após migration 068

- `alissonerp.usuarios.role` = VARCHAR(50) (era ENUM antes)
- `alissonerp.roles` = tabela de metadados (10 roles + 'administrativo' extra no banco)
- 10 roles válidas: desenvolvedor, admin, gerente_fabrica, gerente_loja, ourives, motoboy, consultora, estoquista_fabrica, estoquista_loja, pcp

### API de Rastreio de Ordens

`GET /api/ordens/rastreio?inicio=YYYY-MM-DD&fim=YYYY-MM-DD`

Retorna ordens do período agrupadas em 6 categorias:
- `pcp`: PCP ativo (não concluído/cancelado)
- `protocolo_ida`: protocolo direcao='ida', etapas='pendente'
- `protocolo_volta`: protocolo direcao='volta', etapas='pendente'
- `auditoria`: auditorias situacao IN ('pendente','em_analise','pendenciado')
- `conferencia`: aprovacoes_consultora etapas IN ('pendente','aguardando')
- `entregues`: preparacoes_entrega etapas='concluido'

Consultoras: filtradas por vendedor_id automaticamente.

---

## Go-Live e Reset do Banco (18/03/2026)

### TRUNCATE das Tabelas Transacionais

18 tabelas zeradas com RESTART IDENTITY CASCADE:
```
ordens, pcp, saidas_ordem, apontamentos_pcp, distribuicoes, distribuicao_ordens,
distribuicao_saida_pedras, transferencias_ordem, protocolos, protocolo_ordens,
protocolo_fotos, auditorias, quebra_operador, movimentacoes_estoque,
controle_estoque, comentarios_ordem, notificacoes, markup_alteracoes
```

Storage limpo: apontamento-fotos, protocolo-fotos, ordem-fotos.
Tabela `backup_mov_pedras_20260310` dropada.
Cadastros mantidos intactos: insumos, depositos, setores, tipos_apontamento, usuarios, roles,
produto_composicao, markup_pedras, configuracoes_sistema, configuracoes_secrets.

### Migração de Ordens do Directus (443 ordens)

```sql
-- Fonte: directus.ordens WHERE situacao = '2'
-- Destino: alissonerp.ordens com origem = 'legado'
```

- Coluna `origem VARCHAR(20) DEFAULT 'erp' NOT NULL` adicionada em alissonerp.ordens
- Mapeamento tipo_ordem: CASE '1'→'servico_venda', '2'→'fabricacao', etc.
- Rota: servico → protocolo forçado pelo mapeamento
- numero_pedido: lookup em public.vendas (NÃO public.pedidos)
- id_ordem_relacionada: 45 links mapeados
- Sequence ajustada: próximo ID = 1330

23 ordens receberam auditoria loja pendente para produção imediata.

---

## Módulo Criação de Ordens (18/03/2026)

### Tabela alissonerp.itens_ordem

```sql
CREATE TABLE alissonerp.itens_ordem (
  id            SERIAL PRIMARY KEY,
  ordem_id      INTEGER NOT NULL REFERENCES alissonerp.ordens(id),
  produto_id    BIGINT REFERENCES public.produtos(id_produto),
  nome_produto  TEXT,   -- desnormalizado para performance
  sku           TEXT,   -- desnormalizado para performance
  quantidade    INTEGER NOT NULL DEFAULT 1,
  peso_estimado NUMERIC(10,2),
  observacao    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

Ordens do PDV → `directus.itens_ordem_1` | Ordens do ERP → `alissonerp.itens_ordem`

### Coluna alissonerp.usuarios.tipos_ordem_permitidos

```sql
ALTER TABLE alissonerp.usuarios
  ADD COLUMN tipos_ordem_permitidos JSONB DEFAULT '[]'::jsonb NOT NULL;
```

- Array de tipos: ex. `['fabricacao', 'garantia']`
- `[]` vazio = sem permissão de criar ordens
- admin/desenvolvedor ignoram (fullAccess = sem filtro)
- Gerenciado via PATCH /api/user/[id]

### Novos campos em alissonerp.ordens (servico_venda)

```sql
ALTER TABLE alissonerp.ordens
  ADD COLUMN foto_peca_servico   TEXT,             -- path no bucket ordem-fotos
  ADD COLUMN peso_peca_servico   NUMERIC(10,2),    -- gramas
  ADD COLUMN video_observacao    TEXT,             -- path no bucket ordem-videos
  ADD COLUMN origem              VARCHAR(20) NOT NULL DEFAULT 'erp';
```

### Enum tipo_ordem — mudanças (migrations 073)

- `servico` → renomeado para `servico_venda` (105 ordens migradas)
- `servico_loja` → adicionado ao enum (OCULTO no frontend)
- Trigger ponte atualizado: `"1"` → `'servico_venda'`
- Views recriadas: vw_ordens_completa, vw_ordens_por_tipo, vw_ordem_detalhe

### API Routes novas

| Rota | Método | Função |
|------|--------|--------|
| `/api/ordens` | POST | Cria ordem + itens + auditoria loja (transação atômica) |
| `/api/ordens/contatos` | GET | Autocomplete clientes (`?busca=`) |
| `/api/ordens/vendedores` | GET | Lista vendedores ativos |
| `/api/ordens/produtos-busca` | GET | Busca produtos ativos (`?busca=`) |
| `/api/ordens/[id]/itens` | GET | Itens da ordem — detecta origem automaticamente |

### Fluxo POST /api/ordens

```
1. Valida tipos_ordem_permitidos do usuário (admin/dev ignoram)
2. numero_ordem = MAX(alissonerp.ordens.id, directus.ordens.id) + 1
3. rota = servico_venda → 'protocolo'; demais → 'pcp'
4. INSERT alissonerp.ordens (origem='erp')
5. INSERT alissonerp.itens_ordem (bulk, todos os itens)
6. INSERT alissonerp.auditorias (tipo='loja', situacao='pendente')
7. COMMIT — tudo ou nada
```

---

## Mobile Responsivo (18/03/2026)

### Breakpoint Principal

- `md: 768px` (padrão Tailwind v4)
- Abaixo de md = mobile | Igual ou acima = desktop

### Estrutura Layout Mobile

```
DashboardShell.tsx
  ├── SidebarProvider (SidebarContext.tsx)
  ├── MobileHeader.tsx  (fixo h-14, só < 768px)
  │     ├── Botão ☰ → toggle sidebar
  │     ├── Logo "ALISSON"
  │     └── Avatar usuário
  ├── Sidebar.tsx  (desliza da esquerda no mobile)
  │     └── Overlay escuro (z-50, clique fecha)
  └── main content (mt-14 mobile, mt-0 desktop)
```

### Padrões de Responsividade

| Elemento | Mobile | Desktop |
|----------|--------|---------|
| Tabelas | Oculta (`hidden md:block`) | Visível |
| Cards (MobileCard) | Visível (`block md:hidden`) | Oculto |
| Modais | Bottom-sheet (`rounded-t-2xl, bottom-0, w-full`) | Centralizado |
| Drawers | `w-full` | Largura original |
| Kanban | `overflow-x-auto snap-x snap-mandatory` | Grid normal |
| Filtros | Colapsáveis (toggle button, `flex-col`) | `flex-row` |
| NotificacoesDrawer | `left-0` | `left-56` |

### Protocolo Mobile

- Cards resumo compactos, tabs Ida/Volta `h-12`
- Protocolos como cards clicáveis (em vez de tabela)
- Botão "Criar Protocolo" fixo no `bottom-4` (mobile)
- Modal criar: full screen no mobile

### Arquivos Envolvidos

- 39 arquivos com grids/padding/gaps responsivos atualizados
- 15 modais convertidos para bottom-sheet no mobile
- 4 drawers convertidos para `w-full` no mobile
- Kanban PCP + Distribuição: snap horizontal

---

## PWA (18/03/2026)

### Arquivos

| Arquivo | Descrição |
|---------|-----------|
| `public/manifest.json` | Nome, ícones, display=standalone, theme=#184036, 9 ícones |
| `public/sw.js` | Network-first, cache `alisson-erp-v2.4.0`, ignora /api/ e supabase, fallback offline.html |
| `public/offline.html` | Página offline: verde #184036 + logo leão + botão retry |
| `public/icons/*.png` | 10 tamanhos: 72, 96, 128, 144, 152, 192, 384, 512px + apple-touch + maskable |
| `src/components/ServiceWorkerRegister.tsx` | Registra SW via componente React em layout.tsx |

### Ícones

Leão branco sobre fundo `#184036` (tema ERP). Gerados em 10 variações de tamanho.
Removida referência anterior a `leaoverde.webp`.

### Estratégia do Service Worker

```javascript
// Network-first para tudo, exceto:
// - Assets estáticos: cache-first
// - /api/*: NUNCA cachear (dados ao vivo)
// - *.supabase.*: NUNCA cachear (auth/storage)
// Fallback: /offline.html
```

### Versionamento

| Versão | Data | Conteúdo |
|--------|------|----------|
| v2.3.0 | 18/03/2026 | Módulo criação ordens + enum servico_venda + permissões |
| v2.4.0 | 18/03/2026 | Mobile responsivo + dropdown nova ordem |
| v2.5.0 | 18/03/2026 | PWA + protocolo mobile + fix uuid |
| v2.5.1 | 18/03/2026 | Ícones PWA leão branco (VERSÃO ATUAL) |

---

## Fix: INTEGER = UUID (18/03/2026)

### Problema

```typescript
// ERRADO — notificacoes.id é INTEGER, não UUID
WHERE id = ${id}::uuid
// Causa: invalid input syntax for type uuid: "42"
```

### Correção

```typescript
// CORRETO
WHERE id = ${parseInt(id)}
```

### Arquivos corrigidos (9 correções preventivas)

- `src/app/api/notificacoes/[id]/ler/route.ts` — fix raiz
- `src/app/api/pcp/ordem-teste/route.ts`
- `src/app/api/distribuicao/route.ts`
- `src/app/api/pcp/transferir/route.ts`
- `src/app/api/pcp/saida/route.ts`
- `src/app/api/lancamentos-avulso/route.ts`
- `src/app/api/compras/route.ts`
- + 2 outros arquivos de API

### Regra

NUNCA usar `::uuid` em colunas que são INTEGER.
Verificar tipo real: `SELECT data_type FROM information_schema.columns WHERE table_name='X' AND column_name='id'`.

---

## Storage — Padrão v2.8+ (Buckets Públicos)

### Regra Geral

A partir de v2.8.0, **TODOS os buckets são públicos** (`public = true`). Não usar signed URLs.

### Helper: `src/lib/storage.ts`

```typescript
uploadFile(bucket, path, file, contentType?)  → URL completa
deleteFile(bucket, path)                       → void
getPublicUrl(bucket, path)                     → URL completa
  // Guard: se path já começa com "http" → retorna direto (evita duplicata)
```

- Upload server-side com ANON_KEY
- `upsert: true` (sobrescreve se existe)
- Salva URL completa no banco (não path relativo)
- Frontend: `<img src={campo}>` direto — SEM fetch extra, SEM signed URLs

### Buckets

| Bucket | Público | Campo no banco |
|--------|---------|----------------|
| `avatars` | SIM | `public.user_profiles.avatar_url` |
| `imagens` | SIM | legado PDV — não usar para ERP |
| `protocolo-fotos` | SIM | `protocolos.foto_criacao`, `protocolos.foto_conclusao` |
| `apontamento-fotos` | SIM | `apontamentos_pcp.foto_balanca` |
| `ordem-fotos` | SIM | `ordens.fotos_paths TEXT[]`, `comentarios_ordem.foto_path` |
| `ordem-videos` | SIM | `ordens.video_observacao` |
| `insumo-fotos` | SIM | `insumos.foto` (migration 076) |

### Pitfalls Storage

```
❌ NUNCA createSignedUrl() — todos são públicos
❌ NUNCA upload client-side (supabase.storage.from().upload() no browser)
✅ SEMPRE server-side via src/lib/storage.ts
✅ Views que listam dados com foto DEVEM incluir coluna foto no SELECT
✅ getPublicUrl: verificar se path já é URL absoluta antes de montar
```

---

## Distribuição — Estorno de Lote (v2.9.0)

### Endpoint

`POST /api/distribuicao/[id]/estorno-lote`

Roles: `admin`, `desenvolvedor`, `gerente_fabrica`

Modal de confirmação: dropdown motivos + justificativa + digitar "ESTORNAR"

### 5 Fases Atômicas (`sql.begin()` — callback DEVE ser `tx`)

```
FASE 1: Reabrir lote
  UPDATE distribuicoes SET etapas='em_andamento',
    ouro_entregue=0, ouro_pecas=0, quebra_lote=0,
    retorno_metal=0, total_metal=0, dist_ouro_real=0,
    dist_pedras_qtd=0, dist_pedras_g=0, dist_quebra=0
  DELETE quebra_operador WHERE distribuicao_id=$id

FASE 2: Reverter CEs
  SELECT CEs WHERE obs ILIKE '%distribuicao #ID%'  ← FILTRO CRÍTICO
  INSERT movimentacoes_estoque reversa (inverte entrada↔saida)

FASE 2.5: Reverter apontamentos_distribuicao
  SELECT apontamentos do lote
  INSERT CEs reversas
  DELETE apontamentos originais

FASE 3: Resetar ordens
  UPDATE distribuicao_ordens SET data_baixa=NULL, peso_bruto=NULL,
    peso_pedras=NULL, peso_ouro_real=NULL
  DELETE distribuicao_saida_pedras WHERE distribuicao_ordem_id IN (...)

FASE 4: Reverter PCP
  UPDATE pcp SET total_metal=0, dist_ouro_real=0,
    dist_pedras_qtd=0, dist_pedras_g=0
  (para cada pcp vinculado às ordens do lote)

FASE 5: Snapshot
  INSERT estornos_distribuicao (motivo, justificativa, estornado_por, dados_revertidos JSONB)
```

### Tabela `alissonerp.estornos_distribuicao`

```sql
id              SERIAL PK
distribuicao_id INT FK
ordem_id        INT FK NULLABLE  -- NULL = estorno do lote inteiro
motivo          TEXT
justificativa   TEXT
estornado_por   UUID FK auth.users
dados_revertidos JSONB           -- snapshot: ordens, CEs, apontamentos revertidos
created_at      TIMESTAMPTZ
```

### Pitfall CRÍTICO

```
Filtrar CEs por: obs ILIKE '%distribuicao #ID%'
Motivo: múltiplos lotes podem ter CEs para o mesmo operador/insumo.
Pegar CEs de outros lotes causa reversão incorreta do estoque.
```

---

## PCP — Novas Features (v2.8/v2.9)

### Metal Externo na Saída (migration 078)

```
saidas_ordem.metal_externo NUMERIC DEFAULT 0
Fórmula PMC: pmc = peso_ouro_real - total_outros - metal_externo
Caso especial: total_metal = 0 → sem quebra, sem CE (peça 100% do cliente)
```

### Baixa de Pedras na Saída (migration 079)

```
Marcadores novos: SP (Saída Pedra consumida), QBP (Quebra Pedra)
Operador informa pedras utilizadas por insumo (insumo_id + qtd)
Saldo do operador é zerado para as pedras informadas
6 testes de validação: não negativo, não excede saldo, etc.
```

### Atribuir Operador (v2.9.0)

```
PATCH /api/pcp/[id]/atribuir-operador
Body: { deposito_id }
Efeito: trava apontamento tipo 2 (aditivo de metal) para o operador atribuído
Botão visível no Kanban para roles gerente_fabrica/admin/desenvolvedor
```

---

## Usuários — Melhorias (v2.9.0)

### Avatar Fix

```
JOIN por id_user (NÃO por email — pode ser divergente)
Estratégia: UPDATE primeiro → se 0 rows → INSERT
```

### Email Atômico

```typescript
// sql.begin(async (tx) => {  ← SEMPRE 'tx', nunca 'sql'
  UPDATE auth.users SET email=$1, email_confirmed_at=now()
  UPDATE alissonerp.usuarios SET email=$1
  UPDATE public.user_profiles SET email=$1  -- apenas se existir
// })
// As 3 tabelas SEMPRE sincronizadas atomicamente
```

### Segurança Senha

```
isSelfUpdate (user.id === id do usuário sendo editado)
  + nova_senha no body → 400 Bad Request
Usuário não pode alterar sua própria senha pela rota admin
Alterar senha: UPDATE auth.users SET encrypted_password=crypt($1,gen_salt('bf'))
```

---

## Insumos — Edição Completa (v2.8.0)

### InsumoEditDrawer

Campos editáveis:
- `foto` — upload para bucket `insumo-fotos` (URL completa salva em `insumos.foto`)
- `fornecedor_id` — FK para fornecedor
- `peso_pedra` — peso unitário em gramas (para calcular peso total por qtd)
- `ativo` — toggle ativo/inativo

API:
```
GET  /api/insumos/fornecedores?q=   → autocomplete fornecedores
PATCH /api/insumos/[id]             → campos editáveis incluindo foto
```

View `vw_detalhe_pote` recriada com colunas: `foto`, `fornecedor_id`, `peso_pedra`, `observacao`.

---

## Módulo Mercado Pago (v2.19.72 → v2.19.87) <!-- Revisado 11/04/2026 -->

Integração completa do Mercado Pago pro módulo de vendas. Fecha o loop **"cliente paga → webhook detecta → venda vira `concluido` automaticamente"** sem intervenção humana. Três canais de cobrança combinados, uma única aplicação MP (Checkout Transparente + API de Pagamentos).

### Canais de cobrança

| Canal | Endpoint ERP | API MP | Cenário |
|---|---|---|---|
| **Link online** (PIX + cartão) | `POST /api/vendas/[id]/mercado-pago/criar-link` | Preference API (`/checkout/preferences`) | WhatsApp/email — cliente paga remoto no checkout MP |
| **PIX nativo escaneável** | `POST /api/vendas/[id]/mercado-pago/criar-pix` | Payment API (`/v1/payments` com `payment_method_id='pix'`) | Cliente escaneia QR no próprio app bancário (EMV/BR Code do BACEN) |
| **Maquininha Point** | `POST /api/vendas/[id]/mercado-pago/criar-intent-point` | Point Integration API (`/point/integration-api/devices/{id}/payment-intents`) | Cliente presencial passa cartão ou PIX no terminal físico |

**Todas notificam o mesmo webhook** (`POST /api/webhooks/mercado-pago`). MP envia `topic=payment` com o mesmo formato independente do canal — `external_reference` carrega `venda:X:pag:Y` em todos os casos.

### Arquitetura — princípios chave

1. **Helpers em `src/lib/` (não HTTP interno)**: PATCH manual e webhook chamam as mesmas funções TypeScript direto. Zero roundtrip HTTP entre rotas.
   - `src/lib/mercado-pago.ts` — SDK + Payment API + Point API
   - `src/lib/vendas-aprovar.ts` — `approveVenda()`, `concluirVenda()`, `sendToTiny()`, `criarOrdemDoOrcamento()`, `estornarVenda()`
   - `src/lib/public-origin.ts` — `getPublicOrigin(req)` com X-Forwarded-Proto/Host (proxy-aware)

2. **Commit-then-sync (local-first)**: `concluirVenda` faz nessa ordem — `UPDATE situacao='concluido'` → `fn_cr_marcar_pago_mp()` → `criarOrdemDoOrcamento()` → `sendToTiny()` (best-effort). Tiny falhando **não bloqueia** a venda concluída — o pagamento já foi confirmado pelo banco e o fechamento do ERP é inegociável. Tiny vira sincronização informativa que pode ser reenviada depois.

3. **Idempotência em 4 camadas**:
   - `tiny_pedido_id IS NOT NULL` → `sendToTiny` vira noop
   - `situacao IN ('aprovado','concluido')` → `approveVenda` retorna `ja_aprovada`
   - `orcamentos.ordem_gerada_id IS NOT NULL` → `criarOrdemDoOrcamento` retorna ordem existente
   - `payment_ids_processados[]` em `gateway_payload` → webhook detecta reentrega e retorna 200 sem reprocessar

4. **Segurança do webhook**: validação HMAC SHA-256 com formato `ts=...,v1=hash` no header `x-signature`. Manifesto: `id:${dataId};request-id:${xRequestId};ts:${ts};`. Se HMAC não bate, retorna 401 e loga em `webhook_log`.

### Tabelas novas/alteradas

| Objeto | Migration | Descrição |
|---|---|---|
| `alissonerp.mp_point_devices` | 135 | Cadastro das maquininhas Point Smart (device_id UNIQUE, nome_legivel, store_id, pos_id, operating_mode, ativo, loja, last_sync_at, created/updated_at). Sincronizado via `POST /api/mercado-pago/devices`. |
| `pagamentos_venda.valor_liquido` | 137 | NUMERIC(12,2) — valor que realmente caiu na conta MP (`transaction_details.net_received_amount`). Preenchido pelo webhook ao confirmar pagamento. |
| `pagamentos_venda.taxas_mp` | 137 | NUMERIC(12,2) — total deduzido pelo MP. Calculado como `transaction_amount - net_received_amount` (mais preciso que somar `fee_details[]` porque MP deduz taxas de adquirência que não aparecem em fee_details). |
| `alissonerp.fn_cr_marcar_pago_mp(INTEGER)` | 135 | Marca `contas_receber.situacao='pago'` + `data_recebimento=CURRENT_DATE` das CRs pendentes da venda. Retorna `INTEGER` (qtd quitadas). |
| `alissonerp.fn_resumo_recebido_mp(DATE, DATE)` | 137 | Retorna `qtd`, `total_bruto`, `total_taxas`, `total_liquido` do período pra relatórios. |

### Configurações em `alissonerp.configuracoes_secrets`

| Chave | Descrição |
|---|---|
| `mp_access_token` | Access token de produção (formato `APP_USR-...`). Vale pra todas as APIs: Preference, Payment, Point. |
| `mp_webhook_secret` | Chave secreta HMAC do painel MP (aba Webhooks). Valida assinatura das notificações. |
| `mp_user_id` | User ID MP da conta (opcional, pro painel). |
| `mp_webhook_base_url` | URL pública prefixo do `notification_url` (ex: `https://erp.alissonjoias.com.br`). Em dev pode colar URL ngrok. MP rejeita `http://localhost`. |

### Endpoints API

```
POST /api/vendas/[id]/mercado-pago/criar-link            — Preference (PIX + cartão)
POST /api/vendas/[id]/mercado-pago/criar-pix             — Payment API (PIX nativo escaneável)
POST /api/vendas/[id]/mercado-pago/criar-intent-point    — Point Smart (maquininha)
DELETE /api/vendas/[id]/mercado-pago/criar-intent-point  — Cancelar intent ativa

GET  /api/mercado-pago/devices                           — Lista devices cadastrados
POST /api/mercado-pago/devices                           — Sync com MP API (upsert)
PATCH /api/mercado-pago/devices                          — Renomear/ativar/desativar manualmente

POST /api/webhooks/mercado-pago                          — Receiver (HMAC + idempotência + commit-then-sync)
GET  /api/webhooks/mercado-pago                          — Healthcheck simples
```

### Componentes UI (`src/components/vendas/`)

| Componente | Uso | Endpoint usado |
|---|---|---|
| `PixQrInline.tsx` | Inline no form de pagamento (Nova Venda + Detalhe) quando `forma = 'Pix'`. QR nativo EMV escaneável no banco + copia-e-cola + WhatsApp. | `/criar-pix` |
| `CartaoInline.tsx` | Inline no form quando `forma = 'Cartão de Crédito'`. Dois botões: "Link de Pagamento" (Preference) e "Maquininha Point" (intent). | `/criar-link` + `/criar-intent-point` |
| `MercadoPagoCobranca.tsx` | Seção separada no `VendaDetalheClient` com dois botões pra qualquer venda. Modais overlay com QR, link, WhatsApp, device selector. Mantida pra compatibilidade. | `/criar-link` + `/criar-intent-point` |

Todos suportam:
- `vendaId: number \| null` + callback `obterVendaId` pra fluxo Nova Venda (salva rascunho silenciosamente antes de gerar cobrança)
- Polling a cada 3-5s detectando `pagamentos_venda.status='confirmado'` ou `vendas_erp.situacao='concluido'`
- Feedback visual "Pagamento confirmado!" + redirect/refresh automático

### Páginas públicas de retorno

- `src/app/pagamento/[token]/[status]/page.tsx` — 3 estados (`sucesso`, `pendente`, `erro`) usados em `back_urls` da Preference MP. Lookup por `vendas_erp.token_compartilhamento` UUID pra não expor ID interno. Dark theme da Alisson.

### Fluxo de estorno (refund / cancelled / charged_back)

Implementado em `src/lib/vendas-aprovar.ts::estornarVenda()` + webhook. Regras de negócio:

- **Venda com uma única forma de pagamento** (o MP estornado): venda vira `cancelado`. Trigger 111 reverte estoque comercial automaticamente. Contas_receber em ('pago','pendente') viram `cancelado` manual (trigger 113 só cancela CR pendente).
- **Venda com múltiplas formas** (MP + dinheiro, por exemplo): venda volta pra `rascunho`. Vendedora recobra o valor estornado (ou cancela manual). Outros pagamentos confirmados permanecem.
- **Chargeback** tratado igual a refund.
- **Rejected** (tentativa negada) NÃO é estorno — só marca o pagamento como cancelado sem mexer na venda.
- **Estorno parcial** não suportado ainda (MP permite refund parcial — adicionar depois checando `transaction_amount_refunded`).

### Webhook payload em `pagamentos_venda.gateway_payload`

JSONB com auditoria do último evento MP:
```json
{
  "ultimo_payment_id": "154344233150",
  "ultimo_status": "approved",
  "ultimo_update": "2026-04-11T20:17:59Z",
  "point_of_interaction_type": "PAYMENT_LINK",
  "payment_method_id": "master",
  "payment_type_id": "credit_card",
  "transaction_amount": 1.00,
  "net_received_amount": 0.97,
  "taxas_mp_total": 0.03,
  "fee_details": [{"amount": 0.01, "fee_payer": "collector", "type": "mercadopago_fee"}],
  "money_release_date": "2026-04-11T20:17:59.000-04:00",
  "payment_ids_processados": ["154344233150"]
}
```

### Pitfalls conhecidos

- **`${JSON.stringify(obj)}::jsonb` bugado**: o driver `postgres` npm encoda como string literal JSON (double-encoded). **Usar `${JSON.stringify(obj)}::text::jsonb`** ou `${sql.json(obj)}`. Aplicado em todos os endpoints MP desde v2.19.85. Outros endpoints legados (ordens, user, service, fichas-tecnicas, purificacao) ainda têm o padrão bugado — funcionam parcialmente via `normalizeRow` helper que parseia na leitura, mas operações JSONB nativas falham.
- **Tiny token expirava toda hora**: scope OAuth2 precisa ser `openid offline_access` (sem `offline_access` o refresh_token vira session-bound e expira em horas). Fixado em v2.19.84. Após o deploy, reconectar Tiny uma vez — vai pedir consentimento de "acesso offline".
- **`redirect_uri` atrás de proxy**: Keycloak rejeita troca `authorization_code → token` se `redirect_uri` não bate entre `/auth` e `/callback`. Usar `getPublicOrigin(req)` de `src/lib/public-origin.ts` que respeita `X-Forwarded-Proto` + `X-Forwarded-Host` (não `req.nextUrl.origin` que pode retornar host interno do container).
- **MP rejeita `http://localhost` como `notification_url`**: em dev, configurar `mp_webhook_base_url` apontando pra domínio público ou ngrok. Sem essa config, o endpoint `criar-link`/`criar-pix` retorna erro 502.
- **Application `tipo=QR Code` no painel MP developers é restrita**: não permite Payment API direta (erro 401 "Unauthorized use of live credentials"). Precisa criar aplicação do tipo **Checkout Transparente + API de Pagamentos** pra ter acesso completo (PIX + Point + Preference).
- **CR `pago` vs `recebido`**: o backend sempre grava `'pago'` (trigger 113 e `fn_cr_marcar_pago_mp`). A UI tinha código legado usando `'recebido'`. Corrigido em v2.19.83 — `isRecebido(s) = s === 'pago' || s === 'recebido'` como helper de transição.
- **`data_vencimento` como `Date` em Server Component**: Next serializa Server→Client preservando tipo Date. Funções client como `isVencido(d)` chamam `d.slice()` assumindo string e crasham. **Fix:** `::text` nos SELECTs da `page.tsx` (`SELECT data_vencimento::text AS data_vencimento, ...`).
