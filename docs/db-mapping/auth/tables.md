# `auth` — Tabelas

> 20 tabelas | gerado 2026-04-29

## Índice

- [`audit_log_entries`](#audit_log_entries) — Auth: Audit trail for user actions.
- [`flow_state`](#flow_state) — stores metadata for pkce logins
- [`identities`](#identities) — Auth: Stores identities associated to a user.
- [`instances`](#instances) — Auth: Manages users across multiple sites.
- [`mfa_amr_claims`](#mfa_amr_claims) — auth: stores authenticator method reference claims for multi factor authentication
- [`mfa_challenges`](#mfa_challenges) — auth: stores metadata about challenge requests made
- [`mfa_factors`](#mfa_factors) — auth: stores metadata about factors
- [`oauth_authorizations`](#oauth_authorizations)
- [`oauth_client_states`](#oauth_client_states) — Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.
- [`oauth_clients`](#oauth_clients)
- [`oauth_consents`](#oauth_consents)
- [`one_time_tokens`](#one_time_tokens)
- [`refresh_tokens`](#refresh_tokens) — Auth: Store of tokens used to refresh JWT tokens once they expire.
- [`saml_providers`](#saml_providers) — Auth: Manages SAML Identity Provider connections.
- [`saml_relay_states`](#saml_relay_states) — Auth: Contains SAML Relay State information for each Service Provider initiated login.
- [`schema_migrations`](#schema_migrations) — Auth: Manages updates to the auth system.
- [`sessions`](#sessions) — Auth: Stores session data associated to a user.
- [`sso_domains`](#sso_domains) — Auth: Manages SSO email address domain mapping to an SSO Identity Provider.
- [`sso_providers`](#sso_providers) — Auth: Manages SSO identity provider information; see saml_providers for SAML.
- [`users`](#users) — Auth: Stores user login data within a secure schema.

---

## audit_log_entries

> Auth: Audit trail for user actions.

**Aprox. linhas:** 18125

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `instance_id` | uuid | ✓ | — | — |
| 2 | `id` | uuid | — | — | — |
| 3 | `payload` | json | ✓ | — | — |
| 4 | `created_at` | timestamp with time zone | ✓ | — | — |
| 5 | `ip_address` | character varying(64) | — | `''::character varying` | — |

### Chaves

- **PRIMARY KEY** `audit_log_entries_pkey` — (`id`)

### Índices

- `audit_logs_instance_id_idx` — `CREATE INDEX audit_logs_instance_id_idx ON auth.audit_log_entries USING btree (instance_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## flow_state

> stores metadata for pkce logins

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `user_id` | uuid | ✓ | — | — |
| 3 | `auth_code` | text | — | — | — |
| 4 | `code_challenge_method` | code_challenge_method | — | — | — |
| 5 | `code_challenge` | text | — | — | — |
| 6 | `provider_type` | text | — | — | — |
| 7 | `provider_access_token` | text | ✓ | — | — |
| 8 | `provider_refresh_token` | text | ✓ | — | — |
| 9 | `created_at` | timestamp with time zone | ✓ | — | — |
| 10 | `updated_at` | timestamp with time zone | ✓ | — | — |
| 11 | `authentication_method` | text | — | — | — |
| 12 | `auth_code_issued_at` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `flow_state_pkey` — (`id`)

### Referenciada por (entrada)

- `auth.saml_relay_states.flow_state_id` (constraint `saml_relay_states_flow_state_id_fkey`)

### Índices

- `flow_state_created_at_idx` — `CREATE INDEX flow_state_created_at_idx ON auth.flow_state USING btree (created_at DESC)`
- `idx_auth_code` — `CREATE INDEX idx_auth_code ON auth.flow_state USING btree (auth_code)`
- `idx_user_id_auth_method` — `CREATE INDEX idx_user_id_auth_method ON auth.flow_state USING btree (user_id, authentication_method)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## identities

> Auth: Stores identities associated to a user.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `provider_id` | text | — | — | — |
| 2 | `user_id` | uuid | — | — | — |
| 3 | `identity_data` | jsonb | — | — | — |
| 4 | `provider` | text | — | — | — |
| 5 | `last_sign_in_at` | timestamp with time zone | ✓ | — | — |
| 6 | `created_at` | timestamp with time zone | ✓ | — | — |
| 7 | `updated_at` | timestamp with time zone | ✓ | — | — |
| 8 | `email` | text | ✓ | — | Auth: Email is a generated column that references the optional email property in the identity_data |
| 9 | `id` | uuid | — | `gen_random_uuid()` | — |

### Chaves

- **PRIMARY KEY** `identities_pkey` — (`id`)
- **UNIQUE** `identities_provider_id_provider_unique` — (`provider_id`, `provider`)

### Foreign Keys (saída)

- `user_id` → `auth.users.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `identities_email_idx` — `CREATE INDEX identities_email_idx ON auth.identities USING btree (email text_pattern_ops)`
- `identities_provider_id_provider_unique` — `CREATE UNIQUE INDEX identities_provider_id_provider_unique ON auth.identities USING btree (provider_id, provider)`
- `identities_user_id_idx` — `CREATE INDEX identities_user_id_idx ON auth.identities USING btree (user_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## instances

> Auth: Manages users across multiple sites.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `uuid` | uuid | ✓ | — | — |
| 3 | `raw_base_config` | text | ✓ | — | — |
| 4 | `created_at` | timestamp with time zone | ✓ | — | — |
| 5 | `updated_at` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `instances_pkey` — (`id`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

**Uso no código:**
- `auth.instances` — 1 ocorrência(s)
  - `src/lib/editor-ia/engine.ts:140`

---

## mfa_amr_claims

> auth: stores authenticator method reference claims for multi factor authentication

**Aprox. linhas:** 68

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `session_id` | uuid | — | — | — |
| 2 | `created_at` | timestamp with time zone | — | — | — |
| 3 | `updated_at` | timestamp with time zone | — | — | — |
| 4 | `authentication_method` | text | — | — | — |
| 5 | `id` | uuid | — | — | — |

### Chaves

- **PRIMARY KEY** `amr_id_pk` — (`id`)
- **UNIQUE** `mfa_amr_claims_session_id_authentication_method_pkey` — (`session_id`, `authentication_method`)

### Foreign Keys (saída)

- `session_id` → `auth.sessions.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `amr_id_pk` — `CREATE UNIQUE INDEX amr_id_pk ON auth.mfa_amr_claims USING btree (id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## mfa_challenges

> auth: stores metadata about challenge requests made

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `factor_id` | uuid | — | — | — |
| 3 | `created_at` | timestamp with time zone | — | — | — |
| 4 | `verified_at` | timestamp with time zone | ✓ | — | — |
| 5 | `ip_address` | inet | — | — | — |
| 6 | `otp_code` | text | ✓ | — | — |
| 7 | `web_authn_session_data` | jsonb | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `mfa_challenges_pkey` — (`id`)

### Foreign Keys (saída)

- `factor_id` → `auth.mfa_factors.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `mfa_challenge_created_at_idx` — `CREATE INDEX mfa_challenge_created_at_idx ON auth.mfa_challenges USING btree (created_at DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## mfa_factors

> auth: stores metadata about factors

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `user_id` | uuid | — | — | — |
| 3 | `friendly_name` | text | ✓ | — | — |
| 4 | `factor_type` | factor_type | — | — | — |
| 5 | `status` | factor_status | — | — | — |
| 6 | `created_at` | timestamp with time zone | — | — | — |
| 7 | `updated_at` | timestamp with time zone | — | — | — |
| 8 | `secret` | text | ✓ | — | — |
| 9 | `phone` | text | ✓ | — | — |
| 10 | `last_challenged_at` | timestamp with time zone | ✓ | — | — |
| 11 | `web_authn_credential` | jsonb | ✓ | — | — |
| 12 | `web_authn_aaguid` | uuid | ✓ | — | — |
| 13 | `last_webauthn_challenge_data` | jsonb | ✓ | — | Stores the latest WebAuthn challenge data including attestation/assertion for customer verification |

### Chaves

- **UNIQUE** `mfa_factors_last_challenged_at_key` — (`last_challenged_at`)
- **PRIMARY KEY** `mfa_factors_pkey` — (`id`)

### Foreign Keys (saída)

- `user_id` → `auth.users.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `auth.mfa_challenges.factor_id` (constraint `mfa_challenges_auth_factor_id_fkey`)

### Índices

- `factor_id_created_at_idx` — `CREATE INDEX factor_id_created_at_idx ON auth.mfa_factors USING btree (user_id, created_at)`
- `mfa_factors_last_challenged_at_key` — `CREATE UNIQUE INDEX mfa_factors_last_challenged_at_key ON auth.mfa_factors USING btree (last_challenged_at)`
- `mfa_factors_user_friendly_name_unique` — `CREATE UNIQUE INDEX mfa_factors_user_friendly_name_unique ON auth.mfa_factors USING btree (friendly_name, user_id) WHERE (TRIM(BOTH FROM friendly_name) <> ''::text)`
- `mfa_factors_user_id_idx` — `CREATE INDEX mfa_factors_user_id_idx ON auth.mfa_factors USING btree (user_id)`
- `unique_phone_factor_per_user` — `CREATE UNIQUE INDEX unique_phone_factor_per_user ON auth.mfa_factors USING btree (user_id, phone)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## oauth_authorizations

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `authorization_id` | text | — | — | — |
| 3 | `client_id` | uuid | — | — | — |
| 4 | `user_id` | uuid | ✓ | — | — |
| 5 | `redirect_uri` | text | — | — | — |
| 6 | `scope` | text | — | — | — |
| 7 | `state` | text | ✓ | — | — |
| 8 | `resource` | text | ✓ | — | — |
| 9 | `code_challenge` | text | ✓ | — | — |
| 10 | `code_challenge_method` | code_challenge_method | ✓ | — | — |
| 11 | `response_type` | oauth_response_type | — | `'code'::auth.oauth_response_type` | — |
| 12 | `status` | oauth_authorization_status | — | `'pending'::auth.oauth_authorization_status` | — |
| 13 | `authorization_code` | text | ✓ | — | — |
| 14 | `created_at` | timestamp with time zone | — | `now()` | — |
| 15 | `expires_at` | timestamp with time zone | — | `(now() + '00:03:00'::interval)` | — |
| 16 | `approved_at` | timestamp with time zone | ✓ | — | — |
| 17 | `nonce` | text | ✓ | — | — |

### Chaves

- **UNIQUE** `oauth_authorizations_authorization_code_key` — (`authorization_code`)
- **UNIQUE** `oauth_authorizations_authorization_id_key` — (`authorization_id`)
- **PRIMARY KEY** `oauth_authorizations_pkey` — (`id`)

### Foreign Keys (saída)

- `client_id` → `auth.oauth_clients.id` (UPDATE NO ACTION, DELETE CASCADE)
- `user_id` → `auth.users.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `oauth_authorizations_authorization_code_length` — `CHECK ((char_length(authorization_code) <= 255))`
- `oauth_authorizations_code_challenge_length` — `CHECK ((char_length(code_challenge) <= 128))`
- `oauth_authorizations_expires_at_future` — `CHECK ((expires_at > created_at))`
- `oauth_authorizations_nonce_length` — `CHECK ((char_length(nonce) <= 255))`
- `oauth_authorizations_redirect_uri_length` — `CHECK ((char_length(redirect_uri) <= 2048))`
- `oauth_authorizations_resource_length` — `CHECK ((char_length(resource) <= 2048))`
- `oauth_authorizations_scope_length` — `CHECK ((char_length(scope) <= 4096))`
- `oauth_authorizations_state_length` — `CHECK ((char_length(state) <= 4096))`

### Índices

- `oauth_auth_pending_exp_idx` — `CREATE INDEX oauth_auth_pending_exp_idx ON auth.oauth_authorizations USING btree (expires_at) WHERE (status = 'pending'::auth.oauth_authorization_status)`
- `oauth_authorizations_authorization_code_key` — `CREATE UNIQUE INDEX oauth_authorizations_authorization_code_key ON auth.oauth_authorizations USING btree (authorization_code)`
- `oauth_authorizations_authorization_id_key` — `CREATE UNIQUE INDEX oauth_authorizations_authorization_id_key ON auth.oauth_authorizations USING btree (authorization_id)`

_Sem referência identificada no código._

---

## oauth_client_states

> Stores OAuth states for third-party provider authentication flows where Supabase acts as the OAuth client.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `provider_type` | text | — | — | — |
| 3 | `code_verifier` | text | ✓ | — | — |
| 4 | `created_at` | timestamp with time zone | — | — | — |

### Chaves

- **PRIMARY KEY** `oauth_client_states_pkey` — (`id`)

### Índices

- `idx_oauth_client_states_created_at` — `CREATE INDEX idx_oauth_client_states_created_at ON auth.oauth_client_states USING btree (created_at)`

_Sem referência identificada no código._

---

## oauth_clients

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 3 | `client_secret_hash` | text | ✓ | — | — |
| 4 | `registration_type` | oauth_registration_type | — | — | — |
| 5 | `redirect_uris` | text | — | — | — |
| 6 | `grant_types` | text | — | — | — |
| 7 | `client_name` | text | ✓ | — | — |
| 8 | `client_uri` | text | ✓ | — | — |
| 9 | `logo_uri` | text | ✓ | — | — |
| 10 | `created_at` | timestamp with time zone | — | `now()` | — |
| 11 | `updated_at` | timestamp with time zone | — | `now()` | — |
| 12 | `deleted_at` | timestamp with time zone | ✓ | — | — |
| 13 | `client_type` | oauth_client_type | — | `'confidential'::auth.oauth_client_type` | — |

### Chaves

- **PRIMARY KEY** `oauth_clients_pkey` — (`id`)

### Referenciada por (entrada)

- `auth.oauth_authorizations.client_id` (constraint `oauth_authorizations_client_id_fkey`)
- `auth.oauth_consents.client_id` (constraint `oauth_consents_client_id_fkey`)
- `auth.sessions.oauth_client_id` (constraint `sessions_oauth_client_id_fkey`)

### CHECK constraints

- `oauth_clients_client_name_length` — `CHECK ((char_length(client_name) <= 1024))`
- `oauth_clients_client_uri_length` — `CHECK ((char_length(client_uri) <= 2048))`
- `oauth_clients_logo_uri_length` — `CHECK ((char_length(logo_uri) <= 2048))`

### Índices

- `oauth_clients_deleted_at_idx` — `CREATE INDEX oauth_clients_deleted_at_idx ON auth.oauth_clients USING btree (deleted_at)`

_Sem referência identificada no código._

---

## oauth_consents

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `user_id` | uuid | — | — | — |
| 3 | `client_id` | uuid | — | — | — |
| 4 | `scopes` | text | — | — | — |
| 5 | `granted_at` | timestamp with time zone | — | `now()` | — |
| 6 | `revoked_at` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `oauth_consents_pkey` — (`id`)
- **UNIQUE** `oauth_consents_user_client_unique` — (`user_id`, `client_id`)

### Foreign Keys (saída)

- `client_id` → `auth.oauth_clients.id` (UPDATE NO ACTION, DELETE CASCADE)
- `user_id` → `auth.users.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `oauth_consents_revoked_after_granted` — `CHECK (((revoked_at IS NULL) OR (revoked_at >= granted_at)))`
- `oauth_consents_scopes_length` — `CHECK ((char_length(scopes) <= 2048))`
- `oauth_consents_scopes_not_empty` — `CHECK ((char_length(TRIM(BOTH FROM scopes)) > 0))`

### Índices

- `oauth_consents_active_client_idx` — `CREATE INDEX oauth_consents_active_client_idx ON auth.oauth_consents USING btree (client_id) WHERE (revoked_at IS NULL)`
- `oauth_consents_active_user_client_idx` — `CREATE INDEX oauth_consents_active_user_client_idx ON auth.oauth_consents USING btree (user_id, client_id) WHERE (revoked_at IS NULL)`
- `oauth_consents_user_client_unique` — `CREATE UNIQUE INDEX oauth_consents_user_client_unique ON auth.oauth_consents USING btree (user_id, client_id)`
- `oauth_consents_user_order_idx` — `CREATE INDEX oauth_consents_user_order_idx ON auth.oauth_consents USING btree (user_id, granted_at DESC)`

_Sem referência identificada no código._

---

## one_time_tokens

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `user_id` | uuid | — | — | — |
| 3 | `token_type` | one_time_token_type | — | — | — |
| 4 | `token_hash` | text | — | — | — |
| 5 | `relates_to` | text | — | — | — |
| 6 | `created_at` | timestamp without time zone | — | `now()` | — |
| 7 | `updated_at` | timestamp without time zone | — | `now()` | — |

### Chaves

- **PRIMARY KEY** `one_time_tokens_pkey` — (`id`)

### Foreign Keys (saída)

- `user_id` → `auth.users.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `one_time_tokens_token_hash_check` — `CHECK ((char_length(token_hash) > 0))`

### Índices

- `one_time_tokens_relates_to_hash_idx` — `CREATE INDEX one_time_tokens_relates_to_hash_idx ON auth.one_time_tokens USING hash (relates_to)`
- `one_time_tokens_token_hash_hash_idx` — `CREATE INDEX one_time_tokens_token_hash_hash_idx ON auth.one_time_tokens USING hash (token_hash)`
- `one_time_tokens_user_id_token_type_key` — `CREATE UNIQUE INDEX one_time_tokens_user_id_token_type_key ON auth.one_time_tokens USING btree (user_id, token_type)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## refresh_tokens

> Auth: Store of tokens used to refresh JWT tokens once they expire.

**Aprox. linhas:** 1217

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `instance_id` | uuid | ✓ | — | — |
| 2 | `id` | bigint | — | `nextval('auth.refresh_tokens_id_seq'::regclass)` | — |
| 3 | `token` | character varying(255) | ✓ | — | — |
| 4 | `user_id` | character varying(255) | ✓ | — | — |
| 5 | `revoked` | boolean | ✓ | — | — |
| 6 | `created_at` | timestamp with time zone | ✓ | — | — |
| 7 | `updated_at` | timestamp with time zone | ✓ | — | — |
| 8 | `parent` | character varying(255) | ✓ | — | — |
| 9 | `session_id` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `refresh_tokens_pkey` — (`id`)
- **UNIQUE** `refresh_tokens_token_unique` — (`token`)

### Foreign Keys (saída)

- `session_id` → `auth.sessions.id` (UPDATE NO ACTION, DELETE CASCADE)

### Índices

- `refresh_tokens_instance_id_idx` — `CREATE INDEX refresh_tokens_instance_id_idx ON auth.refresh_tokens USING btree (instance_id)`
- `refresh_tokens_instance_id_user_id_idx` — `CREATE INDEX refresh_tokens_instance_id_user_id_idx ON auth.refresh_tokens USING btree (instance_id, user_id)`
- `refresh_tokens_parent_idx` — `CREATE INDEX refresh_tokens_parent_idx ON auth.refresh_tokens USING btree (parent)`
- `refresh_tokens_session_id_revoked_idx` — `CREATE INDEX refresh_tokens_session_id_revoked_idx ON auth.refresh_tokens USING btree (session_id, revoked)`
- `refresh_tokens_token_unique` — `CREATE UNIQUE INDEX refresh_tokens_token_unique ON auth.refresh_tokens USING btree (token)`
- `refresh_tokens_updated_at_idx` — `CREATE INDEX refresh_tokens_updated_at_idx ON auth.refresh_tokens USING btree (updated_at DESC)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## saml_providers

> Auth: Manages SAML Identity Provider connections.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `sso_provider_id` | uuid | — | — | — |
| 3 | `entity_id` | text | — | — | — |
| 4 | `metadata_xml` | text | — | — | — |
| 5 | `metadata_url` | text | ✓ | — | — |
| 6 | `attribute_mapping` | jsonb | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | — | — |
| 8 | `updated_at` | timestamp with time zone | ✓ | — | — |
| 9 | `name_id_format` | text | ✓ | — | — |

### Chaves

- **UNIQUE** `saml_providers_entity_id_key` — (`entity_id`)
- **PRIMARY KEY** `saml_providers_pkey` — (`id`)

### Foreign Keys (saída)

- `sso_provider_id` → `auth.sso_providers.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `entity_id not empty` — `CHECK ((char_length(entity_id) > 0))`
- `metadata_url not empty` — `CHECK (((metadata_url = NULL::text) OR (char_length(metadata_url) > 0)))`
- `metadata_xml not empty` — `CHECK ((char_length(metadata_xml) > 0))`

### Índices

- `saml_providers_entity_id_key` — `CREATE UNIQUE INDEX saml_providers_entity_id_key ON auth.saml_providers USING btree (entity_id)`
- `saml_providers_sso_provider_id_idx` — `CREATE INDEX saml_providers_sso_provider_id_idx ON auth.saml_providers USING btree (sso_provider_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## saml_relay_states

> Auth: Contains SAML Relay State information for each Service Provider initiated login.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `sso_provider_id` | uuid | — | — | — |
| 3 | `request_id` | text | — | — | — |
| 4 | `for_email` | text | ✓ | — | — |
| 5 | `redirect_to` | text | ✓ | — | — |
| 7 | `created_at` | timestamp with time zone | ✓ | — | — |
| 8 | `updated_at` | timestamp with time zone | ✓ | — | — |
| 9 | `flow_state_id` | uuid | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `saml_relay_states_pkey` — (`id`)

### Foreign Keys (saída)

- `flow_state_id` → `auth.flow_state.id` (UPDATE NO ACTION, DELETE CASCADE)
- `sso_provider_id` → `auth.sso_providers.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `request_id not empty` — `CHECK ((char_length(request_id) > 0))`

### Índices

- `saml_relay_states_created_at_idx` — `CREATE INDEX saml_relay_states_created_at_idx ON auth.saml_relay_states USING btree (created_at DESC)`
- `saml_relay_states_for_email_idx` — `CREATE INDEX saml_relay_states_for_email_idx ON auth.saml_relay_states USING btree (for_email)`
- `saml_relay_states_sso_provider_id_idx` — `CREATE INDEX saml_relay_states_sso_provider_id_idx ON auth.saml_relay_states USING btree (sso_provider_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## schema_migrations

> Auth: Manages updates to the auth system.

**Aprox. linhas:** 61

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `version` | character varying(255) | — | — | — |

### Chaves

- **PRIMARY KEY** `schema_migrations_pkey` — (`version`)

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## sessions

> Auth: Stores session data associated to a user.

**Aprox. linhas:** 68

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `user_id` | uuid | — | — | — |
| 3 | `created_at` | timestamp with time zone | ✓ | — | — |
| 4 | `updated_at` | timestamp with time zone | ✓ | — | — |
| 5 | `factor_id` | uuid | ✓ | — | — |
| 6 | `aal` | aal_level | ✓ | — | — |
| 7 | `not_after` | timestamp with time zone | ✓ | — | Auth: Not after is a nullable column that contains a timestamp after which the session should be regarded as expired. |
| 8 | `refreshed_at` | timestamp without time zone | ✓ | — | — |
| 9 | `user_agent` | text | ✓ | — | — |
| 10 | `ip` | inet | ✓ | — | — |
| 11 | `tag` | text | ✓ | — | — |
| 12 | `oauth_client_id` | uuid | ✓ | — | — |
| 13 | `refresh_token_hmac_key` | text | ✓ | — | Holds a HMAC-SHA256 key used to sign refresh tokens for this session. |
| 14 | `refresh_token_counter` | bigint | ✓ | — | Holds the ID (counter) of the last issued refresh token. |
| 15 | `scopes` | text | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `sessions_pkey` — (`id`)

### Foreign Keys (saída)

- `oauth_client_id` → `auth.oauth_clients.id` (UPDATE NO ACTION, DELETE CASCADE)
- `user_id` → `auth.users.id` (UPDATE NO ACTION, DELETE CASCADE)

### Referenciada por (entrada)

- `auth.mfa_amr_claims.session_id` (constraint `mfa_amr_claims_session_id_fkey`)
- `auth.refresh_tokens.session_id` (constraint `refresh_tokens_session_id_fkey`)

### CHECK constraints

- `sessions_scopes_length` — `CHECK ((char_length(scopes) <= 4096))`

### Índices

- `sessions_not_after_idx` — `CREATE INDEX sessions_not_after_idx ON auth.sessions USING btree (not_after DESC)`
- `sessions_oauth_client_id_idx` — `CREATE INDEX sessions_oauth_client_id_idx ON auth.sessions USING btree (oauth_client_id)`
- `sessions_user_id_idx` — `CREATE INDEX sessions_user_id_idx ON auth.sessions USING btree (user_id)`
- `user_id_created_at_idx` — `CREATE INDEX user_id_created_at_idx ON auth.sessions USING btree (user_id, created_at)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## sso_domains

> Auth: Manages SSO email address domain mapping to an SSO Identity Provider.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `sso_provider_id` | uuid | — | — | — |
| 3 | `domain` | text | — | — | — |
| 4 | `created_at` | timestamp with time zone | ✓ | — | — |
| 5 | `updated_at` | timestamp with time zone | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `sso_domains_pkey` — (`id`)

### Foreign Keys (saída)

- `sso_provider_id` → `auth.sso_providers.id` (UPDATE NO ACTION, DELETE CASCADE)

### CHECK constraints

- `domain not empty` — `CHECK ((char_length(domain) > 0))`

### Índices

- `sso_domains_domain_idx` — `CREATE UNIQUE INDEX sso_domains_domain_idx ON auth.sso_domains USING btree (lower(domain))`
- `sso_domains_sso_provider_id_idx` — `CREATE INDEX sso_domains_sso_provider_id_idx ON auth.sso_domains USING btree (sso_provider_id)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## sso_providers

> Auth: Manages SSO identity provider information; see saml_providers for SAML.

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `id` | uuid | — | — | — |
| 2 | `resource_id` | text | ✓ | — | Auth: Uniquely identifies a SSO provider according to a user-chosen resource ID (case insensitive), useful in infrastructure as code. |
| 3 | `created_at` | timestamp with time zone | ✓ | — | — |
| 4 | `updated_at` | timestamp with time zone | ✓ | — | — |
| 5 | `disabled` | boolean | ✓ | — | — |

### Chaves

- **PRIMARY KEY** `sso_providers_pkey` — (`id`)

### Referenciada por (entrada)

- `auth.saml_providers.sso_provider_id` (constraint `saml_providers_sso_provider_id_fkey`)
- `auth.saml_relay_states.sso_provider_id` (constraint `saml_relay_states_sso_provider_id_fkey`)
- `auth.sso_domains.sso_provider_id` (constraint `sso_domains_sso_provider_id_fkey`)

### CHECK constraints

- `resource_id not empty` — `CHECK (((resource_id = NULL::text) OR (char_length(resource_id) > 0)))`

### Índices

- `sso_providers_resource_id_idx` — `CREATE UNIQUE INDEX sso_providers_resource_id_idx ON auth.sso_providers USING btree (lower(resource_id))`
- `sso_providers_resource_id_pattern_idx` — `CREATE INDEX sso_providers_resource_id_pattern_idx ON auth.sso_providers USING btree (resource_id text_pattern_ops)`

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

_Sem referência identificada no código._

---

## users

> Auth: Stores user login data within a secure schema.

**Aprox. linhas:** 26

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `instance_id` | uuid | ✓ | — | — |
| 2 | `id` | uuid | — | `gen_random_uuid()` | — |
| 3 | `aud` | character varying(255) | ✓ | — | — |
| 4 | `role` | character varying(255) | ✓ | — | — |
| 5 | `email` | character varying(255) | ✓ | — | — |
| 6 | `encrypted_password` | character varying(255) | ✓ | — | — |
| 7 | `email_confirmed_at` | timestamp with time zone | ✓ | — | — |
| 8 | `invited_at` | timestamp with time zone | ✓ | — | — |
| 9 | `confirmation_token` | character varying(255) | ✓ | — | — |
| 10 | `confirmation_sent_at` | timestamp with time zone | ✓ | — | — |
| 11 | `recovery_token` | character varying(255) | ✓ | — | — |
| 12 | `recovery_sent_at` | timestamp with time zone | ✓ | — | — |
| 13 | `email_change_token_new` | character varying(255) | ✓ | — | — |
| 14 | `email_change` | character varying(255) | ✓ | — | — |
| 15 | `email_change_sent_at` | timestamp with time zone | ✓ | — | — |
| 16 | `last_sign_in_at` | timestamp with time zone | ✓ | — | — |
| 17 | `raw_app_meta_data` | jsonb | ✓ | — | — |
| 18 | `raw_user_meta_data` | jsonb | ✓ | — | — |
| 19 | `is_super_admin` | boolean | ✓ | — | — |
| 20 | `created_at` | timestamp with time zone | ✓ | `timezone('utc'::text, now())` | — |
| 21 | `updated_at` | timestamp with time zone | ✓ | `timezone('utc'::text, now())` | — |
| 22 | `phone` | text | ✓ | `NULL::character varying` | — |
| 23 | `phone_confirmed_at` | timestamp with time zone | ✓ | — | — |
| 24 | `phone_change` | text | ✓ | `''::character varying` | — |
| 25 | `phone_change_token` | character varying(255) | ✓ | `''::character varying` | — |
| 26 | `phone_change_sent_at` | timestamp with time zone | ✓ | — | — |
| 27 | `confirmed_at` | timestamp with time zone | ✓ | — | — |
| 28 | `email_change_token_current` | character varying(255) | ✓ | `''::character varying` | — |
| 29 | `email_change_confirm_status` | smallint | ✓ | `0` | — |
| 30 | `banned_until` | timestamp with time zone | ✓ | — | — |
| 31 | `reauthentication_token` | character varying(255) | ✓ | `''::character varying` | — |
| 32 | `reauthentication_sent_at` | timestamp with time zone | ✓ | — | — |
| 33 | `is_sso_user` | boolean | — | `false` | Auth: Set this column to true when the account comes from SSO. These accounts can have duplicate emails. |
| 34 | `deleted_at` | timestamp with time zone | ✓ | — | — |
| 35 | `is_anonymous` | boolean | — | `false` | — |

### Chaves

- **UNIQUE** `users_phone_key` — (`phone`)
- **PRIMARY KEY** `users_pkey` — (`id`)

### Referenciada por (entrada)

- `auth.identities.user_id` (constraint `identities_user_id_fkey`)
- `auth.mfa_factors.user_id` (constraint `mfa_factors_user_id_fkey`)
- `auth.oauth_authorizations.user_id` (constraint `oauth_authorizations_user_id_fkey`)
- `auth.oauth_consents.user_id` (constraint `oauth_consents_user_id_fkey`)
- `auth.one_time_tokens.user_id` (constraint `one_time_tokens_user_id_fkey`)
- `auth.sessions.user_id` (constraint `sessions_user_id_fkey`)

### CHECK constraints

- `users_email_change_confirm_status_check` — `CHECK (((email_change_confirm_status >= 0) AND (email_change_confirm_status <= 2)))`

### Índices

- `confirmation_token_idx` — `CREATE UNIQUE INDEX confirmation_token_idx ON auth.users USING btree (confirmation_token) WHERE ((confirmation_token)::text !~ '^[0-9 ]*$'::text)`
- `email_change_token_current_idx` — `CREATE UNIQUE INDEX email_change_token_current_idx ON auth.users USING btree (email_change_token_current) WHERE ((email_change_token_current)::text !~ '^[0-9 ]*$'::text)`
- `email_change_token_new_idx` — `CREATE UNIQUE INDEX email_change_token_new_idx ON auth.users USING btree (email_change_token_new) WHERE ((email_change_token_new)::text !~ '^[0-9 ]*$'::text)`
- `reauthentication_token_idx` — `CREATE UNIQUE INDEX reauthentication_token_idx ON auth.users USING btree (reauthentication_token) WHERE ((reauthentication_token)::text !~ '^[0-9 ]*$'::text)`
- `recovery_token_idx` — `CREATE UNIQUE INDEX recovery_token_idx ON auth.users USING btree (recovery_token) WHERE ((recovery_token)::text !~ '^[0-9 ]*$'::text)`
- `users_email_partial_key` — `CREATE UNIQUE INDEX users_email_partial_key ON auth.users USING btree (email) WHERE (is_sso_user = false)`
- `users_instance_id_email_idx` — `CREATE INDEX users_instance_id_email_idx ON auth.users USING btree (instance_id, lower((email)::text))`
- `users_instance_id_idx` — `CREATE INDEX users_instance_id_idx ON auth.users USING btree (instance_id)`
- `users_is_anonymous_idx` — `CREATE INDEX users_is_anonymous_idx ON auth.users USING btree (is_anonymous)`
- `users_phone_key` — `CREATE UNIQUE INDEX users_phone_key ON auth.users USING btree (phone)`

### Triggers

- `on_auth_user_created` — AFTER INSERT → `public.handle_new_user` 
- `trg_on_auth_user_created` — AFTER INSERT → `alissonerp.fn_handle_new_user` 

### RLS

- **Enabled:** ✓ | **Forced:** ✗ | Políticas: 0

**Uso no código:**
- `auth.users` — 3 ocorrência(s)
  - `src/lib/mercado-pago.ts:399`
  - `scripts/_build_code_references.mjs:159`
  - `scripts/_build_code_references.mjs:161`

---

