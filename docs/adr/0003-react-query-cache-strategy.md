# ADR 0003 — Cache Strategy no useAuth (TTL + Invalidação Explícita)

**Status:** Accepted  
**Data:** 2026-04-29  
**Story:** 1.3  

## Contexto

O hook `useAuth` é usado em 17+ componentes simultaneamente. Sem cache, cada mount disparava 2 fetches paralelos (`/api/user/role` + `/api/user/permissoes`), saturando o limite de 6 conexões simultâneas do browser e causando flash de estado "loading" em toda a UI.

A solução inicial era um cache module-global sem TTL: o estado era carregado uma vez e ficava estático até logout. Isso criava um bug de segurança real: usuário promovido a `admin` (via tela de gestão de usuários) não via as novas permissões até fechar e reabrir o browser — o role antigo permanecia cacheado indefinidamente.

React Query foi avaliado como solução mais completa, mas adiciona ~13KB de dependência e requer refatorar o modelo de cache compartilhado entre componentes não-React (middleware, rotas server-side).

## Decisão

Manter cache module-global (não React Query) com TTL de 5 minutos e função de invalidação explícita:

```typescript
const CACHE_TTL_MS = 5 * 60 * 1000;
export function invalidarCacheAuth(): void { ... }
```

- Cache expirado (`Date.now() - cachedAt > CACHE_TTL_MS`) → próximo acesso dispara novo fetch
- `invalidarCacheAuth()` é chamada imediatamente após mutations que alteram role ou permissões (ex: salvar perfil, alterar role na tela de gestão)
- Um único `inflightPromise` deduplica fetches concorrentes: 17 componentes montando ao mesmo tempo disparam apenas 1 fetch, e todos recebem o mesmo estado via `subscribers`
- `supabase.auth.onAuthStateChange` invalida o cache automaticamente em logout/login

React Query completo fica adiado para versão futura quando (ou se) houver necessidade de cache por query individual.

## Consequências

**Positivas:**
- Role propagado em até 5 minutos sem logout — janela aceitável para operações internas
- `invalidarCacheAuth()` nas mutations críticas garante reatividade imediata quando necessário
- Zero dependências novas (sem React Query, sem Zustand para auth)
- Modelo de `subscribers` elimina o problema dos 17 fetches paralelos

**Negativas:**
- Janela de 5 minutos: usuário com role rebaixado pode continuar operando por até 5min (mitigado pela verificação server-side em cada request)
- Cache module-global não é resetado entre navegações SPA — behavior correto, mas não-óbvio para novos devs
- React Query adiado: sem cache por query, sem stale-while-revalidate granular

**Neutras:**
- Evento custom `perfil:foto-atualizada` atualiza apenas `fotoUrl` sem invalidar todo o cache

## Arquivos

- `src/hooks/useAuth.ts` — implementação completa com TTL, subscribers, invalidarCacheAuth
