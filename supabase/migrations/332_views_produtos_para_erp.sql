-- 332_views_produtos_para_erp.sql
-- Fase A do plano docs/plano-cortar-public-produtos-2026-06.md
-- Migra as 7 views vivas de public.produtos -> alissonerp.erp_produtos.
-- GERADA A PARTIR DAS DEFINICOES DE PRODUCAO (preserva a logica de prod).
-- Troca a fonte "produtos"(public) por alissonerp.erp_produtos e id_produto -> produto_id.
-- Casts (nome/sku/tipo_de_pedra/iframe/url_drive/diferenca_percentual) preservam a assinatura.

-- ===== alissonerp.vw_saldo_estoque_comercial =====
CREATE OR REPLACE VIEW alissonerp.vw_saldo_estoque_comercial AS
 SELECT m.produto_id,
    p.nome::character varying AS nome,
    p.sku::character varying AS sku,
    sum(
        CASE
            WHEN m.tipo::text = 'entrada'::text THEN m.quantidade
            ELSE 0
        END) AS total_entradas,
    sum(
        CASE
            WHEN m.tipo::text = 'saida'::text THEN m.quantidade
            ELSE 0
        END) AS total_saidas,
    sum(
        CASE
            WHEN m.tipo::text = 'entrada'::text THEN m.quantidade
            ELSE - m.quantidade
        END) AS saldo_atual,
    sum(
        CASE
            WHEN m.tipo::text = 'entrada'::text THEN m.quantidade
            ELSE - m.quantidade
        END) AS saldo,
    COALESCE(( SELECT sum(r.quantidade) AS sum
           FROM alissonerp.reservas_estoque_comercial r
          WHERE r.produto_id = m.produto_id AND r.status::text = 'ativo'::text), 0::bigint) AS reservado,
    sum(
        CASE
            WHEN m.tipo::text = 'entrada'::text THEN m.quantidade
            ELSE - m.quantidade
        END) - COALESCE(( SELECT sum(r.quantidade) AS sum
           FROM alissonerp.reservas_estoque_comercial r
          WHERE r.produto_id = m.produto_id AND r.status::text = 'ativo'::text), 0::bigint) AS disponivel
   FROM alissonerp.movimentacoes_estoque_comercial m
     JOIN alissonerp.erp_produtos p ON p.produto_id = m.produto_id
     LEFT JOIN alissonerp.estoque_comercial_config ecc ON ecc.produto_id = m.produto_id AND ecc.controla_estoque = true
  WHERE m.status::text = 'efetivado'::text AND ecc.produto_id IS NOT NULL
  GROUP BY m.produto_id, p.nome, p.sku;

-- ===== alissonerp.vw_saldo_estoque_comercial_v2 =====
CREATE OR REPLACE VIEW alissonerp.vw_saldo_estoque_comercial_v2 AS
 WITH mov_agg AS (
         SELECT movimentacoes_estoque_comercial.produto_id,
            movimentacoes_estoque_comercial.local_estoque_id,
            COALESCE(sum(
                CASE
                    WHEN movimentacoes_estoque_comercial.tipo::text = 'entrada'::text THEN movimentacoes_estoque_comercial.quantidade
                    ELSE 0
                END), 0::bigint) - COALESCE(sum(
                CASE
                    WHEN movimentacoes_estoque_comercial.tipo::text = 'saida'::text THEN movimentacoes_estoque_comercial.quantidade
                    ELSE 0
                END), 0::bigint) AS saldo_fisico,
            count(movimentacoes_estoque_comercial.id) AS total_movimentacoes,
            max(movimentacoes_estoque_comercial.created_at) AS ultima_movimentacao
           FROM alissonerp.movimentacoes_estoque_comercial
          WHERE movimentacoes_estoque_comercial.status::text = 'efetivado'::text
          GROUP BY movimentacoes_estoque_comercial.produto_id, movimentacoes_estoque_comercial.local_estoque_id
        ), reservas_agg AS (
         SELECT reservas_estoque_comercial.produto_id,
            reservas_estoque_comercial.local_estoque_id,
            sum(reservas_estoque_comercial.quantidade) AS total_reservado
           FROM alissonerp.reservas_estoque_comercial
          WHERE reservas_estoque_comercial.status::text = 'ativo'::text
          GROUP BY reservas_estoque_comercial.produto_id, reservas_estoque_comercial.local_estoque_id
        ), transito_agg AS (
         SELECT transferencias_estoque_comercial.produto_id,
            transferencias_estoque_comercial.local_destino_id AS local_estoque_id,
            sum(transferencias_estoque_comercial.quantidade) AS em_transito
           FROM alissonerp.transferencias_estoque_comercial
          WHERE transferencias_estoque_comercial.status::text = 'pendente'::text
          GROUP BY transferencias_estoque_comercial.produto_id, transferencias_estoque_comercial.local_destino_id
        )
 SELECT p.produto_id AS produto_id,
    p.nome::character varying AS nome_produto,
    p.sku::character varying AS sku,
    COALESCE(p.categoria, ''::character varying) AS categoria,
    cfg.id AS config_id,
    COALESCE(cfg.estoque_minimo, 0) AS estoque_minimo,
    cfg.ativo,
    m.local_estoque_id,
    le.nome AS local_nome,
    COALESCE(m.saldo_fisico, 0::bigint)::integer AS saldo_fisico,
    COALESCE(r.total_reservado, 0::bigint)::integer AS reservado,
    (COALESCE(m.saldo_fisico, 0::bigint) - COALESCE(r.total_reservado, 0::bigint))::integer AS disponivel,
    COALESCE(t.em_transito, 0::bigint)::integer AS em_transito,
    COALESCE(m.total_movimentacoes, 0::bigint)::integer AS total_movimentacoes,
    m.ultima_movimentacao
   FROM alissonerp.erp_produtos p
     JOIN alissonerp.estoque_comercial_config cfg ON cfg.produto_id = p.produto_id AND cfg.ativo = true
     LEFT JOIN mov_agg m ON m.produto_id = p.produto_id
     LEFT JOIN alissonerp.locais_estoque le ON le.id = m.local_estoque_id
     LEFT JOIN reservas_agg r ON r.produto_id = p.produto_id AND r.local_estoque_id = m.local_estoque_id
     LEFT JOIN transito_agg t ON t.produto_id = p.produto_id AND t.local_estoque_id = m.local_estoque_id;

-- ===== alissonerp.vw_pedras_preco =====
CREATE OR REPLACE VIEW alissonerp.vw_pedras_preco AS
 SELECT p.produto_id AS id_produto,
    p.nome::character varying AS nome,
    p.sku::character varying AS sku,
    ppe.peso_ct,
    r.categoria_pedra,
    r.nome_tabela,
    r.custo_usd_ct,
    r.preco_rs_un,
        CASE
            WHEN r.tamanho_final_mm > r.tamanho_inicial_mm AND r.preco_rs_un IS NULL THEN round(r.markup_inicial - (r.markup_inicial - r.markup_final) * (replace(COALESCE("substring"(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric - r.tamanho_inicial_mm) / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0::numeric), 4)
            WHEN r.preco_rs_un IS NOT NULL THEN NULL::numeric
            ELSE r.markup_inicial
        END AS markup_calculado,
        CASE
            WHEN r.preco_rs_un IS NOT NULL AND r.preco_rs_un > 0::numeric THEN r.preco_rs_un::integer
            WHEN r.custo_usd_ct IS NOT NULL AND r.custo_usd_ct > 0::numeric AND ppe.peso_ct IS NOT NULL THEN round((ppe.peso_ct * r.custo_usd_ct)::double precision * (( SELECT parametros.dollar
               FROM parametros
             LIMIT 1)) *
            CASE
                WHEN r.tamanho_final_mm > r.tamanho_inicial_mm THEN r.markup_inicial - (r.markup_inicial - r.markup_final) * (replace(COALESCE("substring"(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric - r.tamanho_inicial_mm) / NULLIF(r.tamanho_final_mm - r.tamanho_inicial_mm, 0::numeric)
                ELSE r.markup_inicial
            END::double precision)::integer
            ELSE NULL::integer
        END AS preco_venda
   FROM alissonerp.erp_produtos p
     JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.produto_id
     LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.produto_id
     LEFT JOIN LATERAL ( SELECT r2.id,
            r2.nome_tabela,
            r2.categoria_pedra,
            r2.custo_usd_ct,
            r2.preco_rs_un,
            r2.tamanho_inicial_mm,
            r2.tamanho_final_mm,
            r2.markup_inicial,
            r2.markup_final,
            r2.ativa
           FROM alissonerp.pedras_precificacao_regras r2
          WHERE (lower(p.nome::text) ~~* (('%'::text || lower(r2.categoria_pedra::text)) || '%'::text) OR r2.categoria_pedra::text = 'zirconia'::text AND lower(p.nome::text) ~~* '%zirc%'::text) AND (replace(COALESCE("substring"(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric >= r2.tamanho_inicial_mm AND replace(COALESCE("substring"(p.nome::text, '([0-9]+[,.][0-9]+)\s*mm'::text), '0'::text), ','::text, '.'::text)::numeric <= r2.tamanho_final_mm OR r2.categoria_pedra::text = 'zirconia'::text)
          ORDER BY r2.tamanho_inicial_mm
         LIMIT 1) r ON true
  WHERE ti.tipo_item = 'insumo'::text AND p.situacao::text = 'A'::text AND p.categoria::text = 'Pedras'::text;

-- ===== alissonerp.vw_produto_capa =====
CREATE OR REPLACE VIEW alissonerp.vw_produto_capa AS
 WITH capa_propria AS (
         SELECT produto_imagens.produto_id,
            produto_imagens.url_publica
           FROM alissonerp.produto_imagens
          WHERE produto_imagens.eh_capa
        )
 SELECT p.produto_id AS produto_id,
    COALESCE(cp.url_publica, cp_pai.url_publica,
        CASE
            WHEN p.imagem_capa IS NOT NULL THEN 'https://base.alissonranyel.com.br/assets/'::text || p.imagem_capa::text
            ELSE NULL::text
        END) AS url_capa,
        CASE
            WHEN cp.url_publica IS NOT NULL THEN 'propria'::text
            WHEN cp_pai.url_publica IS NOT NULL THEN 'pai'::text
            WHEN p.imagem_capa IS NOT NULL THEN 'directus_legacy'::text
            ELSE NULL::text
        END AS origem
   FROM alissonerp.erp_produtos p
     LEFT JOIN capa_propria cp ON cp.produto_id = p.produto_id
     LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.produto_id AND ep.eh_variacao
     LEFT JOIN capa_propria cp_pai ON cp_pai.produto_id = ep.parent_id;

-- ===== alissonerp.vw_produto_imagens =====
CREATE OR REPLACE VIEW alissonerp.vw_produto_imagens AS
 WITH agregado AS (
         SELECT produto_imagens.produto_id,
            jsonb_agg(jsonb_build_object('id', produto_imagens.id, 'url', produto_imagens.url_publica, 'eh_capa', produto_imagens.eh_capa, 'ordem', produto_imagens.ordem, 'origem', produto_imagens.origem) ORDER BY produto_imagens.eh_capa DESC, produto_imagens.ordem) AS imagens
           FROM alissonerp.produto_imagens
          GROUP BY produto_imagens.produto_id
        )
 SELECT p.produto_id AS produto_id,
    COALESCE(prop.imagens, pai.imagens, '[]'::jsonb) AS imagens,
        CASE
            WHEN prop.imagens IS NOT NULL THEN 'propria'::text
            WHEN pai.imagens IS NOT NULL THEN 'pai'::text
            ELSE 'vazia'::text
        END AS origem_galeria
   FROM alissonerp.erp_produtos p
     LEFT JOIN agregado prop ON prop.produto_id = p.produto_id
     LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.produto_id AND ep.eh_variacao
     LEFT JOIN agregado pai ON pai.produto_id = ep.parent_id;

-- ===== alissonerp.vw_produto_preco =====
CREATE OR REPLACE VIEW alissonerp.vw_produto_preco AS
 SELECT p.produto_id AS id_produto,
        CASE
            WHEN ti.tipo_item = 'servico'::text THEN ep.preco_servico
            WHEN p.peso_precificado > 0::double precision AND cpa.markup_aplicado > 0::numeric AND (( SELECT parametros.ouro
               FROM parametros
             LIMIT 1)) > 0::double precision THEN (round(p.peso_precificado::numeric * (( SELECT parametros.ouro
               FROM parametros
             LIMIT 1))::numeric * cpa.markup_aplicado::numeric * COALESCE(p.fator::numeric, 1::numeric) / 10::numeric)::integer * 10)::numeric + COALESCE(p.preco_pedras, 0::numeric)
            ELSE NULL::numeric
        END AS preco_venda,
        CASE
            WHEN ti.tipo_item = 'servico'::text THEN NULL::numeric
            WHEN p.peso_precificado > 0::double precision AND cpa.markup_aplicado > 0::numeric AND (( SELECT parametros.ouro
               FROM parametros
             LIMIT 1)) > 0::double precision THEN (round(p.peso_precificado::numeric * (( SELECT parametros.ouro
               FROM parametros
             LIMIT 1))::numeric * cpa.markup_aplicado::numeric * COALESCE(p.fator::numeric, 1::numeric) / 10::numeric)::integer * 10)::numeric
            ELSE NULL::numeric
        END AS preco_ouro_curva,
    COALESCE(p.preco_pedras, 0::numeric) AS preco_pedras
   FROM alissonerp.erp_produtos p
     LEFT JOIN alissonerp.erp_produtos ep ON ep.produto_id = p.produto_id
     LEFT JOIN alissonerp.produto_curva_aplicada cpa ON cpa.produto_id = p.produto_id
     LEFT JOIN alissonerp.produto_tipo_item ti ON ti.produto_id = p.produto_id
  WHERE p.categoria IS NULL OR p.categoria::text <> 'Pedras'::text;

-- ===== alissonerp.vw_produtos (reescrita: erp_produtos + casts p/ preservar tipos) =====
CREATE OR REPLACE VIEW alissonerp.vw_produtos AS
 SELECT p.produto_id AS id_produto,
    p.id_api_produto, p.sku::character varying AS sku, p.nome::character varying AS nome,
    p.tipo_metal, p.tipo, p.situacao, p.unidade, p.gtin, p.categoria, p.marca, p.qtd_estoque,
    p.preco_tiny, p.preco_promocional, p.preco_custo, p.preco_custo_medio, p.preco_na_cotacao,
    p.custo_na_cotacao, p.peso_precificado, p.markup, p.fator, p.fornecedor_etl, p.preco_sync,
    p.imagem, p.data_atualizacao_preco, p.diferenca_percentual::numeric(10,3) AS diferenca_percentual,
    p.fornecedor_id_api, p.estoque_minimo, p.estoque_maximo, p.imagem_capa,
    p.tipo_de_pedra::character varying(255) AS tipo_de_pedra, p.url_drive::character varying(255) AS url_drive,
    p.peso_real, p.iframe::character varying(255) AS iframe, p.data_atualizacao, p.id_kommo,
    p.data_ultima_compra, p.prompt_imagem_ia, p.sob_encomenda, p.prazo_producao, p.categoria_precificacao
   FROM alissonerp.erp_produtos p;
