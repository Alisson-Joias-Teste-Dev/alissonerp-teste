SET search_path TO alissonerp, public;

-- Corrige trigger de cancelamento de PCP: troca de status (enum sem 'cancelado')
-- para situacao (enum com 'cancelado'). O trigger original da migration 188
-- nunca poderia disparar porque enum_status_ordem nao inclui 'cancelado'.

DROP TRIGGER IF EXISTS trg_cancelar_pcp_ordem ON alissonerp.ordens;

CREATE OR REPLACE FUNCTION alissonerp.fn_cancelar_pcp_ordem()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.situacao::text = 'cancelado' AND OLD.situacao::text != 'cancelado' THEN
    UPDATE alissonerp.pcp
    SET etapas = 'cancelado', bloqueado = true
    WHERE ordem_id = NEW.id
      AND etapas::text != 'cancelado';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cancelar_pcp_ordem
  AFTER UPDATE OF situacao ON alissonerp.ordens
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_cancelar_pcp_ordem();

-- Colunas de auditoria para cancelamento
ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS cancelado_por UUID REFERENCES alissonerp.usuarios(id),
  ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMPTZ;
