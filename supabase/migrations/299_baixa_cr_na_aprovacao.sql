-- ============================================================
-- Migration 299 — Baixa da conta a receber também na APROVAÇÃO (2026-06-12)
--
-- REGRA DE NEGÓCIO:
-- O QUE: a regra "pagou → conta a receber criada JÁ paga" (migration 297) só
--   disparava quando um PAGAMENTO era confirmado. Mas no PDV o fluxo normal é
--   lançar o pagamento (ex.: Dinheiro, auto-confirmado) ENQUANTO a venda ainda
--   é RASCUNHO, e só DEPOIS aprovar. Como o gatilho 297 ignora venda em rascunho,
--   a baixa não acontecia; e a aprovação não re-disparava nada. Resultado: venda
--   totalmente paga ficava com conta a receber 'pendente' (criada só na entrega
--   pelo gatilho 296).
-- POR QUE: decisão do Jonathan (Etapa 2.1) — "pago na venda já baixa". Venda
--   paga tem que mostrar recebido, não pendente.
-- COMO: extrai a lógica num helper fn_venda_criar_cr_quitada(venda_id) e dispara
--   também na mudança de situacao da venda (ao sair de rascunho → aprovado etc.).
-- IMPACTO SE REMOVIDO: volta o bug — venda paga no PDV fica com a receber pendente.
--
-- Cobertura final dos disparos da baixa:
--   • pagamento confirmado (297, em pagamentos_venda) → paga DEPOIS de aprovar
--   • situacao sai de rascunho   (299, em vendas_erp)  → pagou ANTES de aprovar (PDV)
--   Ambos idempotentes (não duplicam: só criam se não há CR ativa e está quitada).
--
-- Database Safety §2: CREATE OR REPLACE + ADD TRIGGER. Sem DROP de dados.
-- ============================================================

SET search_path TO alissonerp, directus, public;

-- ──────────────────────────────────────────────────────────────
-- Helper compartilhado: cria a conta a receber JÁ paga se a venda
-- (não rascunho/cancelado) está quitada e ainda não tem CR ativa.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_criar_cr_quitada(p_venda_id INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_venda        RECORD;
  v_soma         NUMERIC;
  v_existe       BOOLEAN;
  v_cliente_nome TEXT;
BEGIN
  SELECT id, situacao, total_venda, cliente_id, numero_venda, data_entrega, created_by
    INTO v_venda
    FROM alissonerp.vendas_erp
   WHERE id = p_venda_id;
  IF v_venda IS NULL THEN RETURN; END IF;

  -- Só baixa de venda aprovada em diante
  IF v_venda.situacao IN ('rascunho', 'cancelado') THEN RETURN; END IF;

  -- Não duplica: ignora se já há conta a receber ativa (cancelada não conta)
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber
    WHERE venda_erp_id = p_venda_id AND situacao <> 'cancelado'
  ) INTO v_existe;
  IF v_existe THEN RETURN; END IF;

  -- Precisa estar quitada (tolerância de 1 centavo)
  SELECT COALESCE(SUM(valor), 0) INTO v_soma
    FROM alissonerp.pagamentos_venda
   WHERE venda_id = p_venda_id AND status = 'confirmado';
  IF v_soma + 0.01 < v_venda.total_venda THEN RETURN; END IF;

  SELECT nome INTO v_cliente_nome
    FROM public.contatos WHERE id_contato = v_venda.cliente_id;

  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, data_recebimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(v_venda.numero_venda, '#' || v_venda.id),
    v_venda.cliente_id, v_cliente_nome, v_venda.id, v_venda.total_venda,
    COALESCE(v_venda.data_entrega, CURRENT_DATE), CURRENT_DATE, 'pago', 'venda', v_venda.created_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION alissonerp.fn_venda_criar_cr_quitada(INTEGER) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- Gatilho 297 (em pagamentos_venda) agora delega ao helper
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_baixar_recebimento_pago()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
BEGIN
  IF NEW.status = 'confirmado' THEN
    PERFORM alissonerp.fn_venda_criar_cr_quitada(NEW.venda_id);
  END IF;
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- NOVO gatilho (em vendas_erp): dispara a baixa quando a venda muda
-- de status (cobre o caso "pagou ANTES de aprovar" — fluxo do PDV)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_baixar_recebimento_aprovacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
BEGIN
  -- Só quando a situacao muda e a venda saiu do rascunho/cancelado.
  IF NEW.situacao IS DISTINCT FROM OLD.situacao
     AND NEW.situacao NOT IN ('rascunho', 'cancelado') THEN
    PERFORM alissonerp.fn_venda_criar_cr_quitada(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION alissonerp.fn_venda_baixar_recebimento_aprovacao() TO authenticated;

DROP TRIGGER IF EXISTS trg_venda_baixar_recebimento_aprovacao ON alissonerp.vendas_erp;
CREATE TRIGGER trg_venda_baixar_recebimento_aprovacao
  AFTER UPDATE OF situacao ON alissonerp.vendas_erp
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_venda_baixar_recebimento_aprovacao();

-- ============================================================
-- Fim migration 299
-- ============================================================
