-- Migration 230: Schema agentes (inicial)
-- Gerado do banco de homolog em 02/05/2026
-- Aplicar via: psql -h <host> -p <port> -U postgres -d <database> -f supabase/migrations/230_schema_agentes_inicial.sql

CREATE SCHEMA IF NOT EXISTS agentes;
COMMENT ON SCHEMA agentes IS 'Memória, conversas, logs e config dos agentes IA';

-- 1. Skills
CREATE TABLE IF NOT EXISTS agentes.skills (
  id              SERIAL PRIMARY KEY,
  slug            VARCHAR(50) UNIQUE NOT NULL,
  nome            VARCHAR(100) NOT NULL,
  descricao       TEXT,
  bot_token_env   VARCHAR(100) NOT NULL,
  prompt_path     VARCHAR(255) NOT NULL,
  prompt_versao   VARCHAR(64) NOT NULL DEFAULT 'v1',
  ativa           BOOLEAN NOT NULL DEFAULT true,
  llm_provider    VARCHAR(30) NOT NULL DEFAULT 'deepseek',
  llm_model       VARCHAR(50) NOT NULL DEFAULT 'deepseek-chat',
  max_tokens      INT NOT NULL DEFAULT 2000,
  max_tool_loops  INT NOT NULL DEFAULT 5,
  janela_msgs     INT NOT NULL DEFAULT 20,
  criada_em       TIMESTAMPTZ DEFAULT NOW(),
  atualizada_em   TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Usuários x Skills (sessões)
CREATE TABLE IF NOT EXISTS agentes.usuarios_skill (
  id                SERIAL PRIMARY KEY,
  skill_id          INT NOT NULL REFERENCES agentes.skills(id) ON DELETE CASCADE,
  usuario_id        UUID NOT NULL,
  telegram_chat_id  BIGINT NOT NULL,
  telegram_username VARCHAR(100),
  token_hash        VARCHAR(255),
  token_expires_at  TIMESTAMPTZ,
  last_login_at     TIMESTAMPTZ,
  consentimento_em  TIMESTAMPTZ,
  consentimento_versao VARCHAR(20),
  esquecido_em      TIMESTAMPTZ,
  criado_em         TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_skill_chat UNIQUE (skill_id, telegram_chat_id),
  CONSTRAINT uq_skill_usuario UNIQUE (skill_id, usuario_id)
);
CREATE INDEX IF NOT EXISTS idx_usk_chat_id ON agentes.usuarios_skill(telegram_chat_id) WHERE esquecido_em IS NULL;

-- 3. Conversas
CREATE TABLE IF NOT EXISTS agentes.conversas (
  id              BIGSERIAL PRIMARY KEY,
  usuario_skill_id INT NOT NULL REFERENCES agentes.usuarios_skill(id) ON DELETE CASCADE,
  role            VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  conteudo        TEXT NOT NULL,
  tool_name       VARCHAR(100),
  tool_args       JSONB,
  tool_result     JSONB,
  tokens_in       INT,
  tokens_out      INT,
  prompt_versao   VARCHAR(64),
  modelo          VARCHAR(50),
  criada_em       TIMESTAMPTZ DEFAULT NOW(),
  anonimizada_em  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_conv_usk_data ON agentes.conversas(usuario_skill_id, criada_em DESC);

-- 4. Tool calls log
CREATE TABLE IF NOT EXISTS agentes.tool_calls_log (
  id              BIGSERIAL PRIMARY KEY,
  usuario_skill_id INT NOT NULL REFERENCES agentes.usuarios_skill(id) ON DELETE CASCADE,
  conversa_id     BIGINT REFERENCES agentes.conversas(id),
  tool_name       VARCHAR(100) NOT NULL,
  args            JSONB NOT NULL,
  is_escrita      BOOLEAN NOT NULL,
  resultado       JSONB,
  erro            TEXT,
  duracao_ms      INT,
  executada_em    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tcl_usk_data ON agentes.tool_calls_log(usuario_skill_id, executada_em DESC);

-- 5. Escritas pendentes (confirmação humana nível 2)
CREATE TABLE IF NOT EXISTS agentes.escritas_pendentes (
  id              SERIAL PRIMARY KEY,
  usuario_skill_id INT NOT NULL REFERENCES agentes.usuarios_skill(id) ON DELETE CASCADE,
  conversa_id     BIGINT REFERENCES agentes.conversas(id),
  tool_name       VARCHAR(100) NOT NULL,
  args            JSONB NOT NULL,
  resumo_humano   TEXT NOT NULL,
  telegram_message_id BIGINT,
  status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente','confirmada','cancelada','expirada')),
  criada_em       TIMESTAMPTZ DEFAULT NOW(),
  expira_em       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
  resolvida_em    TIMESTAMPTZ,
  resultado       JSONB,
  erro            TEXT
);
CREATE INDEX IF NOT EXISTS idx_esc_pend_status ON agentes.escritas_pendentes(status, expira_em);

-- Seed: skill gerente-producao
INSERT INTO agentes.skills (slug, nome, descricao, bot_token_env, prompt_path, prompt_versao, ativa, llm_provider, llm_model)
VALUES (
  'gerente-producao',
  'Gerente de Produção',
  'Assistente do gerente da fábrica: PCP, ordens, estoque, processos',
  'TELEGRAM_BOT_TOKEN_GERENTE',
  'src/agentes/skills/gerente-producao/prompt.md',
  'v1',
  true,
  'deepseek',
  'deepseek-chat'
)
ON CONFLICT (slug) DO NOTHING;
