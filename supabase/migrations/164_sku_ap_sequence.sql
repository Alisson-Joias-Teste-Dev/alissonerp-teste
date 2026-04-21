-- ============================================================================
-- Migration 164 — Sequence para SKUs de produtos personalizados (AP0001..AP9999)
-- ============================================================================
-- Cria sequence + funcao helper para gerar SKUs no formato APNNNN automaticamente.
-- Usado por POST /api/produtos/personalizados ao criar produto novo com
-- personalizacao (fluxo do modal "+ Personalizado" em /produtos).
--
-- Se ja existirem SKUs APNNNN no cadastro (fluxo manual anterior),
-- a sequence eh ajustada para comecar do proximo disponivel.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Sequence dedicada
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS alissonerp.seq_sku_ap
  MINVALUE 1
  MAXVALUE 9999
  START 1
  CYCLE;

COMMENT ON SEQUENCE alissonerp.seq_sku_ap IS
  'Sequence para SKUs de produtos personalizados (AP + 4 digitos). CYCLE: apos 9999 volta para 1 (improvavel atingir).';

-- ----------------------------------------------------------------------------
-- 2) Ajustar valor atual se ja existem SKUs AP
-- Pega o maior numero ja usado e seta a sequence para ele.
-- is_called=true depois do setval → proximo nextval() sera MAX + 1.
-- Uso substring(sku, 3)::INT (pula "AP" = 2 chars) pois o WHERE ~ '^AP\d+$'
-- garante o formato. Nao uso regexp_matches pois substring FROM regex nao
-- captura grupo em PostgreSQL (conhecido).
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  max_num INT;
BEGIN
  SELECT COALESCE(MAX(substring(sku, 3)::INT), 0)
  INTO max_num
  FROM public.produtos
  WHERE sku ~ '^AP\d+$';

  IF max_num > 0 THEN
    PERFORM setval('alissonerp.seq_sku_ap', max_num);
    RAISE NOTICE 'seq_sku_ap ajustada para %, proximo SKU sera AP%', max_num, LPAD((max_num + 1)::TEXT, 4, '0');
  ELSE
    RAISE NOTICE 'Nenhum SKU AP existente. Proximo SKU sera AP0001.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) Funcao helper: retorna proximo SKU disponivel (atomico)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION alissonerp.proximo_sku_ap()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  n INT;
BEGIN
  n := nextval('alissonerp.seq_sku_ap')::INT;
  RETURN 'AP' || LPAD(n::TEXT, 4, '0');
END;
$$;

COMMENT ON FUNCTION alissonerp.proximo_sku_ap() IS
  'Retorna proximo SKU AP disponivel (formato AP0001..AP9999). Atomico via nextval.';

-- ----------------------------------------------------------------------------
-- 4) Grants
-- ----------------------------------------------------------------------------
GRANT USAGE, SELECT ON SEQUENCE alissonerp.seq_sku_ap     TO authenticated;
GRANT EXECUTE ON FUNCTION  alissonerp.proximo_sku_ap()    TO authenticated;

-- ============================================================================
-- Fim migration 164
-- ============================================================================
