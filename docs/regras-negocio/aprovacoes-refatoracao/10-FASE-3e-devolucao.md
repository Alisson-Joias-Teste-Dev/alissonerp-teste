# FASE 3e — Migrar o fluxo de DEVOLUÇÃO para a camada config-first

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `03b-config-first-estrito.md`, `05-divergencias-alvo-x-atual.md`,
> `06-FASE-3a-metal.md` (padrão do gate no despachante) e `07-FASE-3b-conversao.md` (padrão da chave/config).
> Branch: `feat/centralizar-aprovacoes`.

## Objetivo e a decisão que simplifica tudo

Devolução tem **2 aprovações em sequência**: etapa 1 (aprovar a devolução) e etapa 2 (aprovar o estoque
antes de gerar vale/reembolso). Migrar as duas pra config-first, sem mudar contrato.

**DECISÃO DO JONATHAN (12/07): 1 aprovador só pra devolução** — a autorização **NÃO depende mais** de
dentro/fora dos 7 dias úteis. Consequências:
- A etapa 1 usa **uma chave nova dedicada: `aprovador_devolucao`** (substitui o par
  `aprovadora_credito_gerente`/`aprovador_devolucao_fora_prazo` que a devolução usava por prazo).
- **O cálculo do prazo (`avaliarPrazoDevolucao`) NÃO é removido** — ele continua para o aviso "⚠️ FORA DO
  PRAZO" na descrição da tarefa e para a retenção. Só a ESCOLHA DE QUEM APROVA deixa de usá-lo.
- Sem `ctx.foraPrazo` no gate → sem recálculo no despachante, sem risco de borda.

Etapa 2 usa `aprovador_devolucao_estoque` (já existe).

## Regras (as mesmas dos outros fluxos)
1. Contrato idêntico (rotas/payload/respostas/mensagens/status). O gate novo só adiciona um 403.
2. Não nasce sem config: sem `aprovador_devolucao`/`aprovador_devolucao_estoque`, a solicitação da etapa
   correspondente não é criada (erro claro).
3. Sem `solicitanteId` no ctx.
4. `configMulti`: 1 ou vários UUIDs.

## Passo a passo

### A) Camada — devolução passa a ter 1 chave fixa (remover a lógica de prazo da autoridade)
- `src/lib/aprovacoes/catalogo.ts`, entrada `devolucao`: trocar
  `configKeys: ["aprovadora_credito_gerente", "aprovador_devolucao_fora_prazo"]` por
  `configKeys: ["aprovador_devolucao"]`. Atualizar a `observacao` (não depende mais do prazo).
- `src/lib/aprovacoes/autoridade.ts`, função `configKeysEfetivas`: **remover** o bloco
  `if (regra.evento === "devolucao") { ... foraPrazo ... }` — passa a valer só `return regra.configKeys`.
  (Pode deixar o campo `ContextoAprovacao.foraPrazo` no tipo, sem uso, ou remover se ficar limpo — não é
  usado por mais ninguém depois disso; confirme com grep.)
- Testes: atualizar `__tests__/caracterizacao-catalogo.test.ts` e `catalogo.snapshot.test.ts` — a entrada
  `devolucao` agora tem `configKeys: ["aprovador_devolucao"]` (o teste de prazo do `devolucao` cai/ajusta).

### B) Decisão — os 2 gates no despachante
Em `src/app/api/tarefas/[id]/aprovacao/route.ts` (`podeDecidir` já importado; `user`/`usuarioLogado.role`
já disponíveis; espelhe o `recebimento_metal` ~L636):
- **Etapa 2** — no início do bloco `if (tags.includes("devolucao_estoque"))` (~L580), antes de chamar
  `processarAprovacaoEstoqueDevolucao`:
  ```ts
  const dec = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, "devolucao_estoque");
  if (!dec.pode) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  ```
- **Etapa 1** — no início do bloco `if (devLink || tags.includes("devolucao"))` (~L595), antes de
  `processarAprovacaoDevolucao`:
  ```ts
  const dec = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, "devolucao");
  if (!dec.pode) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  ```
  **Sem `ctx.foraPrazo`** (decisão: 1 aprovador). Mantenha a ordem: bloco `devolucao_estoque` ANTES de
  `devolucao` (a etapa 2 sobrescreve `tarefa_id`, a desambiguação é por tag). A checagem genérica do topo
  (L342-344) fica intocada.

### C) Criação — resolver o aprovador pela camada + não nasce sem config
Em `src/lib/devolucoes.ts`:
- `solicitarAprovacaoDevolucao` (~L259): **remover** a escolha de chave por prazo (L283-285) e o
  **fallback por cargo** (L298-311). Trocar por:
  ```ts
  const resol = await resolverAprovadores("devolucao");
  if (resol.status === "nao_configurado") {
    return { ok: false, status: 409, error: "Aprovador de devolução não configurado. Defina em Configurações › Aprovadores." };
    // (adeque ao shape de retorno da função — veja como ela retorna erro hoje)
  }
  const aprovadorId = resol.aprovadores[0]; // grava o 1º na tarefa/aprovacoes_tarefa (coluna UUID única)
  ```
  **Mantenha** a chamada a `avaliarPrazoDevolucao` e o aviso "⚠️ FORA DO PRAZO" na descrição — só o
  aprovador deixa de depender do prazo.
- `solicitarAprovacaoEstoqueDevolucao` (~L452): remover o fallback por cargo (L487-500), trocar por
  `resolverAprovadores("devolucao_estoque")` com o mesmo tratamento de `nao_configurado` e grava o 1º.
- Confira o shape de erro que essas funções já retornam (elas retornam objeto, não NextResponse) e o
  endpoint que as chama (`solicitar-aprovacao/route.ts`, `concluir/route.ts`) pra o 409 chegar ao front
  com a mensagem certa, mantendo o contrato.

### D) Chave nova `aprovador_devolucao` na tela de Configurações
Em `src/app/api/configuracoes/aprovadores/route.ts` (GET+PUT) e nos componentes de config
(`TabAprovadores`/`ListaAprovadores`/`FormularioAprovador`), adicionar `aprovador_devolucao` seguindo
EXATAMENTE o padrão de `aprovador_conversao` (Fase 3b). Nota: `aprovador_devolucao_fora_prazo` e
`aprovadora_credito_gerente` continuam no array (a 2ª ainda é usada pelo evento `credito_gerente` da
venda) — só **não** são mais usadas pela devolução.

## Verificar
1. `npx tsc --noEmit` 0 erros; `npx vitest run src/lib/aprovacoes` tudo passando (testes de `devolucao`
   ajustados). `grep -rn "foraPrazo" src/lib/aprovacoes` — só o tipo, sem uso na lógica.
2. `git status`: camada (catalogo/autoridade/testes) + `devolucoes.ts` + despachante (2 gates) + config
   (route + UI). **Sem** tocar as telas de devolução (`DevolucaoDetalheClient`) nem o cálculo de prazo
   (`prazo-devolucao.ts`, `dias-uteis.ts`).
3. Contrato: os handlers de sucesso (`{ok:true, devolucao}` / `{ok:true, devolucao_estoque}`) inalterados.

## Cenários que o Opus testa em homolog
Config `aprovador_devolucao` = X, `aprovador_devolucao_estoque` = X:
- Etapa 1: X aprova/rejeita → passa; Y (≠X, mesmo admin/dev) → 403.
- Etapa 2: idem com `aprovador_devolucao_estoque`.
- Sem `aprovador_devolucao` → solicitar aprovação da devolução → erro "não configurado".

## Critérios de aceite
1. tsc 0; contrato idêntico; 2 gates por `podeDecidir` (sem prazo); criação por `resolverAprovadores` sem
   fallback; catálogo/testes com `devolucao` = 1 chave; `aprovador_devolucao` exposto na config.
2. Escopo: sem tela de devolução, sem `prazo-devolucao.ts`. Commit:
   `refactor(aprovacoes): devolucao (2 etapas) decidida pela camada config-first — 1 aprovador, contrato idêntico`.
3. Atualizar `00-README.md` (Fase 3e) e reportar pro Opus criar a chave em homolog e testar.
