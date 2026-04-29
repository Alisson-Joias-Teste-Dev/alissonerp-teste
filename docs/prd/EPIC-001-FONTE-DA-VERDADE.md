# EPIC-001 — Banco como Fonte da Verdade

> **Tipo:** Brownfield Hardening Epic
> **Status:** Approved v1.1 (2026-04-29) — ajustes técnicos da validação Architect incorporados
> **Owner:** Jonathan Araújo (Product Owner)
> **Author:** Morgan (PM) + Aria (Architect)
> **Plano operacional:** `docs/plano-fonte-da-verdade.md` v1.2
> **Validação técnica:** `docs/architecture/validacao-tecnica-plano.md`
> **Mapa de rotas:** `docs/architecture/mapa-rotas-api.md`
> **Branch alvo:** `homolog`
> **Cadência:** Sprints diários

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-04-29 | 1.0 | EPIC inicial criado a partir do plano v1.2 | Morgan (PM) |
| 2026-04-29 | 1.1 | Incorporados 7 ajustes técnicos + escopo expandido (42 hardcoded em vez de 15, 7 rotas críticas sem tx). Estimativa total: 70d → 84d (+20%). Story 1.1 +1d. Story 1.2 +2d. | Aria (Architect) |

---

## 1. Goals

- **G1.** Garantir que **toda escrita ao banco** seja transacional, validada e auditável.
- **G2.** Eliminar **100% dos IDs de domínio hardcoded** no código (**42+ ocorrências catalogadas** em mapa-rotas-api.md, expandido de 15 estimados pelo diagnóstico inicial).
- **G3.** Garantir que **toda leitura no frontend** reflita o estado atual do banco em até 5 minutos.
- **G4.** Atingir **cobertura ≥ 70%** em rotas API críticas e **12 fluxos E2E** cobertos por Playwright.
- **G5.** Produzir **documentação completa, auto-gerada e versionada** (Schema spec, OpenAPI, ADRs, Runbooks).
- **G6.** Eliminar **race conditions** em mutações concorrentes nas top 4 entidades (vendas, ordens, protocolos, crediário).
- **G7.** Blindar **integrações externas** (Tiny, Directus) com fila + retry + dashboard de drift.

## 2. Background Context

O sistema fabricaAJ ERP cresceu organicamente para **310 tabelas + 117 views + 80 triggers + 280+ rotas API** em ~24 meses. Análise diagnóstica realizada por Atlas (analyst) em 2026-04-29 identificou **10 problemas críticos** que impedem o banco de ser 100% a fonte da verdade:

| # | Problema | Severidade |
|---|----------|-----------|
| 1 | Sync Tiny fora de transação | 🔴 Crítico |
| 2 | Ordens de reposição fora de transação | 🔴 Crítico |
| 3 | IDs de domínio hardcoded em 15+ arquivos | 🔴 Crítico |
| 4 | Cache `useAuth` sem TTL (role nunca revalida) | 🔴 Crítico |
| 5 | Sync unidirecional Directus → alissonerp | 🔴 Crítico |
| 6 | `fn_processar_fechamento_dist` acumula sem deduplicação | 🟠 Alto |
| 7 | Situações/enums hardcoded no frontend | 🟠 Alto |
| 8 | Erros silenciados (`.catch(() => {})`) | 🟠 Alto |
| 9 | Race condition (last-write-wins) sem ETag/version | 🟠 Alto |
| 10 | Dois padrões de dupla-entrada inconsistentes | 🟠 Alto |

Sem este EPIC, o sistema continua funcionando, mas com risco crescente de:
- Inconsistências entre banco e sistemas externos
- Falhas silenciosas que só aparecem em auditoria contábil
- Permissões desatualizadas após mudança administrativa
- Duplicação de totais financeiros (PCP, distribuição)

---

## 3. Functional Requirements (FR)

### FR1 — Transacionalidade
- **FR1.1:** Toda rota POST/PUT/DELETE em schema `alissonerp` deve executar mutações dentro de `sql.begin()` (transação).
- **FR1.2:** Operações de venda devem incluir criação de ordens de reposição na mesma transação.
- **FR1.3:** Sincronizações com sistemas externos (Tiny, Directus) devem sair da transação principal e entrar em fila assíncrona.
- **FR1.4 (NOVO v1.1):** Rotas multi-tabela críticas adicionais devem entrar em transação: `pcp/apontamentos`, `pcp/transferir`, `distribuicao/[id]/saida`, `service/[id]/transferir`, `devolucoes`, `pcp/[id]/atribuir-operador`. Lista completa em `mapa-rotas-api.md`.

### FR2 — Parametrização
- **FR2.1:** Sistema deve oferecer tabela `alissonerp.parametros_sistema` com chaves nomeadas para IDs de domínio:
  - `ALMOXARIFADO_DEPOSITO_ID = 1` (15+ ocorrências)
  - `OURO_18K_INSUMO_ID = 1` (12+ ocorrências)
  - `METAL_CATEGORIA_ID = 1` (5+ ocorrências)
  - `PEDRA_CATEGORIA_ID = 2` (6+ ocorrências)
  - `LOCAL_ESTOQUE_DEFAULT_ID = 1`
  - **(NOVO v1.1)** `OURO_24K_LIGA_INSUMO_ID = 275` (descoberto em `purificacao/`)
- **FR2.2:** Helper `src/lib/parametros.ts` deve carregar parâmetros com cache em memória (5min TTL).
- **FR2.3:** Mudança de parâmetro no banco deve refletir no app sem deploy.
- **FR2.4 (NOVO v1.1):** Conversão NUMERIC/JSONB automática via wrapper Zod (helper `parametros.getParametroNumber`, `getParametroJson`).

### FR3 — Validação Runtime
- **FR3.1:** Toda rota com input deve validar payload via schema Zod antes de tocar o banco.
- **FR3.2:** Toda rota com output crítico deve validar resposta via schema Zod antes de retornar.
- **FR3.3:** Schemas Zod devem ser reutilizáveis entre frontend e backend (fonte única).

### FR4 — Cache e Sincronização Frontend
- **FR4.1:** `useAuth` deve revalidar role a cada 5 minutos automaticamente.
- **FR4.2:** Mutações em entidades críticas devem invalidar caches React Query relacionados.
- **FR4.3:** Mudança de role no banco deve refletir no frontend em ≤ 5 minutos sem logout.

### FR5 — Concorrência (Versioning)
- **FR5.1:** Rotas PUT/PATCH em entidades críticas (vendas, ordens, protocolos, crediário) devem aceitar campo `updated_at` no body.
- **FR5.2:** Servidor deve retornar HTTP 409 Conflict se `updated_at` enviado for diferente do atual.
- **FR5.3:** Frontend deve tratar 409 oferecendo recarga + diff de campos alterados.

### FR6 — Auditabilidade
- **FR6.1:** Tabela `alissonerp.audit_log` deve registrar toda mutação em entidades críticas (tabela, ação, registro_id, user_id, dados_antes, dados_depois, timestamp, ip, user_agent).
- **FR6.2:** Endpoint `/api/admin/audit-log` deve permitir filtro por usuário, tabela, registro, data.
- **FR6.3:** Retenção mínima 90 dias online + arquivamento.

### FR7 — Sincronização Externa
- **FR7.1:** Tabela `alissonerp.fila_sync_externo` deve receber pendências de sync.
- **FR7.2:** Worker (cron 1min) processa fila com retry exponencial (1m, 5m, 15m, 1h, 6h).
- **FR7.3:** Após 5 tentativas, item é marcado como `falha_definitiva` e gera alerta.
- **FR7.4:** Endpoint `/api/admin/fila-sync` mostra status real-time.
- **FR7.5:** Tabela `alissonerp.drift_directus` registra ordens divergentes entre sistemas.

### FR8 — Observabilidade
- **FR8.1:** Erros de fetch no frontend devem mostrar feedback ao usuário (toast/banner).
- **FR8.2:** ESLint custom rule deve bloquear introdução de `.catch(() => {})` ou equivalente.
- **FR8.3:** ErrorBoundary global captura crashes e reporta.

### FR9 — Integridade
- **FR9.1:** `fn_processar_fechamento_dist` deve impedir duplicação via índice único parcial.
- **FR9.2:** Padrão único de dupla-entrada documentado e aplicado em todos os módulos (manual com 2 INSERTs, não via function).

### FR10 — Documentação
- **FR10.1:** Schema spec auto-gerado a partir de `information_schema` (tabelas, colunas, FKs, triggers, views, funções).
- **FR10.2:** OpenAPI 3.1 gerado dos schemas Zod (todas as rotas com `defineRoute`).
- **FR10.3:** 10 ADRs (Architecture Decision Records) capturando decisões críticas.
- **FR10.4:** 8 Runbooks operacionais para cenários reais (restaurar backup, debug PCP, etc).

---

## 4. Non-Functional Requirements (NFR)

- **NFR1:** Helper de parâmetros deve carregar em < 50ms (medido no CI).
- **NFR2:** Pipeline `ci-fast` (lint + typecheck + unit) deve completar em < 3min.
- **NFR3:** Pipeline `ci-integration` deve rodar **apenas em janela 22h–6h ou fim-de-semana** (proteção produção).
- **NFR4:** Suite Playwright completa < 10 minutos.
- **NFR5:** Coverage `src/app/api`: ≥ 70%; `src/lib`: ≥ 60%; `src/app/api/vendas` e `src/app/api/crediario`: ≥ 80%.
- **NFR6:** Audit log inserts ≤ 5ms (não impactar latência da rota).
- **NFR7:** Fila de sync com SLA: 99% dos itens processados em < 5min.
- **NFR8:** Dashboard de drift Directus atualizado a cada 15min.
- **NFR9:** Documentação Schema spec re-gerada automaticamente em cada push em `homolog`.
- **NFR10:** Zero downtime durante todas as migrations (aditivas apenas).

---

## 5. Technical Assumptions

### Stack frozen (não muda neste EPIC)

- **Backend:** Next.js 16.1.6, React 19.2.3, postgres v3.4.8, Zod v4
- **Frontend:** React Query v5 (já instalado), Zustand v5 (apenas `errorStore`)
- **Banco:** PostgreSQL 15 (Supabase self-hosted, `72.60.55.140:5543`)
- **Testes:** Vitest v4 (unit/integration), Playwright (E2E — instalar)
- **CI/CD:** GitHub Actions com janela noturna restrita
- **Infra:** Husky para Git hooks, Docker para deploy

### Ambiente de teste

- **Decisão do owner (2026-04-29):** Sem banco de teste dedicado por agora. Testes integration rodam em produção com mitigações §3.4 do plano (M1–M7).
- **Débito técnico P1:** Story 4.7 provisiona banco de teste real em ≤ 30 dias úteis.

### Branch e Git

- **Trabalho em `homolog`** sempre. `main` apenas após Jonathan testar.
- Migrations aditivas (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- Sem `DROP` sem aprovação explícita.

---

## 6. Constraints (Restrições não-negociáveis)

### C1 — Mitigações §3.4 (Testes em produção)

Todas as 7 mitigações do plano são **obrigatórias** e parte do contrato:
- **M1:** Transações sempre revertidas (`withTestTx` helper)
- **M2:** Schema dedicado `alissonerp_test` para fixtures persistentes
- **M3:** Marcador `criado_por='CI_TEST_USER'` em qualquer INSERT em prod
- **M4:** CI integration apenas 22h–6h ou fim de semana
- **M5:** E2E Playwright em modo somente-leitura ou usando marcador
- **M6:** Job de limpeza diário às 3h
- **M7:** Provisionar banco de teste real em ≤ 30 dias úteis (Story 4.7)

### C2 — Zonas No-Touch (§2 do CLAUDE.md)

Funções que **não podem ser alteradas sem autorização explícita**:
- `fn_processar_apontamento_pcp`
- `fn_processar_transferencia_saida`
- `fn_processar_fechamento_dist` (exceto Story 3.5 que adiciona guard)
- `fn_concluir_protocolo`
- `fn_processar_auditoria`
- `fn_criar_servico_from_pcp`
- `fn_calcular_peso_pedra_gramas`

### C3 — Schemas READONLY

- **`public.*`** — schema legado, apenas leitura
- **`directus.*`** — schema legado, apenas leitura
- **`alissonerp.*`** — único onde CRUD é permitido

### C4 — Ouro = Dinheiro

- Movimentações sempre dupla-entrada (débito + crédito)
- Estorno cria movimentações reversas (nunca deletar originais)
- 100% rastreável

---

## 7. Success Metrics (KPIs)

| ID | Métrica | Baseline (hoje) | Meta (fim do EPIC) |
|----|---------|-----------------|---------------------|
| M1 | IDs hardcoded em src/app/api | **42+** (revisado v1.1) | 0 |
| M2 | Rotas com Zod validation | **0.9%** (3 de 334, revisado v1.1) | 100% das rotas POST/PUT/DELETE |
| **M2.1 (NOVO v1.1)** | Rotas com `sql.begin` | **5.7%** (19 de 334) | ≥ 95% das rotas POST/PUT/DELETE |
| M3 | Coverage src/app/api | não medido | ≥ 70% |
| M4 | Coverage src/lib | não medido | ≥ 60% |
| M5 | E2E Playwright tests | 0 | 12 |
| M6 | Erros silenciados (`.catch(() => {})`) | ~10 | 0 |
| M7 | Rotas com versioning anti-race | 0 | top 4 entidades |
| M8 | Tabelas com audit_log universal | poucas | 100% das mutações críticas |
| M9 | Drift Directus monitorado | não | sim (dashboard + alertas) |
| M10 | Tempo entre mudança DB ↔ frontend | ∞ (até logout) | ≤ 5min |

---

## 8. Stories Overview (23 stories em 4 fases)

### Fase 1 — Fundação (6 stories)

| ID | Título | Owner | Estimate |
|----|--------|-------|----------|
| 1.1 | parametros_sistema + substituir **42+** IDs hardcoded (v1.1) | @data-engineer + @dev | **3d** (era 2d) |
| 1.2 | Sync Tiny + ordens reposição + **7 rotas multi-tabela em tx** (v1.1) | @dev | **5d** (era 3d) |
| 1.3 | useAuth com React Query + TTL | @dev | 2d |
| 1.4 | Wrapper Zod + helpers auth/permissão | @dev | 3d |
| 1.5 | CI GitHub Actions com janela restrita | @devops | 3d |
| 1.6 | Sync Directus monitorado (drift dashboard) | @data-engineer + @dev | 3d |

### Fase 2 — Pirâmide de Testes (6 stories)

| ID | Título | Owner | Estimate |
|----|--------|-------|----------|
| 2.1 | Setup ambiente teste em produção (gate de segurança) | @data-engineer + @dev | 4d |
| 2.2 | Cobertura módulo Vendas | @qa + @dev | 4d |
| 2.3 | Cobertura módulo PCP + Estoque | @qa + @dev | 4d |
| 2.4 | Cobertura módulo Protocolo + Crediário | @qa + @dev | 3d |
| 2.5 | Setup Playwright | @qa + @ux-design-expert | 2d |
| 2.6 | 12 E2E críticos | @qa + @ux-design-expert | 5d |

### Fase 3 — Refatoração + Blindagem (6 stories)

| ID | Título | Owner | Estimate |
|----|--------|-------|----------|
| 3.1 | Caça aos erros silenciados | @dev | 3d |
| 3.2 | Versioning em mutações concorrentes | @dev | 4d |
| 3.3 | Audit log completo | @data-engineer + @dev | 3d |
| 3.4 | Fila sync externo + retry exponencial | @dev | 4d |
| 3.5 | Guard anti-duplicação em fn_processar_fechamento_dist | @data-engineer | 2d |
| 3.6 | Unificar dupla-entrada (padrão manual) | @dev | 3d |

### Fase 4 — Documentação + Auditoria (5 stories)

| ID | Título | Owner | Estimate |
|----|--------|-------|----------|
| 4.1 | Schema spec auto-gerado | @data-engineer + @dev | 3d |
| 4.2 | OpenAPI 3.1 gerado de Zod | @dev + @architect | 4d |
| 4.3 | 10 ADRs críticos | @architect | 3d |
| 4.4 | 8 Runbooks operacionais | @dev + @devops | 3d |
| 4.5 | Atualização docs existentes | @analyst | 2d |

### Auditoria Final + Saldo Débito

| ID | Título | Owner | Estimate |
|----|--------|-------|----------|
| 4.6 | Auditoria final + relatório | @analyst + @qa | 2d |
| 4.7 | Provisionar banco de teste real (saldo M7) | @devops + @data-engineer | 3d |

**Total:** 23 stories, **~84 dias** de esforço estimado (revisado v1.1 pela validação técnica do Architect — buffer +20% absorvido nas estimativas).
**Cadência:** Diária (~8–12h foco), termina quando todas as 23 stories estão `Done`.

---

## 9. Risks (compilado de §10 do plano)

### 🔴 Críticos

| Risco | Mitigação |
|-------|-----------|
| Teste em produção polui dados reais | M1 (rollback) + M3 (marcador) + M6 (limpeza) + lint rule |
| Teste em produção causa lock em horário comercial | M4 (janela 22h–6h) + M5 (E2E read-only) + alerta TX > 30s |
| Helper `withTestTx` falha e commit vaza | Lint rule + code review obrigatório + auditoria semanal |

### 🟠 Altos

| Risco | Mitigação |
|-------|-----------|
| Migração de hardcoded IDs quebra rota não testada | Story 1.1 inclui testes piloto. Coverage em Fase 2. |
| React Query introduz regressões | Feature flag por tela. Migração gradual. |
| Story 4.7 atrasa além de 30 dias | Hard deadline: congela novos integration tests até banco existir. |
| Versioning quebra integração com PDV (Directus) | Versioning só nas top 4 em alissonerp. PDV sem versioning. |

### 🟡 Médios

- Audit log enche disco — retenção 90 dias + arquivamento
- Playwright lento no CI — paralelização (3 workers)
- Esforço estimado errado — buffer 20% por sprint

---

## 10. Out of Scope (Não-objetivos)

- ❌ Migração do PDV (Directus) para schema `alissonerp` (épico próprio)
- ❌ Reescrita de triggers PCP em código aplicação
- ❌ Substituição do Supabase por outro provedor
- ❌ Mudança de Next.js / React (mantém versão atual)
- ❌ Refatoração de UI (mantém componentes atuais)
- ❌ Mudança de stack de banco (mantém PostgreSQL)
- ❌ Implementação de event sourcing ou CQRS (overkill aqui)

---

## 11. References

| Documento | Path |
|-----------|------|
| Plano operacional v1.2 | `docs/plano-fonte-da-verdade.md` |
| Diagnóstico (análise Atlas) | conversa de 2026-04-29 |
| Snapshot do banco | `ESTRUTURA_ATUAL.md` |
| Arquitetura existente | `docs/arquitetura.md` |
| Regras do projeto | `CLAUDE.md` |
| Authority matrix AIOX | `.claude/rules/agent-authority.md` |
| Story templates | `.aiox-core/product/templates/story-tmpl.yaml` |
| Workflow rules | `.claude/rules/workflow-execution.md` |

---

## 12. Approval

| Stakeholder | Status | Data | Versão |
|-------------|--------|------|--------|
| Jonathan Araújo (Product Owner) | ⏳ Aguardando assinatura | — | 1.0 |
| Atlas (Analyst) | ✅ Plano base aprovado | 2026-04-29 | — |
| Morgan (PM) | ✅ EPIC formalizado | 2026-04-29 | 1.0 |
| Aria (Architect) | ✅ Validação técnica + ajustes v1.1 + sign-off | 2026-04-29 | 1.1 |
| Pax (Product Owner agent) | ✅ 23/23 stories aprovadas (score médio 9.1/10) | 2026-04-29 | 1.1 |

> Este EPIC só pode ser executado após assinatura do Jonathan, validação do @po (10-point checklist em cada story) e mapeamento técnico do @architect.
