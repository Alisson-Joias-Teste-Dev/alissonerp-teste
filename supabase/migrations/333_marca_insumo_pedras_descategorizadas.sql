-- =====================================================================================
-- 333 — Marca como 'insumo' as pedras reais que faltavam essa classificação
-- =====================================================================================
-- O QUÊ: insere produto_tipo_item='insumo' para os produtos-pedra corrigidos na 332 que
--   ainda não tinham essa marca (Diamante Natural 1.8mm, Zircônia 1.1mm e 1.2mm).
-- POR QUE: a view vw_pedras_preco exige tipo_item='insumo' (além de categoria='Pedras').
--   Sem isso, mesmo com categoria certa, continuavam fora da view → sem preço.
--   As irmãs de mesmo tipo/tamanho já são 'insumo'.
-- IMPACTO: passam a entrar na view e ganham preço da regra. Reversível (apagar essas linhas).
-- REVERSÍVEL: backup em alissonerp._bkp_insumo_add_333.
-- =====================================================================================

SELECT alissonerp.assinar_mudanca_banco(
  'jonathan','claude-code',
  'Marca insumo em pedras reais que faltavam (Diamante 1.8mm, Zirconia 1.1/1.2mm) p/ entrarem na view de preco. Backup _bkp_insumo_add_333',
  'INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item) VALUES (..., insumo) para pedras com categoria Pedras + peso_ct sem marca insumo'
);

DROP TABLE IF EXISTS alissonerp._bkp_insumo_add_333;
CREATE TABLE alissonerp._bkp_insumo_add_333 AS
SELECT b.id_produto, b.sku, b.nome
FROM alissonerp._bkp_categoria_corrigida_332 b
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.produto_tipo_item t
  WHERE t.produto_id=b.id_produto AND t.tipo_item='insumo'
);

INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
SELECT id_produto, 'insumo' FROM alissonerp._bkp_insumo_add_333;

-- Validação: TODAS as 5 corrigidas (332) agora têm preço na view
SELECT vp.nome, vp.peso_ct, vp.preco_venda
FROM alissonerp.vw_pedras_preco vp
WHERE vp.id_produto IN (SELECT id_produto FROM alissonerp._bkp_categoria_corrigida_332)
ORDER BY vp.nome;
