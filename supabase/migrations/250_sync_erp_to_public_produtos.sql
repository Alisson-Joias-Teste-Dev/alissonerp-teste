-- ============================================================================
-- Migration 250 — Sincronização automática: erp_produtos → public.produtos
-- ============================================================================
-- Sempre que um produto for inserido/atualizado em alissonerp.erp_produtos,
-- o trigger:
--   1. Garante que exista em public.produtos
--   2. Garante que exista em estoque_comercial_config (ativo)
--
-- Assim, todo produto cadastrado no ERP aparece automaticamente nas views
-- de estoque com saldo 0 (até receber movimentações).
--
-- Regras:
--   INSERT → cria registro mínimo em public.produtos + config de estoque
--   UPDATE → atualiza sku, nome, situacao em public.produtos
--   DELETE → ignorado (não remove de public.produtos nem da config)
--
-- A trigger de precificação (atualizar_preco_produto_v2) roda BEFORE INSERT
-- e lida bem com campos NULL (só não calcula preço, sem erro).
-- ============================================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_sync_erp_to_public_produto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, public
AS $$
BEGIN
  -- 1. Garantir que o produto existe em public.produtos
  INSERT INTO public.produtos (id_produto, sku, nome, situacao, tipo, unidade)
  VALUES (
    NEW.produto_id,
    COALESCE(NEW.sku, ''),
    COALESCE(NEW.nome, ''),
    CASE WHEN NEW.ativo THEN 'A' ELSE 'I' END,
    'S',
    'UN'
  )
  ON CONFLICT (id_produto) DO UPDATE SET
    sku = CASE
      WHEN EXCLUDED.sku <> '' AND (public.produtos.sku IS NULL OR public.produtos.sku = '')
      THEN EXCLUDED.sku
      ELSE public.produtos.sku
    END,
    nome = CASE
      WHEN EXCLUDED.nome IS NOT NULL AND (public.produtos.nome IS NULL OR public.produtos.nome = '')
      THEN EXCLUDED.nome
      ELSE public.produtos.nome
    END,
    situacao = CASE WHEN NEW.ativo THEN 'A' ELSE 'I' END;

  -- 2. Garantir que o produto tem config de estoque ativa (saldo 0 até movimentar)
  INSERT INTO alissonerp.estoque_comercial_config (produto_id, estoque_minimo, ativo)
  VALUES (NEW.produto_id, 0, true)
  ON CONFLICT (produto_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_erp_to_public_produto ON alissonerp.erp_produtos;

CREATE TRIGGER trg_sync_erp_to_public_produto
  AFTER INSERT OR UPDATE ON alissonerp.erp_produtos
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_sync_erp_to_public_produto();

-- ============================================================================
-- Fim migration 250
-- ============================================================================
