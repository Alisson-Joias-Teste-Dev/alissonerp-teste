-- Migration 156: tabela de apontamentos intermediários de serviço
-- Operadores podem registrar consumo de insumos (fecho, corrente, etc.)
-- sem precisar concluir a ordem.

CREATE TABLE IF NOT EXISTS alissonerp.apontamentos_servico (
  id              BIGSERIAL PRIMARY KEY,
  servico_id      INT NOT NULL REFERENCES alissonerp.servicos(id) ON DELETE CASCADE,
  operador_id     INT REFERENCES alissonerp.depositos(id),
  operador_nome   TEXT,
  insumo_id       INT NOT NULL REFERENCES alissonerp.insumos(id),
  insumo_nome     TEXT,
  quantidade      NUMERIC(10,4) NOT NULL,
  movimentacao_id BIGINT REFERENCES alissonerp.movimentacoes_estoque(id),
  foto_url        TEXT,
  obs             TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apontamentos_servico_servico_id
  ON alissonerp.apontamentos_servico (servico_id);

CREATE INDEX IF NOT EXISTS idx_apontamentos_servico_operador_id
  ON alissonerp.apontamentos_servico (operador_id);
