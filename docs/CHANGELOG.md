# Changelog — Alisson ERP (fabricaAJ)

> 📋 Última atualização automática: 27/03/2026 — Versão: v2.13.0 <!-- Revisado 27/03/2026 -->

> Regra: TODO push atualiza o CHANGELOG. Features = MINOR (v2.X.0), Fixes = PATCH (v2.9.X).

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
