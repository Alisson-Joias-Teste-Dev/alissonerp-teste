
SET search_path TO alissonerp;

-- ═══ CONTAS A PAGAR ═══
CREATE TABLE IF NOT EXISTS alissonerp.contas_pagar (
  id          SERIAL PRIMARY KEY,
  descricao   TEXT NOT NULL,
  fornecedor_id BIGINT REFERENCES public.contatos(id_contato),
  valor       DECIMAL(12,2) NOT NULL,
  data_vencimento DATE,
  data_pagamento  DATE,
  situacao    VARCHAR(20) DEFAULT 'pendente',
  categoria   VARCHAR(50),
  compra_id   INTEGER REFERENCES alissonerp.compras(id),
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_cp_situacao   ON alissonerp.contas_pagar(situacao);
CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON alissonerp.contas_pagar(data_vencimento);

-- ═══ CONTAS A RECEBER ═══
CREATE TABLE IF NOT EXISTS alissonerp.contas_receber (
  id          SERIAL PRIMARY KEY,
  descricao   TEXT NOT NULL,
  cliente_id  BIGINT REFERENCES public.contatos(id_contato),
  venda_id    INTEGER REFERENCES public.vendas(id),
  valor       DECIMAL(12,2) NOT NULL,
  data_vencimento  DATE,
  data_recebimento DATE,
  situacao    VARCHAR(20) DEFAULT 'pendente',
  categoria   VARCHAR(50),
  obs         TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_cr_situacao   ON alissonerp.contas_receber(situacao);
CREATE INDEX IF NOT EXISTS idx_cr_vencimento ON alissonerp.contas_receber(data_vencimento);

-- ═══ EXTRATOS BANCÁRIOS (recebe OFX via n8n) ═══
CREATE TABLE IF NOT EXISTS alissonerp.fin_extratos_bancarios (
  id          SERIAL PRIMARY KEY,
  banco       VARCHAR(50),
  agencia     VARCHAR(20),
  conta       VARCHAR(30),
  data_inicio DATE,
  data_fim    DATE,
  arquivo_nome TEXT,
  arquivo_url  TEXT,
  processado   BOOLEAN DEFAULT false,
  total_lancamentos INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now(),
  created_by   UUID REFERENCES auth.users(id)
);

-- ═══ LANÇAMENTOS BANCÁRIOS (criados pelo n8n a partir do OFX) ═══
CREATE TABLE IF NOT EXISTS alissonerp.fin_lancamentos_bancarios (
  id            SERIAL PRIMARY KEY,
  extrato_id    INTEGER REFERENCES alissonerp.fin_extratos_bancarios(id) ON DELETE CASCADE,
  fitid         VARCHAR(100) UNIQUE,
  tipo          VARCHAR(10),
  valor         DECIMAL(12,2) NOT NULL,
  data_transacao DATE,
  descricao     TEXT,
  memo          TEXT,
  conciliado    BOOLEAN DEFAULT false,
  conciliacao_id INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_flb_fitid   ON alissonerp.fin_lancamentos_bancarios(fitid);
CREATE INDEX IF NOT EXISTS idx_flb_extrato ON alissonerp.fin_lancamentos_bancarios(extrato_id);
CREATE INDEX IF NOT EXISTS idx_flb_data    ON alissonerp.fin_lancamentos_bancarios(data_transacao);

-- ═══ CONCILIAÇÕES ═══
CREATE TABLE IF NOT EXISTS alissonerp.fin_conciliacoes (
  id               SERIAL PRIMARY KEY,
  lancamento_id    INTEGER REFERENCES alissonerp.fin_lancamentos_bancarios(id),
  conta_pagar_id   INTEGER REFERENCES alissonerp.contas_pagar(id),
  conta_receber_id INTEGER REFERENCES alissonerp.contas_receber(id),
  tipo    VARCHAR(20) DEFAULT 'manual',
  status  VARCHAR(20) DEFAULT 'pendente',
  obs     TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- ═══ VIEW: resumo financeiro ═══
CREATE OR REPLACE VIEW alissonerp.vw_resumo_financeiro AS
SELECT
  'pagar'::text AS tipo,
  situacao,
  COUNT(*)::integer AS total,
  COALESCE(SUM(valor), 0) AS valor_total,
  COALESCE(SUM(CASE WHEN data_vencimento < CURRENT_DATE AND situacao = 'pendente' THEN valor ELSE 0 END), 0) AS vencido
FROM alissonerp.contas_pagar
GROUP BY situacao
UNION ALL
SELECT
  'receber'::text AS tipo,
  situacao,
  COUNT(*)::integer AS total,
  COALESCE(SUM(valor), 0) AS valor_total,
  COALESCE(SUM(CASE WHEN data_vencimento < CURRENT_DATE AND situacao = 'pendente' THEN valor ELSE 0 END), 0) AS vencido
FROM alissonerp.contas_receber
GROUP BY situacao;

-- ═══ VIEW: vendas enriquecida (cross-schema, readonly) ═══
CREATE OR REPLACE VIEW alissonerp.vw_vendas_completa AS
SELECT
  v.id,
  v.numero_pedido,
  v.data_venda,
  v.total_venda,
  v.total_produtos,
  v.total_itens_qnt,
  v.status,
  v.entregue,
  v.dados_pagamento,
  v.observacoes,
  c.nome  AS cliente_nome,
  c.cpf_cnpj AS cliente_cpf,
  ve.nome AS vendedor_nome,
  ve.id_vendedor AS vendedor_id
FROM public.vendas v
LEFT JOIN public.contatos  c  ON c.id_contato = v.cliente_id
LEFT JOIN public.vendedores ve ON ve.id_vendedor = v.vendedor_id;
