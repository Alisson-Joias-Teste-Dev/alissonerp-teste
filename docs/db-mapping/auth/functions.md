# `auth` — Funções e Procedures

> 4 entradas | gerado 2026-04-29

## Índice

- [`email()`](#email)
- [`jwt()`](#jwt)
- [`role()`](#role)
- [`uid()`](#uid)

_🛡️ = SECURITY DEFINER_

---

## email

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `text`
- **Volatility:** STABLE
- **Comentário:** Deprecated. Use auth.jwt() -> 'email' instead.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION auth.email()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.email', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$function$

```

</details>

_Sem referência identificada no código._

---

## jwt

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `jsonb`
- **Volatility:** STABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION auth.jwt()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select 
    coalesce(
        nullif(current_setting('request.jwt.claim', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')
    )::jsonb
$function$

```

</details>

_Sem referência identificada no código._

---

## role

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `text`
- **Volatility:** STABLE
- **Comentário:** Deprecated. Use auth.jwt() -> 'role' instead.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION auth.role()
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$

```

</details>

_Sem referência identificada no código._

---

## uid

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** STABLE
- **Comentário:** Deprecated. Use auth.jwt() -> 'sub' instead.

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION auth.uid()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  select 
  coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$function$

```

</details>

_Sem referência identificada no código._

---

