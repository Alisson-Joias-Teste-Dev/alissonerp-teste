-- =====================================================================================
-- 330 — Desativa 40 pedras-lixo (duplicatas de diamante sem preço)
-- =====================================================================================
-- O QUÊ: marca situacao='I' (inativo) em 40 produtos-pedra que são duplicatas legadas
--   de diamante (lote "FA" + variações "Pedra de Diamante…") SEM preço, cujo equivalente
--   "Diamante Natural" com preço já existe ativo.
-- POR QUÊ: poluíam a busca de pedra do orçamento (causa do bug "diamante R$ 0") e a lista
--   de regras. São lixo herdado do Directus/Tiny.
-- COMO ESCOLHE: sem preço + categoria reconhecida + existe irmã (mesma categoria+mm) COM preço.
--   (não pega pedra real única — Topázio/Pérola/Turmalina/Esmeralda Navete ficam de fora)
-- IMPACTO: somem do catálogo ativo e da view de preço. NENHUM preço de pedra real muda
--   (elas não tinham preço). Histórico de vendas intacto (produto só fica inativo).
-- REVERSÍVEL: backup em alissonerp._bkp_pedras_inativadas_330 → UPDATE situacao='A'.
-- ⚠️ Se um import do Tiny reativar (situacao volta a 'A'), desativar também no Tiny.
-- =====================================================================================

SELECT alissonerp.assinar_mudanca_banco(
  'jonathan','claude-code',
  'Desativa 40 pedras-lixo (duplicatas diamante sem preco) situacao A->I; backup _bkp_pedras_inativadas_330; reversivel',
  'UPDATE public.produtos SET situacao=I WHERE id_produto IN (40 duplicatas de diamante sem preco)'
);

-- 1) Congela o conjunto-alvo num backup (reversibilidade)
DROP TABLE IF EXISTS alissonerp._bkp_pedras_inativadas_330;
CREATE TABLE alissonerp._bkp_pedras_inativadas_330 AS
WITH ext AS (
  SELECT p.id_produto, p.sku, p.nome, vp.preco_venda, vp.categoria_pedra,
    nullif(replace(coalesce(substring(p.nome from '([0-9]+([.,][0-9]+)?)\s*mm'),''),',','.'),'')::numeric AS mm
  FROM public.produtos p
  JOIN alissonerp.produto_tipo_item ti ON ti.produto_id=p.id_produto AND ti.tipo_item='insumo'
  LEFT JOIN alissonerp.vw_pedras_preco vp ON vp.id_produto=p.id_produto
  WHERE p.situacao='A' AND p.categoria='Pedras'
),
priced AS (
  SELECT DISTINCT categoria_pedra, mm FROM ext
  WHERE preco_venda IS NOT NULL AND categoria_pedra IS NOT NULL
)
SELECT e.id_produto, e.sku, e.nome, 'A'::text AS situacao_anterior
FROM ext e
JOIN priced pr ON pr.categoria_pedra = e.categoria_pedra AND pr.mm = e.mm
WHERE e.preco_venda IS NULL AND e.categoria_pedra IS NOT NULL;

-- 2) Desativa (guarda: só se ainda estiver ativa)
UPDATE public.produtos
SET situacao = 'I'
WHERE id_produto IN (SELECT id_produto FROM alissonerp._bkp_pedras_inativadas_330)
  AND situacao = 'A';

-- 3) Validação
SELECT
  (SELECT count(*) FROM alissonerp._bkp_pedras_inativadas_330)                                              AS alvo,
  (SELECT count(*) FROM public.produtos WHERE id_produto IN (SELECT id_produto FROM alissonerp._bkp_pedras_inativadas_330) AND situacao='I') AS desativadas;
