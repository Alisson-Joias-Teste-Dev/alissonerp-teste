---
name: Permissões no banco de dados
description: Regras de acesso por schema — CRUD apenas em alissonerp, leitura nos demais
type: feedback
---

Permissão de acesso ao banco por schema:

- `alissonerp` → CRUD completo (SELECT, INSERT, UPDATE, DELETE, CREATE TABLE, ALTER, etc.) — com cuidado para não quebrar o que está em produção
- `public` → SOMENTE LEITURA (SELECT) — nunca INSERT, UPDATE, DELETE ou DDL
- `directus` → SOMENTE LEITURA (SELECT) — nunca INSERT, UPDATE, DELETE ou DDL

**Why:** public e directus são schemas externos controlados por outros sistemas (PDV/Directus). Qualquer escrita nesses schemas poderia quebrar o PDV e o sistema legado em produção.

**How to apply:** Antes de qualquer operação de escrita, confirmar que a tabela está em `alissonerp`. Se precisar de dados de public/directus, usar apenas em SELECTs e JOINs dentro das queries.
