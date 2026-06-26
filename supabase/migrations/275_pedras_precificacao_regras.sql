-- ==========================================================================
-- Migration 275 — Tabela unificada de precificação de pedras + view dinâmica
--
-- REGRA DE NEGÓCIO:
--   Unifica o que estava espalhado em:
--     • config_orcamento.stone_prices (JSONB) — custo USD/ct por tipo
--     • config_orcamento.stone_markups_table._multi_tables (JSONB) — markups
--     • markup_pedras (tabela, todos registros com ativo=false)
--   em uma única tabela relacional + view que calcula preço em tempo real.
--
-- Fórmula pedra preciosa:
--   preco_venda = peso_ct × custo_usd_ct × cotação_dólar × markup_interpolado
--
-- Fórmula zircônia:
--   preco_venda = preco_rs_un (preço fixo por unidade)
--
-- O markup é interpolado linearmente entre markup_inicial e markup_final
-- com base no tamanho em mm extraído do nome do produto.
-- ==========================================================================
BEGIN;

-- ── A. NOVA TABELA ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.pedras_precificacao_regras (
  id                SERIAL PRIMARY KEY,
  nome_tabela       VARCHAR(100) NOT NULL,
  categoria_pedra   VARCHAR(100) NOT NULL,
  custo_usd_ct      NUMERIC(10,2),
  preco_rs_un       NUMERIC(10,2),
  tamanho_inicial_mm NUMERIC(5,2) NOT NULL,
  tamanho_final_mm  NUMERIC(5,2) NOT NULL,
  markup_inicial    NUMERIC(10,4) NOT NULL,
  markup_final      NUMERIC(10,4) NOT NULL,
  ativa             BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        UUID,

  CONSTRAINT chk_range CHECK (tamanho_final_mm > tamanho_inicial_mm),
  CONSTRAINT chk_markup_positivo CHECK (markup_inicial > 0 AND markup_final > 0),
  CONSTRAINT chk_tem_preco CHECK (custo_usd_ct IS NOT NULL OR preco_rs_un IS NOT NULL)
);

CREATE INDEX idx_pedras_regras_ativa_categoria
  ON alissonerp.pedras_precificacao_regras (categoria_pedra)
  WHERE ativa = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.pedras_precificacao_regras TO authenticated;
GRANT SELECT ON alissonerp.pedras_precificacao_regras TO anon;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.pedras_precificacao_regras_id_seq TO authenticated;

COMMENT ON TABLE alissonerp.pedras_precificacao_regras IS
  'Regras de precificação de pedras. Cada linha = uma tabela de precificação com range de tamanho + markups. Apenas 1 regra ativa por categoria_pedra.';

-- ── B. MIGRAÇÃO DE DADOS ───────────────────────────────────────────────────
-- Extrai regras do JSONB config_orcamento._multi_tables e insere na nova tabela

-- Diamante — 8 sub-tabelas
INSERT INTO alissonerp.pedras_precificacao_regras
  (nome_tabela, categoria_pedra, custo_usd_ct, tamanho_inicial_mm, tamanho_final_mm, markup_inicial, markup_final, ativa)
VALUES
  ('Padrão 1.0–2.5mm',   'diamante',  400,  1.0, 2.5, 10,  5,   true),
  ('2.4–2.9mm',          'diamante',  500,  2.4, 2.9, 6,   6,   false),
  ('3.0–3.2mm',          'diamante',  650,  3.0, 3.2, 6,   6,   false),
  ('3.3–3.5mm',          'diamante',  750,  3.3, 3.5, 6,   6,   false),
  ('3.6–3.9mm',          'diamante',  850,  3.6, 3.9, 6,   6,   false),
  ('4.0–4.2mm',          'diamante',  950,  4.0, 4.2, 6,   6,   false),
  ('4.3–5.0mm',          'diamante', 2000,  4.3, 5.0, 4.5, 4.5, false),
  ('5.1–7.0mm',          'diamante', 3000,  5.1, 7.0, 4.5, 4.5, false);

-- Moissanita — 1 sub-tabela
INSERT INTO alissonerp.pedras_precificacao_regras
  (nome_tabela, categoria_pedra, custo_usd_ct, tamanho_inicial_mm, tamanho_final_mm, markup_inicial, markup_final, ativa)
VALUES
  ('Padrão 1.0–2.5mm', 'moissanita', 6, 1.0, 2.5, 300, 150, true);

-- Rubi — sem sub-tabela no JSON, cria default com custo do stone_prices ($350/ct)
INSERT INTO alissonerp.pedras_precificacao_regras
  (nome_tabela, categoria_pedra, custo_usd_ct, tamanho_inicial_mm, tamanho_final_mm, markup_inicial, markup_final, ativa)
VALUES
  ('Default 1.0–2.5mm', 'rubi', 350, 1.0, 2.5, 10, 4, true);

-- Esmeralda — sem sub-tabela, default $450/ct
INSERT INTO alissonerp.pedras_precificacao_regras
  (nome_tabela, categoria_pedra, custo_usd_ct, tamanho_inicial_mm, tamanho_final_mm, markup_inicial, markup_final, ativa)
VALUES
  ('Default 1.0–2.5mm', 'esmeralda', 450, 1.0, 2.5, 10, 4, true);

-- Safira — sem sub-tabela, default $300/ct
INSERT INTO alissonerp.pedras_precificacao_regras
  (nome_tabela, categoria_pedra, custo_usd_ct, tamanho_inicial_mm, tamanho_final_mm, markup_inicial, markup_final, ativa)
VALUES
  ('Default 1.0–2.5mm', 'safira', 300, 1.0, 2.5, 10, 4, true);

-- Zircônia — preço fixo R$/unidade, sem custo_usd_ct
INSERT INTO alissonerp.pedras_precificacao_regras
  (nome_tabela, categoria_pedra, preco_rs_un, tamanho_inicial_mm, tamanho_final_mm, markup_inicial, markup_final, ativa)
VALUES
  ('Preço Fixo por Unidade', 'zirconia', 40, 1.0, 2.5, 1, 1, true);

-- ── C. VIEW vw_pedras_preco ────────────────────────────────────────────────
CREATE OR REPLACE VIEW alissonerp.vw_pedras_preco AS
SELECT
  p.id_produto,
  p.nome,
  p.sku,
  ppe.peso_ct,
  r.categoria_pedra,
  r.nome_tabela,
  r.custo_usd_ct,
  r.preco_rs_un,

  -- Markup interpolado para o tamanho exato da pedra
  CASE
    WHEN r.tamanho_final_mm > r.tamanho_inicial_mm AND r.preco_rs_un IS NULL
    THEN ROUND((
      r.markup_inicial
      - ((r.markup_inicial - r.markup_final)
         * (CAST(COALESCE(SUBSTRING(p.nome FROM '([0-9]+[,.][0-9]+)\s*mm'), '0') AS numeric)
            - r.tamanho_inicial_mm)
         / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0))
    )::numeric, 4)
    WHEN r.preco_rs_un IS NOT NULL THEN NULL
    ELSE r.markup_inicial
  END AS markup_calculado,

  -- Preço de venda
  CASE
    -- Zircônia: preço fixo por unidade
    WHEN r.preco_rs_un IS NOT NULL AND r.preco_rs_un > 0 THEN r.preco_rs_un::integer
    -- Pedras preciosas: ct × USD/ct × dolar × markup
    WHEN r.custo_usd_ct IS NOT NULL AND r.custo_usd_ct > 0 AND ppe.peso_ct IS NOT NULL THEN
      ROUND((
        ppe.peso_ct::numeric
        * r.custo_usd_ct::numeric
        * (SELECT dollar::numeric FROM public.parametros LIMIT 1)
        * CASE
            WHEN r.tamanho_final_mm > r.tamanho_inicial_mm THEN
              r.markup_inicial
              - ((r.markup_inicial - r.markup_final)
                 * (CAST(COALESCE(SUBSTRING(p.nome FROM '([0-9]+[,.][0-9]+)\s*mm'), '0') AS numeric)
                    - r.tamanho_inicial_mm)
                 / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0))
            ELSE r.markup_inicial
          END::numeric
      ))::integer
  END AS preco_venda

FROM public.produtos p
JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
-- Match por categoria + range de tamanho (mm extraído do nome)
-- Usa LATERAL para garantir apenas 1 regra por pedra (a de menor range em caso de overlap)
LEFT JOIN LATERAL (
  SELECT *
  FROM alissonerp.pedras_precificacao_regras r2
  WHERE (
    LOWER(p.nome) ILIKE '%' || LOWER(r2.categoria_pedra) || '%'
    OR (r2.categoria_pedra = 'zirconia' AND LOWER(p.nome) ILIKE '%zirc%')
  )
  AND (
    -- O tamanho (mm) da pedra está dentro do range da regra
    (
      COALESCE(SUBSTRING(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0')::numeric >= r2.tamanho_inicial_mm
      AND COALESCE(SUBSTRING(p.nome, '([0-9]+[,.][0-9]+)\s*mm'), '0')::numeric <= r2.tamanho_final_mm
    )
    -- OU é zircônia (preço fixo, não depende de range de mm)
    OR r2.categoria_pedra = 'zirconia'
  )
  ORDER BY r2.tamanho_inicial_mm ASC
  LIMIT 1
) r ON true
WHERE ti.tipo_item = 'insumo'
  AND p.situacao = 'A'
  AND p.categoria = 'Pedras';

GRANT SELECT ON alissonerp.vw_pedras_preco TO authenticated, anon;

COMMENT ON VIEW alissonerp.vw_pedras_preco IS
  'Precificação dinâmica de pedras (LEFT JOIN por range). Casa cada pedra com a regra de precificação correta baseada na categoria + range de tamanho (mm). Usa LATERAL para garantir 1 regra por pedra. Fórmula: peso_ct × custo_usd_ct × dolar × markup_interpolado. Para zircônia, retorna preco_rs_un. Pedras sem regra compatível aparecem com preco_venda = NULL.';

COMMIT;
