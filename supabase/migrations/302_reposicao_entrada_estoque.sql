-- ============================================================
-- Migration 302 — Entrada de estoque na conclusão da reposição (2026-06-13)
--
-- REGRA DE NEGÓCIO:
-- O QUE: quando a peça de uma ordem de REPOSIÇÃO volta pronta para a loja, ela
--   passa a DAR ENTRADA no estoque comercial (almox. 2). Dois caminhos disparam
--   isso, usando a MESMA função idempotente:
--     1) Protocolo de VOLTA concluído (fluxo normal) — gatilho novo aqui.
--     2) Botão "Concluir pelo sistema" do master (concluir-sistema) — chama a
--        função direto, pois esse caminho PULA o protocolo de volta.
-- POR QUE: hoje a reposição concluída NÃO dava entrada — o físico ficava zerado
--   e a entrega da venda quebrava com STOCK_NEGATIVE (ex.: venda 15462 / item
--   90000764 / ordem C-2372). Decisão do Jonathan (13/06): a peça entra no
--   estoque quando o protocolo de VOLTA é concluído; o botão de conclusão forçada
--   faz o processo completo (conclui + dá entrada).
-- IMPACTO SE REMOVIDO: volta o STOCK_NEGATIVE — reposição concluída sem peça no
--   estoque, entrega da venda travada.
--
-- BLINDAGEM:
--   • Idempotente: 1 entrada por (ordem, produto). Se a volta concluir E o botão
--     for clicado, NÃO dobra (checa entrada 'reposicao_entrada' já existente).
--   • Só age em ordem de reposição (reposicao_venda/reposicao_loja).
--   • A entrada comercial 'efetivado' espelha no físico via o gatilho já existente
--     trg_mirror_movimento_to_sle (almox. 2 → warehouse 2).
--   • NÃO toca fn_concluir_protocolo (zona no-touch §2). Gatilho AFTER UPDATE
--     separado, no mesmo padrão dos trg_concluir_conversao já existentes.
--
-- Database Safety §2: CREATE OR REPLACE (nunca DROP), ADD aditivo em fn_mirror.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Função idempotente: dá entrada da peça da reposição no estoque comercial.
--    Chamada pelo gatilho da volta E pela rota concluir-sistema.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION alissonerp.fn_reposicao_entrada_estoque(
  p_ordem_id INTEGER,
  p_user UUID DEFAULT NULL
)
 RETURNS INTEGER  -- qtd de entradas criadas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'alissonerp', 'public'
AS $function$
DECLARE
  v_ordem      RECORD;
  v_item       RECORD;
  v_criadas    INTEGER := 0;
BEGIN
  -- Só ordem de reposição. Qualquer outro tipo: no-op (a rota concluir-sistema
  -- chama esta função para QUALQUER ordem; o filtro fica aqui).
  SELECT id, tipo_ordem, numero_ordem
    INTO v_ordem
  FROM alissonerp.ordens
  WHERE id = p_ordem_id
    AND tipo_ordem IN ('reposicao_venda', 'reposicao_loja')
  LIMIT 1;

  IF v_ordem.id IS NULL THEN
    RETURN 0;
  END IF;

  -- Uma entrada por produto da ordem (itens_ordem). Idempotente: pula o produto
  -- que JÁ tem entrada 'reposicao_entrada' efetivada/pendente para esta ordem.
  FOR v_item IN
    SELECT io.produto_id, SUM(io.quantidade) AS quantidade
    FROM alissonerp.itens_ordem io
    WHERE io.ordem_id = p_ordem_id
      AND io.produto_id IS NOT NULL
      AND COALESCE(io.quantidade, 0) > 0
    GROUP BY io.produto_id
  LOOP
    IF EXISTS (
      SELECT 1
      FROM alissonerp.movimentacoes_estoque_comercial m
      WHERE m.ordem_id = p_ordem_id
        AND m.produto_id = v_item.produto_id
        AND m.motivo = 'reposicao_entrada'
        AND m.estorno_de_id IS NULL          -- ignora linhas que já são estorno
        AND m.status <> 'cancelado'
    ) THEN
      CONTINUE;  -- já entrou: não dobra
    END IF;

    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, ordem_id, created_by, observacao)
    VALUES
      (v_item.produto_id, 'entrada', v_item.quantidade, 'reposicao_entrada',
       p_ordem_id, 'ordens', 2, 'efetivado', p_ordem_id, p_user,
       'Entrada automática — reposição concluída (ordem ' || v_ordem.numero_ordem || ')');

    v_criadas := v_criadas + 1;
  END LOOP;

  RETURN v_criadas;
END;
$function$;

-- ------------------------------------------------------------
-- 2) Função do gatilho: protocolo de VOLTA concluído → entrada das reposições.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION alissonerp.fn_reposicao_entrada_volta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'alissonerp', 'public'
AS $function$
DECLARE
  v_po RECORD;
BEGIN
  -- Para cada ordem ligada a este protocolo de volta, dar entrada se for
  -- reposição. A função fn_reposicao_entrada_estoque filtra o tipo e é idempotente.
  FOR v_po IN
    SELECT po.ordem_id
    FROM alissonerp.protocolo_ordens po
    WHERE po.protocolo_id = NEW.id
  LOOP
    PERFORM alissonerp.fn_reposicao_entrada_estoque(
      v_po.ordem_id,
      COALESCE(NEW.recebedor_id, NEW.created_by)
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- Gatilho: só dispara na TRANSIÇÃO para 'concluido' E quando direcao='volta'.
-- Mesmo padrão (AFTER UPDATE + WHEN) dos trg_concluir_conversao já existentes.
DROP TRIGGER IF EXISTS trg_reposicao_entrada_volta ON alissonerp.protocolos;
CREATE TRIGGER trg_reposicao_entrada_volta
  AFTER UPDATE ON alissonerp.protocolos
  FOR EACH ROW
  WHEN (
    (NEW.etapas)::text = 'concluido'
    AND (OLD.etapas)::text IS DISTINCT FROM 'concluido'
    AND (NEW.direcao)::text = 'volta'
  )
  EXECUTE FUNCTION alissonerp.fn_reposicao_entrada_volta();

-- ------------------------------------------------------------
-- 3) Espelho comercial→físico: rotular a entrada de reposição (ADITIVO).
--    Acrescenta SÓ o caso 'reposicao_entrada'; todo o resto é idêntico ao
--    original (migration original do mirror). CREATE OR REPLACE, sem DROP.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION alissonerp.fn_mirror_movimento_to_sle()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
          WHEN NEW.motivo = 'ajuste_entrada' THEN 'ajuste_entrada'
          WHEN NEW.motivo = 'ajuste_saida' THEN 'ajuste_saida'
          WHEN NEW.motivo = 'producao_auto' THEN 'producao_auto'
          -- ADITIVO (302): entrada de reposição. No FÍSICO rotula como 'producao_auto'
          -- (a peça veio da produção) — voucher_type válido por chk_voucher_type_valid.
          -- No COMERCIAL o motivo é 'reposicao_entrada' + ordem_id (rastreável). Não
          -- mexe na trava do físico.
          WHEN NEW.motivo = 'reposicao_entrada' THEN 'producao_auto'
          WHEN NEW.motivo IN ('reservado_conversao','virou_peso') THEN 'ordem_producao'
          WHEN NEW.motivo = 'recusado_conversao' THEN 'reconciliacao'
          WHEN NEW.motivo IN ('conversao_sku_ida','conversao_sku_volta') THEN 'transferencia'
          WHEN NEW.motivo IN ('conversao_sku_consumo','conversao_sku_producao') THEN 'ordem_producao'
          ELSE 'manual'
        END,
        COALESCE(NEW.referencia_id, NEW.id),
        NEW.observacao,
        COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid),
        NEW.created_at::DATE,
        NEW.created_at::TIME
      ) RETURNING id INTO v_sle_id;
      RETURN NEW;
    END;
    $function$;

-- ============================================================
-- Fim migration 302
-- ============================================================
