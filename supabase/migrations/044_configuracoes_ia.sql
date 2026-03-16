-- =============================================
-- MIGRATION 044: CONFIGURAÇÕES DE IA
-- Tabelas para configurações do sistema e secrets de API
-- =============================================

-- Configurações gerais do sistema (chave/valor)
CREATE TABLE IF NOT EXISTS alissonerp.configuracoes_sistema (
  id          SERIAL PRIMARY KEY,
  chave       VARCHAR(100) UNIQUE NOT NULL,
  valor       TEXT NOT NULL,
  descricao   TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID
);

-- Secrets de API (armazenadas como texto — em produção usar pgcrypto)
CREATE TABLE IF NOT EXISTS alissonerp.configuracoes_secrets (
  id               SERIAL PRIMARY KEY,
  chave            VARCHAR(100) UNIQUE NOT NULL,
  valor_encrypted  TEXT NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_by       UUID
);

-- Seed: configuração padrão de IA
INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES
  ('ia_provedor',       'claude',                    'Provedor de IA ativo: claude | openai | gemini'),
  ('ia_modelo_claude',  'claude-haiku-4-5-20251001', 'Modelo Claude a usar'),
  ('ia_modelo_openai',  'gpt-4o',                   'Modelo OpenAI a usar'),
  ('ia_modelo_gemini',  'gemini-2.0-flash',          'Modelo Gemini a usar'),
  ('ia_ativa',          'true',                      'IA habilitada globalmente: true | false')
ON CONFLICT (chave) DO NOTHING;

-- Grants
GRANT SELECT, UPDATE ON alissonerp.configuracoes_sistema TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.configuracoes_secrets TO authenticated;

GRANT USAGE ON SEQUENCE alissonerp.configuracoes_sistema_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.configuracoes_secrets_id_seq TO authenticated;
