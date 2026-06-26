-- ============================================================================
-- Migration 167 — Corrigir trigger public.atualizar_preco_produto
-- ============================================================================
-- BUG: a funcao antiga public.atualizar_preco_produto() usa
-- `LOWER(NEW.tipo_metal) = 'ouro'` — nao reconhece "Ouro Amarelo 18k"
-- (9.664 produtos afetados). Resultado: preco_sync NULL para quase todo
-- o catalogo, mesmo quando peso/markup/fator estao OK.
--
-- CORRECAO: trocar o trigger para apontar para a funcao
-- alissonerp.atualizar_preco_produto_v2() que JA EXISTE no DB e usa
-- `LIKE '%ouro%'` + fator default 1.
--
-- A funcao v2 foi criada para sanar este bug mas nao foi ligada ao trigger.
-- Aqui apenas corrigimos esse link.
--
-- Seguro: DROP + CREATE do trigger apenas. A funcao antiga continua existindo
-- (caso algum outro lugar use — improvavel).
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_atualizar_preco_produto ON public.produtos;

CREATE TRIGGER trigger_atualizar_preco_produto
  BEFORE INSERT OR UPDATE ON public.produtos
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.atualizar_preco_produto_v2();

-- ============================================================================
-- Fim migration 167
-- ============================================================================
