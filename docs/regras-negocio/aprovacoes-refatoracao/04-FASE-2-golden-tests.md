# FASE 2 — Testes de caracterização ("golden") + mapa de divergências

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda nenhum chat.
> Leia `00-README.md`, `01-dossie-dependencias.md`, `02-mapa-esbarros.md`, `03-FASE-1-camada-central.md`.
> **Pré-requisito: o FIX A1 (`03b-FIX-A1-determinismo-aprovador.md`) já aplicado e revisado** — sem
> determinismo os golden ficam instáveis. Branch: `feat/centralizar-aprovacoes`.

## Objetivo

Criar a **rede de segurança** antes de migrar qualquer fluxo (Fase 3). Ela faz duas coisas:

1. **Congela a política da camada** (`CATALOGO` + funções puras) com testes exaustivos — para que a
   Fase 3 não altere a política sem querer; qualquer mudança de catálogo passa a **quebrar um teste**.
2. **Mapeia, evento por evento, onde a política ALVO difere do comportamento ATUAL** — o documento
   que o Jonathan valida ANTES da Fase 3, decidindo se cada diferença é o fix desejado (🔵) ou uma
   regressão a corrigir (🔴).

## Por que NÃO é golden de ponta a ponta (contra os endpoints)

O comportamento atual vive em 28 endpoints com I/O pesado. Rodar cada um contra o banco de homolog e
comparar seria caro e frágil **agora**. A validação real de "não quebrou" acontece na **Fase 3**,
fluxo a fluxo: ao migrar cada endpoint, testa-se aquele endpoint contra homolog (back) e a tela
(front), com contrato idêntico. A Fase 2 entrega a referência escrita (o mapa de divergências) que
guia essa validação, mais os testes que travam a camada.

## Escopo

**É desta fase (só `src/lib/aprovacoes/__tests__/` e `docs/`):**
- Testes de caracterização dos 18 eventos.
- Snapshot do `CATALOGO`.
- O documento `05-divergencias-alvo-x-atual.md`.

**NÃO é desta fase:**
- ❌ Não plugar a camada em endpoint nenhum (continua Strangler Fig).
- ❌ Não corrigir divergências (isso é Fase 3/4/5). Aqui só **documenta e trava**.
- ❌ Não tocar banco/front/endpoints/`roles.ts`.

## Entregável 1 — `__tests__/caracterizacao-catalogo.test.ts`

Table-driven, cobrindo **os 18 eventos**. Para cada evento, casos com as funções **puras**
(`escolherAprovador`, `avaliarDecisao` — sem banco). Cobrir, no mínimo, por evento:

- **config presente** → `escolherAprovador` retorna o UUID da config (origem `config`).
- **config vazia → fallback por cargo**, respeitando precedência e ≠ solicitante (origem `role_fallback`).
- **sem candidato** → `null` (o wrapper cai no master).
- **decisão: designado** → `{pode:true, viaOverride:false}`.
- **decisão: `ACESSO_PLENO` ≠ designado** → se `permiteOverrideAdmin` `{pode:true, viaOverride:true}`; senão `{pode:false}`.
- **decisão: cargo fora do fallback, sem override** → `{pode:false}`.

Casos especiais obrigatórios (fixam o comportamento particular de cada um):
- `limpeza_ouro`: `permiteOverrideAdmin:false` e `rolesFallback:[]` → admin ≠ UUID configurado → `{pode:false}`. Só o designado decide.
- `conferencia_consultora`: `solicitantePodeAprovar:true` → a própria consultora (designado = ela) decide `{pode:true}`; outra consultora → `{pode:false}`.
- `devolucao`: `ctx.foraPrazo` **não** muda as puras (muda só a configKey no wrapper) — documentar isso num caso do wrapper (ver Entregável 3) ou comentar no teste.
- `devolver_peca`: `configMulti:true` — vários UUIDs; escolhe o 1º ativo ≠ solicitante.
- `credito_gerente` / `devolucao` / `devolucao_estoque` / `auditoria` / `conferencia_consultora`: precedência de cargo (o fix A1) — o gerente/estoquista vem antes de `ACESSO_PLENO`.

Use uma tabela de eventos e um `it.each` para as invariantes comuns, mais `describe` por evento
para os casos especiais. Meta: ~todos os 18 com pelo menos os 3 primeiros casos + os especiais onde
se aplicam.

## Entregável 2 — snapshot do `CATALOGO`

`__tests__/catalogo.snapshot.test.ts`: serializa cada entrada do `CATALOGO` num objeto estável
(`evento → { configKeys, configMulti, rolesFallback, permiteOverrideAdmin, solicitantePodeAprovar }`)
e compara com um **objeto esperado explícito** (não `toMatchSnapshot` de arquivo — objeto inline, mais
legível na review). Assim, qualquer alteração de política no catálogo quebra este teste e obriga
atualização consciente. Inclua um teste garantindo `ACESSO_PLENO === ["admin","desenvolvedor","diretor"]`.

## Entregável 3 — `05-divergencias-alvo-x-atual.md` (o mais importante pro Jonathan)

Uma tabela com **uma linha por evento**. Colunas:

| evento | quem decide HOJE (fonte: dossiê/mapa, com arquivo:linha) | quem decide na camada ALVO (catálogo) | veredito |

Veredito ∈:
- 🟢 **IGUAL** — a camada replica o atual.
- 🔵 **FIX INTENCIONAL** — muda de propósito (descrever a mudança em 1 linha). Ex.: `auditoria` hoje é brecha (`void user`, qualquer logado) → alvo exige cargo; `compra_metal`/`recebimento_metal` hoje ignoram `metal_aprovador_id` → alvo respeita a config; `desconto` hoje tem 3 portas com efeito de comissão diferente → alvo unifica.
- 🔴 **REGRESSÃO** — a camada mudaria algo que **não** deveria mudar (a corrigir antes de migrar).

Ao final, uma seção **"🔴 Regressões a resolver"** listando só as vermelhas, cada uma com o que
fazer — é o que o Jonathan decide antes da Fase 3. Se não houver nenhuma 🔴, dizer isso explicitamente.

Fontes para preencher o "HOJE": `02-mapa-esbarros.md` (§A–§D e os 28 endpoints) e o `01-dossie`.
**Não invente** — cite `arquivo:linha`. Onde o atual for ambíguo, marque `⚠️ conferir` em vez de adivinhar.

## Riscos do dossiê que se aplicam

- **R3** (`desconto_aprovado_por` é o portão que destrava a venda): ao caracterizar `desconto`,
  registrar no doc que hoje a porta `solicitacoes-desconto` **não** grava `vendas_erp.desconto_aprovado_por`
  (grava `itens_venda_erp.desconto_autorizado_por`) — por isso um desconto aprovado só por ali
  **continua travando** o crédito. É a divergência mais perigosa pra venda; marcar como 🔵 (a Fase 3
  unifica no campo canônico) e destacar.
- **R2** (locks dirigem a UI): a caracterização não toca UI; só garante que os `camposLock` do
  catálogo batem com os campos que o dossiê diz que cada fluxo mexe.

## Critérios de aceite

1. `npx tsc --noEmit` → **zero erros**.
2. `npx vitest run src/lib/aprovacoes` → tudo passando, com caracterização dos 18 eventos + snapshot.
3. `05-divergencias-alvo-x-atual.md` completo: 18 linhas, cada divergência marcada 🟢/🔵/🔴, com
   `arquivo:linha` no "HOJE", e a seção final de regressões.
4. `git status` limpo fora de `src/lib/aprovacoes/__tests__/` e `docs/`. Nada plugado.
5. Commit: `test(aprovacoes): caracterização dos 18 eventos + snapshot do catálogo + mapa de divergências (fase 2)`.
6. Atualizar `00-README.md` (Fase 2 concluída) e reportar pro Opus revisar antes da Fase 3.

## Entrega

Ao terminar, **não avance pra Fase 3 sozinho** — o Opus revisa a caracterização e, principalmente, o
mapa de divergências com o Jonathan (é onde ele aprova cada mudança de comportamento).
