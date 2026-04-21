-- ============================================================================
-- Migration 163 — Produto Personalizacao: preco por letra
-- ============================================================================
-- Expande alissonerp.produto_personalizacao para suportar modelo
-- "preco por letra" (valor dinamico = qtd_letras * preco_por_letra).
--
-- Quando preenchido, o backend RECALCULA preco_unitario/total_item no
-- INSERT do item de venda, ignorando o que veio no body (seguranca).
--
-- Tambem desativa as 10 configs antigas (SKUs 1566-1..10) para evitar
-- conflito com o modelo novo no SKU pai 1566.
--
-- Seguranca:
--   - ADD COLUMN IF NOT EXISTS (aditivo)
--   - UPDATE marca ativo=false (nao DELETE, preserva historico)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Nova coluna preco_por_letra
-- ----------------------------------------------------------------------------
ALTER TABLE alissonerp.produto_personalizacao
  ADD COLUMN IF NOT EXISTS preco_por_letra NUMERIC(10,2)
    CHECK (preco_por_letra IS NULL OR preco_por_letra >= 0);

COMMENT ON COLUMN alissonerp.produto_personalizacao.preco_por_letra IS
  'Se preenchido, preco do item na venda = qtd_letras * preco_por_letra (recalculado server-side em POST /api/vendas). Se NULL, usa preco_tiny do produto.';

-- ----------------------------------------------------------------------------
-- 2) Desativar as 10 configs antigas da familia 1566-N
-- Motivo: migracao para modelo novo (preco_por_letra no SKU pai 1566).
-- Os 10 SKUs filhos serao desativados no Tiny manualmente depois.
-- ----------------------------------------------------------------------------
UPDATE alissonerp.produto_personalizacao
SET ativo = false,
    observacao = COALESCE(observacao, '') ||
                 E'\n[auto] desativado em migration 163: migrado para modelo preco_por_letra no SKU pai 1566',
    updated_at = now()
WHERE produto_id IN (
  SELECT id_produto
  FROM public.produtos
  WHERE sku ~ '^1566-[0-9]+$'
)
AND ativo = true;

-- ============================================================================
-- Fim migration 163
-- ============================================================================
