-- ============================================================
-- Migration 170 — Tabela de solicitações de autorização de desconto
--
-- Quando gerente_loja tenta aplicar desconto > 30% (até 50%),
-- uma solicitação é criada aqui. A direção (admin/desenvolvedor)
-- aprova ou rejeita. Ao aprovar, o desconto é aplicado no item.
-- ============================================================

SET search_path TO alissonerp, directus, public;

CREATE TABLE alissonerp.solicitacoes_desconto (
  id                        SERIAL PRIMARY KEY,
  venda_id                  INTEGER REFERENCES alissonerp.vendas_erp(id) ON DELETE SET NULL,
  item_id                   INTEGER REFERENCES alissonerp.itens_venda_erp(id) ON DELETE SET NULL,
  produto_nome              TEXT NOT NULL,
  preco_lista               NUMERIC(12,2) NOT NULL,
  pct_desconto_solicitado   NUMERIC(5,2)  NOT NULL,
  preco_solicitado          NUMERIC(12,2) NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pendente'
                              CHECK (status IN ('pendente','aprovado','rejeitado')),
  solicitado_por_id         UUID REFERENCES auth.users(id),
  solicitado_por_nome       TEXT,
  autorizado_por_id         UUID REFERENCES auth.users(id),
  autorizado_por_nome       TEXT,
  observacao                TEXT,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON alissonerp.solicitacoes_desconto(status) WHERE status = 'pendente';
CREATE INDEX ON alissonerp.solicitacoes_desconto(venda_id);
CREATE INDEX ON alissonerp.solicitacoes_desconto(item_id);

GRANT SELECT, INSERT, UPDATE ON alissonerp.solicitacoes_desconto TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.solicitacoes_desconto_id_seq TO authenticated;

-- ============================================================
-- Fim migration 170
-- ============================================================
