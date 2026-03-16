-- =============================================
-- MIGRATION 052: Fix vw_detalhe_pote — saldo_real apenas do Almoxarifado (ID=1)
-- PROBLEMA: vw_detalhe_pote não tinha deposito_id=1 no filtro, somando todos os depósitos.
-- Metal/pedras nos operadores = em produção, NÃO é estoque disponível.
-- vw_saldo_pote já foi corrigida na 046; esta corrige vw_detalhe_pote (saldo por insumo).
-- Constraint: Ouro Total (pote) = SÓ depósito geral (ID=1)
-- =============================================

CREATE OR REPLACE VIEW alissonerp.vw_detalhe_pote AS
SELECT
  i.id                AS insumo_id,
  i.nome              AS insumo_nome,
  i.sku,
  i.categoria_id,
  ci.nome             AS categoria_nome,
  i.ativo,
  i.unidade,
  i.descricao,
  i.custo_compra,
  i.estoque_minimo,
  i.estoque_maximo,
  i.peso_pedra,
  COALESCE(se.saldo, 0::real) AS saldo_real
FROM alissonerp.insumos i
LEFT JOIN alissonerp.categorias_insumo ci
  ON ci.id = i.categoria_id
LEFT JOIN (
  SELECT insumo_id, saldo
  FROM alissonerp.vw_saldo_estoque
  WHERE deposito_id = 1      -- SÓ Almoxarifado Central; operadores = em produção
) se ON se.insumo_id = i.id;

COMMENT ON VIEW alissonerp.vw_detalhe_pote IS
  'Catálogo de insumos com saldo_real do Almoxarifado Central (deposito_id=1). '
  'Saldo dos operadores não conta — metal/pedras em produção não é estoque disponível.';

-- Regarantir permissões (view foi recriada)
GRANT SELECT ON alissonerp.vw_detalhe_pote TO anon, authenticated;
