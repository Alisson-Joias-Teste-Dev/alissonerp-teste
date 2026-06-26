-- =============================================
-- MIGRATION 059: Tabela markup_alteracoes — fila de aprovação de mudanças de markup
--
-- Fluxo: usuário simula mudança → salva aqui como 'pendente' → outro admin aprova/rejeita (P3.3)
-- NÃO aplica mudanças de markup diretamente — só armazena a intenção + simulação.
-- =============================================

CREATE TABLE IF NOT EXISTS alissonerp.markup_alteracoes (
  id                SERIAL PRIMARY KEY,

  -- O que mudou
  tipo              VARCHAR(20) NOT NULL                    -- 'ouro' ou 'pedra'
                    CHECK (tipo IN ('ouro', 'pedra')),
  faixa_id          INTEGER NOT NULL,                       -- id da categoria_precificação ou markup_pedras
  faixa_nome        VARCHAR(100) NOT NULL,                  -- nome da faixa (referência legível)
  markup_anterior   NUMERIC(10,4) NOT NULL,
  markup_novo       NUMERIC(10,4) NOT NULL,

  -- Impacto simulado
  produtos_afetados INTEGER       DEFAULT 0,
  variacao_media    NUMERIC(10,2) DEFAULT 0,
  variacao_min      NUMERIC(10,2) DEFAULT 0,
  variacao_max      NUMERIC(10,2) DEFAULT 0,
  simulacao_json    JSONB,          -- [{produto_id, nome, sku, peso, preco_atual, preco_novo, variacao}]

  -- Fluxo de aprovação
  status            VARCHAR(20) DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
  criado_por        UUID NOT NULL,                          -- auth.users.id
  data_criacao      TIMESTAMPTZ DEFAULT NOW(),
  aprovado_por      UUID,
  data_aprovacao    TIMESTAMPTZ,
  motivo_rejeicao   TEXT,

  -- Aplicação
  aplicado          BOOLEAN DEFAULT false,
  data_aplicacao    TIMESTAMPTZ,

  CONSTRAINT markup_alteracoes_markup_check CHECK (markup_novo > 0 AND markup_anterior > 0)
);

CREATE INDEX IF NOT EXISTS idx_markup_alteracoes_status
  ON alissonerp.markup_alteracoes(status);

CREATE INDEX IF NOT EXISTS idx_markup_alteracoes_criado_por
  ON alissonerp.markup_alteracoes(criado_por);

GRANT SELECT, INSERT, UPDATE
  ON alissonerp.markup_alteracoes TO authenticated, anon;

GRANT USAGE, SELECT
  ON SEQUENCE alissonerp.markup_alteracoes_id_seq TO authenticated, anon;

COMMENT ON TABLE alissonerp.markup_alteracoes IS
  'Fila de aprovação de mudanças de markup (ouro ou pedra). '
  'Criado quando usuário simula e envia pra aprovação. '
  'Aprovação real e aplicação são implementadas em P3.3.';
