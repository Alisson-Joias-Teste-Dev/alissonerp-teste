-- =============================================
-- MIGRATION 055: Adicionar campos de pedra em public.produtos
-- CONTEXTO: public.produtos tem 14.812 registros e triggers de precificação INTOCÁVEIS.
-- SÓ adicionamos colunas novas — NUNCA alterar triggers existentes.
--
-- Colunas adicionadas:
--   tem_pedra_preciosa  → flag para filtrar/calcular custo de pedras
--   preco_pedras        → custo total das pedras calculado via BOM (fase 2)
--   preco_total_sync    → preco_sync (ouro) + preco_pedras (futuro campo unificado)
--
-- NOTA FONTE DE VERDADE:
--   public.parametros.ouro = 857.019 R$/g → usado pelo trigger de precificação (IMUTÁVEL)
--   alissonerp.parametros.cotacao_ouro = 398.72 → informativo para o ERP
-- =============================================

-- 1. Adicionar colunas (idempotente via IF NOT EXISTS)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS tem_pedra_preciosa BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS preco_pedras       NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_total_sync   NUMERIC(10,2);

-- 2. Popular tem_pedra_preciosa para produtos que já têm tipo_de_pedra definido
--    (pedras reais; excluir 'Sem pedra', 'Não se aplica', null, dados sujos)
UPDATE public.produtos
SET tem_pedra_preciosa = true
WHERE tipo_de_pedra IS NOT NULL
  AND tipo_de_pedra NOT IN ('Sem pedra', 'Não se aplica', '')
  AND tipo_de_pedra ~ '^[A-Za-zÀ-ú]'  -- exclui dados numéricos sujos (ex: "4")
  AND tem_pedra_preciosa = false;

-- 3. Popular preco_total_sync com preco_sync atual (ouro) para todos os produtos
--    que já têm preço calculado — base inicial, sem pedras ainda
UPDATE public.produtos
SET preco_total_sync = preco_sync
WHERE preco_sync IS NOT NULL
  AND preco_total_sync IS NULL;

-- 4. Índice para queries de filtro por pedra
CREATE INDEX IF NOT EXISTS idx_produtos_tem_pedra
  ON public.produtos(tem_pedra_preciosa)
  WHERE tem_pedra_preciosa = true;

-- =============================================
-- VERIFICAÇÃO (rodar manualmente para conferir):
-- SELECT count(*) FILTER (WHERE tem_pedra_preciosa) as com_pedra,
--        count(*) FILTER (WHERE NOT tem_pedra_preciosa) as sem_pedra
-- FROM public.produtos;
-- Esperado: ~1138 com_pedra (Diamante+Zircônia+Moissanite+Ônix+Espinélio)
-- =============================================
