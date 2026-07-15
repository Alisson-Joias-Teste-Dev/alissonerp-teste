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
| 07 | [`07-FASE-3b-conversao.md`](07-FASE-3b-conversao.md) | **Pacote da Fase 3b** — plugar conversão (estoque + SKU) na camada config-first; 1 chave só (`aprovador_conversao`), decisão do Jonathan |
| 08 | [`08-FASE-3c-precificacao.md`](08-FASE-3c-precificacao.md) | **Pacote da Fase 3c** — plugar precificação (markup) na camada config-first; modelo metal + ajuste do botão da tela; chave `aprovador_precificacao` |
| 09 | [`09-FASE-3d-limpeza.md`](09-FASE-3d-limpeza.md) | **Pacote da Fase 3d** — limpeza de ouro: já é config-first, só trocar a validação manual pela camada (1 arquivo, ~6 linhas); ganha multi-aprovador |
| 10 | [`10-FASE-3e-devolucao.md`](10-FASE-3e-devolucao.md) | **Pacote da Fase 3e** — devolução (2 etapas: devolução + estoque) na camada config-first; **1 aprovador** (decisão do Jonathan, sem distinção de prazo); chave nova `aprovador_devolucao` |
| 11 | [`11-FASE-3f-compra-comercial.md`](11-FASE-3f-compra-comercial.md) | **Pacote da Fase 3f** — compra comercial na camada config-first (2 arquivos: gate no despachante + criação); chave `aprovador_compra_comercial` já existe. Brecha do concluir + R4 (duplicação conta a pagar) = Fase 4 |
| 12 | [`12-FASE-3g-venda-plano.md`](12-FASE-3g-venda-plano.md) | **PLANO da Fase 3g (venda)** — mapa dos 6 eventos + fatiamento em 3 sub-fases + decisões (crédito = 2; desconto só porta oficial) + fronteira 3g/4/5 |
| 13 | [`13-FASE-3g1-entrega-alteracao.md`](13-FASE-3g1-entrega-alteracao.md) | **Pacote da Fase 3g.1** — entrega sem pagamento (só o gate) + alteração de venda (troca cargo por config; chave nova `aprovador_alteracao_venda`) |
| 14 | [`14-FASE-3g2-credito.md`](14-FASE-3g2-credito.md) | **Pacote da Fase 3g.2** — crédito/A Receber (gerente + diretor, 2 aprovadores) na camada config-first; submissão + decisão; chaves já existem |
| 15 | [`15-FASE-3g3-desconto-cartao.md`](15-FASE-3g3-desconto-cartao.md) | **Pacote da Fase 3g.3** — desconto + cartão (SÓ a porta oficial via tarefa) na camada config-first; atalhos/comissão/campo = Fase 4 |

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
- [x] Fase 3a — **metal** (compra + recebimento) plugado na camada config-first (11/07/2026, pacote `06`, commit `ad612948`) — **código revisado e APROVADO pelo Opus** (tsc 0, contrato idêntico, escopo fechado; A/B confirmou que os 8 testes que falham no despachante são pré-existentes, não da 3a). **Miolo config-first TESTADO no banco de HOMOLOG** (12/07): `podeDecidir`/`resolverAprovadores` contra dados reais → só o configurado (Alisson) aprova; admin não-configurado (Paloma) e consultora (Cristiane) barrados = FIX confirmado (antes 5 cargos aprovavam). **Endpoint HTTP TESTADO end-to-end contra homolog** (12/07): `POST /api/metal/aprovacoes/[id]/aprovar` → Alisson (configurado) 200 + `aprovarCompra` chamado; Paloma (admin não-config) e Cristiane (consultora) 403 + `aprovarCompra` NUNCA chamado. Login mockado (não posso digitar senha do Jonathan) + efeito mockado (não sujou homolog); `sql` e `podeDecidir` REAIS. Rejeitar = mesmo gate (copy do aprovar). **Fase 3a FECHADA** — não vai a produção até o merge do Jonathan.
- [x] Fase 3b — **conversão** (estoque + SKU) plugada na camada config-first (12/07/2026, pacote
  `07`, commit `c0672e04`) — **código revisado e APROVADO pelo Opus** (tsc 0, 122 testes, contrato
  idêntico, escopo fechado; despachante e front de conversão intocados; chave antiga
  `aprovador_conversao_sku` some — 1 chave só). **TESTADO end-to-end em HOMOLOG** (12/07): chave
  `aprovador_conversao` criada (= Alisson); miolo — Alisson pode / Jonathan (dev) não, nos 2
  sub-fluxos com a MESMA chave; `POST /api/conversao/aprovar` — Jonathan (dev) 403, Alisson passa o
  gate (404 da tarefa-fake, não 403); SEM a chave → `nao_configurado` (conversão não nasceria, 409).
  **Fase 3b FECHADA.** ⚠️ **PRA PROD**: criar a chave `aprovador_conversao` (via `/dba`, assinada) e
  preencher ANTES de mergear/deployar — senão a conversão trava em produção. (A chave já existe em
  homolog, preenchida.)
- [x] Fase 3c — **precificação** (markup) plugada na camada config-first (12/07/2026, pacote
  `08`, commit `65dde11a`) — **código revisado e APROVADO pelo Opus** (tsc 0, 122 testes, contrato
  idêntico, strings de 403 preservadas; despachante e `pendentes` intocados; modelo metal). Botão
  "Aprovar" da tela agora reflete `podeDecidir` (server component `page.tsx` computa e passa prop —
  sem regressão de UX). **TESTADO end-to-end em HOMOLOG** (12/07): chave `aprovador_precificacao`
  criada (= Alisson); miolo — Alisson pode / Jonathan (dev) não; `POST /api/precificacao/aprovar` —
  Jonathan 403, Alisson passa o gate (404 da alteração-fake); sem a chave → `nao_configurado`
  (solicitar markup daria 409). **Fase 3c FECHADA.** ⚠️ **PRA PROD**: criar `aprovador_precificacao`
  (via `/dba`, assinada) antes de deployar. (Já existe em homolog.)
- [x] Fase 3d — limpeza — **código plugado (pelo Opus) e revisado** (commit `c951cc7f`; tsc 0, 122 testes, 1 arquivo `limpeza-ouro-aprovacao.ts`, contrato idêntico — 2 erros 409/403 preservados; ganha multi-aprovador). **TESTADO end-to-end em HOMOLOG** (12/07, após o homolog voltar): `aprovador_limpeza` = Alisson; miolo — Alisson pode / Jonathan (dev) não; `POST /api/purificacao/limpeza/aprovacao` → Jonathan 403 (msg "Apenas o aprovador configurado..." preservada), Alisson passa o gate (404 da baixa-fake). **Fase 3d FECHADA.** `aprovador_limpeza` já existe (não precisa criar em prod).
- [x] Fase 3e — **devolução** (2 etapas: devolução + estoque) plugada na camada config-first
  (12/07/2026, pacote `10`, commit `2602ceab`) — **código revisado e APROVADO pelo Opus** (tsc 0,
  121 testes; 14 arquivos; `foraPrazo` totalmente removido da camada; 2 gates `podeDecidir` no
  despachante; criação por `resolverAprovadores` sem fallback; `HttpError` propaga o 409 "não
  configurado" pros endpoints, checado antes do catch-all — contrato idêntico; tela de devolução e
  `prazo-devolucao.ts` intocados). **TESTADO em HOMOLOG** (13/07): chaves criadas; miolo das 2
  etapas — Alisson (configurado) pode / Jonathan (dev) não; sem config → `nao_configurado` (409).
  Descoberta: `aprovador_devolucao_estoque` já existia em homolog (= Jonathan) — restaurado após o
  teste; `aprovador_devolucao` (nova) = Alisson em homolog. **Fase 3e FECHADA.** ⚠️ PRA PROD: criar
  `aprovador_devolucao` via `/dba` antes de deployar (`aprovador_devolucao_estoque` já existe).
- [x] Fase 3f — **compra comercial** plugada na camada config-first (12/07/2026, pacote `11`,
  commit `d5242037`) — **código revisado e APROVADO pelo Opus** (tsc 0, 121 testes; só 2 arquivos
  — gate `podeDecidir` no despachante + criação por `resolverAprovadores`; camada/front/config-UI
  intocados; 409 "Nenhum aprovador configurado para compra comercial" preservado; removida a
  checagem de "ativo" que virou código morto). **TESTADO em HOMOLOG** (13/07): a chave já estava
  configurada = Jonathan → miolo mostrou Jonathan pode / Alisson não; troquei p/ Alisson → inverteu;
  restaurei o valor original (Jonathan). Prova de que a autoridade é 100% a config. **Fase 3f
  FECHADA.** `aprovador_compra_comercial` já existe (não precisa criar em prod). (Brecha do
  `concluir` void user + R4 duplicação conta a pagar = Fase 4.)
- [x] Fase 3g — **venda** (a mais crítica, por último) — mapeada e fatiada em 3 sub-fases (plano `12`). Decisões do Jonathan (12/07): crédito mantém 2 aprovadores (gerente/diretor); desconto migra só a porta oficial (atalhos/comissão = Fase 4). **As 3 sub-fases (3g.1, 3g.2, 3g.3) estão codadas — migração da venda pra config-first FECHADA no código.** Aguardando Opus revisar/criar chaves/testar 3g.3 em homolog (3g.1/3g.2 já testadas).
  - [x] 3g.1 — **entrega sem pagamento + alteração de venda** plugadas na camada config-first
    (15/07/2026, pacote `13`, commit `2d236264`) — **REVISADA e APROVADA pelo Opus** (gates corretos,
    403 idêntico, `approveVenda`/camada intocados) + **TESTADA em HOMOLOG (15/07)**: entrega (=Alisson)
    só o configurado decide; `alteracao_venda` sem a chave → todos 403, com a chave `aprovador_alteracao_venda`
    (=Alisson) → Alisson pode / Jonathan (dev) não. **3g.1 FECHADA.** ⚠️ PRA PROD: criar
    `aprovador_alteracao_venda` via `/dba`. — tsc 0, 121/121 testes (camada intocada, nenhum
    teste mudou). 6 arquivos: gate `podeDecidir` no bloco `entrega_sem_pagamento` do despachante
    (`tarefas/[id]/aprovacao/route.ts`, antes do `try`) + submissão trocada por `resolverAprovadores`
    em `entrega-sem-pagamento.ts` (mesma mensagem de erro); gate `podeDecidir('alteracao_venda')` no
    topo do PATCH `vendas/solicitacoes-alteracao/[id]/route.ts` (no lugar de `ROLES_FINANCEIRO`,
    removido — sem outro uso no arquivo); chave nova `aprovador_alteracao_venda` exposta em
    `configuracoes/aprovadores/route.ts` (CHAVES+GET+PUT) e na UI (`ListaAprovadores.tsx`, reusa a
    lista `diretores_admins` — mesmo conjunto de cargos do antigo `ROLES_FINANCEIRO`). Escopo
    fechado: `approveVenda`/`estornarVenda`, efeitos das solicitações, guard genérico do despachante
    (L342) e `src/lib/aprovacoes/` intocados. Aguardando Opus criar a chave em homolog e testar.
  - [x] 3g.2 — **crédito** (gerente + diretor) plugado na camada config-first
    (15/07/2026, pacote `14`, commit `e319078c`) — **REVISADA e APROVADA pelo Opus** (submissão troca
    os 2 fallbacks por `resolverAprovadores`, regra de saldo mantida como roteamento; decisão mapeia o
    evento pelo `aprovacao_credito_tipo`; 409 tratado no endpoint; efeitos/`approveVenda`/camada intocados;
    tsc 0, 121 testes). **TESTADA em HOMOLOG (15/07)**: as 2 chaves têm aprovadores DIFERENTES
    (gerente=d1f11f68, diretor=01ab44ed) → só o configurado de cada uma decide; Alisson e Jonathan (dev)
    403 nos dois; setei ambas=Alisson → passou; restaurei os originais. **3g.2 FECHADA.** — submissão e
    decisão migradas juntas. Chaves `aprovadora_credito_gerente`/`aprovador_credito_diretor` **já existiam**
    (nenhuma chave nova). `npx tsc --noEmit` 0 erros; `npx vitest run src/lib/aprovacoes` 121/121
    (camada intocada). 3 arquivos: `vendas-credito-aprovar.ts` (submissão — os 2 blocos de fallback
    por cargo viraram `resolverAprovadores(tipo==="diretor"?"credito_diretor":"credito_gerente")`;
    `nao_configurado` → `HttpError(409, ...)`, reusando a classe já exportada por `devolucoes.ts`);
    despachante `tarefas/[id]/aprovacao/route.ts` (gate `podeDecidir` no bloco `isCreditoReal`,
    mapeando o evento por `tarefaInfo.aprovacao_credito_tipo`); `vendas/[id]/solicitar-aprovacao/
    route.ts` (catch com `instanceof HttpError` antes do `internalError`, pro 409 chegar ao front
    com a mensagem certa — mesmo padrão da Fase 3e). Aguardando Opus revisar e criar cenário de
    teste em homolog.
  - [x] 3g.3 — **desconto + cartão** (porta oficial, via tarefa) plugados na camada config-first
    (15/07/2026, pacote `15`, commit pendente) — 2 gates `podeDecidir` no despachante (handlers
    `cartao_desconto` e `desconto_acima`); criação por `resolverAprovadores` em
    `criarTarefaAprovacao` (`aprovacao-regras.ts`), mapeando `regra.tipo_evento` pro evento
    (`cartao_desconto`/`desconto`); `nao_configurado` → `HttpError(409, ...)` tratado nos 2 blocos
    (desconto e cartão) de `solicitar-aprovacao/route.ts`, mesmo padrão da 3g.2. Atalhos
    (`aprovar-desconto`, `solicitacoes-desconto`), comissão e campos canônicos intocados (Fase 4).
    `npx tsc --noEmit` 0 erros; `npx vitest run src/lib/aprovacoes` 121/121 (camada intocada).
    **Fecha a migração da Fase 3g (venda) no código.** Aguardando Opus revisar, criar/preencher
    `aprovador_desconto_padrao`/`aprovador_cartao_desconto_padrao` (hoje decorativas — precisam de
    valor ANTES de testar, senão tudo trava em 409/403) e testar em homolog.
- [ ] Fase 4 — brechas/atalhos
- [ ] Fase 5 — limites/override
- [ ] Fase 6 — validação

### Fase 3g.3 (desconto + cartão) — nota pro Opus revisar e testar em homolog

- **Alcance confirmado ANTES de mexer** (pedido pelo pacote): `grep -rn "criarTarefaAprovacao\|encontrarAprovador" src`
  — as duas só aparecem em `src/lib/aprovacao-regras.ts` (definição + export) e em
  `src/app/api/vendas/[id]/solicitar-aprovacao/route.ts` (import + as 2 chamadas de
  `criarTarefaAprovacao`, tipo `desconto`/`cartao_desconto`). Nenhum outro fluxo usa — seguro trocar
  a resolução do aprovador sem afetar mais nada.
- **3 arquivos tocados**, escopo fechado exatamente como o pacote pediu:
  - **Decisão** — despachante `src/app/api/tarefas/[id]/aprovacao/route.ts`: gate `podeDecidir`
    adicionado na entrada dos 2 blocos, antes de qualquer `UPDATE`/log:
    - bloco `cartao_desconto` (linha 437 antes da mudança, agora ~444):
      `podeDecidir({id:user.id, role:usuarioLogado?.role??null}, "cartao_desconto")` → 403 "Sem
      permissão" se `!pode`.
    - bloco `desconto_acima` (linha 487 antes da mudança, agora ~501):
      `podeDecidir(..., "desconto")` → mesmo 403.
    Sem `ctx.solicitanteId` (como o pacote pediu). Guard genérico do topo do PATCH (~L342, "Somente
    o aprovador pode responder" + `isAdminOuDev`) **intocado** — o gate config-first é adicional,
    dentro de cada bloco, igual às fases anteriores.
  - **Criação** — `src/lib/aprovacao-regras.ts`, função `criarTarefaAprovacao` (~L133): a chamada a
    `encontrarAprovador` foi substituída por:
    ```ts
    const eventoAprovacao = regra.tipo_evento === "cartao_desconto" ? "cartao_desconto" : "desconto";
    const resol = await resolverAprovadores(eventoAprovacao);
    if (resol.status === "nao_configurado") {
      throw new HttpError(409, "Aprovador de desconto não configurado. Defina em Configurações › Aprovadores.");
    }
    const aprovadorId = resol.aprovadores[0];
    ```
    `HttpError` importada de `@/lib/devolucoes` (reusada, não duplicada — mesmo padrão da 3g.2; sem
    import circular, `devolucoes.ts` não importa `aprovacao-regras.ts`). O resto de
    `criarTarefaAprovacao` (template, tags, `INSERT tarefas`/`aprovacoes_tarefa`, notificação)
    **intocado** — só a origem do `aprovadorId` mudou. `avaliarRegras`/`getDescontoThreshold`
    **não tocados** (threshold é Fase 5). `encontrarAprovador` ficou **sem uso** dentro do arquivo
    mas **não foi removida** (continua exportada), como o pacote mandou.
  - **409 tratado no endpoint** — `src/app/api/vendas/[id]/solicitar-aprovacao/route.ts`: as 2
    chamadas a `criarTarefaAprovacao` (tipo `desconto` ~L140, tipo `cartao_desconto` ~L213) **não
    tinham try/catch** (diferente do bloco de crédito, que já tinha). Como `criarTarefaAprovacao`
    agora pode lançar `HttpError`, adicionei `try/catch` em volta das duas chamadas — `instanceof
    HttpError` → `NextResponse.json({error: err.message}, {status: err.status})` (409 chega ao
    front com a mensagem certa); qualquer outro erro cai no `internalError` genérico (contrato
    idêntico ao que já existia pros demais erros). `HttpError` já estava importada no topo do
    arquivo (usada pelo crédito, 3g.2) — reusei o mesmo import.
- **Desvio pequeno, não previsto explicitamente no pacote**: o pacote descrevia o `criarTarefaAprovacao`
  lançando `HttpError` mas não mencionava que as 2 chamadas no `solicitar-aprovacao/route.ts` não
  tinham `try/catch` (só o bloco de crédito tinha). Sem adicionar o `try/catch`, o `throw` do 409
  vazaria como exceção não tratada (Next devolveria 500 genérico, não o 409 com mensagem). Segui o
  mesmo padrão já usado no crédito (3g.2) — não é um desvio de arquitetura, só um ajuste necessário
  pro contrato prometido ("409 chega ao front") realmente funcionar.
- **`npx tsc --noEmit` 0 erros.** `npx vitest run src/lib/aprovacoes` **121/121 passando** (nada da
  camada mudou, mesma contagem da 3g.1/3g.2). `git status` lista exatamente os 3 arquivos esperados:
  despachante, `aprovacao-regras.ts`, `solicitar-aprovacao/route.ts`. Não aparecem `aprovar-desconto`,
  `solicitacoes-desconto`, nem arquivos de comissão.
- **Sanity check extra** (não pedido pelo pacote, rodado por ter tocado `solicitar-aprovacao/route.ts`
  e `aprovacao-regras.ts`): `npx vitest run src/__tests__/aprovacao-desconto.test.ts
  src/__tests__/solicitar-aprovacao-desconto.test.ts src/__tests__/desconto-logica.test.ts` — baseline
  (via `git stash`) já tinha **10 falhas pré-existentes** nesses 3 arquivos (mocks presos em
  `encontrarAprovador`/admin fallback, nada a ver com esta fase). Depois da mudança: **11 falhas**.
  Investiguei a diferença (`diff` teste a teste): é **1 único teste** que muda de status —
  `solicitar-aprovacao-desconto.test.ts > "retorna 409 quando venda não está em rascunho"` — passava
  antes, falha depois. **Rodei esse teste sozinho (`-t`) e ele PASSA** — confirma que é **poluição de
  mock entre testes** (o arquivo usa `mockResolvedValueOnce` em fila; `vi.clearAllMocks()` no
  `beforeEach` limpa histórico de chamadas mas **não** esvazia a fila de valores "once" não
  consumidos; o teste anterior, "fluxo completo: cria tarefa de aprovação de desconto", já falhava
  no baseline e passou a falhar em outro *ponto* da função depois da minha mudança — consumindo um
  número diferente de mocks da fila — o que empurra valores sobrando pro teste seguinte). **Não é
  regressão de código**: a rota em si não mudou a ordem/posição do check de `situacao !== "rascunho"`
  (ele continua ANTES de qualquer código tocado nesta fase) — só o teste tem uma fragilidade
  pré-existente de isolamento. Reporto porque o pacote pede transparência total, mas não é bloqueante
  pros critérios de aceite (que são tsc + `vitest run src/lib/aprovacoes`, ambos verdes).
- **Não toquei**: porta (b) `aprovar-desconto`, porta (c) `solicitacoes-desconto`, o efeito de
  comissão ao aprovar (recálculo por `faixas_comissao`), `desconto_aprovado_por`/
  `desconto_cartao_aprovado_por`, `approveVenda`, a trava R3, `getDescontoThreshold`, `avaliarRegras`,
  o guard genérico L342, a camada `src/lib/aprovacoes/`. Nenhum DDL/DML/migration.

**Cenários pra validar em homolog** (pacote `15`): `aprovador_desconto_padrao` = X → X decide desconto
(via tarefa); Y → 403; sem a chave → 409 na criação (solicitar aprovação tipo=desconto).
`aprovador_cartao_desconto_padrao` = X → idem cartão. **As 2 chaves são hoje decorativas — precisam
ser criadas/preenchidas em homolog ANTES de testar, senão tudo trava em 409 na criação** (igual ao
aviso do pacote).

**Não subi pra homolog nem testei back/front** — commit pronto, a criação das 2 chaves + validação
(SQL + tela, com o Jonathan) é do Opus. Esta é a última sub-fase da Fase 3g (venda) — fecha a
migração fluxo-a-fluxo da Fase 3 inteira (metal → conversão → preço → limpeza → devolução → compra →
venda), restando só a Fase 4 (brechas/atalhos), Fase 5 (limites/override) e Fase 6 (validação).

### Fase 3g.2 (crédito) — nota pro Opus revisar e testar em homolog

- 3 arquivos tocados, escopo fechado (submissão + gate no despachante + o catch do endpoint que
  precisou do `HttpError`) — **nem a camada `src/lib/aprovacoes/`, nem `processarAprovacaoCredito`
  (efeito), nem `approveVenda`/`estornarVenda`, nem a coluna `aprovacao_credito_tipo`** foram
  tocados, como pedido:
  - **Submissão** (`src/lib/vendas-credito-aprovar.ts`, `submeterVendaParaAprovacaoCredito`):
    **mantida** a regra de saldo que decide o `tipo` (`getSaldoDisponivel`, ~L101-102) — é
    roteamento puro, não muda. **Trocados** os 2 blocos de resolução do aprovador (config + fallback
    por cargo, um pra gerente outro pra diretor) por uma chamada só:
    `resolverAprovadores(tipo === "diretor" ? "credito_diretor" : "credito_gerente")`. Sem
    `ctx.solicitanteId` (crédito não exclui quem solicitou, igual ao pacote pediu).
    `nao_configurado` → `throw new HttpError(409, "Aprovador de crédito (<tipo>) não configurado.
    Defina em Configurações › Aprovadores.")`. **Mantido** intocado o resto: gravação de
    `aprovacao_credito_tipo`/`aprovacao_credito_tarefa_id` na venda, criação de `tarefas`
    (tags `['credito_loja', tipo]`) e `aprovacoes_tarefa` — só o `aprovadorId` passa a vir de
    `resolverAprovadores` (grava o 1º da lista, igual ao padrão dos outros fluxos multi-aprovador).
  - **`HttpError` reusada, não duplicada**: a classe já estava exportada por `devolucoes.ts` desde a
    Fase 3e (comentário no código já dizia "mesmo padrão usado em outras rotas") — importei de lá em
    vez de criar uma equivalente nova, como o pacote autorizou ("reuse a de devolucoes.ts se já
    exportada"). Não há import circular (`devolucoes.ts` não importa `vendas-credito-aprovar.ts`).
  - **Decisão** (despachante `src/app/api/tarefas/[id]/aprovacao/route.ts`, bloco `isCreditoReal`,
    ~L570-591 após a mudança): antes de chamar `processarAprovacaoCredito`, adicionado
    `const eventoCredito = tarefaInfo?.aprovacao_credito_tipo === "diretor" ? "credito_diretor" :
    "credito_gerente"; const decCredito = await podeDecidir({id:user.id, role:usuarioLogado?.role ??
    null}, eventoCredito); if (!decCredito.pode) return 403 "Sem permissão";` — espelha exatamente o
    padrão dos gates de `devolucao`/`devolucao_estoque`/`compra_comercial`/`recebimento_metal` já
    plugados nas fases anteriores. **Guard genérico do topo do PATCH (~L342, "Somente o aprovador
    pode responder" + `isAdminOuDev`) intocado** — o gate config-first é adicional, roda depois,
    dentro do bloco específico de crédito, igual às fases anteriores.
  - **Contrato do 409 preservado**: `vendas/[id]/solicitar-aprovacao/route.ts` usava
    `internalError(...)` no catch de `submeterVendaParaAprovacaoCredito` — que **nunca** expõe
    `err.message` (é o padrão do projeto pra não vazar erro interno). Sem tratar o `HttpError`
    antes, a mensagem "Aprovador de crédito (...) não configurado..." nunca chegaria ao front — só
    um "Erro interno" genérico 500. Resolvido com `if (err instanceof HttpError) return
    NextResponse.json({error: err.message}, {status: err.status})` **antes** do `internalError`,
    exatamente o mesmo padrão que a Fase 3e usou em `devolucoes/[id]/solicitar-aprovacao/route.ts`.
  - **Nenhum desvio do pacote.** As 2 chaves de config (`aprovadora_credito_gerente`,
    `aprovador_credito_diretor`) e as entradas `credito_gerente`/`credito_diretor` no catálogo **já
    existiam** desde a Fase 1b — não precisou criar chave nova nem mexer no banco/config-UI.
  - `npx tsc --noEmit` zero erros. `npx vitest run src/lib/aprovacoes` **121/121 passando** (nada da
    camada mudou, mesma contagem da Fase 3f/3g.1). `git status` lista exatamente os 3 arquivos
    esperados: `vendas-credito-aprovar.ts`, despachante, `vendas/[id]/solicitar-aprovacao/route.ts`.
  - **Sanity check extra** (não pedido pelo pacote, rodado por precaução por ter tocado
    `solicitar-aprovacao/route.ts`): `npx vitest run src/__tests__/submeter-credito-celular.test.ts
    src/__tests__/solicitar-aprovacao-desconto.test.ts` — o primeiro passa 100% (só cobre o gate de
    celular, não chega na resolução de aprovador). O segundo tem **3 falhas pré-existentes**
    (`tipo='desconto'`, dependem de `getMasterAdminId`/`MASTER_ADMIN_USER_ID` não configurado no
    ambiente de teste) — confirmado com `git stash` que as mesmas 3 falhas já existiam **antes**
    desta mudança (fluxo de desconto, código que não toquei). Não é regressão desta fase.
- **Não toquei**: `processarAprovacaoCredito` (efeito diretor que zera comissão com guard de data
  `2026-07-01`, débito de saldo, `approveVenda` disparado ao fim), a coluna `aprovacao_credito_tipo`,
  o sub-ramo `cartao_desconto` que a mesma função também trata (é da Fase 3g.3), `approveVenda`/
  `estornarVenda`, a trava R3, o guard genérico L342, `src/lib/aprovacoes/`. Nenhum DDL/DML/migration.

**Cenários pra validar em homolog** (pacote `14`): `aprovadora_credito_gerente` = X → X decide
crédito-gerente, Y (≠X) → 403; `aprovador_credito_diretor` = Z → Z decide crédito-diretor, outro →
403; sem a chave correspondente → solicitar aprovação de crédito → 409 "Aprovador de crédito (<tipo>)
não configurado" chegando ao front com a mensagem certa.

**Não subi pra homolog nem testei back/front** — commit pronto, a validação (SQL + tela, com o
Jonathan) é do Opus antes de avançar pra Fase 3g.3 (desconto + cartão, a sub-fase mais crítica).

### Fase 3f (compra comercial) — nota pro Opus revisar e testar em homolog

- Exatamente 2 arquivos, como o pacote pediu — nem camada, nem front, nem config-UI tocados
  (a chave `aprovador_compra_comercial` já existia e já estava exposta na tela):
  - `tarefas/[id]/aprovacao/route.ts`: o bloco `compra_comercial` ganhou o gate `podeDecidir`
    logo antes do `try`, espelhando `recebimento_metal`/`devolucao`. Checagem genérica do topo
    do PATCH intocada; assinatura de `processarAprovacaoCompraComercial` intocada (continua
    recebendo `user.id`).
  - `compras-comercial/[id]/solicitar-aprovacao/route.ts`: a leitura crua da config
    (`SELECT valor FROM configuracoes_sistema WHERE chave='aprovador_compra_comercial'`) virou
    `resolverAprovadores("compra_comercial")`. **Mensagem do 409 preservada literalmente**:
    "Nenhum aprovador configurado para compra comercial" (não a aproximação genérica que o
    pacote usou no exemplo — conferi a string exata no código antes de trocar).
  - **Simplificação que o próprio pacote autorizou**: removi a checagem separada de "usuário
    ativo" (query own + 409 "Aprovador inválido ou inativo") porque `resolverAprovadores` já
    filtra `ativo=true` internamente — ficaria código morto. Efeito: se o UUID configurado virar
    inativo, a mensagem que aparece agora é a mesma de "não configurado" (era uma mensagem
    própria antes) — mesmo status 409, resultado prático idêntico (usuário vê que precisa
    reconfigurar), só o texto exato desse caso-de-borda específico mudou.
  - `npx tsc --noEmit` zero erros. `npx vitest run src/lib/aprovacoes` **121/121 passando**
    (nada da camada mudou, contagem idêntica à Fase 3e).
- **Não toquei** na brecha do `[id]/concluir/route.ts` (`void user`) nem no risco R4 (duplicação
  de `contas_pagar` no handler `processarAprovacaoCompraComercial`) — ficam registrados pra
  Fase 4, como o pacote determinou.

**Cenários pra validar em homolog** (pacote `11`): X (configurado) aprova/rejeita uma compra
comercial via tarefa → passa; Y (≠X, mesmo admin/dev) → 403; sem
`aprovador_compra_comercial` → solicitar aprovação → 409 "Nenhum aprovador configurado para
compra comercial".

**Não subi pra homolog nem testei back/front** — commit pronto, a validação (SQL + tela, com o
Jonathan) é do Opus antes de avançar pra Fase 3g (venda — a mais arriscada, por último).

### Fase 3e (devolução) — nota pro Opus revisar e testar em homolog

- 14 arquivos tocados, escopo fechado (camada + `devolucoes.ts` + despachante (2 gates) + config
  route + config UI + 2 rotas de devolução que precisaram do `HttpError` — ver abaixo). **Sem**
  tocar a tela de devolução (`DevolucaoDetalheClient`) nem o cálculo de prazo
  (`prazo-devolucao.ts`, `dias-uteis.ts`), como pedido.
  - **Camada**: `catalogo.ts` — evento `devolucao` passou de 2 chaves (`aprovadora_credito_gerente`
    dentro do prazo / `aprovador_devolucao_fora_prazo` fora do prazo) pra **1 chave só**
    (`aprovador_devolucao`), decisão do Jonathan (12/07). `autoridade.ts` —
    `configKeysEfetivas` não tem mais o `if (evento === "devolucao")`, virou `return
    regra.configKeys` puro. `tipos.ts` — removi o campo `ContextoAprovacao.foraPrazo` (grep
    confirmou zero uso fora dali). Testes das 2 chaves/prazo trocados por testes da chave única
    (121 testes, era 122 — um teste a menos porque "2 chaves de prazo" virou "1 chave").
  - **Despachante**: os 2 blocos (`devolucao_estoque` e `devolucao`, nessa ordem — a etapa 2
    sobrescreve `tarefa_id` da mesma tarefa, desambiguado por tag) ganharam o gate `podeDecidir`
    logo no início, espelhando o padrão do `recebimento_metal`. A checagem genérica do topo do
    PATCH ficou intocada.
  - **Criação** (`devolucoes.ts`): as duas funções (`solicitarAprovacaoDevolucao` e
    `solicitarAprovacaoEstoqueDevolucao`) perderam o fallback por cargo e passaram a usar
    `resolverAprovadores`. **O cálculo de prazo (`avaliarPrazoDevolucao`) continua chamado** —
    só não decide mais quem aprova, só alimenta o aviso "⚠️ FORA DO PRAZO" na descrição da
    tarefa.
  - **Achado que exigiu mexer em 2 rotas a mais do que a lista mínima**: `solicitar-aprovacao/
    route.ts` usa `internalError(...)`, que **sempre** devolve uma mensagem genérica fixa
    (nunca expõe `err.message`) — se eu só tivesse dado `throw new Error("não configurado")`, a
    mensagem específica NUNCA chegaria ao front (o pacote pedia explicitamente "pra o 409 chegar
    ao front com a mensagem certa"). Resolvido reusando um padrão que já existe em outras partes
    do projeto (`class HttpError extends Error { status; }`, ex.:
    `src/app/api/rfid/cadastrar/route.ts`) — agora exportado de `devolucoes.ts` — e um `if (err
    instanceof HttpError)` **antes** do catch genérico nos 2 endpoints
    (`solicitar-aprovacao/route.ts`, `concluir/route.ts`). Isso NÃO muda nenhuma mensagem/status
    que já existia — só dá um caminho novo pro erro novo (409, mensagem clara). Confirmei que
    `concluir/route.ts` já tinha um padrão parecido (expõe `err.message` pra erros de domínio) —
    segui a mesma linha, só adicionando o `instanceof HttpError` antes.
  - **Config**: `aprovador_devolucao` exposta em `configuracoes/aprovadores/route.ts` (GET+PUT) e
    no front, seguindo o padrão da Fase 3b. Lista de elegíveis é uma query nova
    (`aprovadoresDevolucao`, gerente_loja→diretor→admin→desenvolvedor) — é exatamente o conjunto
    de cargos que o fallback antigo usava, então não inventei critério novo, só virou lista de
    escolha em vez de fallback automático. **Decisão de UX que tomei sem perguntar antes**: a
    chave `aprovador_devolucao_fora_prazo` continua no array `CHAVES` (o pacote pediu pra manter,
    não remover), mas como ela ficou **completamente sem uso** depois desta fase, deixei o card
    dela na tela com título "(legado — não usado mais)" e descrição explicando o porquê — pra não
    confundir você pensando que ainda configura alguma coisa. Se preferir, dá pra tirar o card de
    vez (fica só a chave "morta" no banco, sem UI).
- `npx tsc --noEmit` zero erros. `npx vitest run src/lib/aprovacoes` **121/121 passando**.
- **Não mexi no banco** — `aprovador_devolucao` ainda não existe em `configuracoes_sistema`; isso
  é do Opus em homolog e depois `/dba` em produção. `aprovador_devolucao_estoque` já existe (não
  precisa criar).

**Cenários pra validar em homolog** (pacote `10`): etapa 1 — X (configurado) aprova/rejeita a
devolução, Y (≠X, mesmo admin/dev) leva 403; etapa 2 — idem com `aprovador_devolucao_estoque`;
sem `aprovador_devolucao` → solicitar aprovação da devolução → erro "não configurado" (409, com a
mensagem específica chegando ao front — vale conferir isso especificamente, é o ponto mais frágil
desta fase).

**Não subi pra homolog nem testei back/front** — commit pronto, a criação da chave + validação
(SQL + tela, com o Jonathan) é do Opus antes de avançar pra Fase 3f (compra comercial).

### Fase 3c (precificação) — nota pro Opus revisar e testar em homolog

- 9 arquivos tocados, escopo fechado (precificação + tela de Configurações — **nem o
  despachante genérico, nem `pendentes/route.ts`** foram tocados, como pedido). Modelo = metal:
  precificação não gera tarefa, não passa por `tarefas/[id]/aprovacao`.
  - Decisão: `precificacao/aprovar/route.ts` e `precificacao/rejeitar/route.ts` trocaram
    `isFullAccess(user.role)` por `podeDecidir(user, "precificacao")`. **As 2 strings de erro 403
    ficaram EXATAMENTE iguais** (`"Sem permissão — apenas admin e desenvolvedor podem
    aprovar/rejeitar"`), mesmo sabendo que o texto vira impreciso quando o aprovador configurado
    não for admin/dev — o pacote foi explícito que ajuste de texto é Fase 4/5, não aqui.
    `isFullAccess` sem uso, removido.
  - Criação: `precificacao/solicitar-aprovacao/route.ts` ganhou o guard
    `resolverAprovadores("precificacao")` antes do `INSERT INTO markup_alteracoes` — sem
    `aprovador_precificacao`, 409 e a solicitação não nasce. `isPrecificacaoAccess` (quem PODE
    solicitar) não mudou — só adicionei o guard de config em cima.
  - Config: `aprovador_precificacao` exposta em `configuracoes/aprovadores/route.ts` (GET+PUT,
    **este endpoint não tem PATCH** — o pacote citava PATCH por engano, confirmei no código antes
    de mexer) seguindo o padrão exato da `aprovador_conversao` da 3b. Lista de elegíveis reusa
    `diretores_admins` (não `admins_devs`) porque `isFullAccess` hoje inclui diretor — escolhi a
    lista que bate com quem realmente aprova hoje.
  - **Front (passo D, o que o pacote pediu pra avaliar com cuidado)**: `precificacao/page.tsx` é
    um server component direto — sem estrutura complicada. Adicionei
    `podeDecidir({id,role},"precificacao")` lá e passei como prop nova `podeAprovarPrecificacao`
    pro client; `PrecificacaoClient.tsx:2205` trocou
    `currentUserRole === "desenvolvedor" || "admin"` por `podeAprovarPrecificacao` direto. **Não
    precisei parar/reportar** — não teve complicação que justificasse.
  - `npx tsc --noEmit` zero erros. `npx vitest run src/lib/aprovacoes` **122/122 passando** (o
    catálogo já tinha `precificacao`/`aprovador_precificacao` certos desde a Fase 1b — não mudei
    nenhum teste).
- **Não mexi no banco** — `aprovador_precificacao` ainda não existe em
  `alissonerp.configuracoes_sistema`; isso é do Opus em homolog e depois `/dba` em produção. Sem
  ela, `precificacao` sempre resolve `nao_configurado` — solicitar markup responde 409, aprovar/
  rejeitar respondem 403 pra todo mundo (comportamento correto e esperado até a chave existir).
- **Cenários pra validar em homolog** (pacote `08`): X (configurado) aprova alteração de markup →
  200 (aplica); Y (≠X, mesmo admin/diretor) → 403; X rejeita → 200, Y → 403; sem
  `aprovador_precificacao` → solicitar markup → 409 (não cria a alteração); front — só quem tem
  `podeDecidir=true` vê o botão Aprovar (testar com um aprovador configurado que NÃO seja
  admin/dev, pra confirmar que a regressão de UX foi mesmo evitada).

**Não subi pra homolog nem testei back/front** — commit pronto, a criação da chave + validação
(SQL + tela, com o Jonathan) é do Opus antes de avançar pra Fase 3d (limpeza).

### Fase 3b (conversão) — nota pro Opus revisar e testar em homolog

- 13 arquivos tocados, escopo fechado (conversão + catálogo/testes + tela de Configurações —
  **nem o despachante genérico, nem o front de conversão** foram tocados, como pedido):
  - Decisão: `conversao/{aprovar,recusar}/route.ts` e `conversao-sku/{aprovar,recusar}/route.ts`
    trocaram `["admin","desenvolvedor"].includes(role)` por `podeDecidir(user, "conversao" |
    "conversao_sku")`. Mensagem de erro e status 403 **idênticos**.
  - Criação: `estoque-comercial/converter/route.ts` e `conversao-sku/route.ts` ganharam o guard
    `resolverAprovadores(...)` **antes** da transação — sem `aprovador_conversao` configurado,
    responde 409 `"Aprovador de conversão não configurado. Defina em Configurações ›
    Aprovadores."` e a conversão **não nasce** (nem ordem, nem reserva).
  - Catálogo: `conversao_sku` passou a usar a MESMA chave `aprovador_conversao` (decisão do
    Jonathan 12/07 — antes seriam 2 chaves, `aprovador_conversao` e `aprovador_conversao_sku`).
    Confirmei com `grep -rn aprovador_conversao_sku src` que a chave antiga **não sobra em lugar
    nenhum** (só numa linha de comentário explicando a remoção). Testes atualizados: o
    `it.each` das "5 chaves novas" virou "4 chaves ainda não plugadas" (`alteracao_venda`,
    `precificacao`, `auditoria` — `conversao` saiu da lista porque já foi plugada) + 2 testes
    novos confirmando que `conversao`/`conversao_sku` compartilham a chave.
  - Tela Configurações › Aprovadores: `aprovador_conversao` exposta no `GET`/`PUT` de
    `configuracoes/aprovadores/route.ts` **e** no front (`TabAprovadores.tsx` +
    `ListaAprovadores.tsx` + `FormularioAprovador.tsx`) — o componente é 100% data-driven
    (array `CONFIG_ITENS`), então dava pra fazer sem risco (não é "componente React grande" que
    o pacote pedia pra reportar em vez de mexer). Lista de usuários elegíveis reusa
    `admins_devs` (mesma que desconto/cartão/compra comercial já usam) — não criei query nova.
  - `npx tsc --noEmit` zero erros. `npx vitest run src/lib/aprovacoes` **122/122 passando**
    (mesma contagem de antes — a "5 chaves" virou "4 chaves"+2 testes novos, líquido zero).
    `git status` lista exatamente os 13 arquivos esperados.
- Despachante genérico (`tarefas/[id]/aprovacao/route.ts`) **intocado** — conversão não passa por
  ali (a tarefa de conversão não gera `aprovacoes_tarefa`; os 4 endpoints dedicados são o único
  caminho), confirmado no pacote e não mudou nada nessa investigação.
- **Não mexi no banco** — a chave `aprovador_conversao` ainda não existe em
  `alissonerp.configuracoes_sistema`; o pacote foi explícito que isso é do Opus em homolog (e
  depois `/dba` em produção). Sem ela, `conversao`/`conversao_sku` sempre resolvem
  `nao_configurado` — os 4 endpoints continuam funcionando (respondem 403/409 corretamente),
  só não deixam ninguém aprovar/criar até a chave existir e estar preenchida.
- **Cenários pra validar em homolog** (pacote `07`): X (configurado) aprova conversão de estoque
  → ok; Y (≠X, mesmo admin) → 403; X recusa → ok, Y → 403; conversão SKU segue a MESMA regra,
  mesmo aprovador; `aprovador_conversao` vazio → criar conversão (estoque ou SKU) → 409, não nasce.

**Não subi pra homolog nem testei back/front** — commit pronto, a criação da chave + validação
(SQL + tela, com o Jonathan) é do Opus antes de avançar pra Fase 3c (precificação).

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
