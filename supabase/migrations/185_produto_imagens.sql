-- ============================================================================
-- 185: Galeria de imagens dos produtos (migração definitiva do Directus)
-- ============================================================================
-- Cria tabela alissonerp.produto_imagens para suportar múltiplas fotos por
-- produto, com capa selecionável, ordenação e rastreabilidade da origem
-- (uuid do Directus). Dados serão populados pelo script
-- scripts/migrate_directus_images.mjs.
--
-- Variações: NÃO duplicamos imagens — quando eh_variacao=true e o produto
-- não tem imagens próprias, a API resolve usando as imagens do pai (parent_id
-- em alissonerp.erp_produtos). A view vw_produto_capa já faz esse fallback.
-- ============================================================================

CREATE TABLE IF NOT EXISTS alissonerp.produto_imagens (
  id              BIGSERIAL PRIMARY KEY,
  produto_id      BIGINT      NOT NULL,
  bucket          TEXT        NOT NULL DEFAULT 'imagens',
  bucket_path     TEXT        NOT NULL,
  url_publica     TEXT        NOT NULL,
  ordem           INT         NOT NULL DEFAULT 0,
  eh_capa         BOOLEAN     NOT NULL DEFAULT false,
  origem          TEXT,             -- 'directus' | 'upload' | etc
  origem_uuid     UUID UNIQUE,      -- uuid do directus_files (idempotência)
  origem_tabela   TEXT,             -- 'produtos_files_1' | 'imagem_capa' etc
  filename        TEXT,
  mime_type       TEXT,
  filesize        BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_produto_imagens_produto
  ON alissonerp.produto_imagens (produto_id, ordem);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_produto_imagens_capa
  ON alissonerp.produto_imagens (produto_id) WHERE eh_capa;

COMMENT ON TABLE alissonerp.produto_imagens IS
  'Galeria de imagens por produto. Migrado do Directus (legado mantido como backup).';
COMMENT ON COLUMN alissonerp.produto_imagens.origem_uuid IS
  'UUID do arquivo original no Directus (directus_files.id) — usado para idempotência da migração.';
COMMENT ON COLUMN alissonerp.produto_imagens.origem_tabela IS
  'Tabela de origem no Directus: produtos_files_1 (galeria principal/capa), produtos_files_2, etc, ou imagem_capa (campo de public.produtos).';

-- ----------------------------------------------------------------------------
-- View: capa resolvida (com fallback variação→pai)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW alissonerp.vw_produto_capa AS
WITH capa_propria AS (
  SELECT produto_id, url_publica
    FROM alissonerp.produto_imagens
   WHERE eh_capa
)
SELECT
  p.id_produto AS produto_id,
  COALESCE(
    cp.url_publica,                                -- 1. capa própria do produto
    cp_pai.url_publica,                            -- 2. capa do pai (se variação)
    CASE WHEN p.imagem_capa IS NOT NULL
         THEN 'https://base.alissonranyel.com.br/assets/' || p.imagem_capa::text
         END                                       -- 3. fallback Directus (uuid)
  ) AS url_capa,
  CASE
    WHEN cp.url_publica IS NOT NULL THEN 'propria'
    WHEN cp_pai.url_publica IS NOT NULL THEN 'pai'
    WHEN p.imagem_capa IS NOT NULL THEN 'directus_legacy'
    ELSE NULL
  END AS origem
FROM public.produtos p
LEFT JOIN capa_propria cp ON cp.produto_id = p.id_produto
LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.id_produto AND ep.eh_variacao
LEFT JOIN capa_propria cp_pai ON cp_pai.produto_id = ep.parent_id;

COMMENT ON VIEW alissonerp.vw_produto_capa IS
  'Capa resolvida por produto: tenta capa própria → capa do pai (se variação) → fallback imagem_capa do Directus.';

-- ----------------------------------------------------------------------------
-- Trigger: manter updated_at e garantir só-uma-capa
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION alissonerp.fn_produto_imagens_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_produto_imagens_touch ON alissonerp.produto_imagens;
CREATE TRIGGER trg_produto_imagens_touch
  BEFORE UPDATE ON alissonerp.produto_imagens
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_produto_imagens_touch();
