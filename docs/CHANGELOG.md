# Changelog — Alisson ERP (fabricaAJ)

> 📋 Última atualização automática: 10/04/2026 — Versão: v2.19.66 <!-- Revisado 10/04/2026 -->

> Regra: TODO push atualiza o CHANGELOG. Features = MINOR (v2.X.0), Fixes = PATCH (v2.9.X).

## v2.19.66 (10/04/2026)
### Features — Orçamento: travas de validação + zircônia + preços de pedras configuráveis
- **Travas físicas** no editor de aliança baseadas na pedra escolhida:
  - Espessura mínima automática = `pedra × 0.60 + 0.50` (sliders travados)
  - Largura mínima por tipo de cravação (canaleta/grão/pavê)
  - Fileiras máximas no QuadradoCanal calculadas pelo canalWidth/pedra
  - Capacidade total de pedras validada contra circunferência da aliança
- **Zircônia** como novo tipo de pedra (não preciosa, preço = 0): `STONE_TYPES` ganha flag `is_preciosa`; `computeStoneEntryPrice` zera o valor quando não é preciosa; default ao adicionar entry = zircônia (opção segura, não cobra por engano)
- **Card "Detalhamento (Preciosa/Zircônia)"** no modo aliança permite misturar tipos (ex: 4 diamantes + 10 zircônias) respeitando a capacidade
- **Card "Preços de Pedras (USD/ct)"** na tela de Configurações — editor completo com preview ao vivo (exemplos 1,5mm e 3mm), botão Padrão restaura valores de mercado 2025 ($600 diamante, $80 moissanita, $350 rubi, $450 esmeralda, $300 safira, $0 zircônia)
- **Validação bilateral frontend + backend** (POST e PUT) — não dá pra burlar nem via cURL
- **Calibração configurável** via `config_orcamento.calibracao` (JSONB): espessura mínima, largura por cravação, folga entre pedras — editável via SQL direto se necessário
- Barra de resultado inferior exibe **Pills "Ouro" e "Pedras"** quando há pedras preciosas, com breakdown visível
- Correção de formatação BRL (antes `R$ 23.215,081` com 3 casas erradas, agora `R$ 23.215,08` sempre 2 casas)
- Eliminação da duplicidade do `PROFILE_CORRECTION_FACTOR` (antes divergia entre switch inline e Record exportado — agora fonte única)

### Migrations
- `132_orcamento_validacao_zirconia.sql` — coluna `calibracao` JSONB em `config_orcamento` com defaults conservadores + inclusão de zircônia em `stone_prices` com preco_usd_ct = 0

### O que NÃO foi tocado (garantia anti-quebra)
- ✋ Editor 3D (`AliancaViewport.tsx`) — zero alteração
- ✋ PATCH de aprovação de orçamento → venda → ordem
- ✋ Densidades do ouro, tabela `RING_SIZES`, fórmula base de `computeWeight`

## v2.19.62 (09/04/2026)
### Merge + Integração
- Merge branch claude/pensive-borg + mudanças locais
- Orçamento, sidebar, permissions, migrations 120/130

## v2.19.58–v2.19.61 (08/04/2026)
### Features — Vendas Detalhe Redesign
- Redesign vendas/[id] com layout editável igual a vendas/nova
- Edição inline itens, validação aprovar, desconto padrão 0
- 3 botões cliente + endereço entrega na venda (migration 130)
- Botão editar cadastro do cliente no modal de dados

## v2.19.39–v2.19.57 (05-07/04/2026)
### Features — Módulo Orçamento 3D
- Cliente no orçamento + aprovação → ordem de fabricação
- Tela de orçamentos estilo PDV — stats, filtros, tabela, dropdown novo
- Orçamento peças personalizadas + precificação de pedras preciosas
- 3D aliança com THREE.js — perfis, gravação interna, screenshot
- Orçamento aprovado → venda pré-preenchida → venda concluída → ordem automática
- Ficha técnica formatada (Boleada Dupla), sem modelo_interno
- Captura screenshot 3D da aliança e salva no orçamento + ordem
- Migrations 120-129: config_orcamento, orcamento_fichas_tecnicas, orcamentos, pedras_config, cliente+ordem, foto_3d, venda+ordem

### Fixes (3D/Orçamento)
- WebGL Context Lost — React.memo, DPR limiter, preserveDrawingBuffer
- Gravação curvada na superfície interna da aliança
- Conflito slug [id] vs [token] — rota pública /compartilhado

## v2.19.25–v2.19.28 (04/04/2026)
### Features — PCP→Service Transfer
- PCP Novas Ordens permite transferir para service
- Pedras na service — só mostra estoque do local Service + baixa correta

### Fixes
- Baixa de pedras/solda no service usa local correto
- Timeline duplicava linhas de protocolo ida/volta (migration 125)

## v2.19.1–v2.19.24 (02-03/04/2026)
### Features — Estoque Multi-Local + Service Workflow
- Tab Locais de Estoque na página de estoque
- Autocomplete insumo na transferência + tab Depósitos no estoque
- Separar saldos e movimentações por local de estoque
- Lançamento avulso permite escolher local de estoque (migration 123)
- Seleção de transportador na transferência PCP→Service + toggle configurações (migration 124)
- Operador service vê detalhes da ordem sem sair do painel
- Transferir serviço de volta para fábrica com protocolo automático
- Foto da peça miniatura 80x80 — clica pra abrir zoom

### Fixes
- Corrigir saldo_ct pedras (gramas/0.2) + exibir quantidade e peso (migration 121)
- Views local_estoque_id display (migration 122)
- Transferência entre locais gravava ct como gramas para pedras
- Receber transferência service cria servico manualmente
- Hydration error MobileCard
- Protocolos transferência service apareciam vazios

## v2.19.0 (01/04/2026)
### Features — Vendas Redesign + Tarefas
- Vendas redesign completo com comissões dinâmicas
- Tarefas avançadas: kanban drag-drop, aprovações, automações (migration 119)
- Análise de comissões, frete, resultado (3 subpáginas)
- Metas por vendedora + ranking mensal
- Fix proxy service-painel

## v2.18.0–v2.18.4 (31/03/2026)
### Features
- PDF orçamento + enviar Tiny API v3 + sync estoque comercial
- Módulo Relatórios (4 tipos: produção, comercial, financeiro, estoque)

### Fixes
- Sync triggers bypass blindagem via session variable (migration 118)
- Proxy não bloqueia /service por módulo
- SW ignora chrome-extension://
- Trigger sync re-sincroniza itens faltantes na UPDATE

## v2.17.0–v2.17.1 (31/03/2026)
### Features — Migração 360°
- Módulo Comercial: vendas_erp, itens_venda_erp, pagamentos_venda, metas_vendedoras (migration 104)
- Estoque Comercial: config, movimentações, alertas, sync Tiny (migration 107)
- Módulo Tarefas (substitui Asana) — kanban, comentários (migration 112)
- Financeiro automático: venda→conta_receber, compra→conta_pagar (migration 113)
- Blindagem vendas fechadas: protege preços/comissões (migrations 114-118)
- Sync public.vendas → vendas_erp com 14.301 vendas históricas (migration 109)
- Integrações: Kommo CRM, WooCommerce, cotações automáticas
- Fichas técnicas ERP editáveis (migration 111)
- Ordem fabricação com ficha técnica dinâmica — 12 tipos de item
- Ordem reposição venda — modal simplificado 4 steps
- Sistema de erros global (Zustand errorStore + GlobalErrorToast)
- Renomear solda→aditivo, filtro PCP, auto-aprovar auditoria

### Fixes
- QA médios/baixos — error handling, validação, status API key

## v2.16.0–v2.16.3 (30/03/2026)
### Features
- Módulo comercial vendas, estoque comercial, orçamento público
- Ordens garantia + serviço venda, sync vendas
- Gravador de vídeo nativo com câmera + countdown 30s
- Vendedor_id auto-preenchido, vídeo 30s, fallback nome criador

## v2.15.1 (30/03/2026)
### Features
- Transferência service + devolver + CLAUDE.md multi-agentes (migration 103)
- Service devolver: retorno com protocolo automático
- Service transferir-fabrica: volta para Almoxarifado Central

## v2.14.2 (30/03/2026)
### Fixes — Bug critico: dupla-contagem de ouro em buscarOuroRecebido
- `buscarOuroRecebido` retornava SUM(entrada) em vez de SUM(entrada)-SUM(saida)
  - Cenario: operador recebe ouro, transfere parte, recebe de volta, transfere novamente
  - Bug: a funcao somava TODAS as entradas historicas ignorando saidas anteriores
  - Resultado: ouro_recebido inflado → QUEBRA_PCP CE errado → saldo negativo do operador
- Fix: formula alterada para saldo liquido: SUM(entrada) - SUM(saida) para categoria_id=1
- Fix: `pcp/transferir/route.ts` — buscarOuroRecebido movido para ANTES das CEs TED/QUEBRA_PCP
- Fix: `pcp/saida/route.ts` — buscarOuroRecebido movido para ANTES das CEs SM/QUEBRA_PCP
- Correcao dados C-1060 (ordem_id=1292): CE QUEBRA_PCP id=468 saida 12.56→0.25; quebra_operador id=47 ouro_recebido 21.54→9.23 quebra 12.56→0.25
- Correcao dados C-1129 (ordem_id=1317): quebra_operador id=31 ouro_recebido 2.67→1.52 quebra 1.47→0.32
- Varredura: outros 5 operadores com multiplas entradas verificados — sem CEs erradas (saida/pcp usa total_metal do PCP, nao buscarOuroRecebido)

## v2.14.1 (30/03/2026)
### Fixes (migrations 101 + 102)
- Bug critico: fn_criar_itens_ordem gravava unidades como peso para pedras (devia gravar gramas)
  - fn_processar_saida_ordem (Sprint 2) lia ioi.peso assumindo gramas e dividia por 0.2 → SP errado
  - Fix: novo parametro p_peso_gramas (6º, DEFAULT NULL); tipo 3/6 passa qtd × peso_pedra (g)
  - Metal: backward compat via COALESCE(NULL, p_qtd) = p_qtd — sem mudanca
- fn_processar_transferencia: local_estoque_id=1 explicito nos CEs (TED)
- fn_processar_lancamento_avulso: local_estoque_id=1 explicito em todos os INSERTs de CE
- Varredura completa local_estoque_id NOT NULL (migration 102 + 10 arquivos TS):
  - fn_criar_par_movimentacao: COALESCE(p_local_id, 1) — backward compat para callers sem 10 arg
  - fn_processar_outros_insumos_dist + fn_processar_outros_insumos_pcp: local_estoque_id=1
  - /api/pcp/transferir: TED saida+entrada+QUEBRA_PCP
  - /api/pcp/saida: SM, QUEBRA_PCP, SP, QBP
  - /api/service/[id]/concluir: SM (solda), SP (pedra)
  - /api/purificacao: PURIF_SAIDA, PURIF_ENTRADA, PURIF_CANCEL
  - /api/purificacao/ligacao: LIGA_SAIDA_24K, LIGA_SAIDA_LIGA, LIGA_ENTRADA_18K, LIGA_CANCEL
  - /api/distribuicao/[id]/concluir: QUEBRA_LOTE
  - /api/distribuicao/[id]/estorno: ESTORNO (3 CEs)
  - /api/distribuicao/[id]/estorno-lote: ESTORNO (7 CEs)
  - /api/pcp/apontamentos: fn_criar_par_movimentacao 10 arg explicito (EOID)
- Dados historicos itens_ordem_insumos pedras: 16 registros com peso em unidades (aguardando confirmacao Jonathan)

## v2.15.0 (30/03/2026)
### Features
- Tipo "Serviço Interno" — foto obrigatória, vídeo obrigatório (gravar ou upload) e tipos de serviço configuráveis
- Tabela `alissonerp.tipos_servico` com CRUD admin + 5 tipos iniciais (Solda Laser, Cravação Manual, Acabamento e polimento, Ajuste Manual, Solda e Limpeza)
- Múltiplos tipos de serviço por ordem — checkboxes no modal → `ordens.tipos_servico_ids INTEGER[]`
- Gravação de vídeo no navegador via MediaRecorder API (webm/mp4 fallback) + opção de upload
- Admin UI em `/configuracoes` — nova aba "Tipos Serviço" com CRUD inline (admin/dev)
- API `GET/POST/PATCH /api/tipos-servico` — sem `supabase.from()`, apenas `pg.Pool` SQL direto
- API `POST/DELETE /api/ordens/upload-arquivo` — endpoint de upload/cleanup server-side
- Migration `100_tipos_servico.sql`: CREATE tipos_servico + ADD ordens.tipos_servico_ids + GRANTS
- `NovaOrdemButton.tsx` — `servico_interno` abre `NovaOrdemServicoInternoModal` (não mais toast "Em construção")
- Cleanup de câmera/streams ao fechar modal (`track.stop()` + `revokeObjectURL`)

## v2.14.0 (28/03/2026)
### Features (já existente — ver migration 094-098)
- Locais de estoque (Fábrica/Loja), pedras em quilates, compras expandidas, vw_saldo_por_local

## v2.13.1 (27/03/2026)
### Fixes
- Fix: Painel Service movido para dentro do grupo PRODUÇÃO na sidebar (estava solto no topo)
  - permissions.ts: `/service-painel` no array do grupo Produção (após Purificação)
  - Sidebar.tsx: injetar `service_painel` em modulosEfetivos quando role qualifica (bypass banco)
  - Sidebar.tsx: removido serviceExtras hardcoded para Painel Service

## v2.13.0 (27/03/2026)
### Features
- Módulo Service v2.13.0 (migration 092)
  - App operador `/service` (dark theme, mobile-first) — requer `is_operador_service=true`
  - Painel gerente `/service-painel` — ROLES_SERVICE_PANEL (admin, dev, gerente_fabrica, gerente_loja)
  - Tabela `alissonerp.servicos` com controle de solda (modo A1) e pedras colocadas
  - Flag `is_operador_service BOOLEAN` em `alissonerp.usuarios` (não é role, é flag independente)
  - TRIGGER `trg_criar_servico_from_pcp`: cria servico automaticamente para servico_venda/garantia
  - Bucket `service-fotos` (público, 10MB, jpeg/png/webp)
  - 12 rotas /api/service/* (pendentes, receber, meus, concluir, transferir, solda-saldo, painel, concluidos, operadores, [id], pedras, carregar-solda)
  - Componentes: ServiceLayout, ServiceApp, ServiceCamera, ServicePainelClient, ServiceDetalheDrawer, CarregarSoldaModal
  - ServiceLayout detectado automaticamente pelo DashboardShell via pathname.startsWith('/service')
  - Câmera mobile: navigator.mediaDevices (HTTPS) + fallback input[type=file] (HTTP)
- Quilates no cadastro de insumos: coluna `peso_pedra_ct NUMERIC` + `sku_interno TEXT`
  - TRIGGER `trg_calcular_peso_pedra`: auto-calcula `peso_pedra` = `peso_pedra_ct × 0.2` (1ct = 0.2g)
  - Frontend exibe em quilates (ct), banco armazena gramas em peso_pedra
- Configurações sistema: seeds `operador_servico_padrao` e `service_tipos_ordem`
- IA: modelos atualizados no banco: `gemini-2.5-flash`, `claude-sonnet-4-20250514`

## v2.12.0 (24/03/2026)
### Features
- Protocolo: responsável (criado por) e concluído por nos cards e detalhe
- Protocolo: thumbnails de foto criação/conclusão clicáveis
- Protocolo: zoom na foto (scroll, duplo clique, arrastar, botões +/−)
- Protocolo: filtro de status Pendentes/Concluídas/Todas (default Pendentes)
- PCP: atribuir operador com metal externo > 0 move pra em_andamento automaticamente
- Precificação: coluna markup atual na simulação de impacto
- Precificação: campo de busca por nome/SKU no preview
- Fichas técnicas por produto + bucket produto-3d + upload modelo 3D (migration 091)
- API: POST /api/produtos/[id]/modelo-3d — upload modelo 3D com extração IA de ficha técnica

### Fixes
- Protocolo: JOIN via alissonerp.usuarios (responsável aparecia — para Francisco Lenilson)
- Protocolo: foto URL resolvida (path relativo → URL completa Storage)
- Protocolo: filtro Pendentes conta protocolos com status !== concluido
- Produtos: fix CadastroProdutoModal

## v2.11.1 (24/03/2026)
### Fixes
- Detalhe ordem: exibir peso_metal_externo no card Comercial (condicional > 0)
- Detalhe ordem: ocultar campos sem dados nos cards Comercial e Produção

## v2.11.0 (24/03/2026)
### Features
- Teores em configurações (abas teores, tipos de liga)
- Permissões granulares 5 ações (abrir/concluir purificação, abrir/concluir ligação, editar_teor_ligação)
- Cadeado teor ligação (só quem tem permissão editar_teor_ligacao)
- Migration 090: seed editar_teor_ligacao para admin/dev

### Fixes
- Fix NaN em itens legados (directus.itens_ordem_1)

## v2.10.1 (23/03/2026)
### Fixes
- normalizeRow: usar Record<string, unknown> em vez de T para evitar erro TS2862
- Auto-atribuir deposito_id no PCP no primeiro apontamento fora do Almoxarifado
- Docs: atualizar MEMORY.md com módulo purificação e permissões granulares

## v2.10.0 (23/03/2026)
### Features
- Módulo Purificação 18k→24k (página /purificacao, PurificacaoClient.tsx)
  - Tabela purificacoes, APIs CRUD, migration 084
- Módulo Ligação 24k→18k (LigacaoTab.tsx)
  - Tabela ligacoes, tipos_liga, APIs CRUD, migrations 085-086
- Integração WhatsApp Assistant (tabelas wa_*, migrations 086-088)
  - wa_assistants, wa_conversations, wa_messages, wa_kb_articles
  - user_profiles.phone para vinculação automática
- Permissões granulares por usuário (migration 089)
  - Tabela permissoes_usuario, lib permissoes.ts
  - 5 ações: abrir_purificacao, concluir_purificacao, abrir_ligacao, concluir_ligacao, editar_teor_ligacao

## v2.9.1 (20/03/2026)
### Fixes
- Estorno lote: filtro TEDD por obs `distribuicao #ID` (não pega CEs de outros lotes)
- Estorno lote: reverte apontamentos_distribuicao (Fase 2.5) + DELETE após reversão
- Estorno lote: zera campos acumulados (retorno_metal, total_metal, dist_ouro_real, dist_pedras)
- Estorno lote: removido botões individuais por ordem (só lote inteiro)
- Transferência avulsa: res.json() fallback
- Pedras saída: Math.min trava max no frontend

## v2.9.0 (20/03/2026)
### Features
- Estorno de lote inteiro na distribuição (POST /api/distribuicao/[id]/estorno-lote)
  - 5 fases atômicas (sql.begin), CE reversa individual, delta zero
  - Modal: dropdown motivos + justificativa + digitar ESTORNAR
  - Tabela estornos_distribuicao com snapshot JSONB
  - Só admin/dev/gerente_fabrica
- Transferência avulsa com campo DESTINO (migration 083)
- Adicionar ordens ao lote em andamento (POST /api/distribuicao/[id]/adicionar-ordens)
  - Validações: não concluída, não duplicada, não em outro lote
- Atribuir operador no PCP (botão Kanban + PATCH /api/pcp/[id]/atribuir-operador)
  - Trava apontamento tipo 2 pro operador atribuído
- Filtro ourives na distribuição (só vê lotes do seu depósito)

### Fixes
- Avatar: JOIN por id_user (não email) + UPDATE-first INSERT-if-needed
- Email atômico: 3 tabelas em sql.begin (auth + usuarios + user_profiles)
- Brecha senha: isSelfUpdate + nova_senha → 400
- sql.begin: parâmetro callback renomeado pra tx (fix build Docker)

## v2.8.0 (19/03/2026)
### Features
- Baixa de pedras na saída PCP (marcadores SP consumidas + QBP quebra) (migration 079)
  - Operador informa pedras utilizadas por insumo
  - Saldo operador zera, 6 testes passaram
- Metal externo na saída PCP (migration 078)
  - pmc = peso_ouro_real - outros - metal_externo
  - total_metal=0: sem quebra, sem CE (peça do cliente)
- Saída sem peso no lote (migration 077)
  - sem_peso + justificativa_sem_peso + dropdown motivos
- Storage padronizado (todos buckets públicos)
  - src/lib/storage.ts: uploadFile/deleteFile/getPublicUrl
  - URL completa no banco, sem signed URLs
- Insumos completo: InsumoEditDrawer (foto, fornecedor, peso_pedra, ativo) (migration 076)
- Paginação ordens: 20/página, filtros server-side, contadores
- Detalhes da ordem: coluna + UPDATE 443 ordens Directus (migration 075)

### Fixes
- getPublicUrl guard URL absoluta
- depositoId fallback removido → erro 400 se sem operador
- integer=uuid em notificacoes + 9 created_by preventivos
- SW response guard (503 fallback)
- vw_detalhe_pote com colunas novas (foto, fornecedor_id, peso_pedra, observacao)

## v2.5.1 (18/03/2026)
### Fixes
- Ícones PWA leão branco + fundo verde

## v2.5.0 (18/03/2026)
### Features
- PWA (manifest.json + sw.js network-first + offline.html)
- Protocolo mobile (cards clicáveis + botão criar fixo)

## v2.4.0 (18/03/2026)
### Features
- Mobile responsivo (39 arquivos, breakpoint md 768px)
- MobileHeader + SidebarContext (hamburger menu)
- Tabelas dual render (table desktop + cards mobile)
- Kanban scroll horizontal com snap

## v2.3.0 (18/03/2026)
### Features
- Módulo criação de ordens (modal + dropdown 7 tipos)
- Permissões granulares: usuarios.tipos_ordem_permitidos JSONB
- Campos serviço condicionais (foto_peca, peso_peca, video)
- 443 ordens migradas do Directus (origem='legado')
- 23 ordens em produção (auditoria loja)

## v2.0.0 (16/03/2026)
- Deploy inicial Alisson ERP (Supabase self-hosted + Next.js)
- Migração do Directus (v1.x.x) para sistema próprio

## v1.x.x (legado)
- Directus CMS (descontinuado)
