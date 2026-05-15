# ADR 0005 — Sync Externo via Fila Persistente com Retry Exponencial

**Status:** Aceito  
**Data:** 2026-04-29

## Contexto

Operações de sincronização com sistemas externos (Tiny ERP) eram executadas inline durante transações de negócio. Falhas por token expirado, rate limit ou instabilidade de rede causavam rollback da operação principal e UX degradada.

## Decisão

Implementar fila persistente (`alissonerp.fila_sync_externo`) com worker que consome itens de forma assíncrona, usando retry exponencial com delays progressivos: 1m → 5m → 15m → 1h → 6h (5 tentativas máximas).

- `FOR UPDATE SKIP LOCKED` garante que múltiplas instâncias do worker não processem o mesmo item.
- Após 5 falhas, status muda para `falha_definitiva` e admin recebe notificação.
- Worker exposto via `POST /api/admin/fila-sync` para acionamento por cron externo ou manual.

## Consequências

**Positivas:**
- Operações principais (vendas, contatos) não bloqueiam por falhas de integração.
- Resiliência automática a falhas transitórias de rede ou rate limit.
- Observabilidade: cada tentativa loga evento estruturado (JSON).

**Negativas:**
- Sync não é imediato — delay mínimo de alguns segundos entre operação e sync.
- Requer cron externo ou chamada manual para processar a fila (não há scheduler interno).

## Arquivos

- `src/lib/fila-sync-worker.ts` — worker com retry exponencial
- `src/app/api/admin/fila-sync/route.ts` — GET lista + POST dispara worker
- `src/app/api/admin/fila-sync/[id]/reprocessar/route.ts` — reprocessar falha definitiva
- `src/app/api/admin/fila-sync/limpar/route.ts` — limpar processados antigos
- `src/app/(dashboard)/admin/fila-sync/` — tela admin
- `supabase/migrations/200_fila_sync_proxima_execucao.sql` — coluna proxima_execucao + índice
