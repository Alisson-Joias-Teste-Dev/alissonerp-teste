-- =============================================
-- MIGRATION 063: alissonerp.erp_produtos
-- Tabela de produtos ERP com relação pai/variação por SKU
--
-- REGRAS:
--   SKU com "-" (exceto prefixo AJ) = variação
--   Ex: "1521-2" → pai=1521, sufixo=2
--   Ex: "AJ1000" → NÃO é variação (produto simples)
--
-- public.produtos é READONLY (Directus/Tiny)
-- Campos ERP ficam aqui (observacao_erp, medidas, pai/variação)
-- =============================================

CREATE TABLE IF NOT EXISTS alissonerp.erp_produtos (
  id              SERIAL PRIMARY KEY,

  -- Referência ao produto (READONLY — não altera public.produtos)
  produto_id      BIGINT       NOT NULL,
  sku             VARCHAR(100) NOT NULL,
  nome            VARCHAR(500),

  -- Relação pai/variação
  parent_sku      VARCHAR(100),
  parent_id       INTEGER REFERENCES alissonerp.erp_produtos(id),
  eh_variacao     BOOLEAN      NOT NULL DEFAULT false,
  eh_pai          BOOLEAN      NOT NULL DEFAULT false,
  sufixo_variacao VARCHAR(20),

  -- Eixos de variação (preenchidos manualmente ou por sync futuro)
  numeracao       VARCHAR(10),   -- tamanho do aro: "14", "16", "18"
  cor_metal       VARCHAR(30),   -- "amarelo", "branco", "rosé"
  comprimento     NUMERIC(10,2), -- cm (correntes/pulseiras)

  -- Medidas da peça (ficha técnica) — fonte de verdade para o ERP
  largura_aro     NUMERIC(10,2),
  altura_aro      NUMERIC(10,2),
  base            NUMERIC(10,2),

  -- Campos ERP
  observacao_erp  TEXT,
  ativo           BOOLEAN      NOT NULL DEFAULT true,

  -- Rastreamento
  date_created    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  date_updated    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (produto_id),
  UNIQUE (sku)
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.erp_produtos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.erp_produtos_id_seq TO authenticated;

-- Índices
CREATE INDEX IF NOT EXISTS idx_erp_produtos_produto_id   ON alissonerp.erp_produtos(produto_id);
CREATE INDEX IF NOT EXISTS idx_erp_produtos_sku          ON alissonerp.erp_produtos(sku);
CREATE INDEX IF NOT EXISTS idx_erp_produtos_parent_sku   ON alissonerp.erp_produtos(parent_sku)  WHERE parent_sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_erp_produtos_parent_id    ON alissonerp.erp_produtos(parent_id)   WHERE parent_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_erp_produtos_eh_pai       ON alissonerp.erp_produtos(eh_pai)       WHERE eh_pai       = true;
CREATE INDEX IF NOT EXISTS idx_erp_produtos_eh_variacao  ON alissonerp.erp_produtos(eh_variacao)  WHERE eh_variacao  = true;

COMMENT ON TABLE alissonerp.erp_produtos
  IS 'Produtos ERP com relação pai/variação. Referencia public.produtos sem alterá-lo. Fonte de verdade para medidas, observacao_erp e agrupamento pai/filho.';
COMMENT ON COLUMN alissonerp.erp_produtos.parent_sku
  IS 'SKU do produto pai: split_part(sku, "-", 1) quando tem "-" e não começa com "AJ".';

-- =============================================
-- PASSO 1: Inserir TODOS os produtos com SKU
-- =============================================

INSERT INTO alissonerp.erp_produtos
  (produto_id, sku, nome, parent_sku, eh_variacao, sufixo_variacao)
SELECT
  p.id_produto,
  p.sku,
  p.nome,
  CASE
    WHEN p.sku LIKE '%-%' AND p.sku NOT LIKE 'AJ%'
    THEN split_part(p.sku, '-', 1)
    ELSE NULL
  END,
  CASE
    WHEN p.sku LIKE '%-%' AND p.sku NOT LIKE 'AJ%' THEN true
    ELSE false
  END,
  CASE
    WHEN p.sku LIKE '%-%' AND p.sku NOT LIKE 'AJ%'
    THEN split_part(p.sku, '-', 2)
    ELSE NULL
  END
FROM public.produtos p
WHERE p.sku IS NOT NULL AND p.sku != ''
ON CONFLICT (sku) DO NOTHING;

-- =============================================
-- PASSO 2: Marcar quem é pai (tem variações)
-- =============================================

UPDATE alissonerp.erp_produtos
SET eh_pai = true
WHERE sku IN (
  SELECT DISTINCT parent_sku
  FROM alissonerp.erp_produtos
  WHERE parent_sku IS NOT NULL
);

-- =============================================
-- PASSO 3: Preencher parent_id (self-reference)
-- =============================================

UPDATE alissonerp.erp_produtos v
SET parent_id = pai.id
FROM alissonerp.erp_produtos pai
WHERE v.parent_sku  = pai.sku
  AND v.eh_variacao = true
  AND v.parent_id   IS NULL;

-- =============================================
-- VIEW: vw_produtos_erp
-- JOIN erp_produtos + public.produtos
-- qtd_variacoes via LEFT JOIN agrupado (evita subquery correlacionada)
-- =============================================

CREATE OR REPLACE VIEW alissonerp.vw_produtos_erp AS
SELECT
  ep.id              AS erp_id,
  ep.produto_id,
  ep.sku,
  ep.nome,
  ep.parent_sku,
  ep.parent_id,
  ep.eh_variacao,
  ep.eh_pai,
  ep.sufixo_variacao,
  ep.numeracao,
  ep.cor_metal,
  ep.comprimento,
  ep.largura_aro,
  ep.altura_aro,
  ep.base,
  ep.observacao_erp,
  ep.ativo,
  -- Precificação (public.produtos — READONLY)
  NULL::text    AS tipo_metal,          -- aguarda migration 060
  p.peso_precificado,
  p.preco_sync,
  p.preco_tiny,
  p.diferenca_percentual,
  p.categoria_precificacao,
  p.tem_pedra_preciosa,
  p.preco_pedras,
  p.preco_total_sync,
  p.situacao,
  -- Contagem de variações (via LEFT JOIN agrupado — eficiente)
  COALESCE(cnt.qtd, 0) AS qtd_variacoes
FROM alissonerp.erp_produtos ep
JOIN public.produtos p ON p.id_produto = ep.produto_id
LEFT JOIN (
  SELECT parent_id, count(*)::integer AS qtd
  FROM alissonerp.erp_produtos
  WHERE parent_id IS NOT NULL
  GROUP BY parent_id
) cnt ON cnt.parent_id = ep.id;

GRANT SELECT ON alissonerp.vw_produtos_erp TO authenticated;

-- =============================================
-- VERIFICAÇÃO (executar após apply):
--
-- SELECT
--   count(*)                                             AS total,
--   count(CASE WHEN eh_variacao       THEN 1 END)        AS variacoes,
--   count(CASE WHEN eh_pai            THEN 1 END)        AS pais,
--   count(CASE WHEN NOT eh_variacao
--               AND NOT eh_pai        THEN 1 END)        AS simples,
--   count(CASE WHEN eh_variacao
--               AND parent_id IS NULL THEN 1 END)        AS orfas
-- FROM alissonerp.erp_produtos;
-- =============================================
