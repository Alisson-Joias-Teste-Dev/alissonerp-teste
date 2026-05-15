-- Migration 248: Promocoes de produtos
-- Sistema de campanhas com janela [data_inicio, data_fim] e preco promocional
-- por item. Reversao automatica via VIEW (sem cron).
--
-- Tabelas:
--   alissonerp.promocoes_produtos  - cabecalho da campanha
--   alissonerp.promocao_itens      - 1 linha por produto com preco_original (snapshot)
--                                    e preco_promo
--   alissonerp.vw_produto_preco_vigente - view que retorna preco_lista vs preco_vigente
--                                    (cai para preco_tiny fora da janela)
--                                    SEMPRE 1 linha por produto (LATERAL).
--
-- NAO altera public.produtos.preco_tiny. Reversao = mudanca de CURRENT_DATE.

BEGIN;

CREATE TABLE IF NOT EXISTS alissonerp.promocoes_produtos (
  id              SERIAL PRIMARY KEY,
  nome_campanha   VARCHAR(200) NOT NULL,
  data_inicio     DATE NOT NULL,
  data_fim        DATE NOT NULL,
  situacao_manual VARCHAR(20) NOT NULL DEFAULT 'agendada'
    CHECK (situacao_manual IN ('agendada','cancelada','encerrada_manual')),
  observacao      TEXT,
  criado_por      UUID NOT NULL,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (data_fim >= data_inicio)
);

CREATE TABLE IF NOT EXISTS alissonerp.promocao_itens (
  id              SERIAL PRIMARY KEY,
  promocao_id     INT NOT NULL REFERENCES alissonerp.promocoes_produtos(id) ON DELETE CASCADE,
  produto_id      BIGINT NOT NULL,
  preco_original  NUMERIC(12,2) NOT NULL,
  preco_promo     NUMERIC(12,2) NOT NULL CHECK (preco_promo >= 0),
  UNIQUE (promocao_id, produto_id)
);

CREATE INDEX IF NOT EXISTS idx_promocao_itens_produto
  ON alissonerp.promocao_itens(produto_id);

CREATE INDEX IF NOT EXISTS idx_promocoes_periodo_ativas
  ON alissonerp.promocoes_produtos(data_inicio, data_fim)
  WHERE situacao_manual = 'agendada';

-- View de preco vigente: SEMPRE 1 linha por produto.
-- Subquery LATERAL pega no maximo 1 promo ativa hoje (mais recente por data_inicio).
-- Sem LATERAL o LEFT JOIN duplicava produtos com historico de varias campanhas.
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
  END AS situacao_efetiva
FROM public.produtos p
LEFT JOIN LATERAL (
  SELECT
    pi.preco_promo,
    pi.preco_original,
    pp.id AS promocao_id,
    pp.nome_campanha,
    pp.data_inicio,
    pp.data_fim
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
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.promocoes_produtos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.promocao_itens TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.promocoes_produtos_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.promocao_itens_id_seq TO authenticated;

-- Permissoes de role para modulo "promocoes"
-- Decisao Jonathan: TODOS os roles podem VER. So full-access (admin/desenvolvedor/diretor)
-- podem EDITAR (criar, encerrar, cancelar, editar).
INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever)
VALUES
  ('admin',              'promocoes', true, true),
  ('desenvolvedor',      'promocoes', true, true),
  ('diretor',            'promocoes', true, true),
  ('gerente_loja',       'promocoes', true, false),
  ('gerente_fabrica',    'promocoes', true, false),
  ('ourives',            'promocoes', true, false),
  ('motoboy',            'promocoes', true, false),
  ('consultora',         'promocoes', true, false),
  ('estoquista_fabrica', 'promocoes', true, false),
  ('estoquista_loja',    'promocoes', true, false),
  ('pcp',                'promocoes', true, false)
ON CONFLICT (role, modulo) DO UPDATE SET
  pode_ler = EXCLUDED.pode_ler,
  pode_escrever = EXCLUDED.pode_escrever;

COMMIT;
