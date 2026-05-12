-- ============================================================================
-- Migration 179 — Personalizacao: campos gratis + precificacao dinamica
-- ============================================================================
-- Expande alissonerp.produto_personalizacao para suportar modelo
-- "N campos gratis + preco por campo adicional".
--
-- Exemplo: pingente com 3 nomes gratis, R$ 100 por nome extra.
-- O admin configura via LIA (chat no drawer do produto).
-- A venda renderiza N inputs com botao "+" para adicionar mais.
--
-- Tabelas:
--   alissonerp.produto_personalizacao       — +colunas campos_gratis, preco_campo_adicional
--   alissonerp.produto_personalizacao_regras — regras de formatacao por config
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Novas colunas na config principal
-- ----------------------------------------------------------------------------
ALTER TABLE alissonerp.produto_personalizacao
  ADD COLUMN IF NOT EXISTS campos_gratis INT DEFAULT 1
    CHECK (campos_gratis >= 0);

ALTER TABLE alissonerp.produto_personalizacao
  ADD COLUMN IF NOT EXISTS preco_campo_adicional NUMERIC(10,2)
    CHECK (preco_campo_adicional IS NULL OR preco_campo_adicional >= 0);

COMMENT ON COLUMN alissonerp.produto_personalizacao.campos_gratis IS
  'Quantidade de campos de personalizacao inclusos no preco do produto. Ex: 3 = 3 nomes gratis.';

COMMENT ON COLUMN alissonerp.produto_personalizacao.preco_campo_adicional IS
  'Valor cobrado por campo extra alem de campos_gratis. Ex: 100.00 = R$ 100 por nome adicional. Se NULL, nao permite adicionar campos extras.';

-- ----------------------------------------------------------------------------
-- 2) Tabela de regras de formatacao por config
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.produto_personalizacao_regras (
  id          SERIAL PRIMARY KEY,
  config_id   INT NOT NULL REFERENCES alissonerp.produto_personalizacao(id) ON DELETE CASCADE,

  -- Formatacao automatica aplicada ao valor digitado
  primeira_letra_maiuscula BOOLEAN NOT NULL DEFAULT true,
  sem_espacos              BOOLEAN NOT NULL DEFAULT false,
  sem_numeros              BOOLEAN NOT NULL DEFAULT true,
  sem_simbolos             BOOLEAN NOT NULL DEFAULT true,
  sem_acentos              BOOLEAN NOT NULL DEFAULT false,

  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_personalizacao_regras_config
  ON alissonerp.produto_personalizacao_regras (config_id);

COMMENT ON TABLE alissonerp.produto_personalizacao_regras IS
  'Regras de formatacao automatica para personalizacao. Aplicadas no front-end e validadas no back-end. 1:1 com config.';

COMMENT ON COLUMN alissonerp.produto_personalizacao_regras.primeira_letra_maiuscula IS
  'Se true, converte primeira letra para maiuscula e resto para minusculo automaticamente.';

COMMENT ON COLUMN alissonerp.produto_personalizacao_regras.sem_espacos IS
  'Se true, remove espacos do valor digitado.';

COMMENT ON COLUMN alissonerp.produto_personalizacao_regras.sem_numeros IS
  'Se true, remove numeros do valor digitado.';

COMMENT ON COLUMN alissonerp.produto_personalizacao_regras.sem_simbolos IS
  'Se true, remove simbolos/pontuacao do valor digitado.';

COMMENT ON COLUMN alissonerp.produto_personalizacao_regras.sem_acentos IS
  'Se true, remove acentos do valor digitado.';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION alissonerp.tg_produto_personalizacao_regras_touch_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produto_personalizacao_regras_touch_updated ON alissonerp.produto_personalizacao_regras;
CREATE TRIGGER trg_produto_personalizacao_regras_touch_updated
  BEFORE UPDATE ON alissonerp.produto_personalizacao_regras
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.tg_produto_personalizacao_regras_touch_updated();

-- ----------------------------------------------------------------------------
-- 3) Grants
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.produto_personalizacao_regras TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.produto_personalizacao_regras_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.tg_produto_personalizacao_regras_touch_updated() TO authenticated;

-- ============================================================================
-- Fim migration 179
-- ============================================================================
