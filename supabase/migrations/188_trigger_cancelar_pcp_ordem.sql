-- 188_trigger_cancelar_pcp_ordem.sql
-- Trigger AFTER UPDATE em ordens: quando status muda para 'cancelado',
-- cancela automaticamente o registro PCP vinculado (etapas='cancelado', bloqueado=true).

CREATE OR REPLACE FUNCTION alissonerp.fn_cancelar_pcp_ordem()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status::text = 'cancelado' AND OLD.status::text != 'cancelado' THEN
    UPDATE alissonerp.pcp
    SET etapas = 'cancelado', bloqueado = true
    WHERE ordem_id = NEW.id
      AND etapas::text != 'cancelado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cancelar_pcp_ordem ON alissonerp.ordens;

CREATE TRIGGER trg_cancelar_pcp_ordem
  AFTER UPDATE OF status ON alissonerp.ordens
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_cancelar_pcp_ordem();
