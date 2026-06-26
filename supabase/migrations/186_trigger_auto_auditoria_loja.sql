-- 186_trigger_auto_auditoria_loja.sql
-- Trigger AFTER INSERT em alissonerp.ordens que cria e aprova automaticamente
-- a auditoria de loja para qualquer nova ordem de produção.
-- Elimina a necessidade de aprovação manual diária no ERP.

CREATE OR REPLACE FUNCTION alissonerp.fn_auto_auditoria_loja()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_audit_id INTEGER;
BEGIN
  -- Ignorar pedidos de teste
  IF NEW.eh_teste = TRUE THEN RETURN NEW; END IF;

  -- Ignorar se rota não definida (não há fluxo para acionar)
  IF NEW.rota IS NULL THEN RETURN NEW; END IF;

  -- Ignorar se já existe auditoria loja não-reprovada (evita duplicata quando
  -- o código da aplicação também criou a auditoria corretamente)
  IF EXISTS (
    SELECT 1 FROM alissonerp.auditorias
    WHERE ordem_id = NEW.id
      AND tipo_auditoria = 'loja'
      AND situacao != 'reprovado'
  ) THEN
    RETURN NEW;
  END IF;

  -- Criar auditoria como pendente
  INSERT INTO alissonerp.auditorias (
    situacao, tipo_auditoria, rota_processo, ordem_id,
    peso_negociado, parecer, dados_ordem
  )
  VALUES (
    'pendente', 'loja', 'entrada_ordem', NEW.id,
    COALESCE(NEW.peso_metal_negociado, 0),
    NULL,
    jsonb_build_object(
      'numero_ordem', NEW.numero_ordem,
      'tipo_ordem',   NEW.tipo_ordem::text,
      'rota',         NEW.rota::text,
      'origem',       'trigger_auto'
    )
  )
  RETURNING id INTO v_audit_id;

  -- Aprovar imediatamente — dispara fn_processar_auditoria (BEFORE UPDATE trigger)
  -- que: rota='pcp'       → cria saidas_ordem + pcp + seta em_andamento
  --      rota='protocolo' → mantém aguardando (liberado para protocolo)
  UPDATE alissonerp.auditorias
  SET situacao       = 'aprovado',
      data_conclusao = NOW(),
      parecer        = 'Aprovação automática — trigger'
  WHERE id = v_audit_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_auditoria_loja ON alissonerp.ordens;

CREATE TRIGGER trg_auto_auditoria_loja
  AFTER INSERT ON alissonerp.ordens
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_auto_auditoria_loja();
