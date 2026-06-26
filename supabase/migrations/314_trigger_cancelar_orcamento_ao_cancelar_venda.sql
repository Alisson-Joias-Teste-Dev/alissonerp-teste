-- 314_trigger_cancelar_orcamento_ao_cancelar_venda.sql
--
-- REGRA DE NEGÓCIO (Jonathan 18/06/2026 — B9, na profundidade certa):
--   O QUÊ: quando uma venda passa para situacao='cancelado', o orçamento de origem
--          (vendas_erp.orcamento_id) também é cancelado (orcamentos.status='cancelado').
--   POR QUÊ: senão o orçamento fica 'convertido' apontando pra uma venda morta, e a
--            trava de venda-única (mig 312) impede reaproveitá-lo. Antes isso era feito
--            SÓ na rota POST /api/vendas/[id]/cancelar — mas há OUTRAS rotas que cancelam
--            venda (PATCH /api/vendas/[id] com situacao=cancelado; solicitações de
--            alteração) que não tratavam. Um gatilho no banco pega TODAS as rotas + SQL
--            manual. Mesmo padrão do trg_cancelar_pcp_ordem (cancela a ordem do PCP ao
--            cancelar a venda).
--   IMPACTO SE REMOVIDO: volta a depender de cada rota lembrar de cancelar o orçamento.
--
-- 'cancelado' é status válido de orcamentos desde a migration 313 (pré-requisito).
-- NÃO está em zona no-touch (CLAUDE.md §2). Usa CREATE OR REPLACE (função e trigger —
-- PG 14+) → sem DROP, idempotente e re-executável.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_cancelar_orcamento_ao_cancelar_venda ON alissonerp.vendas_erp;
--   DROP FUNCTION IF EXISTS alissonerp.fn_cancelar_orcamento_ao_cancelar_venda();

BEGIN;

CREATE OR REPLACE FUNCTION alissonerp.fn_cancelar_orcamento_ao_cancelar_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'alissonerp', 'public'
AS $function$
BEGIN
  -- Só age quando a venda ACABOU de virar 'cancelado' e veio de um orçamento.
  -- (1 orçamento = no máx 1 venda pelo índice único uq_vendas_erp_orcamento, mig 312.)
  IF NEW.situacao = 'cancelado'
     AND NEW.situacao IS DISTINCT FROM OLD.situacao
     AND NEW.orcamento_id IS NOT NULL THEN
    UPDATE alissonerp.orcamentos
      SET status = 'cancelado', updated_at = NOW()
      WHERE id = NEW.orcamento_id
        AND status IS DISTINCT FROM 'cancelado';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER trg_cancelar_orcamento_ao_cancelar_venda
  AFTER UPDATE OF situacao ON alissonerp.vendas_erp
  FOR EACH ROW
  WHEN (NEW.situacao = 'cancelado')
  EXECUTE FUNCTION alissonerp.fn_cancelar_orcamento_ao_cancelar_venda();

COMMIT;
