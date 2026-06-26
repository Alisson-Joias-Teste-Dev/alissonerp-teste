-- ============================================================================
-- Migration 317 — Parcelamento do crediário (Fase 2 — motor das parcelas)
-- Ver docs/regras-negocio/crediario.md (Situação ②: venda a prazo / parcelado).
--
-- O QUÊ: (1) pagamentos_venda ganha credi_tipo + credi_param pra guardar o plano
--   de parcelamento do "A Receber"; (2) fn_venda_gerar_conta_receber passa a
--   gerar N parcelas (uma conta a receber por parcela) na aprovação, em vez de 1.
--
-- POR QUÊ (regra de negócio, alinhada 19/06): venda a prazo pode ser parcelada
--   em meses (N parcelas no mesmo dia do mês, 1ª no mês seguinte) ou paga numa
--   única vez daqui a X dias. Cada parcela é uma conta a receber com seu
--   vencimento, pra a consultora cobrar e dar baixa no Crediário.
--
-- credi_tipo: 'meses' = N parcelas mensais | 'dias' = 1 pagamento futuro | NULL = sem plano (1 conta, compat Fase 1)
-- credi_param: se 'meses' = dia do vencimento (1-31, clampado ao último dia do mês);
--              se 'dias'  = quantos dias até o vencimento único.
-- O nº de parcelas vem da coluna 'parcelas' (já existente).
--
-- IMPACTO SE REMOVIDO: volta a 1 conta única sem calendário de parcelas.
-- BLINDAGEM: ADD COLUMN IF NOT EXISTS (nunca remove) + CREATE OR REPLACE.
--   Sem plano (credi_tipo NULL) → cai no ELSE = comportamento da Fase 1 (mig 316).
--   Guarda v_existe + guarda OLD.situacao continuam evitando duplicação.
-- ============================================================================

ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS credi_tipo  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS credi_param INTEGER;

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
  v_tipo         VARCHAR(10);
  v_param        INTEGER;
  v_nparc        INTEGER;
  v_valor_parc   NUMERIC;
  v_vi           NUMERIC;
  v_base         DATE;
  v_mes          DATE;
  v_ult          DATE;
  v_dia          INTEGER;
  v_venc         DATE;
  i              INTEGER;
BEGIN
  -- Dispara em 'aprovado' (fluxo novo) + confirmado/concluido/entregue (compat)
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

  -- Saldo em aberto = total − pagamentos confirmados (à vista/entrada já recebido)
  SELECT COALESCE(SUM(valor), 0) INTO v_pago
    FROM alissonerp.pagamentos_venda
   WHERE venda_id = NEW.id AND status = 'confirmado';
  v_aberto := NEW.total_venda - v_pago;

  -- Totalmente paga → nada a receber (a baixa 'pago' é feita pela fn_venda_criar_cr_quitada)
  IF v_aberto <= 0.01 THEN RETURN NEW; END IF;

  SELECT nome INTO v_cliente_nome
    FROM public.contatos WHERE id_contato = NEW.cliente_id;

  -- Plano de parcelamento (do pagamento "A Receber" pendente da venda)
  SELECT credi_tipo, credi_param, GREATEST(COALESCE(parcelas, 1), 1)
    INTO v_tipo, v_param, v_nparc
    FROM alissonerp.pagamentos_venda
   WHERE venda_id = NEW.id AND forma = 'A Receber' AND status = 'pendente'
   ORDER BY id LIMIT 1;

  IF v_tipo = 'meses' AND v_nparc >= 1 AND v_param BETWEEN 1 AND 31 THEN
    -- N parcelas mensais, mesmo dia do mês, 1ª no mês seguinte
    v_valor_parc := trunc(v_aberto / v_nparc, 2);
    v_base := date_trunc('month', CURRENT_DATE)::date;
    FOR i IN 1..v_nparc LOOP
      v_mes := (v_base + (i || ' month')::interval)::date;
      v_ult := (date_trunc('month', v_mes) + interval '1 month - 1 day')::date;
      v_dia := LEAST(v_param, EXTRACT(day FROM v_ult)::int);
      v_venc := make_date(EXTRACT(year FROM v_mes)::int, EXTRACT(month FROM v_mes)::int, v_dia);
      -- última parcela absorve a diferença de centavos do arredondamento
      v_vi := CASE WHEN i = v_nparc THEN v_aberto - v_valor_parc * (v_nparc - 1) ELSE v_valor_parc END;
      INSERT INTO alissonerp.contas_receber (
        descricao, cliente_id, cliente_nome, venda_erp_id, valor,
        data_vencimento, situacao, categoria, created_by
      ) VALUES (
        'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id) || ' - parcela ' || i || '/' || v_nparc,
        NEW.cliente_id, v_cliente_nome, NEW.id, v_vi,
        v_venc, 'pendente', 'venda', NEW.created_by
      );
    END LOOP;

  ELSIF v_tipo = 'dias' AND v_param >= 0 THEN
    -- Pagamento único daqui a v_param dias
    INSERT INTO alissonerp.contas_receber (
      descricao, cliente_id, cliente_nome, venda_erp_id, valor,
      data_vencimento, situacao, categoria, created_by
    ) VALUES (
      'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
      NEW.cliente_id, v_cliente_nome, NEW.id, v_aberto,
      (CURRENT_DATE + (v_param || ' day')::interval)::date, 'pendente', 'venda', NEW.created_by
    );

  ELSE
    -- Sem plano de parcelamento → 1 conta única (comportamento Fase 1, mig 316)
    INSERT INTO alissonerp.contas_receber (
      descricao, cliente_id, cliente_nome, venda_erp_id, valor,
      data_vencimento, situacao, categoria, created_by
    ) VALUES (
      'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
      NEW.cliente_id, v_cliente_nome, NEW.id, v_aberto,
      COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'), 'pendente', 'venda', NEW.created_by
    );
  END IF;

  RETURN NEW;
END;
$function$;
