# Resumo Executivo — Mapeamento Completo do Banco

> Data: 2026-04-29

## Contagens por schema

```
alissonerp   | tabelas=139 | colunas=2619 | views= 71 | funcs= 67 | triggers= 55 | rls= 38 | indexes=382
public       | tabelas= 65 | colunas=1255 | views= 45 | funcs= 69 | triggers= 33 | rls=114 | indexes=131
directus     | tabelas=110 | colunas=1004 | views=  2 | funcs= 14 | triggers= 20 | rls= 17 | indexes=128
crm          | tabelas= 31 | colunas= 372 | views=  0 | funcs= 13 | triggers= 31 | rls= 41 | indexes= 76
auth         | tabelas= 20 | colunas= 189 | views=  0 | funcs=  4 | triggers=  2 | rls=  0 | indexes= 75
storage      | tabelas= 11 | colunas=  90 | views=  0 | funcs= 29 | triggers=  7 | rls= 24 | indexes= 26
extensions   | tabelas=  1 | colunas=  65 | views=  4 | funcs=125 | triggers=  0 | rls=  0 | indexes=  1
```

**Totais:** 377 tabelas / 5594 colunas / 122 views / 321 funções / 148 triggers / 234 RLS policies / 819 indexes / 228 sequences / 28 enums.

## Pontos críticos identificados

### 1. CLAUDE.md está desatualizado

| Afirmação CLAUDE.md | Realidade |
|---|---|
| "alissonerp ~60 tabelas" | **139 tabelas** |
| "~35 views" | **71 views** |
| "~30 triggers" | **55 triggers** (alissonerp) |
| "fn_processar_transferencia_saida" (no-touch) | nome real é `fn_processar_transferencia` (sem "_saida") |

Recomenda-se atualizar o CLAUDE.md para refletir a realidade.

### 2. Schema `crm` não documentado

O schema `crm` tem **31 tabelas, 13 funções, 31 triggers e 41 RLS policies** mas:
- Não é mencionado no CLAUDE.md
- **Não tem nenhuma referência no código atual** do projeto fabricaAJ
- Conteúdo aparente: CRM com IA (`agente_runs`, `agentes_ia`, `prompt_templates`, `sdr_runs`), integração com canais (`kommo_config`, `unipile_config`, `meta_config`), funis de venda (`funis`, `funil_etapas`, `oportunidades`) e automações (`automacoes`, `automacao_execucoes`).
- Hipóteses: (a) projeto paralelo compartilhando o mesmo banco, (b) feature em planejamento, (c) integração externa não auditada. **Investigar com Jonathan.**

### 3. RLS é abundante mas pouco efetivo no fluxo principal

Existem **193 RLS policies** (114 só em `public`, 41 em `crm`, 38 em `alissonerp`). Como o backend acessa o banco via `src/lib/db.ts` com `postgres.js` (não usa o role autenticado do Supabase), a maioria dessas políticas é **bypass** silenciosamente. Elas só protegem clientes que entrem via PostgREST/Supabase JS com JWT.

Implicação: a segurança de fato vem das checagens em `src/lib/permissoes.ts` + `requireAuth()` + `defineRoute({ requireRoles })`. RLS é uma camada secundária.

### 4. `directus` é legado mas ainda referenciado

110 tabelas em `directus`, das quais ~95 são configuração da plataforma Directus. Apenas as tabelas de negócio (`ordens`, `pcp`, `apontamento`, `controle_estoque`, `protocolo`, `distribuicao`, `compras`, `insumos`) ainda são lidas pelo código (READONLY).

### 5. `extensions` tem 125 funções — todas de extensões instaladas

As funções pertencem a: `pg_stat_statements`, `pgcrypto`, `uuid-ossp`, `pg_net`, `hypopg`, `http`, `unaccent`, `wrappers`, `index_advisor`. Documentadas para completude, mas não devem ser modificadas.

### 6. Funções "no-touch" do CLAUDE.md — verificação

| Função (CLAUDE.md) | Status real |
|---|---|
| `fn_processar_apontamento_pcp` | ✓ presente em `alissonerp` |
| `fn_processar_transferencia_saida` | ✗ NÃO existe; nome similar: `fn_processar_transferencia` |
| `fn_processar_fechamento_dist` | ✓ presente em `alissonerp` |
| `fn_concluir_protocolo` | ✓ presente em `alissonerp` |
| `fn_processar_auditoria` | ✓ presente em `alissonerp` |
| `fn_criar_servico_from_pcp` | ✓ presente em `alissonerp` |
| `fn_calcular_peso_pedra_gramas` | ✓ presente em `alissonerp` |

## Top 10 objetos mais referenciados no código

| # | Objeto | Hits |
|--:|---|---:|
| 1 | `public.produtos` | 564 |
| 2 | `public.vendas` | 527 |
| 3 | `alissonerp.ordens` | 487 |
| 4 | `directus.ordens` | 487 |
| 5 | `alissonerp.pcp` | 476 |
| 6 | `directus.pcp` | 476 |
| 7 | `public.estoque` | 356 |
| 8 | `alissonerp.insumos` | 245 |
| 9 | `directus.insumos` | 245 |
| 10 | `directus.protocolo` | 245 |

_Nota: contagem por nome bruto — tabelas com nomes idênticos em schemas distintos (`ordens`, `pcp`) aparecem duplicadas. Ver `99-code-mapping.md` para detalhes._

## Cobertura desta documentação

- ✅ Schemas mapeados: `alissonerp`, `public`, `directus`, `crm`, `auth`, `storage`, `extensions` (7 schemas)
- ✅ Tabelas: **377/377** mapeadas com colunas, PK/FK/UNIQUE/CHECK, índices, triggers, RLS
- ✅ Colunas: **5594** com tipo, nullable, default, comentário
- ✅ Funções/Procedures: **321** com assinatura, retorno e CORPO-FONTE COMPLETO em `<schema>/functions.md`
- ✅ Triggers: **148** com função alvo, evento, timing, definição completa
- ✅ Views: **122** com SQL completo
- ✅ RLS: **234** políticas em todos schemas (com qual + with_check)
- ✅ Indexes: **819** com indexdef
- ✅ Sequences: **228**
- ✅ Enums: **28** com valores
- ✅ Extensions: 13 instaladas
- ✅ Cross-reference banco ↔ código (1013 arquivos varridos, 8.1 MB)
- ✅ Migrations: 219 indexadas com summary

## Lacunas conhecidas (transparência)

- ⚠️ **Schemas Supabase internos** (`_realtime`, `graphql`, `graphql_public`, `net`, `vault`, `cron`, `supabase_functions`, `realtime`) não foram detalhados — são gerenciados pelo Supabase e não há expectativa de modificação.
- ⚠️ **Schema `crm`** está documentado estruturalmente mas o **propósito de negócio** depende de confirmação com o time.
- ⚠️ **Cross-reference por nome bruto** — para tabelas com nomes idênticos em múltiplos schemas, a contagem é inflada (sinalizado em cada arquivo).
- ⚠️ **Funções de `extensions`** (125) não têm descrição de propósito — são de bibliotecas externas, deve-se consultar a documentação da extensão.

## Como regenerar tudo do zero

```bash
node scripts/_db_mapping_extract.mjs    # 1) extrai JSON crus em docs/db-mapping/_raw/ (~10s)
node scripts/_db_mapping_code_xref.mjs  # 2) cross-reference banco↔código (~10s)
node scripts/_db_mapping_build_docs.mjs # 3) constrói os MDs finais em docs/db-mapping/
```
