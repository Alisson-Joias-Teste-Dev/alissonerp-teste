-- Migration 291: Pagamento de motoboys (lote semanal + histórico)
--
-- REGRA DE NEGÓCIO: o pagamento dos motoboys é feito em lote (semanalmente).
-- Cada pagamento agrupa N entregas confirmadas e registra histórico para
-- auditoria e filtro no app do entregador.
--
-- Tabelas:
--   pagamentos_motoboy       — cabeçalho do pagamento (lote)
--   pagamentos_motoboy_itens — entregas incluídas no pagamento (1:N)
--
-- IMPACTO SE REMOVIDO: perde-se controle financeiro e histórico de
-- pagamentos a motoboys.

SET search_path TO alissonerp, public;

-- 1. Cabeçalho do pagamento
CREATE TABLE IF NOT EXISTS alissonerp.pagamentos_motoboy (
  id            SERIAL PRIMARY KEY,
  motoboy_id    UUID NOT NULL REFERENCES auth.users(id),

  -- Período coberto pelo pagamento
  data_inicio   DATE,
  data_fim      DATE,

  valor_total   NUMERIC(12,2) NOT NULL CHECK (valor_total > 0),
  observacoes   TEXT,

  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_motoboy_motoboy
  ON alissonerp.pagamentos_motoboy(motoboy_id, created_at DESC);

-- 2. Entregas incluídas no pagamento
-- REGRA DE NEGÓCIO: cada entrega só pode ser paga 1x (UNIQUE em entrega_id)
CREATE TABLE IF NOT EXISTS alissonerp.pagamentos_motoboy_itens (
  id               SERIAL PRIMARY KEY,
  pagamento_id     INTEGER NOT NULL REFERENCES alissonerp.pagamentos_motoboy(id) ON DELETE CASCADE,
  entrega_id       INTEGER NOT NULL REFERENCES alissonerp.entregas_venda(id),
  frete_motoboy    NUMERIC(12,2) NOT NULL CHECK (frete_motoboy >= 0),

  -- Garantia anti-duplicação
  UNIQUE(entrega_id)
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_motoboy_itens_pagamento
  ON alissonerp.pagamentos_motoboy_itens(pagamento_id);
