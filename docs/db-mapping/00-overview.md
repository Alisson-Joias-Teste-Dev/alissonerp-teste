# Mapeamento Completo do Banco de Dados

> Gerado em: **2026-04-29** | Fonte: queries diretas no PostgreSQL (`pg_catalog` + `information_schema`)
> Conexão: `72.60.55.140:5543/postgres` (Supabase self-hosted)

## Como navegar

- `00-overview.md` — este arquivo (visão geral, contagens, regras)
- `<schema>/tables.md` — tabelas, colunas, PK/FK/UNIQUE/CHECK, índices, triggers, RLS
- `<schema>/functions.md` — funções/procedures com argumentos, retorno e CORPO COMPLETO
- `<schema>/triggers.md` — triggers com função alvo, evento e timing
- `<schema>/views.md` — views (e matviews) com SQL completo
- `<schema>/rls.md` — Row Level Security (políticas + habilitação por tabela)
- `<schema>/sequences.md` — sequences
- `99-code-mapping.md` — cross-reference banco → código
- `99-summary.md` — resumo executivo final

## Schemas detectados

| Schema | Descrição | Acesso (do projeto) |
|--------|-----------|---------------------|
| `alissonerp` | — | Leitura + Escrita — schema principal do ERP |
| `auth` | — | Gerenciado pelo Supabase GoTrue — só `supabase.auth.*` |
| `crm` | Schema isolado para o CRM (mensageria Instagram/WhatsApp, IA, automações). Compartilha dados-mestres via FK em public.contatos / public.vendedores / public.leads / auth.users / alissonerp.usuarios. | schema CRM (não documentado no CLAUDE.md — investigar uso) |
| `directus` | — | READONLY — schema legado Directus (pcp/ordens/protocolo) |
| `extensions` | — | Extensões Postgres (pgcrypto, pg_stat_statements, etc.) |
| `public` | standard public schema | READONLY — Supabase legacy / contatos / vendedores / produtos |
| `storage` | — | Gerenciado pelo Supabase Storage — só `supabase.storage.*` |

_Outros schemas detectados (não documentados aqui): `_realtime`, `api`, `cron`, `graphql`, `graphql_public`, `net`, `realtime`, `supabase_functions`, `vault`, `views`_

## Estatísticas globais (apenas schemas mapeados)

| Schema | Tabelas | Colunas | Views | Funções | Triggers | RLS Policies | Indexes | Sequences | Enums | CHECKs | FKs |
|--------|--------:|--------:|------:|--------:|---------:|-------------:|--------:|----------:|------:|-------:|----:|
| **alissonerp** | 139 | 2619 | 71 | 67 | 55 | 38 | 382 | 122 | 17 | 70 | 177 |
| **public** | 65 | 1255 | 45 | 69 | 33 | 114 | 131 | 11 | 1 | 8 | 2 |
| **directus** | 110 | 1004 | 2 | 14 | 20 | 17 | 128 | 92 | 0 | 0 | 0 |
| **crm** | 31 | 372 | 0 | 13 | 31 | 41 | 76 | 2 | 0 | 22 | 31 |
| **auth** | 20 | 189 | 0 | 4 | 2 | 0 | 75 | 1 | 9 | 23 | 16 |
| **storage** | 11 | 90 | 0 | 29 | 7 | 24 | 26 | 0 | 1 | 0 | 9 |
| **extensions** | 1 | 65 | 4 | 125 | 0 | 0 | 1 | 0 | 0 | 0 | 0 |
| **TOTAL** | **377** | **5594** | **122** | **321** | **148** | **234** | **819** | **228** | **28** | **123** | **235** |

## Extensões instaladas

| Extensão | Versão | Schema |
|---|---|---|
| `http` | 1.6 | `extensions` |
| `hypopg` | 1.4.1 | `extensions` |
| `index_advisor` | 0.2.0 | `extensions` |
| `pg_cron` | 1.6 | `pg_catalog` |
| `pg_graphql` | 1.5.11 | `graphql` |
| `pg_net` | 0.14.0 | `extensions` |
| `pg_stat_statements` | 1.10 | `extensions` |
| `pgcrypto` | 1.3 | `extensions` |
| `plpgsql` | 1.0 | `pg_catalog` |
| `supabase_vault` | 0.3.1 | `vault` |
| `unaccent` | 1.1 | `public` |
| `uuid-ossp` | 1.1 | `extensions` |
| `wrappers` | 0.4.5 | `extensions` |

## Convenções e regras inegociáveis

- **NUNCA** usar `supabase.from(...)` para tabelas no schema `alissonerp` — usar SQL direto via `src/lib/db.ts` (PostgREST tem bug que retorna `[]` silenciosamente).
- `supabase.from(...)` PODE ser usado para `public.*` (mas é READONLY).
- `supabase.auth.*` e `supabase.storage.*` funcionam normalmente.
- **Schemas READONLY:** `public` e `directus` — sem INSERT/UPDATE/DELETE.
- **PKs reais com nomes não-óbvios:** `public.contatos.id_contato`, `public.produtos.id_produto`.
- **Typo legado:** `directus.ordens.peso_metal_negocido` (sem "a").
- **Dupla-entrada de movimentação:** SEMPRE usar `fn_criar_par_movimentacao` — retorna `(saida_id, entrada_id)`.
- **Zonas no-touch (NUNCA alterar):** `fn_processar_apontamento_pcp` (mig 018), `fn_processar_transferencia_saida` (019), `fn_processar_fechamento_dist` (020), `fn_concluir_protocolo`, `fn_processar_auditoria`, `fn_criar_servico_from_pcp` (092), `fn_calcular_peso_pedra_gramas` (092).
