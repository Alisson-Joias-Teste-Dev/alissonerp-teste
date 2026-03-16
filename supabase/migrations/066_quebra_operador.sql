-- Migration 066: Tabela quebra_operador + views dashboard ouro
-- Registra quebra de ouro por operador em transferências e saídas PCP.
-- REGRA: Pote (depósito ID=1) NUNCA registra quebra.

-- ─── TABELA PRINCIPAL ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.quebra_operador (
  id SERIAL PRIMARY KEY,

  -- Referências
  ordem_id   INTEGER NOT NULL,
  pcp_id     INTEGER NOT NULL,
  deposito_id INTEGER NOT NULL,
  setor_id    INTEGER,
  insumo_id   INTEGER NOT NULL DEFAULT 1,

  -- Desnormalizado (dashboard sem JOINs)
  numero_ordem  VARCHAR(20),
  deposito_nome VARCHAR(100),
  setor_nome    VARCHAR(100),
  insumo_nome   VARCHAR(100) DEFAULT 'Ouro 18k Amarelo',

  -- Tipo de movimentação que gerou a quebra
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('transferencia', 'saida_pcp')),

  -- Dados de quebra
  ouro_recebido      NUMERIC(10,4) NOT NULL,
  ouro_entregue      NUMERIC(10,4) NOT NULL,
  quebra             NUMERIC(10,4) NOT NULL,
  percentual_quebra  NUMERIC(10,2),

  -- Rastreamento
  data_registro TIMESTAMPTZ DEFAULT NOW(),
  created_by    UUID
);

COMMENT ON TABLE alissonerp.quebra_operador IS
  'Quebra de ouro por operador. Registrada em transferências operador→operador e saídas PCP. Pote (dep ID=1) NUNCA registra.';

-- ─── ÍNDICES ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_quebra_op_deposito_periodo
  ON alissonerp.quebra_operador(deposito_id, data_registro);
CREATE INDEX IF NOT EXISTS idx_quebra_op_setor_periodo
  ON alissonerp.quebra_operador(setor_id, data_registro);
CREATE INDEX IF NOT EXISTS idx_quebra_op_ordem
  ON alissonerp.quebra_operador(ordem_id);
CREATE INDEX IF NOT EXISTS idx_quebra_op_periodo
  ON alissonerp.quebra_operador(data_registro);
CREATE INDEX IF NOT EXISTS idx_quebra_op_tipo
  ON alissonerp.quebra_operador(tipo, data_registro);

-- ─── GRANTS ────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON alissonerp.quebra_operador TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.quebra_operador_id_seq TO authenticated;

-- ─── VIEW: saldo de ouro no almoxarifado (pote) ────────────────────────────
CREATE OR REPLACE VIEW alissonerp.vw_saldo_pote_ouro AS
SELECT
  i.id   AS insumo_id,
  i.nome AS insumo_nome,
  COALESCE(SUM(me.entrada), 0) - COALESCE(SUM(me.saida), 0) AS saldo_g
FROM alissonerp.movimentacoes_estoque me
JOIN alissonerp.insumos i ON i.id = me.insumo_id
WHERE me.deposito_id = 1
  AND i.categoria_id = 1
GROUP BY i.id, i.nome
HAVING COALESCE(SUM(me.entrada), 0) - COALESCE(SUM(me.saida), 0) != 0;

GRANT SELECT ON alissonerp.vw_saldo_pote_ouro TO authenticated;

-- ─── VIEW: ouro em produção (por operador) ─────────────────────────────────
CREATE OR REPLACE VIEW alissonerp.vw_ouro_em_producao AS
SELECT
  d.id   AS deposito_id,
  d.nome AS deposito_nome,
  COALESCE(SUM(me.entrada), 0) - COALESCE(SUM(me.saida), 0) AS ouro_g
FROM alissonerp.movimentacoes_estoque me
JOIN alissonerp.insumos i ON i.id = me.insumo_id
JOIN alissonerp.depositos d ON d.id = me.deposito_id
WHERE me.deposito_id != 1
  AND i.categoria_id = 1
GROUP BY d.id, d.nome
HAVING COALESCE(SUM(me.entrada), 0) - COALESCE(SUM(me.saida), 0) != 0;

GRANT SELECT ON alissonerp.vw_ouro_em_producao TO authenticated;

-- ─── VIEW: quebra agrupada por operador (dashboard) ────────────────────────
CREATE OR REPLACE VIEW alissonerp.vw_quebra_operadores AS
SELECT
  deposito_id,
  deposito_nome,
  setor_nome,
  count(*)            AS total_registros,
  SUM(ouro_recebido)  AS total_recebido,
  SUM(ouro_entregue)  AS total_entregue,
  SUM(quebra)         AS total_quebra,
  CASE WHEN SUM(ouro_recebido) > 0
    THEN ROUND((SUM(quebra) / SUM(ouro_recebido) * 100)::numeric, 2)
    ELSE 0
  END                 AS percentual_medio,
  MIN(data_registro)  AS primeiro_registro,
  MAX(data_registro)  AS ultimo_registro
FROM alissonerp.quebra_operador
GROUP BY deposito_id, deposito_nome, setor_nome;

GRANT SELECT ON alissonerp.vw_quebra_operadores TO authenticated;
