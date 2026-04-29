# PO Validation Log — EPIC-001-FONTE-DA-VERDADE

> **Data:** 2026-04-29
> **Validador:** Pax (PO)
> **Total:** 23 stories
> **Critério:** 10-point checklist (GO ≥7/10, NO-GO <7/10)

---

## 10-Point Checklist (referência)

1. Título claro e objetivo (1pt)
2. Descrição completa — problema/necessidade explicado (1pt)
3. AC testáveis (preferível Given/When/Then) (2pt)
4. Escopo bem definido (IN/OUT claros) (1pt)
5. Dependências mapeadas (1pt)
6. Estimativa de complexidade (1pt)
7. Valor de negócio claro (1pt)
8. Riscos documentados (1pt)
9. Definition of Done (0.5pt)
10. Alinhamento com PRD/Epic (0.5pt)

---

## Sumário Executivo

| Fase | Stories | GO | NO-GO | Status |
|------|---------|-----|--------|--------|
| Fase 1 — Fundação | 6 (1.1-1.6) | **6** | 0 | ✅ Concluída |
| Fase 2 — Pirâmide Testes | 6 (2.1-2.6) | **6** | 0 | ✅ Concluída |
| Fase 3 — Refatoração | 6 (3.1-3.6) | **6** | 0 | ✅ Concluída |
| Fase 4 — Documentação + Auditoria + Saldo | 7 (4.1-4.7) | **7** | 0 | ✅ Concluída |
| **Total** | **23** | **23** | **0** | **✅ APROVADO** |

**Score médio:** 9.1/10
**Status global:** Todas 23 stories aprovadas (GO). 0 stories rejeitadas. Status atualizado de `Draft → Ready` em todos os arquivos `docs/stories/*.md`.

---

## Validações Detalhadas por Story

### Fase 1 — Fundação

#### Story 1.1 — Parâmetros de Sistema

| # | Critério | ✓ | Score | Notas |
|---|----------|---|-------|-------|
| 1 | Título claro | ✅ | 1/1 | "Parâmetros de Sistema + Substituir IDs Hardcoded" — direto |
| 2 | Descrição completa | ✅ | 1/1 | Story bem formulada, contexto explícito |
| 3 | AC testáveis | ✅ | 2/2 | 8 ACs, AC6 é grep verificável, AC4 é perf medível |
| 4 | Escopo IN/OUT | ✅ | 1/1 | Tasks listam 11 rotas concretas + ref ao mapa |
| 5 | Dependências | ✅ | 1/1 | "Blocks: 1.5, 2.1, 3.3" |
| 6 | Estimativa | ✅ | 1/1 | 3d (revisado v1.1) |
| 7 | Valor de negócio | ✅ | 1/1 | "Banco volta a ser fonte da verdade" |
| 8 | Riscos documentados | ✅ | 1/1 | Architect Notes explicita pegadinhas |
| 9 | DoD | ✅ | 0.5/0.5 | AC8: tsc + smoke 3 rotas |
| 10 | Alinhamento PRD | ✅ | 0.5/0.5 | Resolve problema crítico #3 |

**Score:** 10/10 — **GO** ✅
**Fix menor aplicado:** Task 3 atualizada para "42+ ocorrências" (antes "11 rotas") — consistência com AC5.
**Status:** `Draft → Ready` ✓

#### Story 1.2 — Transacionalidade Vendas + Tiny + 7 rotas

**Score:** 9.5/10 — **GO** ✅
**Notas:** AC3a (NOVA v1.1) lista as 7 rotas adicionais explicitamente. AC4-AC5 testam rollback. Risco bem documentado em Architect Notes (sql.begin com `tx`, não `sql`). Estimativa 5d (justificada pelo escopo expandido).
**Status:** `Draft → Ready` ✓

#### Story 1.3 — useAuth React Query + TTL

**Score:** 9/10 — **GO** ✅
**Notas:** AC1-AC8 cobrem QueryClientProvider + reescrita + invalidação + smoke. Lista os 17 componentes consumidores. Architect Notes alerta sobre Server vs Client Components.
**Status:** `Draft → Ready` ✓

#### Story 1.4 — Wrapper Zod + RLS interaction

**Score:** 9/10 — **GO** ✅
**Notas:** AC1-AC8 sólidos. Architect Notes adiciona `bypassRls`, `sqlAsUser`, NUMERIC coercion, rate limiting opcional. Esforço 4d justificado pela RLS interaction (ADR 0012).
**Status:** `Draft → Ready` ✓

#### Story 1.5 — CI GitHub Actions Janela Restrita

**Score:** 9.5/10 — **GO** ✅
**Notas:** Mitigação M4 do plano. AC1-AC8 cobrem ambos workflows + branch protection + PR template + alertas. Architect Notes adiciona monitoring de pool, auditoria pg_stat_activity, locks distribuídos.
**Status:** `Draft → Ready` ✓

#### Story 1.6 — Sync Directus Monitorado

**Score:** 8.5/10 — **GO** ✅
**Notas:** Cross-schema MV bem desenhada. Pegadinha typo `peso_metal_negociado` (sem A) documentada. Threshold de alerta razoável (>5 ordens em 30min).
**Status:** `Draft → Ready` ✓

---

### Fase 2 — Pirâmide de Testes

#### Story 2.1 — Setup Ambiente Teste em Produção (GATE)

**Score:** 10/10 — **GO** ✅ (CRÍTICA)
**Notas:** 9 ACs cobrindo M1-M3, M6 + lint rule + cron + dashboard. Architect Notes implementa `withTestTx` com `SET LOCAL search_path` (ajuste técnico §2.1). Quality Gate dupla: `@architect → @qa (revisão extra de segurança)`. **Esta é a story mais sensível** — falha aqui = risco a produção.
**Status:** `Draft → Ready` ✓

#### Story 2.2 — Cobertura Vendas

**Score:** 9/10 — **GO** ✅
**Notas:** Coverage ≥ 80% rotas vendas + ≥ 90% validar-descontos. Architect Notes adiciona reservas estoque comercial (ponto cego 3.1) + cadeia vale-troca. Esforço 5d.
**Status:** `Draft → Ready` ✓

#### Story 2.3 — Cobertura PCP + Estoque

**Score:** 9/10 — **GO** ✅
**Notas:** 9 tipos apontamento + dupla-entrada + PMC (PCP vs Distribuição). Architect Notes documenta pegadinhas críticas (vw_saldo_estoque SUM, peso_pedra_ct → gramas, zonas no-touch).
**Status:** `Draft → Ready` ✓

#### Story 2.4 — Cobertura Protocolo + Crediário

**Score:** 8.5/10 — **GO** ✅
**Notas:** Cobertura 70% protocolo + 80% crediário. Aging cron mencionado. Vale-troca cadeia.
**Status:** `Draft → Ready` ✓

#### Story 2.5 — Setup Playwright

**Score:** 9/10 — **GO** ✅
**Notas:** Setup com fixtures auth + db read-only enforcement + CI integration. Architect Notes adiciona padrão de cookie injection vs login UI.
**Status:** `Draft → Ready` ✓

#### Story 2.6 — 12 E2E Críticos

**Score:** 9/10 — **GO** ✅
**Notas:** 6 read-only + 6 mutation marcada (`CI_TEST_USER`). Sub-task escondida de ~50 data-testid em componentes (Architect Notes alerta). Esforço 6d.
**Status:** `Draft → Ready` ✓

---

### Fase 3 — Refatoração + Blindagem

#### Story 3.1 — Caça aos Erros Silenciados

**Score:** 9/10 — **GO** ✅
**Notas:** AC1 grep deve retornar 0. ESLint custom rule. ErrorBoundary. Toast lib (sonner recomendado). Casos conhecidos listados (NovaVendaClient, ProtocoloClient).
**Status:** `Draft → Ready` ✓

#### Story 3.2 — Versioning Mutações Concorrentes

**Score:** 9/10 — **GO** ✅
**Notas:** updated_at trigger + wrapper aceita versionField + 409 com diff + frontend modal. 4 entidades top: vendas, ordens, protocolos, contas_receber.
**Status:** `Draft → Ready` ✓

#### Story 3.3 — Audit Log Completo

**Score:** 9.5/10 — **GO** ✅
**Notas:** Schema completo + adoção universal + endpoint admin + cron archive. Architect Notes ajusta granularidade (alto-nível vs por INSERT — ajuste §2.2). Esforço 5d.
**Status:** `Draft → Ready` ✓

#### Story 3.4 — Fila Sync Retry Exponencial

**Score:** 9/10 — **GO** ✅
**Notas:** Retry 1m/5m/15m/1h/6h. Lock pessimista `FOR UPDATE SKIP LOCKED`. Falha definitiva após 5x. Idempotência Tiny via key.
**Status:** `Draft → Ready` ✓

#### Story 3.5 — Guard Duplicação fn_processar_fechamento_dist

**Score:** 9.5/10 — **GO** ✅
**Notas:** Backup pré-mudança + análise de duplicatas existentes ANTES + índice único parcial + guard na função. Zona No-Touch com autorização explícita do plano §5.
**Status:** `Draft → Ready` ✓

#### Story 3.6 — Unificar Dupla-Entrada

**Score:** 8.5/10 — **GO** ✅
**Notas:** Padrão manual escolhido (mais auditável). `fn_criar_par_movimentacao` retorna IDs. ADR 0002 documenta. Esforço 3d.
**Status:** `Draft → Ready` ✓

---

### Fase 4 — Documentação + Auditoria + Saldo

#### Story 4.1 — Schema Spec Auto-Gerado

**Score:** 9/10 — **GO** ✅
**Notas:** Queries em information_schema. Output dividido por área (alissonerp-vendas, alissonerp-pcp, etc.). CI gate de schema-drift.
**Status:** `Draft → Ready` ✓

#### Story 4.2 — OpenAPI 3.1 from Zod

**Score:** 8.5/10 — **GO** ✅
**Notas:** zod-to-openapi com limitações conhecidas (Architect Notes alerta sobre transform/refine). Validação por amostragem (ajuste §2.7). Esforço 5d.
**Status:** `Draft → Ready` ✓

#### Story 4.3 — 11 ADRs (com 0012)

**Score:** 9/10 — **GO** ✅
**Notas:** 4 já criadas pelo Architect. 7 a finalizar durante stories correspondentes. Esforço 4d.
**Status:** `Draft → Ready` ✓

#### Story 4.4 — 8 Runbooks Operacionais

**Score:** 9/10 — **GO** ✅
**Notas:** 8 runbooks com sintoma/diagnóstico/procedimento/rollback. Validação cruzada por Jonathan (executa 3).
**Status:** `Draft → Ready` ✓

#### Story 4.5 — Atualizar Docs Existentes

**Score:** 8.5/10 — **GO** ✅
**Notas:** arquitetura.md + ESTRUTURA_ATUAL.md + CLAUDE.md + MEMORY.md + CHANGELOG. Architect Notes detalha sections.
**Status:** `Draft → Ready` ✓

#### Story 4.6 — Auditoria Final

**Score:** 9.5/10 — **GO** ✅
**Notas:** Re-rodar diagnóstico + métricas com queries reais + relatório executivo + tag git. **Gate de fechamento do EPIC.**
**Status:** `Draft → Ready` ✓

#### Story 4.7 — Banco Teste Real (Saldo Débito M7)

**Score:** 9/10 — **GO** ✅
**Notas:** Decisão A vs B (recomendação Architect: B Supabase paid). Prazo limite ≤ 30 dias úteis. ADR 0011.
**Status:** `Draft → Ready` ✓

---

## Pacote Dia 1 (validação)

Conforme plano §11.2, sugestão do Atlas:

| Story | Parcial? | Status validação |
|-------|----------|------------------|
| 1.1 — parametros_sistema | Completa | ✅ Ready |
| 1.2 (parcial) — Tx vendas | Parcial | ✅ Ready |
| 1.2 (parcial) — Fila Tiny | Parcial | ✅ Ready |
| 1.3 (mini) — TTL useAuth | Parcial | ✅ Ready |
| 3.5 — Guard fechamento | Completa | ✅ Ready |
| 3.1 (parcial) — Caça catches | Parcial | ✅ Ready |
| 3.3 (parcial) — Audit 5 rotas | Parcial | ✅ Ready |

**Total Dia 1:** ~11h foco. **Pendente:** confirmação de Jonathan.

---

## Decisão Final

**Status global:** ✅ **APROVADO PARA EXECUÇÃO**

Todas as 23 stories passaram validação 10-point com scores entre **8.5 e 10**. Sem nenhuma rejeição.

**Story crítica de segurança:** 2.1 (Setup teste em produção) tem Quality Gate dupla (@architect + @qa) e deve ser **a primeira do Sprint 2** — sem ela, demais stories 2.x não podem rodar.

**Próximo agente:** `@sm` (River) recebe handoff para priorizar primeira sprint diária.

— Pax, equilibrando prioridades 🎯

