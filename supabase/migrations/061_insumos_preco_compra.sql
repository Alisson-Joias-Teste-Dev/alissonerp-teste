-- =============================================
-- MIGRATION 061: Preço de compra automático em insumos
--
-- CONTEXTO:
--   Adiciona colunas de rastreamento do último preço de compra em alissonerp.insumos.
--   Um trigger propaga o preço para produto_composicao (tipo='pedra') automaticamente.
--   O endpoint PATCH /api/produtos/insumos atualiza o preço e chama recalcularPrecoPedras.
--
-- REGRA: Preço pedra = último preço compra, propaga automaticamente via trigger
--        trigger: trg_propagar_preco_insumo / fn_propagar_preco_insumo
-- =============================================

-- 1. Adicionar colunas de último preço de compra em alissonerp.insumos
ALTER TABLE alissonerp.insumos
  ADD COLUMN IF NOT EXISTS ultimo_preco_compra_usd NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS data_ultimo_preco        TIMESTAMPTZ;

-- 2. Tentar popular a partir de movimentacoes_estoque.preco_compra (se existir)
--    movimentacoes_estoque tem coluna preco_compra DECIMAL(12,2) (migration 009)
--    Busca o valor mais recente por insumo (marcador EA = Entrada Avulsa ou compras)
UPDATE alissonerp.insumos i
SET
  ultimo_preco_compra_usd = subq.preco_compra,
  data_ultimo_preco       = subq.data_hora
FROM (
  SELECT DISTINCT ON (insumo_id)
    insumo_id,
    preco_compra,
    data_hora
  FROM alissonerp.movimentacoes_estoque
  WHERE preco_compra IS NOT NULL
    AND preco_compra > 0
  ORDER BY insumo_id, data_hora DESC
) subq
WHERE i.id = subq.insumo_id
  AND i.ultimo_preco_compra_usd IS NULL;

-- 3. Trigger: propagar atualização de preço do insumo → produto_composicao (tipo='pedra')
--    Só atualiza produto_composicao — NÃO toca em public.produtos diretamente.
--    recalcularPrecoPedras (chamado pelo endpoint) cuida de public.produtos.

CREATE OR REPLACE FUNCTION alissonerp.fn_propagar_preco_insumo()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.ultimo_preco_compra_usd IS DISTINCT FROM NEW.ultimo_preco_compra_usd
     AND NEW.ultimo_preco_compra_usd IS NOT NULL THEN
    UPDATE alissonerp.produto_composicao
    SET preco_compra_usd = NEW.ultimo_preco_compra_usd
    WHERE insumo_id = NEW.id
      AND tipo = 'pedra';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_propagar_preco_insumo ON alissonerp.insumos;
CREATE TRIGGER trg_propagar_preco_insumo
  AFTER UPDATE OF ultimo_preco_compra_usd ON alissonerp.insumos
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_propagar_preco_insumo();

-- 4. Grants
GRANT SELECT, UPDATE (ultimo_preco_compra_usd, data_ultimo_preco)
  ON alissonerp.insumos TO authenticated;

COMMENT ON COLUMN alissonerp.insumos.ultimo_preco_compra_usd IS
  'Último preço unitário de compra em USD. Propagado automaticamente para produto_composicao (tipo=pedra) via trigger trg_propagar_preco_insumo.';

COMMENT ON COLUMN alissonerp.insumos.data_ultimo_preco IS
  'Data/hora da última atualização do preço de compra (ultimo_preco_compra_usd).';

COMMENT ON FUNCTION alissonerp.fn_propagar_preco_insumo IS
  'Trigger: ao atualizar insumos.ultimo_preco_compra_usd, propaga o novo preço para todas as linhas de produto_composicao com tipo=pedra e mesmo insumo_id. NÃO atualiza public.produtos diretamente (isso é responsabilidade de recalcularPrecoPedras).';
