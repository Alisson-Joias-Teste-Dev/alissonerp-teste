-- ============================================================
-- Migration 135 — Classificação dos 3 produtos ativos com
-- saldo >= 1 que ainda não tinham categoria definida.
-- Os demais 766 produtos do recorte já estão classificados.
-- Inferência feita pela 1ª palavra significativa do nome.
-- ============================================================

UPDATE public.produtos
SET categoria = 'Anel'
WHERE id_produto IN (982552, 5678620)
  AND (categoria IS NULL OR TRIM(categoria) = '');

UPDATE public.produtos
SET categoria = 'Pingente'
WHERE id_produto = 819099
  AND (categoria IS NULL OR TRIM(categoria) = '');
