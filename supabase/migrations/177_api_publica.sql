-- ─── Migration 177: API Pública de Produtos ────────────────────────────────────
-- Cria sistema de API keys + rate limiting + webhooks para integração com o site

-- ── Tabela de chaves de API ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.api_chaves (
  id                    SERIAL PRIMARY KEY,
  nome                  TEXT NOT NULL,                        -- label amigável
  chave_hash            TEXT NOT NULL UNIQUE,                 -- SHA-256 hex da chave real
  chave_preview         TEXT NOT NULL,                       -- primeiros 16 chars para exibição
  ativa                 BOOLEAN NOT NULL DEFAULT true,
  rate_limit_por_minuto INT NOT NULL DEFAULT 60,
  total_requisicoes     BIGINT NOT NULL DEFAULT 0,
  ultimo_uso            TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE alissonerp.api_chaves IS 'Chaves de API para integração com o site externo';
COMMENT ON COLUMN alissonerp.api_chaves.chave_hash IS 'SHA-256(key) — a chave real nunca é armazenada';
COMMENT ON COLUMN alissonerp.api_chaves.chave_preview IS 'sk_live_XXXXXXXX... mostrado na UI para identificação';

-- ── Tabela de log de requisições da API pública ─────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.api_log (
  id          BIGSERIAL PRIMARY KEY,
  chave_id    INT REFERENCES alissonerp.api_chaves(id) ON DELETE SET NULL,
  endpoint    TEXT NOT NULL,
  metodo      TEXT NOT NULL DEFAULT 'GET',
  status_code INT,
  ip          TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_log_chave_id  ON alissonerp.api_log(chave_id);
CREATE INDEX IF NOT EXISTS idx_api_log_created_at ON alissonerp.api_log(created_at DESC);

COMMENT ON TABLE alissonerp.api_log IS 'Log de requisições da API pública — retidos 90 dias';

-- ── Webhook entries para produtos ──────────────────────────────────────────────
-- Reaproveitamos a tabela webhook_config existente (migration 025)
-- URL configurada depois pelo admin via /configuracoes > Webhooks

INSERT INTO alissonerp.webhook_config (nome, url, ativo, descricao)
VALUES
  ('produto_criado_site',     '', false, 'Produto criado no ERP → notifica o site para adicionar'),
  ('produto_atualizado_site', '', false, 'Produto atualizado no ERP → notifica o site para sincronizar'),
  ('produto_desativado_site', '', false, 'Produto desativado/ativo alterado → notifica o site')
ON CONFLICT (nome) DO NOTHING;

-- ── Permissão para gerentes e admin gerenciarem chaves ──────────────────────────
INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever)
VALUES
  ('desenvolvedor', 'api_publica', true, true),
  ('admin',         'api_publica', true, true),
  ('gerente_loja',  'api_publica', true, false),
  ('gerente_fabrica','api_publica', true, false)
ON CONFLICT (role, modulo) DO NOTHING;
