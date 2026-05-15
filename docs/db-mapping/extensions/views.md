# `extensions` — Views e Materialized Views

> 4 entradas | gerado 2026-04-29

## Índice

- [`hypopg_hidden_indexes`](#hypopg_hidden_indexes)
- [`hypopg_list_indexes`](#hypopg_list_indexes)
- [`pg_stat_statements`](#pg_stat_statements)
- [`pg_stat_statements_info`](#pg_stat_statements_info)

---

## hypopg_hidden_indexes

Owner: `supabase_admin`

```sql
 SELECT h.indexid AS indexrelid,
    i.relname AS index_name,
    n.nspname AS schema_name,
    t.relname AS table_name,
    m.amname AS am_name,
    false AS is_hypo
   FROM (((((hypopg_hidden_indexes() h(indexid)
     JOIN pg_index x ON ((x.indexrelid = h.indexid)))
     JOIN pg_class i ON ((i.oid = h.indexid)))
     JOIN pg_namespace n ON ((n.oid = i.relnamespace)))
     JOIN pg_class t ON ((t.oid = x.indrelid)))
     JOIN pg_am m ON ((m.oid = i.relam)))
UNION ALL
 SELECT hl.indexrelid,
    hl.index_name,
    hl.schema_name,
    hl.table_name,
    hl.am_name,
    true AS is_hypo
   FROM (hypopg_hidden_indexes() hi(indexid)
     JOIN hypopg_list_indexes hl ON ((hl.indexrelid = hi.indexid)))
  ORDER BY 2;
```

_Sem referência identificada no código._

---

## hypopg_list_indexes

Owner: `supabase_admin`

```sql
 SELECT h.indexrelid,
    h.indexname AS index_name,
    n.nspname AS schema_name,
    COALESCE(c.relname, '<dropped>'::name) AS table_name,
    am.amname AS am_name
   FROM (((hypopg() h(indexname, indexrelid, indrelid, innatts, indisunique, indkey, indcollation, indclass, indoption, indexprs, indpred, amid)
     LEFT JOIN pg_class c ON ((c.oid = h.indrelid)))
     LEFT JOIN pg_namespace n ON ((n.oid = c.relnamespace)))
     LEFT JOIN pg_am am ON ((am.oid = h.amid)));
```

_Sem referência identificada no código._

---

## pg_stat_statements

Owner: `supabase_admin`

```sql
 SELECT pg_stat_statements.userid,
    pg_stat_statements.dbid,
    pg_stat_statements.toplevel,
    pg_stat_statements.queryid,
    pg_stat_statements.query,
    pg_stat_statements.plans,
    pg_stat_statements.total_plan_time,
    pg_stat_statements.min_plan_time,
    pg_stat_statements.max_plan_time,
    pg_stat_statements.mean_plan_time,
    pg_stat_statements.stddev_plan_time,
    pg_stat_statements.calls,
    pg_stat_statements.total_exec_time,
    pg_stat_statements.min_exec_time,
    pg_stat_statements.max_exec_time,
    pg_stat_statements.mean_exec_time,
    pg_stat_statements.stddev_exec_time,
    pg_stat_statements.rows,
    pg_stat_statements.shared_blks_hit,
    pg_stat_statements.shared_blks_read,
    pg_stat_statements.shared_blks_dirtied,
    pg_stat_statements.shared_blks_written,
    pg_stat_statements.local_blks_hit,
    pg_stat_statements.local_blks_read,
    pg_stat_statements.local_blks_dirtied,
    pg_stat_statements.local_blks_written,
    pg_stat_statements.temp_blks_read,
    pg_stat_statements.temp_blks_written,
    pg_stat_statements.blk_read_time,
    pg_stat_statements.blk_write_time,
    pg_stat_statements.temp_blk_read_time,
    pg_stat_statements.temp_blk_write_time,
    pg_stat_statements.wal_records,
    pg_stat_statements.wal_fpi,
    pg_stat_statements.wal_bytes,
    pg_stat_statements.jit_functions,
    pg_stat_statements.jit_generation_time,
    pg_stat_statements.jit_inlining_count,
    pg_stat_statements.jit_inlining_time,
    pg_stat_statements.jit_optimization_count,
    pg_stat_statements.jit_optimization_time,
    pg_stat_statements.jit_emission_count,
    pg_stat_statements.jit_emission_time
   FROM pg_stat_statements(true) pg_stat_statements(userid, dbid, toplevel, queryid, query, plans, total_plan_time, min_plan_time, max_plan_time, mean_plan_time, stddev_plan_time, calls, total_exec_time, min_exec_time, max_exec_time, mean_exec_time, stddev_exec_time, rows, shared_blks_hit, shared_blks_read, shared_blks_dirtied, shared_blks_written, local_blks_hit, local_blks_read, local_blks_dirtied, local_blks_written, temp_blks_read, temp_blks_written, blk_read_time, blk_write_time, temp_blk_read_time, temp_blk_write_time, wal_records, wal_fpi, wal_bytes, jit_functions, jit_generation_time, jit_inlining_count, jit_inlining_time, jit_optimization_count, jit_optimization_time, jit_emission_count, jit_emission_time);
```

**Uso no código:**
- `extensions.pg_stat_statements` — 2 ocorrência(s)
  - `scripts/_db_mapping_build_docs.mjs:146`
  - `scripts/_db_mapping_build_docs.mjs:431`

---

## pg_stat_statements_info

Owner: `supabase_admin`

```sql
 SELECT pg_stat_statements_info.dealloc,
    pg_stat_statements_info.stats_reset
   FROM pg_stat_statements_info() pg_stat_statements_info(dealloc, stats_reset);
```

_Sem referência identificada no código._

---

