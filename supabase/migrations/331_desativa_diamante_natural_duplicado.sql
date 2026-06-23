-- =====================================================================================
-- 331 — Desativa 16 "Diamante Natural" duplicados (lote SKU 170x, categoria vazia)
-- =====================================================================================
-- O QUÊ: marca situacao='I' nos 16 produtos "Diamante Natural 1.0–2.5mm" que são cópias
--   redundantes (categoria vazia, SEM peso_ct e sem preço), cuja gêmea boa de mesmo nome
--   (SKU 177x/178x, categoria 'Pedras', COM peso_ct + preço) já existe ativa.
-- POR QUE: apareciam duplicados na aba Produtos. A 330 não pegou porque esses têm categoria
--   nula (ficam fora da view de pedras).
-- CRITÉRIO: ativo + SEM peso_ct + existe gêmeo de MESMO NOME ativo COM peso_ct.
-- IMPACTO: somem da aba Produtos; a gêmea boa (com preço) permanece. Nenhum preço muda.
-- REVERSÍVEL: backup em alissonerp._bkp_pedras_inativadas_331.
-- =====================================================================================

SELECT alissonerp.assinar_mudanca_banco(
  'jonathan','claude-code',
  'Desativa 16 Diamante Natural duplicados (SKU 170x, categoria vazia, sem peso/preco) A->I; gemea boa SKU 177x permanece; backup _bkp_pedras_inativadas_331',
  'UPDATE public.produtos SET situacao=I WHERE id_produto IN (16 Diamante Natural sem peso_ct com gemeo com peso_ct)'
);

DROP TABLE IF EXISTS alissonerp._bkp_pedras_inativadas_331;
CREATE TABLE alissonerp._bkp_pedras_inativadas_331 AS
WITH base AS (
  SELECT p.id_produto, p.sku, p.nome, ppe.peso_ct
  FROM public.produtos p
  LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
  WHERE p.situacao='A'
),
com_ct AS (SELECT DISTINCT nome FROM base WHERE peso_ct IS NOT NULL)
SELECT b.id_produto, b.sku, b.nome, 'A'::text AS situacao_anterior
FROM base b
JOIN com_ct w ON w.nome = b.nome
WHERE b.peso_ct IS NULL;

UPDATE public.produtos
SET situacao = 'I'
WHERE id_produto IN (SELECT id_produto FROM alissonerp._bkp_pedras_inativadas_331)
  AND situacao = 'A';

SELECT
  (SELECT count(*) FROM alissonerp._bkp_pedras_inativadas_331) AS alvo,
  (SELECT count(*) FROM public.produtos WHERE id_produto IN (SELECT id_produto FROM alissonerp._bkp_pedras_inativadas_331) AND situacao='I') AS desativadas;
