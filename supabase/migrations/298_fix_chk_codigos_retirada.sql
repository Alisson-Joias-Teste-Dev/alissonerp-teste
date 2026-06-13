-- ============================================================
-- Migration 298 — Corrige a trava chk_codigos_obrigatorios (2026-06-12)
--
-- REGRA DE NEGÓCIO:
-- O QUE: a trava da migration 294 exigia codigo_cliente E codigo_motoboy para
--   TODA entrega não-avulsa. Mas entrega de RETIRADA NA LOJA não tem motoboy —
--   o código (entrega-venda.ts) só gera codigo_motoboy quando forma_entrega =
--   'motoboy'. Resultado: toda retirada nova falhava com
--   chk_codigos_obrigatorios (erro 23514).
-- POR QUE: o código de motoboy só faz sentido quando há motoboy. Retirada exige
--   só o código do cliente (Código A). Os "17 registros históricos com
--   codigo_motoboy=NULL" citados na migration 294 eram justamente retiradas.
-- IMPACTO SE REMOVIDO/ERRADO: ou retirada volta a quebrar (trava estrita), ou
--   entrega via motoboy passa sem o Código B (trava frouxa demais).
--
-- Nova regra:
--   • is_avulso = true                  → não exige código (confirmação por botão)
--   • forma_entrega = 'motoboy'         → exige codigo_cliente E codigo_motoboy
--   • demais (retirada etc.)            → exige só codigo_cliente
--
-- Database Safety §2: CREATE/DROP de CHECK (não toca dados). NOT VALID para não
-- reprocessar histórico (mesma postura da 294).
-- ============================================================

BEGIN;

SET search_path TO alissonerp;

ALTER TABLE alissonerp.entregas_venda
  DROP CONSTRAINT IF EXISTS chk_codigos_obrigatorios;

ALTER TABLE alissonerp.entregas_venda
  ADD CONSTRAINT chk_codigos_obrigatorios
    CHECK (
      is_avulso = true
      OR (
        codigo_cliente IS NOT NULL
        AND (forma_entrega <> 'motoboy' OR codigo_motoboy IS NOT NULL)
      )
    ) NOT VALID;

COMMIT;

-- ============================================================
-- Fim migration 298
-- ============================================================
