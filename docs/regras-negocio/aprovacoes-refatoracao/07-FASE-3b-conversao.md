# FASE 3b — Migrar o fluxo de CONVERSÃO para a camada config-first

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `03b-config-first-estrito.md`, `05-divergencias-alvo-x-atual.md` (linhas de conversão)
> e `06-FASE-3a-metal.md` (o padrão já aplicado no metal) antes. Branch: `feat/centralizar-aprovacoes`
> (worktree `alissonerp-wt-centralizar-aprovacoes`).

## Objetivo

Trocar a autorização de conversão — hoje **fixa `["admin","desenvolvedor"]`** nos 4 endpoints dedicados —
pela camada config-first: só quem estiver em `aprovador_conversao` decide. Sem mudar contrato.

**Decisão do Jonathan (12/07):** conversão de estoque e conversão de SKU têm o **MESMO aprovador** →
**uma chave só, `aprovador_conversao`**, pros dois sub-fluxos. (O evento `conversao_sku` do catálogo, que
hoje aponta pra `aprovador_conversao_sku`, passa a apontar pra `aprovador_conversao` — ver passo D.)

Dois sub-fluxos, ambos com **endpoints dedicados** (o front roteia por `tipo` na tela de Tarefas):
- `conversao` → `/api/conversao/{aprovar,recusar}`
- `conversao_sku` → `/api/conversao-sku/{aprovar,recusar}`

O despachante genérico `tarefas/[id]/aprovacao` **não** decide conversão (a tarefa não gera
`aprovacoes_tarefa`) — **não** adicione handler lá; mantenha o roteamento por `tipo` do front intacto.

## Pré-requisito de banco (feito ANTES de plugar — o Opus cria em homolog; em prod é via `/dba`)

A chave `aprovador_conversao` precisa existir e estar **preenchida** em `alissonerp.configuracoes_sistema`
antes de ligar o fluxo, senão a criação de conversão trava (`nao_configurado`). Em homolog o Opus insere
pra testar; em produção é uma migration assinada da skill `/dba`. **Você (Sonnet) não mexe no banco.**
NÃO é preciso alterar o gatilho (`fn_processar_conversao`/`fn_processar_conversao_sku`, migration 340):
ele já usa `aprovador_conversao` como 1º nível do COALESCE, e com a validação na criação (passo C) a
config sempre existe quando a conversão nasce — os fallbacks do gatilho viram código morto.

## Regras (as mesmas do metal — 06)

1. **Contrato idêntico**: rotas, payload, respostas e mensagens de erro/status **não mudam**.
2. **Preservar "sem aprovador não nasce"**: sem `aprovador_conversao`, a conversão não é criada (409),
   espelhando o metal.
3. **Sem `solicitanteId`** no ctx de `podeDecidir`/`resolverAprovadores` (conversão não exclui quem criou).
4. `configMulti` (1 ou vários): grava sempre o 1º de `aprovadores[]` onde a coluna for UUID único.
5. **Não tocar o front** de conversão (drawers/telas), exceto o campo novo em Configurações (passo E).

## Passo a passo

### A) `conversao` — decisão
Em `src/app/api/conversao/aprovar/route.ts:26-31` e `src/app/api/conversao/recusar/route.ts:24-29`,
trocar o bloco `["admin","desenvolvedor"].includes(usuario.role)` por:
```ts
const decisao = await podeDecidir({ id: user.id, role: usuario.role }, "conversao");
if (!decisao.pode) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
```
Importar `podeDecidir` de `@/lib/aprovacoes`; remover o import não usado. 403 idêntico. (Veja como ficou no
metal: `metal/aprovacoes/[id]/aprovar/route.ts`.)

### B) `conversao_sku` — decisão
Idem em `src/app/api/conversao-sku/aprovar/route.ts:19-24` e `.../recusar/route.ts:21-26`, com evento
`"conversao_sku"`.

### C) Criação — não nasce sem aprovador
Em `src/app/api/estoque-comercial/converter/route.ts` (~L99, antes do `INSERT INTO conversoes_estoque`)
e `src/app/api/conversao-sku/route.ts` (~L110, antes do `INSERT INTO conversoes_sku`), adicionar:
```ts
const resol = await resolverAprovadores("conversao"); // ambos usam a mesma chave (decisão Jonathan)
if (resol.status === "nao_configurado") {
  return NextResponse.json(
    { error: "Aprovador de conversão não configurado. Defina em Configurações › Aprovadores." },
    { status: 409 },
  );
}
```
(Para `conversao-sku`, o evento também é `"conversao"` porque a chave é a mesma — OU use `"conversao_sku"`
depois do passo D, que faz os dois resolverem `aprovador_conversao`; use `"conversao_sku"` pra ficar
semanticamente claro.)

### D) Catálogo — `conversao_sku` passa a usar `aprovador_conversao`
Em `src/lib/aprovacoes/catalogo.ts`, na entrada `conversao_sku`, trocar
`configKeys: ["aprovador_conversao_sku"]` por `configKeys: ["aprovador_conversao"]` (decisão: mesmo
aprovador). Atualizar a `observacao` se citar a chave antiga. A chave `aprovador_conversao_sku` deixa de
existir no projeto — confira que não sobra referência (`grep -rn aprovador_conversao_sku src`).
Atualizar os testes que a citam:
- `src/lib/aprovacoes/__tests__/catalogo.snapshot.test.ts` (a linha `conversao_sku` do SNAPSHOT_ESPERADO).
- `src/lib/aprovacoes/__tests__/autoridade.test.ts` (o `it.each` das "5 chaves novas" — vira 4:
  `aprovador_conversao`, `aprovador_alteracao_venda`, `aprovador_precificacao`, `aprovador_auditoria`;
  e a linha de `conversao_sku` deve esperar `["aprovador_conversao"]`).

### E) Tela de Configurações › Aprovadores — expor a chave
Em `src/app/api/configuracoes/aprovadores/route.ts`: adicionar `"aprovador_conversao"` ao array `CHAVES`
(~L24-36), ao objeto de retorno do `GET` (~L115-125) e ao bloco de `updates` do `PATCH` (~L154-206),
seguindo o padrão das chaves existentes. O campo na UI (front de Configurações) pode entrar aqui também
se o componente for direto; se exigir mexer num componente React grande, **liste no report** o arquivo pra
o Opus decidir — não é bloqueante pro teste (o Opus preenche a chave por SQL em homolog).

## O que verificar antes de "pronto"
1. `npx tsc --noEmit` → 0 erros. `npx vitest run src/lib/aprovacoes` → tudo passando (com os testes do
   catálogo atualizados no passo D).
2. `git status`: só os arquivos de conversão + catálogo + testes + `configuracoes/aprovadores`. Sem tocar o
   despachante, sem tocar o front de conversão.
3. `grep -rn aprovador_conversao_sku src` → **vazio** (a chave sumiu).

## Cenários que o Opus testa em homolog (documente o esperado)
Config `aprovador_conversao` = UUID de X:
- X aprova conversão de estoque → ok; Y (≠ X, mesmo admin) → 403.
- X recusa → ok; Y → 403.
- Conversão de SKU: mesma regra, mesmo aprovador.
- `aprovador_conversao` vazio → criar conversão → 409 (não nasce).

## Critérios de aceite
1. tsc 0; contrato idêntico; 4 endpoints decididos por `podeDecidir`; criação bloqueia sem config.
2. Catálogo e testes atualizados (1 chave só); `aprovador_conversao` exposto na config.
3. Escopo respeitado (sem despachante, sem front de conversão). Commit:
   `refactor(aprovacoes): conversao (estoque+sku) decidida pela camada config-first — 1 chave, contrato idêntico`.
4. Atualizar `00-README.md` (Fase 3b — aguardando teste homolog do Opus) e reportar.

**Não marque como concluído** — depois do commit, o Opus cria a chave em homolog, testa end-to-end
(como no metal) e só então fecha a 3b.
