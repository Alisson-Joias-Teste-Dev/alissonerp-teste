BEGIN;

CREATE TABLE IF NOT EXISTS alissonerp.vendas_entrega_excecoes_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- REGRA DE NEGOCIO: registra a excecao que permite entregar uma venda
  -- com pagamento incompleto. A venda continua sendo a origem operacional;
  -- esta tabela preserva quem pediu/aprovou e o snapshot financeiro do momento.
  -- IMPACTO SE REMOVIDO: perde-se auditoria da Automacao de Estoque 2.0.
  venda_id INTEGER NOT NULL
    REFERENCES alissonerp.vendas_erp(id)
    ON DELETE RESTRICT,

  -- REGRA DE NEGOCIO: tarefas controlam o fluxo de aprovacao; este registro
  -- guarda o evento financeiro/estoque que justificou a entrega excepcional.
  -- IMPACTO SE REMOVIDO: aprovacao fica sem vinculo rastreavel com a excecao.
  tarefa_id INTEGER
    REFERENCES alissonerp.tarefas(id)
    ON DELETE SET NULL,

  solicitante_id UUID REFERENCES auth.users(id),
  aprovador_id UUID REFERENCES auth.users(id),

  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),

  -- REGRA DE NEGOCIO: valores sao fotografia do momento da solicitacao.
  -- A fonte financeira oficial continua sendo pagamentos_venda e contas_receber.
  -- IMPACTO SE ALTERADO: relatorios/auditoria podem confundir snapshot com saldo atual.
  total_venda NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_confirmado_no_momento NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_a_receber_existente_no_momento NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_aberto_no_momento NUMERIC(15,2) NOT NULL DEFAULT 0,

  motivo_solicitacao TEXT NOT NULL,
  motivo_decisao TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondido_em TIMESTAMPTZ,

  CONSTRAINT vendas_entrega_excecoes_pagamento_valores_check
    CHECK (
      total_venda >= 0
      AND valor_confirmado_no_momento >= 0
      AND valor_a_receber_existente_no_momento >= 0
      AND valor_aberto_no_momento >= 0
    ),

  CONSTRAINT vendas_entrega_excecoes_pagamento_decisao_check
    CHECK (
      (status = 'pendente' AND respondido_em IS NULL)
      OR
      (status IN ('aprovado', 'rejeitado') AND respondido_em IS NOT NULL)
    )
);

COMMENT ON TABLE alissonerp.vendas_entrega_excecoes_pagamento IS
'Evento de negocio para rastrear entrega de venda com pagamento incompleto. Nao substitui contas_receber nem pagamentos_venda.';

COMMENT ON COLUMN alissonerp.vendas_entrega_excecoes_pagamento.total_venda IS
'Snapshot do total da venda no momento da solicitacao. Nao e fonte financeira oficial.';

COMMENT ON COLUMN alissonerp.vendas_entrega_excecoes_pagamento.valor_confirmado_no_momento IS
'Snapshot do valor ja confirmado no momento da solicitacao. A fonte oficial continua em pagamentos_venda.';

COMMENT ON COLUMN alissonerp.vendas_entrega_excecoes_pagamento.valor_a_receber_existente_no_momento IS
'Snapshot do valor ja lancado em A Receber no momento da solicitacao. A fonte oficial continua em pagamentos_venda/contas_receber.';

COMMENT ON COLUMN alissonerp.vendas_entrega_excecoes_pagamento.valor_aberto_no_momento IS
'Snapshot do valor ainda aberto no momento da solicitacao. Usado apenas para auditoria da excecao.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_entrega_excecoes_pagamento_pendente_por_venda
  ON alissonerp.vendas_entrega_excecoes_pagamento (venda_id)
  WHERE status = 'pendente';

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_entrega_excecoes_pagamento_aprovada_por_venda
  ON alissonerp.vendas_entrega_excecoes_pagamento (venda_id)
  WHERE status = 'aprovado';

CREATE INDEX IF NOT EXISTS idx_vendas_entrega_excecoes_pagamento_venda
  ON alissonerp.vendas_entrega_excecoes_pagamento (venda_id);

CREATE INDEX IF NOT EXISTS idx_vendas_entrega_excecoes_pagamento_tarefa
  ON alissonerp.vendas_entrega_excecoes_pagamento (tarefa_id)
  WHERE tarefa_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_entrega_excecoes_pagamento_status
  ON alissonerp.vendas_entrega_excecoes_pagamento (status);

COMMIT;
