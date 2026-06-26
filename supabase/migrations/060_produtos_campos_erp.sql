-- =============================================
-- MIGRATION 060: Adicionar campos ERP em public.produtos
-- CONTEXTO: public.produtos tem 14.812 registros e triggers de precificação INTOCÁVEIS.
-- SÓ adicionamos colunas novas — NUNCA alterar triggers existentes.
--
-- Colunas adicionadas:
--   tipo_metal     → tipo de metal do produto (ex: 'Ouro Amarelo 18k', 'Prata')
--   foto_produto   → URL da foto do produto (Tiny ERP)
--   observacao_erp → observação interna do ERP (editável pela equipe)
-- =============================================

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tipo_metal     TEXT,
  ADD COLUMN IF NOT EXISTS foto_produto   TEXT,
  ADD COLUMN IF NOT EXISTS observacao_erp TEXT;

-- Índice para filtro por tipo_metal (comum na listagem de produtos)
CREATE INDEX IF NOT EXISTS idx_produtos_tipo_metal
  ON public.produtos(tipo_metal)
  WHERE tipo_metal IS NOT NULL;

-- =============================================
-- VERIFICAÇÃO (rodar manualmente para conferir):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'produtos'
-- AND column_name IN ('tipo_metal', 'foto_produto', 'observacao_erp');
-- Esperado: 3 linhas
-- =============================================
