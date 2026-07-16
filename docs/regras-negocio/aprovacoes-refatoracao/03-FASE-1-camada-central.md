# FASE 1 — Camada central de autoridade

> **Executor: Sonnet (operacional).** Arquiteto: Opus. Leia `00-README.md`, `01-dossie-dependencias.md`
> e `02-mapa-esbarros.md` ANTES de começar. Este é um pacote auto-contido — você não herda nenhum chat.

## Objetivo

Criar `src/lib/aprovacoes/` — a **fonte única de verdade** que responde, para qualquer evento de
aprovação: *(a)* quem é o aprovador designado, *(b)* quem pode decidir, *(c)* se a decisão é um
override do admin (a logar). Substitui, no futuro, a disputa entre `configuracoes_sistema`,
`roles.ts` e `tarefas_regras_aprovacao`.

## Escopo — LEIA COM ATENÇÃO

**É desta fase:**
- Criar os arquivos da camada `src/lib/aprovacoes/` (tipos, catálogo, autoridade, testes).
- Implementar a **política ALVO já unificada** (a correta), descrita abaixo.
- Testes unitários das funções puras (sem banco).

**NÃO é desta fase (não faça):**
- ❌ **NÃO plugar a camada em nenhum endpoint.** Nenhum arquivo em `src/app/api/` deve importar
  `src/lib/aprovacoes/` nesta fase. A camada nasce **ao lado** do código atual (Strangler Fig).
- ❌ NÃO mudar comportamento de produção. Como nada é plugado, o impacto em prod é **zero**.
- ❌ NÃO tocar no banco (DDL/DML/migration) — isso é da skill `/dba`, em outra fase.
- ❌ NÃO mexer nos endpoints, no `roles.ts` existente, nem no front.

> Por que a política já nasce unificada e não espelhando o atual: a Fase 2 (golden tests) vai
> capturar o comportamento **atual** de cada fluxo. Na Fase 3, ao migrar cada fluxo pra esta camada,
> o golden test **acusa** cada diferença (ex.: "antes diretor não aprovava desconto, agora aprova")
> e o Jonathan valida se é o fix desejado. A divergência é intencional e controlada.

## Arquitetura

```
src/lib/aprovacoes/
  tipos.ts            # EventoAprovacao, ContextoAprovacao, RegraAutoridade, ResultadoDecisao
  catalogo.ts         # CATALOGO: Record<EventoAprovacao, RegraAutoridade> — 1 entrada por evento
  autoridade.ts       # ACESSO_PLENO + funções puras + wrappers async (resolverAprovador/podeDecidir)
  override-log.ts     # registrarOverride() — usa a infra de audit existente (src/lib/audit)
  index.ts            # re-exports públicos
  __tests__/autoridade.test.ts
```

### Decisões de design (não reinvente — implemente exatamente isto)

1. **Uma única lista de "acesso pleno":**
   ```ts
   export const ACESSO_PLENO = ['admin', 'desenvolvedor', 'diretor'] as const;
   ```
   Resolve as 4 definições divergentes (ver mapa §A). Nenhuma outra lista de "acesso total" na camada.

2. **Config-first na resolução do aprovador** (`resolverAprovador`):
   ordem → *(1)* primeira `configKey` com UUID de usuário **ativo** → *(2)* fallback: um usuário com
   a role de `rolesFallback`, **≠ solicitante** → *(3)* último recurso: master
   (`parametros_sistema.MASTER_ADMIN_USER_ID`). **Solicitante nunca é o aprovador**, exceto master
   ou eventos com `solicitantePodeAprovar: true` (ex.: conferência da própria consultora, por desenho).

3. **Política de decisão** (`podeDecidir` → `{ pode, viaOverride }`):
   - `user.id === aprovadorDesignado` → `{ pode: true, viaOverride: false }`.
   - senão, se `regra.permiteOverrideAdmin` **e** `user.role ∈ ACESSO_PLENO` → `{ pode: true, viaOverride: true }` (chamar `registrarOverride`).
   - senão, se `user.role ∈ regra.rolesFallback` **e** não há aprovador designado exclusivo → `{ pode: true, viaOverride: false }`.
   - senão → `{ pode: false }`.
   - Eventos com `permiteOverrideAdmin: false` (ex.: `limpeza_ouro`) **não** aceitam override — só o UUID configurado decide.

4. **Separar lógica pura de I/O** (testabilidade): a decisão é uma **função pura** dado os dados;
   os wrappers async só buscam do banco e chamam a função pura. Os testes unitários cobrem as puras.
   ```ts
   // PURAS (testáveis sem banco):
   export function escolherAprovador(regra, configUUIDs, candidatosRole, solicitanteId): { aprovadorId, origem } | null
   export function avaliarDecisao(userRole, userId, regra, aprovadorDesignado, ctx): { pode, viaOverride, motivo? }
   // ASYNC (I/O — buscam config/usuarios e chamam as puras):
   export async function resolverAprovador(evento, ctx): Promise<{ aprovadorId, origem }>
   export async function podeDecidir(user, evento, tarefa, ctx?): Promise<{ pode, viaOverride, motivo? }>
   ```

### Tipos (`tipos.ts`)

```ts
export type EventoAprovacao =
  | 'desconto' | 'cartao_desconto' | 'credito_gerente' | 'credito_diretor'
  | 'entrega_sem_pagamento' | 'devolucao' | 'devolucao_estoque'
  | 'compra_comercial' | 'compra_metal' | 'recebimento_metal'
  | 'conversao' | 'conversao_sku' | 'precificacao' | 'limpeza_ouro'
  | 'devolver_peca' | 'auditoria' | 'conferencia_consultora' | 'alteracao_venda';

export interface RegraAutoridade {
  evento: EventoAprovacao;
  rotulo: string;
  configKeys: string[];              // chaves em configuracoes_sistema, ordem de precedência; [] = sem config
  configMulti?: boolean;             // valor é lista de UUIDs separada por vírgula (ex.: devolver_peca)
  rolesFallback: readonly string[];  // usado quando a config está vazia/ausente
  permiteOverrideAdmin: boolean;     // ACESSO_PLENO decide mesmo não sendo o designado (com log)
  solicitantePodeAprovar?: boolean;  // por desenho (ex.: conferência da própria consultora)
  camposLock?: string[];             // campos que o fluxo mexe (documentação — ver dossiê R2)
  observacao?: string;
}

export interface ContextoAprovacao {
  solicitanteId?: string;
  vendaId?: number;
  foraPrazo?: boolean;               // devolucao: muda a configKey
  consultoraVendedorId?: number;     // conferencia_consultora: valida "a própria"
  [k: string]: unknown;
}
```

### Catálogo (`catalogo.ts`) — a autoridade ALVO de cada evento

| evento | configKeys | rolesFallback | override admin | nota |
|---|---|---|---|---|
| desconto | `aprovador_desconto_padrao` | ACESSO_PLENO | sim | unifica as 3 portas |
| cartao_desconto | `aprovador_cartao_desconto_padrao` | ACESSO_PLENO | sim | |
| credito_gerente | `aprovadora_credito_gerente` | `gerente_loja` + ACESSO_PLENO | sim | |
| credito_diretor | `aprovador_credito_diretor` | `diretor,admin,desenvolvedor` | sim | |
| entrega_sem_pagamento | `aprovador_entrega_sem_pagamento` | ACESSO_PLENO | sim | hoje exige config; manter |
| devolucao | `aprovadora_credito_gerente` **ou** `aprovador_devolucao_fora_prazo` (se `ctx.foraPrazo`) | `gerente_loja` + ACESSO_PLENO | sim | chave depende do prazo |
| devolucao_estoque | `aprovador_devolucao_estoque` | `gerente_fabrica,estoquista_fabrica` + ACESSO_PLENO | sim | |
| compra_comercial | `aprovador_compra_comercial` | ACESSO_PLENO | sim | |
| compra_metal | `metal_aprovador_id` | ROLES_METAL_APROVACOES | sim | **FIX**: hoje ignora a config |
| recebimento_metal | `metal_aprovador_id` | ROLES_METAL_APROVACOES | sim | **FIX**: idem |
| conversao | — | ACESSO_PLENO | sim | |
| conversao_sku | — | ACESSO_PLENO | sim | |
| precificacao | — (deixar preparado p/ `aprovador_precificacao`) | ACESSO_PLENO | sim | |
| limpeza_ouro | `aprovador_limpeza` | — | **NÃO** | rígido por desenho — só o UUID |
| devolver_peca | `aprovadores_devolver_peca` (multi) | ROLES_ESTOQUE | sim | |
| auditoria | — (preparar `aprovador_auditoria`) | `gerente_loja,gerente_fabrica` + ACESSO_PLENO | sim | **FIX**: hoje é brecha (sem cargo) |
| conferencia_consultora | — | `gerente_loja,gerente_fabrica` + ACESSO_PLENO | sim | `solicitantePodeAprovar: true` |
| alteracao_venda | — | ACESSO_PLENO | sim | era ROLES_FINANCEIRO inline |

> `ROLES_METAL_APROVACOES` e `ROLES_ESTOQUE` já existem em `src/lib/roles.ts` — **importe**, não redefina.

### `override-log.ts`

`registrarOverride(user, evento, alvo)` grava um registro de auditoria quando alguém decide via
override (não sendo o aprovador designado). Na Fase 1, use a infra existente `src/lib/audit`
(`logAudit`) com `operacao: 'APROVACAO_OVERRIDE'` e os metadados (evento, aprovador designado, quem
decidiu). Interface pronta pra Fase 5 evoluir para uma tabela dedicada, se necessário.

## Riscos do dossiê que se aplicam a esta fase

- **R2** (locks dirigem a UI): a camada só **decide**; não escreve nos campos `aprovacao_*_tarefa_id`.
  Documente em `camposLock` quais campos cada evento mexe, pra Fase 3 preservar a semântica.
- **R3** (`desconto_aprovado_por` é o portão): não é tocado nesta fase, mas o catálogo do evento
  `desconto` deve registrar em `camposLock` que o campo canônico do "desconto aprovado" é
  `vendas_erp.desconto_aprovado_por` — a Fase 3 vai unificar as 3 portas nele.
- **R9** (bom): `aprovacoes_tarefa` não tem trigger no banco — a camada pode evoluir a lógica no TS
  sem brigar com o banco.

## Critérios de aceite (objetivos — verificáveis por quem revisar)

1. `npx tsc --noEmit` → **zero erros**.
2. Testes unitários passando, cobrindo no mínimo:
   - config presente → `escolherAprovador` retorna o UUID da config (origem `config`);
   - config vazia → fallback por role, **≠ solicitante** (origem `role_fallback`);
   - sem candidato → master;
   - `avaliarDecisao`: user é o designado → `{pode:true, viaOverride:false}`;
   - admin ≠ designado com `permiteOverrideAdmin:true` → `{pode:true, viaOverride:true}`;
   - `limpeza_ouro` (`permiteOverrideAdmin:false`), admin ≠ UUID → `{pode:false}`;
   - `conferencia_consultora` com `ctx.consultoraVendedorId` batendo o solicitante → `{pode:true}`;
   - teste exaustivo: **todo** `EventoAprovacao` tem entrada em `CATALOGO` e `rolesFallback` válido.
3. **Nenhum** arquivo fora de `src/lib/aprovacoes/` foi modificado (confirme com `git status`).
4. Nenhum `import ... from '@/lib/aprovacoes'` em `src/app/` ou `src/components/`.

## Entrega

- Branch: `feat/centralizar-aprovacoes` (já criada). Commit: `feat: camada central de autoridade de aprovações (fase 1, sem plugar)`.
- Ao terminar: marcar Fase 1 como `[x]` no `00-README.md` e reportar ao Jonathan para o Opus revisar
  antes da Fase 2. **Não** avance pra Fase 2 sozinho.
