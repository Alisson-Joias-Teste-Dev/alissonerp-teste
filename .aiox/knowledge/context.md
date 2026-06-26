# Estrutura Atual — fabricaAJ

> Snapshot gerado em 2026-04-29. Fonte: banco de produção (`72.60.55.140:5543`) + filesystem.

---

## 1. Tabelas no Supabase (PostgreSQL)

Total: **377 tabelas + 122 views + 321 funções + 148 triggers + 234 RLS policies** distribuídas em 7 schemas.

> **Inventário completo:** `docs/db-mapping/` (gerado por `scripts/_db_mapping_extract.mjs` via queries diretas no `pg_catalog`). Cada schema tem `tables.md`, `functions.md` (com corpo-fonte), `triggers.md`, `views.md`, `rls.md`. O resumo executivo está em `docs/db-mapping/99-summary.md`.

| Schema | Tabelas | Colunas | Views | Funções | Triggers | RLS | Acesso |
|--------|--------:|--------:|------:|--------:|---------:|----:|--------|
| `alissonerp` | 139 | 2619 | 71 | 67 | 55 | 38 | RW (ERP) |
| `public` | 65 | 1255 | 45 | 69 | 33 | 114 | RO (legado PDV/Supabase) |
| `directus` | 110 | 1004 | 2 | 14 | 20 | 17 | RO (legado Directus) |
| `crm` | 31 | 372 | 0 | 13 | 31 | 41 | **NÃO USADO PELO ERP** (CRM com IA paralelo) |
| `auth` | 20 | 189 | 0 | 4 | 2 | 0 | Supabase GoTrue |
| `storage` | 11 | 90 | 0 | 29 | 7 | 24 | Supabase Storage |
| `extensions` | 1 | 65 | 4 | 125 | 0 | 0 | pgcrypto, http, etc. |

### Schema `alissonerp` — ERP fábrica (CRUD)

**Base tables (135):**

```
_backup_servicos_20260331, _backup_tedmd_20260313, _backup_transferservice_20260331,
api_chaves, api_log, apontamentos_distribuicao, apontamentos_pcp, apontamentos_pote,
apontamentos_servico, aprovacoes_consultora, aprovacoes_tarefa, audit_log, auditorias,
automacoes_execucoes, automacoes_tarefa, backup_pre_limpeza_20260315, categorias_insumo,
comentarios_ordem, comentarios_tarefa, compras, config_orcamento, configuracoes_secrets,
configuracoes_sistema, contas_pagar, contas_receber, contatos_fiscais, curva_categorias,
curva_config, dashboard_configs, depositos, devolucoes_itens, devolucoes_venda,
distribuicao_ordens, distribuicao_saida_pedras, distribuicoes, editor_ia_historico,
empresas_emitentes, epc_serial, erp_produtos, estoque_comercial_config,
estornos_distribuicao, faixas_comissao, fechamentos_distribuicao, fechamentos_fabrica,
fichas_tecnicas, fichas_tecnicas_produto, fin_caixa_baixas, fin_conciliacoes,
fin_extratos_bancarios, fin_gateways, fin_lancamentos_bancarios, fornecedores,
fretes_bairro, gateways_pagamento, insumos, inter_sync_log, inventarios_comercial,
itens_compra, itens_distribuicao, itens_inventario_comercial, itens_ordem,
itens_ordem_insumos, itens_ordem_produtos, itens_venda_erp, joias_leituras, joias_rfid,
lancamentos_avulso, liga_tipo_ouro, ligacoes, locais_estoque, markup_alteracoes,
markup_pedras, metas_vendedoras, movimentacoes_estoque, movimentacoes_estoque_comercial,
mp_point_devices, notas_fiscais, notas_fiscais_eventos, notas_fiscais_itens, notificacoes,
orcamento_fichas_tecnicas, orcamentos, ordem_comentario_mencoes, ordem_comentarios,
ordens, outros_insumos_distribuicao, outros_insumos_pcp, pagamentos_venda, parametros,
pcp, pedras_ordens, permissoes_usuario, precificacao_config, precificacao_historico,
preparacoes_entrega, produto_composicao, produto_curva_aplicada, produto_imagens,
produto_pedra_extras, produto_personalizacao, produto_tipo_item, produtos_fiscais,
protocolo_fotos, protocolo_ordens, protocolos, purificacoes, quebra_operador, reembolsos,
regras_fiscais, reservas_estoque_comercial, role_permissoes, roles, saidas_distribuicao,
saidas_ordem, saldo_credito_loja, servicos, setores, site_config, site_produtos,
solicitacoes_desconto, tarefas, teores_ouro, tiny_sync_produtos, tipos_apontamento,
tipos_servico, transferencias_estoque_comercial, transferencias_ordem, user_views,
uso_maquina_reserva, usuarios, vale_troca, vendas_erp, vendedores_fiscais, webhook_config,
webhook_log
```

**Views (70):**

```
vw_aging_contas, vw_apontamentos_ordem, vw_auditorias_completa, vw_cofre_ouro,
vw_comissoes, vw_contatos, vw_dash_comissoes, vw_dash_controle_entregas,
vw_dash_forma_envio, vw_dash_forma_frete, vw_dash_itens_venda, vw_dash_leads,
vw_dash_metas_mensais, vw_dash_metas_por_hora, vw_dash_parcelas_pedidos,
vw_dash_pedidos_parcelas_detalhado, vw_dash_vendas, vw_dash_vendas_todas,
vw_dash_vendedores, vw_dashboard_auditoria, vw_detalhe_pote, vw_estoque_comercial_alerta_v2,
vw_estoque_directus, vw_estoque_directus_saldo, vw_estoque_ordem, vw_fichas_tecnicas,
vw_insumos_directus, vw_kpis_gerais, vw_movimentacoes_directus, vw_ordem_detalhe,
vw_ordens_aguardando_auditoria_loja, vw_ordens_completa, vw_ordens_por_tipo,
vw_ordens_prontas_ida, vw_ordens_prontas_pcp, vw_ordens_prontas_volta, vw_ouro_em_producao,
vw_pcp_completa, vw_pcp_erp, vw_producao_mensal, vw_produtividade_ourives,
vw_produto_capa, vw_produto_imagens, vw_produtos, vw_produtos_erp, vw_protocolo_ordens,
vw_protocolos_completo, vw_protocolos_loja_completo, vw_quebra_mensal, vw_quebra_operadores,
vw_quebra_por_deposito, vw_quebra_por_ourives, vw_quebra_por_setor, vw_quebra_setor_operador,
vw_resumo_financeiro, vw_saldo_estoque, vw_saldo_estoque_comercial,
vw_saldo_estoque_comercial_consolidado, vw_saldo_estoque_comercial_v2, vw_saldo_por_local,
vw_saldo_pote, vw_saldo_pote_ouro, vw_saldo_unificado, vw_timeline_ordem,
vw_transferencias_ordem, vw_user_profiles, vw_vendas, vw_vendas_completa,
vw_vendas_erp_completa, vw_vendedores
```

### Schema `public` — Legado (READONLY)

**Base tables (65):**

```
backup_itens_venda_3313, backup_itens_venda_pre_correcao_marco,
backup_itens_venda_test_3313, banco_imagens, categoria_precificação, categorias,
categorias_receitas_despesas, comissoes, complementos_contatos, config_orcamento_aliancas,
contas_a_pagar, contas_a_receber, contatos, controle_de_execucao, controle_entregas,
controle_requisicao, controle_sequencia, cotacao, estoque, ficha_tecnica,
ficha_tecnica_orcamento, ficha_tecnica_produto, fila_webhooks_n8n, fin_conciliacoes,
fin_extratos_bancarios, fin_lancamentos_bancarios, fonte_entrada_kommo, forma_envio,
forma_frete, forma_pagamento, historico_ordem, historico_preco, historico_venda_ja,
indicadores_marketing, itens_da_ordem, itens_pedido, itens_venda, leads, loock,
map_asana, map_vendedor_kommo, meio_pagamento, metas_mensais, metas_por_hora,
notificacoes, orcamento, ordem_compras, pagamentos, parametros, parcelas_da_ordem,
parcelas_pedidos, pedidos, produtos, public_links, recebimentos, relacao_tinny_moura,
solicitacoes_vale_troca, staging_markup_aprovacao, suporte_conversas, teste,
tipos_contatos, user_profiles, vales_troca, vendas, vendedores
```

**Views (45):** `contasareceberdetalhada`, `crm_*` (33 views CRM/Kommo/Meta/Unipile),
`fin_divergencias_pendentes`, `pedidos_dashboard`, `pedidos_parcelas_detalhado`,
`produtos_views`, `users`, `v_estoque_detalhado_insumo`, `v_quebra_distribuicao`,
`v_saldo_quebra_final`, `view_monitoramento_ordens`.

### Schema `directus` — Legado Directus (READONLY)

**Base tables (110):** ~37 tabelas `directus_*` (sistema), + dados de domínio:
`apontamento*`, `aprovar_consultora*`, `auditar_financeiro`, `cadastro_produtos`,
`compras*`, `controle_estoque`, `deposito`, `distribuicao*`, `fechamento_distribuicao*`,
`fechamento_fabrica`, `ficha_tecnica_ordem`, `formulario_venda_antiga*`, `insumos*`,
`itens_compras`, `itens_disttribuicao*` (sic), `itens_ordem*`, `lancamento_avulso*`,
`logistica*`, `ordemCompra*`, `ordens*`, `pcp*`, `peca_pre_acabada*`, `protocolo*`,
`saida_distribuicao*`, `saida_ordem*`, `transferencia_ordem*`, `setor`, `tipo_apontamento`,
`tipo_ocorrencia`, etc.

**Views (2):** `ordem_comentarios_populados`, `v_saldo_quebra_final`.

### Schema `crm` — CRM com IA (NÃO USADO PELO ERP)

**31 tabelas, 13 funções, 41 RLS policies.** Conteúdo aparente:

- **Agentes IA:** `agente_runs`, `agentes_ia`, `prompt_templates`, `sdr_runs`
- **Canais:** `conversas`, `mensagens`, `kommo_config`, `unipile_config`, `meta_config`, `instagram_posts`, `contato_canais`
- **Funis/Pipeline:** `funis`, `funil_etapas`, `funil_blocos`, `funil_movimentos`, `oportunidades`, `oportunidade_historico`, `motivos_perda`, `origens_lead`
- **Automações:** `automacoes`, `automacao_etapas`, `automacao_gatilhos`, `automacao_execucoes`, `ciclo_vida_eventos`
- **Infra:** `webhook_config`, `webhook_log`, `notificacoes`, `tarefas`, `audit_log`, `config_geral`, `brechas`

**Sem nenhuma referência no código atual do projeto fabricaAJ** — provavelmente projeto paralelo compartilhando o mesmo banco. Não documentado no CLAUDE.md original.

### Schemas Supabase internos

| Schema | Conteúdo | Quando tocar |
|--------|----------|--------------|
| `auth` | 20 tabelas (users, sessions, identities) — Supabase GoTrue | Use `supabase.auth.*` |
| `storage` | 11 tabelas (buckets, objects, migrations) — Supabase Storage | Use `supabase.storage.*` |
| `extensions` | 1 tabela + 125 funções de extensions (pgcrypto, http, pg_net, hypopg, uuid-ossp, pg_stat_statements, unaccent, wrappers, index_advisor) | Nunca |

### 1.1. Documentação detalhada do banco

- `docs/db-mapping/` — **inventário exaustivo** (cada tabela com colunas/PK/FK/CHECK/index/trigger/RLS, cada função com corpo-fonte, cada view com SQL completo, cross-reference com código)
- `docs/schema/` — visão resumida por categoria (alissonerp-vendas, -pcp, -estoque, -admin, -ordens, -outros, public, directus)

Os dois conjuntos são complementares.

### 1.2. Scripts geradores

- `scripts/_db_mapping_extract.mjs` — extrai catálogo do banco para `docs/db-mapping/_raw/*.json` (~10s)
- `scripts/_db_mapping_code_xref.mjs` — varre `src/`, `scripts/`, `supabase/migrations/` e gera `code_references.json` (~10s)
- `scripts/_db_mapping_build_docs.mjs` — gera os `.md` finais a partir dos JSONs crus
- `scripts/generate-schema-doc.mjs` — gera `docs/schema/*.md` (resumido)

---

## 2. Pastas em `src/components/`

Existem **17 pastas** + 21 componentes na raiz.

| Pasta | O que faz |
|-------|-----------|
| `dashboard-comercial/` | Dashboard das consultoras: `Podium`, `StatCard`, `ConsultoraAvatar`, `DateRangePicker`, `LoadingBlock`, `theme.ts` (paleta). |
| `editor-ia/` | Editor de imagens via IA: `ModelSelector` (escolhe modelo Gemini/etc), `SceneSelector` (cena/fundo). |
| `fiscal/` | Emissão fiscal (NFC-e/NF-e): formulário do emitente, modal de emissão, badge de status, regras fiscais e blocos de contato/produto fiscal. |
| `forms/` | Modais de formulário do fluxo fábrica: `Nova/Apontamento/Concluir/Fechar/Saida/Transferencia` para PCP, Distribuição e Protocolo + `LancamentoAvulsoModal` e `OrdemTesteModal`. |
| `gestao-estoque/` | Tela legada de gestão de estoque: `Dashboard` (2.866 linhas), `DataGrid`, `Sidebar` próprio, `AIChat`, `InventoryTab`, `PromotionModal`, `SecurityModal`. |
| `insumos/` | Apenas `InsumoEditDrawer` — drawer para editar insumo. |
| `layout/` | `ServiceLayout` — layout dedicado da rota `/service`. |
| `motoboy/` | `ProtocoloMotoboy` — tela mobile do motoboy para protocolos. |
| `ordem/` | `GaleriaFotosOrdem` — galeria de fotos vinculadas a uma ordem. |
| `ordens/` | Criação de ordem por tipo: 7 arquivos de modal (5 ativos independentes + 1 base + 2 wrappers finos) + `_shared/` (compressImage, formatters, useDebounce, constants, types) + `FichaTecnicaForm`, `ItensOrdemSection`, `NovaOrdemButton`. |
| `precificacao/` | App de precificação/compra de joia: `CalculatorTab`, `PurchaseTab`, `TradeInTab`, `ConfigurationTab`, `CompraApp`, `SyncModal` + `ui/`. |
| `produtos/` | Cadastro/edição de produto: `CadastroProdutoModal`, `ProdutoDrawer`, `BulkEditModal`, `GaleriaProduto`, `GerenciarPedrasModal`, `ModalPersonalizacao`. |
| `service/` | App de serviço (rota `/service`): `ServiceApp`, `ServicePainelClient`, `ServiceDetalheDrawer`, `ServiceCamera`, `CarregarSoldaModal`. |
| `ui/` | Genéricos reutilizáveis: `Paginacao`, `MobileCard`, `PeriodoFiltro`, `GlobalErrorToast`. |
| `vendas/` | Integrações de pagamento: `CartaoInline`, `MercadoPagoCobranca`, `PixPointInline`, `PixQrInline`. |

**Raiz de `components/`:** clients principais por página (`OrdensClient`, `KanbanClient`,
`DistribuicaoClient`, `EstoqueClient`, `QuebraClient`, `QuebraDrillDown`, `ComprasClient`),
chrome do dashboard (`Dashboard`, `DashboardClient`, `DashboardShell`, `Sidebar`,
`MobileHeader`), drawers/auxiliares (`PerfilDrawer`, `UserEditDrawer`, `NotificacoesDrawer`,
`UserAvatar`, `LocaisEstoqueTab`, `ComentariosOrdem`, `MencaoAlarme`,
`ServiceWorkerRegister`).

---

## 3. Três componentes com lógica repetida

### #1 — Os 5+ `NovaOrdem*Modal.tsx` em `components/ordens/`

**Arquivos:** `NovaOrdemFabricacaoModal` (683), `NovaOrdemReposicaoLojaModal` (729),
`NovaOrdemReposicaoVendaModal` (519), `NovaOrdemServicoBaseModal` (1.434),
`NovaOrdemServicoInternoModal` (931).

**Repetições verificadas (mesmo bloco copiado em ≥4 arquivos):**

- Tipos `Cliente`, `Venda`, `ItemVenda` redeclarados idênticos.
- Hook `useDebounce<T>` redefinido em cada modal.
- `fmtData` / `fmtBRL` redefinidos.
- Objeto de paleta `const C = { esmeralda, creme, cremeBorder, bg, ... }` duplicado.
- `SITUACAO_LABEL` (rascunho/aprovado/enviado/concluido/cancelado) redeclarado.
- Componente `Steps` com 4 etapas (Cliente → Venda → Itens → Revisão) reescrito em cada um.
- `compressImage` (canvas 1920px JPEG 0.85) repetido nos que aceitam fotos.

**Fase 0 concluída:** `compressImage`, `formatters`, `useDebounce`, `constants` e `types` extraídos para
`components/ordens/_shared/`. Próximo passo (Fase 1): migrar os 5 modais ativos para importar de `_shared/`
e eliminar as cópias locais.

### #2 — `UserAvatar.tsx` (raiz) vs `dashboard-comercial/ConsultoraAvatar.tsx`

Ambos resolvem o mesmo problema (foto + fallback de iniciais coloridas):

| | `UserAvatar` (87L) | `ConsultoraAvatar` (55L) |
|---|---|---|
| Iniciais (1ª + última palavra) | sim | sim |
| Cor de fundo determinística por nome | sim | usa `P.esmeralda` fixo |
| Validação de URL | `onError` | `startsWith("http"/"/")` + `onError` |
| Suporte a tamanho variável | sim | sim |

**Sugestão:** unificar em `components/ui/Avatar.tsx` aceitando uma prop `palette`
opcional para o caso da consultora. `ConsultoraAvatar` vira um preset.

### #3 — Modais "novo" do fluxo fábrica em `components/forms/`

`NovaPCPModal` (217L) e `NovaDistribuicaoModal` (299L) — e em menor grau
`ApontamentoPCPModal` (998L) vs `ApontamentoDistModal` (578L) — repetem o mesmo
esqueleto:

- `import { X, Loader2, CheckCircle, AlertCircle, Search } from "lucide-react"` idêntico.
- Mesma paleta `C = { esmeralda, creme, cremeBorder, cremeBg }`.
- Mesmo conjunto de estados: `loading`, `loadingOrdens`, `error`, `success`, `search`,
  `selected`/`selectedOrdens`.
- Mesmo padrão de carregamento via `supabase.from("vw_ordens_prontas_*")` no `useEffect`
  com reset ao abrir.
- Mesmo bloco de header com botão `X` + título + footer com `Cancelar` / `Confirmar`.

**Sugestão:** criar `components/forms/_shared/SeletorOrdensModal.tsx` parametrizado por
view de origem (`vw_ordens_prontas_pcp` / `...ida` / `...volta`) e callback de submit;
eliminaria ~60% das linhas.

---

*Gerado por Claude (Opus 4.7).*
