-- Migration 320: Expande alissonerp.erp_produtos com todas as colunas de public.produtos
--
-- O QUÊ: Adiciona as ~40 colunas que existem em public.produtos mas nao em erp_produtos,
--         preparando a consolidacao das duas tabelas em uma so.
-- POR QUE: public.produtos fica no schema errado (public = legado Directus).
--           O objetivo e ter tudo em alissonerp.erp_produtos e deprecar public.produtos.
-- IMPACTO: Nenhum risco -- so ADD COLUMN IF NOT EXISTS (sem remover nada, sem quebrar nada).

-- Identificacao e integracao
ALTER TABLE alissonerp.erp_produtos
  ADD COLUMN IF NOT EXISTS id_api_produto       BIGINT,
  ADD COLUMN IF NOT EXISTS tipo_metal           VARCHAR,
  ADD COLUMN IF NOT EXISTS tipo                 VARCHAR,
  ADD COLUMN IF NOT EXISTS situacao             VARCHAR,
  ADD COLUMN IF NOT EXISTS unidade              VARCHAR,
  ADD COLUMN IF NOT EXISTS gtin                 VARCHAR,
  ADD COLUMN IF NOT EXISTS categoria            VARCHAR,
  ADD COLUMN IF NOT EXISTS marca                VARCHAR;

-- Estoque
ALTER TABLE alissonerp.erp_produtos
  ADD COLUMN IF NOT EXISTS qtd_estoque          BIGINT,
  ADD COLUMN IF NOT EXISTS estoque_minimo       INTEGER,
  ADD COLUMN IF NOT EXISTS estoque_maximo       INTEGER,
  ADD COLUMN IF NOT EXISTS sob_encomenda        VARCHAR,
  ADD COLUMN IF NOT EXISTS prazo_producao       INTEGER;

-- Precificacao
ALTER TABLE alissonerp.erp_produtos
  ADD COLUMN IF NOT EXISTS peso_precificado     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS peso_real            REAL,
  ADD COLUMN IF NOT EXISTS markup               DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fator                REAL,
  ADD COLUMN IF NOT EXISTS preco_tiny           NUMERIC,
  ADD COLUMN IF NOT EXISTS preco_promocional    NUMERIC,
  ADD COLUMN IF NOT EXISTS preco_custo          NUMERIC,
  ADD COLUMN IF NOT EXISTS preco_custo_medio    NUMERIC,
  ADD COLUMN IF NOT EXISTS preco_na_cotacao     NUMERIC,
  ADD COLUMN IF NOT EXISTS custo_na_cotacao     NUMERIC,
  ADD COLUMN IF NOT EXISTS preco_sync           NUMERIC,
  ADD COLUMN IF NOT EXISTS diferenca_percentual NUMERIC,
  ADD COLUMN IF NOT EXISTS data_atualizacao_preco TIMESTAMP WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS categoria_precificacao VARCHAR;

-- Pedras
ALTER TABLE alissonerp.erp_produtos
  ADD COLUMN IF NOT EXISTS tem_pedra_preciosa   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tipo_de_pedra        VARCHAR,
  ADD COLUMN IF NOT EXISTS preco_pedras         NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_total_sync     NUMERIC;

-- Imagens e midia
ALTER TABLE alissonerp.erp_produtos
  ADD COLUMN IF NOT EXISTS imagem               TEXT,
  ADD COLUMN IF NOT EXISTS imagem_capa          UUID,
  ADD COLUMN IF NOT EXISTS url_drive            VARCHAR,
  ADD COLUMN IF NOT EXISTS iframe               VARCHAR,
  ADD COLUMN IF NOT EXISTS prompt_imagem_ia     TEXT;

-- Fornecedor e integracoes externas
ALTER TABLE alissonerp.erp_produtos
  ADD COLUMN IF NOT EXISTS fornecedor_etl       VARCHAR,
  ADD COLUMN IF NOT EXISTS fornecedor_id_api    BIGINT,
  ADD COLUMN IF NOT EXISTS id_kommo             BIGINT,
  ADD COLUMN IF NOT EXISTS data_ultima_compra   DATE;

-- Datas de controle
ALTER TABLE alissonerp.erp_produtos
  ADD COLUMN IF NOT EXISTS data_atualizacao     TIMESTAMP WITHOUT TIME ZONE;

COMMENT ON TABLE alissonerp.erp_produtos IS
  'Tabela unificada de produtos ERP. Absorve public.produtos (legado Directus). '
  'public.produtos sera mantida como VIEW readonly apos migracao completa.';
