-- Migration 131: Orçamento par de alianças
-- Adiciona suporte para orçamento de par (2 alianças independentes)

ALTER TABLE alissonerp.orcamentos
  ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ficha_tecnica_2_id INTEGER REFERENCES alissonerp.orcamento_fichas_tecnicas(id);

COMMENT ON COLUMN alissonerp.orcamentos.quantidade IS '1=unidade, 2=par de alianças';
COMMENT ON COLUMN alissonerp.orcamentos.ficha_tecnica_2_id IS 'Ficha técnica da segunda aliança (quando par)';
