# FASE 7 — Bugs achados depois do merge da PR #97

> Pacote autossuficiente. Quem executa não precisa da conversa anterior.
> Opus arquitetou e conferiu tudo que está aqui direto no código/banco em 16/07.

> **STATUS (16/07): implementado na branch `fix/aprovacoes-bugs`, aguardando o
> Jonathan testar e decidir sobre o merge.** `tsc --noEmit` limpo, os 155 testes
> de `src/lib/aprovacoes` + `desconto-logica.test.ts` continuam verdes, e
> `eventoDaTarefa` ganhou 29 testes novos (1 por linha da tabela do BUG 2 +
> casos de null + precedência devolucao_estoque > devolucao). Nenhum merge,
> push ou escrita em produção foi feito — ver commits da branch para o detalhe.

## Contexto mínimo

A PR #97 (mergeada em 16/07, commit `43c435f7`) centralizou as aprovações numa camada
config-first estrito (`src/lib/aprovacoes/`): **só quem está na configuração decide**,
sem fallback por cargo, sem override de admin (`03b-config-first-estrito.md`).

Testando com o dono, apareceram 2 bugs no `PATCH /api/tarefas/[id]/aprovacao`.
Os dois estão **em produção agora**.

Arquivo alvo: `src/app/api/tarefas/[id]/aprovacao/route.ts` (802 linhas).
Branch de trabalho: `fix/aprovacoes-bugs` (já criada a partir de `origin/main`).

---

## BUG 1 — o 2º aprovador configurado leva 403 (a não ser que seja admin)

### O que é

O portão genérico do PATCH (linha ~372):

```ts
if (String(aprovacao.aprovador_id) !== user.id && !isAdminOuDev) {
  return NextResponse.json({ error: "Somente o aprovador pode responder" }, { status: 403 });
}
```

`alissonerp.aprovacoes_tarefa.aprovador_id` é **um UUID só** (conferido no
information_schema) — gravado na criação da tarefa com o **primeiro** da lista
(`resol.aprovadores[0]`).

A PR #97 entregou "múltiplos aprovadores: todos veem a tarefa, o primeiro que
decidir resolve". A **listagem** (`/api/tarefas`, `multiAprovadorCond`) de fato
mostra a tarefa pra todos os configurados. Mas a **decisão** passa por este
portão, que só conhece o 1º UUID.

Logo: **o 2º aprovador configurado só consegue decidir se for admin/desenvolvedor**
(pelo bypass `isAdminOuDev`). Se for gerente_loja, consultora etc., ele vê a
tarefa na fila e toma 403 ao clicar.

### Prova

Homolog, tarefa 301 (desconto):
- `aprovacoes_tarefa` → só **Alisson Ranyel**
- `aprovador_desconto_padrao` → **Alisson Ranyel, Teste admin**

O Teste admin conseguiu aprovar, mas **só porque tem role=admin** (bypass). Nos
testes do dono os 2 usuários eram admin — por isso o furo não apareceu.

### Por que NÃO basta tirar o bypass

Tirar `isAdminOuDev` do portão faz o 2º aprovador (não-admin) tomar 403 **sempre**.
Quebraria de vez o recurso que a PR #97 entregou.

### Conserto

O portão passa a ser: **é o aprovador gravado OU a config diz que pode**.

Precisa saber o evento do CATALOGO antes de decidir. Ver BUG 2 (o mesmo
`eventoDaTarefa` serve pros dois) — **faça o BUG 2 primeiro**.

```ts
const evento = eventoDaTarefa(tarefaInfo?.tipo ?? null, tags, tarefaInfo);
const ehAprovadorGravado = String(aprovacao.aprovador_id) === user.id;
let autorizado = ehAprovadorGravado;
if (!autorizado && evento) {
  autorizado = (await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, evento)).pode;
}
if (!autorizado) {
  return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
}
```

`isAdminOuDev` **some** (contradiz o config-first). Quando `evento` é `null`
(tarefa `geral`, `sangria` — que não são aprovação de negócio), vale só
`ehAprovadorGravado` — o comportamento de hoje **menos** o bypass.

---

## BUG 2 — o endpoint GRAVA antes de checar a permissão

### O que é

Ordem atual do PATCH:

| Linha | O que faz |
|---|---|
| ~372 | portão genérico (deixa admin/dev passar) |
| ~376 | **UPDATE** `aprovacoes_tarefa` → `aprovado`/`rejeitado` |
| ~383 | **UPDATE** `tarefas` → `aprovada`/`rejeitada` |
| ~389 | `processarDecisao` → grava histórico |
| ~391 | SELECT da tarefa (`tipo`, `tags`, `venda_id`) |
| ~418+ | os handlers por tipo chamam `podeDecidir` → **403 aqui** |

O 403 chega **depois** das escritas, e **não há rollback**.

### Impacto concreto

Admin/dev fora da config decide pela API → recebe 403, mas **a tarefa já está
`aprovada`** e o negócio não rodou (venda não atualizada, lock não limpo).
Tarefa órfã → **venda travada**. É a mesma classe de bug que travou as vendas
15300/15312/15399/15562 em prod.

É **regressão da PR #97**: antes não existia `podeDecidir`, o admin passava pelo
portão e o fluxo rodava até o fim.

### Conserto — 3 partes

**(a) Criar `eventoDaTarefa(tipo, tags, tarefaInfo)`** em
`src/lib/aprovacoes/` (sugestão: `evento-da-tarefa.ts`, exportado no `index.ts`).
Mapeia a tarefa → evento do CATALOGO. **Espelhe EXATAMENTE as condições que já
existem nos ramos do route.ts** — não invente. Mapa conferido linha a linha:

| Condição (igual à do route.ts) | Evento |
|---|---|
| `tipo === ENTREGA_SEM_PAGAMENTO_TIPO \|\| tags.includes("aprov_entrega_sem_pagamento")` | `entrega_sem_pagamento` |
| `tipo === "aprovacao_quebra_metal" \|\| (tipo === "protocolo_metal" && tags tem "limpeza_ouro:*")` | `limpeza_ouro` |
| `tipo === "cartao_desconto" && venda_id` | `cartao_desconto` |
| `tipo === "desconto_acima" && venda_id` | `desconto` |
| crédito real (ver abaixo) e `aprovacao_credito_tipo === "diretor"` | `credito_diretor` |
| crédito real (ver abaixo), senão | `credito_gerente` |
| `tags.includes("devolucao_estoque")` | `devolucao_estoque` |
| `tags.includes("devolucao")` (sem `devolucao_estoque`) | `devolucao` |
| `tipo === "compra_comercial" \|\| tags.includes("aprovacao_compra_comercial")` | `compra_comercial` |
| `tipo === "recebimento_metal" \|\| tags.includes("aprovacao_recebimento_metal")` | `recebimento_metal` |
| `tipo === "compra_metal" \|\| tags.includes("aprovacao_compra_metal")` | `compra_metal` |
| qualquer outro (`geral`, `sangria`, `inventario_solicitacao`, `conversao*`) | `null` |

"Crédito real" (route.ts ~659-666) é:
`venda_id && !["cancelado","entregue","aprovado"].includes(venda_situacao) &&
aprovacao_credito_tipo && tipo !== "desconto_acima" && tipo !== "cartao_desconto"
&& !tags.includes("aprovacao_venda")`.

**A ORDEM IMPORTA**: os ramos do route.ts são testados em sequência e o primeiro
que casar ganha. `eventoDaTarefa` tem que respeitar a MESMA ordem — em especial,
`devolucao_estoque` vem ANTES de `devolucao`, e crédito é excluído quando o tipo
é desconto/cartão.

`inventario_solicitacao` devolve `null` de propósito: **não existe no CATALOGO**
(a chave `aprovador_inventario` existe no banco, mas o evento não foi modelado —
não invente um).

`conversao`/`conversao_sku`/`conversao_reversa` devolvem `null` porque **não
passam por este PATCH** — têm endpoints próprios (`/api/conversao-sku/aprovar`
etc.) e nem criam linha em `aprovacoes_tarefa` (o PATCH dá 404 antes).

**(b) Subir o SELECT da tarefa** (hoje na linha ~391) para **antes** do portão —
`eventoDaTarefa` precisa de `tipo`/`tags`/`venda_id`/`venda_situacao`/
`aprovacao_credito_tipo`. É o mesmo SELECT, só muda de lugar.

**(c) Envolver as escritas + handlers numa transação.** Cinto e suspensório: se
um handler devolver erro/403 por qualquer motivo que o mapa não previu, nada
fica gravado pela metade. Use o padrão que o repo já usa:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await sql.begin(async (tx: any) => { ... });
```

**NÃO remova** os `podeDecidir` que já existem dentro dos handlers. Viram
redundantes, mas são a rede de proteção se o mapa errar um tipo. Custa uma query.

---

## O que NÃO fazer

- **NÃO** dar merge. **NÃO** fazer push pra `main`. **NÃO** escrever no banco de
  produção. O dono valida e sobe.
- **NÃO** mexer em `src/app/api/compras-comercial/[id]/concluir` (o `void user`
  sem gate é decisão explícita do dono — `16-FASE-4`, item 1).
- **NÃO** usar script Python pra editar arquivo: o repo é CRLF e o script destrói
  as quebras de linha (já aconteceu 2x — vira diff de 8000 linhas). Use Edit.
- **NÃO** rodar `git commit --no-verify`. O hook é só `npx tsc --noEmit` e ele
  passa.

## Como validar (obrigatório antes de dizer "pronto")

1. `npx tsc --noEmit` → 0 erros.
2. `npx vitest run src/lib/aprovacoes src/__tests__/desconto-logica.test.ts` →
   os 155 que já passam **continuam passando**.
3. **Teste novo obrigatório** pro `eventoDaTarefa` (`src/lib/aprovacoes/__tests__/`):
   uma asserção por linha da tabela acima, incluindo os que devolvem `null`, e
   um caso que prove a precedência `devolucao_estoque` > `devolucao`.
4. Banco (homolog — a URL está em `DATABASE_URL` do `.env.local` do worktree;
   **nunca** produção): não há tarefa pendente sobrando pra testar ao vivo. Se
   criar alguma pra testar, **não aprove** — o dono quer aprovar ele mesmo.

## Ambiente

- Tudo roda em **WSL Ubuntu**: `wsl.exe -d Ubuntu -- bash -lc '<cmd>'`.
- Worktree: `/home/jonathan_arajo/projetos/alissonerp-wt-centralizar-aprovacoes`
- Commit: mensagem em português, explicando **o porquê** (não o quê), e
  terminando com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
