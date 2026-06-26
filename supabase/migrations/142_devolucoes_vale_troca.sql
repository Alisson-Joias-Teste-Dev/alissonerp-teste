-- ============================================================
-- Migration 142 — Modulo Devolucao / Vale-Troca / Reembolso
-- v2.22.0 — Devolucoes com aprovacao em cascata + vale-troca
--           sequencial + reembolso MP/contas_pagar
--
-- Nota: a spec pedia "140_devolucoes_vale_troca.sql" mas 140
-- ja esta em uso por estoque_comercial_v2. Usado 142 por ser o
-- proximo numero livre apos 141.
-- ============================================================

SET search_path TO alissonerp;

-- ──────────────────────────────────────────────────────────
-- 1. SEQUENCES dedicadas
-- ──────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS alissonerp.devolucoes_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS alissonerp.vale_troca_seq START WITH 1;

-- ──────────────────────────────────────────────────────────
-- 2. TABELA: devolucoes_venda
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.devolucoes_venda (
  id                     SERIAL PRIMARY KEY,
  numero                 VARCHAR(20) UNIQUE NOT NULL,
  venda_id               INTEGER NOT NULL REFERENCES alissonerp.vendas_erp(id),
  tipo                   VARCHAR(20) NOT NULL CHECK (tipo IN ('parcial','total')),
  motivo                 TEXT,
  status                 VARCHAR(30) NOT NULL DEFAULT 'rascunho'
                         CHECK (status IN ('rascunho','aguardando_aprovacao','aprovado','rejeitado','concluido','cancelado')),
  tipo_compensacao       VARCHAR(30) NOT NULL
                         CHECK (tipo_compensacao IN ('vale_troca','reembolso_mp','reembolso_manual')),
  valor_total_devolvido  NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_retido           NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_compensacao      NUMERIC(12,2) NOT NULL DEFAULT 0,
  percentual_retencao    NUMERIC(5,2)  NOT NULL DEFAULT 0,
  foi_entregue           BOOLEAN       NOT NULL DEFAULT false,
  tarefa_id              INTEGER       REFERENCES alissonerp.tarefas(id),
  aprovador_id           UUID          REFERENCES auth.users(id),
  rejeitado_motivo       TEXT,
  criado_por             UUID          NOT NULL REFERENCES auth.users(id),
  created_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  aprovado_em            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_devolucoes_venda       ON alissonerp.devolucoes_venda(venda_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_status      ON alissonerp.devolucoes_venda(status);
CREATE INDEX IF NOT EXISTS idx_devolucoes_criado_por  ON alissonerp.devolucoes_venda(criado_por);
CREATE INDEX IF NOT EXISTS idx_devolucoes_tarefa      ON alissonerp.devolucoes_venda(tarefa_id)
  WHERE tarefa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devolucoes_created     ON alissonerp.devolucoes_venda(created_at DESC);

-- ──────────────────────────────────────────────────────────
-- 3. TABELA: devolucoes_itens
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.devolucoes_itens (
  id                   SERIAL PRIMARY KEY,
  devolucao_id         INTEGER NOT NULL REFERENCES alissonerp.devolucoes_venda(id) ON DELETE CASCADE,
  item_venda_id        INTEGER NOT NULL REFERENCES alissonerp.itens_venda_erp(id),
  produto_id           BIGINT,
  quantidade           NUMERIC(10,3) NOT NULL,
  valor_unitario       NUMERIC(12,2) NOT NULL,
  valor_total          NUMERIC(12,2) NOT NULL,
  condicao             VARCHAR(30) NOT NULL DEFAULT 'pendente'
                       CHECK (condicao IN ('pendente','aprovado_retorno','reprovado_descarte','garantia')),
  inspecao_por         UUID REFERENCES auth.users(id),
  inspecao_em          TIMESTAMPTZ,
  inspecao_observacao  TEXT
);

CREATE INDEX IF NOT EXISTS idx_devolucoes_itens_devolucao ON alissonerp.devolucoes_itens(devolucao_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_itens_item      ON alissonerp.devolucoes_itens(item_venda_id);
CREATE INDEX IF NOT EXISTS idx_devolucoes_itens_produto   ON alissonerp.devolucoes_itens(produto_id);

-- ──────────────────────────────────────────────────────────
-- 4. TABELA: vale_troca
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.vale_troca (
  id                    SERIAL PRIMARY KEY,
  numero                VARCHAR(20) UNIQUE NOT NULL,
  devolucao_id          INTEGER REFERENCES alissonerp.devolucoes_venda(id),
  cliente_id            INTEGER REFERENCES public.contatos(id_contato),
  valor_original        NUMERIC(12,2) NOT NULL,
  valor_disponivel      NUMERIC(12,2) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo','utilizado','cancelado')),
  venda_utilizado_id    INTEGER REFERENCES alissonerp.vendas_erp(id),
  utilizado_em          TIMESTAMPTZ,
  vale_origem_id        INTEGER REFERENCES alissonerp.vale_troca(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_vale_troca_numero    ON alissonerp.vale_troca(numero);
CREATE INDEX IF NOT EXISTS idx_vale_troca_cliente   ON alissonerp.vale_troca(cliente_id) WHERE cliente_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vale_troca_status    ON alissonerp.vale_troca(status);
CREATE INDEX IF NOT EXISTS idx_vale_troca_devolucao ON alissonerp.vale_troca(devolucao_id) WHERE devolucao_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vale_troca_origem    ON alissonerp.vale_troca(vale_origem_id) WHERE vale_origem_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────
-- 5. TABELA: reembolsos
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.reembolsos (
  id              SERIAL PRIMARY KEY,
  devolucao_id    INTEGER NOT NULL REFERENCES alissonerp.devolucoes_venda(id),
  metodo          VARCHAR(30) NOT NULL CHECK (metodo IN ('mp_automatico','contas_pagar_manual')),
  valor           NUMERIC(12,2) NOT NULL,
  mp_payment_id   VARCHAR(100),
  mp_refund_id    VARCHAR(100),
  mp_status       VARCHAR(30),
  mp_erro         TEXT,
  conta_pagar_id  INTEGER REFERENCES alissonerp.contas_pagar(id),
  status          VARCHAR(20) NOT NULL DEFAULT 'pendente'
                  CHECK (status IN ('pendente','processando','concluido','falhou')),
  processado_em   TIMESTAMPTZ,
  criado_por      UUID NOT NULL REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reembolsos_devolucao ON alissonerp.reembolsos(devolucao_id);
CREATE INDEX IF NOT EXISTS idx_reembolsos_status    ON alissonerp.reembolsos(status);

-- ──────────────────────────────────────────────────────────
-- 6. Extensoes a tabelas existentes
-- ──────────────────────────────────────────────────────────
ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS vale_troca_id INTEGER REFERENCES alissonerp.vale_troca(id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_vale_troca
  ON alissonerp.pagamentos_venda(vale_troca_id) WHERE vale_troca_id IS NOT NULL;

ALTER TABLE alissonerp.movimentacoes_estoque_comercial
  ADD COLUMN IF NOT EXISTS devolucao_id INTEGER REFERENCES alissonerp.devolucoes_venda(id);
CREATE INDEX IF NOT EXISTS idx_mov_ec_devolucao
  ON alissonerp.movimentacoes_estoque_comercial(devolucao_id) WHERE devolucao_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────
-- 7. Seed configuracoes_sistema
-- ──────────────────────────────────────────────────────────
INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES (
  'devolucao_retencao_nao_entregue',
  '30',
  'Percentual retido pela loja quando produto nao foi entregue (padrao 30% — cliente recebe 70%)'
)
ON CONFLICT (chave) DO NOTHING;

-- ──────────────────────────────────────────────────────────
-- 8. Permissoes de role para modulo "devolucoes"
-- ──────────────────────────────────────────────────────────
INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever)
VALUES
  ('gerente_loja', 'devolucoes', true, true),
  ('diretor',      'devolucoes', true, true),
  ('admin',        'devolucoes', true, true),
  ('desenvolvedor','devolucoes', true, true),
  ('gerente_loja', 'vale_troca', true, true),
  ('diretor',      'vale_troca', true, true),
  ('admin',        'vale_troca', true, true),
  ('desenvolvedor','vale_troca', true, true)
ON CONFLICT (role, modulo) DO UPDATE SET
  pode_ler = EXCLUDED.pode_ler,
  pode_escrever = EXCLUDED.pode_escrever;

-- ──────────────────────────────────────────────────────────
-- 9. Grants
-- ──────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON alissonerp.devolucoes_venda  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.devolucoes_itens  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.vale_troca        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.reembolsos        TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE alissonerp.devolucoes_venda_id_seq  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.devolucoes_itens_id_seq  TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.vale_troca_id_seq        TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.reembolsos_id_seq        TO authenticated;
GRANT USAGE        ON SEQUENCE alissonerp.devolucoes_seq            TO authenticated;
GRANT USAGE        ON SEQUENCE alissonerp.vale_troca_seq            TO authenticated;

-- ──────────────────────────────────────────────────────────
-- 10. Trigger updated_at em devolucoes_venda
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_devolucoes_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_devolucoes_updated_at ON alissonerp.devolucoes_venda;
CREATE TRIGGER trg_devolucoes_updated_at
  BEFORE UPDATE ON alissonerp.devolucoes_venda
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_devolucoes_updated_at();
