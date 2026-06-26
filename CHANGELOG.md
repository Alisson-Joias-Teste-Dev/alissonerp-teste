> 📋 Última atualização automática: 31/03/2026 — Versão: v2.15.0

## v2.15.0 — Transferência Service (31/03/2026)

### Adicionado

#### Back-end
- Migration `103_transferencia_service.sql`: 4 novas colunas
  - `transferencias_ordem.tipo_transferencia` VARCHAR(20) DEFAULT 'interna'
  - `transferencias_ordem.protocolo_id` FK → protocolos
  - `transferencias_ordem.deposito_origem_id` FK → depositos
  - `servicos.transferencia_service_id` FK → transferencias_ordem
- `POST /api/pcp/transferir-service` — gerente_fabrica/pcp inicia transferência de peça para operador service externo
  - Valida `deposito.is_operador_service=true`
  - Move saldo líquido de ouro via CEs duplas (TED: origem→destino)
  - Cria protocolo ida automático (tipo_protocolo='fabrica', etapas='pendente')
  - Vincula protocolo na transferencia_ordem
  - Atualiza `pcp.deposito_id` + `pcp.etapas='em_andamento'` + `ordens.local_atual`
- `POST /api/pcp/transferir-service/receber` — operador service recebe peça via protocolo
  - Conclui protocolo (dispara fn_concluir_protocolo)
  - Limpa PCP duplicado + saida_ordem criados pelo trigger
  - Cria `servicos` com `transferencia_service_id` + `status='em_servico'`
- `POST /api/service/[id]/devolver` — operador service devolve peça ao Pote (dep=1)
  - Validação IA de peso da peça + fio de solda
  - SM (consumo solda), TED (operador→pote), quebra + QUEBRA_PCP CE
  - Cria protocolo volta para motoboy buscar
  - Atualiza `servicos.status='devolvido'`
- `GET /api/service/operadores` — expandido para aceitar gerente_fabrica/pcp/gerente_loja
- `GET /api/service/meus` — inclui `transferencia_service_id` + `deposito_origem_nome` (JOIN deposito origem)
- `GET /api/pcp/[id]` — inclui info do serviço ativo via LATERAL JOIN em servicos

#### Front-end
- `TransferenciaPCPModal`: toggle "Interna / Service" — modo service lista operadores service, envia para `/api/pcp/transferir-service`
- `ServiceApp`: badge "Da fabrica (nome)", botão Devolver (ouro) para serviços com `transferencia_service_id`, view Devolver completa (peso + foto IA + solda)
- `KanbanClient`: badge "Na service" (laranja) em cards com serviço ativo service
- `PCPDetalheModal`: seção "Na service externa" mostra operador, status e data de recebimento
- `pcp/page.tsx`: campo `na_service` via EXISTS subquery nos PCPs

### Modificado
- `registrar-quebra.ts`: tipo `"devolucao_service"` adicionado à union de RegistroQuebra

---

## v2.14.2 — Fix Quebra Double-counting (31/03/2026)

### Corrigido
- `buscarOuroRecebido`: retorna saldo líquido (SUM entradas − SUM saídas) em vez de apenas SUM entradas
  - Antes: múltiplas transferências de aditivo para o mesmo operador causavam double-counting
  - Agora: calcula saldo real disponível no operador para a ordem
- Impacta: quebra de transferência PCP, quebra de saída PCP, quebra de devolução service

---

## v2.14.1 — Refinamentos Compras R5-R7 (28/03/2026)

### Adicionado
- Botão "Voltar p/ Rascunho" em compras recebidas (PATCH /api/compras/[id]/reverter-rascunho)
- Cadastro de insumo inline no form de compras (botão "+" ao lado da busca → mini-form)
- Pedras nas compras: input direto em ct + custo total → sistema calcula custo/ct automaticamente

### Modificado
- ComprasClient: form de pedras invertido — usuário informa peso em ct + custo total; custo/ct é calculado (custo_total ÷ peso_ct)
- ComprasClient: tabela de itens pedras exibe peso_ct (ct), custo/ct com 4 casas + qtd_pecas no mesmo campo
- Tela /insumos: headers ordenáveis + pedras em ct (R1-R4 anterior)

## v2.14.1 — Refinamentos Insumos (28/03/2026)

### Modificado
- Tela /insumos: headers de coluna clicáveis com ordenação asc/desc (▲/▼)
- Tela /insumos: pedras (cat. 2) exibem unidade "ct", saldo em ct (4 casas), est. mín em ct

## v2.14.0 — Reposição Loja — Primeiro tipo de ordem funcional (28/03/2026)
<!-- Última atualização: 28/03/2026 — Task ordens-02 reposicao_loja -->

### Features
- Tipo "Reposição Loja": primeiro tipo de ordem funcional no módulo criação
- `NovaOrdemReposicaoLojaModal`: busca produto, checklist de variações com qtd, fotos de referência
- `GET /api/produtos/[id]/variacoes`: variações ativas de um produto pai (usa `erp_produtos.parent_id`)
- `POST /api/ordens` adaptado: aceita `fotos_base64[]` (upload server-side) e `detalhes_ordem`
- Peso estimado auto-preenchido de `public.produtos.peso_precificado` (editável em produto simples)
- Fotos de referência: compressão canvas client-side → base64 → upload server-side em `ordem-fotos`
- Rollback de fotos se upload parcial falhar (cleanups de órfãos)
- `NovaOrdemButton`: `reposicao_loja` abre modal; demais tipos mantêm toast "Em construção"
- Responsivo: bottom-sheet no mobile, modal centrado no desktop
- Ordem segue fluxo completo: auditoria loja → PCP

---

## v2.14.0 — Compras + Pedras CT + Multi-Local (28/03/2026)

### Adicionado
- Tabela `locais_estoque` (Fábrica=1, Loja=2) com CRUD e aba em /configuracoes
- Controle de pedras em quilates (CT) — conversão: 1 ct = 0.2g
- Formatters: `formatPesoCt`, `gramasToCt`, `ctToGramas`, `formatMoeda`
- Filtro por local de estoque em /estoque
- Transferência entre locais físicos (`TransferirLocalModal`, CE dupla marcador TA)
- Etapa "receber" no fluxo de compras (3 etapas: rascunho→recebida→concluída)
- Form condicional de compras por categoria (Metal/Pedras/Banho/Outros)
- Local de destino selecionável nas compras (default: Fábrica)
- Campo NF nas compras
- View `vw_saldo_por_local` — saldo agrupado por local físico e categoria
- `LocaisEstoqueTab` — componente CRUD de locais em /configuracoes
- Dropdown "Nova Ordem" com 7 tipos via `NovaOrdemButton` (filtrado por permissão, toast placeholder)

### Modificado
- 7 triggers atualizados para suportar CT e local_estoque_id
- 15+ APIs modificadas para CT, multi-local e compras expandidas
- ComprasClient reescrito com fetch /api/* (corrige supabase.from bug silencioso)
- Componentes PCP/Distribuição/Estoque exibem pedras em CT (4 casas decimais)
- Input de pedras: operador digita gramas → sistema exibe CT ao lado em tempo real
- IA de validação: prompt para pedras lê CT da balança (antes contava unidades)
- Views vw_saldo_estoque e vw_detalhe_pote atualizadas com saldo_ct

### Corrigido
- ComprasClient silently broken (supabase.from para schema alissonerp) → pg.Pool via fetch
- `ia-validar-peso`: default fallback modelo Gemini corrigido de `gemini-2.0-flash` para `gemini-2.5-flash`

### Migrations
- `094_locais_estoque.sql`
- `095_pedras_quilates_ct.sql`
- `096_compras_expandidas.sql`
- `097_views_saldo_multilocal_ct.sql`
- `098_triggers_pedras_ct_compras.sql`

### Sprints
1. Banco (094-097) → 2. Triggers (098) → 3. APIs → 4. Frontend PCP+Estoque → 5. Frontend Compras → 6. IA+Testes+Docs

## v2.13.4 (28/03/2026)
### Fixes
- Service: `/api/service/operadores` retornava lista vazia — corrigido bug postgres.js `IS NULL` em parâmetro inteiro (branch JS)
- Protocolo: tipos fábrica e service ajustados (garantia em ambos; servico_interno → service)

## v2.13.3 (28/03/2026)
### Features
- Protocolo: tipos Fábrica e Service com permissões por usuário (`tipos_protocolo_permitidos` JSONB em `usuarios`)
- Protocolo: seletor de tipo via dropdown no header (padrão OrdensClient), badge no modal e na lista
- Protocolo: `tipo_protocolo VARCHAR(20)` em `alissonerp.protocolos` (migration 093)
- UserEditDrawer: seção "Permissões de Protocolo" com checkboxes Fábrica/Service

## v2.13.0 (26/03/2026)
### Features
- Módulo Service: app mobile dark-theme para operadores receber/concluir/transferir serviços
- Tabela `alissonerp.servicos` + trigger `trg_criar_servico_from_pcp` (migration 092)
- Flag `is_operador_service` em `alissonerp.usuarios` — toggle em Configurações > Usuários
- Bucket `service-fotos` no Supabase Storage
- 7 rotas `/api/service/*`: pendentes, receber, meus, concluir, transferir, solda-saldo, painel
- IA valida foto da balança (peso peça + peso fio) na conclusão de serviços
- Consumo de solda calculado automaticamente (saldo_antes − peso_fio_depois)
- Pedras por serviço: origem estoque (movimenta SM/SP) ou origem cliente (sem movimentação)
- Auditoria fábrica criada automaticamente ao concluir serviço
- Sidebar: links "Service" (operadores) e "Painel Service" (gerentes/admin)
- `ROLES_SERVICE_PANEL` em `src/lib/roles.ts`
- Realtime subscription em `alissonerp.servicos` no app mobile
- SaldoBar: barra de saldo de fio de solda com gradiente (verde/âmbar/vermelho)

## v2.12.0 (24/03/2026)
### Features
- Protocolo: responsável (criado por) e concluído por nos cards e detalhe
- Protocolo: thumbnails de foto criação/conclusão clicáveis
- Protocolo: zoom na foto (scroll, duplo clique, arrastar, botões +/−)
- Protocolo: filtro de status Pendentes/Concluídas/Todas (default Pendentes)
- PCP: atribuir operador com metal externo > 0 move pra em_andamento automaticamente
- Precificação: coluna markup atual na simulação de impacto
- Precificação: campo de busca por nome/SKU no preview
- Fichas técnicas por produto + bucket produto-3d + API modelo-3d (migration 091)

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
- Teores em configurações + permissões granulares (5 ações) + cadeado teor ligação
### Fixes
- Fix NaN itens legados

## v2.10.1 (23/03/2026)
### Fixes
- normalizeRow — usar Record<string, unknown> em vez de T para evitar erro TS2862
- Auto-atribuir deposito_id no PCP no primeiro apontamento fora do Almoxarifado

## v2.10.0 (23/03/2026)
### Features
- Módulo purificação 18k→24k + ligação 24k→18k (página /purificacao)
- Integração WhatsApp + phone em user_profiles (migrations 086-088)
- Permissões granulares por usuário — purificação e ligação (migration 089)

## v2.9.0 (20/03/2026)
- feat: estorno de lote inteiro + destino transferência avulsa

## v2.8.0 (19/03/2026)
- feat: baixa pedras + avatar + email atômico + senha + operador + lote + storage
- feat: estorno distribuição + avatar + email + senha + pedras + operador + storage
