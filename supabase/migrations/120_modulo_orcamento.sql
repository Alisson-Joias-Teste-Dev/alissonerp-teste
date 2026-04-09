-- ============================================================
-- Migration 120: Módulo de Orçamento (Alianças + Peças)
-- ============================================================

-- 1. Configuração global do orçamento de alianças
CREATE TABLE IF NOT EXISTS alissonerp.config_orcamento (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(50) NOT NULL DEFAULT 'default' UNIQUE,
  start_mkp       NUMERIC(6,2) NOT NULL DEFAULT 3.5,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  gold_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  camera_override NUMERIC(6,1),
  profile         VARCHAR(30) DEFAULT 'Anatomica',
  pricing_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  groove_rules    JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id)
);

-- Seed config default
INSERT INTO alissonerp.config_orcamento (name, start_mkp, pricing_categories, groove_rules)
VALUES (
  'default',
  3.5,
  '[{"id":1,"name":"Leves","maxWeight":5.0,"variation":0.5,"step":0.1,"color":"text-slate-600"},{"id":2,"name":"Médias","maxWeight":15.0,"variation":0.8,"step":0.5,"color":"text-blue-600"},{"id":3,"name":"Pesadas","maxWeight":50.0,"variation":0.4,"step":0.5,"color":"text-indigo-600"},{"id":4,"name":"Ultra Pesadas","maxWeight":500.0,"variation":0.3,"step":0.5,"color":"text-purple-700"}]'::jsonb,
  '[{"id":1,"ringWidth":2.0,"grooveWidth":0.2,"grooveDepth":0.2,"grooveOffset":0.5},{"id":2,"ringWidth":3.0,"grooveWidth":0.5,"grooveDepth":0.3,"grooveOffset":0.6},{"id":3,"ringWidth":4.0,"grooveWidth":0.8,"grooveDepth":0.3,"grooveOffset":0.8},{"id":4,"ringWidth":5.0,"grooveWidth":1.0,"grooveDepth":0.4,"grooveOffset":1.0},{"id":5,"ringWidth":6.0,"grooveWidth":1.2,"grooveDepth":0.4,"grooveOffset":1.2}]'::jsonb
)
ON CONFLICT (name) DO NOTHING;

-- 2. Fichas técnicas de orçamento
CREATE TABLE IF NOT EXISTS alissonerp.orcamento_fichas_tecnicas (
  id               SERIAL PRIMARY KEY,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  modelo           VARCHAR(50),
  aro_numeracao    VARCHAR(20),
  largura          NUMERIC(5,2),
  espessura        NUMERIC(5,2),
  peso_estimado    NUMERIC(8,3),
  tipo_fonte       VARCHAR(20),
  texto            VARCHAR(200),
  qtd_pedras       INT,
  tamanho_pedra    NUMERIC(4,2),
  tipo_aplicacao_pedra VARCHAR(30),
  perfil           VARCHAR(30),
  diametro         NUMERIC(6,2),
  densidade_ouro   NUMERIC(6,2),
  cor_metal        VARCHAR(10),
  profundidade_concava NUMERIC(4,2),
  friso_lado       VARCHAR(10),
  friso_largura    NUMERIC(4,2),
  friso_profundidade NUMERIC(4,2),
  friso_offset     NUMERIC(4,2),
  canal_largura    NUMERIC(4,2),
  canal_borda_altura NUMERIC(4,2),
  chanfro_tamanho  NUMERIC(4,2),
  dome_porcentagem INT,
  pedra_fileiras   INT,
  pedra_drill      BOOLEAN DEFAULT false,
  pedra_meia_lua   BOOLEAN DEFAULT false,
  pedra_volta_completa BOOLEAN DEFAULT false
);

-- 3. Orçamentos
CREATE TABLE IF NOT EXISTS alissonerp.orcamentos (
  id                SERIAL PRIMARY KEY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  numero_orcamento  VARCHAR(30) NOT NULL,
  tipo              VARCHAR(20) NOT NULL DEFAULT 'alianca', -- 'alianca' | 'peca'
  vendedor_id       INT,
  usuario_id        UUID REFERENCES auth.users(id),
  nome_cliente      VARCHAR(200) NOT NULL,
  nome_modelo       VARCHAR(100),
  peso              NUMERIC(8,3),
  valor             NUMERIC(12,2),
  markup            NUMERIC(6,2),
  desconto_pct      NUMERIC(5,2) DEFAULT 0,
  cotacao_ouro      NUMERIC(10,2),
  ficha_tecnica_id  INT REFERENCES alissonerp.orcamento_fichas_tecnicas(id),
  status            VARCHAR(20) NOT NULL DEFAULT 'rascunho', -- rascunho, enviado, aprovado, rejeitado, convertido
  observacoes       TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_orcamentos_usuario ON alissonerp.orcamentos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_vendedor ON alissonerp.orcamentos(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON alissonerp.orcamentos(status);
CREATE INDEX IF NOT EXISTS idx_orcamentos_created ON alissonerp.orcamentos(created_at DESC);

-- Sequence para número do orçamento
CREATE SEQUENCE IF NOT EXISTS alissonerp.orcamento_seq START 1;
