-- ============================================================
-- Migration 300 — Conta a receber = SALDO EM ABERTO (2026-06-12)
--
-- REGRA DE NEGÓCIO:
-- O QUE: a conta a receber criada quando a venda fecha/entrega passa a ter o
--   valor do SALDO EM ABERTO (total da venda − pagamentos já confirmados à
--   vista), não o valor cheio da venda.
-- POR QUE: decisão do Jonathan (12/06) — numa venda mista (ex.: R$200 = R$120
--   dinheiro + R$80 a receber), o cliente só DEVE R$80. Antes a conta a receber
--   nascia com R$200, inflando o "a receber" do financeiro (os R$120 já estavam
--   no caixa). Achado na verificação proativa pós-bug do PDV.
-- IMPACTO SE REMOVIDO: volta a inflar a receber com a parte já paga à vista.
--
-- Convivência com a baixa automática:
--   • Venda TOTALMENTE paga → fn_venda_criar_cr_quitada (299) cria a CR como
--     'pago' (valor cheio). Aqui o saldo aberto é 0 → não cria nada.
--   • Venda PARCIAL/só a receber → esta função cria a CR 'pendente' só do aberto.
--   Guard de duplicata por venda_erp_id (CR cancelada não conta).
--
-- Database Safety §2: CREATE OR REPLACE. Sem DROP de dados.
-- ============================================================

SET search_path TO alissonerp, directus, public;

-- ──────────────────────────────────────────────────────────────
-- Gatilho de UPDATE (venda → confirmado/concluido/entregue)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_gerar_conta_receber()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_nome TEXT;
  v_existe       BOOLEAN;
  v_pago         NUMERIC;
  v_aberto       NUMERIC;
BEGIN
  -- Dispara em entregue (fluxo novo) + confirmado/concluido (compat histórica)
  IF NEW.situacao NOT IN ('confirmado', 'concluido', 'entregue') THEN
    RETURN NEW;
  END IF;
  IF OLD.situacao IN ('confirmado', 'concluido', 'entregue') THEN
    RETURN NEW;
  END IF;

  -- Não duplica: ignora se já há conta a receber ativa (cancelada não conta)
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber
    WHERE venda_erp_id = NEW.id AND situacao <> 'cancelado'
  ) INTO v_existe;
  IF v_existe THEN RETURN NEW; END IF;

  -- Saldo em aberto = total − pagamentos confirmados (à vista já recebido)
  SELECT COALESCE(SUM(valor), 0) INTO v_pago
    FROM alissonerp.pagamentos_venda
   WHERE venda_id = NEW.id AND status = 'confirmado';
  v_aberto := NEW.total_venda - v_pago;

  -- Totalmente paga → nada a receber (a baixa 'pago' é feita pelo 299)
  IF v_aberto <= 0.01 THEN RETURN NEW; END IF;

  SELECT nome INTO v_cliente_nome
    FROM public.contatos WHERE id_contato = NEW.cliente_id;

  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
    NEW.cliente_id, v_cliente_nome, NEW.id, v_aberto,
    COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'),
    'pendente', 'venda', NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- Gatilho de INSERT (venda já nasce confirmado/concluido — legado)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_gerar_conta_receber_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_nome TEXT;
  v_existe       BOOLEAN;
  v_pago         NUMERIC;
  v_aberto       NUMERIC;
BEGIN
  IF NEW.situacao NOT IN ('confirmado', 'concluido') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber
    WHERE venda_erp_id = NEW.id AND situacao <> 'cancelado'
  ) INTO v_existe;
  IF v_existe THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(valor), 0) INTO v_pago
    FROM alissonerp.pagamentos_venda
   WHERE venda_id = NEW.id AND status = 'confirmado';
  v_aberto := NEW.total_venda - v_pago;
  IF v_aberto <= 0.01 THEN RETURN NEW; END IF;

  SELECT nome INTO v_cliente_nome
    FROM public.contatos WHERE id_contato = NEW.cliente_id;

  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
    NEW.cliente_id, v_cliente_nome, NEW.id, v_aberto,
    COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'),
    'pendente', 'venda', NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Fim migration 300
-- ============================================================
