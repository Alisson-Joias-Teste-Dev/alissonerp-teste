# Centralização das Aprovações — handoff entre fases

> **Fonte de verdade da refatoração.** Cada fase é executada por um modelo/IA diferente
> (Opus = arquiteto/revisor, Sonnet = operacional). Este diretório é o contexto compartilhado —
> nenhum modelo herda o chat da conversa anterior. **Leia estes docs antes de executar qualquer fase.**

## O problema

O sistema de aprovação **não segue Configurações — segue a role**, e há regras se esbarrando.
Causa raiz: **três fontes de verdade paralelas** sobre "quem aprova", e cada endpoint escolhe a sua:

- `alissonerp.configuracoes_sistema` (12 chaves de aprovador)
- `src/lib/roles.ts` (~10 listas de cargos, com **4 definições divergentes** de "acesso pleno")
- `alissonerp.tarefas_regras_aprovacao` (limites por evento)

Detalhe em [`02-mapa-esbarros.md`](02-mapa-esbarros.md).

## Os documentos

| # | Arquivo | O que é |
|---|---|---|
| 01 | [`01-dossie-dependencias.md`](01-dossie-dependencias.md) | Para cada fluxo A–M: front/banco/contrato/campos/estados/notificações + triggers vivos + **riscos R1–R11** |
| 02 | [`02-mapa-esbarros.md`](02-mapa-esbarros.md) | Os 28 endpoints, autorização real de cada um, 7 grupos de conflito |
| 03 | [`03-FASE-1-camada-central.md`](03-FASE-1-camada-central.md) | **Pacote de execução da Fase 1** (arquitetura + briefing pro Sonnet) |

## O plano (7 fases)

0. **Mapa de dependências** — ✅ feito (dossiê + mapa acima)
1. **Camada central de autoridade** `src/lib/aprovacoes/` — catálogo + autoridade, sem plugar em nada
2. **Testes de caracterização ("golden")** — congela o comportamento atual antes de tocar
3. **Migração fluxo a fluxo** — metal → conversão → preço → limpeza → devolução → compra → **venda por último**
4. **Fechar brechas + matar atalhos** — auditoria, concluir-compra, backdoor, atalho de desconto
5. **Unificar limites + override do admin com log** — um limite de desconto só; config vira a fonte real
6. **Validação ponta a ponta** — Claude testa back+front local → OK → Jonathan testa e sobe

## Regras invioláveis de execução (valem para TODA fase)

1. **Branch própria** `feat/centralizar-aprovacoes` — nunca commitar em homolog/main. Merge é manual do Jonathan.
2. **Testes locais contra o banco de HOMOLOG** — `next dev` com `.env.local` apontando pro Postgres de homolog. **Não subir pra homolog.** Usar dados de teste e limpar depois.
3. **Contratos de API idênticos** — o payload e o shape de resposta de cada rota **não mudam** (o front não pode perceber a troca). Ver os contratos no dossiê.
4. **Banco só via skill `/dba`** — nenhum agente operacional faz DDL/DML/migration. Toda migration é assinada e versionada.
5. **Nada em produção** sem o Jonathan testar e aprovar.
6. **Respeitar os riscos R1–R11** do dossiê — são o que quebra as vendas se ignorado.
7. Ao terminar a fase: `npx tsc --noEmit` zero erros + atualizar este README com o status.

## Status

- [x] Fase 0 — mapa (11/07/2026)
- [ ] Fase 1 — camada central
- [ ] Fase 2 — golden tests
- [ ] Fase 3 — migração
- [ ] Fase 4 — brechas/atalhos
- [ ] Fase 5 — limites/override
- [ ] Fase 6 — validação
