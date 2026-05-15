-- =============================================
-- MIGRATION 062: Campos de medidas do produto (ficha técnica) em public.produtos
-- Contexto: campos fixos do produto, não do BOM.
-- SÓ adicionamos colunas — NUNCA alterar triggers existentes.
--
-- largura_aro → largura interna do aro em mm
-- altura_aro  → altura do aro em mm (espessura vertical)
-- base        → espessura da base em mm
-- =============================================

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS largura_aro NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS altura_aro  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS base        NUMERIC(10,2);

-- =============================================
-- VERIFICAÇÃO:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'produtos'
-- AND column_name IN ('largura_aro', 'altura_aro', 'base');
-- Esperado: 3 linhas
-- =============================================
