-- Migration 244: Reserva de estoque para conversão
-- Em vez de criar movimentação 'efetivado' na hora (que deduz saldo_fisico),
-- a conversão agora cria uma reserva (status='ativo') igual ao PDV.
-- O saldo_fisico só é deduzido quando a conversão é concluída.

-- 1. Tornar venda_id/item_venda_id nullable na reservas_estoque_comercial
ALTER TABLE alissonerp.reservas_estoque_comercial
  ALTER COLUMN venda_id      DROP NOT NULL,
  ALTER COLUMN item_venda_id DROP NOT NULL;

-- 2. Adicionar ordem_id na reservas_estoque_comercial (para conversões)
ALTER TABLE alissonerp.reservas_estoque_comercial
  ADD COLUMN IF NOT EXISTS ordem_id INTEGER REFERENCES alissonerp.ordens(id);

CREATE INDEX IF NOT EXISTS idx_reservas_ec_ordem
  ON alissonerp.reservas_estoque_comercial(ordem_id);

-- 3. Adicionar reserva_id em conversao_itens
ALTER TABLE alissonerp.conversao_itens
  ADD COLUMN IF NOT EXISTS reserva_id INTEGER REFERENCES alissonerp.reservas_estoque_comercial(id);

-- 4. Substituir fn_concluir_protocolo_conversao
--    Agora: ao concluir protocolo, as reservas são efetivadas e os movimentos reais são criados
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_protocolo_conversao()
RETURNS TRIGGER AS $$
DECLARE
  v_conversao    RECORD;
  v_ordem        RECORD;
  v_item         RECORD;
  v_mov_baixa    BIGINT;
  v_insumo_id    INTEGER;
  v_reserva_id   INTEGER;
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

    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE alissonerp.conversoes_estoque
    SET status_conversao = 'concluido'
    WHERE id = v_conversao.id;

    FOR v_item IN
      SELECT * FROM alissonerp.conversao_itens
      WHERE conversao_id = v_conversao.id
    LOOP
      -- Efetivar a reserva (marcar como efetivado)
      IF v_item.reserva_id IS NOT NULL THEN
        UPDATE alissonerp.reservas_estoque_comercial
        SET status = 'efetivado', efetivado_em = NOW()
        WHERE id = v_item.reserva_id;
      END IF;

      -- Criar movimento real de saída (virou_peso) — agora afeta saldo_fisico
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
