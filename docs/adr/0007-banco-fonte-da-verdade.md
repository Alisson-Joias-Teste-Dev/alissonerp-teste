# 0007 — Banco como Fonte da Verdade (Princípio Rector)

## Status
Aceito — 2026-04-29

## Contexto

O sistema fabricaAJ ERP cresceu para 310+ tabelas em PostgreSQL com lógica de negócio distribuída entre triggers SECURITY DEFINER, RLS policies e código aplicação Next.js. Ao longo de 24 meses de evolução, surgiram contradições onde o código aplicação carrega *implícitas* sobre o banco que podem divergir:

- Cache de role/permissões em frontend que não revalida (`useAuth` module-scoped)
- IDs de domínio hardcoded em 42+ rotas (deposito_id=1, insumo_id=1, categoria_id=1|2, insumo_id=275)
- Sincronizações com Tiny e Directus fora de transação criam estados inconsistentes
- 94.3% das rotas POST/PUT/DELETE não usam `sql.begin()` — multi-tabela sem atomicidade
- Enums/situações duplicados em frontend (vendas, protocolos)

A consequência prática: bugs sutis onde aplicação acredita uma coisa e banco tem outra. Auditorias contábeis recentes apontaram inconsistências que só foram explicáveis após investigação direta no banco.

## Decisão

**O banco PostgreSQL (schema `alissonerp`) é a única fonte da verdade. Aplicação aplica regras, banco enforce-as.**

Implicações concretas:

1. **Validação dupla:** aplicação valida via Zod *antes* de tocar o banco; banco valida via constraints/triggers/RLS *novamente*. Defesa em profundidade.
2. **Ouro só pode ser movimentado via `movimentacoes_estoque`** com dupla-entrada — não há "estoque cached" em código.
3. **IDs de domínio vêm de `alissonerp.parametros_sistema`** — não literais no código.
4. **Estados/enums** vêm de tabelas (ex: `tipos_apontamento`, `roles`) ou de `parametros_sistema` — não hardcoded em frontend.
5. **Triggers SECURITY DEFINER** continuam sendo o lugar correto para regras invariantes (PMC, quebra, dupla-entrada PCP). Não migrar para código aplicação.
6. **Toda mutação multi-tabela em `sql.begin()`** — sem exceção.
7. **Cache no frontend** (React Query) tem TTL curto (≤ 5min para dados sensíveis) e é invalidado em mutações.
8. **Documentação** é gerada do banco real (Story 4.1) — nunca escrita à mão e sem fonte.

## Consequências

### Positivas

- Auditoria contábil torna-se traçavel: `audit_log` + triggers fornecem timeline completa
- Bugs de divergência entre aplicação e banco eliminados na origem
- Mudanças administrativas (ex: trocar role de usuário) refletem no app sem deploy
- Onboarding de devs novos: `docs/schema/` + `docs/api/openapi.json` são suficientes
- Sistemas externos (Tiny, Directus) não corrompem dados internos — fila + retry isola

### Negativas

- Curva de aprendizado: dev novo precisa entender modelo do banco antes de escrever rota
- Performance: queries vão sempre ao banco (não cache aplicação) — mitigado por React Query no frontend e MV no banco quando necessário
- Lock-in com PostgreSQL — migrar para outro DB seria custoso (mas não está nos planos)

### Neutras

- Triggers SECURITY DEFINER são "magic" para devs acostumados a ORMs — exige documentação clara
- RLS policies precisam ser projetadas com cuidado para não bloquear leituras legítimas

## Referências

- `docs/plano-fonte-da-verdade.md` v1.2
- `docs/prd/EPIC-001-FONTE-DA-VERDADE.md`
- `docs/architecture/validacao-tecnica-plano.md`
- `docs/architecture/mapa-rotas-api.md`
- CLAUDE.md §1, §3, §5
