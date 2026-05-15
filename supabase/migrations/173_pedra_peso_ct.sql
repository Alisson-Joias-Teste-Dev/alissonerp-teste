-- =============================================
-- MIGRATION 173: peso_ct e pontos para pedras-produto
--
-- CONTEXTO:
--   public.produtos.peso_precificado tem trigger arredondar_peso_para_cima
--   (owner=supabase_admin) que faz CEIL(peso × 10) / 10. Para joias funciona,
--   mas esmaga o peso real das pedras (0.005–0.09g) sempre pra 0.1g.
--
--   Como não temos permissão pra alterar a trigger, armazenamos o ct real
--   em alissonerp.produto_pedra_extras.peso_ct e a UI lê dali.
--
--   Pontos = ct × 100 (1 ct = 100 pontos) — derivado, não armazenado.
-- =============================================

ALTER TABLE alissonerp.produto_pedra_extras
  ADD COLUMN IF NOT EXISTS peso_ct NUMERIC(10,4);

COMMENT ON COLUMN alissonerp.produto_pedra_extras.peso_ct IS
  'Peso da pedra em quilates (ct). Fonte de verdade para pedras-produto, '
  'pois public.produtos.peso_precificado é arredondado pelo trigger '
  'arredondar_peso_para_cima. Pontos = peso_ct × 100.';
