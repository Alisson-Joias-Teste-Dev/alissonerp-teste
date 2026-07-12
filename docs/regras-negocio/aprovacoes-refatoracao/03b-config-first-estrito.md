# FASE 1b — Política config-first ESTRITA (substitui o fallback por cargo)

> **Executor: Sonnet (operacional).** Arquiteto/revisor: Opus. Pacote auto-contido — você não herda chat.
> Leia `00-README.md` e `03-FASE-1-camada-central.md` antes. **Substitui a política da Fase 1** e é
> **pré-requisito da Fase 2**. Branch: `feat/centralizar-aprovacoes` (worktree `alissonerp-wt-centralizar-aprovacoes`).
>
> ⚠️ Este pacote **cancela** o antigo `03b-FIX-A1-determinismo-aprovador.md` (regra de determinismo do
> fallback por cargo) — o fallback por cargo deixa de existir, então não há o que "ordenar".

## A regra (decisão do Jonathan, 11/07)

A autoridade de cada aprovação é **100% a Configuração**. Nada de escolher por cargo, nada de dono:

1. **Aprovador(es) configurado(s) em Configurações** → **só** eles decidem. Ninguém mais — **nem admin** (rigidez total, igual à limpeza de ouro hoje).
2. **Config vazia** (ou todos inativos) → a camada retorna **`nao_configurado`**. O endpoint (Fase 3) responde com mensagem: *"Defina o aprovador de {rótulo} em Configurações › Aprovadores."* **Nada é escolhido no automático.**
3. **Sem** fallback por cargo, **sem** master/dono, **sem** override de admin.
4. **1 ou vários** aprovadores por fluxo (lista): se um está fora, outro configurado resolve — sem violar a regra.
5. **Exceção única**: `conferencia_consultora` — a própria consultora aprova a dela (não há aprovador a configurar).

## Escopo — LEIA

**É deste pacote (só `src/lib/aprovacoes/`):** reescrever `tipos.ts`, `catalogo.ts`, `autoridade.ts`,
os testes; **remover** `override-log.ts` (não há mais override).

**NÃO é deste pacote:** não plugar em endpoint; não tocar banco/front/`roles.ts`. As **5 chaves de
config novas** e os campos na tela Configurações são de outra fase (banco via `/dba`, front na Fase 3) —
aqui só declaramos as chaves no catálogo.

## Mudanças detalhadas

### 1. `tipos.ts`

- `RegraAutoridade`: **remover** `rolesFallback` e `permiteOverrideAdmin`. Fica:
  ```ts
  export interface RegraAutoridade {
    evento: EventoAprovacao;
    rotulo: string;
    configKeys: string[];        // chaves em configuracoes_sistema (ordem de precedência). Vazio SÓ na exceção.
    configMulti?: boolean;       // valor da chave é lista de UUIDs separada por vírgula (agora o padrão: todos true)
    solicitantePodeAprovar?: boolean; // true só em conferencia_consultora
    camposLock?: string[];
    observacao?: string;
  }
  ```
- Resolução vira discriminated union (a camada pode dizer "não configurado"):
  ```ts
  export type ResolucaoAprovador =
    | { status: "ok"; aprovadores: string[]; origem: "config" | "auto_consultora" }
    | { status: "nao_configurado"; evento: EventoAprovacao; configKeys: string[] };
  ```
- `ResultadoDecisao`: `{ pode: boolean; motivo?: string }` (**remover** `viaOverride`).
- Remover `OrigemAprovador` antigo e `AprovadorResolvido` (substituídos por `ResolucaoAprovador`).

### 2. `catalogo.ts`

- **Remover `ACESSO_PLENO` da camada** e todo `rolesFallback`/`permiteOverrideAdmin`. A decisão não usa
  mais cargo. (Quem *edita* a config continua sendo `isFullAccess` de `roles.ts`, na tela — fora daqui.)
- Cada evento: `configKeys` preenchido, `configMulti: true`, `camposLock`, `observacao`. **5 ganham chave nova:**
  | evento | chave |
  |---|---|
  | conversao | `aprovador_conversao` |
  | conversao_sku | `aprovador_conversao_sku` |
  | alteracao_venda | `aprovador_alteracao_venda` |
  | precificacao | `aprovador_precificacao` |
  | auditoria | `aprovador_auditoria` |
- `devolucao`: mantém as 2 chaves (`aprovadora_credito_gerente` dentro do prazo / `aprovador_devolucao_fora_prazo` se `ctx.foraPrazo`).
- `compra_metal` e `recebimento_metal`: continuam em `metal_aprovador_id`.
- `conferencia_consultora`: `configKeys: []`, `configMulti: false`, `solicitantePodeAprovar: true` — a **exceção**.
- Mantém a lista das chaves já existentes dos outros eventos (desconto, cartão, crédito, entrega, devolução-estoque, compra comercial, limpeza, devolver-peça).
- Deixe um comentário no topo: as 5 chaves novas ainda **não existem** em `configuracoes_sistema` — serão
  criadas via `/dba` e ganharão campo na tela na Fase 3; até lá, esses eventos resolvem `nao_configurado`.

### 3. `autoridade.ts`

**Puras (testáveis sem banco):**
```ts
// Retorna os aprovadores válidos ou "não configurado". Sem cargo, sem master.
export function resolverPorConfig(
  regra: RegraAutoridade,
  configUUIDs: string[],           // já filtrados: ativos; e ≠ solicitante (feito no wrapper), exceto exceção
  autoConsultoraId?: string,       // só conferencia_consultora
): ResolucaoAprovador {
  if (regra.solicitantePodeAprovar && autoConsultoraId) {
    return { status: "ok", aprovadores: [autoConsultoraId], origem: "auto_consultora" };
  }
  if (configUUIDs.length > 0) {
    return { status: "ok", aprovadores: configUUIDs, origem: "config" };
  }
  return { status: "nao_configurado", evento: regra.evento, configKeys: regra.configKeys };
}

// user pode decidir se está na lista de aprovadores atuais.
export function avaliarDecisao(userId: string, aprovadores: string[]): ResultadoDecisao {
  return aprovadores.includes(userId)
    ? { pode: true }
    : { pode: false, motivo: "nao_e_aprovador_configurado" };
}
```

**Async (I/O):**
```ts
// Busca a config (multi), filtra ativos e ≠ solicitante (exceto exceção), chama a pura.
export async function resolverAprovadores(evento, ctx?): Promise<ResolucaoAprovador> { ... }

// Autoridade = config ATUAL (não snapshot da tarefa): re-resolve e checa se o user está na lista.
export async function podeDecidir(user, evento, ctx?): Promise<ResultadoDecisao> {
  const r = await resolverAprovadores(evento, ctx);
  if (r.status === "nao_configurado") return { pode: false, motivo: "aprovador_nao_configurado" };
  return avaliarDecisao(user.id, r.aprovadores);
}
```
- `buscarUUIDsDaConfig`: já existe; garantir que **todo** evento use o caminho multi (split por vírgula,
  filtrar ativos). A chave de `devolucao` continua dependendo de `ctx.foraPrazo` (`configKeysEfetivas`).
- **Remover**: `buscarCandidatosPorRole`, o fallback por role, o `getMasterAdminId`/master, e o `registrarOverride`/override-log.
- `candidatoAutoAprovacao` (conferencia): manter — vira o `autoConsultoraId`.

### 4. `override-log.ts` e `index.ts`
- **Apagar** `override-log.ts` e `__tests__` relativos a override. Remover os re-exports em `index.ts`
  (`registrarOverride`, `AlvoOverride`, `ACESSO_PLENO`, `avaliarDecisao` antigo). Exportar a nova API
  (`resolverPorConfig`, `avaliarDecisao`, `resolverAprovadores`, `podeDecidir`, tipos novos).

### 5. Uso na criação da tarefa (documentar no código como comentário; implementar só na Fase 3)
- Criar tarefa → `resolverAprovadores`. Se `nao_configurado` → **não cria** a tarefa; endpoint responde
  **409** com a mensagem pra Configurações. Se `ok` → grava o **1º** UUID como `responsavel_id` (visível) e
  **notifica todos** os da lista; qualquer um decide (`podeDecidir`).

## Testes (`__tests__/autoridade.test.ts`) — reescrever

- config 1 UUID → `aprovadores:[esse]`; esse user → `pode:true`; outro → `pode:false`.
- config vários UUIDs → qualquer um da lista → `pode:true`; fora → `pode:false`.
- config vazia → `status:"nao_configurado"`; `podeDecidir` de qualquer user → `pode:false`.
- solicitante é o único configurado (evento normal, wrapper já o exclui) → `nao_configurado` (ninguém aprova a própria).
- `conferencia_consultora`: `autoConsultoraId` presente → `origem:"auto_consultora"`, essa consultora `pode:true`; outra `pode:false`.
- `devolucao`: `ctx.foraPrazo=true` usa `aprovador_devolucao_fora_prazo`; `false` usa `aprovadora_credito_gerente`.
- catálogo: **todo** evento exceto `conferencia_consultora` tem `configKeys.length>0` e `configMulti:true`; `conferencia_consultora` tem `configKeys:[]`+`solicitantePodeAprovar:true`.
- guarda anti-regressão: `grep` não acha `rolesFallback`, `permiteOverride`, `getMasterAdminId`, `registrarOverride` em `src/lib/aprovacoes/` (ou um teste que importa e confirma que a API antiga não existe mais).

## Critérios de aceite

1. `npx tsc --noEmit` → **0 erros**.
2. `npx vitest run src/lib/aprovacoes` → tudo passando.
3. `override-log.ts` removido; `index.ts` sem a API antiga; nenhum uso de cargo/master/override na decisão.
4. `git status` limpo fora de `src/lib/aprovacoes/`; nenhum `import '@/lib/aprovacoes'` em `src/app`/`src/components`.
5. Commit: `refactor(aprovacoes): política config-first estrita (só o configurado decide; sem cargo/master/override)`.
6. Atualizar `00-README.md` (status + a regra) e reportar pro Opus revisar antes da Fase 2.
