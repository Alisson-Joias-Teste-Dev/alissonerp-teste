# Agentes IA — Documentação

> Pasta dedicada à plataforma de agentes conversacionais Telegram + IA da Alisson Joias.
> Primeiro agente: **Gerente de Produção**.

## Estrutura

```
docs/agentes/
├── README.md             ← este arquivo
├── arquitetura.md        ← arquitetura v2 (ADRs, schema, fluxo, fases)
├── product-backlog.md    ← backlog completo (epics, user stories, MoSCoW, SP)
├── sprint-1.md           ← planning + handoff Sprint 1 (próximo a executar)
├── privacidade.md        ← (a criar) política LGPD pública
└── adrs/                 ← (a criar) ADRs detalhados, 1 por arquivo
```

## Caminho percorrido até aqui

| Etapa | Agente | Entregável |
|---|---|---|
| 1. Discovery | `@analyst` (Atlas) | Brief + análise LGPD + 6 gaps |
| 2. Solution Design | `@architect` (Aria) | Arquitetura v2 (16 ADRs, schema completo, 8 fases) |
| 3. Validation | `@analyst` (Atlas) | Auto-crítica validada + 11 ajustes aprovados |
| 4. Backlog | `@po` (Pax) | 8 epics, 58 stories, 127 SP, MoSCoW, roadmap 7 sprints |
| 5. Sprint Planning | `@sm` (River) | Sprint 1 detalhada: 8 stories, 51 tasks, cronograma 5 dias |
| 6. **Próximo:** Execution | `@dev` (Sonnet) | Implementação Sprint 1 |

## Princípios inegociáveis

1. **Nunca inventar** — sem dado, perguntar
2. **Sempre confirmar** antes de salvar memória
3. **Citar a fonte** ao usar memória
4. **Confirmação humana** obrigatória pra escrita no ERP
5. **3 níveis de confirmação:** anúncio / texto / botão (botão só p/ ERP+processo)

## Decisões técnicas chave

| Item | Decisão |
|---|---|
| Onde mora | `fabricaAJ/src/agentes/` (monolito) |
| DB | Schema `agentes` + `alissonerp.produto_processo` |
| LLM primário | DeepSeek via Vercel AI SDK; Haiku 3.5 adapter pronto |
| Auth | Random token 32 bytes, 30d, revogável |
| Cron | `pg_cron` + `pg_net` |
| LGPD | Consentimento + retenção 90d + `*esquecer` + filtro PII |
| Custo estimado | ~$1.50/mês (DeepSeek) |
| Rate limit | 10/min, 100/h, 200k tokens/dia |

## Como começar

1. Ler `arquitetura.md` (visão completa)
2. Ler `product-backlog.md` (o que fazer)
3. Ler `sprint-1.md` (próxima sprint, com tasks granulares)
4. Resolver blockers de pré-execução listados em `sprint-1.md`
5. Trocar pra Sonnet e invocar `@dev`

## Stack envolvida

- Next.js 16.1.6 + React 19 + TypeScript 5
- PostgreSQL 15 (Supabase self-hosted)
- `postgres` (postgres.js) via `src/lib/db.ts`
- Vercel AI SDK (`ai` + `@ai-sdk/deepseek` + `@ai-sdk/anthropic`)
- Telegram Bot API
- `pg_cron` + `pg_net` (já instalados no banco)
- Supabase Auth (`signInWithPassword`)
