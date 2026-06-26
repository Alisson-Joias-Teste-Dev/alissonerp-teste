-- 257_promocoes_max_parcelas.sql
-- Adiciona regra de "máximo de parcelas no cartão" na promoção. Durante a
-- janela ativa da campanha, vendas que contêm produtos da promoção ficam
-- limitadas a esse número de parcelas. Fora da janela, volta ao default (12x).
--
-- NULL = sem restrição (usa o teto padrão de 12 do sistema).

BEGIN;

ALTER TABLE alissonerp.promocoes_produtos
  ADD COLUMN IF NOT EXISTS max_parcelas_cartao INT
    CHECK (max_parcelas_cartao IS NULL OR (max_parcelas_cartao BETWEEN 1 AND 12));

COMMENT ON COLUMN alissonerp.promocoes_produtos.max_parcelas_cartao IS
  'Máximo de parcelas permitidas no cartão para vendas com itens desta promoção. NULL = sem restrição (default 12).';

-- Recria a view pra expor max_parcelas_cartao da promo vigente.
-- NOTA: CREATE OR REPLACE VIEW exige que as colunas EXISTENTES mantenham
-- mesmo nome e ordem. A nova coluna max_parcelas_cartao vai NO FINAL.
CREATE OR REPLACE VIEW alissonerp.vw_produto_preco_vigente AS
SELECT
  p.id_produto,
  p.preco_tiny::numeric                              AS preco_lista,
  COALESCE(promo.preco_promo, p.preco_tiny::numeric) AS preco_vigente,
  promo.preco_original                               AS preco_promo_original,
  (promo.promocao_id IS NOT NULL)                    AS em_promocao,
  promo.promocao_id,
  promo.nome_campanha,
  promo.data_inicio,
  promo.data_fim,
  CASE
    WHEN promo.promocao_id IS NULL THEN NULL
    ELSE 'ativa'
  END AS situacao_efetiva,
  promo.max_parcelas_cartao
FROM public.produtos p
LEFT JOIN LATERAL (
  SELECT
    pi.preco_promo,
    pi.preco_original,
    pp.id AS promocao_id,
    pp.nome_campanha,
    pp.data_inicio,
    pp.data_fim,
    pp.max_parcelas_cartao
  FROM alissonerp.promocao_itens pi
  JOIN alissonerp.promocoes_produtos pp ON pp.id = pi.promocao_id
  WHERE pi.produto_id = p.id_produto
    AND pp.situacao_manual = 'agendada'
    AND CURRENT_DATE BETWEEN pp.data_inicio AND pp.data_fim
  ORDER BY pp.data_inicio DESC, pp.id DESC
  LIMIT 1
) promo ON TRUE;

GRANT SELECT ON alissonerp.vw_produto_preco_vigente
  TO anon, authenticated, service_role;

COMMIT;
