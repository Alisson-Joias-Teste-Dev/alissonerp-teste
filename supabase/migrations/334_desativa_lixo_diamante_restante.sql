-- =====================================================================================
-- 334 — Desativa 15 duplicatas de diamante branco que sobraram (gêmeo Natural precificado)
-- =====================================================================================
-- O QUÊ: situacao='I' em 15 produtos "Pedra de Diamante…"/"Diamantes…" (melê branco) SEM preço,
--   cujo equivalente "Diamante Natural <mm>" já existe ativo e precificado.
-- POR QUE: escaparam da 330 porque os gêmeos 1.8mm/4.0mm só foram categorizados na 332/333;
--   e os de mm inteiro ("2mm","7.mm") tinham categoria nula. Agora têm gêmeo precificado.
-- ATENÇÃO: NÃO inclui "Diamantes 0,90mm" (FA1535) — não há "Natural 0,9mm", então NÃO é
--   duplicata; fica ativa para o Jonathan decidir (criar 0,9mm ou desativar).
-- IDs revisados um a um. Reversível via _bkp_pedras_inativadas_334.
-- =====================================================================================

SELECT alissonerp.assinar_mudanca_banco(
  'jonathan','claude-code',
  'Desativa 15 duplicatas de diamante branco (gemeo Natural precificado) A->I; NAO inclui Diamantes 0,90mm (sem gemeo). Backup _bkp_pedras_inativadas_334',
  'UPDATE public.produtos SET situacao=I WHERE id_produto IN (15 ids revisados de Pedra de Diamante/Diamantes melê)'
);

DROP TABLE IF EXISTS alissonerp._bkp_pedras_inativadas_334;
CREATE TABLE alissonerp._bkp_pedras_inativadas_334 AS
SELECT id_produto, sku, nome, 'A'::text AS situacao_anterior
FROM public.produtos
WHERE id_produto IN (12074,7616,7618,7617,7621,7619,7620,7623,7625,7624,7628,7626,7627,7631,7637)
  AND situacao='A';

UPDATE public.produtos
SET situacao='I'
WHERE id_produto IN (SELECT id_produto FROM alissonerp._bkp_pedras_inativadas_334)
  AND situacao='A';

SELECT
  (SELECT count(*) FROM alissonerp._bkp_pedras_inativadas_334) AS alvo,
  (SELECT count(*) FROM public.produtos WHERE id_produto IN (SELECT id_produto FROM alissonerp._bkp_pedras_inativadas_334) AND situacao='I') AS desativadas,
  (SELECT situacao FROM public.produtos WHERE id_produto=12104) AS diamantes_0_90mm_intacta;
