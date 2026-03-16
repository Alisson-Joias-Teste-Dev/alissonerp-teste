-- =============================================
-- MIGRATION 064: Sequence para IDs de produtos criados no ERP
--
-- public.produtos.id_produto não tem default (vem do Tiny ERP).
-- Para produtos criados internamente, usamos esta sequência
-- iniciando em valor seguro acima do intervalo Tiny.
-- =============================================

DO $$
DECLARE max_id bigint;
BEGIN
  SELECT COALESCE(MAX(id_produto), 0) INTO max_id FROM public.produtos;
  max_id := GREATEST(max_id + 1000, 90000000);
  IF NOT EXISTS (
    SELECT 1 FROM pg_sequences
    WHERE schemaname = 'alissonerp' AND sequencename = 'seq_produto_id'
  ) THEN
    EXECUTE format(
      'CREATE SEQUENCE alissonerp.seq_produto_id START %s INCREMENT 1 MINVALUE %s',
      max_id, max_id
    );
  END IF;
END $$;

GRANT USAGE ON SEQUENCE alissonerp.seq_produto_id TO authenticated;
