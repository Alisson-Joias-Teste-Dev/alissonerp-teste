-- Migration 243: Corrige trigger stock_ledger_entry para motivos de conversão
-- O trigger fn_mirror_movimento_to_sle() não mapeava 'reservado_conversao',
-- 'recusado_conversao' e 'virou_peso', caindo em ELSE 'manual' e violando
-- a constraint chk_voucher_for_outgoing (que exige voucher_type != 'manual'
-- + voucher_id NOT NULL para movimentos de saída).

-- 1. Corrige trigger mirror: novos motivos e referencia_id como voucher_id
CREATE OR REPLACE FUNCTION alissonerp.fn_mirror_movimento_to_sle()
RETURNS TRIGGER AS $$
DECLARE
  v_sle_id BIGINT;
BEGIN
  INSERT INTO alissonerp.stock_ledger_entry (
    item_id, item_type, warehouse_id,
    actual_qty,
    voucher_type, voucher_id,
    obs, created_by, posting_date, posting_time
  ) VALUES (
    NEW.produto_id, 'produto', NEW.local_estoque_id,
    CASE WHEN NEW.tipo = 'entrada' THEN NEW.quantidade ELSE -NEW.quantidade END,
    CASE
      WHEN NEW.motivo = 'venda' THEN 'venda'
      WHEN NEW.motivo IN ('transferencia_saida','transferencia_entrada') THEN 'transferencia'
      WHEN NEW.motivo = 'devolucao' THEN 'devolucao'
      WHEN NEW.motivo = 'inventario' THEN 'inventario'
      WHEN NEW.motivo = 'estorno' THEN 'reconciliacao'
      WHEN NEW.motivo IN ('ajuste_entrada','ajuste_saida') THEN 'ajuste_entrada'
      WHEN NEW.motivo = 'producao_auto' THEN 'producao_auto'
      WHEN NEW.motivo IN ('reservado_conversao','virou_peso') THEN 'ordem_producao'
      WHEN NEW.motivo = 'recusado_conversao' THEN 'reconciliacao'
      ELSE 'manual'
    END,
    NEW.referencia_id,
    NEW.observacao,
    COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
    NEW.created_at::DATE,
    NEW.created_at::TIME
  ) RETURNING id INTO v_sle_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Corrige fn_concluir_protocolo_conversao para setar referencia_id no movimento virou_peso
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_protocolo_conversao()
RETURNS TRIGGER AS $$
DECLARE
  v_conversao   RECORD;
  v_ordem       RECORD;
  v_item        RECORD;
  v_mov_baixa   BIGINT;
  v_par_saida   BIGINT;
  v_par_entrada BIGINT;
  v_insumo_id   INTEGER;
BEGIN
  IF NEW.etapas::text != 'concluido' THEN
    RETURN NEW;
  END IF;

  FOR v_ordem IN
    SELECT o.id, o.numero_ordem
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.ordens o ON o.id = po.ordem_id
    WHERE po.protocolo_id = NEW.id
      AND o.tipo_ordem::text = 'conversao'
  LOOP
    SELECT * INTO v_conversao
    FROM alissonerp.conversoes_estoque
    WHERE ordem_id = v_ordem.id
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE alissonerp.conversoes_estoque
    SET status_conversao = 'concluido'
    WHERE id = v_conversao.id;

    FOR v_item IN
      SELECT * FROM alissonerp.conversao_itens
      WHERE conversao_id = v_conversao.id
    LOOP
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status, ordem_id, protocolo_id, referencia_id, observacao, created_by)
      VALUES
        (v_item.produto_id, 'saida', v_item.quantidade, 'virou_peso', 1, 'efetivado',
         v_conversao.ordem_id, NEW.id, v_conversao.ordem_id,
         'Conversão de estoque — virou peso (Ordem ' || v_ordem.numero_ordem || ')',
         NEW.recebedor_id)
      RETURNING id INTO v_mov_baixa;

      UPDATE alissonerp.conversao_itens
      SET movimento_baixa_id = v_mov_baixa
      WHERE id = v_item.id;
    END LOOP;

    v_insumo_id := COALESCE(v_conversao.insumo_destino, 1);

    PERFORM alissonerp.fn_criar_par_movimentacao(
      v_insumo_id,
      v_conversao.peso_total,
      1, 1, 1, 1,
      'entrada_compra'::alissonerp.enum_marcador_estoque,
      v_conversao.ordem_id,
      'Conversão de estoque comercial — entrada de ' || v_conversao.peso_total || 'g de metal (Ordem ' || v_ordem.numero_ordem || ')',
      1
    );

    UPDATE alissonerp.ordens
    SET status = 'concluido', data_conclusao = NOW(), updated_at = NOW()
    WHERE id = v_ordem.id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
