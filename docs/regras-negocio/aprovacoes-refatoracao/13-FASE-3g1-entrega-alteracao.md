# FASE 3g.1 — Migrar ENTREGA SEM PAGAMENTO + ALTERAÇÃO DE VENDA para config-first

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `03b-config-first-estrito.md`, `12-FASE-3g-venda-plano.md` (o plano da venda),
> `06-FASE-3a-metal.md` e `07-FASE-3b-conversao.md` (padrões do gate + chave nova). Branch: `feat/centralizar-aprovacoes`.

## Objetivo

Primeira fatia da VENDA (a mais crítica, por último) — começando pelas 2 aprovações mais isoladas:
- **Entrega sem pagamento** ("entregar devendo") — já é config-only hoje; só falta o gate na decisão.
- **Alteração de venda** (financeiro muda campo/pagamento após fechar) — troca cargo fixo por config;
  **chave nova** `aprovador_alteracao_venda`.

Sem mudar contrato. Não mexe em comissão nem em `approveVenda`.

## A) ENTREGA SEM PAGAMENTO — `entrega_sem_pagamento`

Decidida pela tela de Tarefas via o despachante. A criação já obriga config hoje (sem fallback).

1. **Gate na decisão** — `src/app/api/tarefas/[id]/aprovacao/route.ts`, no bloco
   `if (tarefaInfo?.tipo === ENTREGA_SEM_PAGAMENTO_TIPO || tags.includes("aprov_entrega_sem_pagamento"))`
   (~L384), **antes** do `try` (~L385), adicionar (espelha `devolucao`/`compra_comercial`):
   ```ts
   const dec = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, "entrega_sem_pagamento");
   if (!dec.pode) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
   ```
   `podeDecidir` já importado; `usuarioLogado.role` já existe. Sem `ctx.solicitanteId`.
2. **Submissão (opcional, pra unificar na camada)** — `src/lib/entrega-sem-pagamento.ts` (~L117-125) hoje
   lê `aprovador_entrega_sem_pagamento` direto e faz `throw` se vazio. Trocar por
   `resolverAprovadores("entrega_sem_pagamento")`, mantendo a MESMA mensagem de erro atual quando
   `nao_configurado` (ex.: "Aprovador de entrega sem pagamento total não configurado"). Se preferir não
   mexer (já é config-only), pode deixar — mas o gate (item 1) é obrigatório.

## B) ALTERAÇÃO DE VENDA — `alteracao_venda` (chave NOVA)

PATCH direto (não passa por despachante, não gera `aprovacoes_tarefa`).

1. **Gate** — `src/app/api/vendas/solicitacoes-alteracao/[id]/route.ts`: hoje L49-51 faz
   `if (!ROLES_FINANCEIRO.includes(user.role)) → 403`. Trocar por:
   ```ts
   const dec = await podeDecidir({ id: user.id, role: user.role }, "alteracao_venda");
   if (!dec.pode) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
   ```
   Deve ficar **no topo do PATCH** (onde `ROLES_FINANCEIRO` está — L49), ANTES de qualquer efeito
   (auto-rejeição, `approveVenda`, `estornarVenda`). Importar `podeDecidir`; remover `ROLES_FINANCEIRO`
   se ficar sem uso. Sem `ctx.solicitanteId`.
2. **Chave nova `aprovador_alteracao_venda` na config** — já está no catálogo (`catalogo.ts`), falta expor
   e criar. Em `src/app/api/configuracoes/aprovadores/route.ts`: adicionar ao array `CHAVES`, ao GET e ao
   PUT (padrão idêntico ao `aprovador_conversao` da Fase 3b). E o campo na UI (`TabAprovadores`/
   `ListaAprovadores`/`FormularioAprovador`), mesmo padrão. **A chave no banco** o Opus cria em homolog;
   em prod é via `/dba` — você (Sonnet) não mexe no banco.
   > ⚠️ Enquanto a chave não estiver preenchida, `podeDecidir('alteracao_venda')` nega TODO mundo (403).
   > Por isso o Opus preenche em homolog antes de testar; em prod, preencher antes de ligar.

## Escopo
- Entrega: despachante (1 gate) + opcionalmente `entrega-sem-pagamento.ts`.
- Alteração: `solicitacoes-alteracao/[id]/route.ts` (gate) + `configuracoes/aprovadores/route.ts` + UI de config.
- **NÃO** tocar: `approveVenda`, `estornarVenda`, os efeitos de `solicitacoes-alteracao` (só a autorização
  muda), o guard genérico do despachante (L342), nem a camada `src/lib/aprovacoes/` (nenhum teste muda).

## Verificar
1. `npx tsc --noEmit` 0 erros; `npx vitest run src/lib/aprovacoes` tudo passando (nada da camada muda).
2. `git status`: entrega (1-2 arquivos) + alteração (route) + config (route + UI).
3. Contrato: gates só adicionam 403 `{ error: "Sem permissão" }`; respostas de sucesso inalteradas.

## Cenários que o Opus testa em homolog
- `aprovador_entrega_sem_pagamento` = X → X decide entrega devendo; Y → 403.
- `aprovador_alteracao_venda` = X → X aprova/rejeita alteração de venda; Y (mesmo admin/dev) → 403;
  sem a chave → todo mundo 403 (config-first).

## Critérios de aceite
1. tsc 0; contrato idêntico; 2 gates por `podeDecidir`; chave `aprovador_alteracao_venda` exposta na config.
2. Escopo respeitado; `approveVenda` e camada intocados. Commit:
   `refactor(aprovacoes): entrega sem pagamento + alteracao de venda pela camada config-first (3g.1)`.
3. Atualizar `00-README.md` (Fase 3g.1) e reportar pro Opus criar a chave em homolog e testar.
