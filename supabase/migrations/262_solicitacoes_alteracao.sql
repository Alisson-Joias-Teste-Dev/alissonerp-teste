-- ============================================================
-- Migration 262 — Tabela de solicitações de alteração de venda/pagamento
--
-- Vendedora (consultora/gerente) não pode mais editar campos financeiros
-- nem alterar status de pagamentos confirmados. Quando precisar mudar,
-- abre uma solicitação aqui. Admin/desenvolvedor/diretor aprova ou rejeita
-- via /vendas/solicitacoes-alteracao.
--
-- Mesma ideia da tabela solicitacoes_desconto (migration 170), porém
-- genérica: cobre tanto mudança de status de pagamento quanto edição de
-- campos protegidos da venda (situacao, total_frete, cliente_id, etc).
-- ============================================================

SET search_path TO alissonerp, public;

CREATE TABLE IF NOT EXISTS alissonerp.solicitacoes_alteracao (
  id                  SERIAL PRIMARY KEY,
  tipo                TEXT NOT NULL CHECK (tipo IN ('pagamento_status', 'venda_campo')),
  venda_id            INTEGER NOT NULL REFERENCES alissonerp.vendas_erp(id),
  pagamento_id        INTEGER REFERENCES alissonerp.pagamentos_venda(id),
  campo               TEXT,
  valor_atual         JSONB,
  valor_solicitado    JSONB NOT NULL,
  motivo              TEXT NOT NULL,
  solicitado_por_id   UUID NOT NULL,
  solicitado_por_nome TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pendente'
                        CHECK (status IN ('pendente','aprovado','rejeitado')),
  decidido_por_id     UUID,
  decidido_por_nome   TEXT,
  motivo_decisao      TEXT,
  decidido_em         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sol_alt_status ON alissonerp.solicitacoes_alteracao (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sol_alt_venda  ON alissonerp.solicitacoes_alteracao (venda_id);

-- UPDATE só via service_role/server (server faz tudo via decisão); evita bypass via PostgREST
GRANT SELECT, INSERT ON alissonerp.solicitacoes_alteracao TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.solicitacoes_alteracao_id_seq TO authenticated;

-- ============================================================
-- Fim migration 262
-- ============================================================
