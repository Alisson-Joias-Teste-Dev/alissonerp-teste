# Validação Técnica do Plano EPIC-001-FONTE-DA-VERDADE

> **Versão:** 1.0
> **Autor:** Aria (Architect)
> **Data:** 2026-04-29
> **Documento avaliado:** `docs/plano-fonte-da-verdade.md` v1.2 + `docs/prd/EPIC-001-FONTE-DA-VERDADE.md` v1.0

---

## Sumário Executivo

Revisei o plano e o PRD com olhar arquitetônico. **Verdict: APROVADO com 7 ajustes obrigatórios** (alguns críticos, outros menores). Os fundamentos estão corretos e pragmáticos; os ajustes são para reduzir risco técnico real durante execução.

**Decisões corretas:** padrão de rota com Zod + sql.begin + audit_log, parametros_sistema, fila assíncrona, React Query, versioning com updated_at, mitigações §3.4 para testes em produção.

**Riscos críticos não cobertos:** RLS interaction com wrapper, ordem de migrations, audit_log performance, conexão pool dimensionamento.

---

## 1. Decisões que aprovo sem ressalvas (✅)

### 1.1 Padrão de rota API (§4.2)

```typescript
defineRoute({ inputSchema, outputSchema, requireRole?, handler })
```

✅ **Correto.** Esse padrão é defensável e idiomático Next.js 16. Zod v4 suporta inferência de tipos perfeita. Validação dupla (input + output) impede vazamento de campos sensíveis. `sql.begin()` está bem usado.

### 1.2 `parametros_sistema` (Story 1.1)

✅ **Aprovado.** Cache em memória com TTL 5min é adequado. Tabela aditiva, sem risco. Mudança de parâmetro reflete sem deploy é UX correta.

### 1.3 Fila `fila_sync_externo` (Stories 1.2 + 3.4)

✅ **Aprovado.** `FOR UPDATE SKIP LOCKED` é o padrão idiomático PostgreSQL para fila distribuída. Retry exponencial (1m, 5m, 15m, 1h, 6h) é razoável. Boa decisão tirar Tiny da transação principal.

### 1.4 React Query com staleTime 5min para auth (Story 1.3)

✅ **Aprovado** para o caso específico de auth/role. Para outras entidades, `staleTime` deve variar (ex: dashboards podem ser 30s, listas 1min, detalhes 30s).

### 1.5 Versioning com `updated_at` (Story 3.2)

✅ **Aprovado** para top 4 entidades. Optimistic concurrency control via `updated_at` é o padrão clássico. Trigger de auto-update no banco é o lugar certo (não no aplicação).

### 1.6 Mitigações §3.4 (M1-M7)

✅ **Aceitas como gambiarra controlada.** Helper `withTestTx`, schema isolado, marcador, janela noturna — todas pragmáticas. M7 (banco real em ≤30 dias) é a única forma sustentável.

---

## 2. Ajustes obrigatórios (🔧)

### 2.1 🔴 CRÍTICO — `withTestTx` precisa lidar com `search_path`

**Problema:** `src/lib/db.ts` define `connection.search_path = "alissonerp,public"` no pool. Em `sql.begin()`, esse search_path é herdado, **mas**: se o teste cria objeto em `alissonerp_test` (schema dedicado para fixtures), a referência sem qualificação ainda buscará em `alissonerp,public` primeiro.

**Impacto:** testes podem ler/escrever na tabela de produção quando intenção era schema test. Falha silenciosa de mitigação M2.

**Correção obrigatória em Story 2.1:**

```typescript
export async function withTestTx<T>(fn: (tx: Sql) => Promise<T>, opts?: { schema?: 'alissonerp' | 'alissonerp_test' }): Promise<T> {
  return sql.begin(async (tx) => {
    if (opts?.schema === 'alissonerp_test') {
      await tx`SET LOCAL search_path = alissonerp_test, public`;
    }
    let result: T;
    try {
      result = await fn(tx);
      throw new RollbackTestSignal();
    } catch (e) {
      if (!(e instanceof RollbackTestSignal)) throw e;
      return result!;
    }
  });
}
```

`SET LOCAL` aplica apenas dentro da transação — automaticamente revertido com ROLLBACK.

### 2.2 🔴 CRÍTICO — Audit log síncrono pode virar gargalo

**Problema:** Story 3.3 prescreve `logAudit()` síncrono dentro de `sql.begin()` em **100% das rotas POST/PUT/DELETE**. Em rotas como `api/vendas` que têm 5+ INSERTs, audit log adiciona 5+ INSERTs extras. Em produção, latência da rota pode subir 50-100ms.

**Impacto:** AC NFR6 ("audit log inserts ≤ 5ms") é factível, mas N inserts × 5ms = problema em rotas pesadas.

**Correção obrigatória:**

1. **Audit log em tabelas pesadas (vendas, ordens):** registrar evento de alto nível (`acao: 'venda_criada'`) ao invés de cada INSERT individual.
2. **Helper `logAudit` aceita `dados` resumido** (não precisa diff completo de cada row).
3. **NFR6 ajustado:** "audit log adiciona ≤ 30ms total ao tempo da rota" (mais realista).
4. **Performance test obrigatório** em Story 3.3 antes de adoção universal.

### 2.3 🟠 ALTO — Pool de 5 conexões pode ser insuficiente

**Problema:** `src/lib/db.ts` define `max: 5` no pool. Para Server Components do Next.js + Route Handlers + workers (fila + cron) tudo competindo, 5 conexões pode virar gargalo sob carga.

**Impacto:** em horário comercial com vendas + relatórios + workers da fila, requests podem ficar em fila esperando conexão.

**Correção sugerida (não obrigatória, monitorar primeiro):**

1. Adicionar Story 0.0 (pre-EPIC) ou tarefa em Story 1.5: **monitoring de pool** via `pg_stat_activity`.
2. Se taxa de espera > 10%, aumentar `max` para 10-15.
3. Considerar pools separados: 1 pool para writes (max 5), 1 pool para reads/relatórios (max 10).

### 2.4 🟠 ALTO — Ordem de migrations precisa ser verificada

**Problema:** Plano lista migrations 192-198 (parametros_sistema, fila_sync, drift_directus, schema_test, cleanup_fixtures, guard_fechamento, par_movimentacao). Estado atual: última migration é **191** (crediario_aging_automacao).

**Risco:** se 2 stories rodarem em paralelo (ex: 1.1 cria 192 e 1.6 cria 193), conflito de número se mergeadas em ordem errada.

**Correção obrigatória:**

1. **Coordenação de números:** Story 1.1 = 192, Story 1.2 = 193, Story 1.6 = 194, Story 2.1 = 195+196, Story 3.5 = 197, Story 3.6 = 198. Ordem definida no PRD.
2. **Branch protection:** se duas migrations entram em conflito de número, CI bloqueia merge.
3. **Validação automática:** script que verifica `ls supabase/migrations/ | sort` é sequencial.

### 2.5 🟠 ALTO — RLS interaction com wrapper Zod não está documentada

**Problema:** Plano §4.1 menciona "RLS por role" no banco, mas wrapper `defineRoute` não fala como interage com RLS. Hoje, conexão `db.ts` usa `service_role` ou `anon` (preciso confirmar) — RLS pode estar bypassed na maioria das rotas.

**Impacto:** Story 1.4 (wrapper) pode introduzir contradição entre RLS no banco e validação no wrapper.

**Correção obrigatória:**

1. **Story 1.4 deve incluir Task adicional:** documentar como wrapper interage com RLS.
2. **Decisão arquitetônica:** RLS é fonte primária (banco força) ou wrapper é fonte primária (aplicação valida)?
3. **Recomendação:** usar JWT do Supabase no `pg_settings.jwt.claims.role` para RLS rodar com role do usuário real, **e** wrapper valida adicionalmente. Defesa em profundidade.
4. **Adicionar ADR:** `0012-rls-vs-application-auth.md`.

### 2.6 🟡 MÉDIO — `vw_saldo_estoque` é custosa, cache pode quebrar fonte da verdade

**Problema:** Plano §10 menciona "Cache de saldo em Redis". `vw_saldo_estoque` é agregação custosa (SUM por insumo+depósito sobre `movimentacoes_estoque`). Mas cachear quebra "banco como fonte da verdade".

**Decisão pendente:** caching é aceitável **com TTL curto** ou contraria objetivo do EPIC.

**Correção sugerida:**

1. **Não cachear no Redis** durante este EPIC.
2. **Considerar materialized view** (refresh em CRON) se performance virar problema — MV está no banco, então banco continua sendo fonte.
3. **Se MV não couber:** cache no React Query com staleTime 30s é aceitável (frontend invalida ao mutar).

### 2.7 🟡 MÉDIO — OpenAPI 3.1 + `zod-to-openapi` tem casos não cobertos

**Problema:** `@asteasolutions/zod-to-openapi` cobre 95% dos schemas Zod, mas falha em:
- `z.discriminatedUnion()` complexos
- `z.lazy()` para schemas recursivos
- Schemas custom com `.refine()` ou `.transform()`

**Impacto:** Story 4.2 pode ter schemas que não geram OpenAPI corretamente.

**Correção obrigatória:**

1. **Story 4.2 deve incluir validação por amostragem:** após gerar OpenAPI, validar 5 rotas representativas com `swagger-cli validate`.
2. **Padrão simplificado:** evitar `transform()` em schemas que precisam virar OpenAPI; usar 2 schemas (input parsing + transform separado).

---

## 3. Pontos cegos não cobertos pelo plano (⚠️)

### 3.1 ⚠️ Reservas de estoque comercial

**Não coberto:** plano não fala de `reservas_estoque_comercial` (CLAUDE.md §3 menciona como pegadinha). Inserir item de venda **cria reserva**; reserva vira saída **na entrega** (confirmação do recebimento/retirada), não ao aprovar.

**Recomendação:** adicionar nota no Dev Notes da Story 2.2 (cobertura vendas) e Story 2.3 (cobertura estoque) cobrindo reserva → saída.

### 3.2 ⚠️ ABC produtos (curva)

**Não coberto:** CLAUDE.md §3 menciona "ABC: classificar por receita_total_12m, NUNCA por capital". `produto_curva_aplicada` é tabela existente. Plano não fala disso.

**Recomendação:** confirmar se está fora do escopo (provavelmente sim — não está nos 10 problemas críticos). Documentar como out-of-scope explícito.

### 3.3 ⚠️ Fotos e Storage Supabase

**Não coberto:** `protocolo-fotos`, `apontamento-fotos`, `ordem-fotos` são buckets privados (signed URL TTL 1h). Plano não fala de auditoria de storage.

**Recomendação:** adicionar nota em Story 3.3 (audit log) — uploads/downloads de fotos também devem ser auditados em rotas críticas (ex: foto de transferência metal).

### 3.4 ⚠️ Cron jobs múltiplos competindo

**Não coberto:** plano introduz vários cron jobs (M6 cleanup às 3h, drift Directus 15min, fila sync 1min, archive audit 4h). Se algum demorar, sobrepõe próximo.

**Recomendação:** adicionar Task em Story 1.5 ou 3.4: lock distribuído entre crons (`pg_advisory_lock`).

### 3.5 ⚠️ Backup before destructive ops

**Não coberto:** plano menciona "Migrations aditivas apenas". Mas Story 3.5 (guard fechamento) altera função existente. Story 3.6 (unificar dupla-entrada) idem.

**Recomendação:** **antes** dessas stories, dump dos objetos via `pg_dump --schema-only --function-only` em `supabase/migrations/_backup/`.

### 3.6 ⚠️ Rate limiting em endpoints admin

**Não coberto:** endpoints `/api/admin/*` introduzidos por várias stories. Sem rate limiting, força bruta possível.

**Recomendação:** Story 1.4 (wrapper) inclui opcional `rateLimit?: { max: number; windowMs: number }` em `defineRoute`. Aplicar em endpoints críticos.

### 3.7 ⚠️ Tipos TypeScript de retorno do banco

**Não coberto:** `postgres` v3 retorna NUMERIC como string. Plano menciona `normalizeRow()` mas não força uso. Em rotas migradas para wrapper, `outputSchema.parse()` pode falhar se NUMERIC vem como string.

**Recomendação:** wrapper Zod aceita `outputSchema` que automaticamente converte tipos comuns (`z.coerce.number()` para campos NUMERIC). Documentar em ADR 0001.

---

## 4. Estimativas revisadas

| Story | Estimate PM | Estimate Aria | Diferença | Justificativa |
|-------|-------------|---------------|-----------|---------------|
| 1.1 parametros_sistema | 2d | **2d** | = | OK |
| 1.2 Tx vendas + Tiny | 3d | **4d** | +1d | Refactor de api/vendas é mais complexo (5+ branches) |
| 1.3 useAuth React Query | 2d | **3d** | +1d | 17+ componentes consumem useAuth — smoke test extenso |
| 1.4 Wrapper Zod | 3d | **4d** | +1d | RLS interaction não estava no escopo (ajuste 2.5) |
| 1.5 CI janela restrita | 3d | **3d** | = | OK |
| 1.6 Drift Directus | 3d | **3d** | = | OK |
| 2.1 Setup teste produção | 4d | **5d** | +1d | search_path handling (ajuste 2.1) + lint rule complexa |
| 2.2 Cobertura Vendas | 4d | **5d** | +1d | Reservas estoque comercial (ponto cego 3.1) |
| 2.3 Cobertura PCP+Estoque | 4d | **4d** | = | OK |
| 2.4 Cobertura Protocolo+Crediário | 3d | **3d** | = | OK |
| 2.5 Setup Playwright | 2d | **2d** | = | OK |
| 2.6 12 E2E | 5d | **6d** | +1d | data-testid em 50 componentes (sub-task escondida) |
| 3.1 Caça erros silenciados | 3d | **3d** | = | OK |
| 3.2 Versioning concorrência | 4d | **4d** | = | OK |
| 3.3 Audit log universal | 3d | **5d** | +2d | Ajuste de granularidade + perf testing (ajuste 2.2) |
| 3.4 Fila retry exponencial | 4d | **4d** | = | OK |
| 3.5 Guard fechamento_dist | 2d | **2d** | = | OK |
| 3.6 Unificar dupla-entrada | 3d | **3d** | = | OK |
| 4.1 Schema spec | 3d | **3d** | = | OK |
| 4.2 OpenAPI from Zod | 4d | **5d** | +1d | Schemas com transform/refine podem falhar (ajuste 2.7) |
| 4.3 10 ADRs | 3d | **4d** | +1d | +1 ADR (0012-rls-vs-app-auth) |
| 4.4 8 Runbooks | 3d | **3d** | = | OK |
| 4.5 Atualizar docs | 2d | **2d** | = | OK |
| 4.6 Auditoria final | 2d | **3d** | +1d | Re-rodar análise diagnóstica = trabalho do Atlas |
| 4.7 Banco teste real | 3d | **3d** | = | OK |
| **TOTAL** | **70d** | **84d** | **+14d (+20%)** | Buffer de 20% que PRD §10 já mencionou |

**Conclusão estimativa:** PRD original estava 20% otimista. Buffer de 20% mencionado em §10 absorve a diferença. Sem ajuste de prazo total — apenas reconhecimento de que cadência diária + 1.3 stories/dia é otimista, real fica em 1 story/dia.

---

## 5. Resumo dos ajustes obrigatórios

| # | Ajuste | Severidade | Story afetada | Tipo |
|---|--------|-----------|---------------|------|
| 2.1 | `withTestTx` lida com search_path via SET LOCAL | 🔴 Crítico | 2.1 | Implementação |
| 2.2 | Audit log granularidade (alto-nível, não por INSERT) | 🔴 Crítico | 3.3 | Design |
| 2.3 | Monitoring de pool de conexões | 🟠 Alto | 1.5 | Adicionar task |
| 2.4 | Coordenação de números de migration | 🟠 Alto | TODAS com migration | Processo |
| 2.5 | Documentar RLS vs wrapper + ADR 0012 | 🟠 Alto | 1.4 | Adicionar ADR |
| 2.6 | Sem cache Redis; considerar MV | 🟡 Médio | (informativo) | Decisão |
| 2.7 | Validar OpenAPI por amostragem | 🟡 Médio | 4.2 | Adicionar task |

| # | Ponto cego | Recomendação | Story afetada |
|---|-----------|--------------|---------------|
| 3.1 | Reservas estoque comercial | Adicionar Dev Note | 2.2, 2.3 |
| 3.2 | ABC produtos (out-of-scope) | Documentar exclusão | PRD §10 |
| 3.3 | Storage Supabase auditoria | Adicionar Dev Note | 3.3 |
| 3.4 | Lock distribuído entre crons | Adicionar task | 3.4 |
| 3.5 | Backup pre-mudanças destrutivas | Adicionar Task | 3.5, 3.6 |
| 3.6 | Rate limiting endpoints admin | Adicionar opcional no wrapper | 1.4 |
| 3.7 | NUMERIC → number coerce | Padronizar via wrapper | 1.4 |

---

## 6. Verdict final

**APROVADO** com **7 ajustes obrigatórios** (4 críticos/altos + 3 médios) e **7 pontos cegos** documentados.

O plano é tecnicamente sólido. Os ajustes não invalidam estratégia — apenas tornam execução mais segura.

**Próximas ações:**

1. PM (Morgan) atualiza PRD para v1.1 com ajustes 2.1-2.7
2. PM atualiza estimativas das 7 stories com diferença
3. Eu (Aria) preencho Dev Notes nas 23 stories incorporando ajustes e pontos cegos
4. Eu redijo 3 ADRs preliminares (0007, 0009, 0010) + 1 novo (0012-rls-vs-app-auth)
5. Eu finalizo matriz de impacto cruzando com mapa de rotas (subagente em background)
6. Handoff para @po validar stories com checklist 10-pontos

**Sign-off Aria (Architect):** ✅ Aprovado para v1.1 do PRD após ajustes.

— Aria, arquitetando o futuro 🏗️
