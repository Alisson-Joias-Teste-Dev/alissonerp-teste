# Relatório de Auditoria — fabricaAJ ERP
**Data:** 2026-04-09 | **Tipo:** Leitura e Documentação (ZERO alterações de código)

---

## 1. ESTRUTURA DE ARQUIVOS

### Total inventariado

| Tipo | Quantidade |
|------|-----------|
| API routes (`route.ts`) | 190 |
| Componentes (`.tsx`) | 57 |
| Libs (`.ts`) | 16 |
| Hooks | 1 (`useAuth.ts`) |
| Stores | 1 (`errorStore.ts`) |
| Páginas (`page.tsx`) | 30 |
| Migrations SQL | 132 (001–130) |
| Buckets Storage | 8 |

---

## 2. API ROUTES — Mapa Completo (88 routes)

### ORDENS
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/ordens/rastreio` | 6 categorias de rastreio; consultora filtra por vendedor_id |
| GET | `/api/ordens/[id]/fotos` | Fotos PDV (bucket imagens, público) + ERP (bucket ordem-fotos, signed URL 1h) |
| POST | `/api/ordens/[id]/fotos` | Registra path no array `alissonerp.ordens.fotos_paths` |
| DELETE | `/api/ordens/[id]/fotos` | Remove path do array + Storage (admin/desenvolvedor only) |
| GET | `/api/ordens/[id]/comentarios` | Lista comentários não excluídos + foto_path signed URL |
| POST | `/api/ordens/[id]/comentarios` | Cria comentário + notificações para @mencionados |
| PATCH | `/api/ordens/[id]/comentarios/[comentarioId]` | Edita texto (autor only) |
| DELETE | `/api/ordens/[id]/comentarios/[comentarioId]` | Soft delete (autor ou admin/desenvolvedor) |

### PROTOCOLO
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/protocolo/ordens?direcao=ida\|volta` | Ordens disponíveis por direção |
| POST | `/api/protocolo` | Cria protocolo |
| GET | `/api/protocolo/concluidos` | Histórico de protocolos concluídos |
| GET | `/api/protocolo/[protocoloId]` | Detalhe de protocolo |
| PATCH | `/api/protocolo/[protocoloId]` | Atualiza protocolo (conclusão) |

### AUDITORIA E CONFERÊNCIA
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/ficha/[ordemId]` | Ficha técnica da ordem (via vw_fichas_tecnicas) |
| PATCH | `/api/auditoria/[auditoriaId]` | Aprova/reprova auditoria |
| PATCH | `/api/aprovacao/[aprovacaoId]` | Aprovação consultora |
| PATCH | `/api/entrega/[entregaId]` | Marca entrega concluída |

### INSUMOS
| Método | Path | O que faz |
|--------|------|-----------|
| GET/POST | `/api/insumos` | Lista ou cria insumo |
| PATCH/DELETE | `/api/insumos/[id]` | Edita ou exclui insumo |
| GET | `/api/insumos/categorias` | 8 categorias fixas |
| GET | `/api/insumos/pote` | Ouro total no depósito geral (ID=1) |

### PCP
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/pcp/tipos-apontamento` | Tipos 1-9 fixos |
| GET | `/api/pcp/depositos` | Lista depósitos/operadores |
| GET | `/api/pcp/setores?deposito_id=X` | Setores de um depósito |
| GET | `/api/pcp/insumos?categoria_id=N` | Insumos por categoria |
| GET | `/api/pcp/insumos-disponiveis?deposito_id=X&categoria_id=Y` | Insumos com estoque > 0 |
| POST | `/api/pcp/apontamentos` | Cria apontamento (valida estoque tipos 1,2,3) |
| POST | `/api/pcp/validar-peso` | IA valida foto balança (metal ou pedra) |
| POST | `/api/pcp/transferir` | Transferência entre setores/depósitos |
| POST | `/api/pcp/ordem-teste` | Cria ordem de teste (só desenvolvedor) |
| POST | `/api/pcp/saida` | Saída da ordem → trigger calcula PMC/quebra |
| GET | `/api/pcp/[id]` | Detalhe PCP + dados da ordem |
| GET | `/api/pcp/[id]/apontamentos` | Histórico de apontamentos |
| GET | `/api/pcp/[id]/resumo` | Resumo por tipo de apontamento |
| GET | `/api/pcp/[id]/pedras-disponiveis` | Pedras disponíveis no almoxarifado |
| GET | `/api/pcp/[id]/historico` | Timeline cronológica completa |
| GET | `/api/pcp/[id]/insumos-transferencia` | Insumos pré-preenchidos para transferência |
| GET | `/api/pcp/[id]/outros-disponiveis` | Outros insumos disponíveis |

### DISTRIBUIÇÃO
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/distribuicao?etapas=em_andamento\|concluido` | Lista distribuições |
| POST | `/api/distribuicao` | Cria lote de distribuição |
| GET | `/api/distribuicao/ordens-disponiveis` | Ordens prontas para distribuição |
| GET | `/api/distribuicao/[id]` | Detalhe do lote |
| POST | `/api/distribuicao/[id]/saida` | Saída por ordem no lote |
| GET | `/api/distribuicao/[id]/pedras-apontadas` | Pedras apontadas no lote |
| POST | `/api/distribuicao/[id]/concluir` | Conclui lote de distribuição |
| POST | `/api/distribuicao/apontamentos` | Cria apontamento de distribuição |
| GET | `/api/distribuicao/[id]/apontamentos` | Histórico de apontamentos da distribuição |

### DEPÓSITOS E SETORES
| Método | Path | O que faz |
|--------|------|-----------|
| GET/POST | `/api/depositos` | Lista ou cria depósito |
| PATCH | `/api/depositos/[id]` | Edita depósito (ID=1 protegido) |
| GET/POST | `/api/setores` | Lista ou cria setor |
| PATCH | `/api/setores/[id]` | Edita setor |

### DASHBOARD
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/dashboard/fabrica` | KPIs fábrica com filtro de data |
| GET | `/api/dashboard/fabrica/movimentacoes` | Movimentações paginadas |

### COMPRAS
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/compras/fornecedores` | Lista fornecedores |
| POST | `/api/compras` | Cria compra |
| GET/POST | `/api/compras/[id]/itens` | Itens de uma compra |
| DELETE | `/api/compras/[id]/itens/[itemId]` | Remove item |
| PATCH | `/api/compras/[id]/concluir` | Conclui compra |

### LANÇAMENTOS
| Método | Path | O que faz |
|--------|------|-----------|
| POST | `/api/lancamentos-avulso` | Flow 1006: 4 tipos (TA/EA/SA/Sangria) |

### USUÁRIOS
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/user/role?user_id=UUID` | Role + name + avatar_url (usuarios JOIN user_profiles) |
| POST | `/api/user/avatar` | Upload avatar para bucket 'avatars' + upsert user_profiles |
| GET | `/api/user/permissoes?user_id=UUID` | modulos_leitura[], modulos_escrita[], role |
| PATCH | `/api/user/[id]` | Edita nome, role, ativo, deposito_id, email, senha |
| PATCH | `/api/user/alterar-senha` | Usuário muda própria senha (⚠️ listado como GET em docs antigas) |
| GET | `/api/usuarios/busca?q=` | Busca usuários para @mentions |

### CONFIGURAÇÕES
| Método | Path | O que faz |
|--------|------|-----------|
| GET/PATCH | `/api/configuracoes/ia` | Config IA (provedor, modelo, ativa) |
| POST | `/api/configuracoes/ia/key` | Salva/remove API key de IA |
| GET/PATCH | `/api/configuracoes/parametros` | Parâmetros sistema (cotações, limiares) |
| GET/PATCH | `/api/configuracoes/permissoes` | Permissões por role e módulo |
| GET | `/api/configuracoes/roles` | Lista roles do sistema |
| PATCH | `/api/configuracoes/roles/[nome]` | Edita role |

### NOTIFICAÇÕES
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/notificacoes` | Lista notificações do usuário |
| GET | `/api/notificacoes/contagem` | Contagem de não lidas |
| POST | `/api/notificacoes/ler-todas` | Marca todas como lidas |
| PATCH | `/api/notificacoes/[id]/ler` | Marca uma como lida |

### PRECIFICAÇÃO
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/precificacao/cotacoes` | ouro_brl_g, dollar_brl, fator |
| GET | `/api/precificacao/markup-ouro` | Faixas public.categoria_precificação (readonly) |
| GET/POST/PATCH | `/api/precificacao/markup-pedras` | CRUD faixas markup_pedras |
| GET/PATCH | `/api/precificacao/regras` | Limiares subir/descer, arredondamento |
| POST | `/api/precificacao/simular` | Simula impacto SEM aplicar |
| POST | `/api/precificacao/solicitar-aprovacao` | INSERT markup_alteracoes status=pendente |
| GET | `/api/precificacao/pendentes` | Lista pendentes + histórico |
| POST | `/api/precificacao/aprovar` | Aplica markup + recalcula (admin/dev only) |
| POST | `/api/precificacao/rejeitar` | Rejeita com motivo obrigatório (admin/dev only) |

### PRODUTOS
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/produtos` | Lista paginada (50/pág), filtros, agrupamento pai/variação |
| POST | `/api/produtos` | Cria produto + variações automáticas |
| GET/PATCH | `/api/produtos/[id]` | Detalhe + composição + variacoes[] |
| GET/POST | `/api/produtos/[id]/composicao` | BOM items |
| PATCH/DELETE | `/api/produtos/[id]/composicao/[itemId]` | Edita/remove item BOM |
| POST | `/api/produtos/[id]/propagar` | Propaga medidas/BOM do pai para variações |
| GET | `/api/produtos/insumos?categoria_id=N` | Insumos para autocomplete BOM |
| GET | `/api/produtos/setup` | nextSku, categorias, cotacao |

### VENDAS (expandido)
| Método | Path | O que faz |
|--------|------|-----------|
| GET/POST | `/api/vendas` | Lista vendas com filtros / Cria venda ERP atômica |
| GET/PATCH | `/api/vendas/[id]` | Detalhe venda / Atualiza campos (situação, frete, obs) |
| POST | `/api/vendas/[id]/cancelar` | Cancela venda (valida pagamentos) |
| POST | `/api/vendas/[id]/compartilhar` | Gera/regenera token público de compartilhamento |
| POST | `/api/vendas/[id]/enviar-tiny` | Envia pedido para Tiny ERP API v3 |
| GET | `/api/vendas/[id]/pdf` | Gera PDF da venda/orçamento |
| GET/POST | `/api/vendas/[id]/itens` | Lista / Adiciona item à venda |
| PATCH/DELETE | `/api/vendas/[id]/itens/[itemId]` | Edita / Remove item da venda |
| GET/POST | `/api/vendas/[id]/pagamentos` | Lista / Adiciona pagamento |
| PATCH/DELETE | `/api/vendas/[id]/pagamentos/[pagId]` | Edita status / Remove pagamento |
| GET | `/api/vendas/analise-comissoes` | KPIs comissão por período |
| GET | `/api/vendas/analise-frete` | Resumo frete + entregas pendentes |
| GET | `/api/vendas/analise-resultado` | Faturamento, ranking, meta |
| GET | `/api/vendas/clientes/busca` | Autocomplete clientes (public.contatos) |
| GET/POST/PATCH | `/api/vendas/faixas-comissao` | CRUD faixas de comissão |
| GET | `/api/vendas/forma-envio` | Formas envio + frete |
| GET/POST | `/api/vendas/metas` | Lista / Cria meta vendedora (upsert) |
| GET | `/api/vendas/por-cliente/[clienteId]` | Últimas 50 vendas do cliente |
| GET | `/api/vendas/produtos/busca` | Autocomplete produtos com variações |
| GET | `/api/vendas/ranking` | Ranking mensal vendedoras |
| POST | `/api/vendas/upload-video` | Upload vídeo para bucket vendas-videos |

### ORÇAMENTO
| Método | Path | O que faz |
|--------|------|-----------|
| GET/POST | `/api/orcamento` | Lista / Cria orçamento com 3D foto |
| GET/PATCH | `/api/orcamento/[id]` | Detalhe / Atualiza status (aprovação→venda) |
| GET | `/api/orcamento/compartilhado` | Orçamento público por token (sem auth) |
| GET/POST | `/api/orcamento/config` | Config global de precificação orçamentos |

### TAREFAS
| Método | Path | O que faz |
|--------|------|-----------|
| GET/POST | `/api/tarefas` | Lista / Cria tarefa com notificação |
| GET/PATCH/DELETE | `/api/tarefas/[id]` | Detalhe / Atualiza / Remove tarefa |
| GET/POST/PATCH | `/api/tarefas/[id]/aprovacao` | Workflow aprovação de tarefa |
| POST | `/api/tarefas/[id]/comentarios` | Adiciona comentário à tarefa |
| GET/POST | `/api/automacoes-tarefa` | Lista / Cria automação recorrente |
| PATCH/DELETE | `/api/automacoes-tarefa/[id]` | Edita / Remove automação |
| POST | `/api/automacoes-tarefa/[id]/executar` | Executa automação manualmente |

### ESTOQUE COMERCIAL
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/estoque-comercial` | Lista produtos com alertas (zerado/abaixo/ok) |
| GET | `/api/estoque-comercial/[produtoId]` | Saldo + últimos 50 movimentos |
| GET/PATCH | `/api/estoque-comercial/config/[produtoId]` | Config mínimo estoque |
| POST | `/api/estoque-comercial/movimentos` | Registro manual entrada/saída |
| POST | `/api/estoque-comercial/sync-tiny` | Sync estoque → Tiny API v3 (batch) |

### RELATÓRIOS
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/relatorios` | Relatório por tipo (produção/comercial/financeiro/estoque) |

### INTEGRAÇÕES
| Método | Path | O que faz |
|--------|------|-----------|
| POST | `/api/integracoes/kommo` | Sync contato/lead para Kommo CRM v4 |
| POST | `/api/integracoes/woocommerce` | Sync produto para WooCommerce REST API |
| GET/PATCH | `/api/configuracoes/integracoes` | Check / Save credenciais integração |
| GET/POST/PATCH | `/api/configuracoes/cotacoes` | Cotações + automação openexchangerates |

### FINANCEIRO (expandido)
| Método | Path | O que faz |
|--------|------|-----------|
| GET/POST | `/api/financeiro/contas-pagar` | Lista / Cria conta a pagar |
| PATCH | `/api/financeiro/contas-pagar/[id]` | Atualiza status/valor conta pagar |
| GET/POST | `/api/financeiro/contas-receber` | Lista / Cria conta a receber |
| PATCH | `/api/financeiro/contas-receber/[id]` | Atualiza status/valor conta receber |

### SERVICE (expandido)
| Método | Path | O que faz |
|--------|------|-----------|
| POST | `/api/service/[id]/devolver` | Devolve peça ao almoxarifado (peso+foto+solda) |
| POST | `/api/service/[id]/transferir-fabrica` | Transfere de volta para fábrica |
| GET | `/api/service/aditivo-saldo` | Saldo de aditivo do operador |
| POST | `/api/service/carregar-aditivo` | Carrega aditivo do almoxarifado → operador |
| GET | `/api/service/pedras-estoque` | Pedras disponíveis por local |
| POST | `/api/service/reprovar` | Reprova serviço na inspeção |

### PCP (expandido)
| Método | Path | O que faz |
|--------|------|-----------|
| POST | `/api/pcp/transferir-service` | Transfere PCP para operador service |
| POST | `/api/pcp/transferir-service/receber` | Operador recebe peça transferida |

### ORDENS (expandido)
| Método | Path | O que faz |
|--------|------|-----------|
| GET | `/api/ordens/produtos-busca` | Autocomplete produtos para ordem |
| GET | `/api/ordens/proximo-numero` | Preview próximo número C-XXXX |
| GET | `/api/ordens/vendedores` | Vendedores ativos para dropdown |
| POST | `/api/ordens/route.ts` | Cria ordem completa (fabricação/garantia/serviço/reposição) |

### CONTATOS
| Método | Path | O que faz |
|--------|------|-----------|
| POST/PATCH | `/api/contatos` | Cria / Atualiza contato com validação CPF |

### USUÁRIOS (expandido)
| Método | Path | O que faz |
|--------|------|-----------|
| POST | `/api/user` | Cria novo usuário (auth + alissonerp) |
| GET | `/api/usuarios/transportadores` | Lista transportadores (is_transportador=true) |

---

## 3. COMPONENTES — Inventário Completo (32 componentes)

### Componentes de Layout
| Componente | Arquivo | Descrição |
|-----------|---------|-----------|
| `Sidebar.tsx` | `src/components/Sidebar.tsx` | Nav lateral w-56, ícones Lucide, menus por role, footer com nome/role/Sair |
| `DashboardShell.tsx` | `src/components/DashboardShell.tsx` | Wrapper do dashboard |
| `Dashboard.tsx` | `src/components/Dashboard.tsx` | Server component dashboard |
| `DashboardClient.tsx` | `src/components/DashboardClient.tsx` | Stats cards + tabela ordens + depósitos + vendedores |

### Componentes de Ordem
| Componente | Arquivo | Descrição |
|-----------|---------|-----------|
| `OrdensClient.tsx` | `src/components/OrdensClient.tsx` | Tabela ordens com busca e filtros |
| `GaleriaFotosOrdem.tsx` | `src/components/ordem/GaleriaFotosOrdem.tsx` | Galeria de fotos da ordem (PDV + ERP), upload, lightbox, delete admin-only |
| `ComentariosOrdem.tsx` | `src/components/ComentariosOrdem.tsx` | Sistema de comentários: realtime, @mentions, edição, foto anexo |
| `PerfilDrawer.tsx` | `src/components/PerfilDrawer.tsx` | Drawer perfil: avatar upload comprimido, nome, senha |
| `UserAvatar.tsx` | `src/components/UserAvatar.tsx` | Avatar do usuário |
| `UserEditDrawer.tsx` | `src/components/UserEditDrawer.tsx` | Drawer de edição de usuário (admin) |
| `NotificacoesDrawer.tsx` | `src/components/NotificacoesDrawer.tsx` | Drawer de notificações |

### Componentes de Feature
| Componente | Arquivo | Descrição |
|-----------|---------|-----------|
| `KanbanClient.tsx` | `src/components/KanbanClient.tsx` | Kanban PCP: 6 colunas, 3 modais (Apontar/Transferir/Saída) |
| `DistribuicaoClient.tsx` | `src/components/DistribuicaoClient.tsx` | Distribuição de ordens para operadores |
| `EstoqueClient.tsx` | `src/components/EstoqueClient.tsx` | Estoque: 3 abas (Saldos, Movimentações, Catálogo) |
| `QuebraClient.tsx` | `src/components/QuebraClient.tsx` | Dashboard quebra: PieChart + BarChart (Recharts) |
| `ComprasClient.tsx` | `src/components/ComprasClient.tsx` | ⚠️ BUG: usa supabase.from() para alissonerp — silently broken |

### Componentes de Produtos
| Componente | Arquivo | Descrição |
|-----------|---------|-----------|
| `CadastroProdutoModal.tsx` | `src/components/produtos/CadastroProdutoModal.tsx` | Stepper 4 etapas: Dados, BOM, Medidas, Variações |
| `ProdutoDrawer.tsx` | `src/components/produtos/ProdutoDrawer.tsx` | Drawer produto: BOM, precificação, ficha técnica |

### Componentes de Motoboy
| Componente | Arquivo | Descrição |
|-----------|---------|-----------|
| `ProtocoloMotoboy.tsx` | `src/components/motoboy/ProtocoloMotoboy.tsx` | Interface PWA dark theme para motoboy |

### Modais/Forms
| Componente | Descrição |
|-----------|-----------|
| `ApontamentoDistModal.tsx` | Apontamento de distribuição |
| `ApontamentoPCPModal.tsx` | Apontamento PCP (tipos 1-7, foto+IA obrigatória) |
| `ConcluirDistModal.tsx` | Conclusão de lote distribuição |
| `ConcluirProtocoloModal.tsx` | Conclusão de protocolo (gerente/admin) |
| `FecharOrdemDistModal.tsx` | Fechar ordem em distribuição |
| `LancamentoAvulsoModal.tsx` | Lançamento avulso Flow 1006 |
| `NovaDistribuicaoModal.tsx` | Criar novo lote de distribuição |
| `NovaPCPModal.tsx` | Criar novo PCP |
| `NovaProtocoloModal.tsx` | Criar novo protocolo |
| `OrdemTesteModal.tsx` | Criar ordem de teste (só desenvolvedor) |
| `PCPDetalheModal.tsx` | Detalhe PCP: histórico + resumo + ações |
| `SaidaOrdemModal.tsx` | Saída da ordem: PMC preview em tempo real |
| `TransferenciaPCPModal.tsx` | Transferência entre setores/depósitos |

---

## 4. LIBS E HOOKS

### Hooks (1)
| Arquivo | Exports | O que faz |
|---------|---------|-----------|
| `src/hooks/useAuth.ts` | `useAuth()` | Retorna `{ user, role, nome, fotoUrl, loading, modulos_leitura, modulos_escrita }`. Fonte de role: `perm?.role` (permissoes API) com fallback para JWT metadata. Escuta evento `perfil:foto-atualizada` para atualizar avatar sem reload. |

### Libs (11)
| Arquivo | O que faz |
|---------|-----------|
| `lib/db.ts` | Pool postgres npm direto ao banco (sem RLS, sem PostgREST) |
| `lib/roles.ts` | Constantes de roles: `ROLES_FULL_ACCESS`, `ROLES_CONCLUIR_PROTOCOLO`, `ROLES_PRECIFICACAO`, `ROLES_PRODUTOS`. Funções: `isFullAccess`, `isPrecificacaoAccess`, `isProdutosAccess`, `hasRole` |
| `lib/formatters.ts` | `formatPeso(valor)` — 2 casas decimais, null/undefined → "—" |
| `lib/ia-validar-peso.ts` | `validarPesoBalanca()`: Gemini/Claude/OpenAI, parse robusto com regex fallback; tolerância zero (0.005g) para metal; configurável (%) para pedras |
| `lib/recalcular-preco-pedras.ts` | Recalcula `preco_pedras` e `preco_total_sync` após mudança BOM |
| `lib/recalcular-totais-pcp.ts` | Recalcula totais do PCP |
| `lib/registrar-quebra.ts` | Registra quebra de ouro |
| `lib/webhooks.ts` | Dispara webhooks (n8n) |
| `lib/auth/permissions.ts` | `Role` type, `getMenusForRole()`, `canAccess()`. Fonte de verdade para menus da sidebar. |
| `lib/supabase/client.ts` | `createBrowserClient` (client-side auth + realtime) |
| `lib/supabase/server.ts` | `createServerClient` (server-side, cookies) |

---

## 5. ESTRUTURA DE TABELAS RELEVANTES

### alissonerp.ordens (colunas novas — migration 071)
```
fotos_paths    TEXT[]   — array de paths no bucket 'ordem-fotos' (fotos ERP)
eh_teste       BOOLEAN  — badge 🧪 TESTE no Kanban (migration 065)
```

### alissonerp.comentarios_ordem (migration 069+071)
```
id             SERIAL PK
ordem_id       INTEGER FK → alissonerp.ordens.id
autor_id       UUID FK → alissonerp.usuarios.id
texto          TEXT
mencoes        TEXT[]   — array de UUIDs mencionados
editado        BOOLEAN
editado_em     TIMESTAMPTZ
texto_original TEXT     — texto antes da edição (migration 071)
excluido       BOOLEAN  — soft delete (migration 071)
excluido_em    TIMESTAMPTZ
excluido_por   UUID
foto_path      TEXT     — path no bucket 'ordem-fotos' (migration 071)
created_at     TIMESTAMPTZ
```

### alissonerp.notificacoes (migration 069 — renomear user_id → usuario_id)
```
id             SERIAL PK
usuario_id     UUID FK — (era user_id, renomeado)
tipo           VARCHAR — ex: 'mencao'
link           TEXT
ordem_id       INTEGER
comentario_id  INTEGER
remetente_id   UUID
lida_em        TIMESTAMPTZ
```

### public.user_profiles (migration 072)
```
id_user        UUID  PK (+ UNIQUE constraint adicionado em 072)
email          VARCHAR(255)
password_hash  VARCHAR(255)  — sempre '' ao fazer upsert via API
name           VARCHAR(255)
role           VARCHAR(50)   — CHECK: só admin|consultora|user|gerente|producao|logistica|financeiro
avatar_url     TEXT          — URL pública com ?t={timestamp} anti-cache
phone          VARCHAR(20)
created_at     TIMESTAMPTZ
updated_at     TIMESTAMPTZ
last_login     TIMESTAMPTZ
is_active      BOOLEAN
vendedor_id    BIGINT FK → public.vendedores
mx_desconto_permitido NUMERIC
```

---

## 6. STORAGE BUCKETS (5 buckets — verificado 2026-03-17)

| Bucket | Visibilidade | Limite | Usos |
|--------|-------------|--------|------|
| `avatars` | PÚBLICO | 10MB | Avatares de usuários (`{userId}.{ext}`) |
| `imagens` | PÚBLICO | sem limite | Legado PDV — NÃO usar para ERP |
| `protocolo-fotos` | PRIVADO | 10MB | Fotos de criação e conclusão de protocolos |
| `apontamento-fotos` | PRIVADO | 10MB | Fotos da balança em apontamentos PCP/distribuição |
| `ordem-fotos` | PRIVADO | 10MB | Fotos ERP das ordens + fotos de comentários (inclui HEIC) |

### Caminhos por bucket
```
avatars:           {userId}.{ext}
protocolo-fotos:   {protocoloId}/{timestamp}.{ext}
apontamento-fotos: {apontamentoId}/{timestamp}.{ext}
ordem-fotos:       ordens/{ordemId}/{timestamp}-{userId.substring(0,8)}.{ext}
                   comentarios/{ordemId}/{timestamp}-{userId.substring(0,8)}.{ext}
```

---

## 7. INCONSISTÊNCIAS E BUGS ENCONTRADOS

### BUG 1 — ComprasClient usa supabase.from() para alissonerp (CRÍTICO)
```
Arquivo: src/components/ComprasClient.tsx
Problema: usa supabase.from() para queries em alissonerp.*
Resultado: retorna [] silenciosamente (PostgREST não expõe alissonerp)
Status: documentado em arquitetura.md como ⚠️ R1
Solução necessária: migrar para API route com sql direto
```

### BUG 2 — Documentação incorreta: /api/user/alterar-senha é PATCH, não GET
```
Arquivo: src/app/api/user/alterar-senha/route.ts
Problema: MEMORY.md seção 22 e project_api_routes.md listam como "GET"
Realidade: é PATCH (altera senha — operação de escrita)
Impacto: documentação enganosa
```

### INCONSISTÊNCIA 1 — Role 'logistica' vs 'motoboy' (design intencional)
```
alissonerp.usuarios aceita role='motoboy' ou role='logistica' (são diferentes)
user_profiles.role: 'motoboy' → mapeia para 'logistica'
                    'logistica' → mapeia para 'logistica' (direto)
lib/roles.ts: ROLES_CONCLUIR_PROTOCOLO não inclui 'logistica' nem 'motoboy'
Impacto: usuário com role='logistica' pode ter permissões diferentes de 'motoboy'
```

### INCONSISTÊNCIA 2 — useAuth usa perm?.role como fonte primária (não JWT)
```
Arquivo: src/hooks/useAuth.ts linha 55
role: (perm?.role ?? roleFromToken) as Role | null
Fonte primária: /api/user/permissoes (alissonerp.usuarios.role)
Fallback: JWT user_metadata.role
Impacto: se /api/user/permissoes falhar, role vem do JWT (pode estar desatualizado)
```

### INCONSISTÊNCIA 3 — user_profiles.role constraint não cobre todos os roles ERP
```
Constraint aceita: admin, consultora, user, gerente, producao, logistica, financeiro
NÃO aceita: desenvolvedor, ourives, gerente_fabrica, gerente_loja, motoboy, pcp, etc.
Mapeamento em /api/user/avatar:
  desenvolvedor → admin
  gerente_fabrica / gerente_loja → gerente
  pcp / ourives / estoquista_fabrica → producao
  motoboy / logistica → logistica
  consultora → consultora
  financeiro → financeiro
  estoquista_loja → user
  outros → user
```

### INCONSISTÊNCIA 4 — avatars NÃO passam por compressão na API
```
Arquivo: src/app/api/user/avatar/route.ts
Comportamento: recebe File e faz upload direto (sem compressão server-side)
Compressão: feita APENAS no cliente em PerfilDrawer.tsx (canvas 200x200, JPEG 0.85)
Risco: upload via API direta (não pelo PerfilDrawer) pode enviar arquivo grande
```

### NOTA — migration 042 sem arquivo SQL
```
Migration 042 foi aplicada diretamente no banco sem criar arquivo .sql
Conteúdo: roles motoboy + quebra_operador inicial
Impacto: não está versionada no repositório
```

---

## 8. FLUXO FOTOS DE ORDENS (migration 071)

### Duas fontes de fotos por ordem
```
Fonte 1 — PDV (Directus):
  Tabela: directus.ordens.arquivos_path
  Bucket: 'imagens' (PÚBLICO)
  URL: direta pública sem assinatura
  Origin: "pdv"

Fonte 2 — ERP:
  Tabela: alissonerp.ordens.fotos_paths TEXT[]
  Bucket: 'ordem-fotos' (PRIVADO)
  URL: signed URL com expiração de 1 hora
  Origin: "erp"
```

### Componente GaleriaFotosOrdem.tsx
```
Props: { ordemId: number, arquivosPaths?: string[] | null }
Fetch: GET /api/ordens/${ordemId}/fotos
Funcionalidades:
  - Grid 4-6 colunas responsivo
  - Lightbox com navegação por teclado (←→ Esc)
  - Upload (JPEG, PNG, WebP, HEIC) com preview
  - Delete (admin/desenvolvedor only, apenas fotos ERP)
  - Badges de origem PDV/ERP
```

---

## 9. FLUXO COMENTÁRIOS DE ORDENS (migrations 069-071)

### Tabela: alissonerp.comentarios_ordem
- Soft delete: campo `excluido` (não DELETE físico)
- @mention: array `mencoes` com UUIDs dos usuários mencionados
- Foto: `foto_path` no bucket 'ordem-fotos' com path `comentarios/{ordemId}/...`
- Edição: campo `texto_original` preserva texto antes da edição

### Componente ComentariosOrdem.tsx
```
Props: { ordemId: number, onCountChange?: (count: number) => void }
Realtime: Supabase Realtime, canal "comentarios-ordem-{ordemId}"
  → INSERT em alissonerp.comentarios_ordem → recarrega lista
@Mention:
  - Trigger: digitar "@"
  - Busca: GET /api/usuarios/busca?q= (debounce 150ms)
  - Navegação: ↓↑ Enter/Tab para selecionar, Esc para fechar
  - Resultado: substitui "@query " por "@firstname ", add UUID em mencoes[]
Ações:
  - Editar: somente autor
  - Deletar: autor ou admin/desenvolvedor (soft delete)
  - Foto: bucket 'ordem-fotos', signed URL gerado ao carregar
```

---

## 10. PERFIL DO USUÁRIO — PerfilDrawer.tsx

```
Campos editáveis:
  - Avatar: click para selecionar, comprime 200x200 JPEG 0.85 (canvas client-side)
  - Nome: texto livre
  - Senha atual + nova senha + confirmar

Campos read-only:
  - Email (de auth.users)
  - Perfil de Acesso (role badge colorido)

Fluxo save:
  1. Se arquivo mudou: POST /api/user/avatar (envia File já comprimido)
     → dispatch CustomEvent "perfil:foto-atualizada" com nova URL
     → useAuth() escuta e atualiza fotoUrl sem reload
  2. Se nome mudou: PATCH /api/user/${userId}
  3. Se senha preenchida: PATCH /api/user/alterar-senha

Validações:
  - Nova senha min 6 chars
  - Confirmar senha deve bater com nova
  - Arquivo avatar: JPEG/PNG/WebP/HEIC, max 5MB (client-side)
```

---

## 11. PÁGINAS (18 total)

| Rota | Tipo | Role mínimo |
|------|------|-------------|
| `/login` | Client | público |
| `/` | Server+Client | qualquer autenticado |
| `/ordens` | Server+Client | qualquer autenticado |
| `/ordens/[id]` | Server+Client | qualquer autenticado |
| `/pcp` | Server+Client | ourives, pcp, gerente_fabrica, admin, dev |
| `/protocolo` | Server+Client | motoboy, gerente, admin, dev |
| `/estoque` | Server+Client | estoquista e acima |
| `/quebra` | Server+Client | pcp, gerente_fabrica, admin, dev |
| `/auditoria` | Server+Client | gerente, admin, dev |
| `/compras` | Server+Client | estoquista_fabrica, gerente_fabrica, admin, dev |
| `/configuracoes` | Server+Client | admin, dev |
| `/dashboard-fabrica` | Client | gerente_fabrica, admin, dev |
| `/distribuicao` | Server+Client | pcp, gerente_fabrica, admin, dev |
| `/financeiro` | Server+Client | financeiro, gerente, admin, dev |
| `/insumos` | Server+Client | estoquista e acima |
| `/precificacao` | Server+Client | gerente_loja, admin, dev |
| `/produtos` | Server+Client | gerente_loja, admin, dev |
| `/vendas` | Server+Client | gerente_loja, gerente_fabrica, admin, dev |

---

## 12. DESIGN SYSTEM

```
Paleta principal:
  Verde escuro (primário):  #184036
  Fundo escuro:             #0F2922
  Bege claro (cards):       #F3EADA
  Dourado (accent):         #DB9864
  Dourado claro:            #FEDDB4
  Verde médio:              #80A795
  Fundo página:             #FAFAF7
  Bordas:                   #E8DCC8

Fontes: Playfair Display, DM Sans, JetBrains Mono
CSS: Tailwind v4 via @theme em src/app/globals.css (SEM tailwind.config.ts)
```

---

## 13. MAPEAMENTO DE ROLES ERP → user_profiles

Conforme código real de `/api/user/avatar/route.ts`:

| Role ERP (alissonerp.usuarios) | Role user_profiles |
|-------------------------------|-------------------|
| admin | admin |
| desenvolvedor | admin |
| gerente_fabrica | gerente |
| gerente_loja | gerente |
| consultora | consultora |
| financeiro | financeiro |
| logistica | logistica |
| motoboy | logistica |
| pcp | producao |
| ourives | producao |
| estoquista_fabrica | producao |
| estoquista_loja | user |
| (qualquer outro) | user |

---

## 14. MIGRATIONS — Lista Completa (72)

| Range | Conteúdo |
|-------|----------|
| 001-013 | Schema base, config, RLS, Realtime |
| 014-016 | Views cross-schema |
| 017-022 | Auth + triggers (PCP, transferência, distribuição, protocolo, compras) |
| 023-025 | Storage + financeiro + webhooks |
| 026-027 | Auditoria + ponte PDV |
| 028-030 | Auditoria dupla + corrigir enum + ficha técnica |
| 031-032 | Timeline + grants |
| 033-040 | Labels ficha, numero_pedido, fix vendas, protocolo |
| 041-045 | Protocolo fotos, insumos, buckets, IA config |
| 046-054 | Depósitos/setores, distribuição, PCP, apontamentos |
| 055-064 | Produtos (BOM, markup, precificação, erp_produtos, seq) |
| 065-068 | eh_teste, quebra_operador, role_permissoes, role_varchar |
| 069-072 | Comentários, RLS comentários, fotos+soft-delete, user_profiles unique |

**Nota:** Migration 042 sem arquivo .sql — foi aplicada diretamente no banco.

---

*Relatório gerado em 2026-03-17. Nenhum arquivo .ts ou .tsx foi alterado.*
