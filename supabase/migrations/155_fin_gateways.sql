-- Migration 155: Gateways de Pagamento
-- Configuração de gateways/contas de recebimento do caixa

CREATE TABLE IF NOT EXISTS alissonerp.fin_gateways (
  id          SERIAL PRIMARY KEY,
  nome        TEXT NOT NULL,
  tipo        VARCHAR(20) NOT NULL DEFAULT 'outro'
                CHECK (tipo IN ('pix', 'cartao', 'dinheiro', 'ouro', 'outro')),
  ativo       BOOLEAN NOT NULL DEFAULT true,
  cor         VARCHAR(7)  DEFAULT '#6B7280',
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- FK ligando pagamento ao gateway configurado
ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS fin_gateway_id   INT         REFERENCES alissonerp.fin_gateways(id) ON DELETE SET NULL;

-- Campos para pagamento em ouro (futura forma)
ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS ouro_gramas      NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS ouro_valor_grama NUMERIC(10,2);

-- Seed: Mercado Pago (único gateway ativo no momento)
INSERT INTO alissonerp.fin_gateways (nome, tipo, cor, obs)
VALUES ('Mercado Pago', 'outro', '#00B1EA', 'PIX e Cartão via Mercado Pago')
ON CONFLICT DO NOTHING;
