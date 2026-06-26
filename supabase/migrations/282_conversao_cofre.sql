-- Migration 282: Conversão 2.0 — Integração com Caixa de Ouro
-- REGRA DE NEGÓCIO:
--   - Após aprovação da conversão, as joias entram no Caixa de Ouro automaticamente.
--   - O estoque comercial é baixado (virou_peso) no momento da aprovação.
--   - As joias somam ao saldo disponível do cofre (vw_cofre_ouro_disponivel).
--   - Quando o cofre fizer uma baixa futura (derreter o ouro), usa o fluxo normal de baixa.
-- IMPACTO SE REMOVIDO:
--   - Conversões aprovadas ficariam invisíveis no saldo do Caixa de Ouro.
--   - fn_concluir_protocolo_conversao poderia reprocessar conversões já concluídas
--     (entrada duplicada de metal no estoque da fábrica).

SET search_path TO alissonerp, public;

-- ═══ 1. Coluna cofre_registrado em conversoes_estoque ═══
-- Marca que a conversão entrou no Caixa de Ouro (fluxo v2.0).
-- Usada como guard no trigger de protocolo para evitar reprocessamento.
ALTER TABLE alissonerp.conversoes_estoque
ADD COLUMN IF NOT EXISTS cofre_registrado BOOLEAN NOT NULL DEFAULT false;

-- ═══ 2. Atualizar vw_cofre_ouro_disponivel — incluir conversões ═══
CREATE OR REPLACE VIEW alissonerp.vw_cofre_ouro_disponivel AS
WITH vendas_ouro AS (
  SELECT
    COUNT(*)::integer AS transacoes,
    COALESCE(SUM(COALESCE(pv.ouro_peso, pv.ouro_gramas)), 0)::numeric AS gramas,
    COALESCE(SUM(pv.valor), 0)::numeric AS valor_brl,
    COALESCE(AVG(pv.ouro_valor_grama) FILTER (WHERE pv.ouro_valor_grama > 0), 0)::numeric AS preco_medio_grama
  FROM alissonerp.pagamentos_venda pv
  WHERE pv.forma = 'Ouro' AND pv.status = 'confirmado'
), compras_metal AS (
  SELECT
    COUNT(*)::integer AS transacoes,
    COALESCE(SUM(cm.peso_gramas), 0)::numeric AS gramas,
    COALESCE(SUM(cm.valor_total), 0)::numeric AS valor_brl
  FROM alissonerp.compras_metal cm
  WHERE cm.status = 'confirmado' AND cm.cofre_registrado = true
), recebimentos_metal AS (
  SELECT
    COUNT(*)::integer AS transacoes,
    COALESCE(SUM(rm.peso_gramas), 0)::numeric AS gramas,
    COALESCE(SUM(rm.valor_total), 0)::numeric AS valor_brl
  FROM alissonerp.recebimentos_metal rm
  WHERE rm.status = 'ativo' AND rm.cofre_registrado = true
), conversoes AS (
  -- Conversão 2.0: joias aprovadas que entraram no Caixa de Ouro
  -- Peso total soma ao saldo disponível. Valor BRL = 0 (não há transação financeira).
  SELECT
    COUNT(*)::integer AS transacoes,
    COALESCE(SUM(ce.peso_total), 0)::numeric AS gramas,
    0::numeric AS valor_brl
  FROM alissonerp.conversoes_estoque ce
  WHERE ce.status_conversao = 'concluido' AND ce.cofre_registrado = true
), total_entradas AS (
  SELECT
    (v.transacoes + c.transacoes + r.transacoes + cv.transacoes)::integer AS total_transacoes,
    (v.gramas + c.gramas + r.gramas + cv.gramas)::numeric AS total_gramas,
    (v.valor_brl + c.valor_brl + r.valor_brl + cv.valor_brl)::numeric AS total_valor_brl,
    v.preco_medio_grama::numeric AS preco_medio_grama
  FROM vendas_ouro v
  CROSS JOIN compras_metal c
  CROSS JOIN recebimentos_metal r
  CROSS JOIN conversoes cv
), baixas AS (
  SELECT COALESCE(SUM(cb.gramas), 0)::numeric AS baixado_gramas
  FROM alissonerp.cofre_ouro_baixas cb
  WHERE cb.status IN ('pendente', 'em_trafego', 'concluido')
)
SELECT
  e.total_transacoes,
  e.total_gramas,
  (e.total_gramas - b.baixado_gramas)::numeric AS disponivel_gramas,
  e.total_valor_brl,
  e.preco_medio_grama
FROM total_entradas e
CROSS JOIN baixas b;

-- ═══ 3. Atualizar fn_concluir_protocolo_conversao — guard cofre_registrado ═══
-- REGRA DE NEGÓCIO:
--   - Conversões que entraram no Caixa de Ouro (cofre_registrado = true)
--     NÃO devem ser reprocessadas pelo trigger de conclusão de protocolo.
--   - O processamento delas (baixa EC) já ocorreu na aprovação (v2.0).
--   - Conversões do fluxo antigo (sem protocolo, cofre_registrado = false)
--     continuam sendo processadas normalmente pela trigger (v1.0).
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_protocolo_conversao()
RETURNS TRIGGER AS $$
DECLARE
  v_conversao     RECORD;
  v_ordem         RECORD;
  v_item          RECORD;
  v_mov_baixa     BIGINT;
  v_insumo_id     INTEGER;
  v_local_loja    INTEGER := 2;
  v_local_fabrica INTEGER := 1;
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

    -- GUARD Conversão 2.0: se já entrou no Caixa de Ouro, pular
    -- A baixa do estoque comercial já foi feita no momento da aprovação
    IF v_conversao.cofre_registrado = true THEN
      CONTINUE;
    END IF;

    UPDATE alissonerp.conversoes_estoque
    SET status_conversao = 'concluido'
    WHERE id = v_conversao.id;

    FOR v_item IN
      SELECT * FROM alissonerp.conversao_itens
      WHERE conversao_id = v_conversao.id
    LOOP
      IF v_item.reserva_id IS NOT NULL THEN
        UPDATE alissonerp.reservas_estoque_comercial
        SET status = 'efetivado', efetivado_em = NOW()
        WHERE id = v_item.reserva_id;

        INSERT INTO alissonerp.movimentacoes_estoque_comercial
          (produto_id, tipo, quantidade, motivo, local_estoque_id, status, ordem_id, protocolo_id, referencia_id, observacao, created_by)
        VALUES
          (v_item.produto_id, 'saida', v_item.quantidade, 'virou_peso', v_local_loja, 'efetivado',
           v_conversao.ordem_id, NEW.id, v_conversao.ordem_id,
           'Conversao de estoque — virou peso (Ordem ' || v_ordem.numero_ordem || ')',
           NEW.recebedor_id)
        RETURNING id INTO v_mov_baixa;

        UPDATE alissonerp.conversao_itens
        SET movimento_baixa_id = v_mov_baixa
        WHERE id = v_item.id;

      ELSIF v_item.movimento_reserva_id IS NOT NULL THEN
        v_mov_baixa := v_item.movimento_reserva_id;

        UPDATE alissonerp.conversao_itens
        SET movimento_baixa_id = v_mov_baixa
        WHERE id = v_item.id;

      ELSE
        RAISE WARNING 'Conversao item % sem reserva_id nem movimento_reserva_id — pulando', v_item.id;
      END IF;
    END LOOP;

    v_insumo_id := COALESCE(v_conversao.insumo_destino, 1);

    INSERT INTO alissonerp.movimentacoes_estoque
      (entrada, insumo_id, deposito_id, local_estoque_id, marcador, ordem_id, obs)
    VALUES
      (v_conversao.peso_total, v_insumo_id, v_local_fabrica, v_local_fabrica,
       'EM'::alissonerp.enum_marcador_estoque, v_conversao.ordem_id,
       'Conversao de estoque — entrada de ' || v_conversao.peso_total || 'g de metal (Ordem ' || v_ordem.numero_ordem || ')');

    UPDATE alissonerp.ordens
    SET status = 'concluido', data_conclusao = NOW(), updated_at = NOW()
    WHERE id = v_ordem.id;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
