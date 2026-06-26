-- ============================================================================
-- Migration 162 — Produto Personalizacao
-- ============================================================================
-- Permite cadastrar restricoes de personalizacao por produto (ex: "nome gravado
-- com maximo N letras"), aplicadas automaticamente no wizard de venda e
-- propagadas para itens_ordem (o ourives le pra saber o que gravar).
--
-- Tabelas:
--   alissonerp.produto_personalizacao   — config por produto (1:1)
--   alissonerp.itens_venda_erp          — +coluna personalizacao JSONB (aditivo)
--   alissonerp.itens_ordem              — +coluna personalizacao JSONB (aditivo)
--
-- Seed: popula familia SKU 1566-N (1 a 10 letras) baseada no SKU.
--
-- Seguranca:
--   - CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE
--   - ALTER TABLE ADD COLUMN IF NOT EXISTS (nao quebra triggers existentes)
--   - FK ON DELETE CASCADE: se produto for deletado do catalogo, config some junto
--   - ON CONFLICT (produto_id) DO NOTHING no seed (idempotente)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabela de config de personalizacao por produto
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.produto_personalizacao (
  id              SERIAL PRIMARY KEY,
  produto_id      BIGINT NOT NULL UNIQUE REFERENCES public.produtos(id_produto) ON DELETE CASCADE,

  tipo            VARCHAR(20)  NOT NULL DEFAULT 'nome'
                  CHECK (tipo IN ('nome','iniciais','data','numero','simbolo','livre')),
  obrigatorio     BOOLEAN      NOT NULL DEFAULT true,

  min_caracteres  INT          NOT NULL DEFAULT 1 CHECK (min_caracteres >= 0),
  max_caracteres  INT          NOT NULL            CHECK (max_caracteres >= min_caracteres),

  caracteres_permitidos VARCHAR(30) NOT NULL DEFAULT 'alfa_acento_espaco'
                  CHECK (caracteres_permitidos IN (
                    'alfa',
                    'alfa_acento',
                    'alfa_acento_espaco',
                    'alfanum',
                    'alfanum_acento_espaco',
                    'numero',
                    'qualquer'
                  )),

  label           VARCHAR(100) NOT NULL DEFAULT 'Nome a gravar',
  placeholder     VARCHAR(100),
  exemplo         VARCHAR(100),
  observacao      TEXT,
  ativo           BOOLEAN      NOT NULL DEFAULT true,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE alissonerp.produto_personalizacao IS
  'Config de personalizacao por produto (ex: nome gravado com max N letras). 1 linha = 1 produto. Validacao aplicada no wizard de venda e na criacao de itens de ordem.';

COMMENT ON COLUMN alissonerp.produto_personalizacao.tipo IS
  'Tipo de dado a personalizar: nome | iniciais | data | numero | simbolo | livre.';

COMMENT ON COLUMN alissonerp.produto_personalizacao.caracteres_permitidos IS
  'alfa=A-Z | alfa_acento=A-Z+acentos | alfa_acento_espaco=A-Z+acentos+espacos | alfanum=A-Z+0-9 | alfanum_acento_espaco | numero=0-9 | qualquer.';

COMMENT ON COLUMN alissonerp.produto_personalizacao.obrigatorio IS
  'Se true, venda nao pode ser finalizada sem o campo preenchido.';

CREATE INDEX IF NOT EXISTS idx_produto_personalizacao_ativo
  ON alissonerp.produto_personalizacao (produto_id)
  WHERE ativo = true;

-- Trigger updated_at (inline, nao depende de fn compartilhada)
CREATE OR REPLACE FUNCTION alissonerp.tg_produto_personalizacao_touch_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produto_personalizacao_touch_updated ON alissonerp.produto_personalizacao;
CREATE TRIGGER trg_produto_personalizacao_touch_updated
  BEFORE UPDATE ON alissonerp.produto_personalizacao
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.tg_produto_personalizacao_touch_updated();

-- ----------------------------------------------------------------------------
-- 2) JSONB em itens_venda_erp (aditivo, nao quebra triggers existentes)
-- ----------------------------------------------------------------------------
ALTER TABLE alissonerp.itens_venda_erp
  ADD COLUMN IF NOT EXISTS personalizacao JSONB;

COMMENT ON COLUMN alissonerp.itens_venda_erp.personalizacao IS
  'Personalizacao aplicada no item. Ex: {"tipo":"nome","valor":"JOAO","max_caracteres":4,"label":"Nome a gravar"}. Snapshot da config no momento da venda — preserva historia mesmo se admin mudar regra depois. Propaga para itens_ordem.personalizacao.';

-- ----------------------------------------------------------------------------
-- 3) JSONB em itens_ordem (aditivo)
-- ----------------------------------------------------------------------------
ALTER TABLE alissonerp.itens_ordem
  ADD COLUMN IF NOT EXISTS personalizacao JSONB;

COMMENT ON COLUMN alissonerp.itens_ordem.personalizacao IS
  'Personalizacao propagada da venda (copia do itens_venda_erp.personalizacao). Ourives/fabrica le pra saber o que gravar na peca.';

-- ----------------------------------------------------------------------------
-- 4) Seed automatico para a familia SKU 1566-N
--    Extrai N do SKU "1566-N" via split_part e popula max_caracteres=N.
--    Nota: PostgreSQL 'substring FROM <regex>' nao captura grupo; usar split_part.
--    Idempotente: ON CONFLICT DO NOTHING.
-- ----------------------------------------------------------------------------
INSERT INTO alissonerp.produto_personalizacao (
  produto_id,
  tipo,
  obrigatorio,
  min_caracteres,
  max_caracteres,
  caracteres_permitidos,
  label,
  placeholder,
  exemplo
)
SELECT
  p.id_produto,
  'nome',
  true,
  1,
  split_part(p.sku, '-', 2)::INT,
  'alfa_acento_espaco',
  'Nome a gravar',
  'Ex: JOAO',
  'MARIA'
FROM public.produtos p
WHERE p.sku ~ '^1566-[0-9]+$'
  AND p.situacao = 'A'
ON CONFLICT (produto_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5) Grants
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.produto_personalizacao TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.produto_personalizacao_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.tg_produto_personalizacao_touch_updated() TO authenticated;

-- ============================================================================
-- Fim migration 162
-- ============================================================================
