# FASE 2 — Testes de caracterização ("golden") + mapa de divergências

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md`, `01-dossie-dependencias.md`, `02-mapa-esbarros.md`, `03-FASE-1-camada-central.md`.
> **Pré-requisito: o pacote `03b-config-first-estrito.md` já aplicado e revisado** — a Fase 2 caracteriza
> a política FINAL (config-first estrita), não a antiga (fallback/override já removidos). Branch: `feat/centralizar-aprovacoes`.

## Objetivo

Criar a **rede de segurança** antes de migrar qualquer fluxo (Fase 3):

1. **Congela a política da camada** (`CATALOGO` + funções puras config-first) com testes exaustivos — a
   Fase 3 não altera a política sem quebrar um teste.
2. **Mapeia, evento por evento, onde a política ALVO difere do comportamento ATUAL** — o documento que o
   Jonathan valida ANTES da Fase 3. Com a política config-first estrita, as divergências são **grandes**
   (ex.: metal hoje 5 cargos decidem → alvo só o aprovador configurado; desconto hoje 3 portas → alvo
   config), então esse mapa é o coração da fase.

## Por que NÃO é golden de ponta a ponta

O comportamento atual vive em 28 endpoints com I/O pesado. A validação real de "não quebrou" acontece na
**Fase 3**, fluxo a fluxo (endpoint contra homolog + tela), com contrato idêntico. A Fase 2 entrega a
referência escrita (mapa de divergências) e trava a camada.

## Escopo

**É desta fase (só `src/lib/aprovacoes/__tests__/` e `docs/`):** testes de caracterização + snapshot do
catálogo + o doc `05-divergencias-alvo-x-atual.md`.

**NÃO é desta fase:** não plugar a camada; não corrigir divergências (Fase 3/4/5); não tocar banco/front/endpoints.

## Entregável 1 — `__tests__/caracterizacao-catalogo.test.ts`

Table-driven, cobrindo **os 18 eventos**, com as funções puras (`resolverPorConfig`, `avaliarDecisao`).
Por evento (menos a exceção), cobrir:

- **config com 1 UUID** → `resolverPorConfig` = `{status:"ok", aprovadores:[esse], origem:"config"}`; esse user `pode:true`; outro `pode:false`.
- **config com vários UUIDs** → `aprovadores` = a lista; **qualquer um** da lista `pode:true`; fora `pode:false`.
- **config vazia** → `{status:"nao_configurado"}`; qualquer user → `pode:false`.
- **solicitante excluído**: se o único UUID da config for o solicitante (e não é a exceção) → `nao_configurado` (ninguém aprova a própria).

Casos especiais obrigatórios:
- `conferencia_consultora`: com `autoConsultoraId` → `origem:"auto_consultora"`, essa consultora `pode:true`; outra `pode:false`; sem consultora batendo → `nao_configurado`/`pode:false`.
- `devolucao`: `ctx.foraPrazo=true` resolve pela chave `aprovador_devolucao_fora_prazo`; `false` pela `aprovadora_credito_gerente` (testar via wrapper/`configKeysEfetivas` ou documentar).
- `limpeza_ouro`: agora é a regra geral — sem override, só o UUID de `aprovador_limpeza`.

Use `it.each` para as invariantes comuns + `describe` por evento para os especiais.

## Entregável 2 — snapshot do `CATALOGO`

`__tests__/catalogo.snapshot.test.ts`: serializa cada entrada num objeto estável
(`evento → { configKeys, configMulti, solicitantePodeAprovar }`) e compara com um **objeto esperado
explícito** (inline, não `toMatchSnapshot` de arquivo). Qualquer mudança de política quebra o teste.
Incluir uma invariante: **todo** evento exceto `conferencia_consultora` tem `configKeys.length>0`;
`conferencia_consultora` tem `configKeys:[]` + `solicitantePodeAprovar:true`. E um teste-guarda garantindo
que a API antiga sumiu (sem `rolesFallback`/`permiteOverrideAdmin`/`ACESSO_PLENO`/override na camada).

## Entregável 3 — `05-divergencias-alvo-x-atual.md` (o mais importante pro Jonathan)

Uma tabela, **uma linha por evento**:

| evento | quem decide HOJE (fonte: dossiê/mapa, com arquivo:linha) | quem decide na camada ALVO (config-first) | veredito |

Veredito ∈:
- 🟢 **IGUAL** — a camada replica o atual (poucos: só onde já era config-only, ex. `limpeza_ouro`, `entrega_sem_pagamento`).
- 🔵 **FIX INTENCIONAL** — muda de propósito. A maioria cai aqui, e a mudança costuma ser a mesma: *"hoje N cargos/admin decidem; alvo = só o aprovador configurado (trava se vazio)"*. Descrever em 1 linha por evento. Destacar os que hoje eram **brecha** (auditoria `void user`; compra-comercial/concluir sem cargo) e os que **ignoravam a config** (metal).
- 🔴 **REGRESSÃO** — mudança indesejada (a corrigir antes de migrar).

Seção final **"🔴 Regressões a resolver"** (ou "nenhuma"). E uma seção **"Chaves de config que precisam
existir antes de ligar"**: liste TODAS as chaves por evento e marque as **5 que ainda não existem**
(`aprovador_conversao`, `aprovador_conversao_sku`, `aprovador_alteracao_venda`, `aprovador_precificacao`,
`aprovador_auditoria`) — é o checklist que garante que a Fase 3 não trava um fluxo por chave vazia.

Fontes: `02-mapa-esbarros.md` (§A–§D, 28 endpoints) e `01-dossie`. **Não invente** — cite `arquivo:linha`;
onde o atual for ambíguo, marque `⚠️ conferir`.

## Riscos do dossiê que se aplicam

- **R3** (`desconto_aprovado_por` destrava a venda): registrar no doc que hoje a porta `solicitacoes-desconto`
  não grava `vendas_erp.desconto_aprovado_por` (grava `itens_venda_erp.desconto_autorizado_por`), então um
  desconto aprovado só por ali continua travando o crédito. Marcar 🔵 (a Fase 3 unifica no campo canônico).
- **R2** (locks dirigem a UI): garantir que os `camposLock` do catálogo batem com os campos que cada fluxo mexe.

## Critérios de aceite

1. `npx tsc --noEmit` → **0 erros**.
2. `npx vitest run src/lib/aprovacoes` → tudo passando (caracterização dos 18 + snapshot + guarda anti-API-antiga).
3. `05-divergencias-alvo-x-atual.md` completo: 18 linhas com veredito e `arquivo:linha`; seção de regressões;
   seção de chaves de config (as 5 novas destacadas).
4. `git status` limpo fora de `src/lib/aprovacoes/__tests__/` e `docs/`. Nada plugado.
5. Commit: `test(aprovacoes): caracterização config-first dos 18 eventos + snapshot + mapa de divergências (fase 2)`.
6. Atualizar `00-README.md` (Fase 2 concluída) e reportar pro Opus revisar antes da Fase 3.

## Entrega

**Não avance pra Fase 3 sozinho** — o Opus revisa a caracterização e, principalmente, o mapa de
divergências **com o Jonathan** (é onde ele aprova, caso a caso, cada mudança de comportamento).
