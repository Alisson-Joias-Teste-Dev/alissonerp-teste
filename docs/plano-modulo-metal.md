# Plano de Implementação — Módulo Metal

## Tasks

| ID | Fase | Descrição | Agente | Depende |
|----|------|-----------|--------|---------|
| 001 | Fase0 | Migration SQL (tabelas, seqs, triggers, seeds, RLS, grants) | @dba-alisson | — |
| 002 | Fase1 | Lib types + Zod schemas | @dev | 001 |
| 003 | Fase1 | Lib configurações do módulo | @dev | 002 |
| 004 | Fase1 | Lib compras de metal | @dev | 003 |
| 005 | Fase1 | Lib recebimentos de metal | @dev | 003 |
| 006 | Fase2 | GET/PUT /api/metal/configuracoes | @dev | 003 |
| 007 | Fase2 | GET /api/metal/cotacao | @dev | 003 |
| 008 | Fase2 | POST/GET /api/metal/compras | @dev | 004 |
| 009 | Fase2 | GET /api/metal/compras/[id] | @dev | 004 |
| 010 | Fase2 | POST /api/metal/compras/[id]/pagar | @dev | 004 |
| 011 | Fase2 | POST /api/metal/compras/[id]/verificar | @dev | 004 |
| 012 | Fase2 | POST /api/metal/compras/[id]/cancelar | @dev | 004 |
| 013 | Fase2 | POST/GET /api/metal/recebimentos | @dev | 005 |
| 014 | Fase2 | GET /api/metal/recebimentos/[id] | @dev | 005 |
| 015 | Fase2 | POST /api/metal/recebimentos/[id]/cancelar | @dev | 005 |
| 016 | Fase3 | Atualizar menu lateral (permissions.ts) | @dev | — |
| 017 | Fase3 | Componente ClienteSelector | @dev | — |
| 018 | Fase3 | Componente FotoBalancaInput | @dev | — |
| 019 | Fase3 | Componentes de tabela e status | @dev | 002 |
| 020 | Fase3 | Formulário de Compra | @dev | 017, 018, 008 |
| 021 | Fase3 | Formulário de Recebimento | @dev | 017, 018, 013 |
| 022 | Fase3 | Páginas do módulo (/metal/*) | @dev | 019, 020, 021 |
| 023 | Fase4 | Validação QA completa | @qa | TODAS |

## Diagrama de Dependências

```
001 (dba)
  │
  ├── 002 (dev: types)
  │     └── 003 (dev: config)
  │           ├── 004 (dev: compras)
  │           │     ├── 008 (api compras POST/GET)
  │           │     ├── 009 (api compras [id])
  │           │     ├── 010 (api compras pagar)
  │           │     ├── 011 (api compras verificar)
  │           │     └── 012 (api compras cancelar)
  │           └── 005 (dev: recebimentos)
  │                 ├── 013 (api recebimentos POST/GET)
  │                 ├── 014 (api recebimentos [id])
  │                 └── 015 (api recebimentos cancelar)
  │
  ├── 006 (api configuracoes GET)
  ├── 007 (api configuracoes PUT)
  │
  ├── 016 (menu lateral — paralelo)
  ├── 017 (ClienteSelector — paralelo)
  ├── 018 (FotoBalancaInput — paralelo)
  │
  └── 019 (tabelas/status)
        └── 020 (CompraForm)
        └── 021 (RecebimentoForm)
              └── 022 (Páginas)
                    └── 023 (QA)
```
