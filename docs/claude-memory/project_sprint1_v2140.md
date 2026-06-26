---
name: Sprint 1+2 — Migrations v2.14.0 (28/03/2026)
description: 5 migrations aplicadas em prod: locais_estoque, pedras ct, compras expandidas, views multi-local, triggers ct+compras
type: project
---

Aplicadas em 28/03/2026. Migrations 094–098. NUNCA repetir essas colunas.

**Why:** Rastrear estoque por local físico (Fábrica vs Loja), pedras em quilates e expandir dados de compras para NF e lote.

**How to apply:** Ao trabalhar com estoque, compras ou pedras, usar as novas colunas e views listadas abaixo.

---

## Migration 094 — locais_estoque

```sql
-- tabela alissonerp.locais_estoque (id=1 Fábrica, id=2 Loja)
-- depositos.local_estoque_id INTEGER FK → locais_estoque (backfill: todos = 1)
-- movimentacoes_estoque.local_estoque_id INTEGER FK NOT NULL (backfill 30/03/2026: 374 rows → local=1)
-- INDEX idx_movimentacoes_local_estoque
```

⚠️ **Pitfall resolvido em 30/03/2026 (v2.14.1):**
A migration deixou local_estoque_id nullable e sem backfill → vw_saldo_estoque retornava 2 linhas por (deposito, insumo): uma NULL e uma com local=1. Dropdown e validação pegavam linhas diferentes → saldo divergente. Fix: backfill (374 rows → local=1) + NOT NULL + queries de saldo usam SUM(saldo) em vez de LIMIT 1.

## Migration 095 — pedras_quilates_ct

```sql
-- pcp.total_pedras_ct NUMERIC(10,4) DEFAULT 0
-- apontamentos_pcp.peso_ct NUMERIC(10,4)
-- apontamentos_pcp.peso_g_pedra NUMERIC(10,4)
-- distribuicao_saida_pedras.peso_ct_utilizado NUMERIC(10,4)
-- insumos.peso_pedra_ct já existia (migration 092) — backfill: 235 pedras, todas OK
```

## Migration 096 — compras_expandidas

```sql
-- compras: local_destino_id FK, numero_nf, data_compra, data_recebimento, recebido_por UUID
-- itens_compra: unidade, peso_ct, qtd_pecas, custo_por_ct, lote_referencia, observacao
-- Indexes: idx_compras_local_destino, idx_compras_data_compra, idx_itens_compra_lote
```

## Migration 097 — views_saldo_multilocal_ct

```sql
-- vw_saldo_estoque: GROUP BY (deposito_id, insumo_id, local_estoque_id) — nova coluna
-- vw_detalhe_pote: adicionadas colunas saldo_ct e peso_pedra_ct
-- vw_saldo_pote: recriada idêntica (dependente de vw_saldo_estoque)
-- vw_saldo_por_local: NOVA — saldo por local_estoque + saldo_ct para pedras (categoria=2)
```

## Migration 098 — triggers_pedras_ct_compras

Schema additions:
```sql
-- distribuicoes.total_pedras_ct NUMERIC(10,4) DEFAULT 0
-- apontamentos_distribuicao.peso_ct NUMERIC(10,4)
```

Trigger functions modificadas (CREATE OR REPLACE, backward compat, SECURITY DEFINER):
```
fn_criar_par_movimentacao     -- 10o param p_local_id INTEGER DEFAULT NULL
fn_processar_apontamento_pcp  -- tipos 3/6: CE em ct quando peso_ct IS NOT NULL; acumula pcp.total_pedras_ct
fn_processar_saida_ordem      -- SP pedras: CE = peso/0.2 (ct); todos CEs com local_id=1
fn_calcular_item_compra       -- pedras: peso_ct x custo_por_ct quando disponiveis
fn_concluir_compra            -- CE usa local_destino_id; pedras em ct; guard status rascunho/recebida
fn_processar_apontamento_dist -- tipos 3/6 com peso_ct; acumula distribuicoes.total_pedras_ct
fn_processar_fechamento_dist  -- acumula pcp.total_pedras_ct; CE TEDD com local_id=1
```

Overload antigo dropado:
```sql
DROP FUNCTION IF EXISTS alissonerp.fn_criar_par_movimentacao(
  integer, real, integer, integer, integer, integer,
  alissonerp.enum_marcador_estoque, integer, text
);
```

Validacao pos-deploy:
- V1: 10 funcoes, fn_criar_par_movimentacao unica (10-param)
- V2: 5 trigger bindings intactos
- V5a: fn_concluir_protocolo hash = ec262683016c2141bce064ec38f486ea
- V5b: fn_processar_auditoria hash = a586826997268602f4f6b65c9a75005c
- V6: vw_saldo_estoque=35, vw_detalhe_pote=259, vw_pcp_erp=91 rows
- fn_concluir_distribuicao: deliberadamente sem CEs (design existente — NAO alterar)
