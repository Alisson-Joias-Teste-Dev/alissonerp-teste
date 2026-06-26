# Mapeamento Completo do Banco de Dados

> Gerado em 2026-04-29 a partir de queries diretas em `pg_catalog` + `information_schema`.
> Apenas análise — nenhum objeto do banco foi criado, alterado ou deletado.

## Estrutura

```
docs/db-mapping/
├── README.md              ← este arquivo
├── 00-overview.md         ← contagens globais, schemas, regras inegociáveis
├── 99-code-mapping.md     ← cross-reference banco ↔ código (1013 arquivos varridos)
├── 99-summary.md          ← resumo executivo, pontos críticos, gaps
├── _raw/                  ← JSON crus extraídos do banco (fonte de verdade)
│   ├── 00_summary.json
│   ├── 01_schemas.json
│   ├── 02_tables.json
│   ├── 03_columns.json    ← 5594 linhas
│   ├── 04_pk_unique.json
│   ├── 05_fks.json
│   ├── 06_check_constraints.json
│   ├── 07_indexes.json
│   ├── 08_functions.json  ← 321 funções com source_full
│   ├── 09_triggers.json
│   ├── 10_views.json
│   ├── 11_rls_policies.json
│   ├── 12_rls_enabled.json
│   ├── 13_sequences.json
│   ├── 14_enums.json
│   ├── 15_extensions.json
│   └── code_references.json
├── alissonerp/            ← schema RW principal
│   ├── tables.md          ← 139 tabelas com colunas/PK/FK/CHECK/index/trigger/RLS
│   ├── functions.md       ← 67 funções com CORPO-FONTE COMPLETO
│   ├── triggers.md
│   ├── views.md           ← 71 views com SQL completo
│   ├── rls.md
│   ├── sequences.md
│   └── enums.md
├── public/                ← schema READONLY (Supabase legacy)
│   ├── tables.md          (65 tabelas)
│   └── ...
├── directus/              ← schema legado READONLY
│   └── ...                (110 tabelas — só ~15 ainda são lidas)
├── crm/                   ← módulo CRM com IA — NÃO documentado no CLAUDE.md
│   └── ...                (31 tabelas, 0 referência no código atual)
├── auth/                  ← Supabase GoTrue (use só supabase.auth.*)
├── storage/               ← Supabase Storage (use só supabase.storage.*)
└── extensions/            ← funções de extensions (pgcrypto, http, etc)
```

## Comece por aqui

1. **Visão geral rápida** → `00-overview.md`
2. **Pontos críticos / gaps / TODOs** → `99-summary.md`
3. **Quem usa o quê no código** → `99-code-mapping.md`
4. **Detalhe de uma tabela específica** → `<schema>/tables.md`
5. **Código-fonte de uma função** → `<schema>/functions.md`

## Regenerar do zero

```bash
node scripts/_db_mapping_extract.mjs    # extrai catálogo do banco para _raw/
node scripts/_db_mapping_code_xref.mjs  # varre src/, scripts/, supabase/migrations/
node scripts/_db_mapping_build_docs.mjs # gera os .md a partir dos JSONs crus
```

Cada etapa é idempotente e leva ~10s.

## Resumo das contagens

| Schema | Tabelas | Colunas | Views | Funções | Triggers | RLS | Indexes |
|--------|--------:|--------:|------:|--------:|---------:|----:|--------:|
| alissonerp | 139 | 2619 | 71 | 67 | 55 | 38 | 382 |
| public | 65 | 1255 | 45 | 69 | 33 | 114 | 131 |
| directus | 110 | 1004 | 2 | 14 | 20 | 17 | 128 |
| crm | 31 | 372 | 0 | 13 | 31 | 41 | 76 |
| auth | 20 | 189 | 0 | 4 | 2 | 0 | 75 |
| storage | 11 | 90 | 0 | 29 | 7 | 24 | 26 |
| extensions | 1 | 65 | 4 | 125 | 0 | 0 | 1 |
| **TOTAL** | **377** | **5594** | **122** | **321** | **148** | **234** | **819** |

## Diferença em relação a `docs/schema/`

- `docs/schema/*.md` (gerado por `scripts/generate-schema-doc.mjs`) já existia e cobre **só tabelas/colunas/FK/índices/nomes de trigger** — bom para visão rápida.
- `docs/db-mapping/` (este) acrescenta **funções com corpo, triggers com definição, views com SQL completo, RLS policies, schema `crm` (não coberto antes), schemas `auth`/`storage`/`extensions`, cross-reference com código, lista de objetos sem uso, e migrations indexadas**.

Os dois conjuntos de docs são complementares — escolha conforme a necessidade.
