# ADR 0001 — Zod Validation Wrapper (defineRoute)

**Status:** Accepted  
**Data:** 2026-04-29  
**Story:** 1.4  

## Contexto

As 100+ rotas Next.js do Alisson ERP repetiam o mesmo padrão manual de validação: parse do body, verificação de campos obrigatórios, checagem de role via `supabase.auth.getUser()`, e blocos try/catch individuais. Erros de validação retornavam mensagens inconsistentes (alguns 400, outros 500, alguns sem body). Não havia contrato de tipos entre o corpo da request e o handler — o handler recebia `any` e fazia casts internos.

Qualquer nova rota exigia copiar o boilerplate de ~30 linhas de auth+validação, e bugs no padrão se espalhavam independentemente por cada rota.

## Decisão

Criar `defineRoute({ inputSchema, requireRoles, handler })` em `src/lib/api-handler.ts` — um wrapper que centraliza auth, autorização por role e validação Zod antes de passar controle ao handler.

O handler recebe `{ user: AuthUser, body: TInput, params }` com tipos garantidos:
- `user` sempre presente (401 se não autenticado)
- `body` já validado e tipado via Zod (400 com lista de issues se inválido)
- `requireRoles` bloqueia com 403 antes de qualquer lógica de negócio

Erros de auth, Zod e de negócio são tratados de forma uniforme: `AuthError` → 401, `ForbiddenError` → 403, Zod parse fail → 400 com `{ error, issues }`, exceções não tratadas → 500.

## Consequências

**Positivas:**
- Tipagem end-to-end: o handler sabe exatamente quais campos existem no body
- Padrão de erro 400 uniforme em todas as rotas com `inputSchema`
- Redução de ~25 linhas de boilerplate por rota migrada
- Falha de autenticação detectada antes de qualquer query ao banco

**Negativas:**
- Rotas legadas ainda usam o padrão manual — a migração é gradual e coexiste por tempo indeterminado
- Handler não pode ler o body original após parse (Zod consome o stream); workarounds com `req.json()` direto ficam fora do wrapper

**Neutras:**
- `inputSchema` é opcional — rotas GET (sem body) usam apenas `requireRoles` sem schema

## Arquivos

- `src/lib/api-handler.ts` — implementação de `defineRoute`
- `src/lib/auth-server.ts` — `requireAuth`, `AuthError`, `ForbiddenError`, `AuthUser`
