# Regras de Negócio — Entregas (Módulo de Entrega de Venda + Frete Avulso)

> Documento **mantido à mão** (NÃO é auto-gerado como `docs/schema/`). Toda vez que mexermos no módulo de entregas, atualizar aqui: regra nova → acrescenta; regra mudou → corrige.
> Fonte de schema (colunas/tabelas) = `docs/schema/` (auto-gerado). Aqui é o **porquê** e o **como** do negócio.
> ⚠️ Existe uma nota mais antiga e parcial sobre frete avulso registrado pelo motoboy em `docs/regras-negocio/comercial.md` §8 (PR#75). Este arquivo é o documento completo do módulo — considerar migrar/mesclar aquele trecho para cá numa limpeza futura.

Última atualização: 2026-07-16 (blindagem final V4 — modelo TAREFA/POOL, branch `feat/frete-avulso-solicitacao`).

---

## 1. Estados da entrega (`enum_entrega_situacao`)

Ciclo de vida: **solicitada → pendente → em_rota → confirmada** (+ **cancelada**, que pode acontecer a partir de `solicitada` ou `pendente`).

| Estado | O que significa | Quem transiciona |
|---|---|---|
| `solicitada` | Frete avulso pedido pela consultora **de dentro da venda**, aguardando decisão do pool de aprovadores. Não lançou saldo, não tem dono. **Só existe para avulso** — entrega normal (vinculada a itens de venda) nunca passa por aqui, nasce direto `pendente`. | Consultora cria (`POST /api/entregas-venda/frete-avulso`, `modoSolicitacao=true`). |
| `pendente` | Entrega normal recém-criada (itens prontos para saída) OU avulso já liberado/criado direto, aguardando saída física (aceite de um motoboy do pool, ou já com dono). | Sistema (entrega normal), ou aprovador do pool ao liberar / criação direta (avulso). |
| `em_rota` | Motoboy retirou/aceitou e está a caminho. | Motoboy (retirada normal ou aceite de pool — `aceitarFreteAvulso`). |
| `confirmada` | Entregue/confirmado. Entra no acerto financeiro do motoboy (pagamento em lote). | Motoboy ou admin/gerente (código de verificação para entrega normal; botão simples, sem código, para avulso — `confirmarFreteAvulso`). |
| `cancelada` | Cancelada (entrega normal pendente) ou recusada pelo pool (avulso solicitado). Não é apagada — fica para auditoria. | Quem tem permissão de cancelar, ou o pool ao recusar (`recusarFreteAvulso`). |

Ordem do enum: `solicitada` foi inserida **antes** de `pendente` (migration 353, `ALTER TYPE ... ADD VALUE ... BEFORE 'pendente'`).

---

## 2. Fluxo da consultora: solicitar frete avulso de dentro da venda

Frete avulso = corrida de motoboy **sem itens vinculados** (`entregas_venda.is_avulso=true`), mas que **pode referenciar uma venda** (`venda_id`) só para herdar cliente/endereço quando é uma solicitação.

1. **Botão "Solicitar frete avulso" em `VendaDetalheClient.tsx`** — visível só para a **consultora dona da venda** (`role === "consultora"` + `requireVendaOwnership`), e só quando a venda está na **janela da entrega**: `situacao IN ('aprovado', 'em_rota', 'entregue')`.
   - `'aprovado'`: antes de sair para entrega.
   - `'em_rota'`: entrega já a caminho (corrida complementar).
   - `'entregue'`: corrida **complementar pós-entrega** (caso real: levar a aliança que ficou para ajuste) — cortar em `em_rota` mataria esse cenário.
   - Fora da janela de propósito: `rascunho` (venda ainda não fechada), `cancelado`/`virou_credito` (não há mais entrega a fazer).
   - Decisão do Jonathan (commit `291b029a`). **Blindagem V4:** a janela existia só no client — `criarFreteAvulso` (`src/lib/entrega-venda.ts`) agora **revalida a mesma lista no servidor** quando `modoSolicitacao=true`, fechando o bypass de quem chamasse a API direto fora da janela.
2. **Modal** (`FreteAvulsoModal.tsx`): a consultora escolhe **endereço de entrega** (pré-preenchido a partir do cliente/venda, texto livre editável — grava **na entrega**, não altera o cadastro do cliente), **região**, **valor cobrado do cliente**, **valor do motoboy** e **observação**. **Não escolhe motoboy nem responsável.**
3. **Guard de duplicata**: `criarFreteAvulso` barra uma 2ª solicitação para a mesma venda enquanto a 1ª ainda está `solicitada` (`WHERE is_avulso AND venda_id=X AND situacao='solicitada'`).
4. A entrega nasce **`solicitada`**, **sem lançar saldo**, e na **mesma transação** cria uma **tarefa** de aprovação (ver §3). `entregas_venda.tarefa_aprovacao_id` guarda o vínculo.

---

## 3. Pool de aprovadores — solicitação vira TAREFA

Modelo **TAREFA/POOL** (migration 353, consolidado nas fases V1-V3): não existe mais um "liberador designado" nem tabela própria de liberadores — a solicitação é uma tarefa comum do módulo Tarefas, tipo `frete_avulso`, e **qualquer usuário da lista configurada decide**.

- **Fonte da lista**: chave de configuração **MULTI** `aprovadores_frete_avulso` (`alissonerp.configuracoes_sistema`, vários UUIDs separados por vírgula), editável em **Configurações › Aprovadores** (`TabAprovadores.tsx` + `GET/PATCH /api/configuracoes/aprovadores`). Mesmo padrão de `aprovadores_devolver_peca`.
- **Fonte única de leitura**: `listarAprovadoresFreteAvulso()` (`src/lib/entrega-venda.ts`) — usada por `criarFreteAvulso` (quem é notificado), `GET /api/tarefas`, `GET /api/tarefas/[id]` e `PATCH /api/tarefas/[id]/aprovacao` (quem decide). Antes essa mesma query estava duplicada em 4 lugares; centralizar evita divergência entre "quem vê" e "quem pode decidir".
- **Criação da tarefa** (dentro da mesma transação de `criarFreteAvulso`): `INSERT tarefas` (tipo `frete_avulso`, status `aguardando_aprovacao`, `responsavel_id` = 1º da lista **só para preencher a coluna não-nula** — não é responsável exclusivo) → `INSERT aprovacoes_tarefa` (`aprovador_id` = mesmo 1º) → `UPDATE entregas_venda SET tarefa_aprovacao_id`.
- **Notificação**: TODOS os UUIDs da lista são notificados (não só o `responsavel_id` gravado), fora da transação (best-effort).
- **4 pontos aditivos** (nenhum outro tipo de tarefa muda de comportamento — cada um só ativa quando `tipo === 'frete_avulso'`):
  1. `GET /api/tarefas` — quem está no pool também enxerga as tarefas de frete avulso na visão "minhas"/"aguardando", além de `responsavel_id`/`criado_por` (`src/app/api/tarefas/route.ts:~63-96`).
  2. `GET /api/tarefas/[id]` — membro do pool também pode ABRIR a tarefa (ver comentários), não só dono/criador (`src/app/api/tarefas/[id]/route.ts:~60-70`).
  3. `PATCH /api/tarefas/[id]/aprovacao` — membro do pool também pode DECIDIR a mesma `aprovacao_tarefa` (reatribui `aprovador_id` para quem decidiu), não só o `aprovador_id` fixo gravado na criação (`src/app/api/tarefas/[id]/aprovacao/route.ts:~330-353`).
  4. `TarefaDrawer.tsx` — flag `pode_decidir_pool` (calculado no servidor em `GET /api/tarefas`, nunca no client) libera os botões Aprovar/Rejeitar para quem não é o `responsavel_id`, só quando `tarefa.tipo === 'frete_avulso'`.
- **Decisão** (`PATCH /api/tarefas/[id]/aprovacao`, bloco dedicado `tipo === 'frete_avulso'`): localiza a entrega por `tarefa_aprovacao_id` e delega para as libs abaixo — a lógica de saldo/estado mora só ali, o dispatcher nunca duplica.
  - **Aprovar** → `liberarFreteAvulso`: `solicitada → pendente`, lança o saldo (ver §5). `FOR UPDATE` evita lançamento em dobro em cliques concorrentes.
  - **Rejeitar** → `recusarFreteAvulso`: `solicitada → cancelada`, exige **motivo** (obrigatório), **nunca** lança saldo.
  - A consultora que solicitou é notificada do resultado (liberado ou recusado + motivo).
  - **Atomicidade (jul/2026):** a decisão da tarefa (`aprovacoes_tarefa` + `tarefas`) e a ação de domínio (liberar/recusar) rodam agora dentro da **MESMA transação** no dispatcher — variantes `liberarFreteAvulsoNoTx`/`recusarFreteAvulsoNoTx` (recebem o `tx` de fora) fazem o trabalho de verdade; `liberarFreteAvulso`/`recusarFreteAvulso` viraram cascas finas que abrem a própria transação só para quem chamar fora de uma tx existente. Se a ação de domínio falhar, a transação inteira reverte — a tarefa **continua** `aguardando_aprovacao` (nunca fica "aprovada" com a entrega ainda `solicitada`). Escopo restrito a `frete_avulso`/`frete_avulso_loja`; os demais ~11 tipos de aprovação continuam com a ação de domínio fora da transação, sem mudança.
  - **Guard de idempotência:** o `UPDATE aprovacoes_tarefa` do dispatcher exige `status = 'pendente'`; se 0 linhas forem afetadas (aprovação já decidida por outra requisição/aprovador concorrente), a rota devolve **409** e não reprocessa nada. O front (`TarefaDrawer.tsx`) mostra esse erro (e qualquer outro) via `useErrorStore` — o `catch` deixou de ser silencioso.

---

## 4. Pool de motoboy + claim atômico (inalterado, validado)

Corrida **liberada** (seja por liberação de solicitação, seja por criação direta sem motoboy escolhido) fica **sem dono** (`motoboy_id IS NULL`) e aparece para **todos os entregadores ativos**:

- **Aceite** (`POST /[id]/aceitar-avulso` → `aceitarFreteAvulso`): `pendente → em_rota`. O **claim é atômico** — um único `UPDATE ... WHERE situacao='pendente' AND (motoboy_id IS NULL OR motoboy_id = <ele>)` carimba `motoboy_id`, `data_saida`, `confirmado_por_motoboy_retirada` no mesmo comando. Se `res.count === 0`, outro motoboy já venceu a corrida entre o SELECT de guarda e o UPDATE.
- **Finaliza** (`POST /[id]/confirmar-avulso` → `confirmarFreteAvulso`): `em_rota → confirmada`, sem código de verificação (avulso não usa código A/B).
- Corrida **auto-registrada** pelo próprio entregador (ver §6) já nasce com dono — não passa pelo aceite, vai direto para confirmação pela loja.

---

## 5. Criação direta (estoquista/admin/gerente/dev)

Estes papéis continuam criando o avulso **já liberado** — não passam pela solicitação/tarefa:

- Nasce **`pendente`** direto (não `solicitada`), sem tarefa.
- Lança saldo **na criação** (`lancarSaldoFreteAvulsoNoTx` chamado dentro de `criarFreteAvulso` quando `modoSolicitacao` é falso).
- **Com motoboy escolhido** → a corrida já nasce com dono. **Sem motoboy** → cai no pool sem dono (mesmo mecanismo do §4), qualquer entregador aceita.

## 6. Auto-registro do entregador (PR#75)

O próprio motoboy registra a própria corrida pelo app (`MotoboyAppClient` → "Nova corrida"):

- Só escolhe **descrição + região** (Fortaleza/Fora de Fortaleza); valor é **fixo pela tabela** (`calcularValorMotoboy`), não digitado.
- `motoboy_id` forçado como ele mesmo; `frete_cobrado = frete_motoboy` (não cobra do cliente → **não mexe** no saldo da gerente).
- Nasce **`pendente`** com dono (ele mesmo) — não é pool.
- **Anti-fraude:** ele **não confirma o próprio lançamento**. A rota `POST /[id]/confirmar-avulso` barra explicitamente quando `created_by === motoboy_id` E quem chama é o próprio motoboy (`isMotoboy` + `String(entrega.created_by) === user.id` → 403 "aguarda confirmação da loja") — só admin/gerente/dev confirmam essa corrida. Corrida atribuída pela loja a ele (`created_by != motoboy_id`) ele confirma normalmente. A lib `confirmarFreteAvulso` permite a transição a partir de `pendente` apenas quando `autoRegistrada` (senão exige `em_rota`, ou seja, aceite prévio) — é o que possibilita a loja confirmar direto sem a corrida passar por aceite. `GET /motoboy/minhas` expõe a corrida como aguardando confirmação da loja, sem botão de confirmar para o próprio autor.
- Corrida atribuída pela loja (ou liberada de uma solicitação da consultora) exige que o motoboy **aceite primeiro** (`aceitarFreteAvulso`: `pendente → em_rota`) antes de poder ser confirmada — só o caso auto-registrado pula essa etapa.

---

## 7. Constraints

- **`chk_entrega_origem`** (recriada na migration 353): entrega normal (`is_avulso=false`) continua exigindo `venda_id IS NOT NULL`; avulso (`is_avulso=true`) aceita `venda_id` preenchido (solicitação, para herdar cliente/endereço) **ou** nulo (avulso sem venda).
- **`chk_codigos_obrigatorios`** (migration 294, ajustada na 298): avulso dispensa `codigo_cliente`/`codigo_motoboy` (não usa o fluxo de dois códigos da entrega normal).
- **Saldo lançado UMA vez, nunca duas**: `lancarSaldoFreteAvulsoNoTx` é a **única** função que grava em `saldo_frete_gratis` para avulso — chamada em exatamente um dos dois pontos por corrida: criação direta (`criarFreteAvulso` quando `!modoSolicitacao`) **ou** liberação (`liberarFreteAvulso`), nunca os dois para a mesma entrega (mutuamente exclusivos pela própria lógica: solicitação nasce sem lançar, criação direta lança na hora).
- **Listas operacionais nunca mostram `solicitada`/`cancelada` por padrão**: `/entregas-venda` (SSR e `GET /api/entregas-venda`), o app do motoboy (`GET /motoboy/minhas`, 3 queries) e o pagamento em lote (`motoboy/pagar`, exige `situacao='confirmada'`) filtram por padrão `situacao NOT IN ('cancelada','solicitada')` ou `= 'confirmada'`. As views `vw_entregas_pendentes`/`vw_motoboy_entregas` (migration 285) já eram hardcoded para `situacao='confirmada'`, não precisaram mudar.

---

## 8. Débitos técnicos conhecidos (registrados, não bloqueiam)

- **Pool sem gating de região/loja** (decisão explícita do Jonathan, não é bug) — qualquer aprovador da chave `aprovadores_frete_avulso` decide qualquer solicitação, de qualquer região/loja; qualquer entregador ativo aceita qualquer corrida liberada, independente de região.
- **Card "Pendentes" da tela de entregas não conta separadamente o pool** — o subcontador `pendente` conta qualquer `situacao='pendente'`, incluindo avulso em pool sem dono; não há um contador dedicado "aguardando aceite de motoboy".
- **Cancelar um avulso liberado NÃO estorna o saldo lançado** — `cancelarEntrega()` (genérica, usada também para entrega normal) só exige `situacao='pendente'` e atualiza `situacao='cancelada'`; não toca `saldo_frete_gratis`. Se um avulso foi liberado (saldo já lançado) e depois cancelado antes do aceite, o crédito/débito no saldo da gerente **permanece**, mesmo a corrida não tendo acontecido.
- **Entregador aceita/registra corrida sem exigir cadastro prévio em `alissonerp.motoboys`** — `aceitarFreteAvulso`/auto-registro carimbam `motoboy_id` a partir do usuário autenticado (`role in ('entregador','motoboy')`), sem checar se existe linha correspondente em `motoboys`. Isso pode deixar `vw_motoboy_entregas`/pagamento sem o `JOIN` de nome resolvido (nome nulo) se o usuário nunca foi cadastrado como motoboy. Baixo risco — só registrado.
- **Diretor/aprovador fora da lista de config não decide a tarefa** — limitação **pré-existente de todos os tipos** de aprovação no dispatcher (`PATCH /api/tarefas/[id]/aprovacao`), não é específica de frete avulso: só decide quem está gravado como `aprovador_id` da linha, é admin/dev, ou (só para `frete_avulso`) está na chave de config. Um diretor que não esteja em nenhuma das duas listas não decide nenhum tipo de aprovação, não só frete avulso.

---

## 9. Referência

- Migration base do módulo: `285_modulo_entrega.sql` (tabelas `entregas_venda`, `entregas_venda_itens`, `saldo_frete_gratis`, `fechamentos_frete`, `motoboys`; views `vw_entregas_pendentes` e `vw_motoboy_entregas`, ambas hardcoded para `situacao='confirmada'`).
- Migration do frete avulso original: `293_frete_avulso.sql` (+ `294`/`295`/`298` para nullable de códigos e blindagem).
- Migration da solicitação/pool: **`353_frete_avulso_solicitacao.sql`** — enum `solicitada` (inserido antes de `pendente`), colunas `endereco_entrega`/`liberada_por`/`liberada_em`/`motivo_recusa`/`tarefa_aprovacao_id`, constraint `chk_entrega_origem` recriada. **Já aplicada em homolog; produção pendente.**
- Lib principal: `src/lib/entrega-venda.ts` (`criarFreteAvulso`, `liberarFreteAvulso`/`liberarFreteAvulsoNoTx`, `recusarFreteAvulso`/`recusarFreteAvulsoNoTx`, `aceitarFreteAvulso`, `confirmarFreteAvulso`, `listarAprovadoresFreteAvulso`, `lancarSaldoFreteAvulsoNoTx`).
- Rotas: `src/app/api/entregas-venda/frete-avulso/route.ts` (criação/solicitação), `[id]/aceitar-avulso`, `[id]/confirmar-avulso`, `src/app/api/configuracoes/aprovadores/route.ts` (chave `aprovadores_frete_avulso`), `src/app/api/tarefas/route.ts` + `[id]/route.ts` + `[id]/aprovacao/route.ts` (pool aditivo, ver §3).
- Tela: `src/app/(dashboard)/entregas-venda/page.tsx` (SSR, sem aba própria de solicitações — decisão acontece em `/tarefas`), `EntregasVendaClient.tsx`, `src/app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx` (botão "Solicitar frete avulso"), `src/components/entregas/FreteAvulsoModal.tsx` (criação/solicitação), `MotoboyAppClient.tsx` (app do entregador), `src/app/(dashboard)/tarefas/TarefaDrawer.tsx` (decisão da tarefa pelo pool).
