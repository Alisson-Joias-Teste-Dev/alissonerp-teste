-- ============================================================================
-- Migration 268 — Blindar regras de precificação
-- ============================================================================
-- Regras de negócio aprovadas em 20/05/2026:
--   1. Serviço (tipo_item='servico') → obrigatório ter preco_servico
--   2. Joias/Insumos → preço calculado pela curva dinâmica (view vw_produto_preco)
--   3. Produto sem peso → NULL (sem preço) — intencional, sem fallback
-- ============================================================================

-- ── 1. CHECK: preco_servico não pode ser negativo ou zero ────────────────
ALTER TABLE alissonerp.erp_produtos
ADD CONSTRAINT check_preco_servico_positivo
CHECK (preco_servico IS NULL OR preco_servico > 0);

COMMENT ON CONSTRAINT check_preco_servico_positivo ON alissonerp.erp_produtos IS
'Regra de negocio: preco_servico deve ser positivo se preenchido.';

-- ── 2. NOTA: as demais regras estão documentadas no código-fonte ──────────
-- Ver comentários em:
--   src/app/api/produtos/route.ts           (linha ~319)
--   src/app/api/vendas/produtos/busca/route.ts (linha ~32)
--   src/app/api/produtos/[id]/route.ts
--   src/components/produtos/ProdutoDrawer.tsx
--
-- A view vw_produto_preco centraliza a lógica de precificação.
-- NÃO adicionar fallback para preco_tiny/preco_sync em nenhum lugar.
-- ============================================================================
