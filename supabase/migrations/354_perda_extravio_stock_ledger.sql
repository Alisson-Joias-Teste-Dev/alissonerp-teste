-- Migration 354: Perda / extravio de peca — espelho no stock_ledger_entry
--
-- O QUE FAZ
--   1) Acrescenta o tipo de documento 'perda' na lista valida de
--      stock_ledger_entry.voucher_type.
--   2) Ensina o trigger espelho (fn_mirror_movimento_to_sle) a traduzir o motivo
--      comercial 'perda_extravio' para esse tipo de documento.
--
-- POR QUE (regra de negocio)
--   Peca que sumiu (nao localizada, quebrada, extraviada) precisa SAIR do estoque,
--   senao o saldo do sistema mente para sempre: a peca reaparece em relatorio, pode
--   ser vendida e volta a divergir no proximo inventario. Essa baixa e a unica baixa
--   manual do ERP e e exclusiva do master admin (parametros_sistema.MASTER_ADMIN_USER_ID)
--   — ver src/app/api/estoque-comercial/perda/route.ts.
--
--   Todo movimento comercial e espelhado no livro fisico stock_ledger_entry pelo
--   trigger. La existe a trava chk_voucher_for_outgoing: TODA saida (actual_qty < 0)
--   precisa de um tipo de documento diferente de 'manual'. Como 'perda_extravio' nao
--   estava mapeado, caia no ELSE 'manual' e a baixa era REJEITADA pelo banco.
--   (Descoberto testando a baixa no banco local antes de subir.)
--
--   Optamos por um tipo proprio 'perda' em vez de reaproveitar 'ajuste_saida':
--   perda tem peso contabil e gerencial diferente de ajuste, e reaproveitar
--   esconderia as perdas no meio dos ajustes no livro fisico.
--
-- IMPACTO SE REMOVIDO/ALTERADO
--   - Tirar 'perda' da constraint: toda baixa por perda passa a estourar erro no
--     banco e a tela para de funcionar.
--   - Tirar o WHEN do trigger: idem (volta a cair no ELSE 'manual').
--   - Trocar a string 'perda_extravio': cega as perdas ja registradas — o extrato
--     deixa de marcar a linha e o estorno protegido para de reconhece-las.
--     A string vive em src/lib/perda-extravio.ts (MOTIVO_PERDA).
--
-- ADITIVA: nao altera nenhuma linha existente, so amplia o que passa a ser aceito.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Tipo de documento 'perda' na lista valida
--    Recria o CHECK com a lista antiga + 'perda'. Nenhuma linha ja gravada perde
--    validade (so estamos aceitando um valor a mais).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE alissonerp.stock_ledger_entry
  DROP CONSTRAINT IF EXISTS chk_voucher_type_valid;

ALTER TABLE alissonerp.stock_ledger_entry
  ADD CONSTRAINT chk_voucher_type_valid CHECK (
    voucher_type = ANY (ARRAY[
      'venda', 'ordem_producao', 'transferencia', 'inventario', 'reconciliacao',
      'compra', 'devolucao', 'quebra', 'producao_auto', 'ajuste_entrada',
      'ajuste_saida', 'sangria', 'manual',
      'perda'  -- ADITIVO (354): baixa por peca perdida/extraviada
    ])
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Trigger espelho: traduzir 'perda_extravio' -> 'perda'
--    CREATE OR REPLACE preservando 100% do corpo atual (conferido no banco de
--    producao em 21/07/2026, md5 4b4c534f83f17121da799563bea90774).
--    A UNICA linha nova esta marcada com ADITIVO (354).
-- ─────────────────────────────────────────────────────────────────────────────
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
          WHEN NEW.motivo = 'ajuste_entrada' THEN 'ajuste_entrada'
          WHEN NEW.motivo = 'ajuste_saida' THEN 'ajuste_saida'
          WHEN NEW.motivo = 'producao_auto' THEN 'producao_auto'
          -- ADITIVO (302): entrada de reposição. No FÍSICO rotula como 'producao_auto'
          -- (a peça veio da produção) — voucher_type válido por chk_voucher_type_valid.
          -- No COMERCIAL o motivo é 'reposicao_entrada' + ordem_id (rastreável). Não
          -- mexe na trava do físico.
          WHEN NEW.motivo = 'reposicao_entrada' THEN 'producao_auto'
          -- ADITIVO (354): baixa por peça perdida/extraviada. Tipo próprio (e não
          -- 'ajuste_saida') para a perda não se esconder no meio dos ajustes.
          WHEN NEW.motivo = 'perda_extravio' THEN 'perda'
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
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Guarda: falha alto se algo acima nao pegou
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'alissonerp.stock_ledger_entry'::regclass
      AND conname  = 'chk_voucher_type_valid'
      AND pg_get_constraintdef(oid) LIKE '%perda%'
  ) THEN
    RAISE EXCEPTION 'Migration 354 falhou: chk_voucher_type_valid sem o tipo perda';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'alissonerp'
      AND p.proname = 'fn_mirror_movimento_to_sle'
      AND p.prosrc LIKE '%perda_extravio%'
  ) THEN
    RAISE EXCEPTION 'Migration 354 falhou: trigger espelho sem o motivo perda_extravio';
  END IF;
END $$;
