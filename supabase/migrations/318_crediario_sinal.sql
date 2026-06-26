-- ============================================================================
-- Migration 318 — Sinal pra segurar peça (Fase 3 — motor do sinal)
-- Ver docs/regras-negocio/crediario.md (Situação ③: sinal/reserva).
--
-- O QUÊ: (1) pagamentos_venda ganha credi_vencimento (data já calculada, p/ casos
--   que precisam de dias úteis com feriados — calculado no TS). (2) vale_troca
--   ganha origem + origem_venda_id (pra rastrear o vale VC- de venda não paga).
--   (3) fn_venda_gerar_conta_receber ganha o ramo credi_tipo='sinal': gera 1 conta
--   a receber (saldo a pagar) com vencimento em 7 dias úteis.
--
-- POR QUÊ (regra de negócio): no sinal, o cliente paga uma entrada e a peça fica
--   RESERVADA (não sai). Tem 7 dias úteis pra pagar o restante. Não pagou → o
--   robô (Fase 3b) vira o sinal em vale VC- e devolve a peça ao estoque.
--
-- credi_vencimento: se preenchido (TS, com feriados de Fortaleza via dias-uteis.ts),
--   o trigger usa essa data; senão calcula 7 dias úteis via fn_adicionar_dias_uteis
--   (sem feriados — refinamento: preferir o cálculo do TS).
--
-- BLINDAGEM: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE. Ramos meses/dias/else
--   inalterados (Fases 1 e 2). Guardas de duplicação intactas.
-- ============================================================================

ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS credi_vencimento DATE;

ALTER TABLE alissonerp.vale_troca
  ADD COLUMN IF NOT EXISTS origem          VARCHAR(20),
  ADD COLUMN IF NOT EXISTS origem_venda_id INTEGER;

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
  v_venc_sinal   DATE;
  v_valor_parc   NUMERIC;
  v_vi           NUMERIC;
  v_base         DATE;
  v_mes          DATE;
  v_ult          DATE;
  v_dia          INTEGER;
  v_venc         DATE;
  i              INTEGER;
BEGIN
  IF NEW.situacao NOT IN ('aprovado', 'confirmado', 'concluido', 'entregue') THEN
    RETURN NEW;
  END IF;
  IF OLD.situacao IN ('aprovado', 'confirmado', 'concluido', 'entregue') THEN
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

  SELECT credi_tipo, credi_param, GREATEST(COALESCE(parcelas, 1), 1), credi_vencimento
    INTO v_tipo, v_param, v_nparc, v_venc_sinal
    FROM alissonerp.pagamentos_venda
   WHERE venda_id = NEW.id AND forma = 'A Receber' AND status = 'pendente'
   ORDER BY id LIMIT 1;

  IF v_tipo = 'sinal' THEN
    -- Sinal pra segurar: 1 conta (saldo a pagar), vencimento em 7 dias úteis.
    -- Usa a data já calculada no TS (com feriados) se houver; senão 7 dias úteis SQL.
    INSERT INTO alissonerp.contas_receber (
      descricao, cliente_id, cliente_nome, venda_erp_id, valor,
      data_vencimento, situacao, categoria, created_by
    ) VALUES (
      'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id) || ' - sinal (saldo a pagar)',
      NEW.cliente_id, v_cliente_nome, NEW.id, v_aberto,
      COALESCE(v_venc_sinal, alissonerp.fn_adicionar_dias_uteis(CURRENT_DATE, 7)),
      'pendente', 'venda', NEW.created_by
    );

  ELSIF v_tipo = 'meses' AND v_nparc >= 1 AND v_param BETWEEN 1 AND 31 THEN
    v_valor_parc := trunc(v_aberto / v_nparc, 2);
    v_base := date_trunc('month', CURRENT_DATE)::date;
    FOR i IN 1..v_nparc LOOP
      v_mes := (v_base + (i || ' month')::interval)::date;
      v_ult := (date_trunc('month', v_mes) + interval '1 month - 1 day')::date;
      v_dia := LEAST(v_param, EXTRACT(day FROM v_ult)::int);
      v_venc := make_date(EXTRACT(year FROM v_mes)::int, EXTRACT(month FROM v_mes)::int, v_dia);
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
    INSERT INTO alissonerp.contas_receber (
      descricao, cliente_id, cliente_nome, venda_erp_id, valor,
      data_vencimento, situacao, categoria, created_by
    ) VALUES (
      'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
      NEW.cliente_id, v_cliente_nome, NEW.id, v_aberto,
      (CURRENT_DATE + (v_param || ' day')::interval)::date, 'pendente', 'venda', NEW.created_by
    );

  ELSE
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
