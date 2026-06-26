-- Migration 138: Saldo Crédito Gerente + Aprovação em Cascata
-- v2.20.0 — Saldo rotativo para gerente de loja aprovar vendas com A Receber

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Tabela de audit log do saldo de crédito da loja
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.saldo_credito_loja (
  id            SERIAL PRIMARY KEY,
  tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('debito','credito','ajuste')),
  valor         NUMERIC(12,2) NOT NULL,
  saldo_antes   NUMERIC(12,2) NOT NULL,
  saldo_depois  NUMERIC(12,2) NOT NULL,
  venda_id      INTEGER REFERENCES alissonerp.vendas_erp(id),
  pagamento_id  INTEGER REFERENCES alissonerp.pagamentos_venda(id),
  descricao     TEXT,
  usuario_id    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saldo_credito_venda
  ON alissonerp.saldo_credito_loja(venda_id) WHERE venda_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saldo_credito_pagamento
  ON alissonerp.saldo_credito_loja(pagamento_id) WHERE pagamento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_saldo_credito_created
  ON alissonerp.saldo_credito_loja(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Seed configurações do saldo
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES
  ('saldo_gerente_limite', '50000', 'Limite máximo do saldo de crédito do gerente de loja (R$)'),
  ('saldo_gerente_atual',  '50000', 'Saldo atual do crédito do gerente de loja (R$) — atualizado automaticamente')
ON CONFLICT (chave) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Novas colunas em vendas_erp
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS credito_gerente_usado NUMERIC(12,2) DEFAULT 0;
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS aprovacao_credito_tipo VARCHAR(20);
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS aprovacao_credito_tarefa_id INTEGER REFERENCES alissonerp.tarefas(id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Nova coluna venda_id em tarefas (link tarefa → venda)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE alissonerp.tarefas
  ADD COLUMN IF NOT EXISTS venda_id INTEGER REFERENCES alissonerp.vendas_erp(id);
CREATE INDEX IF NOT EXISTS idx_tarefas_venda
  ON alissonerp.tarefas(venda_id) WHERE venda_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Nova role: diretor
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO alissonerp.roles (nome, descricao)
VALUES ('diretor', 'Diretor — acesso total + aprovação de crédito acima do saldo')
ON CONFLICT (nome) DO NOTHING;

-- Copiar permissões do admin para o diretor (acesso total)
INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever)
SELECT 'diretor', modulo, pode_ler, pode_escrever
FROM alissonerp.role_permissoes
WHERE role = 'admin'
ON CONFLICT (role, modulo) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Grants
-- ═══════════════════════════════════════════════════════════════════════════════
GRANT SELECT, INSERT ON alissonerp.saldo_credito_loja TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.saldo_credito_loja_id_seq TO authenticated;
