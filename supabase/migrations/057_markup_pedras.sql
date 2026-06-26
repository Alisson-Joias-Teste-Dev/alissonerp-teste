-- =============================================
-- MIGRATION 057: Tabela markup_pedras — faixas de markup por tamanho de pedra
--
-- CONTEXTO:
--   Markup OURO: já existe em public.categoria_precificação (por peso, IDs 102-110)
--   Markup PEDRA: não existia → criar aqui, configurável por admin/gerente_loja
--
-- Fórmula pedra:
--   markup_pedra = buscar por tamanho em markup_pedras (interpolação ou faixa)
--   custo_pedra  = preco_compra_usd × cotacao_dolar × markup_pedra
--   preco_pedras = Σ(custo_pedra de todos os itens tipo='pedra' no BOM)
--   preco_total_sync = preco_sync (ouro) + preco_pedras + arredondamento dezena
-- =============================================

CREATE TABLE IF NOT EXISTS alissonerp.markup_pedras (
  id            SERIAL PRIMARY KEY,
  nome          VARCHAR(100) NOT NULL,         -- label descritivo
  tamanho_min   NUMERIC(10,4) NOT NULL,        -- faixa: mínimo (inclusivo)
  tamanho_max   NUMERIC(10,4) NOT NULL,        -- faixa: máximo (exclusivo, exceto última)
  unidade       VARCHAR(10) DEFAULT 'ct'       -- 'ct' (quilate) ou 'mm'
                CHECK (unidade IN ('ct', 'mm')),
  markup        NUMERIC(10,4) NOT NULL,        -- multiplicador: custo × markup = preço
  ativo         BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    UUID,                          -- ref auth.users.id

  CONSTRAINT markup_pedras_range_check CHECK (tamanho_max > tamanho_min)
);

-- Índice para lookup por tamanho
CREATE INDEX IF NOT EXISTS idx_markup_pedras_faixa
  ON alissonerp.markup_pedras(tamanho_min, tamanho_max)
  WHERE ativo = true;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE
  ON alissonerp.markup_pedras TO authenticated, anon;

GRANT USAGE, SELECT
  ON SEQUENCE alissonerp.markup_pedras_id_seq TO authenticated, anon;

-- Dados iniciais (Jonathan pode ajustar via /configuracoes > Precificação)
INSERT INTO alissonerp.markup_pedras (nome, tamanho_min, tamanho_max, unidade, markup)
VALUES
  ('Micro (até 0.03ct)',          0,    0.03,  'ct', 3.0),
  ('Pequenas (0.03–0.10ct)',      0.03, 0.10,  'ct', 2.5),
  ('Médias (0.10–0.30ct)',        0.10, 0.30,  'ct', 2.0),
  ('Grandes (0.30–1.00ct)',       0.30, 1.00,  'ct', 1.8),
  ('Extra Grandes (acima 1.00ct)',1.00, 999.0, 'ct', 1.5)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE alissonerp.markup_pedras IS
  'Faixas de markup por tamanho de pedra (complementa public.categoria_precificação que é por peso de ouro). '
  'Lookup: WHERE tamanho_min <= :tamanho AND tamanho_max > :tamanho AND ativo = true ORDER BY tamanho_min. '
  'Se não encontrar faixa → usar markup da faixa mais próxima ou default.';

COMMENT ON COLUMN alissonerp.markup_pedras.markup IS
  'Multiplicador aplicado sobre custo de compra. Ex: markup=2.5 → custo R$100 → preço R$250.';
