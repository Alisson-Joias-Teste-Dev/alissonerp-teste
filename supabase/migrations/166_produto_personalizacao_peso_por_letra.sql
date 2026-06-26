-- ============================================================================
-- Migration 166 — Produto Personalizacao: peso por letra
-- ============================================================================
-- Espelho do preco_por_letra (migration 163) para PESO em gramas.
-- Admin cadastra "0.5g por letra" + vendedor digita nome → peso_estimado
-- calculado automaticamente no INSERT do item (recalculado server-side).
--
-- Se NULL, continua usando peso_precificado do produto (comportamento atual).
-- ============================================================================

ALTER TABLE alissonerp.produto_personalizacao
  ADD COLUMN IF NOT EXISTS peso_por_letra NUMERIC(8,2)
    CHECK (peso_por_letra IS NULL OR peso_por_letra >= 0);

COMMENT ON COLUMN alissonerp.produto_personalizacao.peso_por_letra IS
  'Se preenchido, peso_estimado do item na venda = qtd_letras * peso_por_letra (recalculado server-side em POST /api/vendas). Se NULL, usa peso_precificado do produto.';

-- ============================================================================
-- Fim migration 166
-- ============================================================================
