# FASE 3a — Migrar o fluxo de METAL para a camada config-first

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `03b-config-first-estrito.md` e `05-divergencias-alvo-x-atual.md` (linhas de metal)
> antes. Branch: `feat/centralizar-aprovacoes` (worktree `alissonerp-wt-centralizar-aprovacoes`).
>
> **Primeiro fluxo da Fase 3.** Metal é o mais seguro pra estrear: longe da venda e a chave
> `metal_aprovador_id` **já existe** (não precisa de `/dba`). A camada `src/lib/aprovacoes/` já está
> pronta e testada (122 testes) — aqui ela **é plugada** pela primeira vez num endpoint real.

## Objetivo

Trocar, no fluxo de metal, a autorização atual (por cargo, `ROLES_METAL_APROVACOES` = 5 cargos que
**ignoram** a config) pela camada config-first: **só quem estiver em `metal_aprovador_id` decide**.
Sem mudar o contrato de nenhum endpoint (payload e resposta idênticos — o front não pode perceber).

Dois eventos, dois caminhos (confirmados no mapa):
- `compra_metal` → **endpoints dedicados** `/api/metal/aprovacoes/*` (o front usa estes).
- `recebimento_metal` → **sem rota dedicada**; aprovado pela tela de Tarefas via o despachante
  `tarefas/[id]/aprovacao/route.ts` (handler `recebimento_metal`).

## API da camada (já pronta — só importar de `@/lib/aprovacoes`)

```ts
resolverAprovadores(evento, ctx?): Promise<
  | { status: "ok"; aprovadores: string[]; origem }
  | { status: "nao_configurado"; evento; configKeys }>
podeDecidir(user: {id, role}, evento, ctx?): Promise<{ pode: boolean; motivo? }>
```
Eventos: `"compra_metal"` e `"recebimento_metal"` (ambos leem `metal_aprovador_id`).

## Regras desta migração (LEIA — é o que evita quebrar)

1. **Contrato idêntico.** Mesmas rotas, mesmo payload, mesma resposta (inclusive as mensagens de erro
   e os status codes atuais). Nada no front muda.
2. **Preservar o "sem aprovador configurado".** Hoje, criar compra/recebimento acima do teto sem
   `metal_aprovador_id` **lança erro e o registro não nasce** (`compras.ts:72-74`, `recebimentos.ts:56-58`).
   Ao trocar pela camada: se `resolverAprovadores` devolver `nao_configurado`, **lance o MESMO erro**
   (mesma mensagem) — o registro continua não nascendo. NÃO passe a criar registro pendente sem aprovador.
3. **Metal NÃO exclui o solicitante.** Hoje qualquer um dos 5 cargos aprova, inclusive quem cadastrou a
   compra. Então **NÃO passe `solicitanteId` no ctx** de `podeDecidir`/`resolverAprovadores` do metal —
   a exclusão do solicitante é conceito de venda, não de metal. (Passar excluiria o cadastrador e poderia
   travar se ele for o único aprovador configurado.)
4. **`configMulti` (1 ou vários).** As colunas `compras_metal_aprovacoes.aprovador_id` e
   `aprovacoes_tarefa.aprovador_id` são UUID único. Ao GRAVAR o aprovador esperado na criação, use o
   **1º** de `aprovadores[]`. A DECISÃO (`podeDecidir`) valida contra a **lista toda** — está correto.
5. **NÃO mexer no `GET /api/metal/aprovacoes`** (listar) — visibilidade da fila continua por cargo
   (`ROLES_METAL_APROVACOES`). Só a AÇÃO de aprovar/rejeitar passa a seguir a config. (O front já mostra
   o botão pra todos e recebe 403 do back quando não pode — isso não muda; melhorar a UX é fora do escopo.)
6. **NÃO tocar no front.** Nenhum arquivo em `src/components/metal/` ou `src/app/(dashboard)/metal/`.

## Passo a passo

### A) COMPRA — decisão (endpoints dedicados)

Em `src/app/api/metal/aprovacoes/[id]/aprovar/route.ts:19` e
`src/app/api/metal/aprovacoes/[id]/rejeitar/route.ts:19`, trocar:
```ts
if (!ROLES_METAL_APROVACOES.includes(user.role)) {
  return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
}
```
por:
```ts
const decisao = await podeDecidir({ id: user.id, role: user.role }, "compra_metal");
if (!decisao.pode) {
  return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
}
```
Remover o import agora não usado de `ROLES_METAL_APROVACOES` nesses 2 arquivos; importar `podeDecidir`
de `@/lib/aprovacoes`. Resposta 403 **idêntica** (`{error:"Sem permissão"}`).

### B) COMPRA — criação (resolver o aprovador esperado)

Em `src/lib/metal/compras.ts` (~L69) e no endpoint `src/app/api/metal/compras/route.ts` (~L56) — os DOIS
pontos que hoje leem `config.metal_aprovador_id`. Trocar a leitura crua por:
```ts
const resol = await resolverAprovadores("compra_metal"); // sem solicitanteId (regra 3)
if (acimaTeto && resol.status === "nao_configurado") {
  throw new Error("Aprovador de compra de metal acima do teto não configurado."); // MESMA msg de hoje (regra 2)
}
const aprovadorMetalId = resol.status === "ok" ? resol.aprovadores[0] : null; // 1º da lista (regra 4)
```
Usar `aprovadorMetalId` onde hoje se usa a leitura crua (INSERT em `compras_metal_aprovacoes.aprovador_id`,
`compras.ts:150`; e a criação de tarefa/notificação em `compras/route.ts:74-108`). Se você conseguir
resolver num ponto só e reusar, melhor — mas garanta que os dois locais usem o MESMO valor (o mapa alertou
que hoje há dupla leitura que pode divergir).

### C) COMPRA — caminho latente no despachante

`processarAprovacaoCompraMetal` em `src/app/api/tarefas/[id]/aprovacao/route.ts:196-240` faz a mesma
transição por outro caminho (o front não usa hoje, mas existe). Adicionar, no início dele, a mesma
checagem `podeDecidir(user, "compra_metal")` → se `!pode`, retornar `{ ok:false, motivo:"sem_permissao" }`
(ou o padrão de erro já usado ali) — pra o caminho latente não ficar com a regra antiga. **Só** este
handler; não altere a checagem genérica do topo do PATCH (L326-333), que serve os outros fluxos.

### D) RECEBIMENTO — decisão (no despachante)

Em `src/app/api/tarefas/[id]/aprovacao/route.ts`, no bloco que roteia `recebimento_metal` (~L621-628) /
dentro de `processarAprovacaoRecebimentoMetal` (~L169-192), adicionar antes de executar o efeito:
```ts
const dec = await podeDecidir({ id: user.id, role: user.role }, "recebimento_metal");
if (!dec.pode) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
```
(Adeque ao shape de retorno que o handler já usa.) Assim a decisão do recebimento passa a seguir
`metal_aprovador_id`, não mais o gate genérico da tarefa.

### E) RECEBIMENTO — criação

Em `src/lib/metal/recebimentos.ts` (~L55) e `src/app/api/metal/recebimentos/route.ts` (~L50), mesma troca
do item (B), com evento `"recebimento_metal"` e a mensagem de erro atual de recebimento
(`"Aprovador de metal acima do teto não configurado."`). O aprovador (1º da lista) é gravado onde hoje:
`recebimentos/route.ts` cria a `tarefas` (responsavel_id, L73) e a `aprovacoes_tarefa` (aprovador_id, L84-86).

## O que verificar antes de dizer "pronto"

1. `npx tsc --noEmit` → **0 erros**.
2. Nenhuma mudança em: `GET /api/metal/aprovacoes`, qualquer arquivo de front, ou handlers do despachante
   que não sejam de metal. `git status` deve listar só os arquivos de metal + o despachante (2 handlers).
3. Confirme que os imports de `ROLES_METAL_APROVACOES` que ficaram sem uso foram removidos (evita warning).
4. Descreva no report: os arquivos tocados e como cada cenário abaixo se comporta (você não precisa rodar
   homolog — a validação back+front em homolog é do Opus/Jonathan na revisão).

## Cenários que o Opus/Jonathan vão testar em homolog (documente o comportamento esperado)

Config `metal_aprovador_id` = UUID do user X:
- **C1** — X aprova compra acima do teto → `{ok:true}`, compra vai a `pendente_pagamento`.
- **C2** — user Y (≠ X, mesmo sendo admin) tenta aprovar → **403** `{error:"Sem permissão"}`.
- **C3** — `metal_aprovador_id` vazio + tentar criar compra acima do teto → erro (compra não nasce), mensagem atual.
- **C4** — `metal_aprovador_id` = "X,Z" (dois) → X e Z aprovam; um terceiro → 403.
- **C5** — recebimento acima do teto: só X aprova pela tela de Tarefas; Y → 403.
- **C6** — rejeitar (compra e recebimento): mesma regra de quem pode.

## Critérios de aceite

1. `tsc --noEmit` 0 erros; contrato idêntico (rotas/payload/resposta/mensagens/status inalterados).
2. Autorização de `compra_metal` e `recebimento_metal` decidida por `podeDecidir` (config-first); criação
   resolve o aprovador por `resolverAprovadores`, preservando o erro de "não configurado".
3. Escopo respeitado: só metal + os 2 handlers de metal no despachante; front e GER intactos.
4. Commit: `refactor(aprovacoes): metal decidido pela camada config-first (compra + recebimento) — contrato idêntico`.
5. Atualizar `00-README.md` (marcar Fase 3a — metal, aguardando teste homolog do Opus/Jonathan) e reportar.

**Não marque como concluído em produção** — depois do teu commit, o Opus revisa o código e testa em
homolog (back via SQL + front pela tela, com o Jonathan) antes de qualquer coisa ir adiante.
