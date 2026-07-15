# FASE 3g.3 — Migrar DESCONTO + CARTÃO (porta oficial) para config-first

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `03b-config-first-estrito.md`, `12-FASE-3g-venda-plano.md`, `06-FASE-3a-metal.md`
> e `10-FASE-3e-devolucao.md`. Branch: `feat/centralizar-aprovacoes`. **Última fatia da venda — a mais crítica.**

## Objetivo e ESCOPO (leia com atenção)

Migrar pra config-first **APENAS a PORTA OFICIAL** do desconto (via tarefa) e o cartão. Os **atalhos**
(`aprovar-desconto`, `solicitacoes-desconto`), a **unificação de comissão** e o **campo canônico** são
**FASE 4** — NÃO tocar aqui. Aqui só troca "quem pode aprovar" pela config, no fluxo via tarefa.

Eventos: `desconto` (chave `aprovador_desconto_padrao`) e `cartao_desconto` (chave `aprovador_cartao_desconto_padrao`)
— ambas existem na tela mas HOJE são **decorativas** (nada as lê). Esta fase passa a lê-las.

## A) DECISÃO — despachante `src/app/api/tarefas/[id]/aprovacao/route.ts`

- **Handler desconto** (`tarefaInfo?.tipo === "desconto_acima"`, ~L477): logo na entrada, antes do `UPDATE
  vendas_erp`, adicionar:
  ```ts
  const decDesconto = await podeDecidir({ id: user.id, role: usuarioLogado?.role ?? null }, "desconto");
  if (!decDesconto.pode) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  ```
- **Handler cartão** (`tarefaInfo?.tipo === "cartao_desconto"`, ~L427): idem com evento `"cartao_desconto"`.
- `podeDecidir` já importado; sem `ctx.solicitanteId`; guard genérico do topo (L342) intocado.

## B) CRIAÇÃO — resolver o aprovador da tarefa via config (não mais por regra/cargo)

Hoje `POST /api/vendas/[id]/solicitar-aprovacao` (tipo `desconto`/`cartao_desconto`) chama
`avaliarRegras(...)` → `criarTarefaAprovacao(...)` de `src/lib/aprovacao-regras.ts`, e é
`criarTarefaAprovacao` → `encontrarAprovador` que resolve o aprovador **por regra/cargo/master** (a "raiz"
que a política config-first elimina).

1. **PRIMEIRO confirme o alcance:** `grep -rn "criarTarefaAprovacao\|encontrarAprovador" src` — confirme que
   `criarTarefaAprovacao` só é usada pelo fluxo de desconto/cartão (via `avaliarRegras`/`solicitar-aprovacao`).
   Se houver OUTRO uso, **PARE e reporte** (não quero afetar outro fluxo).
2. Se for só desconto/cartão: em `criarTarefaAprovacao`, trocar a resolução do aprovador (`encontrarAprovador`)
   por `resolverAprovadores`, mapeando `regra.tipo_evento`:
   - `"desconto_acima"` → evento `"desconto"`
   - `"cartao_desconto"` → evento `"cartao_desconto"`
   ```ts
   const evento = regra.tipo_evento === "cartao_desconto" ? "cartao_desconto" : "desconto";
   const resol = await resolverAprovadores(evento);
   if (resol.status === "nao_configurado") {
     throw new HttpError(409, "Aprovador de desconto não configurado. Defina em Configurações › Aprovadores.");
     // (use a HttpError de devolucoes.ts; o solicitar-aprovacao/route.ts precisa tratá-la → 409, como no crédito)
   }
   const aprovadorId = resol.aprovadores[0];
   ```
   Usar esse `aprovadorId` onde hoje se usa o retorno de `encontrarAprovador` (o `responsavel_id` da tarefa
   + `aprovacoes_tarefa.aprovador_id`). **Manter** o resto de `criarTarefaAprovacao` (template, tags, notificação).
3. **`avaliarRegras` e o THRESHOLD ficam** — a regra que decide SE precisa aprovação (desconto > X%) é da
   **Fase 5**, não mexa. Só a **resolução do aprovador** muda.
4. No `solicitar-aprovacao/route.ts`, garantir que a `HttpError` (409 "não configurado") é tratada e chega ao
   front (mesmo padrão do crédito 3g.2, ~L270).
5. Se `encontrarAprovador`/`avaliarRegras`/`getDescontoThreshold` ficarem sem uso após isso, **NÃO** remova
   nesta fase (podem ser usados por outras coisas / Fase 5) — só deixe de chamar `encontrarAprovador` na criação.

## NÃO TOCAR (é Fase 4 / fora de escopo)
- Porta (b) `POST /api/vendas/[id]/aprovar-desconto` (role fixo admin/dev) e porta (c)
  `PATCH /api/vendas/solicitacoes-desconto/[id]` (role fixo + zera comissão) — **ficam como estão**.
- O **efeito de comissão** ao aprovar desconto (o recálculo por `faixas_comissao` no handler) — não mexer.
- `desconto_aprovado_por` / `desconto_cartao_aprovado_por` (o handler continua gravando como hoje).
- `approveVenda`, a trava R3, `getDescontoThreshold`, `avaliarRegras`, o guard genérico L342, a camada `src/lib/aprovacoes/`.

## Verificar
1. `npx tsc --noEmit` 0 erros; `npx vitest run src/lib/aprovacoes` tudo passando.
2. `git status`: despachante (2 gates) + `aprovacao-regras.ts` (resolução) + `solicitar-aprovacao/route.ts` (409).
   NÃO devem aparecer `aprovar-desconto`, `solicitacoes-desconto`, nem arquivos de comissão.
3. Contrato: gates só adicionam 403; criação preserva o 409 "não configurado"; efeitos/comissão inalterados.

## Cenários que o Opus testa em homolog
- `aprovador_desconto_padrao` = X → X decide desconto (via tarefa); Y → 403; sem a chave → 409 na criação.
- `aprovador_cartao_desconto_padrao` = X → idem cartão.

## Critérios de aceite
1. tsc 0; contrato idêntico; 2 gates `podeDecidir`; criação por `resolverAprovadores` (só desconto/cartão);
   comissão/atalhos/campos intocados.
2. Commit: `refactor(aprovacoes): desconto + cartao (porta oficial) pela camada config-first (3g.3)`.
3. Atualizar `00-README.md` (3g.3 + marcar a Fase 3g inteira como concluída na migração) e reportar.
