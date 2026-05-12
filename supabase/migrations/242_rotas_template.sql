-- Templates de rota: rotas nomeadas reutilizáveis, vinculadas (opcionalmente)
-- a uma categoria de produto. Quando produto Alisson é criado e existe um
-- template `is_default=true` pra categoria dele, as etapas são COPIADAS pra
-- alissonerp.produto_rota. A cópia é independente — edição posterior no
-- produto NÃO afeta o template e vice-versa.

CREATE TABLE IF NOT EXISTS alissonerp.rotas_template (
  id          SERIAL PRIMARY KEY,
  nome        VARCHAR(120) NOT NULL,
  -- VARCHAR pra match direto com public.produtos.categoria (também string,
  -- com hierarquia inline tipo "Anel -> Feminino"). NULL = template solto
  -- sem vínculo de categoria (aplicação manual apenas).
  categoria   VARCHAR(200),
  is_default  BOOLEAN     NOT NULL DEFAULT false,
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Apenas 1 template default ATIVO por categoria
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rota_template_default_cat
  ON alissonerp.rotas_template (categoria)
  WHERE is_default = true AND ativo = true;

-- Etapas do template (sequência de setores). Cascade — se template é
-- excluído (DELETE hard), etapas vão junto. Mas o padrão da app é soft delete
-- (ativo=false), então cascade é raramente acionada.
CREATE TABLE IF NOT EXISTS alissonerp.rotas_template_etapas (
  id          SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES alissonerp.rotas_template(id) ON DELETE CASCADE,
  ordem       INTEGER NOT NULL,
  setor_id    INTEGER NOT NULL REFERENCES alissonerp.setores(id),
  UNIQUE (template_id, ordem)
);

CREATE INDEX IF NOT EXISTS idx_rota_template_etapas_template
  ON alissonerp.rotas_template_etapas (template_id, ordem);

-- updated_at trigger (segue padrão de outras tabelas alissonerp)
CREATE OR REPLACE FUNCTION alissonerp.fn_rotas_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rotas_template_updated_at ON alissonerp.rotas_template;
CREATE TRIGGER trg_rotas_template_updated_at
  BEFORE UPDATE ON alissonerp.rotas_template
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_rotas_template_updated_at();
