# Architecture Decision Records (ADRs)

> **Padrão:** Michael Nygard
> **Mantido por:** Aria (Architect)

ADRs capturam o **porquê** de decisões arquiteturais críticas. Mudanças importantes exigem nova ADR — ADRs antigas são marcadas `Deprecated` ou `Substituída por NNNN`, nunca apagadas.

## Lista de ADRs

| ID | Título | Status | Data | Story relacionada |
|----|--------|--------|------|-------------------|
| **0001** | **Zod Validation Wrapper (defineRoute)** | ✅ Aceito | 2026-04-29 | 1.4 |
| **0002** | **Padrão de Dupla-Entrada em movimentacoes_estoque** | ✅ Aceito | 2026-04-29 | 3.6 |
| **0003** | **Cache Strategy no useAuth (TTL + Invalidação Explícita)** | ✅ Aceito | 2026-04-29 | 1.3 |
| **0004** | **Estratégia de Audit Log** | ✅ Aceito | 2026-04-29 | 3.3 |
| **0005** | **Sync Externo via Fila Persistente com Retry Exponencial** | ✅ Aceito | 2026-04-29 | 3.4 |
| **0006** | **Guard de Versão em Mutations (Lost Update Prevention)** | ✅ Aceito | 2026-04-29 | 3.2 |
| **0007** | **Banco como Fonte da Verdade (Princípio Rector)** | ✅ Aceito | 2026-04-29 | EPIC-001 |
| **0008** | **Parâmetros de Sistema (Eliminar IDs Hardcoded)** | ✅ Aceito | 2026-04-29 | 3.5 |
| **0009** | **Estratégia de Testes (Pirâmide + Mitigações Produção)** | ✅ Aceito | 2026-04-29 | 2.x |
| **0010** | **Sincronização com Directus e Tiny (Decisão de Não Migrar)** | ✅ Aceito | 2026-04-29 | 1.6 + 3.4 |
| 0011 | Banco de Teste Real (saldo M7) | ⏳ Pendente | — | 4.7 |
| **0012** | **RLS vs Application Auth (Defesa em Profundidade)** | ✅ Aceito | 2026-04-29 | 1.4 |

**11 ADRs aceitas** (0001–0010, 0012). ADR 0011 será criada na Story 4.7.

## Template

```markdown
# ADR NNNN — Título

**Status:** Accepted
**Data:** YYYY-MM-DD
**Story:** X.Y

## Contexto
O problema, forças em jogo, restrições.

## Decisão
A decisão tomada (1-3 parágrafos diretos).

## Consequências

**Positivas:**
- ...

**Negativas:**
- ...

**Neutras:**
- ...

## Arquivos
- `caminho/para/arquivo.ts` — descrição
```

## Numeração

ADRs são numeradas em sequência (0001, 0002, ...). Não reusar números mesmo se ADR for deprecated.
