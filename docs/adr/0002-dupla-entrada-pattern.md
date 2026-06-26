# ADR 0002 — Padrão de Dupla-Entrada em movimentacoes_estoque

**Status:** Accepted
**Date:** 2026-04-29

## Contexto

Movimentações de estoque exigem dupla-entrada (saída + entrada). Dois padrões coexistiam:

1. `fn_criar_par_movimentacao` (function) — retornava void, IDs perdidos
2. 2 INSERTs manuais explícitos — auditável mas verboso

## Decisão

Manter `fn_criar_par_movimentacao` (refatorada para retornar IDs) para movimentos internos simples.
Para novos casos complexos (com contexto específico de marcador/obs), usar 2 INSERTs manuais.
A function é conveniente; os IDs retornados permitem auditoria sem SELECT extra.

Nota técnica: CREATE OR REPLACE não permite mudar tipo de retorno no PostgreSQL.
A migration 198 usa DROP + CREATE dentro de transação. Verificado: zero dependências externas
na função antes da execução (resultado de pg_depend com deptype != 'i').

## Consequências

- Backward-compatible: chamadas que descartam o retorno continuam funcionando
- Rotas que capturam IDs podem registrar em audit_log (uso completo na Story 3.3)
- Novos movimentos complexos devem usar INSERTs manuais para máxima flexibilidade
