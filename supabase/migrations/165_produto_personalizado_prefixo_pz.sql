-- ============================================================================
-- Migration 165 — Trocar prefixo de SKU personalizado: AP → PZ
-- ============================================================================
-- Motivo: "AP" colide com SKUs do Tiny (ex: AP1001 = "Agua marinha").
--         Jonathan escolheu "PZ" (PersonaliZado) como prefixo limpo.
--
-- Acao: renomeia sequence + recria funcao + zera contador (comeca em PZ0001).
--       Nenhum produto PZ foi criado ainda — seguro resetar.
--
-- Seguranca:
--   - ALTER SEQUENCE RENAME (preserva metadados)
--   - DROP FUNCTION antiga proximo_sku_ap (ninguem chama ainda — endpoints serao
--     ajustados antes do deploy do frontend)
--   - setval para (1, false) → proximo nextval retornara 1 → SKU PZ0001
-- ============================================================================

-- 1) Renomear sequence AP → PZ
ALTER SEQUENCE IF EXISTS alissonerp.seq_sku_ap RENAME TO seq_sku_pz;

COMMENT ON SEQUENCE alissonerp.seq_sku_pz IS
  'Sequence para SKUs de produtos personalizados (PZ + 4 digitos). CYCLE: apos 9999 volta para 1.';

-- 2) Resetar contador (zero SKUs PZ no catalogo)
-- setval(seq, 1, false) faz proximo nextval retornar 1 (is_called=false)
SELECT setval('alissonerp.seq_sku_pz', 1, false);

-- 3) Ajuste se ja existirem SKUs PZ no cadastro (defensivo — nao deve haver)
DO $$
DECLARE
  max_num INT;
BEGIN
  SELECT COALESCE(MAX(substring(sku, 3)::INT), 0)
  INTO max_num
  FROM public.produtos
  WHERE sku ~ '^PZ\d+$';

  IF max_num > 0 THEN
    PERFORM setval('alissonerp.seq_sku_pz', max_num);
    RAISE NOTICE 'seq_sku_pz ajustada para %, proximo SKU sera PZ%', max_num, LPAD((max_num + 1)::TEXT, 4, '0');
  ELSE
    RAISE NOTICE 'Nenhum SKU PZ existente. Proximo SKU sera PZ0001.';
  END IF;
END $$;

-- 4) Dropar funcao antiga (AP) e criar nova (PZ)
DROP FUNCTION IF EXISTS alissonerp.proximo_sku_ap();

CREATE OR REPLACE FUNCTION alissonerp.proximo_sku_pz()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n INT;
BEGIN
  n := nextval('alissonerp.seq_sku_pz')::INT;
  RETURN 'PZ' || LPAD(n::TEXT, 4, '0');
END;
$$;

COMMENT ON FUNCTION alissonerp.proximo_sku_pz() IS
  'Retorna proximo SKU PZ disponivel (formato PZ0001..PZ9999). Atomico via nextval.';

-- 5) Grants
GRANT USAGE, SELECT ON SEQUENCE alissonerp.seq_sku_pz   TO authenticated;
GRANT EXECUTE ON FUNCTION  alissonerp.proximo_sku_pz()  TO authenticated;

-- ============================================================================
-- Fim migration 165
-- ============================================================================
