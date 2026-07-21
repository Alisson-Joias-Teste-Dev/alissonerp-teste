# FASE 3g.2 — Migrar o CRÉDITO / A RECEBER (gerente + diretor) para config-first

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `03b-config-first-estrito.md`, `12-FASE-3g-venda-plano.md`, `06-FASE-3a-metal.md`
> e `10-FASE-3e-devolucao.md` (padrão gate no despachante + `resolverAprovadores` na submissão). Branch: `feat/centralizar-aprovacoes`.

## Objetivo

Migrar a aprovação de crédito (A Receber) pra config-first. **DECISÃO do Jonathan: MANTÉM 2 aprovadores**
(`credito_gerente` + `credito_diretor`). A regra de saldo continua **só roteando** qual tarefa criar; a
autoridade de cada vira 100% config. Chaves `aprovadora_credito_gerente` / `aprovador_credito_diretor`
**já existem**. Migrar **submissão E decisão juntas** (senão a tarefa nasce por cargo mas o gate estrito recusa).

## A) Submissão — `src/lib/vendas-credito-aprovar.ts`, `submeterVendaParaAprovacaoCredito` (~L55)

- **MANTER** a regra de saldo que decide o `tipo`: `getSaldoDisponivel()` (~L101-102):
  `const tipo = valorAReceber <= saldoAtual ? "gerente" : "diretor";` — isso é **roteamento**, não muda.
- **TROCAR** a resolução do aprovador (hoje: config + **fallback por cargo** — gerente L106-124, diretor
  L125-146) por `resolverAprovadores`, conforme o `tipo`:
  ```ts
  const evento = tipo === "diretor" ? "credito_diretor" : "credito_gerente";
  const resol = await resolverAprovadores(evento);
  if (resol.status === "nao_configurado") {
    // preservar o contrato: lançar como os endpoints tratam hoje (veja como submeter... sinaliza erro).
    // Se a função retorna objeto/throw, use uma HttpError(409, "Aprovador de crédito (<tipo>) não configurado. Defina em Configurações › Aprovadores.")
    // (mesmo padrão que a Fase 3e criou em devolucoes.ts).
    throw new HttpError(409, `Aprovador de crédito (${tipo}) não configurado. Defina em Configurações › Aprovadores.`);
  }
  const aprovadorId = resol.aprovadores[0]; // coluna aprovacoes_tarefa.aprovador_id / responsavel_id é UUID único
  ```
  **Remover os dois blocos de fallback por cargo** (o `SELECT ... role IN (...) ORDER BY CASE`). Sem
  `ctx.solicitanteId`.
- **MANTER** intocado: gravação de `aprovacao_credito_tipo = tipo` e `aprovacao_credito_tarefa_id` na venda
  (~L203-209); criação de `tarefas` (tags `['credito_loja', tipo]`) e `aprovacoes_tarefa` (~L198-201) — só
  o `aprovador_id`/`responsavel_id` passa a vir de `resolverAprovadores`.
- Verifique como `submeterVendaParaAprovacaoCredito` sinaliza erro hoje e como o endpoint que a chama
  (`vendas/[id]/solicitar-aprovacao`) trata — preserve o contrato (o 409 "não configurado" deve chegar ao
  front). Se precisar, exporte/reuse a classe `HttpError` de `devolucoes.ts` ou crie uma equivalente.

## B) Decisão — despachante `src/app/api/tarefas/[id]/aprovacao/route.ts`, bloco `isCreditoReal` (~L558-575)

Antes de chamar `processarAprovacaoCredito` (~L567), adicionar o gate mapeando o evento pela coluna
`aprovacao_credito_tipo` (já disponível em `tarefaInfo.aprovacao_credito_tipo`, carregada ~L363):
```ts
const eventoCredito = tarefaInfo?.aprovacao_credito_tipo === "diretor" ? "credito_diretor" : "credito_gerente";
const decCredito = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, eventoCredito);
if (!decCredito.pode) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
```
`podeDecidir` já importado. Manter a ordem/guards de tipo (L562-565) — não mexer. Guard genérico do topo
(L342) intocado.

## NÃO TOCAR
- `processarAprovacaoCredito` em si (o **efeito** diretor que zera comissão com guard de data `2026-07-01`,
  o débito/saldo, o `approveVenda` disparado ao fim) — só a **autorização** muda.
- A coluna `aprovacao_credito_tipo` (também é flag de "fluxo de crédito ativo" no front e em
  `solicitacoes-alteracao`). Não renomear/zerar.
- `approveVenda`, `estornarVenda`, a trava R3, o guard genérico L342, a camada `src/lib/aprovacoes/`.
- O sub-ramo `cartao_desconto` que a mesma função `processarAprovacaoCredito` também trata — é da 3g.3, não aqui.

## Verificar
1. `npx tsc --noEmit` 0 erros; `npx vitest run src/lib/aprovacoes` tudo passando (camada não muda).
2. `git status`: `vendas-credito-aprovar.ts` + despachante (+ `devolucoes.ts` se reusar `HttpError` exportada).
3. Contrato: gate só adiciona 403; submissão preserva o 409 "não configurado"; efeitos inalterados.

## Cenários que o Opus testa em homolog (chaves já existem)
- `aprovadora_credito_gerente` = X → X decide crédito-gerente; Y → 403.
- `aprovador_credito_diretor` = Z → Z decide crédito-diretor; outro → 403.
- (miolo: `podeDecidir('credito_gerente')` e `('credito_diretor')` com/sem config).

## Critérios de aceite
1. tsc 0; contrato idêntico; submissão por `resolverAprovadores` (sem fallback por cargo); decisão por
   `podeDecidir` mapeando o evento pelo `aprovacao_credito_tipo`; efeitos (comissão diretor etc.) intocados.
2. Commit: `refactor(aprovacoes): credito (gerente+diretor) pela camada config-first — submissao e decisao (3g.2)`.
3. Atualizar `00-README.md` (3g.2) e reportar (Opus revisa + testa em homolog).
