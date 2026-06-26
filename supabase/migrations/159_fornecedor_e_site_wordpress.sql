-- ============================================================
-- Migration 159 — Fornecedor + Integração Site (WordPress/WooCommerce)
--
-- 1. alissonerp.erp_produtos.fornecedor (varchar) — nome/identificador
--    do fornecedor do produto (livre, sem FK).
--
-- 2. alissonerp.fornecedores — cadastro mestre (opcional). erp_produtos
--    guarda o NOME, mas usamos a tabela para autocomplete e consolidação.
--
-- 3. alissonerp.site_config — credenciais da loja WooCommerce/WordPress
--    (URL base + consumer key + consumer secret). 1 linha global (id=1).
--
-- 4. alissonerp.site_produtos — mapeamento produto_id ↔ wc_product_id
--    com status de sincronização, hash do payload enviado e erro da
--    última tentativa.
--
-- Segurança:
--   - Tudo em alissonerp (Read+Write).
--   - CREATE ... IF NOT EXISTS (idempotente).
--   - Sem DROP.
-- ============================================================

-- ── 1. Coluna fornecedor em erp_produtos ─────────────────────────────
ALTER TABLE alissonerp.erp_produtos
    ADD COLUMN IF NOT EXISTS fornecedor VARCHAR(120);

CREATE INDEX IF NOT EXISTS idx_erp_produtos_fornecedor
    ON alissonerp.erp_produtos (fornecedor)
    WHERE fornecedor IS NOT NULL;

COMMENT ON COLUMN alissonerp.erp_produtos.fornecedor IS
    'Nome livre do fornecedor do produto. Pode coincidir com alissonerp.fornecedores.nome, mas sem FK.';

-- ── 2. Cadastro mestre de fornecedores ───────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.fornecedores (
    id          SERIAL PRIMARY KEY,
    nome        VARCHAR(120) NOT NULL UNIQUE,
    cnpj        VARCHAR(20),
    contato     VARCHAR(120),
    observacao  TEXT,
    ativo       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE alissonerp.fornecedores IS
    'Cadastro mestre opcional de fornecedores. Usado para autocomplete em produtos.';

-- ── 3. Configuração da integração com Site (WooCommerce/WordPress) ───
CREATE TABLE IF NOT EXISTS alissonerp.site_config (
    id                  INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    plataforma          VARCHAR(40)  NOT NULL DEFAULT 'woocommerce',
    site_url            VARCHAR(255),
    consumer_key        VARCHAR(255),
    consumer_secret     VARCHAR(255),
    ativo               BOOLEAN      NOT NULL DEFAULT FALSE,
    sincronizar_estoque BOOLEAN      NOT NULL DEFAULT TRUE,
    sincronizar_preco   BOOLEAN      NOT NULL DEFAULT TRUE,
    categoria_padrao_wc INTEGER,
    ultima_sync_at      TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE alissonerp.site_config IS
    'Configuração global da loja WooCommerce/WordPress (1 linha: id=1).';

-- Garante que a linha id=1 exista (idempotente)
INSERT INTO alissonerp.site_config (id, plataforma, ativo)
VALUES (1, 'woocommerce', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ── 4. Mapeamento produto ERP ↔ produto WooCommerce ──────────────────
CREATE TABLE IF NOT EXISTS alissonerp.site_produtos (
    id                  SERIAL PRIMARY KEY,
    produto_id          INTEGER NOT NULL,           -- public.produtos.id_produto
    sku                 VARCHAR(120) NOT NULL,
    wc_product_id       INTEGER,                    -- id no WordPress/Woo
    wc_permalink        VARCHAR(500),
    publicado_no_site   BOOLEAN      NOT NULL DEFAULT FALSE,
    status_sync         VARCHAR(20)  NOT NULL DEFAULT 'pendente',
                                                    -- 'pendente' | 'ok' | 'erro'
    hash_enviado        VARCHAR(64),                -- sha256 do payload
    ultimo_erro         TEXT,
    ultima_tentativa_at TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT site_produtos_produto_id_unique UNIQUE (produto_id)
);

CREATE INDEX IF NOT EXISTS idx_site_produtos_status
    ON alissonerp.site_produtos (status_sync)
    WHERE publicado_no_site = TRUE;

CREATE INDEX IF NOT EXISTS idx_site_produtos_sku
    ON alissonerp.site_produtos (sku);

COMMENT ON TABLE alissonerp.site_produtos IS
    'Mapping produto_id ↔ wc_product_id com status de sincronização.';

-- ── 5. Trigger simples de updated_at (se ainda não existe) ───────────
CREATE OR REPLACE FUNCTION alissonerp.fn_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_fornecedores_updated_at ON alissonerp.fornecedores;
CREATE TRIGGER trg_fornecedores_updated_at
    BEFORE UPDATE ON alissonerp.fornecedores
    FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_site_config_updated_at ON alissonerp.site_config;
CREATE TRIGGER trg_site_config_updated_at
    BEFORE UPDATE ON alissonerp.site_config
    FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_touch_updated_at();

DROP TRIGGER IF EXISTS trg_site_produtos_updated_at ON alissonerp.site_produtos;
CREATE TRIGGER trg_site_produtos_updated_at
    BEFORE UPDATE ON alissonerp.site_produtos
    FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_touch_updated_at();
