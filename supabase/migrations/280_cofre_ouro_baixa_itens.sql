-- Migration 280: detalhamento de itens por baixa de ouro
-- REGRA DE NEGÓCIO:
--   - Cada baixa de ouro deve guardar de quais linhas ela foi composta
--     (venda em ouro, compra de metal, recebimento de metal).
--   - Isso permite auditoria igual ao histórico de baixa de dinheiro.
-- IMPACTO SE REMOVIDO:
--   - O histórico de baixa de ouro perde rastreabilidade da origem.

SET search_path TO alissonerp, public;

CREATE TABLE IF NOT EXISTS alissonerp.cofre_ouro_baixa_itens (
  id              SERIAL PRIMARY KEY,
  baixa_id        INTEGER NOT NULL REFERENCES alissonerp.cofre_ouro_baixas(id) ON DELETE CASCADE,
  origem_tipo     VARCHAR(30) NOT NULL CHECK (origem_tipo IN ('venda_ouro', 'compra_metal', 'recebimento_metal')),
  origem_id       INTEGER NOT NULL,
  referencia      TEXT NOT NULL,
  pessoa_nome     TEXT,
  data_origem     TIMESTAMPTZ,
  gramas          NUMERIC(10,3) NOT NULL CHECK (gramas > 0),
  valor_brl       NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (baixa_id, origem_tipo, origem_id)
);

CREATE INDEX IF NOT EXISTS idx_cofre_ouro_baixa_itens_baixa
  ON alissonerp.cofre_ouro_baixa_itens (baixa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cofre_ouro_baixa_itens_origem
  ON alissonerp.cofre_ouro_baixa_itens (origem_tipo, origem_id);

GRANT SELECT, INSERT ON alissonerp.cofre_ouro_baixa_itens TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.cofre_ouro_baixa_itens_id_seq TO authenticated;
