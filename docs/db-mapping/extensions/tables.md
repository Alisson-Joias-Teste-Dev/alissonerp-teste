# `extensions` — Tabelas

> 1 tabelas | gerado 2026-04-29

## Índice

- [`wrappers_fdw_stats`](#wrappers_fdw_stats) — Wrappers Foreign Data Wrapper statistics

---

## wrappers_fdw_stats

> Wrappers Foreign Data Wrapper statistics

**Aprox. linhas:** -1

### Colunas

| # | Coluna | Tipo | Null | Default | Comentário |
|--:|--------|------|------|---------|-----------|
| 1 | `fdw_name` | text | — | — | — |
| 2 | `create_times` | bigint | ✓ | — | Total number of times the FDW instacne has been created |
| 3 | `rows_in` | bigint | ✓ | — | Total rows input from origin |
| 4 | `rows_out` | bigint | ✓ | — | Total rows output to Postgres |
| 5 | `bytes_in` | bigint | ✓ | — | Total bytes input from origin |
| 6 | `bytes_out` | bigint | ✓ | — | Total bytes output to Postgres |
| 7 | `metadata` | jsonb | ✓ | — | Metadata specific for the FDW |
| 8 | `created_at` | timestamp with time zone | — | `timezone('utc'::text, now())` | — |
| 9 | `updated_at` | timestamp with time zone | — | `timezone('utc'::text, now())` | — |

### Chaves

- **PRIMARY KEY** `wrappers_fdw_stats_pkey` — (`fdw_name`)

_Sem referência identificada no código._

---

