> 📋 Última atualização automática: 26/03/2026 — Versão: v2.13.0

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
