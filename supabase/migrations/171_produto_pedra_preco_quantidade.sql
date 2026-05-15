-- =============================================
-- MIGRATION 171: Preco travado por markup + quantidade em pedra-produto
--
-- CONTEXTO:
--   Pedras-produto (public.produtos com categoria ILIKE 'Pedras%') hoje têm
--   preco_tiny editável livremente. Passa a ser CALCULADO a partir de:
--     preco_compra_usd × dolar × markup_faixa(tamanho_ct)
--
--   `tamanho_ct` é derivado de peso_precificado (g) / 0.2 (1 ct = 0.2 g).
--   `dolar` vem de public.parametros.dollar.
--   `markup_faixa` vem de alissonerp.markup_pedras (faixa por tamanho em ct).
--
--   Como public.produtos é READONLY para o ERP, criamos uma tabela auxiliar:
--     alissonerp.produto_pedra_extras(produto_id, preco_compra_usd, quantidade)
--
--   O cálculo de preco_tiny é aplicado no endpoint PATCH (backend) quando o
--   produto é pedra e preco_compra_usd ou peso mudam.
-- =============================================

CREATE TABLE IF NOT EXISTS alissonerp.produto_pedra_extras (
  produto_id        BIGINT PRIMARY KEY,
  preco_compra_usd  NUMERIC(12,4),
  quantidade        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE alissonerp.produto_pedra_extras IS
  'Extensão de public.produtos para pedras-produto: custo USD e quantidade em estoque. '
  'preco_tiny (em public.produtos) = preco_compra_usd × dolar × markup_faixa(ct).';
COMMENT ON COLUMN alissonerp.produto_pedra_extras.preco_compra_usd IS
  'Custo de compra em USD. Usado junto com cotação do dólar e markup por tamanho.';
COMMENT ON COLUMN alissonerp.produto_pedra_extras.quantidade IS
  'Quantidade em estoque (unidades avulsas da pedra-produto).';

GRANT SELECT, INSERT, UPDATE, DELETE
  ON alissonerp.produto_pedra_extras TO authenticated, anon;
