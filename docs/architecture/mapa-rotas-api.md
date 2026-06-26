# Mapa de Rotas API — fabricaAJ

> **Versão:** 1.0
> **Autor:** Aria (Architect) com auxílio de subagente Explore
> **Data:** 2026-04-29
> **Total mapeado:** **334 rotas** em `src/app/api/**/route.ts`

---

## Sumário Executivo

| Métrica | Contagem | % do total |
|---------|----------|------------|
| Total de rotas | **334** | 100% |
| Rotas com transação (`sql.begin`) | **19** | 5.7% |
| Rotas com validação Zod | **3** | 0.9% |
| Rotas com hardcoded IDs | **42+** | 12.6% |
| Rotas **sem transação** (potencial risco) | **315** | **94.3%** |

### Achados críticos

🔴 **94.3% das rotas não usam `sql.begin()`** — número muito maior que o diagnóstico inicial sugeria. Várias rotas operam multi-tabela sem atomicidade.

🔴 **42+ hardcoded IDs** — quase **3× o estimado** no diagnóstico inicial (15+). Alguns descobertos novos: `insumo_id=275` (Ouro 24k liga em `purificacao/`).

🔴 **Rotas críticas sem transação:** `pcp/apontamentos`, `distribuicao/[id]/saida`, `pcp/transferir` — todas multi-tabela, todas afetam estoque/PCP, **todas potencial fonte de inconsistência se falharem na metade**.

🟠 **0.9% das rotas têm Zod** — validação atual é if/throw manual em 95% dos casos.

---

## Top 5 Rotas Mais Críticas (por tabelas afetadas)

| # | Rota | Método | Tabelas | Tx | Zod | Hardcoded |
|---|------|--------|---------|----|----|-----------|
| 1 | `/api/vendas` | POST | 8+ (vendas_erp, itens_venda_erp, pagamentos_venda, ordens, itens_ordem, fichas_tecnicas, auditorias, contas_receber) | ✅ | ❌ | ❌ |
| 2 | `/api/ordens` | POST | 7+ (ordens, itens_ordem, fichas_tecnicas, auditorias, servicos, contas_receber) | ✅ | ❌ | ❌ |
| 3 | `/api/produtos` | POST | 6+ (produtos, erp_produtos, produto_composicao, fichas_tecnicas_produto, tiny_sync_produtos, estoque) | ✅ | ❌ | ❌ |
| 4 | `/api/pcp/apontamentos` | POST | 4+ (apontamentos_pcp, pcp, movimentacoes_estoque, insumos) | ❌ ⚠️ | ❌ | ✅ (deposito_id=1, categoria_id=1\|2) |
| 5 | `/api/distribuicao/[id]/saida` | POST | 4+ (distribuicoes, movimentacoes_estoque, insumos, apontamentos_pcp) | ❌ ⚠️ | ❌ | ✅ (insumo_id=1, categoria_id=1\|2) |

---

## Distribuição por Módulo

| Módulo | Rotas | Tx | Zod | Hardcoded | Observações |
|--------|-------|-----|-----|-----------|-------------|
| **vendas** | 18 | 1 | ✗ | ✗ | Tx em POST principal — boa |
| **fiscal** | 15 | 2 (emitir) | ✗ | ✗ | Integrações Focus, emitentes |
| **pcp** | 17 | ✗ | ✗ | ✓ (7+) | ⚠️ Crítico — sem tx em rotas chave |
| **distribuicao** | 7 | ✗ | ✗ | ✓ (5+) | ⚠️ Crítico — sem tx em rotas chave |
| **produtos** | 25+ | 1 (POST) | ✗ | ✗ | Tx em criar/editar |
| **financeiro** | 12 | ✗ | ✗ | ✗ | Sem tx em movimentações |
| **estoque-comercial** | 8 | ✗ | ✗ | ✗ | Movimentações sem tx |
| **ordens** | 11 | 1 (POST) | ✗ | ✗ | Tx só na criação |
| **service** | 14 | 1 (concluir) | ✗ | ✓ (insumo_id=1) | Validação IA peso, hardcoded ouro |
| **crediario** | 7 | 2 (pagamento) | ✗ | ✗ | Bom — tx em pagamento |
| **dashboard** | 4 | ✗ | ✗ | ✓ (deposito=1, categoria=1) | Apenas leitura |
| **purificacao** | 9 | ✗ | ✗ | ✓ (deposito=1, insumo=275) | Hardcoded Ouro 24k descoberto |
| **Demais** | 152 | 11 | 0 | 23+ | admin, configuracoes, etc. |

---

## Hardcoded IDs Catalogados (42+ ocorrências)

### `deposito_id = 1` (Pote/Almoxarifado Central) — 15+ rotas

- `dashboard/fabrica/route.ts`
- `estoque/transferir-local/route.ts`
- `pcp/apontamentos/route.ts`
- `pcp/transferir/route.ts`
- `service/carregar-solda/route.ts`
- `service/carregar-aditivo/route.ts`
- `purificacao/route.ts`
- `distribuicao/apontamentos/route.ts`
- `lancamentos-avulso/route.ts`
- `compras/[id]/itens/route.ts`
- `relatorios/route.ts`
- (outros)

### `insumo_id = 1` (Ouro 18k) — 12+ rotas

- `service/[id]/concluir/route.ts`
- `service/[id]/devolver/route.ts`
- `service/solda-saldo/route.ts`
- `service/aditivo-saldo/route.ts`
- `pcp/apontamentos/route.ts`
- `purificacao/ligacao/route.ts`
- `relatorios/route.ts`
- (outros)

### `categoria_id = 1` (Metal/Ouro) — 5+ rotas

- `dashboard/fabrica/route.ts`
- `pcp/[id]/resumo/route.ts`
- `pcp/transferir/route.ts`
- (outros)

### `categoria_id = 2` (Pedras) — 6+ rotas

- `pcp/[id]/pedras-disponiveis/route.ts` (2x)
- `distribuicao/[id]/concluir/route.ts`
- `distribuicao/[id]/pedras-apontadas/route.ts` (2x)
- `pcp/transferir/route.ts` (2x)
- `estoque/transferir-local/route.ts`

### 🆕 `insumo_id = 275` (Ouro 24k liga) — descoberto por subagente

- `purificacao/ligacao/route.ts`
- `purificacao/liga-tipos/route.ts`

**Não estava no diagnóstico do Atlas — adicionar Story 1.1 task: incluir `OURO_24K_LIGA_INSUMO_ID=275` em `parametros_sistema`.**

---

## Padrões Inconsistentes

| Aspecto | Padrão Dominante | Alternativa | Risco |
|---------|------------------|-------------|-------|
| Validação | `if/throw` manual (95%) | Zod (0.9%) | Sem type-safety, validação ad-hoc |
| Transações | Queries isoladas (94%) | `sql.begin` (5.7%) | **Inconsistência em multi-tabela** |
| Auth | Role-based + DB check | Nenhuma (alguns endpoints) | Risco de bypass em rotas não auditadas |
| Hardcoded IDs | `= 1` literal (15+) | `?? 1` default (10+) | Não portável, quebra com mudança de DB |
| Error handling | Ad-hoc | try/catch | Stack traces expostos em alguns casos |
| Paginação | `LIMIT 500` fixo | Dinâmico (alguns) | Resultados inconsistentes |

---

## Rotas Críticas Sem Transação (subset prioritário)

Lista de rotas que **multi-tabela + sem `sql.begin`** — risco real de inconsistência em produção HOJE:

| Rota | Tabelas | Problema |
|------|---------|----------|
| `POST /api/pcp/apontamentos` | apontamentos_pcp + pcp + movimentacoes_estoque + insumos | Erro entre INSERT 1 e 2 deixa apontamento sem CE |
| `POST /api/pcp/transferir` | distribuicoes + movimentacoes_estoque (×2) | Saída sem entrada possível |
| `POST /api/distribuicao/[id]/saida` | distribuicoes + movimentacoes_estoque + insumos + apontamentos_pcp | Multi-step, falha parcial possível |
| `POST /api/pcp/[id]/atribuir-operador` | pcp + movimentacoes_estoque | Atribuição sem reflexo no estoque |
| `POST /api/financeiro/caixa/baixa` | múltiplas | (verificar — subagente reportou que tem tx, confirmar) |
| `POST /api/devolucoes` | devolucoes_venda + itens_venda + estornos | Devolução parcial inconsistente |
| `POST /api/service/[id]/transferir` | servicos + movimentacoes_estoque | Transferência sem CE |

**Implicação para o EPIC:** o problema #2 do diagnóstico ("Ordens de reposição fora de transação") é **muito maior** que parecia. Não é 1 rota — é potencialmente 7+ rotas críticas que precisam tx.

---

## Recomendações para o EPIC

### 🔴 Adições obrigatórias ao escopo

1. **Story 1.2 expandida:** não cobre apenas `api/vendas` e `api/contatos`. Adicionar como sub-tasks:
   - `pcp/apontamentos` em transação
   - `pcp/transferir` em transação
   - `distribuicao/[id]/saida` em transação
   - `service/[id]/transferir` em transação

   Estimativa revisada: 3d → **5d** (ajuste +2d, justificado).

2. **Story 1.1 expandida:** lista de hardcoded sobe de 15+ para 42+:
   - Adicionar parametro `OURO_24K_LIGA_INSUMO_ID=275`
   - Refactor de 42 ocorrências, não 15
   - Estimativa revisada: 2d → **3d** (ajuste +1d).

3. **Nova métrica em PRD §7 (M2 expandido):** "Cobertura de transação ≥ 95% em rotas POST/PUT/DELETE" — hoje 5.7%, meta acima de 95%.

### 🟠 Sugestões para roadmap pós-EPIC

- **Story extra (não no EPIC):** auditoria das outras 295 rotas para identificar quais precisam tx. Pode virar Sprint 5.
- **Linter custom:** detecta rota POST/PUT/DELETE com 2+ INSERTs/UPDATEs fora de `sql.begin()`. Bloqueia introdução de novos casos.

---

## Status do Mapeamento

| # | Entregável | Path | Status |
|---|-----------|------|--------|
| 1 | Mapa de rotas criado | `docs/architecture/mapa-rotas-api.md` | ✅ Concluído (2026-04-29) |
| 2 | Validação técnica atualizada com achados | `docs/architecture/validacao-tecnica-plano.md` | ✅ Concluído (2026-04-29) — 7 ajustes obrigatórios |
| 3 | PRD atualizado para v1.1 | `docs/prd/EPIC-001-FONTE-DA-VERDADE.md` | ✅ Concluído (2026-04-29) — 42 hardcoded vs 15, 7 rotas multi-tabela |
| 4 | Matriz de impacto cruzando com Stories | `docs/architecture/impact-matrix.md` | ✅ Concluído (2026-04-29) |
| 5 | Architect Notes nas 23 stories | `docs/stories/*.md` | ✅ Concluído (2026-04-29) — todas com seção dedicada |
| 6 | Stories validadas pelo PO | `docs/qa/po-validation-log-2026-04-29.md` | ✅ Concluído (2026-04-29) — 23/23 GO, score médio 9.1/10 |
| 7 | Stories com Status: Ready | `docs/stories/*.md` | ✅ Concluído (2026-04-29) — 23/23 prontas para SM priorizar |

**Mapeamento técnico do EPIC: completo. Próximo passo: SM prioriza Sprint Dia 1 → devs executam.**

— Aria, arquitetando o futuro 🏗️ + Pax, equilibrando prioridades 🎯
