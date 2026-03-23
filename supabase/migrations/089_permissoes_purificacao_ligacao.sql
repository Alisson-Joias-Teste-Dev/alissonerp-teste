-- Migration 089: Permissões granulares por usuário (purificação/ligação)
-- ⚠️ BACKUP antes de executar

-- Tabela de permissões granulares por usuário
CREATE TABLE IF NOT EXISTS alissonerp.permissoes_usuario (
  id          SERIAL PRIMARY KEY,
  usuario_id  UUID NOT NULL REFERENCES alissonerp.usuarios(id) ON DELETE CASCADE,
  acao        VARCHAR(50) NOT NULL,
  permitido   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(usuario_id, acao)
);

-- Index para busca rápida
CREATE INDEX IF NOT EXISTS idx_permissoes_usuario_acao
  ON alissonerp.permissoes_usuario(usuario_id, acao);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.permissoes_usuario TO authenticated;
GRANT USAGE ON SEQUENCE alissonerp.permissoes_usuario_id_seq TO authenticated;

-- Seed: admin, desenvolvedor, gerente_fabrica recebem as 4 permissões
INSERT INTO alissonerp.permissoes_usuario (usuario_id, acao, permitido)
SELECT u.id, a.acao, true
FROM alissonerp.usuarios u
CROSS JOIN (
  VALUES
    ('abrir_purificacao'),
    ('concluir_purificacao'),
    ('abrir_ligacao'),
    ('concluir_ligacao')
) AS a(acao)
WHERE u.role IN ('admin', 'desenvolvedor', 'gerente_fabrica')
  AND u.ativo = true
ON CONFLICT (usuario_id, acao) DO NOTHING;
