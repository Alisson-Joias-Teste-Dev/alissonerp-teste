-- Migration 273: compra comercial por peso total de lote
-- REGRA DE NEGOCIO:
-- - O que faz: muda o calculo do item para usar peso total do lote (nao peso unitario).
-- - Por que: em compra de joias o peso unitario real varia, e o operador normalmente tem apenas peso total + quantidade.
-- - Impacto se alterado/removido: custo por item e total da compra podem ficar distorcidos e gerar contas a pagar incorretas.

SET search_path TO alissonerp;

ALTER TABLE alissonerp.itens_compra_comercial
  ADD COLUMN IF NOT EXISTS cotacao_referencial NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS fator_ouro NUMERIC(6,4),
  ADD COLUMN IF NOT EXISTS valor_grama NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS peso_total NUMERIC(10,3);

-- Backfill para registros antigos: preserva operacao anterior com fallback.
UPDATE alissonerp.itens_compra_comercial
SET
  valor_grama = COALESCE(valor_grama, valor_unitario),
  peso_total = COALESCE(peso_total, qtd)
WHERE valor_grama IS NULL OR peso_total IS NULL;

ALTER TABLE alissonerp.itens_compra_comercial
  ALTER COLUMN valor_grama SET NOT NULL,
  ALTER COLUMN peso_total SET NOT NULL;

ALTER TABLE alissonerp.itens_compra_comercial
  ADD CONSTRAINT ck_itens_compra_comercial_valor_grama_pos
    CHECK (valor_grama > 0) NOT VALID,
  ADD CONSTRAINT ck_itens_compra_comercial_peso_total_pos
    CHECK (peso_total > 0) NOT VALID;

ALTER TABLE alissonerp.itens_compra_comercial
  VALIDATE CONSTRAINT ck_itens_compra_comercial_valor_grama_pos;

ALTER TABLE alissonerp.itens_compra_comercial
  VALIDATE CONSTRAINT ck_itens_compra_comercial_peso_total_pos;

-- REGRA DE NEGOCIO:
-- - O que faz: valor_total passa a ser calculado por peso total x valor da grama.
-- - Por que: esta eh a metrica real de compra para lote de joias sem peso unitario preciso.
-- - Impacto se alterado/removido: total da compra e financeiro ficam divergentes do acordo de compra.
CREATE OR REPLACE FUNCTION alissonerp.fn_calcular_item_compra_comercial()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.valor_total := ROUND((COALESCE(NEW.peso_total, 0) * COALESCE(NEW.valor_grama, 0))::numeric, 2);
  RETURN NEW;
END;
$$;
