-- =============================================
-- MIGRATION 009: CONTROLE DE ESTOQUE
-- =============================================
SET search_path TO alissonerp;

CREATE TABLE alissonerp.movimentacoes_estoque (
  id BIGSERIAL PRIMARY KEY,
  entrada REAL DEFAULT 0,
  saida REAL DEFAULT 0,
  insumo_id INTEGER NOT NULL REFERENCES alissonerp.insumos(id),
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  setor_id INTEGER REFERENCES alissonerp.setores(id),
  ordem_id INTEGER REFERENCES alissonerp.ordens(id),
  marcador alissonerp.enum_marcador_estoque,
  obs TEXT,
  data_hora TIMESTAMPTZ DEFAULT now(),
  valor_total DECIMAL(12,2),
  preco_compra DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_mov_insumo   ON alissonerp.movimentacoes_estoque(insumo_id);
CREATE INDEX idx_mov_deposito ON alissonerp.movimentacoes_estoque(deposito_id);
CREATE INDEX idx_mov_ordem    ON alissonerp.movimentacoes_estoque(ordem_id);
CREATE INDEX idx_mov_marcador ON alissonerp.movimentacoes_estoque(marcador);
CREATE INDEX idx_mov_data     ON alissonerp.movimentacoes_estoque(data_hora);
CREATE INDEX idx_mov_dep_ins  ON alissonerp.movimentacoes_estoque(deposito_id, insumo_id);

CREATE TABLE alissonerp.lancamentos_avulso (
  id SERIAL PRIMARY KEY,
  tipo_lancamento alissonerp.enum_tipo_lancamento NOT NULL,
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  setor_id INTEGER REFERENCES alissonerp.setores(id),
  insumo_id INTEGER REFERENCES alissonerp.insumos(id),
  peso REAL,
  obs TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- View: saldo em tempo real por depósito e insumo
CREATE VIEW alissonerp.vw_saldo_estoque AS
SELECT
  deposito_id,
  insumo_id,
  COALESCE(SUM(entrada), 0) - COALESCE(SUM(saida), 0) AS saldo,
  COUNT(*) AS total_movimentacoes,
  MAX(data_hora) AS ultima_movimentacao
FROM alissonerp.movimentacoes_estoque
GROUP BY deposito_id, insumo_id;

-- View: leitura do controle_estoque do Directus (comparação/migração)
CREATE VIEW alissonerp.vw_estoque_directus AS
SELECT
  ce.id,
  ce.entrada,
  ce.saida,
  ce.insumo_id,
  ce.deposito_id,
  ce.setor,
  ce.marcador,
  ce.ordem_id,
  ce.data_hora,
  ce.date_created
FROM directus.controle_estoque ce;
