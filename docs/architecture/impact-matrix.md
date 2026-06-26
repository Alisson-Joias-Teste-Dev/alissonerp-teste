# Matriz de Impacto — EPIC-001-FONTE-DA-VERDADE

> **Versão:** 1.0
> **Autor:** Aria (Architect)
> **Data:** 2026-04-29
> **Cruza:** 23 stories × 334 rotas API × 310 tabelas

---

## Visão Geral

Para cada uma das 23 stories, este documento mapeia:
- **Arquivos a criar/modificar** (paths absolutos)
- **Migrations necessárias** (números reservados)
- **Componentes frontend afetados** (se houver)
- **Riscos técnicos não previstos**
- **Estimate revisado** (Architect vs PM)

---

## Reserva de números de migrations

Para evitar conflito entre stories paralelas (ajuste técnico §2.4 da validação):

| Migration | Story | Conteúdo |
|-----------|-------|----------|
| 192 | 1.1 | `parametros_sistema` + seed inicial |
| 193 | 1.2 | `fila_sync_externo` + index |
| 194 | 1.6 | `mv_drift_directus` + função + cron |
| 195 | 2.1 | Schema `alissonerp_test` + tabelas |
| 196 | 2.1 | `fn_limpar_fixtures_teste` + cron |
| 197 | 3.5 | Guard fechamento_dist + índice único |
| 198 | 3.6 | `fn_criar_par_movimentacao` retorna IDs |
| 199 | 3.3 | `audit_log` schema completo + archive |
| 200 | 3.4 | `fila_sync_externo` colunas extras (proxima_execucao) |

**Regra:** se story X tem múltiplas migrations, usar 19X.1, 19X.2 (não 19X+1, 19X+2 para evitar shift de números reservados).

---

## Story 1.1 — parametros_sistema + 42 hardcoded

### Arquivos a CRIAR
- `supabase/migrations/192_parametros_sistema.sql`
- `src/lib/parametros.ts`
- `src/__tests__/lib/parametros.test.ts`
- `src/__tests__/integration/parametros-reflect.test.ts`

### Arquivos a MODIFICAR (42 ocorrências)

**deposito_id = 1 (15 rotas):**
- `src/app/api/dashboard/fabrica/route.ts`
- `src/app/api/estoque/transferir-local/route.ts`
- `src/app/api/pcp/apontamentos/route.ts`
- `src/app/api/pcp/transferir/route.ts`
- `src/app/api/service/carregar-solda/route.ts`
- `src/app/api/service/carregar-aditivo/route.ts`
- `src/app/api/purificacao/route.ts`
- `src/app/api/distribuicao/apontamentos/route.ts`
- `src/app/api/lancamentos-avulso/route.ts`
- `src/app/api/compras/[id]/itens/route.ts`
- `src/app/api/relatorios/route.ts`
- `src/app/api/dashboard/fabrica/movimentacoes/route.ts`
- `src/app/api/insumos/pote/route.ts`
- `src/app/api/pcp/depositos/route.ts`
- `src/app/api/depositos/route.ts`

**insumo_id = 1 (12 rotas):**
- `src/app/api/service/[id]/concluir/route.ts`
- `src/app/api/service/[id]/devolver/route.ts`
- `src/app/api/service/solda-saldo/route.ts`
- `src/app/api/service/aditivo-saldo/route.ts`
- `src/app/api/pcp/apontamentos/route.ts` (compartilha com deposito_id)
- `src/app/api/purificacao/ligacao/route.ts`
- `src/app/api/relatorios/route.ts` (compartilha)
- `src/app/api/cotacao-ouro/route.ts`
- `src/app/api/insumos/pote/route.ts`
- `src/app/api/financeiro/cofre-ouro/route.ts`
- `src/app/api/dashboard/fabrica/route.ts`
- `src/app/api/precificacao/markup-ouro/route.ts`

**categoria_id = 1 (5 rotas) e categoria_id = 2 (6 rotas):** vide mapa-rotas-api.md

**insumo_id = 275 (2 rotas):**
- `src/app/api/purificacao/ligacao/route.ts`
- `src/app/api/purificacao/liga-tipos/route.ts`

### Riscos técnicos
- 🟡 Helper `parametros.ts` carregar em < 50ms exige cache em memória bem desenhado
- 🟡 Mudança em 42 arquivos é grande — código review extenso
- 🟢 Sem risco de banco (migration aditiva)

### Estimate revisado: **3d** (era 2d)

---

## Story 1.2 — Tx vendas + Tiny + 7 rotas críticas

### Arquivos a CRIAR
- `supabase/migrations/193_fila_sync_externo.sql`
- `scripts/processar-fila-sync.ts`
- `src/app/api/admin/fila-sync/route.ts`

### Arquivos a MODIFICAR
- `src/app/api/contatos/route.ts` (mover sync Tiny para fila)
- `src/app/api/vendas/route.ts` (ordens reposição em tx)
- `src/app/api/pcp/apontamentos/route.ts` (envolver em tx) ← **NOVO v1.1**
- `src/app/api/pcp/transferir/route.ts` (envolver em tx) ← **NOVO v1.1**
- `src/app/api/distribuicao/[id]/saida/route.ts` (envolver em tx) ← **NOVO v1.1**
- `src/app/api/service/[id]/transferir/route.ts` (envolver em tx) ← **NOVO v1.1**
- `src/app/api/devolucoes/route.ts` (envolver em tx) ← **NOVO v1.1**
- `src/app/api/pcp/[id]/atribuir-operador/route.ts` (envolver em tx) ← **NOVO v1.1**
- `src/lib/sync-contatos-tiny.ts` (worker reutiliza)

### Riscos técnicos
- 🔴 7 rotas em produção sem tx HOJE — refactor pode revelar bugs latentes
- 🟠 `sql.begin` parametro `tx` (não `sql`) — pegadinha CLAUDE.md §3
- 🟠 Worker da fila + cron pode bater no banco em horário de pico (mitigado por janela)
- 🟢 Migration aditiva

### Estimate revisado: **5d** (era 3d)

---

## Story 1.3 — useAuth React Query + TTL

### Arquivos a CRIAR
- `src/lib/query-client.ts`
- `src/app/api/admin/usuarios/[id]/forcar-revalidacao/route.ts`

### Arquivos a MODIFICAR
- `src/app/layout.tsx` (QueryClientProvider)
- `src/hooks/useAuth.ts` (reescrever)
- ~17 componentes que importam `useAuth` (smoke test cada um)

### Riscos técnicos
- 🟠 17+ componentes — risco de breaking change
- 🟢 React Query já instalado

### Estimate revisado: **3d** (era 2d)

---

## Story 1.4 — Wrapper Zod + RLS interaction

### Arquivos a CRIAR
- `src/lib/api-handler.ts` (defineRoute)
- `src/lib/auth-server.ts` (consolidar)
- `src/lib/audit.ts` (logAudit helper)
- `src/lib/db-rls.ts` (sqlAsUser para RLS — ADR 0012) ← **NOVO v1.1**
- `docs/adr/0001-zod-validation-wrapper.md`

### Arquivos a MODIFICAR
- 5 rotas piloto: `compras`, `vendas`, `crediario/[id]/registrar-pagamento`, `contatos`, `pcp/apontamentos`

### Riscos técnicos
- 🟠 RLS interaction (ADR 0012) é nova complexidade
- 🟠 NUMERIC coercion via Zod — pode surpreender em rotas com agregação
- 🟢 Zod já instalado

### Estimate revisado: **4d** (era 3d, +1d para RLS)

---

## Story 1.5 — CI GitHub Actions

### Arquivos a CRIAR
- `.github/workflows/ci-fast.yml`
- `.github/workflows/ci-integration.yml`
- `.github/pull_request_template.md`
- `docs/runbooks/runbook-ci.md` (rascunho)

### Configuração externa (Jonathan executa)
- Secrets no GitHub UI
- Branch protection rules

### Riscos técnicos
- 🟢 Configuração padrão — sem risco técnico

### Estimate: **3d** (mantém)

---

## Story 1.6 — Drift Directus

### Arquivos a CRIAR
- `supabase/migrations/194_drift_directus.sql`
- `src/app/api/admin/drift-directus/route.ts`
- `src/app/(dashboard)/admin/drift-directus/page.tsx`
- `docs/runbooks/runbook-drift-directus.md` (rascunho)

### Riscos técnicos
- 🟠 Cross-schema query pesada — usar MV e refresh em cron
- 🟢 Schema directus é READONLY — sem risco de corrupção

### Estimate: **3d** (mantém)

---

## Story 2.1 — Setup teste em produção (GATE)

### Arquivos a CRIAR
- `src/test/db.ts` (withTestTx + handling search_path)
- `src/test/fixtures.ts`
- `scripts/eslint-rules/no-direct-sql-in-tests.js`
- `supabase/migrations/195_schema_alissonerp_test.sql`
- `supabase/migrations/196_cleanup_test_fixtures.sql`
- `src/app/api/admin/test-fixtures/route.ts`
- `docs/runbooks/runbook-testes-em-producao.md`

### Riscos técnicos
- 🔴 **search_path em tx** (ADR 2.1 da validação técnica) — implementar com `SET LOCAL`
- 🔴 Lint rule custom — testar com regressão deliberada
- 🟠 Schema replicado — FKs cross-schema podem dar conflito

### Estimate revisado: **5d** (era 4d, +1d para search_path)

---

## Story 2.2 — Cobertura Vendas

### Arquivos a CRIAR
- `src/__tests__/api/vendas/route.test.ts`
- `src/__tests__/lib/validar-descontos.test.ts`
- `src/__tests__/integration/reservas-estoque-comercial.test.ts` ← **NOVO v1.1**
- `docs/qa/vendas-test-matrix.md`

### Riscos técnicos
- 🟠 Reservas estoque comercial (ponto cego 3.1) — caso não óbvio
- 🟠 Vale-troca cadeia complexa
- 🟢 Dependências resolvidas (1.4 + 2.1)

### Estimate revisado: **5d** (era 4d)

---

## Story 2.3 — Cobertura PCP + Estoque

### Arquivos a CRIAR
- `src/__tests__/api/pcp/apontamentos.test.ts`
- `src/__tests__/api/distribuicao/apontamentos.test.ts`
- `src/__tests__/api/distribuicao/fechamento.test.ts`
- `src/__tests__/api/estoque/transferir-local.test.ts`
- `src/__tests__/api/service/carregar-aditivo.test.ts`
- `src/__tests__/api/service/carregar-solda.test.ts`
- `src/__tests__/integration/saldo-estoque.test.ts`

### Estimate: **4d** (mantém)

---

## Story 2.4 — Cobertura Protocolo + Crediário

### Arquivos a CRIAR
- `src/__tests__/api/protocolo/concluir.test.ts`
- `src/__tests__/api/protocolo/criar.test.ts`
- `src/__tests__/api/crediario/registrar-pagamento.test.ts`
- `src/__tests__/api/crediario/verificar-mp.test.ts`
- `src/__tests__/api/crediario/aging-cron.test.ts`

### Estimate: **3d** (mantém)

---

## Story 2.5 — Setup Playwright

### Arquivos a CRIAR
- `playwright.config.ts`
- `tests/e2e/helpers/auth.ts`
- `tests/e2e/helpers/db.ts` (read-only)
- `tests/e2e/smoke.spec.ts`
- `docs/runbooks/runbook-playwright.md` (rascunho)

### Estimate: **2d** (mantém)

---

## Story 2.6 — 12 E2E críticos

### Arquivos a CRIAR (12 specs + ~50 data-testid em componentes)
- `tests/e2e/auth/login-roles.spec.ts`
- `tests/e2e/dashboards/fabrica-kpis.spec.ts`
- `tests/e2e/dashboards/cofre-ouro.spec.ts`
- `tests/e2e/listas/vendas.spec.ts`
- `tests/e2e/listas/pcp.spec.ts`
- `tests/e2e/listas/estoque-comercial.spec.ts`
- `tests/e2e/mutations/criar-venda.spec.ts`
- `tests/e2e/mutations/aprovar-desconto.spec.ts`
- `tests/e2e/mutations/pcp-apontamento.spec.ts`
- `tests/e2e/mutations/concluir-protocolo.spec.ts`
- `tests/e2e/mutations/crediario-pagamento.spec.ts`
- `tests/e2e/mutations/estoque-transferir.spec.ts`

### Arquivos a MODIFICAR (~50 componentes)
- Adicionar `data-testid` em botões/inputs/elementos clicáveis críticos
- ~50 arquivos `src/app/(dashboard)/**/*.tsx`

### Riscos técnicos
- 🟠 data-testid em 50 componentes é "sub-task escondida" não estimada originalmente
- 🟠 E2E read-only restringe alguns fluxos

### Estimate revisado: **6d** (era 5d)

---

## Story 3.1 — Caça aos erros silenciados

### Arquivos a CRIAR
- `src/lib/toast.ts`
- `src/components/ErrorBoundary.tsx`
- `scripts/eslint-rules/no-empty-catch.js`

### Arquivos a MODIFICAR
- ~10 casos identificados via grep
- `eslint.config.js` (adicionar rule)

### Estimate: **3d** (mantém)

---

## Story 3.2 — Versioning concorrência

### Arquivos a CRIAR/MODIFICAR
- `supabase/migrations/{próximo número}.sql` (triggers updated_at)
- `src/lib/api-handler.ts` (adicionar versionField)
- `src/components/VersionConflictModal.tsx`
- `src/hooks/useMutationWithVersion.ts`
- 4 rotas: vendas/[id], ordens/[id], protocolo/[id], crediario/[id]
- `docs/adr/0006-versioning-mutations.md`

### Estimate: **4d** (mantém)

---

## Story 3.3 — Audit log universal

### Arquivos a CRIAR/MODIFICAR
- `supabase/migrations/199_audit_log_schema.sql`
- `src/lib/audit.ts` (expandir granularidade — ADR ajuste 2.2)
- `src/app/api/admin/audit-log/route.ts`
- `src/app/(dashboard)/admin/audit-log/page.tsx`
- `src/components/AuditDiff.tsx`
- ~100 rotas POST/PUT/DELETE (adoção universal)

### Riscos técnicos
- 🔴 Audit log granularidade (ADR ajuste 2.2) — precisa redesenho
- 🟠 Performance test obrigatório

### Estimate revisado: **5d** (era 3d)

---

## Story 3.4 — Fila retry exponencial

### Arquivos a CRIAR/MODIFICAR
- `supabase/migrations/200_fila_sync_proxima_execucao.sql`
- `scripts/processar-fila-sync.ts` (expandir)
- `src/app/api/admin/fila-sync/[id]/reprocessar/route.ts`
- `src/app/(dashboard)/admin/fila-sync/page.tsx`
- `docs/adr/0005-sync-externo-fila.md`

### Estimate: **4d** (mantém)

---

## Story 3.5 — Guard fechamento_dist

### Arquivos a CRIAR
- `supabase/migrations/197_guard_fechamento_dist.sql`
- `supabase/migrations/_backup/fn_processar_fechamento_dist_pre_guard.sql`
- `docs/adr/0008-guard-duplicacao-fechamento.md`

### Riscos técnicos
- 🟠 Verificar duplicatas existentes ANTES de aplicar índice único
- 🟢 Migration reversível

### Estimate: **2d** (mantém)

---

## Story 3.6 — Unificar dupla-entrada

### Arquivos a CRIAR/MODIFICAR
- `supabase/migrations/198_par_movimentacao_returns_ids.sql`
- `supabase/migrations/_backup/fn_criar_par_movimentacao_pre_returns.sql`
- `src/app/api/service/carregar-aditivo/route.ts`
- `src/app/api/service/carregar-solda/route.ts`
- `docs/adr/0002-dupla-entrada-pattern.md`

### Estimate: **3d** (mantém)

---

## Story 4.1 — Schema spec auto-gerado

### Arquivos a CRIAR
- `scripts/generate-schema-doc.ts`
- `.github/workflows/schema-sync.yml`
- `docs/schema/README.md`
- `docs/schema/alissonerp.md` (auto)
- `docs/schema/public.md` (auto)
- `docs/schema/directus.md` (auto)

### Estimate: **3d** (mantém)

---

## Story 4.2 — OpenAPI from Zod

### Arquivos a CRIAR
- `src/lib/openapi-registry.ts`
- `src/app/api/openapi.json/route.ts`
- `src/app/docs/api/page.tsx`
- `scripts/generate-openapi.ts`

### Riscos técnicos
- 🟠 zod-to-openapi pode falhar em schemas complexos (ADR ajuste 2.7)

### Estimate revisado: **5d** (era 4d)

---

## Story 4.3 — 11 ADRs (era 10)

### Arquivos a CRIAR
- 4 já criadas: 0007, 0009, 0010, 0012 ← **+0012 v1.1**
- 7 a finalizar: 0001, 0002, 0003, 0004, 0005, 0006, 0008, 0011 (+1 ajuste)

### Estimate revisado: **4d** (era 3d, +1d para 0012 incluso)

---

## Story 4.4 — 8 Runbooks

### Arquivos a CRIAR
- 8 runbooks em `docs/runbooks/`
- README

### Estimate: **3d** (mantém)

---

## Story 4.5 — Atualizar docs

### Arquivos a MODIFICAR
- `docs/arquitetura.md`
- `ESTRUTURA_ATUAL.md`
- `CLAUDE.md`
- `MEMORY.md` (index)
- `docs/CHANGELOG.md`

### Estimate: **2d** (mantém)

---

## Story 4.6 — Auditoria final

### Arquivos a CRIAR
- `docs/auditoria-final-2026.md`

### Estimate revisado: **3d** (era 2d, +1d trabalho do Atlas)

---

## Story 4.7 — Banco teste real

### Arquivos a CRIAR
- `docs/adr/0011-banco-de-teste.md`
- `scripts/sync-schema-to-test.sh`

### Estimate: **3d** (mantém)

---

## Total Revisado

| Item | PM Original | Architect Revisado | Diferença |
|------|------------|-------------------|-----------|
| Total estimado | 70d | **84d** | +14d (+20%) |
| Stories alteradas | — | **7** stories com estimate maior | — |
| ADRs | 10 | **11** (+0012) | +1 |

---

## Critical Path Update

Considerando estimates revisadas, o critical path é:

```
1.1 (3d) → 1.4 (4d) → 2.1 (5d) → [Pacote Cobertura] → 4.6 (3d)
3 + 4 + 5 + (max(2.2=5d, 2.3=4d, 2.4=3d) = 5d) + 3 = 20d critical path

Mas com paralelismo agressivo, total pode fechar em ~30 dias úteis.
```

— Aria, arquitetando o futuro 🏗️
