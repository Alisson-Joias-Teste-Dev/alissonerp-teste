-- =============================================
-- MIGRATION 086: WhatsApp Assistant — tabelas wa_*
-- Schema: alissonerp
-- =============================================

-- wa_conversas: histórico de mensagens
CREATE TABLE alissonerp.wa_conversas (
  id          BIGSERIAL PRIMARY KEY,
  telefone    VARCHAR(20) NOT NULL,
  user_profile_id UUID REFERENCES public.user_profiles(id_user) ON DELETE SET NULL,
  nome_usuario    VARCHAR(100),
  role_usuario    VARCHAR(50),
  direcao         VARCHAR(10) NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  mensagem        TEXT NOT NULL,
  tipo_resposta   VARCHAR(20) DEFAULT 'direta' CHECK (tipo_resposta IN ('direta', 'escalada', 'sugestao')),
  tokens_entrada  INTEGER,
  tokens_saida    INTEGER,
  modelo          VARCHAR(50),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wa_conversas_telefone_created ON alissonerp.wa_conversas (telefone, created_at DESC);
CREATE INDEX idx_wa_conversas_tipo_created     ON alissonerp.wa_conversas (tipo_resposta, created_at DESC);

-- wa_escalacoes: escalações para Jonathan
CREATE TABLE alissonerp.wa_escalacoes (
  id                  BIGSERIAL PRIMARY KEY,
  conversa_id         BIGINT REFERENCES alissonerp.wa_conversas(id) ON DELETE SET NULL,
  telefone            VARCHAR(20) NOT NULL,
  nome_usuario        VARCHAR(100),
  role_usuario        VARCHAR(50),
  tipo                VARCHAR(20) NOT NULL CHECK (tipo IN ('duvida', 'bug', 'sugestao', 'urgente')),
  resumo              TEXT NOT NULL,
  analise_assistente  TEXT,
  contexto_mensagens  JSONB DEFAULT '[]',
  status              VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'resolvido', 'descartado')),
  resposta_jonathan   TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  resolvido_at        TIMESTAMPTZ
);

CREATE INDEX idx_wa_escalacoes_status_created ON alissonerp.wa_escalacoes (status, created_at DESC);
CREATE INDEX idx_wa_escalacoes_tipo_created   ON alissonerp.wa_escalacoes (tipo, created_at DESC);

-- wa_usuarios: cache telefone → perfil
CREATE TABLE alissonerp.wa_usuarios (
  id              SERIAL PRIMARY KEY,
  telefone        VARCHAR(20) UNIQUE NOT NULL,
  user_profile_id UUID REFERENCES public.user_profiles(id_user) ON DELETE SET NULL,
  nome            VARCHAR(100) NOT NULL,
  role            VARCHAR(50),
  ativo           BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wa_usuarios_telefone ON alissonerp.wa_usuarios (telefone);

-- wa_knowledge_base: base de conhecimento editável
CREATE TABLE alissonerp.wa_knowledge_base (
  id              SERIAL PRIMARY KEY,
  categoria       VARCHAR(50) NOT NULL CHECK (categoria IN ('tela', 'fluxo', 'erro', 'faq', 'role')),
  titulo          VARCHAR(200) NOT NULL,
  conteudo        TEXT NOT NULL,
  roles_aplicaveis TEXT[] DEFAULT '{}',
  ativo           BOOLEAN DEFAULT true,
  ordem           INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wa_knowledge_base_categoria_ativo ON alissonerp.wa_knowledge_base (categoria, ativo);

-- GRANTS
GRANT SELECT, INSERT, UPDATE ON alissonerp.wa_conversas   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.wa_escalacoes  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.wa_usuarios    TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.wa_knowledge_base TO authenticated;

GRANT USAGE ON SEQUENCE alissonerp.wa_conversas_id_seq  TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.wa_escalacoes_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.wa_usuarios_id_seq   TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.wa_knowledge_base_id_seq TO authenticated;
