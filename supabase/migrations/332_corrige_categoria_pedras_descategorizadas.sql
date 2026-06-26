-- =====================================================================================
-- 332 — Corrige categoria de pedras reais descategorizadas (sem categoria → 'Pedras')
-- =====================================================================================
-- O QUÊ: seta categoria='Pedras' em produtos-pedra REAIS (têm peso_ct correto) que estavam
--   com categoria NULA. Sem isso, a view vw_pedras_preco (exige categoria='Pedras') os ignora
--   → ficam SEM preço dinâmico (a tela mostra o peso em grama no lugar do preço).
-- POR QUE: erro de cadastro — vizinhas (3.9/4.1mm) são 'Pedras', mas 4.0mm (e outras 4) ficaram nulas.
-- CRITÉRIO: ativo + TEM peso_ct + categoria nula/≠'Pedras'.
-- IMPACTO: passam a entrar na view e ganham o preço correto da regra. Peso NÃO muda (já certo).
-- REVERSÍVEL: backup em alissonerp._bkp_categoria_corrigida_332 (categoria anterior).
-- =====================================================================================

SELECT alissonerp.assinar_mudanca_banco(
  'jonathan','claude-code',
  'Corrige categoria de 5 pedras reais (peso ok) de NULL para Pedras (ex: Diamante Natural 4.0mm); passam a ter preco na view. Backup _bkp_categoria_corrigida_332',
  'UPDATE public.produtos SET categoria=Pedras WHERE situacao=A AND tem peso_ct AND categoria distinta de Pedras'
);

DROP TABLE IF EXISTS alissonerp._bkp_categoria_corrigida_332;
CREATE TABLE alissonerp._bkp_categoria_corrigida_332 AS
SELECT p.id_produto, p.sku, p.nome, p.categoria AS categoria_anterior
FROM public.produtos p
JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id=p.id_produto
WHERE p.situacao='A' AND ppe.peso_ct IS NOT NULL
  AND (p.categoria IS NULL OR p.categoria <> 'Pedras');

UPDATE public.produtos
SET categoria = 'Pedras'
WHERE id_produto IN (SELECT id_produto FROM alissonerp._bkp_categoria_corrigida_332);

-- Validação: as corrigidas agora têm preço na view
SELECT vp.nome, vp.peso_ct, vp.preco_venda, vp.nome_tabela AS regra
FROM alissonerp.vw_pedras_preco vp
WHERE vp.id_produto IN (SELECT id_produto FROM alissonerp._bkp_categoria_corrigida_332)
ORDER BY vp.nome;
