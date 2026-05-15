# Plano de Ação — Banco como Fonte da Verdade

> **Versão:** 1.2 — 2026-04-29
> **Autor:** Atlas (analyst) + Jonathan Araújo
> **Status:** Em execução — **cadência de sprints diários** (§11)
> **Branch alvo:** `homolog`
> **Modo de execução:** Sprints diários (~8–12h foco). O que não terminar vira task do dia seguinte. Sem prazo fixo — termina quando todas as 23 stories estiverem concluídas.
>
> ## ⚠️ ALERTA OPERACIONAL
> **Não há banco de teste dedicado.** Por decisão explícita do owner (2026-04-29), os testes integration vão rodar contra **banco de produção** com mitigações estritas (§3.4). Esse é um débito técnico aceito e tem prazo de resolução em ≤ 30 dias úteis (Story 4.7) — antecipado de 90 dias na v1.1.
>
> ## Changelog
> - **v1.2 (2026-04-29):** Substituídos sprints de 3 semanas por **cadência diária**. Nova seção §11 — Cadência Diária. Story 4.7 antecipada para ≤ 30 dias úteis. Pacote Dia 1 definido (§11.2).
> - **v1.1 (2026-04-29):** Removido banco de teste dedicado. Adicionadas mitigações §3.4. Story 4.7 cria banco de teste como débito técnico P1.
> - **v1.0 (2026-04-29):** Versão inicial.

---

## 1. Contexto

O sistema fabricaAJ ERP (Next.js 16 + PostgreSQL/Supabase) cresceu para **310 tabelas + 117 views + 80 triggers + 280+ rotas API** em ~24 meses. A análise diagnóstica realizada em 2026-04-29 identificou **10 problemas críticos** que impedem o banco de ser 100% a fonte da verdade.

### Problemas críticos identificados

| # | Problema | Severidade | Categoria |
|---|----------|-----------|-----------|
| 1 | Sync Tiny fora de transação (`api/contatos/route.ts`) | 🔴 Crítico | Integridade |
| 2 | Ordens de reposição fora de transação (`api/vendas/route.ts`) | 🔴 Crítico | Integridade |
| 3 | IDs de domínio hardcoded em 15+ arquivos | 🔴 Crítico | Acoplamento |
| 4 | Cache `useAuth` sem TTL (role nunca revalida) | 🔴 Crítico | Sincronização |
| 5 | Sync unidirecional Directus → alissonerp (migration 027) | 🔴 Crítico | Sincronização |
| 6 | `fn_processar_fechamento_dist()` acumula sem deduplicação | 🟠 Alto | Integridade |
| 7 | Situações/enums hardcoded no frontend | 🟠 Alto | Acoplamento |
| 8 | Erros silenciados (`.catch(() => {})`) | 🟠 Alto | Observabilidade |
| 9 | Race condition (last-write-wins) sem ETag/version | 🟠 Alto | Concorrência |
| 10 | Dois padrões de dupla-entrada (manual vs `fn_criar_par_movimentacao`) | 🟠 Alto | Consistência |

---

## 2. Objetivos

### 2.1 Objetivo principal

> **Garantir que toda escrita ao banco seja transacional, validada, auditável e que toda leitura no frontend reflita o estado atual do banco em até 5 minutos.**

### 2.2 Objetivos específicos (mensuráveis)

| ID | Objetivo | Métrica | Meta |
|----|----------|---------|------|
| O1 | Zero IDs de domínio hardcoded | `grep -c "deposito_id = 1\|insumo_id = 1\|categoria_id = 2"` em src/app/api | 0 ocorrências |
| O2 | Toda mutação crítica em transação | Auditoria manual + lint rule | 100% das rotas POST/PUT/DELETE financeiras |
| O3 | Cobertura de testes | Vitest coverage report | ≥ 70% em `src/app/api`, ≥ 60% em `src/lib` |
| O4 | E2E dos fluxos críticos | Playwright test count | 12 fluxos cobertos |
| O5 | Documentação sincronizada | CI gate de schema-drift | Schema doc gerado no CI a cada merge |
| O6 | Race conditions impossíveis | Todas mutações usam `version` ou `updated_at` check | 100% das rotas com PUT/PATCH |
| O7 | Drift Tiny/Directus monitorado | Dashboard de divergência | Alerta quando > 5 contatos divergem |

---

## 3. Premissas e Decisões Tomadas

### 3.1 Decisões de stack

| Item | Decisão | Justificativa |
|------|---------|---------------|
| Banco continua | PostgreSQL (Supabase self-hosted) | Funciona, é a fonte da verdade |
| Acesso ao banco | `postgres` npm via `src/lib/db.ts` | Já usado, evita bug `supabase.from()` |
| Validação runtime | **Zod** em todas as rotas | Já instalado, gera tipos + OpenAPI |
| Cliente HTTP / Cache | **TanStack Query (React Query) v5** | Já instalado, resolve cache, race, revalidação |
| Testes unit/integration | **Vitest** | Já configurado, 23 testes existentes |
| Testes E2E | **Playwright** (novo) | Padrão de mercado, suporta Next.js bem |
| CI/CD | **GitHub Actions** + banco de teste dedicado | Gate automático em PRs |
| Documentação API | **OpenAPI 3.1** gerado de Zod schemas | Single source of truth, sem drift |
| Documentação Schema | Script auto-gerador a partir de `information_schema` | Sempre reflete estado real do banco |
| Documentação ADR | Markdown em `docs/adr/NNNN-titulo.md` | Captura "porquê" das decisões |
| Documentação Runbooks | Markdown em `docs/runbooks/` | Procedimentos operacionais |

### 3.2 Decisões estratégicas

| Item | Decisão | Justificativa |
|------|---------|---------------|
| PDV (Directus) | **Manter como está**. Adicionar fila de sync com retry + dashboard de drift | Migrar é épico próprio (3+ meses) |
| Tiny | **Manter sync em background**, mas adicionar fila + retry + alertas | Migrar exigiria reescrever fluxo de sync, fora do escopo |
| Branch de trabalho | **`homolog`** — nunca `main` direto | Política existente do projeto |
| Banco de teste | **Não existe.** Testes integration vão rodar em produção com mitigações estritas (§3.4) | Decisão de Jonathan — sem tempo para provisionar agora. Débito técnico P1 (Story 4.7). |
| Migrações destrutivas | **Proibidas** sem aprovação explícita do Jonathan | Política existente |

### 3.3 Não-objetivos (fora do escopo)

- ❌ Migração do PDV para alissonerp (épico separado)
- ❌ Reescrita de triggers PCP em código aplicação
- ❌ Substituição do Supabase por outro provedor
- ❌ Mudança de Next.js / React (mantém versão atual)
- ❌ Refatoração de UI (mantém componentes atuais)

### 3.4 ⚠️ Mitigações obrigatórias para testes em produção

Como os testes integration e E2E vão rodar contra o banco de produção, **nenhuma execução pode comprometer dados reais ou bloquear operação comercial**. As regras abaixo são obrigatórias e fazem parte do contrato de execução do plano.

#### M1 — Transações sempre revertidas (`BEGIN…ROLLBACK`)

Todo teste integration **DEVE** rodar dentro de transação descartada. Helper obrigatório:

```typescript
// src/test/db.ts
export async function withTestTx<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
  let result: T;
  try {
    await sql.begin(async (tx) => {
      result = await fn(tx);
      throw new ROLLBACK_TEST(); // força rollback sempre
    });
  } catch (e) {
    if (!(e instanceof ROLLBACK_TEST)) throw e;
  }
  return result!;
}
```

Lint rule (custom): nenhum teste em `src/__tests__/**` pode usar `sql\`...\`` ou `db.query` direto — só via `withTestTx`.

#### M2 — Schema dedicado `alissonerp_test`

Para fixtures que precisam persistir entre testes (ex: usuários CI, produtos seed), criar schema isolado:

```sql
CREATE SCHEMA IF NOT EXISTS alissonerp_test;
-- Replicar tabelas críticas (usuarios, produtos, contatos) com dados isolados
```

Testes que precisam de dados pré-existentes leem de `alissonerp_test.*`. Schema é truncado semanalmente por cron.

#### M3 — Marcador de teste obrigatório

Qualquer INSERT em tabela de produção (caso escape do M1) **DEVE** marcar:
- Coluna `criado_por` ou `obs` recebe valor `'CI_TEST_USER'` ou prefixo `'TEST_'`
- Permite limpeza de emergência: `DELETE FROM alissonerp.X WHERE criado_por = 'CI_TEST_USER'`

Lint rule: insere falha CI se INSERT em teste não tiver marcador.

#### M4 — Janela de execução restrita do CI

Pipeline de **integration** e **E2E** roda apenas:
- **22h–6h (horário Brasília)** em dias úteis
- **Qualquer hora** em sábado/domingo

Em horário comercial (8h–22h dias úteis), CI roda apenas: `lint`, `typecheck`, `unit tests` (sem banco).

Configuração via `.github/workflows/ci.yml` com `if: github.event.schedule || (current_hour < 6 || current_hour >= 22)`.

#### M5 — E2E Playwright em modo somente-leitura em produção

Testes Playwright **NÃO PODEM**:
- Clicar em botões "Excluir", "Cancelar", "Enviar"
- Submeter formulários que persistam dados reais
- Modificar configurações do sistema

Testes Playwright **PODEM**:
- Navegar entre telas
- Fazer login com usuário CI dedicado
- Validar que dados existentes aparecem corretamente
- Executar mutations apenas em registros marcados como `criado_por = 'CI_TEST_USER'` no banco

Para fluxos que exigem mutation real (criar venda completa), criar **conta de teste isolada** (`vendedor_id = -1`, `cliente_id = -1`) — entradas são marcadas e auto-excluídas pelo job M6.

#### M6 — Job de limpeza diário

Cron diário às 3h limpa fixtures de teste:

```sql
-- scripts/cleanup-test-fixtures.sql (executado via cron)
DELETE FROM alissonerp.vendas_erp WHERE criado_por = 'CI_TEST_USER' AND criado_em < NOW() - INTERVAL '1 day';
DELETE FROM alissonerp.contatos_fiscais WHERE obs LIKE 'TEST_%' AND criado_em < NOW() - INTERVAL '1 day';
-- ... para cada tabela com possível inserção
```

Dashboard `/api/admin/test-fixtures` mostra contagem por tabela. Alerta se > 100 registros/tabela.

#### M7 — Débito técnico P1: criar banco de teste em até 90 dias

Story **4.7** (Sprint 4) provisiona banco de teste real:
- Opção A: Docker Postgres efêmero local + dump de schema
- Opção B: Supabase de teste (free tier ou paid)
- Decisão tomada quando Jonathan tiver 1–2 dias para configurar

**Prazo máximo:** 90 dias após início do Sprint 1 (ou seja, fim do Sprint 4).

**Sem extensão:** rodar testes em produção é exceção temporária, não permanente.

#### Resumo das mitigações

| Mitigação | Aplica em | Quem implementa |
|-----------|-----------|-----------------|
| M1 — Transações revertidas | Todos integration tests | Backend (Story 2.1) |
| M2 — Schema `alissonerp_test` | Fixtures persistentes | Backend (Story 2.1) |
| M3 — Marcador `CI_TEST_USER` | Qualquer INSERT em prod | Backend (Story 2.1) |
| M4 — Janela noturna | GitHub Actions | DevOps (Story 1.5) |
| M5 — E2E read-only | Playwright | Frontend (Story 2.6) |
| M6 — Job de limpeza | Cron diário 3h | Backend (Story 2.1) |
| M7 — Banco de teste real em 90 dias | Toda infra de teste | Backend (Story 4.7) |

---

## 4. Arquitetura Alvo

### 4.1 Camadas e responsabilidades

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Next.js Client Components)                   │
│  - React Query para fetch + cache + revalidação         │
│  - Zod schemas reutilizados (mesmo do backend)          │
│  - Sem estado de domínio em Zustand                     │
│  - Erros sempre visíveis (toast/banner)                 │
└─────────────────────────────────────────────────────────┘
                           ↕ HTTP + Zod validation
┌─────────────────────────────────────────────────────────┐
│  API Routes (Next.js Server)                            │
│  - Zod parse de input/output em TODAS as rotas          │
│  - Toda mutação em sql.begin() (transação)              │
│  - Permissões validadas no servidor                     │
│  - Logs estruturados em audit_log                       │
└─────────────────────────────────────────────────────────┘
                           ↕ postgres v3 (pool=5)
┌─────────────────────────────────────────────────────────┐
│  PostgreSQL (alissonerp) — FONTE DA VERDADE            │
│  - Constraints NOT NULL / FK / CHECK                    │
│  - Triggers SECURITY DEFINER                            │
│  - RLS por role                                         │
│  - audit_log preenchido em mutations críticas           │
│  - alissonerp.parametros_sistema (substitui hardcoded)  │
└─────────────────────────────────────────────────────────┘
                           ↕ webhooks + sync jobs
┌─────────────────────────────────────────────────────────┐
│  Sistemas Externos (Tiny, Directus, MP, Inter)         │
│  - Fila de sync com retry exponencial                   │
│  - Dashboard de drift (alissonerp.drift_externo)        │
│  - Alertas quando drift > threshold                     │
└─────────────────────────────────────────────────────────┘
```

### 4.2 Padrão de rota API (template alvo)

```typescript
// src/app/api/exemplo/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { sql, normalizeRow } from "@/lib/db";
import { requireAuth } from "@/lib/auth-server";
import { requirePermissao } from "@/lib/permissoes";
import { logAudit } from "@/lib/audit";

const InputSchema = z.object({
  fornecedor_id: z.number().int().positive(),
  observacao: z.string().max(500).optional(),
});

const OutputSchema = z.object({
  id: z.number(),
  status: z.literal("criado"),
});

export async function POST(req: Request) {
  const user = await requireAuth(req);
  await requirePermissao(user, "compras.criar");

  const body = InputSchema.parse(await req.json());

  const result = await sql.begin(async (tx) => {
    const [row] = await tx`
      INSERT INTO alissonerp.compras (fornecedor_id, observacao, criado_por)
      VALUES (${body.fornecedor_id}, ${body.observacao ?? null}, ${user.id})
      RETURNING id
    `;
    await logAudit(tx, {
      tabela: "compras",
      acao: "INSERT",
      registro_id: row.id,
      user_id: user.id,
    });
    return row;
  });

  return NextResponse.json(
    OutputSchema.parse({ id: result.id, status: "criado" }),
    { status: 201 }
  );
}
```

### 4.3 Padrão de hook frontend (template alvo)

```typescript
// src/hooks/useCompras.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/apiFetch";

export function useCompras() {
  return useQuery({
    queryKey: ["compras"],
    queryFn: () => apiFetch<Compra[]>("/api/compras"),
    staleTime: 30_000, // 30s antes de revalidar
  });
}

export function useCriarCompra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompraInput) =>
      apiFetch<Compra>("/api/compras", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["compras"] });
    },
  });
}
```

---

## 5. Plano de 4 Sprints

### Visão geral

```
Sprint 1 (semanas 1-3): FUNDAÇÃO + ESTABILIZAÇÃO
  ├─ alissonerp.parametros_sistema
  ├─ Wrapper Zod nas APIs críticas
  ├─ React Query + Provider global
  ├─ Setup CI (GitHub Actions)
  └─ Correção dos 5 problemas críticos (#1, #2, #3, #4, #5)

Sprint 2 (semanas 4-6): TESTES — PIRÂMIDE COMPLETA
  ├─ Vitest setup com banco de teste
  ├─ Coverage 70% APIs críticas
  ├─ Playwright + 12 fluxos E2E
  └─ CI bloqueia merge se cobertura cair

Sprint 3 (semanas 7-9): REFATORAÇÃO + BLINDAGEM
  ├─ Eliminar erros silenciados
  ├─ Versioning (updated_at check) em PUT/PATCH
  ├─ Audit log em todas mutações críticas
  ├─ Fila de sync com retry (Tiny/Directus)
  ├─ Dashboard de drift externo
  └─ Guard de duplicação em fn_processar_fechamento_dist

Sprint 4 (semanas 10-12): DOCUMENTAÇÃO + AUDITORIA
  ├─ Schema spec auto-gerado
  ├─ OpenAPI 3.1 gerado de Zod
  ├─ ADRs documentando decisões críticas
  ├─ Runbooks operacionais
  └─ Auditoria final + handoff
```

---

### SPRINT 1 — Fundação e Estabilização (semanas 1–3)

#### Objetivo
Eliminar os 5 problemas críticos. Estabelecer fundação (parametros_sistema, Zod, React Query, CI). Sem regressões em produção.

#### Stories

##### Story 1.1 — `alissonerp.parametros_sistema`
**Esforço:** 2 dias
**Owner:** Backend

**Tasks:**
- [ ] Migration `192_parametros_sistema.sql` cria tabela com colunas: `chave VARCHAR PK`, `valor TEXT`, `tipo VARCHAR`, `descricao TEXT`, `atualizado_em TIMESTAMPTZ`
- [ ] Seed inicial: `ALMOXARIFADO_DEPOSITO_ID=1`, `OURO_18K_INSUMO_ID=1`, `PEDRA_CATEGORIA_ID=2`, `LOCAL_ESTOQUE_DEFAULT_ID=1`
- [ ] Helper `src/lib/parametros.ts` com cache em memória + `invalidarParametros()`
- [ ] Substituir 15+ ocorrências hardcoded (lista no Anexo A)
- [ ] Testes: `parametros.test.ts` + integration test em 3 rotas afetadas

**Critério de aceitação:**
- `grep -E "deposito_id\s*=\s*1|insumo_id\s*=\s*1" src/app/api -r` retorna 0
- Helper carregado em < 50ms (medido no CI)
- Mudança de parâmetro no banco reflete no app sem deploy

##### Story 1.2 — Sync Tiny e ordens de reposição em transação
**Esforço:** 3 dias
**Owner:** Backend

**Tasks:**
- [ ] `api/contatos/route.ts`: criar `alissonerp.fila_sync_externo` (id, sistema, payload, status, tentativas, criado_em, ultimo_erro, processado_em)
- [ ] Mover `syncContatoToTiny` para job que consome a fila (cron 1min)
- [ ] `api/vendas/route.ts`: criar ordens de reposição **dentro** do `sql.begin()` da venda
- [ ] Migration cria fila + índices `(status, criado_em)`
- [ ] Endpoint `/api/admin/fila-sync` para visualizar fila

**Critério de aceitação:**
- Test integration: forçar erro no Tiny → contato criado no banco, item na fila com `status='pendente'`
- Test integration: forçar erro em ordem de reposição → venda inteira sofre rollback
- Sem chamadas HTTP fora de transação em rotas POST de mutação

##### Story 1.3 — useAuth com React Query + TTL
**Esforço:** 2 dias
**Owner:** Frontend

**Tasks:**
- [ ] Adicionar `<QueryClientProvider>` no root layout
- [ ] Reescrever `src/hooks/useAuth.ts` usando `useQuery({ staleTime: 5*60_000 })`
- [ ] Invalidar query ao receber evento `auth.onAuthStateChange`
- [ ] Adicionar botão admin "Forçar revalidação de permissões de [user]"
- [ ] Migrar componentes que usam `useAuth` (verificar não há breaking change)

**Critério de aceitação:**
- Mudar role de usuário no banco → frontend reflete em até 5 minutos sem logout
- Test E2E: admin troca role de consultora → consultora vê novo acesso após refresh
- Sem regressões em telas que usam `useAuth`

##### Story 1.4 — Wrapper Zod e helpers de auth/permissão
**Esforço:** 3 dias
**Owner:** Backend

**Tasks:**
- [ ] Criar `src/lib/api-handler.ts` com `defineRoute({ schema, handler })`
- [ ] Criar `src/lib/audit.ts` com `logAudit(tx, { tabela, acao, registro_id, user_id, dados })`
- [ ] Criar `src/lib/auth-server.ts` consolidando `requireAuth` e `requirePermissao`
- [ ] Migrar 5 rotas piloto (`compras`, `vendas`, `crediario`, `contatos`, `pcp/apontamentos`) para o wrapper
- [ ] Documentar pattern em `docs/adr/0001-zod-validation-wrapper.md`

**Critério de aceitação:**
- 5 rotas piloto usam wrapper com schemas Zod
- Logs de auditoria gravados em `audit_log` para essas rotas
- TypeScript infere tipos do schema (sem casting manual)

##### Story 1.5 — CI: GitHub Actions com janela restrita (produção)
**Esforço:** 3 dias
**Owner:** DevOps + Backend

**⚠️ Particularidade:** sem banco de teste, integration tests rodam em produção respeitando M4 (janela 22h–6h).

**Tasks:**
- [ ] Criar `.github/workflows/ci-fast.yml` com jobs: `lint`, `typecheck`, `unit` — roda em todo PR, qualquer hora
- [ ] Criar `.github/workflows/ci-integration.yml` com jobs: `integration`, `e2e` — roda apenas 22h–6h ou fim de semana
- [ ] Workflow integration usa secret `DATABASE_URL` de produção (mesma do app) com usuário CI dedicado (`ci_test_user` no Supabase)
- [ ] Schedule cron: roda full suite às 23h diariamente
- [ ] PR template em `.github/pull_request_template.md` (incluir checklist M1–M5)
- [ ] Branch protection: `main` bloqueia merge se `ci-fast` falhar; **integration pode estar pendente** (não-bloqueante para urgência)
- [ ] Notificação Slack/Telegram quando integration noturno falhar

**Critério de aceitação:**
- PR aberto às 14h roda apenas lint+typecheck+unit (em < 3min)
- PR mergeado em homolog dispara integration na próxima janela noturna
- Falha noturna gera alerta para Jonathan
- 23 testes existentes passam contra produção respeitando M1 (transação revertida)

##### Story 1.6 — Sync Directus com monitoramento
**Esforço:** 3 dias
**Owner:** Backend

**Tasks:**
- [ ] Criar `alissonerp.drift_directus` (view ou tabela materializada): ordens só no Directus, ordens divergentes em campos críticos
- [ ] Job cron a cada 15min que popula a tabela
- [ ] Endpoint `/api/admin/drift-directus` para dashboard
- [ ] Notificação automática quando drift > 5 ordens

**Critério de aceitação:**
- Dashboard mostra drift atual com filtros por data e severidade
- Alerta dispara em < 30min quando drift cresce

#### Saída do Sprint 1
- ✅ 5 problemas críticos resolvidos
- ✅ Fundação Zod + React Query + CI estabelecida
- ✅ 5 rotas piloto usando wrapper
- ✅ Banco de teste configurado
- ✅ Dashboard de drift Directus

---

### SPRINT 2 — Pirâmide de Testes (semanas 4–6)

#### Objetivo
Atingir 70% de cobertura em rotas API críticas. Implementar 12 E2E em fluxos principais. CI bloqueia regressões.

#### Stories

##### Story 2.1 — Setup ambiente de teste em produção (com mitigações §3.4)
**Esforço:** 4 dias (era 2, +2 pelas mitigações)
**Owner:** Backend

**⚠️ Crítico:** essa story é o **gate de segurança** que protege produção. Não pode ser comprometida.

**Tasks:**
- [ ] **M1**: Criar `src/test/db.ts` com `withTestTx` (helper obrigatório para integration tests)
- [ ] **M1**: Lint rule custom em `.eslintrc.js` que falha se `sql\`...\`` aparecer em `__tests__/` fora de `withTestTx`
- [ ] **M2**: Migration `193_schema_alissonerp_test.sql` cria schema isolado com tabelas `usuarios`, `produtos`, `contatos_fiscais`, `vendedores`, `clientes_test` (cópia estrutural, não dados)
- [ ] **M2**: Seed inicial em `alissonerp_test`: 1 usuário por role (10 roles), 5 produtos, 3 fornecedores, 2 vendedores
- [ ] **M3**: Criar usuário Supabase `ci_test_user` com role `desenvolvedor` (acesso total mas marcado)
- [ ] **M3**: Helper `criarRegistroMarcado(tabela, dados)` que injeta `criado_por: 'CI_TEST_USER'` automaticamente
- [ ] **M6**: Migration `194_cleanup_test_fixtures.sql` cria função `alissonerp.fn_limpar_fixtures_teste()` que deleta marcados > 1 dia
- [ ] **M6**: Cron diário 3h chama `fn_limpar_fixtures_teste()`
- [ ] **M6**: Endpoint `/api/admin/test-fixtures` com contagem por tabela e botão "Limpar agora"
- [ ] Criar `src/test/fixtures.ts` com factories que usam `alissonerp_test` schema
- [ ] Documentar regras em `docs/runbooks/runbook-testes-em-producao.md` (DEVE ser lido antes de escrever qualquer test)

**Critério de aceitação:**
- `withTestTx` força ROLLBACK mesmo se teste passar
- Lint rule bloqueia teste sem `withTestTx`
- Schema `alissonerp_test` existe e está populado
- Job cron limpa fixtures > 24h diariamente
- Dashboard mostra 0 fixtures órfãs após primeira semana

##### Story 2.2 — Cobertura unit/integration: módulo Vendas
**Esforço:** 4 dias
**Owner:** Backend

**Tasks:**
- [ ] Testes para `api/vendas` POST/PUT/DELETE (todos os ramos)
- [ ] Testes para validação de desconto (`validarDescontos`)
- [ ] Testes para criação de ordens de reposição
- [ ] Testes para vale-troca (cadeia de origem)
- [ ] Testes para pagamentos múltiplos

**Critério de aceitação:**
- Coverage `api/vendas` ≥ 80%
- Coverage `lib/validar-descontos.ts` ≥ 90%

##### Story 2.3 — Cobertura: módulo PCP + Estoque
**Esforço:** 4 dias
**Owner:** Backend

**Tasks:**
- [ ] Testes para `api/pcp/apontamentos` (todos os 9 tipos)
- [ ] Testes para `api/distribuicao/apontamentos`
- [ ] Testes para `api/estoque/transferir-local` (dupla-entrada manual)
- [ ] Testes para `api/service/carregar-aditivo` e `carregar-solda`
- [ ] Testes para `vw_saldo_estoque` (validar agregação SUM(saldo))

**Critério de aceitação:**
- Coverage `api/pcp/*` ≥ 75%
- Coverage `api/distribuicao/*` ≥ 75%
- Coverage `api/estoque/*` ≥ 75%

##### Story 2.4 — Cobertura: módulo Protocolo + Crediário
**Esforço:** 3 dias
**Owner:** Backend

**Tasks:**
- [ ] Testes para `api/protocolo/concluir` (direção ida vs volta)
- [ ] Testes para `api/protocolo/criar`
- [ ] Testes para `api/crediario/[id]/registrar-pagamento`
- [ ] Testes para `api/crediario/[id]/verificar-mp`

**Critério de aceitação:**
- Coverage `api/protocolo/*` ≥ 70%
- Coverage `api/crediario/*` ≥ 80%

##### Story 2.5 — Setup Playwright
**Esforço:** 2 dias
**Owner:** Frontend

**Tasks:**
- [ ] Instalar `@playwright/test`
- [ ] Configurar `playwright.config.ts` (3 navegadores, retry 2x, screenshot em falha)
- [ ] Criar fixtures de auth: usuário admin, gerente_loja, consultora, ourives, pcp
- [ ] Adicionar job `e2e` no CI (roda em paralelo com `test`)

**Critério de aceitação:**
- `npm run test:e2e` roda localmente
- CI executa Playwright em PRs com screenshots de falha

##### Story 2.6 — 12 E2E críticos (read-only em produção, M5)
**Esforço:** 5 dias
**Owner:** Frontend + QA

**⚠️ Restrição M5:** E2E em produção **NÃO** pode criar/alterar/deletar dados reais. Fluxos com mutation usam conta de teste isolada (`vendedor_id = -1`, marcadores `CI_TEST_USER`) e dependem de Story 2.1 estar completa.

**Fluxos cobertos:**

**Read-only (validação de UI contra dados reais):**
1. Login + ver permissões (cada role) — só lê `/api/user/role` e `/permissoes`
2. Dashboard fábrica: KPIs aparecem e somam corretamente — só leitura
3. Cofre ouro: saldo é exibido — só leitura
4. Lista de vendas: filtros funcionam, paginação correta — só leitura
5. Lista de PCP: ordens em cada etapa aparecem — só leitura
6. Estoque comercial: saldos consolidados aparecem — só leitura

**Mutation isolada (usando `alissonerp_test` ou marcador):**
7. Criar venda completa em conta de teste (cliente=-1, vendedor=-1, marcador `CI_TEST_USER`)
8. Aprovar desconto em venda de teste (cadeia: consultora-test pede → admin-test aprova)
9. Criar ordem PCP + apontamento em produto de teste
10. Concluir protocolo de teste (ida)
11. Crediário: registrar pagamento parcial em conta de teste
12. Estoque: transferir entre locais usando produto de teste

**Tasks:**
- [ ] Setup Playwright com fixture `ci_test_user`
- [ ] Implementar 6 testes read-only (rápidos, baixo risco)
- [ ] Implementar 6 testes com mutation (depende de Story 2.1)
- [ ] Cada teste de mutation valida no banco que registro tem marcador `CI_TEST_USER`
- [ ] Job cron M6 limpa registros gerados pelos E2E

**Critério de aceitação:**
- 12/12 testes passam em CI noturno
- Zero registros sem marcador criados pelos E2E
- Cada teste valida banco diretamente após mutation (não só UI)
- Tempo total < 10 minutos
- Job de limpeza confirma 0 órfãos no dia seguinte

#### Saída do Sprint 2
- ✅ Coverage 70% APIs críticas (vendas, pcp, estoque, protocolo, crediário)
- ✅ 12 E2E cobrindo fluxos principais
- ✅ CI bloqueia merge se coverage cair
- ✅ Banco de teste com fixtures versionadas

---

### SPRINT 3 — Refatoração + Blindagem (semanas 7–9)

#### Objetivo
Eliminar erros silenciados, implementar versioning para evitar race conditions, expandir audit log, blindar sincronização externa, fix de duplicação em PCP.

#### Stories

##### Story 3.1 — Caça aos erros silenciados
**Esforço:** 3 dias
**Owner:** Frontend

**Tasks:**
- [ ] Grep `\.catch\(\(\) => \{\}\)` e `\.catch\(\(\) => null\)` em `src/`
- [ ] Cada caso: substituir por toast ou log de erro
- [ ] Criar `src/components/ErrorBoundary.tsx` global
- [ ] Lint rule (eslint custom) que proíbe catch vazio

**Critério de aceitação:**
- Zero `.catch(() => {})` em `src/`
- ESLint falha se novo catch vazio for introduzido
- Toda chamada API com falha mostra feedback ao usuário

##### Story 3.2 — Versioning em mutações concorrentes
**Esforço:** 4 dias
**Owner:** Backend

**Tasks:**
- [ ] Adicionar coluna `updated_at` (já existe na maioria) + trigger de auto-update
- [ ] Wrapper `defineRoute` aceita `versionField: "updated_at"` para PUT/PATCH
- [ ] Cliente envia `updated_at` no body de PUT; servidor compara antes de atualizar
- [ ] Status 409 Conflict + payload com versão atual quando conflitante
- [ ] Frontend trata 409: mostra "Outro usuário alterou. Recarregar?"

**Critério de aceitação:**
- Test integration: 2 PUTs simultâneos → primeiro vence, segundo recebe 409
- Aplicado em: vendas, ordens, protocolos, crediário (top 4 mais críticos)

##### Story 3.3 — Audit log completo
**Esforço:** 3 dias
**Owner:** Backend

**Tasks:**
- [ ] Schema `alissonerp.audit_log` com campos: `id`, `tabela`, `acao`, `registro_id`, `user_id`, `dados_antes`, `dados_depois`, `criado_em`, `ip`, `user_agent`
- [ ] Helper `logAudit` chamado dentro do `sql.begin()` em todas mutações
- [ ] Endpoint `/api/admin/audit-log` com filtros (usuário, tabela, data)
- [ ] Cron de limpeza: arquiva > 90 dias em `audit_log_archive`

**Critério de aceitação:**
- 100% das rotas POST/PUT/DELETE em alissonerp gravam audit_log
- Dashboard admin mostra histórico de qualquer registro

##### Story 3.4 — Fila de sync externo + retry
**Esforço:** 4 dias
**Owner:** Backend

**Tasks:**
- [ ] Schema `alissonerp.fila_sync_externo` (já criado em 1.2, expandir)
- [ ] Worker (cron 1min) que processa fila com retry exponencial (1m, 5m, 15m, 1h, 6h)
- [ ] Após 5 tentativas, marca como `falha_definitiva` + alerta
- [ ] Dashboard `/api/admin/fila-sync` com filtros
- [ ] Painel para reprocessar manualmente

**Critério de aceitação:**
- Falha temporária do Tiny: contato é sincronizado quando volta
- Falha permanente: alerta após 5 tentativas
- Dashboard mostra status real-time

##### Story 3.5 — Guard de duplicação em fechamento de distribuição
**Esforço:** 2 dias
**Owner:** Backend (banco)

**Tasks:**
- [ ] Migration adiciona índice único: `idx_unico_fechamento_dist (distribuicao_id) WHERE status = 'concluido'`
- [ ] `fn_processar_fechamento_dist` checa se já existe fechamento concluído antes de acumular
- [ ] Erro custom `'distribuicao_ja_fechada'` se tentar reprocessar
- [ ] Frontend trata erro com mensagem clara

**Critério de aceitação:**
- Test: tentar fechar mesma distribuição 2x → segundo retorna erro
- Totais PCP nunca duplicam

##### Story 3.6 — Unificar dupla-entrada
**Esforço:** 3 dias
**Owner:** Backend

**Tasks:**
- [ ] Decidir padrão único: **manual com 2 INSERTs** (mais auditável que function)
- [ ] Refatorar `fn_criar_par_movimentacao` para retornar IDs gerados
- [ ] Documentar padrão em `docs/adr/0002-dupla-entrada-pattern.md`
- [ ] Migrar `api/service/carregar-aditivo` e `carregar-solda` para padrão único

**Critério de aceitação:**
- Zero divergência: todas dupla-entradas seguem mesmo padrão
- Tests cobrem o padrão escolhido

#### Saída do Sprint 3
- ✅ Zero erros silenciados
- ✅ Race conditions eliminadas (top 4 entidades)
- ✅ Audit log universal
- ✅ Sync Tiny/Directus blindado com retry
- ✅ Duplicação em PCP impossível
- ✅ Padrão único de dupla-entrada

---

### SPRINT 4 — Documentação + Auditoria Final (semanas 10–12)

#### Objetivo
Produzir documentação completa, auto-gerada e versionada. Auditoria final do plano e handoff.

#### Stories

##### Story 4.1 — Schema spec auto-gerado
**Esforço:** 3 dias
**Owner:** Backend

**Tasks:**
- [ ] Script `scripts/generate-schema-doc.ts` que extrai do `information_schema`:
  - Tabelas: nome, colunas (tipo, NOT NULL, default, comment), PK, FKs, índices
  - Views: nome, definição SQL
  - Triggers: nome, tabela, função, evento, condição
  - Funções: nome, parâmetros, retorno, body
- [ ] Output em `docs/schema/alissonerp.md`, `docs/schema/public.md`, `docs/schema/directus.md`
- [ ] Job CI `schema-sync.yml` regenera doc a cada push em homolog
- [ ] Falha CI se schema mudou e doc não foi commitado

**Critério de aceitação:**
- Doc reflete estado real do banco
- Mudança de schema sem update do doc bloqueia merge

##### Story 4.2 — OpenAPI 3.1 gerado de Zod
**Esforço:** 4 dias
**Owner:** Backend

**Tasks:**
- [ ] Adicionar `zod-to-openapi`
- [ ] Cada `defineRoute` registra schema no `OpenAPIRegistry` global
- [ ] Endpoint `/api/openapi.json` serve spec
- [ ] Página `/docs/api` (Swagger UI) renderiza spec
- [ ] Script gera `docs/api/openapi.json` versionado

**Critério de aceitação:**
- 100% das rotas com `defineRoute` aparecem no OpenAPI
- Swagger UI navegável e testável
- Spec versionada no git

##### Story 4.3 — ADRs críticos
**Esforço:** 3 dias
**Owner:** Architect/Analyst

**ADRs a criar:**
- [ ] `0001-zod-validation-wrapper.md` — porquê Zod em todas rotas
- [ ] `0002-dupla-entrada-pattern.md` — padrão único de dupla-entrada
- [ ] `0003-react-query-cache-strategy.md` — stale time, invalidação
- [ ] `0004-audit-log-strategy.md` — escopo e retenção
- [ ] `0005-sync-externo-fila.md` — retry exponencial, deadletter
- [ ] `0006-versioning-mutations.md` — updated_at check, 409
- [ ] `0007-banco-fonte-da-verdade.md` — princípio rector
- [ ] `0008-parametros-sistema.md` — substituição de IDs hardcoded
- [ ] `0009-test-strategy.md` — pirâmide, cobertura, ambientes
- [ ] `0010-directus-tiny-sync.md` — decisão de não migrar

**Critério de aceitação:**
- 10 ADRs em `docs/adr/`
- Template padrão Michael Nygard (Status, Context, Decision, Consequences)

##### Story 4.4 — Runbooks operacionais
**Esforço:** 3 dias
**Owner:** Backend + DevOps

**Runbooks a criar:**
- [ ] `runbook-restaurar-backup.md`
- [ ] `runbook-pcp-totais-divergentes.md`
- [ ] `runbook-fila-sync-falha.md`
- [ ] `runbook-drift-directus.md`
- [ ] `runbook-deploy-homolog.md`
- [ ] `runbook-rollback-migration.md`
- [ ] `runbook-onboarding-dev.md`
- [ ] `runbook-rotacao-secrets.md`

**Critério de aceitação:**
- 8 runbooks em `docs/runbooks/`
- Cada um testado por outra pessoa (não autor)

##### Story 4.5 — Atualização docs existentes
**Esforço:** 2 dias
**Owner:** Analyst

**Tasks:**
- [ ] Atualizar `docs/arquitetura.md` com novas decisões
- [ ] Atualizar `ESTRUTURA_ATUAL.md` com novos componentes
- [ ] Atualizar `CLAUDE.md` para refletir novas regras (Zod, audit log, versioning)
- [ ] Atualizar `MEMORY.md` index com novos memory files

**Critério de aceitação:**
- Toda doc da regra 9 do CLAUDE.md está sincronizada

##### Story 4.6 — Auditoria final + relatório
**Esforço:** 2 dias
**Owner:** Analyst (Atlas) + QA

**Tasks:**
- [ ] Re-rodar análise diagnóstica original
- [ ] Comparar resultados antes/depois
- [ ] Confirmar que os 10 problemas estão resolvidos
- [ ] Relatório executivo `docs/auditoria-final-2026.md`
- [ ] Apresentação para Jonathan

**Critério de aceitação:**
- 10/10 problemas críticos resolvidos
- Métricas O1–O7 atingidas
- Relatório aprovado pelo Jonathan

##### Story 4.7 — Débito técnico P1: Provisionar banco de teste real (M7)
**Esforço:** 3 dias
**Owner:** Backend + DevOps
**Prazo limite:** 90 dias após início Sprint 1 (não pode ser adiado)

**Contexto:** Esta story salda o débito técnico aceito em §3.4 (testes em produção foi medida temporária).

**Tasks:**
- [ ] Decidir abordagem (Docker efêmero local OU Supabase de teste novo)
- [ ] Documentar decisão em `docs/adr/0011-banco-de-teste.md`
- [ ] Provisionar banco
- [ ] `scripts/sync-schema-to-test.sh` que copia schema (sem dados sensíveis) de produção semanalmente
- [ ] Migrar todos os integration tests para apontar ao banco de teste
- [ ] Atualizar `ci-integration.yml`: remover restrição de janela noturna (M4 não é mais necessário)
- [ ] Remover schema `alissonerp_test` de produção (M2 não é mais necessário em produção)
- [ ] Manter M3 (marcador `CI_TEST_USER`) e M6 (job de limpeza) por mais 30 dias como rede de proteção

**Critério de aceitação:**
- 100% dos integration tests rodam contra banco de teste
- Zero acesso de CI ao banco de produção (auditável em pg_stat_activity)
- CI roda em qualquer horário (sem janela restrita)
- Dashboard de fixtures órfãs em produção mostra 0 após 7 dias

#### Saída do Sprint 4
- ✅ Schema spec auto-gerado e versionado
- ✅ OpenAPI 3.1 completo
- ✅ 10 ADRs documentadas (+ 1 sobre banco de teste = 11 total)
- ✅ 8 runbooks operacionais
- ✅ Toda doc sincronizada
- ✅ Auditoria final aprovada
- ✅ **Banco de teste real provisionado** (saldo do débito técnico M7)

---

## 6. Estrutura Final de Documentação

```
docs/
├── arquitetura.md                      # Atualizada (existe, 140KB)
├── CHANGELOG.md                        # Existe
├── ESTRUTURA_ATUAL.md                  # Atualizada
├── plano-fonte-da-verdade.md           # Este documento
├── auditoria-final-2026.md             # Sprint 4
│
├── adr/                                # Architecture Decision Records
│   ├── 0001-zod-validation-wrapper.md
│   ├── 0002-dupla-entrada-pattern.md
│   ├── 0003-react-query-cache-strategy.md
│   ├── 0004-audit-log-strategy.md
│   ├── 0005-sync-externo-fila.md
│   ├── 0006-versioning-mutations.md
│   ├── 0007-banco-fonte-da-verdade.md
│   ├── 0008-parametros-sistema.md
│   ├── 0009-test-strategy.md
│   └── 0010-directus-tiny-sync.md
│
├── runbooks/                           # Procedimentos operacionais
│   ├── runbook-restaurar-backup.md
│   ├── runbook-pcp-totais-divergentes.md
│   ├── runbook-fila-sync-falha.md
│   ├── runbook-drift-directus.md
│   ├── runbook-deploy-homolog.md
│   ├── runbook-rollback-migration.md
│   ├── runbook-onboarding-dev.md
│   └── runbook-rotacao-secrets.md
│
├── schema/                             # Auto-gerado
│   ├── alissonerp.md
│   ├── public.md
│   └── directus.md
│
└── api/                                # Auto-gerado
    └── openapi.json
```

---

## 7. Estrutura de Testes

```
src/
├── __tests__/                          # 23 testes existentes (manter)
├── test/
│   ├── fixtures.ts                     # Factories de dados
│   ├── db.ts                           # withTestTx helper
│   └── setup.ts                        # Setup global (vitest.setup)
│
tests/
└── e2e/                                # Playwright
    ├── auth/
    ├── vendas/
    ├── pcp/
    ├── distribuicao/
    ├── protocolo/
    ├── crediario/
    └── helpers/

scripts/
├── setup-test-db.ts                    # Prepara banco de teste
├── seed-test-db.ts                     # Insere fixtures
├── generate-schema-doc.ts              # Gera docs/schema/*
└── generate-openapi.ts                 # Gera docs/api/openapi.json

vitest.config.ts                        # Atualizado: coverage thresholds
playwright.config.ts                    # Novo
```

### Coverage targets (vitest.config.ts)

```typescript
coverage: {
  thresholds: {
    "src/lib/**": { lines: 60, functions: 60, branches: 50 },
    "src/app/api/**": { lines: 70, functions: 70, branches: 60 },
    "src/app/api/vendas/**": { lines: 80, functions: 80, branches: 70 },
    "src/app/api/crediario/**": { lines: 80, functions: 80, branches: 70 },
  }
}
```

---

## 8. CI/CD — GitHub Actions (com janela restrita)

```
.github/
├── workflows/
│   ├── ci-fast.yml                     # Lint + typecheck + UNIT em todo PR (qualquer hora)
│   ├── ci-integration.yml              # Integration + E2E APENAS 22h-6h ou fim-de-semana (M4)
│   ├── schema-sync.yml                 # Regenera schema doc em push homolog
│   └── deploy-homolog.yml              # Deploy automático em push homolog
└── pull_request_template.md            # Inclui checklist M1-M5
```

### Pipeline `ci-fast.yml` (sempre, qualquer hora)

```yaml
on: [pull_request, push]
jobs:
  lint:           # eslint (inclui regra anti-hardcoded e anti-catch-vazio)
  typecheck:      # tsc --noEmit
  unit:           # vitest run --project=unit (sem banco)
  build:          # next build
```

### Pipeline `ci-integration.yml` (janela noturna apenas)

```yaml
on:
  schedule:
    - cron: '0 1 * * *'  # 01h UTC = 22h Brasília
  pull_request:
    types: [labeled]      # roda sob demanda com label "run-integration"

jobs:
  integration:    # vitest run --project=integration (usa withTestTx em produção)
    if: |
      github.event_name == 'schedule' ||
      contains(github.event.pull_request.labels.*.name, 'run-integration')
  e2e:            # playwright test (read-only ou marcador CI_TEST_USER)
    needs: integration
```

**Branch protection em `main`:**
- Requer PR aprovado
- Requer `ci-fast` verde (lint + typecheck + unit + build)
- `ci-integration` é **não-bloqueante** mas auditado (Jonathan recebe alerta se falhar 2 noites seguidas)
- Requer status `coverage-not-decreased`
- Requer status `schema-doc-synced`

**Branch protection em `homolog`:**
- Requer `ci-fast` verde
- Push direto permitido para hotfix urgente

---

## 9. Métricas de Sucesso

| ID | Métrica | Baseline (hoje) | Meta (fim Sprint 4) |
|----|---------|-----------------|---------------------|
| M1 | IDs hardcoded em src/app/api | 15+ | 0 |
| M2 | Rotas com Zod validation | 5% | 100% das rotas POST/PUT/DELETE |
| M3 | Coverage src/app/api | ? (não medido) | ≥ 70% |
| M4 | Coverage src/lib | ? (não medido) | ≥ 60% |
| M5 | E2E tests | 0 | 12 |
| M6 | Erros silenciados (`.catch(() => {})`) | ~10 | 0 |
| M7 | Rotas com versioning (PUT/PATCH) | 0 | top 4 entidades |
| M8 | Tabelas com audit_log | 1 (audit_log existe mas pouco usado) | 100% mutações críticas |
| M9 | Drift Directus monitorado | Não | Sim (dashboard + alertas) |
| M10 | Tempo entre mudança no banco e refresh no frontend | ∞ (até logout) | ≤ 5min (via React Query) |

---

## 10. Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| **🔴 Teste em produção polui dados reais** | Alta | **Crítico** | M1 (rollback obrigatório) + M3 (marcador) + M6 (job de limpeza diário) + lint rule + auditoria semanal |
| **🔴 Teste em produção causa lock em horário comercial** | Média | **Crítico** | M4 (janela 22h–6h) + M5 (E2E read-only) + alerta de transação > 30s |
| **🔴 Helper `withTestTx` falha e commit vaza** | Baixa | **Crítico** | Lint rule custom + code review obrigatório + auditoria de `criado_por='CI_TEST_USER'` semanal |
| Migração de hardcoded IDs quebra rota não testada | Média | Alto | Sprint 1 inclui story de testes piloto. Sprint 2 atinge 70% coverage. |
| React Query introduz regressões em telas existentes | Média | Médio | Feature flag por tela. Migração gradual. Manter useState como fallback. |
| Playwright lento no CI | Alta | Baixo | Paralelização (3 workers). Subset crítico em PR, full suite em nightly. |
| **Story 4.7 (banco de teste) é adiada além de 90 dias** | Média | Alto | **Hard deadline:** se não cumprir, congelar novos testes integration até banco existir. |
| Audit log enche disco | Baixa | Médio | Retenção 90 dias + arquivamento. Particionamento por mês. |
| Versioning quebra integração com PDV (Directus) | Média | Alto | Versioning só nas top 4 entidades em alissonerp. PDV continua sem versioning. |
| Esforço estimado errado | Alta | Médio | Buffer de 20% por sprint. Re-priorização ao fim de cada sprint. |
| Jonathan precisa intervir muito | Baixa | Alto | Stories são auto-contidas. QA bloqueia em vez de Jonathan. |
| **CI noturno acessa produção em horário não autorizado** | Baixa | Alto | Auditoria diária de `pg_stat_activity` por usuário `ci_test_user` — alerta se acesso fora da janela |

---

## 11. Cadência Diária

### 11.1 Por que sprints diários

Decisão do owner (Jonathan, 2026-04-29): a urgência de blindar o sistema não tolera sprints de 3 semanas. Em vez disso:

- **Cada dia** entrega o que cabe em ~8–12h focadas
- **O que sobra** vira task do dia seguinte
- **Sem prazo fixo** — termina quando todas as 23 stories estiverem concluídas
- **Estimativa realista:** 12–18 dias úteis para fechar todo o plano (assumindo ~1.3 stories/dia em média, com agentes em paralelo)

### 11.2 Pacote Dia 1 — Blindagem Imediata

Stories que cabem hoje (~11h foco). Todas marcadas como **🔥 hoje** no tracker.

| # | Story | Tempo | Owner | Resolve |
|---|-------|-------|-------|---------|
| 1 | **Story 1.1** — `parametros_sistema` + substituir 15+ IDs hardcoded | 3h | Backend | Problema #3 |
| 2 | **Story 1.2 (parcial)** — Ordens de reposição em tx | 1h | Backend | Problema #2 |
| 3 | **Story 1.2 (parcial)** — Fila `fila_sync_externo` + sync Tiny | 2h | Backend | Problema #1 |
| 4 | **Story 1.3 (mini)** — TTL 5min no useAuth (sem React Query ainda) | 1h | Frontend | Problema #4 |
| 5 | **Story 3.5** — Guard anti-duplicação em `fn_processar_fechamento_dist` | 1h | Backend | Problema #6 |
| 6 | **Story 3.1 (parcial)** — Caça aos `.catch(() => {})` + toasts | 1.5h | Frontend | Problema #8 |
| 7 | **Story 3.3 (parcial)** — Audit log nas 5 rotas mais críticas | 1.5h | Backend | Forense mínimo |

**Total:** ~11h. Itens em paralelo entre Backend e Frontend.

### 11.3 Stories adiadas para Dia 2+

Migração completa do useAuth para React Query, versioning anti-race, audit log universal, fila com retry exponencial completa, dashboard de drift Directus, todos os itens de Sprint 2 (testes), Sprint 3 (refinamento) e Sprint 4 (documentação).

Cada dia o `@aiox-master` consulta a TaskList, escolhe o que cabe nas próximas 8–12h e delega.

### 11.4 Daily Standup (formato curto)

Ao início de cada dia, gerar:

```
🔥 ONTEM: <stories concluídas>
🟡 HOJE:  <stories que cabem em ~11h>
🔴 BLOQUEIOS: <itens travados, dependências ausentes>
📊 PROGRESSO: <X de 23 stories concluídas, Y%>
```

Salvar em `docs/standups/YYYY-MM-DD.md`.

### 11.5 Critério de "Dia Concluído"

- ✅ Todas as stories do dia testadas em homolog
- ✅ `tsc --noEmit` passa sem erros
- ✅ Commit + push em homolog
- ✅ Jonathan aprova → push em main (regra do CLAUDE.md mantida)
- ✅ Tasks atualizadas (TaskUpdate completed)
- ✅ Standup do próximo dia rascunhado

### 11.6 Critério de "Plano Concluído"

- ✅ 23 stories em status `completed`
- ✅ 10 KPIs (M1–M10) atingidos
- ✅ Story 4.6 — Auditoria final aprovada por Jonathan
- ✅ Story 4.7 — Banco de teste real provisionado

---

## 12. Próximos Passos (operacional)

### 12.1 Imediato (Dia 1, hoje)
1. **Atlas (eu)** — entrega plano v1.2 ✅
2. **@aiox-master** — recebe handoff e orquestra Pacote Dia 1
3. **@backend** — executa Stories 1.1, 1.2, 3.5, 3.3 (parcial)
4. **@frontend** — executa Stories 1.3 (mini), 3.1 (parcial)
5. **@qa** — revisa cada item antes de push em homolog
6. **Jonathan** — testa em homolog → autoriza push em main
7. **@devops** — executa pushes
8. **@aiox-master** — fecha Daily Standup e abre Dia 2

### 12.2 Cadência contínua
A cada dia útil (até completar):
- 9h — Standup do dia (gerado pelo @aiox-master)
- 9h–17h — Execução
- 17h–18h — QA + testes em homolog
- 18h — Push (após aprovação Jonathan)
- 18h–18h30 — Standup do dia seguinte rascunhado

### 12.3 Marco de saldo
- **Story 4.7** (Banco de teste real) — prazo limite ≤ 30 dias úteis a partir do Dia 1
- **Auditoria final** (Story 4.6) — após todas as 22 stories anteriores concluídas

---

## 13. Anexos

### Anexo A — Lista exata de IDs hardcoded a substituir

| Arquivo | Linha | Padrão | Substituir por |
|---------|-------|--------|----------------|
| `src/app/api/relatorios/route.ts` | 142 | `deposito_id = 1 AND insumo_id = 1` | `parametros.ALMOXARIFADO_ID, parametros.OURO_18K_ID` |
| `src/app/api/service/carregar-aditivo/route.ts` | 55, 77 | `deposito_id = 1 AND insumo_id = 1` | idem |
| `src/app/api/service/carregar-solda/route.ts` | 55, 77 | idem | idem |
| `src/app/api/lancamentos-avulso/route.ts` | 43 | `local_estoque_id ?? 1` | `parametros.LOCAL_ESTOQUE_DEFAULT_ID` |
| `src/app/api/compras/[id]/itens/route.ts` | 95, 130 | `deposito_id ?? 1` | `parametros.ALMOXARIFADO_ID` |
| `src/app/api/pcp/apontamentos/route.ts` | 43 | `deposito_id = 1` | idem |
| `src/app/api/distribuicao/apontamentos/route.ts` | 34 | `deposito_id = 1` | idem |
| `src/app/api/dashboard/fabrica/route.ts` | ? | `deposito_id = 1, categoria_id = 1` | idem |
| `src/app/api/pcp/[id]/pedras-disponiveis/route.ts` | ? | `categoria_id = 2` | `parametros.PEDRA_CATEGORIA_ID` |
| `src/app/api/distribuicao/[id]/pedras-apontadas/route.ts` | ? | `categoria_id = 2` | idem |
| `src/app/api/estoque/transferir-local/route.ts` | 66 | `categoria_id === 2` | idem |

### Anexo B — Template de Story

```markdown
# Story X.Y — Título

**Sprint:** N
**Owner:** Backend / Frontend / DevOps
**Esforço:** N dias
**Status:** Draft / Ready / InProgress / InReview / Done

## Contexto
Por que isso é necessário (referência ao problema X do diagnóstico)

## Critério de Aceitação
- [ ] Item verificável 1
- [ ] Item verificável 2

## Tasks
- [ ] Task 1
- [ ] Task 2

## File List (preenchido pelo @dev)
- src/...

## Notas
- ...
```

### Anexo C — Template de ADR (Michael Nygard)

```markdown
# NNNN — Título

## Status
Aceito / Substituído por NNNN / Deprecated

## Contexto
O problema que estamos enfrentando, forças em jogo, restrições.

## Decisão
A decisão tomada (1-3 parágrafos diretos).

## Consequências
- Positivas
- Negativas
- Neutras
```

---

<!-- Seção §12 antiga (Próximos Passos com sprints de 3 semanas) substituída pela §12 nova (cadência diária) na v1.2 -->

## 14. Aprovação

| Stakeholder | Status | Data | Versão |
|-------------|--------|------|--------|
| Jonathan Araújo (Owner) | ✅ Aprovado — execução iniciada | 2026-04-29 | 1.2 |
| Atlas (Analyst) | ✅ Aprovado | 2026-04-29 | 1.2 |

**Decisões assumidas pelo owner em 2026-04-29:**
- ⚠️ Testes integration em **produção** (sem banco de teste) com mitigações §3.4
- ⚠️ Cadência **diária** (sem prazo fixo) em vez de sprints de 3 semanas
- ⚠️ Story 4.7 (Banco de teste real) — prazo ≤ 30 dias úteis

> Este documento é a fonte da verdade do plano. Mudanças exigem nova versão com changelog.
