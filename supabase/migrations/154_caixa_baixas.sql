-- Migration 154: Módulo de Baixa de Caixa (Dinheiro)
-- Controla o fechamento/baixa do dinheiro recebido na loja

-- Tabela de registros de baixa de caixa
CREATE TABLE IF NOT EXISTS alissonerp.fin_caixa_baixas (
  id              SERIAL PRIMARY KEY,
  total           NUMERIC(12,2) NOT NULL,
  qtd_pagamentos  INT           NOT NULL,
  realizado_por   UUID,
  realizado_nome  TEXT,
  obs             TEXT,
  created_at      TIMESTAMPTZ   DEFAULT now()
);

-- Referência de qual baixa liquidou cada pagamento em dinheiro
ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS caixa_baixa_id INT
    REFERENCES alissonerp.fin_caixa_baixas(id) ON DELETE SET NULL;

-- Índice para busca rápida de pagamentos pendentes de baixa
CREATE INDEX IF NOT EXISTS idx_pagamentos_venda_baixa
  ON alissonerp.pagamentos_venda(caixa_baixa_id)
  WHERE forma = 'Dinheiro' AND status = 'confirmado';
