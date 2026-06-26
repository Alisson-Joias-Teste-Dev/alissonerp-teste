# `extensions` — Funções e Procedures

> 125 entradas | gerado 2026-04-29

## Índice

- [`airtable_fdw_handler()`](#airtable_fdw_handler)
- [`airtable_fdw_meta()`](#airtable_fdw_meta)
- [`airtable_fdw_validator(options text[], catalog oid)`](#airtable_fdw_validator)
- [`armor(bytea)`](#armor)
- [`armor(bytea, text[], text[])`](#armor)
- [`auth0_fdw_handler()`](#auth0_fdw_handler)
- [`auth0_fdw_meta()`](#auth0_fdw_meta)
- [`auth0_fdw_validator(options text[], catalog oid)`](#auth0_fdw_validator)
- [`big_query_fdw_handler()`](#big_query_fdw_handler)
- [`big_query_fdw_meta()`](#big_query_fdw_meta)
- [`big_query_fdw_validator(options text[], catalog oid)`](#big_query_fdw_validator)
- [`bytea_to_text(data bytea)`](#bytea_to_text)
- [`click_house_fdw_handler()`](#click_house_fdw_handler)
- [`click_house_fdw_meta()`](#click_house_fdw_meta)
- [`click_house_fdw_validator(options text[], catalog oid)`](#click_house_fdw_validator)
- [`cognito_fdw_handler()`](#cognito_fdw_handler)
- [`cognito_fdw_meta()`](#cognito_fdw_meta)
- [`cognito_fdw_validator(options text[], catalog oid)`](#cognito_fdw_validator)
- [`crypt(text, text)`](#crypt)
- [`dearmor(text)`](#dearmor)
- [`decrypt(bytea, bytea, text)`](#decrypt)
- [`decrypt_iv(bytea, bytea, bytea, text)`](#decrypt_iv)
- [`digest(bytea, text)`](#digest)
- [`digest(text, text)`](#digest)
- [`encrypt(bytea, bytea, text)`](#encrypt)
- [`encrypt_iv(bytea, bytea, bytea, text)`](#encrypt_iv)
- [`firebase_fdw_handler()`](#firebase_fdw_handler)
- [`firebase_fdw_meta()`](#firebase_fdw_meta)
- [`firebase_fdw_validator(options text[], catalog oid)`](#firebase_fdw_validator)
- [`gen_random_bytes(integer)`](#gen_random_bytes)
- [`gen_random_uuid()`](#gen_random_uuid)
- [`gen_salt(text)`](#gen_salt)
- [`gen_salt(text, integer)`](#gen_salt)
- [`grant_pg_cron_access()`](#grant_pg_cron_access)
- [`grant_pg_graphql_access()`](#grant_pg_graphql_access)
- [`grant_pg_net_access()`](#grant_pg_net_access)
- [`hello_world_fdw_handler()`](#hello_world_fdw_handler)
- [`hello_world_fdw_meta()`](#hello_world_fdw_meta)
- [`hello_world_fdw_validator(options text[], catalog oid)`](#hello_world_fdw_validator)
- [`hmac(bytea, bytea, text)`](#hmac)
- [`hmac(text, text, text)`](#hmac)
- [`http(request http_request)`](#http)
- [`http_delete(uri character varying)`](#http_delete)
- [`http_delete(uri character varying, content character varying, content_type character varying)`](#http_delete)
- [`http_get(uri character varying)`](#http_get)
- [`http_get(uri character varying, data jsonb)`](#http_get)
- [`http_head(uri character varying)`](#http_head)
- [`http_header(field character varying, value character varying)`](#http_header)
- [`http_list_curlopt()`](#http_list_curlopt)
- [`http_patch(uri character varying, content character varying, content_type character varying)`](#http_patch)
- [`http_post(uri character varying, content character varying, content_type character varying)`](#http_post)
- [`http_post(uri character varying, data jsonb)`](#http_post)
- [`http_put(uri character varying, content character varying, content_type character varying)`](#http_put)
- [`http_reset_curlopt()`](#http_reset_curlopt)
- [`http_set_curlopt(curlopt character varying, value character varying)`](#http_set_curlopt)
- [`hypopg(OUT indexname text, OUT indexrelid oid, OUT indrelid oid, OUT innatts integer, O)`](#hypopg)
- [`hypopg_create_index(sql_order text, OUT indexrelid oid, OUT indexname text)`](#hypopg_create_index)
- [`hypopg_drop_index(indexid oid)`](#hypopg_drop_index)
- [`hypopg_get_indexdef(indexid oid)`](#hypopg_get_indexdef)
- [`hypopg_hidden_indexes()`](#hypopg_hidden_indexes)
- [`hypopg_hide_index(indexid oid)`](#hypopg_hide_index)
- [`hypopg_relation_size(indexid oid)`](#hypopg_relation_size)
- [`hypopg_reset()`](#hypopg_reset)
- [`hypopg_reset_index()`](#hypopg_reset_index)
- [`hypopg_unhide_all_indexes()`](#hypopg_unhide_all_indexes)
- [`hypopg_unhide_index(indexid oid)`](#hypopg_unhide_index)
- [`index_advisor(query text)`](#index_advisor)
- [`logflare_fdw_handler()`](#logflare_fdw_handler)
- [`logflare_fdw_meta()`](#logflare_fdw_meta)
- [`logflare_fdw_validator(options text[], catalog oid)`](#logflare_fdw_validator)
- [`mssql_fdw_handler()`](#mssql_fdw_handler)
- [`mssql_fdw_meta()`](#mssql_fdw_meta)
- [`mssql_fdw_validator(options text[], catalog oid)`](#mssql_fdw_validator)
- [`pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryi)`](#pg_stat_statements)
- [`pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone)`](#pg_stat_statements_info)
- [`pg_stat_statements_reset(userid oid, dbid oid, queryid bigint)`](#pg_stat_statements_reset)
- [`pgp_armor_headers(text, OUT key text, OUT value text)`](#pgp_armor_headers)
- [`pgp_key_id(bytea)`](#pgp_key_id)
- [`pgp_pub_decrypt(bytea, bytea)`](#pgp_pub_decrypt)
- [`pgp_pub_decrypt(bytea, bytea, text)`](#pgp_pub_decrypt)
- [`pgp_pub_decrypt(bytea, bytea, text, text)`](#pgp_pub_decrypt)
- [`pgp_pub_decrypt_bytea(bytea, bytea)`](#pgp_pub_decrypt_bytea)
- [`pgp_pub_decrypt_bytea(bytea, bytea, text)`](#pgp_pub_decrypt_bytea)
- [`pgp_pub_decrypt_bytea(bytea, bytea, text, text)`](#pgp_pub_decrypt_bytea)
- [`pgp_pub_encrypt(text, bytea)`](#pgp_pub_encrypt)
- [`pgp_pub_encrypt(text, bytea, text)`](#pgp_pub_encrypt)
- [`pgp_pub_encrypt_bytea(bytea, bytea)`](#pgp_pub_encrypt_bytea)
- [`pgp_pub_encrypt_bytea(bytea, bytea, text)`](#pgp_pub_encrypt_bytea)
- [`pgp_sym_decrypt(bytea, text)`](#pgp_sym_decrypt)
- [`pgp_sym_decrypt(bytea, text, text)`](#pgp_sym_decrypt)
- [`pgp_sym_decrypt_bytea(bytea, text)`](#pgp_sym_decrypt_bytea)
- [`pgp_sym_decrypt_bytea(bytea, text, text)`](#pgp_sym_decrypt_bytea)
- [`pgp_sym_encrypt(text, text)`](#pgp_sym_encrypt)
- [`pgp_sym_encrypt(text, text, text)`](#pgp_sym_encrypt)
- [`pgp_sym_encrypt_bytea(bytea, text)`](#pgp_sym_encrypt_bytea)
- [`pgp_sym_encrypt_bytea(bytea, text, text)`](#pgp_sym_encrypt_bytea)
- [`pgrst_ddl_watch()`](#pgrst_ddl_watch)
- [`pgrst_drop_watch()`](#pgrst_drop_watch)
- [`redis_fdw_handler()`](#redis_fdw_handler)
- [`redis_fdw_meta()`](#redis_fdw_meta)
- [`redis_fdw_validator(options text[], catalog oid)`](#redis_fdw_validator)
- [`s3_fdw_handler()`](#s3_fdw_handler)
- [`s3_fdw_meta()`](#s3_fdw_meta)
- [`s3_fdw_validator(options text[], catalog oid)`](#s3_fdw_validator)
- [`set_graphql_placeholder()`](#set_graphql_placeholder)
- [`stripe_fdw_handler()`](#stripe_fdw_handler)
- [`stripe_fdw_meta()`](#stripe_fdw_meta)
- [`stripe_fdw_validator(options text[], catalog oid)`](#stripe_fdw_validator)
- [`text_to_bytea(data text)`](#text_to_bytea)
- [`urlencode(data jsonb)`](#urlencode)
- [`urlencode(string bytea)`](#urlencode)
- [`urlencode(string character varying)`](#urlencode)
- [`uuid_generate_v1()`](#uuid_generate_v1)
- [`uuid_generate_v1mc()`](#uuid_generate_v1mc)
- [`uuid_generate_v3(namespace uuid, name text)`](#uuid_generate_v3)
- [`uuid_generate_v4()`](#uuid_generate_v4)
- [`uuid_generate_v5(namespace uuid, name text)`](#uuid_generate_v5)
- [`uuid_nil()`](#uuid_nil)
- [`uuid_ns_dns()`](#uuid_ns_dns)
- [`uuid_ns_oid()`](#uuid_ns_oid)
- [`uuid_ns_url()`](#uuid_ns_url)
- [`uuid_ns_x500()`](#uuid_ns_x500)
- [`wasm_fdw_handler()`](#wasm_fdw_handler)
- [`wasm_fdw_meta()`](#wasm_fdw_meta)
- [`wasm_fdw_validator(options text[], catalog oid)`](#wasm_fdw_validator)

_🛡️ = SECURITY DEFINER_

---

## airtable_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.airtable_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$airtable_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## airtable_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.airtable_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$airtable_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## airtable_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.airtable_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$airtable_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## armor

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.armor(bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_armor$function$

```

</details>

_Sem referência identificada no código._

---

## armor

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, text[], text[]`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.armor(bytea, text[], text[])
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_armor$function$

```

</details>

_Sem referência identificada no código._

---

## auth0_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.auth0_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$auth0_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## auth0_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.auth0_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$auth0_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## auth0_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.auth0_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$auth0_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## big_query_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.big_query_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$big_query_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## big_query_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.big_query_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$big_query_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## big_query_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.big_query_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$big_query_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## bytea_to_text

- **Tipo:** FUNCTION (c)
- **Argumentos:** `data bytea`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.bytea_to_text(data bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/http', $function$bytea_to_text$function$

```

</details>

_Sem referência identificada no código._

---

## click_house_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.click_house_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$click_house_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## click_house_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.click_house_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$click_house_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## click_house_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.click_house_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$click_house_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## cognito_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.cognito_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$cognito_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## cognito_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.cognito_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$cognito_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## cognito_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.cognito_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$cognito_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## crypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text, text`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.crypt(text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_crypt$function$

```

</details>

_Sem referência identificada no código._

---

## dearmor

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.dearmor(text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_dearmor$function$

```

</details>

_Sem referência identificada no código._

---

## decrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.decrypt(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_decrypt$function$

```

</details>

_Sem referência identificada no código._

---

## decrypt_iv

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, bytea, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.decrypt_iv(bytea, bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_decrypt_iv$function$

```

</details>

_Sem referência identificada no código._

---

## digest

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.digest(bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_digest$function$

```

</details>

_Sem referência identificada no código._

---

## digest

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.digest(text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_digest$function$

```

</details>

_Sem referência identificada no código._

---

## encrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.encrypt(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_encrypt$function$

```

</details>

_Sem referência identificada no código._

---

## encrypt_iv

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, bytea, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.encrypt_iv(bytea, bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_encrypt_iv$function$

```

</details>

_Sem referência identificada no código._

---

## firebase_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.firebase_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$firebase_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## firebase_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.firebase_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$firebase_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## firebase_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.firebase_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$firebase_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## gen_random_bytes

- **Tipo:** FUNCTION (c)
- **Argumentos:** `integer`
- **Retorno:** `bytea`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.gen_random_bytes(integer)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_random_bytes$function$

```

</details>

_Sem referência identificada no código._

---

## gen_random_uuid

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.gen_random_uuid()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE
AS '$libdir/pgcrypto', $function$pg_random_uuid$function$

```

</details>

_Sem referência identificada no código._

---

## gen_salt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text`
- **Retorno:** `text`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.gen_salt(text)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt$function$

```

</details>

_Sem referência identificada no código._

---

## gen_salt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text, integer`
- **Retorno:** `text`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.gen_salt(text, integer)
 RETURNS text
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_gen_salt_rounds$function$

```

</details>

_Sem referência identificada no código._

---

## grant_pg_cron_access

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `event_trigger`
- **Volatility:** VOLATILE
- **Comentário:** Grants access to pg_cron

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.grant_pg_cron_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
  END IF;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## grant_pg_graphql_access

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `event_trigger`
- **Volatility:** VOLATILE
- **Comentário:** Grants access to pg_graphql

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.grant_pg_graphql_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    func_is_graphql_resolve bool;
BEGIN
    func_is_graphql_resolve = (
        SELECT n.proname = 'resolve'
        FROM pg_event_trigger_ddl_commands() AS ev
        LEFT JOIN pg_catalog.pg_proc AS n
        ON ev.objid = n.oid
    );

    IF func_is_graphql_resolve
    THEN
        -- Update public wrapper to pass all arguments through to the pg_graphql resolve func
        DROP FUNCTION IF EXISTS graphql_public.graphql;
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language sql
        as $$
            select graphql.resolve(
                query := query,
                variables := coalesce(variables, '{}'),
                "operationName" := "operationName",
                extensions := extensions
            );
        $$;

        -- This hook executes when `graphql.resolve` is created. That is not necessarily the last
        -- function in the extension so we need to grant permissions on existing entities AND
        -- update default permissions to any others that are created after `graphql.resolve`
        grant usage on schema graphql to postgres, anon, authenticated, service_role;
        grant select on all tables in schema graphql to postgres, anon, authenticated, service_role;
        grant execute on all functions in schema graphql to postgres, anon, authenticated, service_role;
        grant all on all sequences in schema graphql to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on tables to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on functions to postgres, anon, authenticated, service_role;
        alter default privileges in schema graphql grant all on sequences to postgres, anon, authenticated, service_role;

        -- Allow postgres role to allow granting usage on graphql and graphql_public schemas to custom roles
        grant usage on schema graphql_public to postgres with grant option;
        grant usage on schema graphql to postgres with grant option;
    END IF;

END;
$function$

```

</details>

_Sem referência identificada no código._

---

## grant_pg_net_access

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `event_trigger`
- **Volatility:** VOLATILE
- **Comentário:** Grants access to pg_net

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.grant_pg_net_access()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$function$

```

</details>

_Sem referência identificada no código._

---

## hello_world_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hello_world_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$hello_world_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## hello_world_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hello_world_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$hello_world_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## hello_world_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hello_world_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$hello_world_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## hmac

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hmac(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_hmac$function$

```

</details>

_Sem referência identificada no código._

---

## hmac

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text, text, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hmac(text, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pg_hmac$function$

```

</details>

_Sem referência identificada no código._

---

## http

- **Tipo:** FUNCTION (c)
- **Argumentos:** `request http_request`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http(request http_request)
 RETURNS http_response
 LANGUAGE c
AS '$libdir/http', $function$http_request$function$

```

</details>

_Sem referência identificada no código._

---

## http_delete

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `uri character varying`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_delete(uri character varying)
 RETURNS http_response
 LANGUAGE sql
AS $function$ SELECT extensions.http(('DELETE', $1, NULL, NULL, NULL)::extensions.http_request) $function$

```

</details>

_Sem referência identificada no código._

---

## http_delete

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `uri character varying, content character varying, content_type character varying`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_delete(uri character varying, content character varying, content_type character varying)
 RETURNS http_response
 LANGUAGE sql
AS $function$ SELECT extensions.http(('DELETE', $1, NULL, $3, $2)::extensions.http_request) $function$

```

</details>

_Sem referência identificada no código._

---

## http_get

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `uri character varying`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_get(uri character varying)
 RETURNS http_response
 LANGUAGE sql
AS $function$ SELECT extensions.http(('GET', $1, NULL, NULL, NULL)::extensions.http_request) $function$

```

</details>

_Sem referência identificada no código._

---

## http_get

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `uri character varying, data jsonb`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_get(uri character varying, data jsonb)
 RETURNS http_response
 LANGUAGE sql
AS $function$
        SELECT extensions.http(('GET', $1 || '?' || extensions.urlencode($2), NULL, NULL, NULL)::extensions.http_request)
    $function$

```

</details>

_Sem referência identificada no código._

---

## http_head

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `uri character varying`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_head(uri character varying)
 RETURNS http_response
 LANGUAGE sql
AS $function$ SELECT extensions.http(('HEAD', $1, NULL, NULL, NULL)::extensions.http_request) $function$

```

</details>

_Sem referência identificada no código._

---

## http_header

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `field character varying, value character varying`
- **Retorno:** `http_header`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_header(field character varying, value character varying)
 RETURNS http_header
 LANGUAGE sql
AS $function$ SELECT $1, $2 $function$

```

</details>

_Sem referência identificada no código._

---

## http_list_curlopt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(curlopt text, value text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_list_curlopt()
 RETURNS TABLE(curlopt text, value text)
 LANGUAGE c
AS '$libdir/http', $function$http_list_curlopt$function$

```

</details>

_Sem referência identificada no código._

---

## http_patch

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `uri character varying, content character varying, content_type character varying`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_patch(uri character varying, content character varying, content_type character varying)
 RETURNS http_response
 LANGUAGE sql
AS $function$ SELECT extensions.http(('PATCH', $1, NULL, $3, $2)::extensions.http_request) $function$

```

</details>

_Sem referência identificada no código._

---

## http_post

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `uri character varying, content character varying, content_type character varying`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_post(uri character varying, content character varying, content_type character varying)
 RETURNS http_response
 LANGUAGE sql
AS $function$ SELECT extensions.http(('POST', $1, NULL, $3, $2)::extensions.http_request) $function$

```

</details>

_Sem referência identificada no código._

---

## http_post

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `uri character varying, data jsonb`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_post(uri character varying, data jsonb)
 RETURNS http_response
 LANGUAGE sql
AS $function$
        SELECT extensions.http(('POST', $1, NULL, 'application/x-www-form-urlencoded', extensions.urlencode($2))::extensions.http_request)
    $function$

```

</details>

_Sem referência identificada no código._

---

## http_put

- **Tipo:** FUNCTION (sql)
- **Argumentos:** `uri character varying, content character varying, content_type character varying`
- **Retorno:** `http_response`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_put(uri character varying, content character varying, content_type character varying)
 RETURNS http_response
 LANGUAGE sql
AS $function$ SELECT extensions.http(('PUT', $1, NULL, $3, $2)::extensions.http_request) $function$

```

</details>

_Sem referência identificada no código._

---

## http_reset_curlopt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `boolean`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_reset_curlopt()
 RETURNS boolean
 LANGUAGE c
AS '$libdir/http', $function$http_reset_curlopt$function$

```

</details>

_Sem referência identificada no código._

---

## http_set_curlopt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `curlopt character varying, value character varying`
- **Retorno:** `boolean`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.http_set_curlopt(curlopt character varying, value character varying)
 RETURNS boolean
 LANGUAGE c
AS '$libdir/http', $function$http_set_curlopt$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg

- **Tipo:** FUNCTION (c)
- **Argumentos:** `OUT indexname text, OUT indexrelid oid, OUT indrelid oid, OUT innatts integer, OUT indisunique boolean, OUT indkey int2vector, OUT indcollation oidvector, OUT indclass oidvector, OUT indoption oidvector, OUT indexprs pg_node_tree, OUT indpred pg_node_tree, OUT amid oid`
- **Retorno:** `SETOF record`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg(OUT indexname text, OUT indexrelid oid, OUT indrelid oid, OUT innatts integer, OUT indisunique boolean, OUT indkey int2vector, OUT indcollation oidvector, OUT indclass oidvector, OUT indoption oidvector, OUT indexprs pg_node_tree, OUT indpred pg_node_tree, OUT amid oid)
 RETURNS SETOF record
 LANGUAGE c
 COST 100
AS '$libdir/hypopg', $function$hypopg$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_create_index

- **Tipo:** FUNCTION (c)
- **Argumentos:** `sql_order text, OUT indexrelid oid, OUT indexname text`
- **Retorno:** `SETOF record`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_create_index(sql_order text, OUT indexrelid oid, OUT indexname text)
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_create_index$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_drop_index

- **Tipo:** FUNCTION (c)
- **Argumentos:** `indexid oid`
- **Retorno:** `boolean`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_drop_index(indexid oid)
 RETURNS boolean
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_drop_index$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_get_indexdef

- **Tipo:** FUNCTION (c)
- **Argumentos:** `indexid oid`
- **Retorno:** `text`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_get_indexdef(indexid oid)
 RETURNS text
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_get_indexdef$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_hidden_indexes

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(indexid oid)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_hidden_indexes()
 RETURNS TABLE(indexid oid)
 LANGUAGE c
 STRICT
AS '$libdir/hypopg', $function$hypopg_hidden_indexes$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_hide_index

- **Tipo:** FUNCTION (c)
- **Argumentos:** `indexid oid`
- **Retorno:** `boolean`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_hide_index(indexid oid)
 RETURNS boolean
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_hide_index$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_relation_size

- **Tipo:** FUNCTION (c)
- **Argumentos:** `indexid oid`
- **Retorno:** `bigint`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_relation_size(indexid oid)
 RETURNS bigint
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_relation_size$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_reset

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_reset()
 RETURNS void
 LANGUAGE c
 COST 100
AS '$libdir/hypopg', $function$hypopg_reset$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_reset_index

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_reset_index()
 RETURNS void
 LANGUAGE c
 COST 100
AS '$libdir/hypopg', $function$hypopg_reset_index$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_unhide_all_indexes

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_unhide_all_indexes()
 RETURNS void
 LANGUAGE c
 COST 100
AS '$libdir/hypopg', $function$hypopg_unhide_all_indexes$function$

```

</details>

_Sem referência identificada no código._

---

## hypopg_unhide_index

- **Tipo:** FUNCTION (c)
- **Argumentos:** `indexid oid`
- **Retorno:** `boolean`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.hypopg_unhide_index(indexid oid)
 RETURNS boolean
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_unhide_index$function$

```

</details>

_Sem referência identificada no código._

---

## index_advisor

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `query text`
- **Retorno:** `TABLE(startup_cost_before jsonb, startup_cost_after jsonb, total_cost_before jsonb, total_cost_after jsonb, index_statements text[], errors text[])`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.index_advisor(query text)
 RETURNS TABLE(startup_cost_before jsonb, startup_cost_after jsonb, total_cost_before jsonb, total_cost_after jsonb, index_statements text[], errors text[])
 LANGUAGE plpgsql
AS $function$
declare
    n_args int;
    prepared_statement_name text = 'index_advisor_working_statement';
    hypopg_schema_name text = (select extnamespace::regnamespace::text from pg_extension where extname = 'hypopg');
    explain_plan_statement text;
    error_message text;
    rec record;
    plan_initial jsonb;
    plan_final jsonb;
    statements text[] = '{}';
begin

    -- Remove comment lines (its common that they contain semicolons)
    query := trim(
        regexp_replace(
            regexp_replace(
                regexp_replace(query,'\/\*.+\*\/', '', 'g'),
            '--[^\r\n]*', ' ', 'g'),
        '\s+', ' ', 'g')
    );

    -- Remove trailing semicolon
    query := regexp_replace(query, ';\s*$', '');

    begin
        -- Disallow multiple statements
        if query ilike '%;%' then
            raise exception 'Query must not contain a semicolon';
        end if;

        -- Hack to support PostgREST because the prepared statement for args incorrectly defaults to text
        query := replace(query, 'WITH pgrst_payload AS (SELECT $1 AS json_data)', 'WITH pgrst_payload AS (SELECT $1::json AS json_data)');

        -- Create a prepared statement for the given query
        deallocate all;
        execute format('prepare %I as %s', prepared_statement_name, query);

        -- Detect how many arguments are present in the prepared statement
        n_args = (
            select
                coalesce(array_length(parameter_types, 1), 0)
            from
                pg_prepared_statements
            where
                name = prepared_statement_name
            limit
                1
        );

        -- Create a SQL statement that can be executed to collect the explain plan
        explain_plan_statement = format(
            'set local plan_cache_mode = force_generic_plan; explain (format json) execute %I%s',
            --'explain (format json) execute %I%s',
            prepared_statement_name,
            case
                when n_args = 0 then ''
                else format(
                    '(%s)', array_to_string(array_fill('null'::text, array[n_args]), ',')
                )
            end
        );

        -- Store the query plan before any new indexes
        execute explain_plan_statement into plan_initial;

        -- Create possible indexes
        for rec in (
            with extension_regclass as (
                select
                    distinct objid as oid
                from
                    pg_catalog.pg_depend
                where
                    deptype = 'e'
            )
            select
                pc.relnamespace::regnamespace::text as schema_name,
                pc.relname as table_name,
                pa.attname as column_name,
                format(
                    'select %I.hypopg_create_index($i$create index on %I.%I(%I)$i$)',
                    hypopg_schema_name,
                    pc.relnamespace::regnamespace::text,
                    pc.relname,
                    pa.attname
                ) hypopg_statement
            from
                pg_catalog.pg_class pc
                join pg_catalog.pg_attribute pa
                    on pc.oid = pa.attrelid
                left join extension_regclass er
                    on pc.oid = er.oid
                left join pg_catalog.pg_index pi
                    on pc.oid = pi.indrelid
                    and (select array_agg(x) from unnest(pi.indkey) v(x)) = array[pa.attnum]
                    and pi.indexprs is null -- ignore expression indexes
                    and pi.indpred is null -- ignore partial indexes
            where
                pc.relnamespace::regnamespace::text not in ( -- ignore schema list
                    'pg_catalog', 'pg_toast', 'information_schema'
                )
                and er.oid is null -- ignore entities owned by extensions
                and pc.relkind in ('r', 'm') -- regular tables, and materialized views
                and pc.relpersistence = 'p' -- permanent tables (not unlogged or temporary)
                and pa.attnum > 0
                and not pa.attisdropped
                and pi.indrelid is null
                and pa.atttypid in (20,16,1082,1184,1114,701,23,21,700,1083,2950,1700,25,18,1042,1043)
            )
            loop
                -- Create the hypothetical index
                execute rec.hypopg_statement;
            end loop;

        /*
        for rec in select * from hypopg()
            loop
                raise notice '%', rec;
            end loop;
        */

        -- Create a prepared statement for the given query
        -- The original prepared statement MUST be dropped because its plan is cached
        execute format('deallocate %I', prepared_statement_name);
        execute format('prepare %I as %s', prepared_statement_name, query);

        -- Store the query plan after new indexes
        execute explain_plan_statement into plan_final;

        --raise notice '%', plan_final;

        -- Idenfity referenced indexes in new plan
        execute format(
            'select
                coalesce(array_agg(hypopg_get_indexdef(indexrelid) order by indrelid, indkey::text), $i${}$i$::text[])
            from
                %I.hypopg()
            where
                %s ilike ($i$%%$i$ || indexname || $i$%%$i$)
            ',
            hypopg_schema_name,
            quote_literal(plan_final)::text
        ) into statements;

        -- Reset all hypothetical indexes
        perform hypopg_reset();

        -- Reset prepared statements
        deallocate all;

        return query values (
            (plan_initial -> 0 -> 'Plan' -> 'Startup Cost'),
            (plan_final -> 0 -> 'Plan' -> 'Startup Cost'),
            (plan_initial -> 0 -> 'Plan' -> 'Total Cost'),
            (plan_final -> 0 -> 'Plan' -> 'Total Cost'),
            statements::text[],
            array[]::text[]
        );
        return;

    exception when others then
        get stacked diagnostics error_message = MESSAGE_TEXT;

        return query values (
            null::jsonb,
            null::jsonb,
            null::jsonb,
            null::jsonb,
            array[]::text[],
            array[error_message]::text[]
        );
        return;
    end;

end;
$function$

```

</details>

_Sem referência identificada no código._

---

## logflare_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.logflare_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$logflare_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## logflare_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.logflare_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$logflare_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## logflare_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.logflare_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$logflare_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## mssql_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.mssql_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$mssql_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## mssql_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.mssql_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$mssql_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## mssql_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.mssql_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$mssql_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## pg_stat_statements

- **Tipo:** FUNCTION (c)
- **Argumentos:** `showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT blk_read_time double precision, OUT blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision`
- **Retorno:** `SETOF record`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pg_stat_statements(showtext boolean, OUT userid oid, OUT dbid oid, OUT toplevel boolean, OUT queryid bigint, OUT query text, OUT plans bigint, OUT total_plan_time double precision, OUT min_plan_time double precision, OUT max_plan_time double precision, OUT mean_plan_time double precision, OUT stddev_plan_time double precision, OUT calls bigint, OUT total_exec_time double precision, OUT min_exec_time double precision, OUT max_exec_time double precision, OUT mean_exec_time double precision, OUT stddev_exec_time double precision, OUT rows bigint, OUT shared_blks_hit bigint, OUT shared_blks_read bigint, OUT shared_blks_dirtied bigint, OUT shared_blks_written bigint, OUT local_blks_hit bigint, OUT local_blks_read bigint, OUT local_blks_dirtied bigint, OUT local_blks_written bigint, OUT temp_blks_read bigint, OUT temp_blks_written bigint, OUT blk_read_time double precision, OUT blk_write_time double precision, OUT temp_blk_read_time double precision, OUT temp_blk_write_time double precision, OUT wal_records bigint, OUT wal_fpi bigint, OUT wal_bytes numeric, OUT jit_functions bigint, OUT jit_generation_time double precision, OUT jit_inlining_count bigint, OUT jit_inlining_time double precision, OUT jit_optimization_count bigint, OUT jit_optimization_time double precision, OUT jit_emission_count bigint, OUT jit_emission_time double precision)
 RETURNS SETOF record
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pg_stat_statements', $function$pg_stat_statements_1_10$function$

```

</details>

**Uso no código:**
- `extensions.pg_stat_statements` — 2 ocorrência(s)
  - `scripts/_db_mapping_build_docs.mjs:146`
  - `scripts/_db_mapping_build_docs.mjs:431`

---

## pg_stat_statements_info

- **Tipo:** FUNCTION (c)
- **Argumentos:** `OUT dealloc bigint, OUT stats_reset timestamp with time zone`
- **Retorno:** `record`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pg_stat_statements_info(OUT dealloc bigint, OUT stats_reset timestamp with time zone)
 RETURNS record
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pg_stat_statements', $function$pg_stat_statements_info$function$

```

</details>

_Sem referência identificada no código._

---

## pg_stat_statements_reset

- **Tipo:** FUNCTION (c)
- **Argumentos:** `userid oid, dbid oid, queryid bigint`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pg_stat_statements_reset(userid oid DEFAULT 0, dbid oid DEFAULT 0, queryid bigint DEFAULT 0)
 RETURNS void
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pg_stat_statements', $function$pg_stat_statements_reset_1_7$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_armor_headers

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text, OUT key text, OUT value text`
- **Retorno:** `SETOF record`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_armor_headers(text, OUT key text, OUT value text)
 RETURNS SETOF record
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_armor_headers$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_key_id

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_key_id(bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_key_id_w$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_decrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt(bytea, bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_decrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, text`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_decrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, text, text`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt(bytea, bytea, text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_text$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_decrypt_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_decrypt_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_decrypt_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, text, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_decrypt_bytea(bytea, bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_decrypt_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_encrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text, bytea`
- **Retorno:** `bytea`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_encrypt(text, bytea)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_text$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_encrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text, bytea, text`
- **Retorno:** `bytea`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_encrypt(text, bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_text$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_encrypt_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea`
- **Retorno:** `bytea`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_pub_encrypt_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, bytea, text`
- **Retorno:** `bytea`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_pub_encrypt_bytea(bytea, bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_pub_encrypt_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_sym_decrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, text`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_sym_decrypt(bytea, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_text$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_sym_decrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, text, text`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_sym_decrypt(bytea, text, text)
 RETURNS text
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_text$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_sym_decrypt_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_sym_decrypt_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, text, text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_sym_decrypt_bytea(bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_decrypt_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_sym_encrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text, text`
- **Retorno:** `bytea`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_sym_encrypt(text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_sym_encrypt

- **Tipo:** FUNCTION (c)
- **Argumentos:** `text, text, text`
- **Retorno:** `bytea`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_sym_encrypt(text, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_text$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_sym_encrypt_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, text`
- **Retorno:** `bytea`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## pgp_sym_encrypt_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `bytea, text, text`
- **Retorno:** `bytea`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgp_sym_encrypt_bytea(bytea, text, text)
 RETURNS bytea
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/pgcrypto', $function$pgp_sym_encrypt_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## pgrst_ddl_watch

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `event_trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgrst_ddl_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $function$

```

</details>

_Sem referência identificada no código._

---

## pgrst_drop_watch

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `event_trigger`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.pgrst_drop_watch()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $function$

```

</details>

_Sem referência identificada no código._

---

## redis_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.redis_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$redis_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## redis_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.redis_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$redis_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## redis_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.redis_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$redis_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## s3_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.s3_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$s3_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## s3_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.s3_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$s3_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## s3_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.s3_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$s3_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## set_graphql_placeholder

- **Tipo:** FUNCTION (plpgsql)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `event_trigger`
- **Volatility:** VOLATILE
- **Comentário:** Reintroduces placeholder function for graphql_public.graphql

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.set_graphql_placeholder()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$function$

```

</details>

_Sem referência identificada no código._

---

## stripe_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.stripe_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$stripe_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## stripe_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.stripe_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$stripe_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## stripe_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.stripe_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$stripe_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## text_to_bytea

- **Tipo:** FUNCTION (c)
- **Argumentos:** `data text`
- **Retorno:** `bytea`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.text_to_bytea(data text)
 RETURNS bytea
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/http', $function$text_to_bytea$function$

```

</details>

_Sem referência identificada no código._

---

## urlencode

- **Tipo:** FUNCTION (c)
- **Argumentos:** `data jsonb`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.urlencode(data jsonb)
 RETURNS text
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/http', $function$urlencode_jsonb$function$

```

</details>

_Sem referência identificada no código._

---

## urlencode

- **Tipo:** FUNCTION (c)
- **Argumentos:** `string bytea`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.urlencode(string bytea)
 RETURNS text
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/http', $function$urlencode$function$

```

</details>

_Sem referência identificada no código._

---

## urlencode

- **Tipo:** FUNCTION (c)
- **Argumentos:** `string character varying`
- **Retorno:** `text`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.urlencode(string character varying)
 RETURNS text
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/http', $function$urlencode$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_generate_v1

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_generate_v1()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_generate_v1mc

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_generate_v1mc()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1mc$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_generate_v3

- **Tipo:** FUNCTION (c)
- **Argumentos:** `namespace uuid, name text`
- **Retorno:** `uuid`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_generate_v3(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v3$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_generate_v4

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v4$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_generate_v5

- **Tipo:** FUNCTION (c)
- **Argumentos:** `namespace uuid, name text`
- **Retorno:** `uuid`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_generate_v5(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v5$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_nil

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_nil()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_nil$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_ns_dns

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_ns_dns()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_dns$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_ns_oid

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_ns_oid()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_oid$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_ns_url

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_ns_url()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_url$function$

```

</details>

_Sem referência identificada no código._

---

## uuid_ns_x500

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `uuid`
- **Volatility:** IMMUTABLE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.uuid_ns_x500()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_x500$function$

```

</details>

_Sem referência identificada no código._

---

## wasm_fdw_handler

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `fdw_handler`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.wasm_fdw_handler()
 RETURNS fdw_handler
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$wasm_fdw_handler_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## wasm_fdw_meta

- **Tipo:** FUNCTION (c)
- **Argumentos:** `(sem argumentos)`
- **Retorno:** `TABLE(name text, version text, author text, website text)`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.wasm_fdw_meta()
 RETURNS TABLE(name text, version text, author text, website text)
 LANGUAGE c
 STRICT
AS '$libdir/wrappers', $function$wasm_fdw_meta_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

## wasm_fdw_validator

- **Tipo:** FUNCTION (c)
- **Argumentos:** `options text[], catalog oid`
- **Retorno:** `void`
- **Volatility:** VOLATILE

<details><summary>Código-fonte completo</summary>

```sql
CREATE OR REPLACE FUNCTION extensions.wasm_fdw_validator(options text[], catalog oid)
 RETURNS void
 LANGUAGE c
AS '$libdir/wrappers', $function$wasm_fdw_validator_wrapper$function$

```

</details>

_Sem referência identificada no código._

---

