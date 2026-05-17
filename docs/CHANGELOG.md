# Changelog — Alisson ERP (fabricaAJ)

> 📋 Última atualização automática: 17/05/2026 — Versão: v2.46.0 <!-- Revisado 17/05/2026 -->

> Regra: TODO push atualiza o CHANGELOG. Features = MINOR (v2.X.0), Fixes = PATCH (v2.9.X).

## fix(security): Onda 1A-3 — webhooks Focus NFe + MP HMAC + audit trail (v2.46.0)

Terceira onda do hardening. Fecha 3 problemas críticos em webhooks fiscais e
de pagamento que permitiam fraude do audit trail e bypass de assinatura.

**1. Focus NFe webhook — validação de secret opt-in via env**
`src/app/api/fiscal/webhook/focus/route.ts`: antes não validava nada (qualquer
um podia POST `{ref, status: "autorizado"}` e marcar NFe como autorizada).
Agora valida `process.env.FOCUS_WEBHOOK_SECRET` via header `Authorization:
Bearer <token>` ou query `?token=...`.
- **Sem env**: aceita mas loga warn (modo legado, não quebra prod)
- **Com env**: exige match — 401 se token inválido
- **Próximo passo**: configurar `FOCUS_WEBHOOK_SECRET` em `.env.local` + setar
  no painel Focus (Dashboard > Webhooks > Secret)

**2. Mercado Pago webhook — HMAC obrigatório (sem mais bypass via `live_mode=false`)**
`src/app/api/webhooks/mercado-pago/route.ts`: antes, se HMAC falhasse, o
fluxo continuava ("best-effort"). Pior: shortcut `live_mode === false`
retornava 200 sem nem validar HMAC, permitindo simulação forjada por atacante.
Agora HMAC é obrigatório quando `mp_webhook_secret` está configurado.
- Sem secret configurado: warn + aceita (modo legado, transição)
- Com secret + HMAC inválido: **401** mesmo em `live_mode=false`
- Validado em prod: POST com `live_mode:false` sem HMAC → **401 "Assinatura invalida"** (antes: 200)

**3. Mercado Pago `getSystemUserId` — sem mais fallback "admin mais antigo"**
`src/app/api/webhooks/mercado-pago/route.ts`: antes, quando
`mp_system_user_id` não estava configurado, o webhook usava `SELECT id FROM
usuarios WHERE role IN ('desenvolvedor','admin') ORDER BY created_at ASC LIMIT
1` — atribuindo autoria de transições financeiras a um admin aleatório que
nunca viu a venda. Audit trail mentia.

Agora a cadeia é honesta:
1. `mp_system_user_id` (preferido)
2. `created_by` da venda (autor original — quem iniciou)
3. **NULL + log ERROR** → venda NÃO é concluída automaticamente

Operador vê na fila e conclui manualmente quando `mp_system_user_id` for
configurado. Melhor do que mentir.

## fix(security): Onda 1A-2 — fechar `user_metadata?.role` em 56 rotas (v2.45.0)

Segunda onda do hardening de segurança. Fecha o mesmo padrão A da onda 1A-1
(`user_metadata?.role` permite escalada via `auth.updateUser`) em mais 56 rotas
do sistema.

**Novo helper** (`src/lib/auth-server.ts`): `authOr401(req)` retorna
`[user, null]` em sucesso ou `[null, NextResponse]` de 401/403 em falha. Padrão
reduzido de 8 linhas para 3 em cada handler.

**Lotes corrigidos:**

- **2.1 Configurações** (4): `roles`, `roles/[nome]`, `permissoes`, `parametros`
- **2.2 Site** (7): `test`, `sync`, `sync/[id]`, `produtos`, `produtos/[id]`,
  `invalidar-cache`, `config`
- **2.3 Produtos core** (20): `route` (GET/POST), `[id]/route` (GET/PATCH),
  `[id]/tiny-sync`, `[id]/propagar`, `[id]/imagens/route` (GET/POST),
  `[id]/imagens/[imgId]` (PATCH/DELETE), `[id]/composicao/route` (GET/POST),
  `[id]/composicao/[itemId]`, `sync-public-to-erp`, `sync-erp-to-public`,
  `setup`, `bulk-edit`, `pedras-bulk/route` (4 handlers), `pedras-bulk/reprice`,
  `peca-avulsa`, `categorias`, `metais`, `pendencias-contagem`,
  `preview-reclassificacao`, `classificar-tipo`, `normalizar-metal`,
  `rename-metal`, `insumos`
- **2.4 Precificação** (14): `aprovar`, `rejeitar`, `simular`,
  `solicitar-aprovacao`, `cotacoes`, `pendentes`, `regras`, `markup-ouro`,
  `markup-pedras`, `curva/aplicar`, `curva/categorias`, `curva/categorias/[id]`,
  `curva/config`, `curva/preview-aplicar`, `curva/simular-produto`
- **2.5 Outros** (8): `pcp/ordem-teste`, `gestao-estoque/produtos`,
  `gestao-estoque/vendas-semanais`, `gestao-estoque/oportunidades-fabricacao`,
  `fornecedores`, `estoque-produtos`, `dashboard-comercial/premiacao`

**Validação em prod (localhost dev → api.alisson.api.br):**
- 16/16 endpoints autenticados como admin: **200 OK** (sem regressão)
- 13/13 endpoints sem cookie: **401 Unauthorized** (antes: 200 via metadata)

**Pendência conhecida (não-crítica):** 13 arquivos frontend ainda usam
`user.user_metadata?.role` (Sidebar, page.tsx de produtos/precificacao/site/etc).
Isso é apenas para controle de UI (mostrar/esconder); backend já bloqueia. O
`useAuth` prioriza role da API (`perm?.role ?? roleFromToken`). Refator pode
vir em onda futura.

## fix(security): Onda 1A-1 — auth bypass em 12 rotas críticas (v2.44.0)

Primeira onda do hardening de segurança após auditoria completa do sistema
(`docs/audits/sistema-2026-05-16.md`). Fecha 3 padrões de bypass de
autenticação em rotas que mexem com dinheiro/ouro/credenciais.

**Padrão A — `user_metadata?.role` (escalada trivial):**
Supabase permite ao usuário escrever em `user_metadata` via
`auth.updateUser({ data: { role: "admin" } })`. Rotas que liam dali
deixavam qualquer pessoa virar admin. Trocadas por `requireAuth()` (lê de
`alissonerp.usuarios.role`, fonte de verdade do CLAUDE.md):
- `src/app/api/admin/api-chaves/route.ts` (GET, POST)
- `src/app/api/admin/api-chaves/[id]/route.ts` (PATCH, DELETE)

**Padrão B — rotas SEM auth nenhuma:**
- `src/app/api/configuracoes/ia/key/route.ts` (POST) — sobrescrevia API
  keys de Claude/OpenAI/Gemini sem checagem. Agora requer
  `isFullAccess(user.role)`.
- `src/app/api/lancamentos-avulso/route.ts` (POST) — lançava movimentação
  de ouro/pedras com `created_by` vindo do body (atacante setava UUID de
  qualquer um). Agora usa `user.id` da sessão. Rastreabilidade restaurada.

**Padrão C — autentica e ignora, confia em `user_id`/`user_role` do body:**
Purificação/refino de ouro (10 endpoints). Cliente enviava
`user_role: "admin"` no body e bypass total. Migrados para `requireAuth()`:
- `src/app/api/purificacao/route.ts` (GET, POST)
- `src/app/api/purificacao/[id]/route.ts` (GET, PATCH, DELETE)
- `src/app/api/purificacao/ligacao/route.ts` (GET, POST)
- `src/app/api/purificacao/ligacao/[id]/route.ts` (PATCH, DELETE)
- `src/app/api/purificacao/teores/route.ts` (GET)
- `src/app/api/purificacao/teores/[id]/route.ts` (PATCH)
- `src/app/api/purificacao/liga-tipos/route.ts` (GET)
- `src/app/api/purificacao/liga-tipos/[id]/route.ts` (PATCH)

**Callers no frontend ajustados** (não enviam mais `user_id`/`user_role`):
- `src/app/(dashboard)/purificacao/PurificacaoClient.tsx` (3 fetches)
- `src/app/(dashboard)/purificacao/LigacaoTab.tsx` (3 fetches)

**Validação em prod (localhost dev contra api.alisson.api.br):**
- POST `/api/lancamentos-avulso` sem auth → **401** (antes: 200)
- POST `/api/configuracoes/ia/key` sem auth → **401** (antes: 200)
- POST `/api/purificacao` sem auth → **401** (antes: aceitava `user_id` forjado)
- GET `/api/admin/api-chaves` sem auth → **403** (antes: 200 via metadata)
- GET `/api/purificacao` autenticado como admin → **200** (não regrediu)

**Próximas ondas (planejadas):**
- 1A-2: `user_metadata?.role` em ~45 rotas restantes (produtos, precificacao, site, configuracoes)
- 1A-3: webhook Focus NFe (sem assinatura) + MP HMAC bypass
- 1A-4: ~25 rotas sem auth (dashboard-comercial, pcp, protocolo, distribuicao)

Relatório completo em `docs/audits/sistema-2026-05-16.md`.

## feat(orcamento): Integridade do schema + paginação + helpers compartilhados (v2.43.0)

Onda 4 de hardening do módulo orcamento, após 3 auditorias paralelas (DB,
código, re-verificação dos fixes). Cobre lacunas estruturais que ficaram
expostas e que não dava pra fechar só com código de aplicação.

**Migration 260 (`260_orcamento_integridade.sql`)** — DDL idempotente,
aplicada com sucesso em staging (`72.60.55.140:5543`) após backup:
- Formaliza coluna `tipo_pedra` em `orcamento_fichas_tecnicas` (drift:
  existia em prod sem nenhuma migration declarando).
- Cria FK ausente em `orcamentos.vendedor_id → public.vendedores`
  (`ON DELETE SET NULL, NOT VALID`).
- Cria índice parcial em `vendedor_id` pra acelerar JOINs.
- Cria UNIQUE em `numero_orcamento` (sequence protegia até hoje, mas era
  defesa pela sorte).
- Cria CHECK constraints em `status`, `tipo`, `quantidade` (NOT VALID — só
  defende inserts/updates futuros, não revalida histórico).
- Alinha `venda_numero_seq` com MAX real (estava desalinhada em 1 →
  próxima aprovação geraria `unique_violation`, capturada pelo retry mas
  desperdiçando uma tentativa).
- Alinha `orcamento_seq` também (defesa).
- GRANT USAGE,SELECT pras duas sequences pra `authenticated` (consistência
  com migration 104).

**Backup pré-migration:**
`backups/pre-260-{timestamp}.json` (snapshot de constraints/índices/
colunas/sequences/contagem de linhas via script Node).

**Helpers compartilhados (`src/lib/orcamento-shared.ts`)** — elimina
duplicação que ficou após as ondas 1-3:
- `ROLES_ORCAMENTO`, `ROLES_APROVACAO`, `ORCAMENTO_STATUS` (antes em 4-6
  arquivos diferentes — bug #1 da onda 1 nasceu de uma divergência dessa).
- `numCheck`, `validateNumericFields`, `orcamentoNumericChecks` (antes
  copy-paste byte-a-byte entre POST e PUT).
- Migrados: `api/orcamento/route.ts`, `api/orcamento/[id]/route.ts`,
  `(dashboard)/orcamento/page.tsx`, `detalhe/[id]/page.tsx`,
  `detalhe/[id]/OrcamentoDetalheClient.tsx`.

**Paginação real na listagem** — antes hardcodado `limit=100`. Agora paginação
"Carregar mais" com `ORC_PAGE_SIZE=50`, accumulate em estado, contador
`(parcial)` quando há mais páginas.

**Migrations com numeração duplicada** (130, 202, 203, 246, 247, 248):
**não renomeadas** propositalmente — já aplicadas em prod. Renomear quebra
o tracker. Documentado aqui pra deploys futuros se atentarem.

## fix(orcamento): Valida par exige ficha2 (v2.42.2)

- `POST /api/orcamento` e `PUT /api/orcamento/[id]`: quando `tipo=alianca`
  e `quantidade=2`, exige `ficha2` válida. Sem isso, retorna 422 com
  mensagem clara em vez de salvar par incompleto.

## fix(orcamento): Peça personalizada respeita edição + sequence pra numero_venda (v2.42.1)

- `src/app/(dashboard)/orcamento/OrcamentoClient.tsx` (Salvar de peça):
  agora usa `PUT /api/orcamento/{id}` quando `editingOrcId` está setado
  (antes sempre fazia POST e criava duplicata na listagem).
- Migration `259_venda_numero_sequence.sql`: nova
  `alissonerp.venda_numero_seq`, alinhada ao maior `numero_pedido` /
  `numero_venda` já existente.
- `src/app/api/orcamento/[id]/route.ts` (PATCH aprovar) e
  `src/app/api/vendas/route.ts` (POST): geram `numero_venda` via
  `nextval('alissonerp.venda_numero_seq')` direto no INSERT — elimina race
  condition do antigo `MAX(numero_venda) + 1` quando dois INSERTs paralelos
  pegavam o mesmo número.

## fix(orcamento): Snapshot + lock previne sobrescrita silenciosa de valor negociado (v2.42.0)

Reabrir um orçamento recalculava o preço da ficha técnica e descartava o
valor combinado com o cliente — qualquer Salvar regravava o recalculado por
cima. Agora o orçamento guarda um snapshot do valor travado; a tela exibe o
travado, o Salvar não mexe nele, e há um botão Recalcular explícito para
quando o usuário realmente quer atualizar.

- Migration `258_orcamento_snapshot_lock.sql`: novas colunas `snapshot`
  (jsonb), `congelado_em` (timestamptz), `valor_negociado_locked` (bool).
  Flag global `config_orcamento.snapshot_lock_enabled` (default true).
  Backfill: rascunho/enviado/aprovado recebem snapshot dos valores atuais.
- `src/lib/orcamento-config.ts`: loader único da config (lista + detalhe
  usam o mesmo SELECT, com nomes_modelos/promocao/dome/snapshot_lock).
- `src/app/(dashboard)/orcamento/page.tsx`,
  `src/app/(dashboard)/orcamento/detalhe/[id]/page.tsx`: usam o loader único.
- `src/app/api/orcamento/[id]/route.ts`:
  - `GET` volta a expor `ficha`/`ficha2` como objetos via `row_to_json`,
    sem colidir `o.id` com `ft.id`.
  - `PUT` aceita `snapshot`, `valor_negociado_locked`, `valor_ouro`,
    `valor_pedras`, `cotacao_dolar`. Carimba `congelado_em = NOW()` quando
    um novo snapshot chega.
  - Foto 3D: path determinístico `orcamento/ORC-{id}/3d.jpg` com upsert
    (sem acumular arquivos órfãos), cache-bust via query string.
- `src/app/(dashboard)/orcamento/OrcamentoClient.tsx`:
  - Hidrata `savedSnapshot` ao abrir; exibe valor travado enquanto `!dirty`.
  - Badge dourado "Valor travado · dd/mm/yyyy" + botão Recalcular.
  - Badge amarelo "Recalculado · era R$ X" + botão Restaurar quando há
    divergência.
  - `handleSaveOrder`: persiste snapshot atual quando `!dirty`, novo
    snapshot quando recalculado, sempre com `valor_negociado_locked=true`.
  - `pricingTotal` agora arredondado a 2 casas (limpa lixo de centavos).
- `src/app/(dashboard)/orcamento/detalhe/[id]/OrcamentoDetalheClient.tsx`:
  esconde botão Compartilhar até o orçamento virar venda.
- `src/app/(dashboard)/orcamento/types.ts`: campos novos do
  `ConfigOrcamento` (`snapshot_lock_enabled`, promoção, nomes, etc) e
  type `OrcamentoSnapshot`.

## feat(promocoes): Regra de máximo de parcelas no cartão por campanha

Promoções de produto agora podem definir um teto de parcelas no cartão. Quando
a venda contém produto em campanha ativa, o dropdown de parcelas fica limitado
a esse valor. Fora da janela [data_inicio, data_fim], reverte automaticamente
ao default (12x). Sem cron, sem trigger — a view recompõe pela data.

- Migration `257_promocoes_max_parcelas.sql`: nova coluna
  `max_parcelas_cartao` em `alissonerp.promocoes_produtos` (CHECK 1..12, NULL
  = sem restrição). View `vw_produto_preco_vigente` recriada pra expor o
  campo.
- API `POST /api/promocoes` aceita `max_parcelas_cartao` no body.
- API `PATCH /api/promocoes/[id]` aceita `max_parcelas_cartao` (só enquanto
  campanha está agendada).
- API `GET /api/vendas/produtos/busca` retorna `max_parcelas_promo` em cada
  produto vigente.
- UI `NovaPromocaoModal`: input "Máximo de parcelas no cartão (opcional)".
- UI `PromocaoDetalheClient`: edição inline da regra (com botão Salvar)
  enquanto a campanha está agendada.
- UI `PagamentoForm`: aplica cap em todas as listas (Mercado Pago, demais
  gateways, modo Múltiplas). Banner "Limitado a Nx pela promoção (nome)" no
  campo.
- UI `NovaVendaClientV2`: deriva `maxParcelasPromoVenda = min` dos itens
  em promo. Reset automático de `pagCondicao` quando cap fica menor.

## fix(orcamento → venda): Comissão de aliança volta a usar faixas_comissao

Decisão de negócio: aliança deve seguir EXATAMENTE a mesma regra de produto
no checkout — `faixas_comissao` pelo `pct_desconto` do item. Sem distinção
por mkp, peso ou curva de produto. 30% desc (caso típico de promoção) → 0,5%
de comissão.

- `POST /api/orcamento/[id]`: cálculo de comissão volta a usar
  `faixas_comissao[desconto_pct]` (era `commissionForMarkup` pela curva).
- Frontend `VendaDetalheClient`: revertido — getComissao(pct) sem
  markup_aplicado. Imports e props de curva removidos.
- Coluna `markup_aplicado` em `itens_venda_erp` permanece (migration 256)
  mas fica não-usada. Pode servir pra auditoria futura.

Resultado em orçamentos atuais (30% promo):
- ORC-000063: R$ 9.600 → comissão 0,50% = **R$ 48,00**
- ORC-000058: R$ 20.571 → comissão 0,50% = **R$ 102,86**

## fix(orcamento → venda): Replica desconto + comissão por mkp na tela de venda

Quando o orçamento virava venda, o item era criado com `preco_lista = valor já
descontado` e `pct_desconto = 0`. Resultado: relatório de desconto mostrava 0%,
e se a consultora aplicasse +30% na venda, o desconto virava 51% real
(multiplicativo) sem ninguém perceber. Também a regra de aprovação
(`LIMITE_DESCONTO_APROVACAO=30`) não travava — só conferia o segundo desconto.

- Migration `256_itens_venda_markup_aplicado.sql`: nova coluna
  `markup_aplicado` em `alissonerp.itens_venda_erp`.
- `POST /api/orcamento/[id]` (aprovação) agora:
  * Reconstrói `preco_lista = valor / (1 − desconto/100)` (preço cheio).
  * Grava `pct_desconto` real do orçamento (30%, não 0%).
  * `preco_unitario = valor descontado` (mantém o total).
  * Grava `markup_aplicado = orc.markup` (faixa pricing_categories).
- `GET /api/vendas/[id]` retorna `markup_aplicado` em cada item.
- `VendaDetalheClient`:
  * Recebe `curvaConfig` + `curvaCategorias` via SSR.
  * `getComissao(pct, markup_aplicado)`: quando `markup_aplicado` presente,
    usa `commissionForMarkup` (curva); caso contrário, faixas_comissao por
    desconto (comportamento de produto).
  * Todos os recálculos client-side passam `item.markup_aplicado` pro
    getComissao — comissão de aliança fica consistente mesmo após edição.

Efeitos colaterais positivos:
- Relatório `analise-comissoes` (comissão perdida = `preco_lista × 0.04 −
  valor_comissao`) volta a calcular corretamente, já que `preco_lista` agora
  é o cheio.
- Limite de aprovação trava naturalmente: aliança já entra com 30%, segundo
  desconto exige aprovação.

## feat(orcamento): Comissão de aliança via curva de produto (pelo mkp)

Aliança aprovada pagava 4% fixo de comissão para a vendedora (vinha de
`faixas_comissao` em desconto 0%), independentemente do peso ou markup
aplicado. Agora a comissão segue a curva de precificação dos produtos: cada
mkp da faixa da aliança gera a comissão equivalente que um produto com aquele
mesmo mkp receberia.

- Nova função `commissionForMarkup(mkp, cfg, categorias)` em
  `src/lib/curva-precificacao.ts`: faz reverse lookup na curva pelo mkp e
  interpola linearmente entre os pontos. Igual a `getPricingFactors`, mas com
  o markup como chave em vez do peso.
- `POST /api/orcamento/[id]` (fluxo de aprovação) passa a derivar
  `pct_comissao` do `markup` salvo no orçamento via `commissionForMarkup`.
  Fallbacks em cascata: 1) mkp do orçamento; 2) peso do orçamento via curva;
  3) `faixas_comissao` em desconto 0% (compat histórico).
- Tabela equivalente para as faixas atuais (start_mkp 5, start_comm 5):

  | Faixa | Mkp | Comissão |
  |---|---|---|
  | Super Leves | 2.4× | 1,50% |
  | Leves | 2.3× | 1,40% |
  | Medias | 2.2× | 1,30% |
  | Pesadas | 2.1× | 1,20% |
  | Super Pesadas | 2.0× | 1,10% |

- Impacto financeiro: alianças vendidas hoje (mkp 2.3 médio) pagavam ~4% e
  passam a pagar ~1,4%. Vendedoras vão receber menos comissão por aliança;
  para ajustar pra cima, editar `curva_categorias.comm_variation` (sobe a
  comissão de todas as faixas correspondentes da curva).

## fix(orcamento): Aliança 3D não fica preta (RoomEnvironment local)

Material com `metalness=1` + `roughness=0` precisa de environment map pra
refletir — sem isso, fica preto. Os Environments de drei dependiam de CDN
externo (githack offline → tudo preto). Solução: importar `RoomEnvironment`
do próprio Three.js (vem embutido, gera PMREM em memória) e atribuir em
`scene.environment` via componente `StudioEnv` dentro do Canvas. Sem rede,
sem regressão visual.

## fix(orcamento): Config — salvar unificado + curvatura padrão global

A tela de Configurações do Orçamento tinha 3 botões de "Salvar" separados (um por
seção), cada um persistindo só parte dos campos. Usuárias editavam Markup, Risco
ou Gravação e clicavam no "Salvar mudanças" da seção de Espessura, achando que
era global — nada disso era salvo. Além disso, "Curvatura padrão (%)" mexia em
`params.domePercentage` (state local de uma única aliança aberta) e nunca era
persistida no banco.

- Migration `255_config_orcamento_dome_percentage.sql`: adiciona coluna
  `dome_percentage NUMERIC DEFAULT 100` em `alissonerp.config_orcamento`.
- API `POST /api/orcamento/config` agora aceita e persiste `dome_percentage`
  com COALESCE (não sobrescreve com null).
- `OrcamentoClient`: estado novo `defaultDomePercentage` (separado de
  `params.domePercentage`), inicializado de `config?.dome_percentage`. Toda
  aliança nova (`params` e `params2` iniciais) usa a curvatura global como
  default em vez de hardcoded 100.
- Botões de salvar unificados: removido o "Salvar mudanças" interno da seção
  Espessura e o "Salvar" do footer. Único botão "Salvar tudo" fica no header
  sticky da config, persiste todos os campos (markup, desconto, curvatura,
  faixas, regras de friso, risco, gravação, espessura mínima, nomes dos
  modelos). "Salvar promoção" segue separado por usar outra tabela.
- Após sucesso: mensagem "Salvo!" no topo + `router.refresh()` para recarregar
  o RSC e exibir o estado real do banco.

## feat: Sistema de Promoções de Produtos (em revisão)

Campanhas com janela `[data_inicio, data_fim]` e preço promocional por item.
Reversão automática via VIEW (sem cron) — quando `CURRENT_DATE` sai da janela
a view volta a retornar `preco_tiny`.

- Migration `248_promocoes_produtos.sql`: tabelas `promocoes_produtos`,
  `promocao_itens` + view `vw_produto_preco_vigente` + seed de role_permissoes.
- API: `POST/GET /api/promocoes`, `GET/PATCH /api/promocoes/[id]`,
  `PATCH /api/promocoes/[id]/{encerrar,cancelar}`. Conflito (1 produto = 1 promo
  ativa/agendada) retorna 409 com lista de conflitos.
- Helper `src/lib/promocoes-helpers.ts`: expansão de produto pai (mesmo % nas
  variações) + check de conflito.
- Tela `/comercial/promocoes` (lista + detalhe) com tabs Ativas/Agendadas/
  Encerradas/Canceladas. Botões: Encerrar, Cancelar, Ver itens.
- Refator `PromotionModal` (gestão-estoque): agora cria campanha via API ao
  invés de sobrescrever `preco_tiny`. Tratamento de 409 com remoção rápida de
  conflitantes.
- JOIN com `vw_produto_preco_vigente` em `/api/gestao-estoque/produtos`,
  `/api/produtos`, `/api/vendas/produtos/busca` (campos novos: `preco_vigente`,
  `em_promocao`, `nome_campanha`, `promo_data_fim`, `preco_promo`,
  `promocao_nome`).
- UI POS (`NovaVendaClientV2`): `calcItem` aplica `preco_promo` como piso e
  recalcula `pct_desconto` (comissão cai na faixa correspondente
  automaticamente). Badge "PROMO" no dropdown de busca e linha do item. Bloqueio
  de `preco_unitario` abaixo de `preco_promo`.
- `/produtos` e `gestao-estoque/Dashboard`: lista riscada + promo + badge.
- Menu lateral: novo item "Promocoes" no grupo "Comercial" para admin e
  desenvolvedor.

## docs (29/04/2026) — Mapeamento Completo do Banco

Entregue em `docs/db-mapping/` (47 arquivos `.md` + 16 JSONs crus, ~5.2 MB):

- **7 schemas** mapeados: `alissonerp`, `public`, `directus`, `crm`, `auth`, `storage`, `extensions`
- **377 tabelas** com colunas, PK/FK/UNIQUE/CHECK, índices, triggers, RLS
- **321 funções/procedures** com argumentos, retorno e **CORPO-FONTE COMPLETO**
- **148 triggers** com função alvo, evento, timing, definição completa
- **122 views** com SQL completo
- **234 RLS policies** com `qual` e `with_check`
- **819 indexes**, 228 sequences, 28 enums, 13 extensions
- **Cross-reference banco↔código**: 1013 arquivos varridos (8.1 MB), top 30, lista de objetos sem uso

Achados:

- **CLAUDE.md desatualizado:** dizia "~60 tabelas alissonerp" — são **139**. Dizia "~35 views, ~30 triggers" — são **71 views, 55 triggers**.
- Função no-touch `fn_processar_transferencia_saida` (CLAUDE.md) na verdade se chama `fn_processar_transferencia` (sem `_saida`). O typo veio do nome da migration `019_trigger_transferencia_saida.sql`.
- **Schema `crm` (31 tabelas, 41 RLS policies) descoberto** — não documentado no CLAUDE.md e sem nenhuma referência no código atual. Conteúdo: agentes IA, conversas WhatsApp/Meta/Kommo, funis, automações. Provavelmente projeto paralelo no mesmo banco.
- **474 objetos sem uso identificado no código** — distribuídos em `public` (169), `directus` (114), `alissonerp` (94), `crm` (67). Lista completa em `docs/db-mapping/99-code-mapping.md`.

Scripts geradores (idempotentes, ~10s cada):

```bash
node scripts/_db_mapping_extract.mjs     # extrai catálogo do banco para _raw/
node scripts/_db_mapping_code_xref.mjs   # cross-reference banco↔código
node scripts/_db_mapping_build_docs.mjs  # gera os .md finais
```

Atualizados em sincronia: `CLAUDE.md`, `MEMORY.md`, `ESTRUTURA_ATUAL.md`, `docs/arquitetura.md`, `docs/schema/README.md`.

## EPIC-001 — Fundação Técnica (29/04/2026) — resumo executivo

### Stories implementadas

| Story | Título | Arquivos-chave |
|-------|--------|----------------|
| 1.1 | parametros_sistema — eliminar IDs hardcoded | `src/lib/parametros.ts`, migration 192, 29 rotas refatoradas |
| 1.2 | Ordens reposição + fila_sync_externo | migration 193, rota `contatos` usa fila |
| 1.3 | TTL 5min + invalidarCacheAuth() | `src/hooks/useAuth.ts` |
| 1.4 | auth-server + api-handler (defineRoute) | `src/lib/auth-server.ts`, `src/lib/api-handler.ts` |
| 3.1 | Catches silenciosos → useErrorStore | 19 catches corrigidos em múltiplos componentes |
| 3.2 | Guard updated_at em PATCH /api/vendas/[id] | `VendaDetalheClient.tsx`, rota vendas PATCH |
| 3.3 | Audit log em 5 rotas críticas | `src/lib/audit.ts`, tabela `alissonerp.audit_log` |
| 3.4 | Worker retry exponencial fila_sync | `src/lib/fila-sync-worker.ts`, migration 200, tela `/admin/fila-sync` |
| 3.5 | UNIQUE INDEX fechamentos_distribuicao | migration 197 |
| 3.6 | fn_criar_par_movimentacao retorna TABLE | migration 198, ADR 0002 |
| bug | Reposição usa SUM(disponivel) pré-reserva | rotas de reposição |

### Impacto estrutural
- Novo padrão de API route: `defineRoute` em `src/lib/api-handler.ts`
- IDs de domínio nunca mais hardcoded: sempre `PARAM.X` via `src/lib/parametros.ts`
- Erros de integração externa não bloqueiam operações: fila `fila_sync_externo`
- Rastreabilidade completa em mutações críticas: `logAudit(tx, ...)`
- Auth server-side centralizada: `requireAuth()` / `requirePermissao()` em `src/lib/auth-server.ts`

## v2.38.0 (29/04/2026)
### Feature — Story 3.4 — Worker retry exponencial para fila_sync_externo
- **Migration 200** (`200_fila_sync_proxima_execucao.sql`): adiciona coluna `proxima_execucao TIMESTAMPTZ NULL` em `alissonerp.fila_sync_externo` + índice parcial `idx_fila_sync_pendente` (status='pendente'). Executada em produção via Node pg Client.
- **`src/lib/fila-sync-worker.ts`**: worker com retry exponencial (1m→5m→15m→1h→6h, MAX_TENTATIVAS=5). Usa `FOR UPDATE SKIP LOCKED` para segurança em múltiplas instâncias. Após MAX_TENTATIVAS, status→`falha_definitiva` + notificação admin. Processador extensível por sistema (`tiny` implementado: `sync_contato`).
- **`POST /api/admin/fila-sync`**: dispara o worker manualmente (usado por cron externo ou admin). Auth: admin/desenvolvedor. Retorna `{ processados, falhas, falhas_definitivas }`.
- **`GET /api/admin/fila-sync`**: expandido com campos `proxima_execucao` e `ultimo_erro` na listagem.
- **`POST /api/admin/fila-sync/[id]/reprocessar`**: move `falha_definitiva` → `pendente`, zera tentativas e `proxima_execucao`.
- **`POST /api/admin/fila-sync/limpar`**: deleta registros `processado` com mais de 30 dias.
- **`src/app/(dashboard)/admin/fila-sync/`**: tela admin com tabela paginada, contadores por status, botões "Processar agora", "Reprocessar" (por item) e "Limpar antigos". Auto-refresh 30s. Roles: admin/desenvolvedor.
- **`docs/adr/0005-sync-externo-fila.md`**: ADR documenta decisão de fila assíncrona vs sync inline.
- `npx tsc --noEmit`: zero erros.

## v2.37.0 (29/04/2026)
### Feature — EPIC-001 Story 1.1 — alissonerp.parametros_sistema
- **Migration 192** (`192_parametros_sistema.sql`): cria tabela `alissonerp.parametros_sistema` (chave PK, valor, tipo, descricao, atualizado_em, atualizado_por). Seed inicial com 6 parâmetros: `ALMOXARIFADO_DEPOSITO_ID=1`, `OURO_18K_INSUMO_ID=1`, `METAL_CATEGORIA_ID=1`, `PEDRA_CATEGORIA_ID=2`, `LOCAL_ESTOQUE_DEFAULT_ID=1`, `OURO_24K_LIGA_INSUMO_ID=275`.
- **`src/lib/parametros.ts`**: helper com cache TTL 5min, `getParametro()`, `getParametroNumber()`, `invalidarCacheParametros()`, constante tipada `PARAM`.
- **29 rotas API refatoradas**: substituídos todos os IDs de domínio hardcoded (`deposito_id=1`, `insumo_id=1`, `insumo_id=275`, `categoria_id=1/2`, `local_estoque_id=1`) pelo helper. Zero hardcoded remanescentes (grep AC6 = 0).
- Rotas refatoradas: `service/carregar-aditivo`, `service/carregar-solda`, `service/aditivo-saldo`, `service/solda-saldo`, `service/[id]/concluir`, `service/[id]/devolver`, `service/pedras-estoque`, `pcp/apontamentos`, `pcp/[id]/pedras-disponiveis`, `pcp/[id]/resumo`, `pcp/saida`, `pcp/transferir`, `distribuicao/apontamentos`, `distribuicao/[id]/pedras-apontadas`, `distribuicao/[id]/concluir`, `dashboard/fabrica`, `dashboard/fabrica/movimentacoes`, `estoque/transferir-local`, `relatorios`, `purificacao`, `purificacao/[id]`, `purificacao/ligacao`, `purificacao/liga-tipos`, `compras`, `compras/[id]/itens`, `lancamentos-avulso`.
- `npx tsc --noEmit`: zero erros. Banco confirmou 6 parâmetros inseridos.

## v2.33.0 (23/04/2026)
### Feature — Dashboard Comercial (replicado do alison-joias-admin)
- **Migration 174** (`174_dashboard_comercial_views.sql`): cria 12 views `alissonerp.vw_dash_*` apontando para `public.*` (vendas, metas_mensais, metas_por_hora, vendedores, itens_venda, comissoes, controle_entregas, forma_envio, forma_frete, leads, parcelas_pedidos, pedidos_parcelas_detalhado). Coluna `aprovada` na view de entregas normaliza bug do `status_aprovacao='APROVADA'` (dado real é `'2'`).
- **Migration 175** (`175_dashboard_comercial_permissoes.sql`): registra módulo `dashboard_comercial` em `alissonerp.role_permissoes` para desenvolvedor/admin/gerente_loja/consultora. Fábrica (gerente_fabrica, ourives, pcp) e motoboy SEM acesso.
- **6 API routes** em `src/app/api/dashboard-comercial/`: `vendas-dashboard`, `ranking`, `analise-performance` (4 cenários: horário acumulado/diário, mensal acumulado/projeção), `analise-frete`, `analise-comissoes`, `leads`, `comparativo-anual` (vs ano anterior).
- **5 páginas** em `src/app/(dashboard)/dashboard-comercial/`: geral (performance + leads + cards Prata/Ouro/Diamante), analise-resultado (4 cenários), analise-frete (receita vs custo), analise-comissoes (resumo + detalhe por item), ranking (podium top 3 animado + tabela completa).
- **Componentes UI base**: `DashboardHeader` (tabs + DateRangePicker), `StatCard`, `ConsultoraAvatar` (fallback iniciais), `Podium` (Framer Motion), `LoadingBlock/ErrorBlock`. Paleta oficial do fabricaAJ (esmeralda/creme/dourado).
- **Menu Comercial**: adicionado item "Dashboard Comercial" no topo do grupo. Removidos 4 itens antigos que foram consolidados (Análise Resultado, Análise Frete, Análise Comissões, Metas) — páginas antigas ficam no filesystem como fallback.
- **Libs adicionadas**: `framer-motion` (animações do podium), `date-fns` + `date-fns-tz` (manipulação de datas).
- Stack: `fetch + useState` (sem React Query no cliente, consistente com o resto do fabricaAJ). SQL direto via `src/lib/db.ts` (sem PostgREST).
- Validação: `npx tsc --noEmit` zero erros. 6 APIs retornam 200 com dados reais (faturamento R$ 394k período abr/2026, 123 vendas, ranking #1 Germana Valentim).

## v2.25.0 (18/04/2026)
### Feature — maquininhas por vendedor (MP Point)
- **Migration 151** (`151_mp_point_devices_vendedor.sql`): adiciona `vendedor_id` (FK `public.vendedores`) e `is_reserva BOOLEAN` em `alissonerp.mp_point_devices`. Cria tabela `alissonerp.uso_maquina_reserva` para log de uso de máquina reserva com justificativa obrigatória.
- **`GET /api/mercado-pago/devices?minha=true`**: retorna `{ minha, reservas }` — máquina do vendedor logado + todas as reservas da loja.
- **`PATCH /api/mercado-pago/devices`**: aceita `vendedor_id` e `is_reserva` (mutuamente exclusivos; 409 se tentar atribuir vendedor que já tem máquina).
- **`POST /api/mercado-pago/uso-reserva`**: salva log de uso com justificativa (mín. 10 chars, validado server-side).
- **`CartaoInline.tsx` + `MercadoPagoCobranca.tsx`**: vendedor vê sua máquina auto-selecionada (sem dropdown); botão "Usar maquininha da loja" abre form inline com justificativa obrigatória; admin/gerente mantém dropdown completo.
- **Configurações → aba "Maquininhas"**: tabela de devices com modal de edição — atribui vendedor, marca como reserva, renomeia, ativa/desativa. Visível apenas para admin/gerente/desenvolvedor.

## v2.24.0 (16/04/2026)
### Feature — merge feat/orcamento-friso-pedras-v2 (recebida do chefe)
- Merge da branch `feat/orcamento-friso-pedras-v2` (commit `9a4c86d`) no `homolog`. Traz: desacoplar friso do corpo da aliança, precificador de pedras v2, opções de gravação e risco. Arquivos: `AliancaViewport.tsx`, `OrcamentoClient.tsx`, `constants.ts`, `page.tsx`, `types.ts`, `validations.ts`, `api/orcamento/[id]`, `api/orcamento/config`, `api/orcamento/route`, `api/vendas/[id]/pdf`, `lib/gerar-pdf-orcamento.ts`.
- **Migration renomeada**: `133_friso_desacoplado.sql` → `140_friso_desacoplado.sql` (colisão com `133_notif_aguardando_resposta.sql` já existente em homolog).
- Auto-merge limpo em `OrcamentoClient.tsx` (sem conflito manual); nenhuma mudança anterior do homolog foi perdida. Backup salvo em branch local `backup/homolog-pre-merge-orcamento`.
- ⚠️ **Ação manual:** executar `supabase/migrations/140_friso_desacoplado.sql` no banco antes de usar a feature.

## v2.19.87 (11/04/2026)
### Chore — limpa do working dir
- Atualizado `.gitignore`: `/.claude/`, `/gerar_relatorio.{js,py}`, `/relatorio_*.xlsx` (arquivos locais que ficavam poluindo `git status`).
- Commit de trabalho em andamento do Jonathan que estava pendente no working dir: `OrcamentoClient.tsx` (+47), `api/ordens/[id]/comentarios/route.ts` (+24), `DashboardShell.tsx`, `GlobalErrorToast.tsx`, `PixQrInline.tsx`.
- Módulo de notificações (novo em progresso): `api/notificacoes/adiar`, `api/notificacoes/pendentes-resposta`, `components/MencaoAlarme.tsx`, migrations `133_notif_aguardando_resposta.sql` + `134_notif_alarme_snooze.sql`.
- 33 scripts operacionais em `scripts/` (apply/check/diagnose/fix/inspect/query/setup/sync/test) acumulados nas sessões recentes.

## v2.19.86 (11/04/2026)
### Feature — /financeiro Contas a Receber mostra valor líquido
- Novo card **"Líquido na Conta"** no grid de stats do Contas a Receber (grid passou de 3 pra 4 colunas): soma `valor_liquido` de todos os pagamentos MP confirmados das CRs pagas. Usa fallback `COALESCE(valor_liquido, valor)` pra CRs não-MP contarem 100% como líquido. Mostra subtexto `-R$ X,XX de taxas` quando `totalTaxas > 0`.
- Cada linha da tabela ganhou subtexto verde embaixo do valor: `líquido R$ 0,97 (−R$ 0,03)` quando há MP vinculado e valor líquido é diferente do bruto. CRs sem MP não mostram o subtexto.
- `page.tsx` SQL: SELECT ganhou duas subqueries agregadas `(SELECT SUM(p.valor_liquido) FROM pagamentos_venda p WHERE p.venda_id = cr.venda_erp_id AND p.status='confirmado')` e análogo pra `taxas_mp`. `ContaReceber` interface + `ContaRow` aceita `valorLiquido?` e `taxasMp?`.

## v2.19.85 (11/04/2026)
### Feature — valor líquido MP (net_received_amount) + fix encoding JSONB
- **Migration 137 (`137_pagamentos_valor_liquido.sql`)**: `ADD COLUMN valor_liquido NUMERIC(12,2)` e `taxas_mp NUMERIC(12,2)` em `alissonerp.pagamentos_venda`. Nova função `fn_resumo_recebido_mp(p_inicio DATE, p_fim DATE)` que retorna `qtd`, `total_bruto`, `total_taxas`, `total_liquido` pra relatórios. Fix retroativo: `UPDATE (gateway_payload #>> '{}')::jsonb WHERE jsonb_typeof='string'` consertou 15 payloads corrompidos por double-encoding.
- **Webhook MP captura líquido**: `POST /api/webhooks/mercado-pago` lê `transaction_details.net_received_amount` do payment retornado pela MP API e grava `pagamentos_venda.valor_liquido` + `taxas_mp` no UPDATE de confirmação. Fórmula: `taxas_mp = transaction_amount - net_received_amount` (mais preciso que somar `fee_details[]` porque o MP deduz outras taxas de adquirência que não aparecem em fee_details).
- **Exemplos reais em produção:** Cartão crédito R$ 1,00 → líquido R$ 0,97 (~3% taxa). Pix R$ 1,00 → líquido R$ 0,99 (~1% taxa).
- **Bug encoding JSONB double-string (corrigido em 5 arquivos MP)**: descoberto investigando o `gateway_payload`: todos os pagamentos MP tinham `jsonb_typeof='string'` em vez de `'object'`. Causa raiz: o driver `postgres` npm com `${JSON.stringify(obj)}::jsonb` encoda a string como literal JSON ao invés de parsear como objeto. Pior: o webhook fazia `{ ...payloadAntigo }` onde `payloadAntigo` era a string — o spread pegava cada caractere como chave, gerando `{"0":"{","1":"\"",...}`. Fix: trocado `::jsonb` por `::text::jsonb` em `src/app/api/webhooks/mercado-pago/route.ts`, `src/lib/vendas-aprovar.ts`, `criar-link/route.ts`, `criar-pix/route.ts`, `criar-intent-point/route.ts`. O `::text` força passagem como text e o `::jsonb` final faz o parse correto.
- **UI do detalhe da venda**: `VendaDetalheClient` mostra subtexto verde na linha do pagamento: `Líquido recebido: R$ X,XX (taxa MP R$ Y,YY)` quando `valor_liquido != null && > 0`. GET `/api/vendas/[id]` retorna `valor_liquido` e `taxas_mp` serializados como `Number | null`.
- **Backfill retroativo**: `scripts/backfill_mp_valor_liquido.mjs` busca cada pagamento MP existente na API e preenche `valor_liquido`/`taxas_mp`. Rodou: 2 de 6 backfilled (os outros 4 deram 404 porque eram da aplicação MP antiga `alissonerphomolog` — QR Code tipo — que a gente abandonou ao criar `Alisson Ranyel` tipo Checkout Transparente).

## v2.19.84 (11/04/2026)
### Fix crítico — Tiny expirando toda hora (offline_access + proxy-aware)
- **Diagnóstico em produção:** `tiny_token_expires_at = "2026-04-10T20:39:57.118Z"` — token expirava horas depois de reconectado, forçando reconexão manual constante. Dois problemas combinados no fluxo OAuth2.
- **Problema 1 — scope `openid` sem `offline_access`:** o Tiny usa Keycloak. Sem `offline_access` no scope, o refresh_token emitido é "session-bound" e expira junto com a sessão SSO (30min a 8h dependendo do realm config). Com `offline_access`, o token vira "offline token" e dura semanas/meses.
- **Fix 1:** `src/app/api/integracoes/tiny/auth/route.ts` agora pede `scope=openid offline_access`. Quando o Jonathan reconectar, o Keycloak vai pedir consentimento explícito pra "acesso offline" — aceitar.
- **Problema 2 — redirect_uri inconsistente atrás de proxy:** o código usava `req.headers.get("origin") ?? req.nextUrl.origin`. `req.headers.get("origin")` só é setado em requests cross-origin (NÃO em navegação direta via click). `req.nextUrl.origin` atrás do Easypanel/Traefik pode retornar o host interno do container (`http://localhost:3000`) em vez do domínio público. Keycloak rejeita a troca `authorization_code → token` se `redirect_uri` não bate EXATAMENTE entre `auth` e `callback`.
- **Fix 2:** novo helper `src/lib/public-origin.ts` com `getPublicOrigin(req)` que monta origin a partir de `X-Forwarded-Proto` + `X-Forwarded-Host` (headers setados pelo reverse proxy). Ordem: 1) `x-forwarded-proto + x-forwarded-host`, 2) `host` header com detecção http/https por nome, 3) `req.nextUrl.origin` fallback. Aplicado nos dois endpoints (`auth` e `callback`) pra garantir redirect_uri idêntico.

## v2.19.83 (11/04/2026)
### Fix — /financeiro crash no Contas a Receber + alinha status 'pago'
- **Bug 1 (crash):** clicar na aba "Contas a Receber" disparava `Uncaught TypeError: d.slice is not a function`. Causa: `page.tsx` (Server Component) passava resultados do postgres direto pro client component. O driver `postgres` npm converte `DATE`/`TIMESTAMPTZ` em objetos `Date`, e o Next serializa Server→Client preservando esse tipo. Funções do client como `isVencido(d)` chamavam `d.slice(0,10)` assumindo string e quebravam. Começou a acontecer agora porque as CRs antigas tinham `data_vencimento = null` (curto-circuitava em `!d`), e as CRs novas do webhook MP têm data preenchida pelo trigger 113. **Fix:** `SELECT data_vencimento::text AS data_vencimento, ...` em todos os 4 SELECTs da `page.tsx`. Datas chegam no client como string ISO.
- **Bug 2 (semântico):** o backend (trigger 113 `fn_venda_gerar_conta_receber` e `fn_cr_marcar_pago_mp`) grava `contas_receber.situacao='pago'`. A UI antiga de `TabReceber` filtrava e marcava como `'recebido'`. Resultado: CRs pagas automaticamente pelo webhook MP ficavam sumidas no filtro "Recebido" (card mostrava R$ 0,00). **Fix:** novo helper `isRecebido(s) = s === 'pago' || s === 'recebido'`. `totalRecebido`, filtro "recebido" e `marcarRecebido()` manual agora usam/gravam `'pago'` (alinha com o backend). `SITUACAO` map já tinha `'pago'` registrado com badge verde "Pago".

## v2.19.82 (11/04/2026)
### Feature — cobrança por cartão de crédito inline (link + maquininha)
- Novo componente `src/components/vendas/CartaoInline.tsx` (~450 linhas) — espelho do `PixQrInline` dedicado ao Cartão de Crédito. Quando a vendedora seleciona "Cartão de Crédito" no form de pagamento (NovaVendaClient OU VendaDetalheClient), aparece um card inline com dois botões:
  - **"Link de Pagamento"** → Preference API (`/criar-link`): gera QR local (lib qrcode) do `init_point` + link copiável + botão WhatsApp. Aceita crédito, débito e PIX no checkout MP.
  - **"Maquininha Point"** → Point Integration API (`/criar-intent-point`): selector de device, selector de parcelas (1-12x, pré-preenchido pela condição escolhida no form), countdown de 3 min + botão "Cancelar envio".
- Polling a cada 4s detecta pagamento confirmado via webhook. Suporta `vendaId=null` com callback `obterVendaId` igual ao `PixQrInline` — na Nova Venda a venda é salva como rascunho silenciosamente antes do endpoint MP ser chamado.
- Backend não precisou mudar — endpoints `/criar-link` e `/criar-intent-point` já existem e já suportam `installments`. Webhook processa ambos os canais via `external_reference`.

## v2.19.81 (11/04/2026)
### Feature — webhook MP processa estorno/chargeback automaticamente
- Antes: webhook recebia notificações de `refunded`/`cancelled`/`charged_back` mas só atualizava `gateway_payload`. Estornos precisavam ser tratados manualmente.
- **Novo helper `estornarVenda(vendaId, pagamentoId, motivoPayload)` em `src/lib/vendas-aprovar.ts`**. Transação atômica que:
  - `SELECT ... FOR UPDATE` no pagamento (anti-race).
  - Idempotência: se `status='estornado'`, retorna `{acao: 'ja_estornado'}`.
  - Conta outros pagamentos confirmados da venda (exclui o estornado).
  - `UPDATE pagamentos_venda SET status='estornado'`.
  - Decide ação: se `outros_confirmados > 0` → `vendas_erp.situacao='rascunho'` (vendedora recobra o valor); se `= 0` → `vendas_erp.situacao='cancelado'` (trigger 111 reverte estoque comercial automático).
  - `UPDATE contas_receber SET situacao='cancelado' WHERE venda_erp_id=X AND situacao IN ('pago','pendente')` (manual porque trigger 113 só cancela CR pendente).
- **Webhook receiver** agora separa `rejected` (tentativa negada, nunca foi confirmada) de `refunded`/`cancelled`/`charged_back` (que podem ser estornos reais após confirmação). Só chama `estornarVenda` se `pag.status === 'confirmado'` — senão só marca o pagamento como cancelado e retorna.
- **Chargeback** é tratado igual a refund (decisão Jonathan). `webhook_log` registra `acao`, `outros_confirmados` e `cr_canceladas` pra auditoria.
- **Não suporta estorno parcial** ainda (MP permite refund de parte do valor) — adicionar depois checando `transaction_amount_refunded` vs `transaction_amount`.

## v2.19.80 (11/04/2026)
### Feature — exibir data + hora na confirmação do pagamento
- Linha "Confirmado em DD/MM/AAAA" na seção Pagamento do `VendaDetalheClient` agora mostra também a hora: `Confirmado em 11/04/2026 às 15:14`.
- Nova função `fmtDateTime(d)` usa o timezone **local** do navegador (diferente do `fmtDate` existente que força UTC). Isso é correto porque `pagamentos_venda.data_confirmacao` é `TIMESTAMPTZ` e queremos mostrar no horário de Brasília, não em UTC.
- `fmtDate` (só data, UTC) continua sendo usado pras outras datas da tela (`data_venda`, `data_entrega`) que são `DATE` puro.

## v2.19.79 (11/04/2026)
### Refactor — concluirVenda usa ordem commit-then-sync
- **Diagnóstico:** o fluxo da v2.19.78 ainda estava errado semanticamente. `concluirVenda` chamava `approveVenda` primeiro, que tentava Tiny antes de fechar a venda. Mesmo com `tinyBestEffort=true` evitando throw, a ORDEM de operações ainda era "Tiny-first". Se o webhook MP crashava entre o Tiny OK e o UPDATE de situação, a venda ficava em limbo.
- **Nova ordem (local-first, commit-then-sync)** em `concluirVenda`:
  1. `UPDATE vendas_erp.situacao = 'concluido'` → trigger 113 cria `contas_receber` automaticamente
  2. `fn_cr_marcar_pago_mp(vendaId)` → marca CR como recebida
  3. `criarOrdemDoOrcamento()` → cria ordem de fabricação se veio de orçamento (best-effort)
  4. `sendToTiny()` → sincroniza com Tiny (best-effort, erro salvo em `tiny_sync_erro`)
- **`concluirVenda` NÃO chama mais `approveVenda`**. Mesmo com venda em rascunho, pula direto pra `concluido` (trigger 114 só dispara blindagem quando `OLD.situacao IN ('confirmado','concluido')`, então rascunho→concluido passa limpo).
- **Filosofia:** pagamento confirmado pelo banco é inegociável. O "fechamento" da venda no ERP não pode ser bloqueado por uma integração downstream.

## v2.19.78 (11/04/2026)
### Fix — webhook MP conclui venda mesmo com Tiny fora do ar (tinyBestEffort)
- **Bug descoberto em produção:** venda com Pix pago pelo cliente ficou em rascunho porque o token Tiny expirou no momento do webhook. Cadeia `concluirVenda → approveVenda → sendToTiny` lançou exception no Tiny, webhook abortou antes de transicionar a venda, cliente pagou mas a venda nunca virou `concluido`.
- **Fix parcial (depois revisto na v2.19.79):** `ApproveVendaOpts.tinyBestEffort: boolean`. Quando `true`, erro do Tiny é capturado, logado em `tiny_sync_erro`, e o fluxo continua. Webhook MP passa `tinyBestEffort: true`; PATCH manual `/api/vendas/[id]` mantém comportamento all-or-nothing legacy.
- **Fix manual da venda #28724**: via `scripts/fix_venda_28724.mjs` — `situacao=concluido`, CR#74=pago, `tiny_sync_erro` marcado pra reenvio manual depois.

## v2.19.77 (11/04/2026)
### Fix crítico — PIX agora usa Payment API e gera QR EMV escaneável
- **Bug descoberto em teste real:** vendedora gerava QR pelo botão "PIX", cliente tentava escanear no app do banco e recebia **"esse QR não é Pix"**. Causa: o endpoint `/criar-link` usa a Preference API do MP que retorna um `init_point` (URL tipo `mpago.la/xxxx`). O QR gerado a partir dessa URL não é um QR Pix do Banco Central — é só um link pro checkout MP. App bancário não reconhece.
- **Novo endpoint `POST /api/vendas/[id]/mercado-pago/criar-pix`** usa a **Payment API** diretamente (`POST /v1/payments` com `payment_method_id='pix'`). MP retorna:
  - `qr_code`: string EMV/BR Code (`00020101021...`) no padrão Banco Central — copia-e-cola
  - `qr_code_base64`: imagem PNG do QR pronta — escaneável em qualquer app bancário
  - `ticket_url`, `expiration_date`, `payment_id`
- **Novo helper `createPixPayment()` em `src/lib/mercado-pago.ts`**: POST `/v1/payments` com Idempotency-Key (evita duplicação em retry), expiração configurável (default 30min), tratamento CPF vs CNPJ (Payment API PIX só aceita CPF em `identification.number` — se for CNPJ, omite).
- **Email obrigatório**: Payment API exige `payer.email`. Fallback pra `venda-${vendaId}@alissonjoias.com.br` quando cliente não tem email cadastrado.
- **`PixQrInline.tsx` atualizado**: removeu dependência de `qrcode` (lib local) — agora exibe `data:image/png;base64,${pixQrBase64}` direto do MP. Botão "Copiar" agora copia o código Pix EMV (não link MP). Mensagem do WhatsApp manda o código Pix, não link.
- **Endpoint `/criar-link` continua existindo** pro botão "Gerar Link Online" do `MercadoPagoCobranca` que oferece PIX + cartão no mesmo link (checkout MP). `PixQrInline` é especializado em PIX nativo escaneável.
- **Webhook sem mudanças**: o fluxo atual via `external_reference` já funciona pra pagamentos criados pela Payment API (mesmo topic `payment`).

## v2.19.76 (11/04/2026)
### Feature — QR Code Pix inline também na Nova Venda
- Antes, `PixQrInline` só funcionava em `VendaDetalheClient` porque dependia de um `vendaId` já existente. Na Nova Venda, quando a vendedora escolhia Pix, nada acontecia.
- Agora `PixQrInline` aceita `vendaId: number | null` + callback opcional `obterVendaId?: () => Promise<{id, numero_venda}>`. Quando `vendaId=null`, clica em "Gerar QR" → chama `obterVendaId()` pra salvar venda como rascunho silenciosamente → usa o id retornado pra criar o link MP.
- `NovaVendaClient`: novo helper `montarBodyVenda()` + `salvarRascunhoParaPix()` que valida `itens.length > 0` e `totalVenda > 0` antes de criar rascunho via `POST /api/vendas`. Renderiza `<PixQrInline>` quando `pagForma === "Pix" && totalVenda > 0` e redireciona pra `/vendas/[id]` quando o polling detecta pagamento.

## v2.19.75 (11/04/2026)
### Feature — busca de produtos ordena por relevância
- `GET /api/vendas/produtos/busca` ordenava só por `nome` alfabético, o que com `LIMIT 20` empurrava produtos completos (com preço) pra fora quando havia muitos produtos incompletos com o mesmo termo no nome. Produto de teste `TESTE-2026-A` não aparecia no top 20 ao buscar "teste".
- Nova ordenação por relevância:
  1. Produtos ATIVOS (`situacao='A'`) antes de inativos
  2. Produtos **COM preço preenchido** (`preco_sync > 0`) antes de sem preço
  3. Produtos SIMPLES (`tipo='S'`) antes de pais com variação (`tipo='V'`)
  4. Match EXATO no SKU vem primeiro
  5. Match no COMEÇO do nome antes de match no meio
  6. Desempate: nome alfabético
- Efeito colateral positivo: vendedoras sempre veem produtos vendáveis no topo da busca, não só os de teste.

## v2.19.74 (11/04/2026)
### Feature — QR Code Pix inline no form de pagamento da venda (primeira versão)
- Novo componente `src/components/vendas/PixQrInline.tsx` (260 linhas) — card inline no form de pagamento do `VendaDetalheClient` quando a vendedora seleciona "Pix". Botão "Gerar QR Code Pix" → chama `/criar-link` → exibe QR (240px cor esmeralda, gerado via lib `qrcode`) + link copiável + botão WhatsApp + botão "Regenerar".
- Polling a cada 4s checando `/api/vendas/[id]` pra detectar `pagamentos_venda.status='confirmado'` OU `vendas_erp.situacao='concluido'`. Quando confirma, mostra "✓ Pagamento confirmado! Atualizando venda..." por 2.5s e chama `onPagamentoConfirmado(vendaId)` → `load()` recarrega a venda.
- **Obs:** substituído na v2.19.77 pelo endpoint `/criar-pix` (Payment API) porque o QR gerado localmente a partir do init_point **não é** PIX nativo escaneável.

## v2.19.73 (11/04/2026)
### Feature — webhook MP detecta simulação do painel e retorna OK limpo
- O botão "Simular notificação" do painel de Webhooks MP envia payload com `live_mode: false` e `data.id: "123456"` (fake). Antes, o webhook tentava buscar esse payment na MP API e recebia erro, logando 502 em `webhook_log` e retornando `{ok: false}`. No painel MP aparecia erro.
- Agora, quando `body.live_mode === false`:
  - Log 200 em `webhook_log` marcado como `"simulacao_validada"`
  - Retorna 200 `{ok: true, simulation: true, message: "Webhook MP recebido e HMAC validado. Simulação OK."}` limpo
  - Painel MP mostra "Resposta: 200 - OK" sem ruído
- Permite ao Jonathan validar visualmente no painel MP que o endpoint está recebendo, HMAC validou e payload parseou, sem depender de payment real.
- Comportamento em produção (`live_mode: true`) permanece idêntico: busca o payment real via `fetchPayment()`, processa `external_reference`, aprova/conclui venda, marca `contas_receber` como pago.

## v2.19.72 (11/04/2026)
### Feature — Integração Mercado Pago: Payment Link + Point Smart com auto-conclusão
- **Migration 135 (`135_mercado_pago_integracao.sql`)**:
  - Nova tabela `alissonerp.mp_point_devices` (cadastro de maquininhas Point Smart com `device_id`, `nome_legivel`, `store_id`, `pos_id`, `operating_mode`, `ativo`, `loja`, `last_sync_at`) com trigger `updated_at` e índice parcial `ativo=true`.
  - Nova função `fn_cr_marcar_pago_mp(p_venda_id INTEGER)` que marca `contas_receber.situacao='pago'` + `data_recebimento=CURRENT_DATE` das CRs pendentes da venda e retorna contagem.
  - Índice `idx_pagamentos_venda_gateway_id` em `pagamentos_venda(gateway_id) WHERE gateway_id IS NOT NULL` pra lookup rápido no webhook.
  - Entry `mercado-pago-payment` em `webhook_config` pra rastreio.
- **Dependências novas:** `mercadopago@^2.9.0` (SDK oficial Node v2) + `qrcode@^1.5.4` (gerar QR local pro link).
- **Helper compartilhado `src/lib/mercado-pago.ts`**: `getAccessToken()`, `getWebhookSecret()`, `getWebhookBaseUrl()`, `createPreference()`, `fetchPayment()`, `listPointDevices()`, `createPointIntent()`, `cancelPointIntent()`. Secrets lidos de `alissonerp.configuracoes_secrets` (padrão Tiny, zero env vars).
- **Helper `src/lib/vendas-aprovar.ts`**: extraído do PATCH `/api/vendas/[id]` pra poder ser chamado do webhook MP sem passar por HTTP interno. `sendToTiny()`, `approveVenda()`, `concluirVenda()`, `criarOrdemDoOrcamento()` com idempotência em 4 camadas (`tiny_pedido_id`, `vendas_erp.situacao`, `orcamentos.ordem_gerada_id`, `payment_ids_processados` no gateway_payload).
- **POST `/api/vendas/[id]/mercado-pago/criar-link`**: cria Preference MP com PIX + cartão crédito excluídos `[debit_card, atm, ticket, prepaid_card]`, `external_reference = venda:X:pag:Y`, `notification_url`, `back_urls`, `expires_in=24h`. Salva `preference_id` em `pagamentos_venda.gateway_id`. Retorna `{init_point, preference_id, pagamento_id}`.
- **POST/DELETE `/api/vendas/[id]/mercado-pago/criar-intent-point`**: dispara Payment Intent na maquininha escolhida via `POST /point/integration-api/devices/{device_id}/payment-intents` (amount em centavos, installments, payment.type='credit_card', additional_info com external_reference). DELETE cancela intent ativa antes do cliente passar o cartão.
- **GET/POST/PATCH `/api/mercado-pago/devices`**: lista devices cadastrados (com guard `try/catch` pra retornar `[]` quando tabela ainda não existe), sincroniza via `listPointDevices()` da MP API (upsert em `mp_point_devices`), permite renomear/ativar/desativar manualmente.
- **POST `/api/webhooks/mercado-pago`**: receiver com validação HMAC (formato header `x-signature: ts=...,v1=hash` + manifesto `id:${dataId};request-id:${x-request-id};ts:${ts};`), log bruto imediato em `webhook_log`, busca detalhes via `GET /v1/payments/{id}`, parse `external_reference`, idempotência (via `payment_ids_processados[]` no gateway_payload), transição automática aprovado→concluido via `concluirVenda()`. Retorna sempre 2xx em cenários tratados pra evitar reentrega MP.
- **Componentes UI:**
  - `src/components/vendas/MercadoPagoCobranca.tsx` (520 linhas): seção separada no `VendaDetalheClient` com dois botões ("Gerar Link Online", "Enviar pra Maquininha") que abrem modais overlay com QR code, link, WhatsApp, select de device, countdown, cancelar intent.
  - `src/components/vendas/MercadoPagoCobranca.tsx` integrado após a lista de pagamentos do detalhe da venda.
- **Configurações > Integrações > Mercado Pago**: nova seção com campos `Access Token`, `Webhook Secret`, `User ID`, `URL base p/ webhook`. Sub-seção "Maquininhas Point" com botão "Sincronizar com MP" e tabela editável (nome legível, loja, ativo, toggle). `/api/configuracoes/integracoes/route.ts` aceita `KEYS_MP = [mp_access_token, mp_webhook_secret, mp_user_id, mp_webhook_base_url]`.
- **Páginas públicas de retorno (`back_urls`)**: `/pagamento/[token]/[status]/page.tsx` — 3 estados (`sucesso`, `pendente`, `erro`) lookup por `vendas_erp.token_compartilhamento` UUID, sem expor ID interno.
- **Princípio-chave 1:** lógica de transição de estado de venda extraída pra `src/lib/vendas-aprovar.ts`. PATCH manual e webhook MP **ambos** chamam esses helpers — webhook não faz HTTP interno, chama TypeScript direto.
- **Princípio-chave 2:** webhook é **agnóstico ao canal**. MP envia `topic=payment` com o mesmo formato pra Preference (online) e Point (maquininha). `external_reference` carrega `venda_id:pagamento_id` em ambos os casos. A diferença entre os canais mora apenas na criação do pagamento (endpoints separados), não no fechamento.

## v2.19.71 (11/04/2026)
### Fix — Busca insensível a acentos em /ordens e /pcp
- **Bug raiz:** `ILIKE` do PostgreSQL não ignora acentos — buscar "Joao" retornava `0 resultados` mesmo o banco tendo "João Diogo", "João Gabriel", "João Vitor", etc. Qualquer usuário que digitasse um nome sem acentuar (comportamento natural) não conseguia encontrar a ordem.
- **Fix 1 — Migration 136:** `CREATE EXTENSION IF NOT EXISTS unaccent` (extensão oficial PostgreSQL contrib, sem efeito colateral). Instalada via `scripts/apply_136.mjs`.
- **Fix 2 — `/ordens/page.tsx`:** query `whereBusca` agora usa `unaccent(numero_ordem) ILIKE unaccent(...)` em `numero_ordem`, `cliente_nome` e `vendedor_nome`. `numero_pedido` não precisa (só dígitos).
- **Fix 3 — `/api/pcp/buscar/route.ts`:** todas as comparações do endpoint server-side (incluindo `ORDER BY` de relevância por prefixo) usam `unaccent()` em ambos os lados.
- **Bônus:** o fix também normaliza `ç → c`, `ñ → n`, `ü → u`, etc. "Goncalves" acha "Gonçalves", "Acai" acha "Açaí".
- **Validação:** preview end-to-end em `/ordens?busca=Joao` retornou 4 clientes "João"; `/pcp` com busca "Joao" retornou 1 match.

## v2.19.70 (11/04/2026)
### Feature — PCP: busca server-side no histórico completo + janela de 30 dias
- **Bug raiz:** a busca do kanban era 100% client-side, filtrando só nos ~105 PCPs carregados pelo SSR. Ordens concluídas fora desse top ou "no limbo" dos filtros de service/transferência simplesmente sumiam ao pesquisar — mesmo existindo no banco.
- **Fix 1 — janela temporal em `pcp/page.tsx`:** SSR passa a carregar só etapas ativas (`novas_ordens`, `em_andamento`, `pendencia`, `aguardando`, `cancelado`) + concluídas dos últimos **30 dias**. Reduz a carga inicial e deixa o kanban focado no que precisa de ação.
- **Fix 2 — novo endpoint `GET /api/pcp/buscar?q=termo`:** busca server-side em **todo o histórico** (sem filtro de etapa, sem filtro de service/transferência), em `numero_ordem`, `cliente_nome`, `vendedor_nome`, `setor_nome`, `deposito_nome` e `ordens.numero_pedido`. Respeita filtro de depósito pra ourives. Retorna top 100, ordenado por match por prefixo + `id DESC`.
- **Fix 3 — `KanbanClient.tsx` com debounce 300ms:** busca agora dispara o endpoint após 300ms parado. Estado visual rico: loader spinner, botão X pra limpar, borda verde esmeralda no modo busca, badge *"🔍 N resultado(s) da busca em todo o histórico"*, texto explicativo *"Buscando em todo o histórico (sem limite de data)"*, mensagem de erro visível se a API falhar.
- **Permissões:** ourives continua só vendo/buscando ordens do seu `deposito_id`.
- **Validação completa:** TypeScript 0 erros, queries testadas direto no banco (C-1707 retornou 2 linhas — antes sumia), fluxo end-to-end testado no preview (modo normal → buscar "C-1707" → buscar "Gigi" → limpar → volta ao modo normal).

## v2.19.69 (10/04/2026)
### Fix — Coluna "PEDIDO PDV" vazia na listagem de ordens
- **Bug raiz:** os INSERTs em `alissonerp.ordens` gravavam `venda_id` (FK) mas **esqueciam** de copiar o `numero_venda` pra coluna `numero_pedido`. Consequência: coluna "PEDIDO PDV" na listagem de ordens aparecia `—` pra todas as ordens criadas, dificultando rastreabilidade.
- **Fix 1 (`api/vendas/[id]/route.ts`):** quando venda aprovada vira ordem, agora busca `v.numero_venda` no SELECT e passa como `numero_pedido` no INSERT.
- **Fix 2 (`api/ordens/route.ts`):** endpoint POST de criação manual de ordens agora busca o `numero_venda` da `vendas_erp` quando `venda_id` é informado e grava em `numero_pedido`.
- **Backfill:** script `scripts/backfill_ordens_numero_pedido.mjs` executado no banco — preencheu **64 ordens** existentes com seus respectivos `numero_venda`. Restante (0) ordens com `venda_id` sem `numero_pedido`.

## v2.19.68 (10/04/2026)
### Fix crítico — Tiny OAuth2: refresh_token nunca era salvo
- **Bug raiz:** `api/integracoes/tiny/callback/route.ts` tentava `INSERT INTO configuracoes_secrets (chave, valor)` mas a coluna chama `valor_encrypted`. Erro capturado silenciosamente no try/catch. Consequência: `tiny_refresh_token` e `tiny_token_expires_at` **nunca ficavam no banco** — só o `tiny_bearer_token` (que usa a coluna correta). Por isso o token expirava em 1h e o sistema caía no fallback `client_credentials`, mostrando "Token do Tiny expirado. Vá em Configurações > Integrações e clique 'Reconectar Tiny'" em loop.
- **Fix 1:** corrigido callback (2 ocorrências) pra usar `valor_encrypted`.
- **Fix 2:** adicionada **validação proativa de expiração** em `api/vendas/[id]/route.ts`: antes de enviar pro Tiny, checa se o token expira em < 2 minutos e renova preventivamente — evita o ciclo reativo de 401.
- **Fix 3:** `refreshTinyToken()` agora também persiste `expires_in` como `tiny_token_expires_at` após renovar, pra alimentar a validação proativa.
- **Fix 4:** logs de erro detalhados em `refreshTinyToken()` pra facilitar debug futuro (antes engolia erros silenciosamente).
- **Ação necessária:** depois do deploy, reconectar o Tiny **1 vez** em Configurações > Integrações > "Conectar ao Tiny". A partir daí o refresh automático funciona sozinho indefinidamente.

## v2.19.67 (10/04/2026)
### Fix crítico — JSONB escalar em config_orcamento
- **Hotfix do v2.19.66:** padrão `${JSON.stringify(obj)}::jsonb` no postgres.js estava salvando arrays como JSONB escalar string (double-encoded) em vez de array nativo, quebrando operações `@>`, `||`, `jsonb_array_length`. Corrigido em `api/orcamento/config/route.ts` (pricing_categories, groove_rules, stone_prices, calibracao) e `api/orcamento/route.ts` (pedras_detalhadas × 2) usando `sql.json()` — serializa JSONB nativo corretamente
- **Blindagem de leitura no frontend:** `OrcamentoClient.tsx` agora aceita `config.calibracao` e `config.stone_prices` como objeto OU string (fallback resiliente para dados legados do bug)
- **Migration 132 executada no banco:** script `scripts/apply_132.mjs` adicionou coluna `calibracao` JSONB + inseriu zircônia em `stone_prices`. Script `scripts/fix_132_stone_prices_v2.mjs` corrigiu `stone_prices` corrompido (elemento `"null"` lixo + double-encoding), reescrevendo com valores de mercado 2025 via `sql.json()`

### Conhecido (bug sistêmico pré-existente)
- Outros endpoints ainda usam o padrão bugado `${JSON.stringify(x)}::jsonb`: `api/vendas/[id]/route.ts` (3 pontos), `api/user/[id]/route.ts` (2), `api/service/[id]/concluir/route.ts`, `api/fichas-tecnicas/route.ts`, `api/purificacao/route.ts`, `api/ordens/route.ts`. Funcionam parcialmente graças ao helper `normalizeRow` que parseia strings na leitura, mas operações JSONB nativas nesses campos vão falhar. **Não corrigido neste hotfix** (fora de escopo — requer revisão de cada feature afetada).

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
