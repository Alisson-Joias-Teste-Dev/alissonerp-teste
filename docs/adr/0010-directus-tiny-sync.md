# 0010 — Sincronização com Directus e Tiny (Decisão de Não Migrar Agora)

## Status
Aceito — 2026-04-29

## Contexto

O sistema fabricaAJ depende de 2 sistemas externos legados:

### Directus (PDV — Point of Sale)
- Schema `directus` no mesmo PostgreSQL
- Fonte primária de ordens de venda
- Trigger `trg_ponte_ordens` (migration 027) copia `directus.ordens` → `alissonerp.ordens` quando `situacao='2'`
- Sincronização **unidirecional**: ordens que nunca atingem `situacao='2'` ficam apenas no Directus
- Migration 027 é marcada como **TEMPORÁRIA** ("REMOVER quando migrar PDV para alissonerp")

### Tiny (ERP de catálogo de produtos / fiscal)
- API externa via HTTP
- Sincronização atual: `syncContatoToTiny()` chamado em background sem await após criar contato
- Falha silenciosa = drift entre fabricaAJ e Tiny

A migração completa do PDV para `alissonerp` é um **épico próprio** (estimativa 3+ meses) e fora do escopo deste EPIC. A decisão é: blindar a integração atual em vez de eliminá-la agora.

## Decisão

**Manter integrações Directus e Tiny no estado atual, blindadas com fila assíncrona, retry e dashboard de drift.**

Implementação:

1. **Fila `alissonerp.fila_sync_externo`** (Story 1.2 + 3.4)
   - Toda sync com sistemas externos passa por essa fila
   - Worker processa com retry exponencial (1m, 5m, 15m, 1h, 6h)
   - Após 5 tentativas → `falha_definitiva` + alerta
   - `FOR UPDATE SKIP LOCKED` para fila distribuída sem race

2. **Dashboard `drift_directus`** (Story 1.6)
   - View materializada `alissonerp.mv_drift_directus` lista divergências
   - Refresh a cada 15min via cron
   - Alerta quando drift > 5 ordens em 30min

3. **`audit_log`** registra sucesso/falha de sync para forense

4. **Trigger ponte 027** continua existindo até migração do PDV

5. **Documentação** clara em `docs/runbooks/runbook-fila-sync-falha.md` e `docs/runbooks/runbook-drift-directus.md`

### Quando migrar (futuro)

A migração definitiva do PDV para `alissonerp` é trigger para retirar:
- Migration 027 (trigger ponte)
- Schema `directus` em produção (manter histórico em backup)
- Sync Tiny via fila (ou manter, dependendo do roadmap)

Critério para iniciar migração: dashboard de drift mostra padrão estável de inconsistência (ex: > 50 ordens órfãs/mês) **ou** equipe tem 3+ meses livres para épico dedicado.

## Consequências

### Positivas

- EPIC-001 entrega blindagem rápida (sem 3 meses de migração)
- Drift se torna visível e tratável (dashboard + alerta)
- Falhas temporárias de Tiny não corrompem banco (fila + retry)
- Migração futura é informada por dados reais de drift

### Negativas

- **Banco não é 100% fonte da verdade** — Directus continua sendo input primário de ordens
- Dois fluxos para mesma entidade (ordem) durante período indeterminado
- Migration 027 fica "temporária permanente" — risco de esquecimento

### Neutras

- Dashboard de drift gera trabalho operacional (revisar divergências)
- Custo do Tiny não muda — apenas a forma de integrar

## Critério de revisão

Reabrir esta ADR se:
- Drift Directus > 100 ordens órfãs em 30 dias consecutivos
- Falhas Tiny > 5% das tentativas em 7 dias consecutivos
- Equipe tem capacidade de 3+ meses para épico de migração

## Referências

- `docs/plano-fonte-da-verdade.md` §3.2
- `docs/stories/1.2.transacionalidade-vendas-tiny.md`
- `docs/stories/1.6.sync-directus-monitorado.md`
- `docs/stories/3.4.fila-sync-retry-completo.md`
- `supabase/migrations/027_*.sql` (trigger ponte)
- CLAUDE.md §1 (schemas READONLY)
