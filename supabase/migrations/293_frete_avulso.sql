-- Migration 293: frete avulso (corrida de motoboy sem venda vinculada)
-- REGRA DE NEGÓCIO:
--   O que faz: permite criar entregas sem venda associada (is_avulso = true),
--   como corridas para buscar peça na casa de cliente, levar material à loja,
--   ou qualquer corrida avulsa do motoboy que não tem venda no sistema.
--   Por que: o sistema anterior exigia venda_id NOT NULL, impedindo registrar
--   corridas operacionais que não geram venda. O motoboy confirma com botão
--   simples (sem código de verificação), e o valor entra normalmente no acerto.
--   Impacto se removido: entregas avulsas voltam a ser impossíveis de registrar.
--   Impacto nas entregas normais: ZERO — constraint chk_entrega_origem garante
--   que venda normal (is_avulso = false) ainda exige venda_id.

BEGIN;

SET search_path TO alissonerp;

-- 1. Tornar venda_id opcional (era NOT NULL)
-- REGRA: avulso não tem venda; entrega normal continua exigindo via constraint abaixo
ALTER TABLE alissonerp.entregas_venda
  ALTER COLUMN venda_id DROP NOT NULL;

-- 2. Campos exclusivos do frete avulso
ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS is_avulso       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contato_id      INTEGER REFERENCES public.contatos(id_contato),
  ADD COLUMN IF NOT EXISTS descricao_avulso TEXT;

-- 3. Constraint de consistência: normal exige venda, avulso não
-- IMPACTO SE REMOVIDO: seria possível criar entrega sem venda nem flag avulso
ALTER TABLE alissonerp.entregas_venda
  ADD CONSTRAINT chk_entrega_origem
    CHECK (
      (is_avulso = false AND venda_id IS NOT NULL) OR
      (is_avulso = true  AND venda_id IS NULL)
    );

-- 4. Índice para filtrar avulsos (partial index, ocupa menos espaço)
CREATE INDEX IF NOT EXISTS idx_entregas_avulso
  ON alissonerp.entregas_venda(is_avulso) WHERE is_avulso = true;

-- 5. Índice no contato_id (busca de entregas avulsas por cliente)
CREATE INDEX IF NOT EXISTS idx_entregas_contato_id
  ON alissonerp.entregas_venda(contato_id) WHERE contato_id IS NOT NULL;

COMMIT;
