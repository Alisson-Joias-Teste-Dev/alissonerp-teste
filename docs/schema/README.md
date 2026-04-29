# docs/schema — Índice de Documentação de Schema

> Gerado automaticamente por `scripts/generate-schema-doc.mjs`
> Data: 2026-04-29

## Arquivos

| Arquivo | Descrição | Tabelas | Views |
|---------|-----------|---------|-------|
| [alissonerp-vendas.md](./alissonerp-vendas.md) | Vendas, crediário, vale-troca, pagamentos, contas a receber | 8 | 0 |
| [alissonerp-pcp.md](./alissonerp-pcp.md) | PCP, distribuição, apontamentos, protocolo | 17 | 0 |
| [alissonerp-estoque.md](./alissonerp-estoque.md) | Movimentações, insumos, depósitos, estoque, purificação | 12 | 0 |
| [alissonerp-admin.md](./alissonerp-admin.md) | Usuários, auditoria, notificações, configurações, filas, webhooks | 16 | 0 |
| [alissonerp-ordens.md](./alissonerp-ordens.md) | Ordens, fichas técnicas, itens, orçamentos | 14 | 0 |
| [alissonerp-outros.md](./alissonerp-outros.md) | Demais tabelas alissonerp não classificadas | 75 | 0 |
| [public.md](./public.md) | Schema public (contatos, vendedores, produtos, vendas) — READONLY | 65 | 45 |
| [directus.md](./directus.md) | Schema directus legado — READONLY (110 tabelas, mostrando 20) | 20 | 2 |

**Total documentado:** 227 tabelas

## Schemas

| Schema | Acesso | Observação |
|--------|--------|------------|
| `alissonerp` | Leitura + Escrita | ~60 tabelas, ~35 views, ~30 triggers — ERP fábrica |
| `public` | READONLY | contatos (=clientes), vendedores, produtos, vendas, user_profiles |
| `directus` | READONLY | ordens, pcp, apontamento, controle_estoque, protocolo (legado) |

## Como regenerar

```bash
node scripts/generate-schema-doc.mjs
```

## Notas

- `NUNCA` usar `supabase.from()` para schema `alissonerp` — usa SQL direto via `src/lib/db.ts`
- Schemas `public` e `directus` são READONLY — sem INSERT/UPDATE/DELETE
- PKs reais: `contatos.id_contato`, `public.produtos.id_produto`
- Typo legado: `directus.ordens.peso_metal_negocido` (sem "a")
