# `directus` — Row Level Security (RLS)

> 17 políticas em 17 de 110 tabelas

## Tabelas com RLS habilitada

| Tabela | RLS | Forced | # Policies |
|---|---|---|---|
| `aprovar_consultora` | ✓ | — | 1 |
| `auditar_financeiro` | ✓ | — | 1 |
| `controle_estoque` | ✓ | — | 1 |
| `fechamento_fabrica` | ✓ | — | 1 |
| `ficha_tecnica_ordem` | ✓ | — | 1 |
| `itens_ordem` | ✓ | — | 0 |
| `ordem_comentarios` | ✓ | — | 1 |
| `ordens` | ✓ | — | 2 |
| `pcp` | ✓ | — | 1 |
| `preparando_entrega` | ✓ | — | 1 |
| `protocolo` | ✓ | — | 1 |
| `protocolo_loja` | ✓ | — | 1 |
| `protocolo_loja_files` | ✓ | — | 1 |
| `protocolo_loja_ordens` | ✓ | — | 1 |
| `protocolo_loja_ordens_1` | ✓ | — | 1 |
| `protocolo_ordens_4` | ✓ | — | 1 |
| `saida_ordem` | ✓ | — | 0 |

## Políticas

### `aprovar_consultora`

- **frontend** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `auditar_financeiro`

- **frontend** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `controle_estoque`

- **Alisson ERP** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
  - WITH CHECK: `true`

### `fechamento_fabrica`

- **alisson_erp** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `ficha_tecnica_ordem`

- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `itens_ordem_1`

- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `ordem_comentarios`

- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `ordens`

- **AlissonERP** — ALL (PERMISSIVE) roles=`public`
  - USING: `true`
- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `pcp`

- **frontend** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `preparando_entrega`

- **frontend** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `protocolo`

- **frontend** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `protocolo_loja`

- **frontend** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `protocolo_loja_files`

- **Frontend** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `protocolo_loja_ordens`

- **frontend** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `protocolo_loja_ordens_1`

- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

### `protocolo_ordens_4`

- **front-end** — ALL (PERMISSIVE) roles=`anon`
  - USING: `true`
  - WITH CHECK: `true`

