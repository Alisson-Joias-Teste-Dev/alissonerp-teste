# 0012 — RLS vs Application Auth (Defesa em Profundidade)

## Status
Aceito — 2026-04-29

## Contexto

O banco PostgreSQL tem 95+ RLS policies em 13+ tabelas críticas (`vendas_erp`, `ordens`, `protocolos`, etc.). Estas policies usam função `fn_user_role()` SECURITY DEFINER que lê role do usuário corrente.

Ao mesmo tempo, plano Story 1.4 introduz `defineRoute({ requireRole, requirePermissao, ... })` no aplicação que valida via `src/lib/permissoes.ts:temPermissao()`.

**Problema arquitetônico:** os dois mecanismos podem conflitar:
- RLS no banco bloqueia: aplicação não vê erro claro (postgres retorna []), confunde dev
- Aplicação bloqueia: RLS nunca é acionado, mas inconsistência se rota legítima esquece de validar

Adicionalmente, `src/lib/db.ts` usa `service_role` ou conexão privilegiada. Não está claro se RLS está bypassed na maioria das rotas.

## Decisão

**Defesa em profundidade: RLS é fonte primária de enforcement no banco; wrapper Zod (`defineRoute`) é fonte primária de validação na aplicação. Ambos atuam.**

Implementação:

### 1. Conexão com role do usuário

```typescript
// src/lib/db.ts (atualização Story 1.4)
export async function sqlAsUser(userId: number, role: string) {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL "request.jwt.claims" = ${JSON.stringify({ sub: userId, role })}`;
    return tx;
  });
}
```

`SET LOCAL` aplica apenas dentro da transação. RLS reads `current_setting('request.jwt.claims', true)::json->>'role'`.

### 2. Wrapper valida ANTES, RLS valida DEPOIS

```typescript
// defineRoute primeiro valida na aplicação
await requirePermissao(user, "compras.criar"); // app

// Dentro da tx, RLS bloqueia se role real não bater
const result = await sqlAsUser(user.id, user.role).then(tx =>
  tx`INSERT INTO alissonerp.compras ...` // RLS atua aqui
);
```

### 3. Quando RLS bloqueia

Se RLS bloqueia INSERT, postgres retorna 0 rows. Aplicação detecta `result.length === 0 || result.count === 0` e lança erro claro.

### 4. Quando aplicação bloqueia

Aplicação retorna 403 antes de tocar o banco. Mais rápido (sem custo de tx).

### 5. Conexão de admin (bypass RLS)

Para rotas admin (relatórios cross-tenant, audit log, etc.) que precisam ignorar RLS:
- Usar pool separado com `service_role`
- Marcar explicitamente: `defineRoute({ bypassRls: true, ... })`
- Auditoria automática (audit_log) registra uso de bypass

### 6. Testes (W M2)

- `withTestTx` com `SET LOCAL request.jwt.claims = '{"role": "consultora"}'` para simular role real
- Testes em `__tests__/integration/rls/` validam que RLS bloqueia o que deve bloquear

## Consequências

### Positivas

- Defesa em profundidade real — bug em wrapper não compromete dados (RLS pega)
- RLS no banco continua sendo fonte da verdade para autorização
- Wrapper acelera resposta para casos óbvios (sem ir ao banco)
- Testes de RLS sistematizados

### Negativas

- Complexidade no `defineRoute` (precisa passar role via SET LOCAL)
- Performance: cada request faz `SET LOCAL` — overhead minimal mas existe
- Devs precisam entender ambos mecanismos
- Dificuldade de debug: erro pode vir do app ou do banco

### Neutras

- Impacta Story 1.4 (wrapper precisa de funcionalidade extra) — esforço +0.5d
- Adiciona testes de RLS em Stories 2.2-2.4

## Considerações de migração

Rotas existentes que NÃO usam wrapper continuam funcionando porque:
- Conexão atual é privilegiada → RLS bypass natural
- Lógica de permissão é em código aplicação

Migração para wrapper deve ser **gradual e testada**. Cada rota migrada:
1. Confirmar que RLS policies cobrem a tabela
2. Adicionar `defineRoute` com `requirePermissao`
3. Testar 401/403 esperado para roles diferentes
4. Confirmar que admin `bypassRls: true` ainda funciona

## Referências

- `docs/plano-fonte-da-verdade.md` §4.1
- `docs/stories/1.4.zod-wrapper-helpers.md` (precisa adicionar Task de RLS)
- `docs/architecture/validacao-tecnica-plano.md` §2.5
- `supabase/migrations/068_role_varchar.sql` (RLS migration)
- CLAUDE.md §1, §6 (roles)
