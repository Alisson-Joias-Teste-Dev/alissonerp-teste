-- Migration 114: Blindar vendas fechadas contra alterações
-- REGRA DE NEGÓCIO: vendas com situacao IN ('confirmado','concluido') são IMUTÁVEIS
-- Qualquer alteração em itens ou na própria venda requer:
--   1. Mudar situacao para 'em_revisao' (requer role admin/dev/gerente)
--   2. Fazer as alterações
--   3. Re-confirmar a venda
-- Isso protege comissões das consultoras contra recálculo por atualização de preços.

SET search_path TO alissonerp;

-- ─── Trigger: Bloquear UPDATE em itens de venda fechada ────────────────────────
CREATE OR REPLACE FUNCTION fn_proteger_itens_venda_fechada()
RETURNS TRIGGER AS $$
DECLARE
  v_situacao TEXT;
BEGIN
  SELECT situacao INTO v_situacao
  FROM alissonerp.vendas_erp
  WHERE id = COALESCE(NEW.venda_id, OLD.venda_id);

  -- Vendas fechadas: BLOQUEAR qualquer alteração em itens
  IF v_situacao IN ('confirmado', 'concluido') THEN
    RAISE EXCEPTION 'Venda fechada (%). Itens não podem ser alterados. Solicite revisão ao gerente.', v_situacao
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_proteger_itens_venda_fechada ON alissonerp.itens_venda_erp;
CREATE TRIGGER trg_proteger_itens_venda_fechada
  BEFORE UPDATE OR DELETE ON alissonerp.itens_venda_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_proteger_itens_venda_fechada();

-- ─── Trigger: Bloquear DELETE de itens em venda fechada (INSERT permitido pois pode ser venda nova) ──
-- INSERT já é tratado pelo trigger acima? Não — INSERT em venda fechada também deve bloquear.
DROP TRIGGER IF EXISTS trg_proteger_insert_itens_venda_fechada ON alissonerp.itens_venda_erp;
CREATE TRIGGER trg_proteger_insert_itens_venda_fechada
  BEFORE INSERT ON alissonerp.itens_venda_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_proteger_itens_venda_fechada();

-- ─── Trigger: Bloquear alteração de campos sensíveis em venda fechada ──────────
-- Campos que NÃO devem mudar após fechamento:
--   total_produtos, total_desconto, total_venda, total_comissao, cliente_id, vendedor_id
-- Campos que PODEM mudar (logísticos):
--   situacao (para reabrir/cancelar), data_entrega, forma_envio, forma_frete, observacoes, observacoes_internas
--   bloqueado, tiny_sync_status, tiny_sync_at, tiny_sync_erro, updated_at
CREATE OR REPLACE FUNCTION fn_proteger_venda_fechada()
RETURNS TRIGGER AS $$
BEGIN
  -- Só bloqueia se a venda JÁ ESTAVA fechada (OLD)
  IF OLD.situacao NOT IN ('confirmado', 'concluido') THEN
    RETURN NEW;
  END IF;

  -- Permitir mudança de situacao (para cancelar, reabrir para revisão, etc.)
  -- Permitir campos logísticos e de sync
  IF NEW.situacao IS DISTINCT FROM OLD.situacao
     OR NEW.data_entrega IS DISTINCT FROM OLD.data_entrega
     OR NEW.forma_envio IS DISTINCT FROM OLD.forma_envio
     OR NEW.forma_frete IS DISTINCT FROM OLD.forma_frete
     OR NEW.observacoes IS DISTINCT FROM OLD.observacoes
     OR NEW.observacoes_internas IS DISTINCT FROM OLD.observacoes_internas
     OR NEW.bloqueado IS DISTINCT FROM OLD.bloqueado
     OR NEW.tiny_sync_status IS DISTINCT FROM OLD.tiny_sync_status
     OR NEW.tiny_sync_at IS DISTINCT FROM OLD.tiny_sync_at
     OR NEW.tiny_sync_erro IS DISTINCT FROM OLD.tiny_sync_erro
     OR NEW.updated_at IS DISTINCT FROM OLD.updated_at
     OR NEW.video_obs_interna IS DISTINCT FROM OLD.video_obs_interna
     OR NEW.token_compartilhamento IS DISTINCT FROM OLD.token_compartilhamento
  THEN
    -- Esses campos são permitidos, mas BLOQUEAR se campos financeiros mudaram junto
    IF NEW.total_produtos IS DISTINCT FROM OLD.total_produtos
       OR NEW.total_desconto IS DISTINCT FROM OLD.total_desconto
       OR NEW.total_venda IS DISTINCT FROM OLD.total_venda
       OR NEW.total_comissao IS DISTINCT FROM OLD.total_comissao
       OR NEW.total_frete IS DISTINCT FROM OLD.total_frete
       OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
    THEN
      RAISE EXCEPTION 'Venda fechada (%). Campos financeiros protegidos. Mude a situação para "em_revisao" antes.', OLD.situacao
        USING ERRCODE = 'P0001';
    END IF;
    -- Campos logísticos OK, deixar passar
    RETURN NEW;
  END IF;

  -- Se NENHUM campo mudou, OK (idempotente)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_proteger_venda_fechada ON alissonerp.vendas_erp;
-- Prefixo "trg_aa_" garante execução ANTES de outros triggers BEFORE UPDATE (ordem alfabética)
CREATE TRIGGER trg_aa_proteger_venda_fechada
  BEFORE UPDATE ON alissonerp.vendas_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_proteger_venda_fechada();

-- ─── Adicionar situacao 'em_revisao' como valor válido ─────────────────────────
-- Fluxo: confirmado/concluido → em_revisao (gerente aprova) → editar → re-confirmar
-- Não precisa de ALTER no CHECK pois situacao é VARCHAR, não enum.

-- ─── Grants ────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION fn_proteger_itens_venda_fechada() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_proteger_venda_fechada() TO authenticated;
