# Architecture Decision Records (ADRs)

> **Padrão:** Michael Nygard
> **Mantido por:** Aria (Architect)

ADRs capturam o **porquê** de decisões arquiteturais críticas. Mudanças importantes exigem nova ADR — ADRs antigas são marcadas `Deprecated` ou `Substituída por NNNN`, nunca apagadas.

## Lista de ADRs

| ID | Título | Status | Story relacionada |
|----|--------|--------|-------------------|
| 0001 | Zod Validation Wrapper | ⏳ Pendente | 1.4 |
| 0002 | Padrão de Dupla-Entrada | ⏳ Pendente | 3.6 |
| 0003 | React Query Cache Strategy | ⏳ Pendente | 1.3 |
| 0004 | Audit Log Strategy | ⏳ Pendente | 3.3 |
| 0005 | Sync Externo via Fila | ⏳ Pendente | 3.4 |
| 0006 | Versioning Mutations | ⏳ Pendente | 3.2 |
| **0007** | **Banco como Fonte da Verdade (Princípio Rector)** | ✅ Aceito | EPIC-001 |
| 0008 | Guard Duplicação Fechamento | ⏳ Pendente | 3.5 |
| **0009** | **Estratégia de Testes (Pirâmide + Mitigações Produção)** | ✅ Aceito | 2.x |
| **0010** | **Directus e Tiny Sync (Decisão de Não Migrar)** | ✅ Aceito | 1.6 + 3.4 |
| 0011 | Banco de Teste Real (saldo M7) | ⏳ Pendente | 4.7 |
| **0012** | **RLS vs Application Auth (Defesa em Profundidade)** | ✅ Aceito | 1.4 |

**4 ADRs criadas pelo Architect** (0007, 0009, 0010, 0012). As demais são criadas durante implementação das stories correspondentes (Story 4.3 finaliza o lote completo de 10 ADRs — agora 11 com 0012).

## Template

```markdown
# NNNN — Título

## Status
Aceito | Substituído por NNNN | Deprecated

## Contexto
O problema, forças em jogo, restrições.

## Decisão
A decisão tomada (1-3 parágrafos diretos).

## Consequências
- Positivas
- Negativas
- Neutras

## Referências
- Documentos relacionados
```

## Numeração

ADRs são numeradas em sequência (0001, 0002, ...). Não reusar números mesmo se ADR for deprecated.
