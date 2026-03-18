-- Migration 074: Tabela itens_ordem (ERP) + permissão granular por tipo

-- ── Tabela de itens para ordens criadas no ERP ─────────────────────────────
-- Ordens do PDV usam directus.itens_ordem_1
-- Ordens criadas no ERP usam esta tabela
CREATE TABLE IF NOT EXISTS alissonerp.itens_ordem (
  id           SERIAL       PRIMARY KEY,
  ordem_id     INTEGER      NOT NULL REFERENCES alissonerp.ordens(id) ON DELETE CASCADE,
  produto_id   BIGINT       REFERENCES public.produtos(id_produto),
  nome_produto TEXT,         -- desnormalizado para performance
  sku          TEXT,         -- desnormalizado
  quantidade   INTEGER      NOT NULL DEFAULT 1,
  peso_estimado NUMERIC(10,2),  -- vem de public.produtos.peso_precificado
  observacao   TEXT,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_itens_ordem_ordem_id    ON alissonerp.itens_ordem(ordem_id);
CREATE INDEX IF NOT EXISTS idx_itens_ordem_produto_id  ON alissonerp.itens_ordem(produto_id);

COMMENT ON TABLE alissonerp.itens_ordem IS
  'Itens de ordens criadas pelo ERP. Ordens do PDV usam directus.itens_ordem_1.';

-- ── Permissão granular por tipo de ordem ───────────────────────────────────
-- Roles fullAccess (desenvolvedor, admin) ignoram este campo e podem criar tudo
ALTER TABLE alissonerp.usuarios
  ADD COLUMN IF NOT EXISTS tipos_ordem_permitidos JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN alissonerp.usuarios.tipos_ordem_permitidos IS
  'Array de tipos de ordem que o usuário pode criar. Vazio = sem permissão. '
  'Roles admin/desenvolvedor têm acesso total independente deste campo. '
  'Ex: ["servico_loja","servico_venda"]';

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.itens_ordem TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.itens_ordem_id_seq TO authenticated;
