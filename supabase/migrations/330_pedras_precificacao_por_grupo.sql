-- Migration 330: Precificação de pedra por GRUPO + custo próprio da pedra
--
-- O QUÊ:
--   1) Adiciona em produto_pedra_extras os campos estruturados da pedra:
--        - tamanho_mm           : tamanho real da pedra (antes era extraído do NOME)
--        - grupo_precificacao_id : grupo (regra) fixado à mão; NULL = casa automático
--      (o custo próprio da pedra reusa a coluna já existente preco_compra_usd)
--   2) Reescreve a view vw_pedras_preco para precificar pela PEDRA:
--        preço = peso_ct × custo_da_pedra × dólar × markup_do_grupo
--      caindo na lógica ANTIGA (custo da regra + mm do nome) quando a pedra
--      ainda não tem tamanho_mm.
--
-- POR QUÊ (regra de negócio, decisão Jonathan 22/06):
--   - O custo é intrínseco de cada pedra (duas safiras de 7mm têm custos diferentes),
--     então o custo passa a morar NA pedra. O grupo (= a regra que já existe em
--     pedras_precificacao_regras) entra só com o MARKUP, aplicado por tipo+tamanho.
--   - Antes a view descobria tipo e tamanho LENDO O NOME ("Safira ... 7.0mm"), o que
--     quebrava por colisão de palavra (Safira "Esmeralda") e por vírgula. Agora usa
--     tipo_de_pedra (campo) e tamanho_mm (campo) quando existirem.
--
-- ZERO REGRESSÃO — gatilho único:
--   O que decide "pedra nova" x "pedra legada" é tamanho_mm IS NOT NULL (coluna nova,
--   hoje 100% NULL). Pedra sem tamanho_mm passa pela MESMA lógica de antes
--   (match por nome + custo da regra + mm extraído do nome) → preço byte-idêntico.
--   Só muda quando a pedra recebe tamanho_mm (cadastro novo ou migração conferida).
--
-- BLINDAGEM (clamp do markup):
--   O markup desliza pela faixa do grupo. Quando a pedra é FIXADA à mão num grupo
--   cuja faixa não cobre o tamanho dela, a interpolação extrapolaria (markup negativo
--   → preço negativo). O ratio é travado em [0,1] (LEAST/GREATEST) — fora da faixa o
--   markup gruda no markup_final/inicial, nunca explode. Em pedra DENTRO da faixa o
--   clamp é no-op (ratio já ∈ [0,1]) → preço idêntico ao de antes.
--
-- COMPATIBILIDADE DA VIEW:
--   CREATE OR REPLACE VIEW só permite ACRESCENTAR colunas no fim. As 10 colunas
--   originais (id_produto..preco_venda) ficam na MESMA ordem/nome/tipo; as novas
--   (tipo_de_pedra, custo_proprio_usd, ...) vêm depois.
--
-- IMPACTO SE ALTERADO/REMOVIDO:
--   vw_pedras_preco alimenta vw_produtos_geral_preco (preço da pedra na venda), a
--   auditoria da tela de precificação e o snapshot da pedra-componente da joia.
--   NÃO toca o caminho do BOM (produto_composicao + markup_pedras).

-- ── 1) Campos estruturados da pedra ──────────────────────────────────────────
ALTER TABLE alissonerp.produto_pedra_extras
  ADD COLUMN IF NOT EXISTS tamanho_mm numeric;            -- tamanho real (mm); NULL = pedra legada (usa o nome)

ALTER TABLE alissonerp.produto_pedra_extras
  ADD COLUMN IF NOT EXISTS grupo_precificacao_id integer; -- grupo fixado à mão; NULL = casa automático por tipo+tamanho

-- FK do grupo fixado → a regra (grupo). ON DELETE SET NULL: apagar o grupo
-- devolve a pedra pro modo automático, nunca quebra a pedra.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ppe_grupo_precificacao_id_fkey'
  ) THEN
    ALTER TABLE alissonerp.produto_pedra_extras
      ADD CONSTRAINT ppe_grupo_precificacao_id_fkey
      FOREIGN KEY (grupo_precificacao_id)
      REFERENCES alissonerp.pedras_precificacao_regras(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2) View de preço da pedra (custo próprio + markup do grupo, com fallback) ──
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
  -- Markup exibido: do grupo (zircônia/preço fixo não usa markup → NULL).
  CASE WHEN r.preco_rs_un IS NOT NULL THEN NULL::numeric ELSE round(mk.markup_grupo, 4) END AS markup_calculado,
  -- Preço de venda. Ordem de prioridade:
  --   (a) zircônia / preço fixo por unidade  → preco_rs_un
  --   (b) PEDRA ESTRUTURADA (tem tamanho_mm + custo próprio) → custo DELA × markup do grupo
  --   (c) LEGADO (intacto) → custo da regra × markup
  --   (d) senão NULL → "aguardando markup" (aparece na tela, não some)
  CASE
    WHEN r.preco_rs_un IS NOT NULL AND r.preco_rs_un > 0::numeric
      THEN r.preco_rs_un::integer
    WHEN ppe.tamanho_mm IS NOT NULL AND ppe.preco_compra_usd > 0::numeric
         AND ppe.peso_ct IS NOT NULL AND r.id IS NOT NULL
      THEN round(
             (ppe.peso_ct * ppe.preco_compra_usd)::double precision
             * (SELECT parametros.dollar FROM public.parametros LIMIT 1)
             * mk.markup_grupo::double precision
           )::integer
    WHEN r.custo_usd_ct IS NOT NULL AND r.custo_usd_ct > 0::numeric AND ppe.peso_ct IS NOT NULL
      THEN round(
             (ppe.peso_ct * r.custo_usd_ct)::double precision
             * (SELECT parametros.dollar FROM public.parametros LIMIT 1)
             * mk.markup_grupo::double precision
           )::integer
    ELSE NULL::integer
  END AS preco_venda,
  -- ── Colunas NOVAS (acrescentadas no fim) ──
  p.tipo_de_pedra,                                  -- tipo estruturado (agrupar / bucket "aguardando")
  ppe.preco_compra_usd        AS custo_proprio_usd, -- custo intrínseco da pedra (NULL = legada/sem custo)
  ppe.grupo_precificacao_id,                        -- grupo fixado à mão (NULL = automático)
  m.mm_efetivo                AS tamanho_mm,         -- tamanho usado: estruturado se houver, senão do nome
  r.id                        AS grupo_id,           -- grupo (regra) que precificou
  -- De onde saiu o custo: 'pedra' (custo próprio, fluxo novo) ou 'regra' (legado).
  CASE
    WHEN ppe.tamanho_mm IS NOT NULL AND ppe.preco_compra_usd > 0::numeric THEN 'pedra'::text
    WHEN r.custo_usd_ct IS NOT NULL THEN 'regra'::text
    ELSE NULL::text
  END AS fonte_custo
FROM public.produtos p
JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.id_produto
LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
-- mm_efetivo: tamanho estruturado quando existir; senão extrai do nome (lógica antiga,
-- '0' quando o nome não tem "N.Nmm"). Vírgula vira ponto.
CROSS JOIN LATERAL (
  SELECT COALESCE(
    ppe.tamanho_mm,
    replace(COALESCE(substring(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric
  ) AS mm_efetivo
) m
-- Acha o grupo (regra): 1º o fixado à mão; senão casa por categoria + tamanho.
-- Categoria: pedra estruturada usa tipo_de_pedra; legada usa o NOME (idêntico ao de antes).
LEFT JOIN LATERAL (
  SELECT r2.*
  FROM alissonerp.pedras_precificacao_regras r2
  WHERE
    (ppe.grupo_precificacao_id IS NOT NULL AND r2.id = ppe.grupo_precificacao_id)
    OR (
      ppe.grupo_precificacao_id IS NULL
      AND (
        CASE
          WHEN ppe.tamanho_mm IS NOT NULL AND COALESCE(p.tipo_de_pedra, '') <> ''
            THEN lower(p.tipo_de_pedra) = lower(r2.categoria_pedra::text)
                 OR (r2.categoria_pedra::text = 'zirconia' AND lower(p.tipo_de_pedra) LIKE '%zirc%')
          ELSE lower(p.nome::text) LIKE ('%'::text || lower(r2.categoria_pedra::text) || '%'::text)
                 OR (r2.categoria_pedra::text = 'zirconia' AND lower(p.nome::text) LIKE '%zirc%')
        END
      )
      AND (
        (m.mm_efetivo >= r2.tamanho_inicial_mm AND m.mm_efetivo <= r2.tamanho_final_mm)
        OR r2.categoria_pedra::text = 'zirconia'
      )
    )
  ORDER BY
    (CASE WHEN ppe.grupo_precificacao_id IS NOT NULL AND r2.id = ppe.grupo_precificacao_id THEN 0 ELSE 1 END),
    r2.tamanho_inicial_mm
  LIMIT 1
) r ON true
-- Markup do grupo: desliza entre markup_inicial (menor) e markup_final (maior) pelo
-- tamanho. RATIO TRAVADO em [0,1] — pedra fora da faixa (ex.: fixada à mão num grupo
-- que não cobre o tamanho) gruda no markup da ponta, nunca extrapola pra negativo.
CROSS JOIN LATERAL (
  SELECT CASE
    WHEN r.tamanho_final_mm > r.tamanho_inicial_mm
      THEN r.markup_inicial - (r.markup_inicial - r.markup_final)
           * LEAST(GREATEST(
               (m.mm_efetivo - r.tamanho_inicial_mm) / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0::numeric),
               0::numeric), 1::numeric)
    ELSE r.markup_inicial
  END AS markup_grupo
) mk
WHERE ti.tipo_item = 'insumo'::text
  AND p.situacao::text = 'A'::text
  AND p.categoria::text = 'Pedras'::text;
