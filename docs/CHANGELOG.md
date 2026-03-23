# Changelog — Alisson ERP (fabricaAJ)

> Regra: TODO push atualiza o CHANGELOG. Features = MINOR (v2.X.0), Fixes = PATCH (v2.9.X).

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
