-- Migration 113: Triggers financeiros automáticos
-- Venda confirmada/concluída → auto-cria conta a receber
-- Compra concluída → auto-cria conta a pagar
-- Venda cancelada → cancela conta a receber vinculada

SET search_path TO alissonerp;

-- ─── FK: contas_receber precisa de referência a vendas_erp ─────────────────────
ALTER TABLE alissonerp.contas_receber
  ADD COLUMN IF NOT EXISTS venda_erp_id INTEGER REFERENCES alissonerp.vendas_erp(id);

-- ─── Adicionar coluna fornecedor_nome e cliente_nome para exibição ─────────────
ALTER TABLE alissonerp.contas_pagar
  ADD COLUMN IF NOT EXISTS fornecedor_nome TEXT;

ALTER TABLE alissonerp.contas_receber
  ADD COLUMN IF NOT EXISTS cliente_nome TEXT;

-- ─── Trigger: venda → conta a receber ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_venda_gerar_conta_receber()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_nome TEXT;
  v_existe BOOLEAN;
BEGIN
  -- Só executa se situação mudou para confirmado ou concluido
  IF NEW.situacao NOT IN ('confirmado', 'concluido') THEN
    RETURN NEW;
  END IF;

  -- Não reprocessar se já era confirmado/concluido
  IF OLD.situacao IN ('confirmado', 'concluido') THEN
    RETURN NEW;
  END IF;

  -- Verificar se já existe conta_receber para esta venda (guard duplicata)
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber WHERE venda_erp_id = NEW.id
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do cliente
  SELECT nome INTO v_cliente_nome
  FROM public.contatos WHERE id_contato = NEW.cliente_id;

  -- Criar conta a receber
  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
    NEW.cliente_id,
    v_cliente_nome,
    NEW.id,
    NEW.total_venda,
    COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'),
    'pendente',
    'venda',
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Trigger: cancelamento de venda → cancela conta a receber ──────────────────
CREATE OR REPLACE FUNCTION fn_venda_cancelar_conta_receber()
RETURNS TRIGGER AS $$
BEGIN
  -- Só executa se situação mudou para cancelado
  IF NEW.situacao != 'cancelado' OR OLD.situacao = 'cancelado' THEN
    RETURN NEW;
  END IF;

  -- Cancelar conta_receber vinculada
  UPDATE alissonerp.contas_receber
  SET situacao = 'cancelado', updated_at = now()
  WHERE venda_erp_id = NEW.id AND situacao = 'pendente';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Trigger: compra concluída → conta a pagar ────────────────────────────────
CREATE OR REPLACE FUNCTION fn_compra_gerar_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
  v_fornecedor_nome TEXT;
  v_existe BOOLEAN;
BEGIN
  -- Só executa se situação mudou para concluido
  IF NEW.situacao != 'concluido' OR OLD.situacao = 'concluido' THEN
    RETURN NEW;
  END IF;

  -- Guard duplicata
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_pagar WHERE compra_id = NEW.id
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do fornecedor
  SELECT nome INTO v_fornecedor_nome
  FROM public.contatos WHERE id_contato = NEW.fornecedor_id;

  -- Criar conta a pagar
  INSERT INTO alissonerp.contas_pagar (
    descricao, fornecedor_id, fornecedor_nome, compra_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Compra #' || NEW.id,
    NEW.fornecedor_id,
    v_fornecedor_nome,
    NEW.id,
    COALESCE(NEW.total, 0),
    CURRENT_DATE + interval '30 days',
    'pendente',
    'compra',
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── Criar triggers ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_venda_gerar_conta_receber ON alissonerp.vendas_erp;
CREATE TRIGGER trg_venda_gerar_conta_receber
  AFTER UPDATE ON alissonerp.vendas_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_venda_gerar_conta_receber();

DROP TRIGGER IF EXISTS trg_venda_cancelar_conta_receber ON alissonerp.vendas_erp;
CREATE TRIGGER trg_venda_cancelar_conta_receber
  BEFORE UPDATE ON alissonerp.vendas_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_venda_cancelar_conta_receber();

DROP TRIGGER IF EXISTS trg_compra_gerar_conta_pagar ON alissonerp.compras;
CREATE TRIGGER trg_compra_gerar_conta_pagar
  AFTER UPDATE ON alissonerp.compras
  FOR EACH ROW
  EXECUTE FUNCTION fn_compra_gerar_conta_pagar();

-- ─── Trigger: venda criada diretamente como confirmada/concluida → conta a receber
CREATE OR REPLACE FUNCTION fn_venda_gerar_conta_receber_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_nome TEXT;
  v_existe BOOLEAN;
BEGIN
  -- Só executa se já nasce confirmado ou concluido
  IF NEW.situacao NOT IN ('confirmado', 'concluido') THEN
    RETURN NEW;
  END IF;

  -- Guard duplicata
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber WHERE venda_erp_id = NEW.id
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  -- Buscar nome do cliente
  SELECT nome INTO v_cliente_nome
  FROM public.contatos WHERE id_contato = NEW.cliente_id;

  -- Criar conta a receber
  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
    NEW.cliente_id,
    v_cliente_nome,
    NEW.id,
    NEW.total_venda,
    COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'),
    'pendente',
    'venda',
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_venda_gerar_conta_receber_insert ON alissonerp.vendas_erp;
CREATE TRIGGER trg_venda_gerar_conta_receber_insert
  AFTER INSERT ON alissonerp.vendas_erp
  FOR EACH ROW
  EXECUTE FUNCTION fn_venda_gerar_conta_receber_on_insert();

-- ─── Grants ────────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON alissonerp.contas_pagar TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.contas_receber TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.contas_pagar_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.contas_receber_id_seq TO authenticated;
