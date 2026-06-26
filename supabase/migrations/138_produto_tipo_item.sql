-- ============================================================
-- Migration 138 — Classificação produto_tipo_item (joia vs insumo)
-- Tabela auxiliar em alissonerp (public.produtos fica READONLY).
-- ============================================================

CREATE TABLE IF NOT EXISTS alissonerp.produto_tipo_item (
  produto_id  BIGINT PRIMARY KEY,
  tipo_item   TEXT   NOT NULL CHECK (tipo_item IN ('joia', 'insumo')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produto_tipo_item_tipo
  ON alissonerp.produto_tipo_item (tipo_item);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION alissonerp.fn_touch_produto_tipo_item()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_touch_produto_tipo_item ON alissonerp.produto_tipo_item;
CREATE TRIGGER trg_touch_produto_tipo_item
  BEFORE UPDATE ON alissonerp.produto_tipo_item
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_touch_produto_tipo_item();

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.produto_tipo_item TO authenticated;

-- ============================================================
-- Classificação automática inicial
-- Regras:
--   INSUMO: SKU IS*, ou categoria começa com Insumos/Matérias Primas/
--           Ferramentas/Pedras
--   JOIA:   categoria começa com Anel/Pulseira/Pingente/Corrente/Brinco/
--           Aliança(s)/Bracelete/Escapulário/Piercing/Tornozeleira/Fecho/
--           Rodinada/Promoção/Mostruário
--   NULL:   os demais (Serviços e não-classificados) — usuário decide depois
-- ============================================================

INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
SELECT p.id_produto, 'insumo'
FROM public.produtos p
WHERE (
     p.sku ILIKE 'IS%'
  OR p.categoria ILIKE 'Insumos%'
  OR p.categoria ILIKE 'Matérias Primas%'
  OR p.categoria ILIKE 'Ferramentas%'
  OR p.categoria ILIKE 'Pedras%'
)
ON CONFLICT (produto_id) DO NOTHING;

INSERT INTO alissonerp.produto_tipo_item (produto_id, tipo_item)
SELECT p.id_produto, 'joia'
FROM public.produtos p
WHERE p.categoria ILIKE 'Anel%'
   OR p.categoria ILIKE 'Pulseira%'
   OR p.categoria ILIKE 'Pingente%'
   OR p.categoria ILIKE 'Corrente%'
   OR p.categoria ILIKE 'Brinco%'
   OR p.categoria ILIKE 'Aliança%'
   OR p.categoria ILIKE 'Alianças%'
   OR p.categoria ILIKE 'Bracelete%'
   OR p.categoria ILIKE 'Escapulário%'
   OR p.categoria ILIKE 'Piercing%'
   OR p.categoria ILIKE 'Tornozeleira%'
   OR p.categoria ILIKE 'Fecho%'
   OR p.categoria ILIKE 'Rodinada%'
   OR p.categoria ILIKE 'Promoção%'
   OR p.categoria ILIKE 'Mostruário%'
ON CONFLICT (produto_id) DO NOTHING;
