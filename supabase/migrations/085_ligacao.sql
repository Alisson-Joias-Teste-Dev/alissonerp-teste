-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 085: Módulo Ligação (24k → 18k)
-- Transforma Ouro 24k fino em Ouro 18k adicionando liga metálica
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. INSUMOS FALTANTES
-- Criar insumos de liga (categoria=3) e Ouro 18k Rosé (categoria=1)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO alissonerp.insumos (nome, sku, categoria_id, unidade, ativo)
SELECT 'Ouro 18k Rosé', 'OURO-18K-RO', 1, 'g', true
WHERE NOT EXISTS (SELECT 1 FROM alissonerp.insumos WHERE sku = 'OURO-18K-RO');

INSERT INTO alissonerp.insumos (nome, sku, categoria_id, unidade, ativo)
SELECT 'Liga Amarela', 'LIGA-AM', 3, 'g', true
WHERE NOT EXISTS (SELECT 1 FROM alissonerp.insumos WHERE sku = 'LIGA-AM');

INSERT INTO alissonerp.insumos (nome, sku, categoria_id, unidade, ativo)
SELECT 'Liga Branca', 'LIGA-BR', 3, 'g', true
WHERE NOT EXISTS (SELECT 1 FROM alissonerp.insumos WHERE sku = 'LIGA-BR');

INSERT INTO alissonerp.insumos (nome, sku, categoria_id, unidade, ativo)
SELECT 'Liga Rosé', 'LIGA-RO', 3, 'g', true
WHERE NOT EXISTS (SELECT 1 FROM alissonerp.insumos WHERE sku = 'LIGA-RO');

-- Verificação:
-- SELECT id, nome, sku, categoria_id FROM alissonerp.insumos WHERE sku IN ('OURO-18K-RO','LIGA-AM','LIGA-BR','LIGA-RO');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TEOR PARA 18K ROSÉ (na tabela teores_ouro, usada na purificação)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO alissonerp.teores_ouro (insumo_id, nome, teor, ativo)
SELECT i.id, 'Ouro 18k Rosé', 0.6900, true
FROM alissonerp.insumos i
WHERE i.sku = 'OURO-18K-RO'
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.teores_ouro t WHERE t.insumo_id = i.id
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. MARCADORES ENUM
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  enum_oid oid;
BEGIN
  SELECT oid INTO enum_oid
  FROM pg_type
  WHERE typname = 'enum_marcador_estoque'
    AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp');

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LIGA_SAIDA_24K' AND enumtypid = enum_oid) THEN
    ALTER TYPE alissonerp.enum_marcador_estoque ADD VALUE 'LIGA_SAIDA_24K';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LIGA_SAIDA_LIGA' AND enumtypid = enum_oid) THEN
    ALTER TYPE alissonerp.enum_marcador_estoque ADD VALUE 'LIGA_SAIDA_LIGA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LIGA_ENTRADA_18K' AND enumtypid = enum_oid) THEN
    ALTER TYPE alissonerp.enum_marcador_estoque ADD VALUE 'LIGA_ENTRADA_18K';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'LIGA_CANCEL' AND enumtypid = enum_oid) THEN
    ALTER TYPE alissonerp.enum_marcador_estoque ADD VALUE 'LIGA_CANCEL';
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TABELA LIGAÇÕES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alissonerp.ligacoes (
  id SERIAL PRIMARY KEY,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'em_processo',
  -- 'em_processo' | 'concluida' | 'cancelada'

  -- ── ENTRADA (o que entra na fundição) ──
  tipo_18k_insumo_id INTEGER NOT NULL REFERENCES alissonerp.insumos(id),
  tipo_18k_nome      VARCHAR(100) NOT NULL,
  liga_insumo_id     INTEGER NOT NULL REFERENCES alissonerp.insumos(id),
  liga_nome          VARCHAR(100) NOT NULL,

  -- Pesos e teor
  peso_24k              NUMERIC(10,3) NOT NULL,
  teor                  NUMERIC(5,4) NOT NULL,
  peso_liga_calculado   NUMERIC(10,3) NOT NULL,
  peso_18k_esperado     NUMERIC(10,3) NOT NULL,

  -- Foto envio (24k + liga na balança)
  foto_envio        TEXT,
  observacao_envio  TEXT,
  data_envio        TIMESTAMPTZ DEFAULT NOW(),
  criado_por        UUID NOT NULL,

  -- ── RESULTADO (18k produzido) ──
  peso_18k_real        NUMERIC(10,3),
  perda_processo       NUMERIC(10,3),
  perda_percentual     NUMERIC(5,2),
  foto_resultado       TEXT,
  observacao_resultado TEXT,
  data_conclusao       TIMESTAMPTZ,
  concluido_por        UUID,

  -- ── AUDITORIA ──
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ligacoes_status ON alissonerp.ligacoes(status);
CREATE INDEX IF NOT EXISTS idx_ligacoes_data   ON alissonerp.ligacoes(data_envio);

COMMENT ON TABLE alissonerp.ligacoes IS
  'Ligação: transforma Ouro 24k fino em Ouro 18k adicionando liga metálica italiana.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TABELA MAPEAMENTO LIGA ↔ TIPO 18K
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alissonerp.liga_tipo_ouro (
  id                   SERIAL PRIMARY KEY,
  tipo_18k_insumo_id   INTEGER NOT NULL REFERENCES alissonerp.insumos(id),
  liga_insumo_id       INTEGER NOT NULL REFERENCES alissonerp.insumos(id),
  nome                 VARCHAR(100) NOT NULL,
  teor_default         NUMERIC(5,4) NOT NULL DEFAULT 0.7500,
  ativo                BOOLEAN DEFAULT true,
  UNIQUE(tipo_18k_insumo_id)
);

COMMENT ON TABLE alissonerp.liga_tipo_ouro IS
  'Mapeia qual liga usar para cada tipo de Ouro 18k. teor_default = teor alvo da fundição (ex: 0.75 para 18k).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. INSERIR MAPEAMENTOS (após criar os insumos acima)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO alissonerp.liga_tipo_ouro (tipo_18k_insumo_id, liga_insumo_id, nome, teor_default)
SELECT
  (SELECT id FROM alissonerp.insumos WHERE sku = 'OURO-18K-AM'),
  (SELECT id FROM alissonerp.insumos WHERE sku = 'LIGA-AM'),
  '18k Amarelo → Liga Amarela',
  0.7500
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.liga_tipo_ouro
  WHERE tipo_18k_insumo_id = (SELECT id FROM alissonerp.insumos WHERE sku = 'OURO-18K-AM')
);

INSERT INTO alissonerp.liga_tipo_ouro (tipo_18k_insumo_id, liga_insumo_id, nome, teor_default)
SELECT
  (SELECT id FROM alissonerp.insumos WHERE sku = 'AU1006'),
  (SELECT id FROM alissonerp.insumos WHERE sku = 'LIGA-BR'),
  '18k Branco → Liga Branca',
  0.7500
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.liga_tipo_ouro
  WHERE tipo_18k_insumo_id = (SELECT id FROM alissonerp.insumos WHERE sku = 'AU1006')
);

INSERT INTO alissonerp.liga_tipo_ouro (tipo_18k_insumo_id, liga_insumo_id, nome, teor_default)
SELECT
  (SELECT id FROM alissonerp.insumos WHERE sku = 'OURO-18K-RO'),
  (SELECT id FROM alissonerp.insumos WHERE sku = 'LIGA-RO'),
  '18k Rosé → Liga Rosé',
  0.7500
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.liga_tipo_ouro
  WHERE tipo_18k_insumo_id = (SELECT id FROM alissonerp.insumos WHERE sku = 'OURO-18K-RO')
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. GRANTS
-- ─────────────────────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.ligacoes        TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.ligacoes_id_seq         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.liga_tipo_ouro  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.liga_tipo_ouro_id_seq   TO authenticated;
