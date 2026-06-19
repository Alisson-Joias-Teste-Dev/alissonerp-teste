-- ============================================================================
-- Migration 316 — Conta a receber NASCE NA APROVAÇÃO da venda
-- Redesenho do crediário (planejado com Jonathan em 19/06/2026).
-- Ver docs/regras-negocio/crediario.md (Fase 1 — fundação / porta única).
--
-- O QUÊ: a função fn_venda_gerar_conta_receber passa a disparar também quando a
--   venda entra em 'aprovado'. Antes só disparava em confirmado/concluido/entregue
--   (ou seja, a conta a receber só nascia na ENTREGA).
--
-- POR QUÊ (regra de negócio): hoje, entre a aprovação e a entrega (que pode levar
--   dias), o "A Receber" da venda existia só como pagamento_venda pendente, sem
--   conta a receber. Se alguém confirmava esse pagamento pela tela da venda antes
--   da entrega, o saldo zerava e na entrega a conta NUNCA era criada = "recebimento
--   fantasma" (some do crediário; dessincronia entre pagamentos_venda e
--   contas_receber). Fazendo a conta nascer já na aprovação, o crédito fica
--   rastreável desde o início e a baixa passa a ter PORTA ÚNICA (a tela do crediário).
--
-- IMPACTO SE REMOVIDO/ALTERADO: volta o recebimento fantasma e a dessincronia;
--   vendas a prazo aprovadas mas não entregues somem do controle do crediário.
--
-- BLINDAGEM: CREATE OR REPLACE (sem DROP). NÃO duplica conta a receber porque:
--   (1) a guarda v_existe ignora se já há conta ativa (não cancelada);
--   (2) a guarda OLD.situacao impede recriar quando a venda já passou por aprovado;
--   (3) ordem dos triggers: trg_venda_baixar_recebimento_aprovacao (cria a CR
--       'pago' do que foi QUITADO) roda ANTES de trg_venda_gerar_conta_receber
--       (cria a CR 'pendente' do SALDO ABERTO) — alfabético baixar < gerar.
--   Venda quitada → a "quitada" cria 'pago' e esta retorna por v_existe/v_aberto<=0.
--   Venda com saldo → só esta cria a 'pendente'.
-- ============================================================================

CREATE OR REPLACE FUNCTION alissonerp.fn_venda_gerar_conta_receber()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $function$
DECLARE
  v_cliente_nome TEXT;
  v_existe       BOOLEAN;
  v_pago         NUMERIC;
  v_aberto       NUMERIC;
BEGIN
  -- Dispara em 'aprovado' (fluxo novo 06/2026) + confirmado/concluido/entregue (compat histórica)
  IF NEW.situacao NOT IN ('aprovado', 'confirmado', 'concluido', 'entregue') THEN
    RETURN NEW;
  END IF;
  IF OLD.situacao IN ('aprovado', 'confirmado', 'concluido', 'entregue') THEN
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

  -- Totalmente paga → nada a receber (a baixa 'pago' é feita pela fn_venda_criar_cr_quitada)
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
$function$;
