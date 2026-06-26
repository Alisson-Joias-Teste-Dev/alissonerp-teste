# 0009 — Estratégia de Testes (Pirâmide + Mitigações Produção)

## Status
Aceito — 2026-04-29

## Contexto

O sistema fabricaAJ tem 23 testes Vitest pontuais, todos focados em financeiro (caixa, MP, Inter, conciliação). Não há:
- Testes integration sistematizados em PCP, vendas, protocolo, crediário
- Testes E2E (Playwright)
- Coverage threshold no CI
- Banco de teste dedicado

EPIC-001 exige cobertura ≥ 70% nas APIs críticas + 12 fluxos E2E. Owner (Jonathan) decidiu por **testes em produção com mitigações estritas** em vez de provisionar banco de teste agora (Story 4.7 paga em ≤ 30 dias úteis).

## Decisão

Adotamos **pirâmide completa de testes** com 3 camadas:

### Camada 1 — Unit (Vitest)

- **Local:** `src/__tests__/lib/`, `src/__tests__/utils/`
- **Sem banco:** mockam dependências externas (`postgres`, `supabase`, etc.)
- **Foco:** lógica isolada (validações Zod, calculadoras, helpers)
- **Coverage alvo:** `src/lib` ≥ 60%
- **Roda em:** todo PR via `ci-fast.yml` em qualquer hora

### Camada 2 — Integration (Vitest + banco real)

- **Local:** `src/__tests__/integration/`, `src/__tests__/api/`
- **Banco:** **produção** com mitigações §3.4 do plano (M1-M7)
- **Foco:** rotas API completas + dupla-entrada + triggers
- **Coverage alvo:** `src/app/api` ≥ 70%, módulos críticos (vendas, crediário) ≥ 80%
- **Roda em:** `ci-integration.yml` apenas em janela 22h-6h ou fins de semana

### Camada 3 — E2E (Playwright)

- **Local:** `tests/e2e/`
- **Banco:** produção em modo M5 (read-only ou marcador `CI_TEST_USER`)
- **Foco:** 12 fluxos críticos (login, venda completa, PCP, protocolo, crediário, etc.)
- **Roda em:** `ci-integration.yml` noturno

### Mitigações obrigatórias para testes em produção

| ID | Mitigação | Implementação |
|----|-----------|--------------|
| M1 | Transações sempre revertidas | Helper `withTestTx` (`src/test/db.ts`) — Story 2.1 |
| M2 | Schema isolado | `alissonerp_test` para fixtures persistentes |
| M3 | Marcador obrigatório | `criado_por='CI_TEST_USER'` em qualquer INSERT real |
| M4 | Janela noturna | CI integration apenas 22h-6h ou fim de semana |
| M5 | E2E read-only | Playwright sem operações destrutivas em produção |
| M6 | Limpeza diária | Cron 3h chama `fn_limpar_fixtures_teste()` |
| M7 | Banco real em ≤30 dias | Story 4.7 — débito técnico P1 com prazo hard |

### Linting custom

- **Rule `no-direct-sql-in-tests`:** bloqueia uso de `sql\`...\`` em `__tests__/integration/` fora de `withTestTx`. Falha CI.
- **Rule `no-empty-catch`:** bloqueia introdução de `.catch(() => {})`. Falha CI.

## Consequências

### Positivas

- Cobertura sólida em rotas críticas com baixo custo (sem provisionar banco novo)
- E2E pega regressões de UI que unit não pega
- CI gate impede merge com regressão de cobertura
- Migração para banco de teste real (Story 4.7) é gradual e sem disrupção

### Negativas

- **Risco operacional real durante 30 dias** — testes em produção exigem disciplina. Falha em qualquer M1-M6 pode poluir produção.
- Testes integration noturnos atrasam feedback (PR aberto às 14h espera até 22h para suite completa)
- E2E em produção tem restrições (M5) — alguns fluxos não podem ser testados de fim a fim até banco real

### Neutras

- Testes em produção exigem cultura: PRs grandes precisam aguardar janela noturna
- Lint custom rules adicionam complexidade ao toolchain (justificada pela proteção)

## Referências

- `docs/plano-fonte-da-verdade.md` §3.4
- `docs/stories/2.1.setup-ambiente-teste-producao.md`
- `docs/stories/4.7.banco-teste-real.md`
- `docs/architecture/validacao-tecnica-plano.md` §2.1 (search_path em withTestTx)
