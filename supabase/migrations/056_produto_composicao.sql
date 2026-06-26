-- =============================================
-- MIGRATION 056: Tabela BOM — produto_composicao (composição produto → insumos)
--
-- CONTEXTO:
--   public.produtos: PK = id_produto (BIGINT)
--   alissonerp.insumos: PK = id (INTEGER)
--   Não existe FK cross-schema (public é readonly pela app), mas documentamos a relação.
--
-- ESTRATÉGIA DE MIGRAÇÃO (3 fases):
--   FASE 1 (agora): BOM informativo + custo de pedras via preco_compra_usd × dolar × markup
--   FASE 2: Produtos novos já entram com BOM completo (metal + pedras)
--   FASE 3: Preço do ouro usa BOM.peso_metal com fallback para peso_precificado
--
-- tipo de linha no BOM:
--   'metal'  → peso em gramas, quantidade = peso_g
--   'pedra'  → quantidade em unidades, tamanho em ct/mm para lookup de markup
--   'outro'  → outros insumos (solda, banho, etc.)
-- =============================================

CREATE TABLE IF NOT EXISTS alissonerp.produto_composicao (
  id                SERIAL PRIMARY KEY,
  produto_id        BIGINT NOT NULL,          -- ref public.produtos.id_produto (sem FK cross-schema)
  insumo_id         INTEGER NOT NULL,          -- ref alissonerp.insumos.id
  tipo              VARCHAR(20) NOT NULL       -- 'metal' | 'pedra' | 'outro'
                    CHECK (tipo IN ('metal', 'pedra', 'outro')),
  quantidade        NUMERIC(10,4) NOT NULL DEFAULT 1,  -- gramas (metal) ou unidades (pedra)
  tamanho           NUMERIC(10,4),            -- quilates ou mm (só pedras, para lookup markup)
  unidade_tamanho   VARCHAR(10) DEFAULT 'ct'  -- 'ct' ou 'mm'
                    CHECK (unidade_tamanho IN ('ct', 'mm')),
  preco_compra_usd  NUMERIC(10,4),            -- preço unitário de compra em USD (pedras)
  obrigatorio       BOOLEAN DEFAULT true,
  observacao        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(produto_id, insumo_id)              -- 1 linha por (produto, insumo)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_produto_composicao_produto_id
  ON alissonerp.produto_composicao(produto_id);

CREATE INDEX IF NOT EXISTS idx_produto_composicao_insumo_id
  ON alissonerp.produto_composicao(insumo_id);

CREATE INDEX IF NOT EXISTS idx_produto_composicao_tipo
  ON alissonerp.produto_composicao(tipo);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE
  ON alissonerp.produto_composicao TO authenticated, anon;

GRANT USAGE, SELECT
  ON SEQUENCE alissonerp.produto_composicao_id_seq TO authenticated, anon;

COMMENT ON TABLE alissonerp.produto_composicao IS
  'BOM (Bill of Materials) — composição do produto em insumos. '
  'produto_id ref public.produtos.id_produto | insumo_id ref alissonerp.insumos.id. '
  'tipo=pedra: quantidade em UN, tamanho em ct/mm, preco_compra_usd para cálculo de custo. '
  'tipo=metal: quantidade em gramas (informativo na fase 1; fase 3 substituirá peso_precificado).';

COMMENT ON COLUMN alissonerp.produto_composicao.tamanho IS
  'Tamanho da pedra em quilates (ct) ou mm. Usado para buscar faixa de markup em markup_pedras.';

COMMENT ON COLUMN alissonerp.produto_composicao.preco_compra_usd IS
  'Preço unitário de compra em USD. custo_pedra = preco_compra_usd × cotacao_dolar × markup_pedra.';
