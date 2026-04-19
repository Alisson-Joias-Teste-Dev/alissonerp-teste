-- Migration 116: Blindar public.itens_venda contra alteração de preços/comissões
--
-- PROBLEMA: Atualizações de preço de produto (via n8n ou outro processo) estavam
-- cascateando para itens de vendas JÁ FECHADAS, alterando preco_tabela,
-- desconto_percentual e comissao — causando prejuízo nas comissões das consultoras.
--
-- SOLUÇÃO: Trigger que BLOQUEIA UPDATE nos campos financeiros de itens de venda.
-- Campos protegidos: preco_tabela, preco_unitario_final, preco_total,
--                    desconto_percentual, desconto_valor, comissao_percentual, comissao_valor
-- Campos permitidos: n8n (flag de sync), quantidade (ajuste logístico)
--
-- Para correções manuais: DISABLE TRIGGER antes, corrigir, ENABLE TRIGGER depois.

-- ─── Trigger: Bloquear alteração de preços em itens de venda ───────────────────
CREATE OR REPLACE FUNCTION public.fn_proteger_preco_itens_venda()
RETURNS TRIGGER AS $$
BEGIN
  -- Se NENHUM campo financeiro mudou, deixar passar (permite update de outros campos)
  IF NEW.preco_tabela IS NOT DISTINCT FROM OLD.preco_tabela
     AND NEW.preco_unitario_final IS NOT DISTINCT FROM OLD.preco_unitario_final
     AND NEW.preco_total IS NOT DISTINCT FROM OLD.preco_total
     AND NEW.desconto_percentual IS NOT DISTINCT FROM OLD.desconto_percentual
     AND NEW.desconto_valor IS NOT DISTINCT FROM OLD.desconto_valor
     AND NEW.comissao_percentual IS NOT DISTINCT FROM OLD.comissao_percentual
     AND NEW.comissao_valor IS NOT DISTINCT FROM OLD.comissao_valor
  THEN
    RETURN NEW;
  END IF;

  -- Campos financeiros mudaram → BLOQUEAR
  RAISE EXCEPTION 'Itens de venda protegidos. Preços e comissões não podem ser alterados após a criação. Contate o administrador.'
    USING ERRCODE = 'P0001';

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_proteger_preco_itens_venda ON public.itens_venda;
CREATE TRIGGER trg_proteger_preco_itens_venda
  BEFORE UPDATE ON public.itens_venda
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_proteger_preco_itens_venda();

-- ─── Bloquear DELETE de itens (não pode remover item de venda existente) ────────
CREATE OR REPLACE FUNCTION public.fn_proteger_delete_itens_venda()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Itens de venda não podem ser removidos. Contate o administrador.'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_proteger_delete_itens_venda ON public.itens_venda;
CREATE TRIGGER trg_proteger_delete_itens_venda
  BEFORE DELETE ON public.itens_venda
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_proteger_delete_itens_venda();
