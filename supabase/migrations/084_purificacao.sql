-- ═══════════════════════════════════════════════════
-- MIGRATION 084 — Módulo de Purificação de Ouro
-- Executado em: 20/03/2026
-- ═══════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════
-- INSUMO: Ouro 24k (Fino)
-- ═══════════════════════════════════════════════════

INSERT INTO alissonerp.insumos (nome, categoria_id, unidade, ativo, sku)
SELECT 'Ouro 24k (Fino)', 1, 'g', true, 'OURO-24K'
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.insumos WHERE sku = 'OURO-24K'
);

-- ═══════════════════════════════════════════════════
-- TABELA: Configuração de teores por tipo de ouro
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alissonerp.teores_ouro (
  id SERIAL PRIMARY KEY,
  insumo_id INTEGER NOT NULL REFERENCES alissonerp.insumos(id),
  nome VARCHAR(100) NOT NULL,
  teor NUMERIC(5,4) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(insumo_id)
);

COMMENT ON TABLE alissonerp.teores_ouro IS
  'Teor de ouro puro por tipo de liga. 18k = 0.75, 14k = 0.583, etc.';
COMMENT ON COLUMN alissonerp.teores_ouro.teor IS
  'Fração de ouro puro (0 a 1). Ex: 0.7500 = 75% = 18 quilates';

-- Teores padrão (IDs baseados no banco real em produção)
-- ID 1 = Ouro 18k Amarelo
INSERT INTO alissonerp.teores_ouro (insumo_id, nome, teor)
VALUES (1, 'Ouro 18k Amarelo', 0.7500)
ON CONFLICT (insumo_id) DO NOTHING;

-- ID 273 = OURO BRANCO
INSERT INTO alissonerp.teores_ouro (insumo_id, nome, teor)
VALUES (273, 'OURO BRANCO', 0.7500)
ON CONFLICT (insumo_id) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- TABELA: Purificações
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alissonerp.purificacoes (
  id SERIAL PRIMARY KEY,
  status VARCHAR(20) NOT NULL DEFAULT 'em_processo',
  itens JSONB NOT NULL DEFAULT '[]',
  peso_total_enviado NUMERIC(10,2) NOT NULL,
  teor_medio NUMERIC(5,4) NOT NULL,
  peso_esperado_24k NUMERIC(10,2) NOT NULL,
  foto_envio TEXT,
  observacao_envio TEXT,
  data_envio TIMESTAMPTZ DEFAULT NOW(),
  criado_por UUID NOT NULL,
  peso_retornado_24k NUMERIC(10,2),
  perda_processo NUMERIC(10,2),
  perda_percentual NUMERIC(5,2),
  foto_retorno TEXT,
  observacao_retorno TEXT,
  data_retorno TIMESTAMPTZ,
  concluido_por UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purificacoes_status ON alissonerp.purificacoes(status);
CREATE INDEX IF NOT EXISTS idx_purificacoes_data ON alissonerp.purificacoes(data_envio);

COMMENT ON TABLE alissonerp.purificacoes IS
  'Purificação interna de ouro 18k → 24k fino. Baixa 18k do pote, entrada 24k no retorno.';

-- ═══════════════════════════════════════════════════
-- MARCADORES de estoque
-- ═══════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PURIF_SAIDA' AND enumtypid = (
    SELECT oid FROM pg_type WHERE typname = 'enum_marcador_estoque'
    AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp')
  )) THEN
    ALTER TYPE alissonerp.enum_marcador_estoque ADD VALUE 'PURIF_SAIDA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PURIF_ENTRADA' AND enumtypid = (
    SELECT oid FROM pg_type WHERE typname = 'enum_marcador_estoque'
    AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp')
  )) THEN
    ALTER TYPE alissonerp.enum_marcador_estoque ADD VALUE 'PURIF_ENTRADA';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PURIF_CANCEL' AND enumtypid = (
    SELECT oid FROM pg_type WHERE typname = 'enum_marcador_estoque'
    AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp')
  )) THEN
    ALTER TYPE alissonerp.enum_marcador_estoque ADD VALUE 'PURIF_CANCEL';
  END IF;
END$$;

-- ═══════════════════════════════════════════════════
-- BUCKET: purificacao-fotos
-- ═══════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('purificacao-fotos', 'purificacao-fotos', true, 10485760, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════
-- GRANTS
-- ═══════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.purificacoes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.purificacoes_id_seq TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.teores_ouro TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.teores_ouro_id_seq TO authenticated;
