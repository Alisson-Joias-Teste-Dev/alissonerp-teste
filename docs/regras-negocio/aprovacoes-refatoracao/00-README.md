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
- [x] Fase 1b — **política config-first estrita** (11/07/2026, pacote `03b`, commit `a76af5ce`) — aplicada. Só o aprovador configurado decide; sem config = `nao_configurado` (endpoint trava e avisa, na Fase 3). Sem cargo/master/override. 1 ou vários aprovadores por fluxo. Exceção: conferência da própria consultora. **Aguardando revisão do Opus antes da Fase 2.**
- [ ] Fase 2 — golden tests (pacote `04`, roda **após** a revisão da `03b`)
- [ ] Fase 3 — migração
- [ ] Fase 4 — brechas/atalhos
- [ ] Fase 5 — limites/override
- [ ] Fase 6 — validação

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
