-- Migration 100: Tipos de Serviço Interno (v2.15.0)
-- Cria tabela tipos_servico + adiciona tipos_servico_ids em ordens
-- Criado: 30/03/2026

BEGIN;

-- 1. Tabela de tipos de serviço
CREATE TABLE IF NOT EXISTS alissonerp.tipos_servico (
  id         SERIAL PRIMARY KEY,
  nome       TEXT NOT NULL,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Seed com os 5 tipos iniciais
INSERT INTO alissonerp.tipos_servico (nome) VALUES
  ('Solda Laser'),
  ('Cravação Manual'),
  ('Acabamento e polimento'),
  ('Ajuste Manual'),
  ('Solda e Limpeza')
ON CONFLICT DO NOTHING;

-- 3. Nova coluna em ordens (se não existir)
ALTER TABLE alissonerp.ordens
  ADD COLUMN IF NOT EXISTS tipos_servico_ids INTEGER[] DEFAULT '{}';

-- 4. Grants para acesso via API (authenticated e anon)
GRANT SELECT, INSERT, UPDATE ON alissonerp.tipos_servico TO authenticated;
GRANT SELECT ON alissonerp.tipos_servico TO anon;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.tipos_servico_id_seq TO authenticated;

COMMIT;
