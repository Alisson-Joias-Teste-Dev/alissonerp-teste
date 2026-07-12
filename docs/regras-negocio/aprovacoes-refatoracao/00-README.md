# Centralização das Aprovações — handoff entre fases

> **Fonte de verdade da refatoração.** Cada fase é executada por um modelo/IA diferente
> (Opus = arquiteto/revisor, Sonnet = operacional). Este diretório é o contexto compartilhado —
> nenhum modelo herda o chat da conversa anterior. **Leia estes docs antes de executar qualquer fase.**

## O problema

O sistema de aprovação **não segue Configurações — segue a role**, e há regras se esbarrando.
Causa raiz: **três fontes de verdade paralelas** sobre "quem aprova", e cada endpoint escolhe a sua:

- `alissonerp.configuracoes_sistema` (12 chaves de aprovador)
- `src/lib/roles.ts` (~10 listas de cargos, com **4 definições divergentes** de "acesso pleno")
- `alissonerp.tarefas_regras_aprovacao` (limites por evento)

Detalhe em [`02-mapa-esbarros.md`](02-mapa-esbarros.md).

## Os documentos

| # | Arquivo | O que é |
|---|---|---|
| 01 | [`01-dossie-dependencias.md`](01-dossie-dependencias.md) | Para cada fluxo A–M: front/banco/contrato/campos/estados/notificações + triggers vivos + **riscos R1–R11** |
| 02 | [`02-mapa-esbarros.md`](02-mapa-esbarros.md) | Os 28 endpoints, autorização real de cada um, 7 grupos de conflito |
| 03 | [`03-FASE-1-camada-central.md`](03-FASE-1-camada-central.md) | **Pacote de execução da Fase 1** (arquitetura + briefing pro Sonnet) |
| 03b | [`03b-config-first-estrito.md`](03b-config-first-estrito.md) | **Pacote** — política config-first estrita (só o configurado decide; substitui o fallback por cargo). Decisão do Jonathan 11/07. **Cancela** o antigo A1 de determinismo. |
| 04 | [`04-FASE-2-golden-tests.md`](04-FASE-2-golden-tests.md) | **Pacote de execução da Fase 2** (caracterização + mapa de divergências) — roda **após** o `03b` |
| 05 | [`05-divergencias-alvo-x-atual.md`](05-divergencias-alvo-x-atual.md) | **Mapa de divergências ALVO×ATUAL** (18 eventos) — VALIDADO pelo Jonathan. Guia da Fase 3. |
| 06 | [`06-FASE-3a-metal.md`](06-FASE-3a-metal.md) | **Pacote da Fase 3a** — plugar o fluxo de metal (compra + recebimento) na camada config-first, contrato idêntico |

## O plano (7 fases)

0. **Mapa de dependências** — ✅ feito (dossiê + mapa acima)
1. **Camada central de autoridade** `src/lib/aprovacoes/` — catálogo + autoridade, sem plugar em nada
2. **Testes de caracterização ("golden")** — congela o comportamento atual antes de tocar
3. **Migração fluxo a fluxo** — metal → conversão → preço → limpeza → devolução → compra → **venda por último**
4. **Fechar brechas + matar atalhos** — auditoria, concluir-compra, backdoor, atalho de desconto
5. **Unificar limites + override do admin com log** — um limite de desconto só; config vira a fonte real
6. **Validação ponta a ponta** — Claude testa back+front local → OK → Jonathan testa e sobe

## Regras invioláveis de execução (valem para TODA fase)

1. **Branch própria** `feat/centralizar-aprovacoes` — nunca commitar em homolog/main. Merge é manual do Jonathan.
2. **Testes locais contra o banco de HOMOLOG** — `next dev` com `.env.local` apontando pro Postgres de homolog. **Não subir pra homolog.** Usar dados de teste e limpar depois.
3. **Contratos de API idênticos** — o payload e o shape de resposta de cada rota **não mudam** (o front não pode perceber a troca). Ver os contratos no dossiê.
4. **Banco só via skill `/dba`** — nenhum agente operacional faz DDL/DML/migration. Toda migration é assinada e versionada.
5. **Nada em produção** sem o Jonathan testar e aprovar.
6. **Respeitar os riscos R1–R11** do dossiê — são o que quebra as vendas se ignorado.
7. Ao terminar a fase: `npx tsc --noEmit` zero erros + atualizar este README com o status.

## Status

- [x] Fase 0 — mapa (11/07/2026)
- [x] Fase 1 — camada central (11/07/2026) — **revisada e APROVADA pelo Opus** (ver nota abaixo). Branch reassentada em `origin/main` via rebase (11/07) — não carrega mais o banco-v2.
- [x] Fase 1b — **política config-first estrita** (11/07/2026, pacote `03b`, commit `a76af5ce`) — aplicada. Só o aprovador configurado decide; sem config = `nao_configurado` (endpoint trava e avisa, na Fase 3). Sem cargo/master/override. 1 ou vários aprovadores por fluxo. Exceção: conferência da própria consultora. **Revisada e APROVADA pelo Opus (11/07)** — ver nota abaixo.
- [x] Fase 2 — caracterização + snapshot + mapa de divergências (11/07/2026, pacote `04`, commit `d8f1350f`) — **revisada e APROVADA pelo Opus** (tsc 0, 122 testes). **Mapa (05) VALIDADO pelo Jonathan (11/07)**: 2 iguais, 15 fixes intencionais, 0 regressões; `conferencia_consultora` DECIDIDO = só a própria consultora aprova a dela (é ela conferindo o próprio pedido). Libera a Fase 3.
- [x] Fase 3a — **metal** (compra + recebimento) plugado na camada config-first (11/07/2026, pacote `06`, commit `ad612948`) — **código revisado e APROVADO pelo Opus** (tsc 0, contrato idêntico, escopo fechado; A/B confirmou que os 8 testes que falham no despachante são pré-existentes, não da 3a). **Miolo config-first TESTADO no banco de HOMOLOG** (12/07): `podeDecidir`/`resolverAprovadores` contra dados reais → só o configurado (Alisson) aprova; admin não-configurado (Paloma) e consultora (Cristiane) barrados = FIX confirmado (antes 5 cargos aprovavam). **Falta só o teste end-to-end pela tela** (Jonathan loga e tenta aprovar/rejeitar) — não vai a produção até isso.
- [ ] Fase 3b — conversão (próximo fluxo, ordem do dossiê)
- [ ] Fase 3c — preço (precificação)
- [ ] Fase 3d — limpeza
- [ ] Fase 3e — devolução
- [ ] Fase 3f — compra (comercial)
- [ ] Fase 3g — venda (por último — desconto/cartão/crédito/entrega/alteração)
- [ ] Fase 4 — brechas/atalhos
- [ ] Fase 5 — limites/override
- [ ] Fase 6 — validação

### Fase 3a (metal) — nota pro Opus revisar e testar em homolog

- 7 arquivos tocados, escopo fechado (só metal + os 2 handlers de metal no despachante de
  tarefas): `metal/aprovacoes/[id]/{aprovar,rejeitar}/route.ts` (decisão via `podeDecidir`,
  contrato 403 idêntico), `metal/compras/route.ts` + `lib/metal/compras.ts` (criação via
  `resolverAprovadores`), `metal/recebimentos/route.ts` + `lib/metal/recebimentos.ts` (idem),
  `tarefas/[id]/aprovacao/route.ts` (2 handlers específicos — `processarAprovacaoCompraMetal`
  ganhou o gate `podeDecidir` no início; `recebimento_metal` ganhou o gate no bloco de
  roteamento, antes de chamar o handler — checagem genérica do topo do PATCH, L326-333,
  **intocada**, serve os outros fluxos).
- `npx tsc --noEmit` zero erros. `git status` lista exatamente os 7 arquivos esperados — nada de
  front (`src/components/metal/`, `src/app/(dashboard)/metal/`) nem `GET /api/metal/aprovacoes`
  tocado (regras 5/6 do pacote).
- **Achado tratado com cuidado extra**: o pacote alertou que `compras.ts` e `compras/route.ts`
  liam `metal_aprovador_id` **duas vezes independentes** — risco de divergir se a config mudasse
  entre as duas leituras. Resolvido lendo o aprovador **uma vez só** em `criarCompraMetal`
  (grava em `compras_metal_aprovacoes.aprovador_id`) e fazendo `compras/route.ts` **ler de volta
  esse mesmo valor gravado** (não resolve a config de novo) — fonte única, garantidamente
  consistente. Para `recebimento_metal` não há coluna própria pra guardar o aprovador antes da
  tarefa nascer (`recebimentos_metal` não tem esse campo), então ali a config é lida 2x
  independentes (`recebimentos.ts` só pro guard/erro; `recebimentos/route.ts` pra criar a
  tarefa) — mesma fonte, sem cache, risco de divergência é desprezível na prática; documentado
  no código.
- Regras do pacote respeitadas: (1) contrato idêntico — mensagens de erro, status codes e shape
  de resposta **não mudaram**; (2) erro "aprovador não configurado" preservado com a MESMA
  mensagem de hoje (compra: `"Aprovador de compra de metal acima do teto não configurado."`;
  recebimento: `"Aprovador de metal acima do teto não configurado."`) — registro continua não
  nascendo; (3) **nenhuma chamada a `podeDecidir`/`resolverAprovadores` de metal passa
  `solicitanteId`** — metal não exclui quem cadastrou; (4) `configMulti` — grava sempre o **1º**
  de `aprovadores[]` nas colunas UUID único, decisão valida contra a lista inteira; (5) `GET
  /api/metal/aprovacoes` intocado — fila continua visível por `ROLES_METAL_APROVACOES`; (6)
  zero arquivo de front tocado.
- **Cenários pra validar em homolog** (C1-C6, descritos no pacote `06`): aprovador configurado
  aprova; outro usuário (mesmo admin) leva 403; sem config a compra/recebimento não nasce
  (mesma mensagem); config com 2 UUIDs — ambos aprovam, terceiro não; recebimento só pela tela
  de Tarefas (sem endpoint dedicado); rejeitar segue a mesma regra de quem pode.

**Não subi pra homolog nem testei back/front** — commit pronto, a validação (SQL + tela, com o
Jonathan) é do Opus antes de avançar pra Fase 3b.

### Fase 2 — nota pro Opus revisar (mapa de divergências é com o Jonathan)

- 3 arquivos novos, escopo fechado (`src/lib/aprovacoes/__tests__/` + `docs/`):
  `__tests__/caracterizacao-catalogo.test.ts` (table-driven, 17 eventos normais × 4 invariantes +
  casos especiais de `conferencia_consultora`/`devolucao`/`limpeza_ouro` — 75 testes),
  `__tests__/catalogo.snapshot.test.ts` (snapshot explícito inline dos 18 eventos + guarda
  anti-regressão — 24 testes), e `05-divergencias-alvo-x-atual.md`.
  `npx tsc --noEmit` zero erros. `npx vitest run src/lib/aprovacoes` **122/122 passando** (3
  arquivos: 23+24+75). `git status` limpo fora do escopo; nada plugado.
- **`05-divergencias-alvo-x-atual.md`** (o entregável que importa pro Jonathan): 18 linhas com
  veredito + `arquivo:linha`. Resultado: **2 🟢 IGUAL** (`entrega_sem_pagamento`, `limpeza_ouro` —
  já eram config-only hoje), **16 🔵 FIX INTENCIONAL**, **0 🔴 regressão identificada pelo Sonnet**.
  Achados que valem destaque:
  - `desconto`/`cartao_desconto`: a config (`aprovador_desconto_padrao`/`_cartao_...`) existe na
    tela mas **não é lida em nenhuma das portas hoje** — puramente decorativa.
  - `compra_metal`/`recebimento_metal`: hoje a decisão **ignora** `metal_aprovador_id` — qualquer
    um de 5 cargos (inclusive "qualquer consultora") aprova.
  - `auditoria`: hoje é `void user` — zero checagem. Vira o mais rígido, era o mais aberto.
  - `desconto` carrega o bug do R3 (dossiê): a porta `solicitacoes-desconto` nunca grava
    `vendas_erp.desconto_aprovado_por` — a Fase 3 corrige isso de brinde ao unificar.
  - `compra_comercial`: destacado que o endpoint `concluir` (zero checagem, `void user`) **não é
    coberto por nenhum dos 18 eventos** — brecha fora do escopo desta centralização.
  - **⚠️ Atenção pedida ao Jonathan em `conferencia_consultora`**: hoje gerência
    (`gerente_loja`/`gerente_fabrica`) e admin/dev/diretor também podem aprovar a conferência de
    QUALQUER consultora; no alvo, só a própria consultora decide a dela — gerência perde esse
    caminho por completo. Marcado 🔵 mas com pedido explícito de confirmação (pode ser 🔴 se
    gerência usa isso na prática).
  - Checklist de **5 chaves de config novas** (nenhuma existe ainda em `configuracoes_sistema`):
    `aprovador_conversao`, `aprovador_conversao_sku`, `aprovador_precificacao`,
    `aprovador_auditoria`, `aprovador_alteracao_venda` — sem elas, o evento trava assim que
    plugado na Fase 3.
- Duas verificações pontuais feitas nesta fase que o dossiê não detalhava (citadas no mapa):
  fallback por cargo em `credito_gerente`/`credito_diretor` (`vendas-credito-aprovar.ts:83-140`)
  e o bypass permanente de admin em `devolver_peca` mesmo com config preenchida
  (`devolver-peca/route.ts:41-45`). Um ponto ficou `⚠️ conferir` (não inventado): não achei no
  código onde `aprovador_cartao_desconto_padrao` seria lido hoje — mesmo padrão decorativo do
  desconto, a confirmar na Fase 3.

**Não avancei pra Fase 3.** A revisão técnica é do Opus; a aprovação do mapa de divergências
(caso a caso, especialmente `conferencia_consultora`) é do Jonathan.

### Fase 1b — nota pro Opus revisar

- `src/lib/aprovacoes/` reescrito (`tipos.ts`, `catalogo.ts`, `autoridade.ts`, `index.ts`,
  `__tests__/autoridade.test.ts`); `override-log.ts` **removido** (não há mais override).
  `npx tsc --noEmit` zero erros. 23 testes unitários passando
  (`npx vitest run src/lib/aprovacoes`). `git status` confirma: nada fora de
  `src/lib/aprovacoes/` foi tocado; nenhum import em `src/app/`/`src/components/`.
- Removidos por completo: `rolesFallback`, `permiteOverrideAdmin`, `ACESSO_PLENO`,
  `buscarCandidatosPorRole`, `getMasterAdminId`, `registrarOverride` — guarda anti-regressão
  no teste confirma que a API antiga não é mais exportada.
- `RegraAutoridade` agora só tem `configKeys`/`configMulti`/`solicitantePodeAprovar`/
  `camposLock`/`observacao`. `ResolucaoAprovador` é a union `{status:"ok", aprovadores, origem}`
  `| {status:"nao_configurado", evento, configKeys}` — a Fase 3, ao plugar, usa isso pra decidir
  se cria a tarefa (`ok`) ou responde 409 com a mensagem pra Configurações (`nao_configurado`).
- 5 chaves de config NOVAS declaradas no catálogo (ainda não existem em
  `configuracoes_sistema` — criação via `/dba` fica pra Fase 3): `aprovador_conversao`,
  `aprovador_conversao_sku`, `aprovador_alteracao_venda`, `aprovador_precificacao`,
  `aprovador_auditoria`. Até lá esses 5 eventos sempre resolvem `nao_configurado` — é o
  comportamento correto e esperado (não escolhe ninguém por engano).
- `podeDecidir` mudou de assinatura: não recebe mais a tarefa (`aprovadorId` snapshot) —
  re-resolve a config **agora**, na hora da decisão, e checa se o `user` está na lista atual.
  Efeito colateral OK: se alguém tirar o aprovador da config depois da tarefa criada, quem
  decidir precisa estar na lista de HOJE, não na de quando a tarefa nasceu.
- Nenhuma dívida nova pendente desta fase (as duas dívidas menores da Fase 1
  — override-log sem registroId; ordem de checagem em avaliarDecisao num caso raro — **caíram
  junto com o override**, que não existe mais).

### Revisão do Opus (11/07) — Fase 1b APROVADA

Verificação objetiva (worktree, sobre a main): `npx tsc --noEmit` **0 erros**; `npx vitest run
src/lib/aprovacoes` **23/23 passando**; `override-log.ts` removido; guarda anti-regressão confirma que
`ACESSO_PLENO`/`rolesFallback`/`permiteOverrideAdmin`/`buscarCandidatosPorRole`/`getMasterAdminId`/`registrarOverride`
não voltam; nenhum import de `@/lib/aprovacoes` em `src/app`/`src/components`; `git status` limpo fora de
`src/lib/aprovacoes/`. Catálogo: 18 eventos config-first, 5 chaves novas corretas, `conferencia_consultora`
a única exceção. Lógica fiel à decisão: só o configurado decide; config vazia → `nao_configurado`;
multi-aprovador via split por vírgula; `podeDecidir` re-resolve a config atual (não snapshot). **Nenhum
achado bloqueante — liberada a Fase 2.**

Nota pra Fase 3 (não bloqueia): a exclusão do solicitante e o multi-split vivem nos wrappers async (I/O),
não cobertos por teste unitário — serão exercidos na caracterização/integração contra homolog. E o `ctx`
(solicitanteId, foraPrazo, consultoraVendedorId) tem que ser montado certo pelo endpoint ao plugar.

### Fase 1 — nota pro Opus revisar

- `src/lib/aprovacoes/` criado (tipos, catálogo dos 18 eventos, autoridade — puras + wrappers
  async, override-log, testes). `npx tsc --noEmit` zero erros. 16 testes unitários passando
  (`npx vitest run src/lib/aprovacoes`). `git status` confirma: nada fora de
  `src/lib/aprovacoes/` foi tocado; nenhum import em `src/app/`/`src/components/`.
- 2 desvios do pacote, decididos por não poder tocar arquivo fora do escopo (reportar se
  quiser outra decisão):
  1. `ROLES_ESTOQUE` (evento `devolver_peca`) não está exportada em `src/lib/roles.ts` —
     só existe como const local em
     `src/app/api/crediario/reserva/[vendaId]/devolver-peca/route.ts`. Replicada em
     `catalogo.ts` como `ROLES_ESTOQUE_DEVOLVER_PECA`, com comentário explicando. Avaliar
     promover pra `roles.ts` quando a Fase 3 migrar esse endpoint.
  2. `logAudit` (`src/lib/audit.ts`) só aceita `operacao: 'INSERT'|'UPDATE'|'DELETE'` — não
     tem `'APROVACAO_OVERRIDE'` como o pacote pedia. `registrarOverride` usa
     `operacao:'INSERT'` e coloca a marca em `dados_depois.tipo_operacao`. Avaliar na Fase 5
     se vale estender o union de `audit.ts`.
- Worktree usado: `/home/jonathan_arajo/projetos/alissonerp-wt-centralizar-aprovacoes`
  (`node_modules` é um symlink local pro repo principal — não commitado, `.gitignore` já cobre).

### Revisão do Opus (11/07) — Fase 1 APROVADA

Verificação objetiva (rodada em cima da `main`, pós-rebase): `npx tsc --noEmit` **0 erros**; `npx vitest
run src/lib/aprovacoes` **16/16 passando**; nenhum import de `@/lib/aprovacoes` em `src/app`/`src/components`;
`git status` limpo fora de `src/lib/aprovacoes/`; `ACESSO_PLENO` única; 18 eventos no catálogo (testados
exaustivamente); `limpeza_ouro` rígido correto. Os 2 desvios reportados pelo Sonnet (ROLES_ESTOQUE não
exportada; `logAudit` sem `APROVACAO_OVERRIDE`) são aceitáveis na Fase 1 → viram itens de Fase 3/5.

**1 achado que precisa sair antes da Fase 2:** a escolha do aprovador por cargo
(`buscarCandidatosPorRole` sem `ORDER BY` + `escolherAprovador` pegando `[0]`) é não-determinística e não
respeita a precedência de `rolesFallback` (ex.: crédito de gerente podendo ir pra um admin).

**Decisão do Jonathan (11/07) — foi além do determinismo:** o fallback por cargo é a raiz do problema
("o sistema segue a role, não a config"), então ele decidiu **eliminá-lo**. A camada passa a ser
**config-first estrita** (pacote `03b-config-first-estrito`): só o aprovador configurado decide; sem
config, trava e avisa pra configurar; sem cargo/master/override; 1 ou vários aprovadores por fluxo;
exceção só na conferência da própria consultora. Isso torna o determinismo do fallback irrelevante (não
há mais fallback). O antigo pacote `03b-FIX-A1-determinismo` foi **cancelado**.

Dívidas menores anotadas (não bloqueiam): override-log não recebe o `registroId` do objeto (venda/tarefa)
— resolver na Fase 3 ao plugar; ordem de checagem em `avaliarDecisao` num caso raro (sem designado + `ACESSO_PLENO`
também no fallback) registra override "espúrio" — ajustável junto do A1 se quiser.
