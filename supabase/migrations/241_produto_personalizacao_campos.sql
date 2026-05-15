-- ============================================================================
-- Migration 241 — Produto Personalizacao Multi-Campos
-- ============================================================================
-- Evolucao do sistema de personalizacao para suportar N campos por produto.
-- Permite que um produto tenha multiplos campos de personalizacao
-- (ex: AJ5270 aceita 3 nomes completos) sem precisar de programador.
--
-- Tambem adiciona colunas de configuracao:
--   - personalizavel: indica se produto tem personalizacao habilitada
--   - descricao_personalizacao: texto livre guiando a consultora
--
-- Migracao automatica: produtos PZ existentes recebem 1 campo migrado
-- com os parametros da config atual.
--
-- Seguranca:
--   - IF NOT EXISTS / IF NOT NULL (idempotente)
--   - FK ON DELETE CASCADE: campos somem se config for deletada
--   - ON CONFLICT DO NOTHING no seed (idempotente)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Add colunas na tabela de config existente
-- ----------------------------------------------------------------------------
ALTER TABLE alissonerp.produto_personalizacao
  ADD COLUMN IF NOT EXISTS personalizavel BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE alissonerp.produto_personalizacao
  ADD COLUMN IF NOT EXISTS descricao_personalizacao TEXT;

COMMENT ON COLUMN alissonerp.produto_personalizacao.personalizavel IS
  'Se true, produto exibe campos de personalizacao no wizard de venda. Herdado da tabela de config.';

COMMENT ON COLUMN alissonerp.produto_personalizacao.descricao_personalizacao IS
  'Texto livre descritivo da personalizacao esperada (ex: "Gravar nome do casal e data de casamento"). Aparece como guia para a consultora.';

-- ----------------------------------------------------------------------------
-- 2) Criar tabela de N campos por config
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alissonerp.produto_personalizacao_campos (
  id              SERIAL PRIMARY KEY,
  config_id       INTEGER NOT NULL REFERENCES alissonerp.produto_personalizacao(id) ON DELETE CASCADE,

  label           VARCHAR(100) NOT NULL DEFAULT 'Nome a gravar',
  placeholder     VARCHAR(100),
  exemplo         VARCHAR(100),

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

  posicao         INT          NOT NULL DEFAULT 0 CHECK (posicao >= 0),

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE alissonerp.produto_personalizacao_campos IS
  'Campos de personalizacao por config de produto. N campos por produto. A config mae (produto_personalizacao) gerencia ativo/preco_por_letra/peso_por_letra comuns.';

COMMENT ON COLUMN alissonerp.produto_personalizacao_campos.posicao IS
  'Ordem de exibicao no wizard. 0 = primeiro campo.';

CREATE INDEX IF NOT EXISTS idx_personalizacao_campos_config_id
  ON alissonerp.produto_personalizacao_campos (config_id, posicao);

-- ----------------------------------------------------------------------------
-- 3) Migracao: criar 1 campo para cada config PZ existente
--    Produtos com personalizacao ativa ganham 1 campo com os parametros
--    da config atual.
-- ----------------------------------------------------------------------------
INSERT INTO alissonerp.produto_personalizacao_campos (
  config_id, label, placeholder, exemplo,
  tipo, obrigatorio, min_caracteres, max_caracteres,
  caracteres_permitidos, posicao
)
SELECT
  pp.id,
  COALESCE(pp.label, 'Nome a gravar'),
  pp.placeholder,
  pp.exemplo,
  pp.tipo,
  pp.obrigatorio,
  pp.min_caracteres,
  pp.max_caracteres,
  COALESCE(pp.caracteres_permitidos, 'alfa_acento_espaco'),
  0  -- primeiro campo
FROM alissonerp.produto_personalizacao pp
WHERE pp.ativo = true
  AND NOT EXISTS (
    SELECT 1 FROM alissonerp.produto_personalizacao_campos pc
    WHERE pc.config_id = pp.id
  );

-- ----------------------------------------------------------------------------
-- 4) Trigger updated_at para campos
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION alissonerp.tg_produto_personalizacao_campos_touch_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_produto_personalizacao_campos_touch_updated ON alissonerp.produto_personalizacao_campos;
CREATE TRIGGER trg_produto_personalizacao_campos_touch_updated
  BEFORE UPDATE ON alissonerp.produto_personalizacao_campos
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.tg_produto_personalizacao_campos_touch_updated();

-- ----------------------------------------------------------------------------
-- 5) Grants
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.produto_personalizacao_campos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.produto_personalizacao_campos_id_seq TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.tg_produto_personalizacao_campos_touch_updated() TO authenticated;

-- ============================================================================
-- Fim migration 241
-- ============================================================================
