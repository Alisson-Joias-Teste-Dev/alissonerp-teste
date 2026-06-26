-- Migration 294: tornar codigo_cliente e codigo_motoboy opcionais
-- REGRA DE NEGÓCIO: frete avulso (is_avulso = true) não gera código de
-- verificação para cliente nem para motoboy — a confirmação é por botão.
-- IMPACTO: entregas normais continuam obrigando os dois campos via
-- constraint chk_codigos_obrigatorios adicionada abaixo.
-- IMPACTO SE REMOVIDO: avulso volta a falhar com NOT NULL ao criar.

BEGIN;

SET search_path TO alissonerp;

ALTER TABLE alissonerp.entregas_venda
  ALTER COLUMN codigo_cliente DROP NOT NULL,
  ALTER COLUMN codigo_motoboy DROP NOT NULL;

-- Constraint que garante: entrega normal (is_avulso=false) ainda exige os códigos
-- NOT VALID: 17 registros históricos (pré-avulso) têm codigo_motoboy=NULL; grandfathered
ALTER TABLE alissonerp.entregas_venda
  ADD CONSTRAINT chk_codigos_obrigatorios
    CHECK (
      is_avulso = true
      OR (codigo_cliente IS NOT NULL AND codigo_motoboy IS NOT NULL)
    ) NOT VALID;

COMMIT;
