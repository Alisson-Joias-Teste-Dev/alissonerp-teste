-- =============================================
-- MIGRATION 104: MÓDULO COMERCIAL — BASE
-- Schema: alissonerp
-- Fase 1: fabricaAJ vira master de vendas (substitui Admin Site Evolury)
-- public.vendas é READONLY (PDV externo); novas vendas vão para vendas_erp
-- =============================================

-- =============================================
-- 1. FAIXAS DE COMISSÃO
-- Tabela de faixas desconto × comissão, editável pelo gerente
-- =============================================
CREATE TABLE IF NOT EXISTS alissonerp.faixas_comissao (
  id           SERIAL PRIMARY KEY,
  desconto_pct NUMERIC(5,2) NOT NULL UNIQUE,  -- 0.00 a 30.00
  comissao_pct NUMERIC(5,2) NOT NULL,
  ativo        BOOLEAN NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by   UUID REFERENCES auth.users(id)
);

-- Seed: 31 faixas (0% → 4.00 até 30% → 0.50)
INSERT INTO alissonerp.faixas_comissao (desconto_pct, comissao_pct) VALUES
  ( 0.00, 4.00),
  ( 1.00, 3.88),
  ( 2.00, 3.77),
  ( 3.00, 3.65),
  ( 4.00, 3.53),
  ( 5.00, 3.42),
  ( 6.00, 3.30),
  ( 7.00, 3.18),
  ( 8.00, 3.07),
  ( 9.00, 2.95),
  (10.00, 2.83),
  (11.00, 2.72),
  (12.00, 2.60),
  (13.00, 2.48),
  (14.00, 2.37),
  (15.00, 2.25),
  (16.00, 2.13),
  (17.00, 2.02),
  (18.00, 1.90),
  (19.00, 1.78),
  (20.00, 1.67),
  (21.00, 1.55),
  (22.00, 1.43),
  (23.00, 1.32),
  (24.00, 1.20),
  (25.00, 1.08),
  (26.00, 0.97),
  (27.00, 0.85),
  (28.00, 0.73),
  (29.00, 0.62),
  (30.00, 0.50)
ON CONFLICT (desconto_pct) DO NOTHING;

-- =============================================
-- 2. VENDAS ERP
-- Master de vendas próprio (public.vendas = READONLY PDV externo)
-- Sem FK formal para public.contatos / public.vendedores (cross-schema)
-- =============================================
CREATE TABLE IF NOT EXISTS alissonerp.vendas_erp (
  id                   SERIAL PRIMARY KEY,
  numero_venda         TEXT UNIQUE NOT NULL,         -- formato: "V-00001"
  cliente_id           BIGINT,                       -- ref public.contatos.id_contato
  vendedor_id          BIGINT,                       -- ref public.vendedores.id_vendedor
  data_venda           DATE NOT NULL DEFAULT CURRENT_DATE,
  data_entrega         DATE,
  total_produtos       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_desconto       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_frete          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_venda          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_comissao       NUMERIC(12,2) NOT NULL DEFAULT 0,
  situacao             VARCHAR(20)   NOT NULL DEFAULT 'rascunho',
  forma_envio          VARCHAR(50),
  forma_frete          VARCHAR(50),
  observacoes          TEXT,
  observacoes_internas TEXT,
  tiny_pedido_id       BIGINT,
  tiny_sync_status     VARCHAR(20)   DEFAULT 'pendente',
  tiny_sync_at         TIMESTAMPTZ,
  tiny_sync_erro       TEXT,
  bloqueado            BOOLEAN       NOT NULL DEFAULT false,
  created_by           UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- =============================================
-- 3. ITENS DA VENDA ERP
-- =============================================
CREATE TABLE IF NOT EXISTS alissonerp.itens_venda_erp (
  id                      SERIAL PRIMARY KEY,
  venda_id                INTEGER       NOT NULL REFERENCES alissonerp.vendas_erp(id) ON DELETE CASCADE,
  produto_id              BIGINT        NOT NULL,
  nome_produto            TEXT          NOT NULL,
  sku                     TEXT,
  quantidade              INTEGER       NOT NULL DEFAULT 1,
  preco_lista             NUMERIC(12,2) NOT NULL,
  pct_desconto            NUMERIC(5,2)  NOT NULL DEFAULT 0,
  preco_unitario          NUMERIC(12,2) NOT NULL,
  total_item              NUMERIC(12,2) NOT NULL,
  pct_comissao            NUMERIC(5,2)  NOT NULL DEFAULT 0,
  valor_comissao          NUMERIC(12,2) NOT NULL DEFAULT 0,
  desconto_autorizado_por UUID REFERENCES auth.users(id),
  observacao              TEXT,
  peso_estimado           NUMERIC(10,3),
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- =============================================
-- 4. PAGAMENTOS DA VENDA
-- =============================================
CREATE TABLE IF NOT EXISTS alissonerp.pagamentos_venda (
  id               SERIAL PRIMARY KEY,
  venda_id         INTEGER       NOT NULL REFERENCES alissonerp.vendas_erp(id) ON DELETE CASCADE,
  forma            VARCHAR(30)   NOT NULL,
  gateway          VARCHAR(30),
  valor            NUMERIC(12,2) NOT NULL,
  parcelas         INTEGER       NOT NULL DEFAULT 1,
  status           VARCHAR(20)   NOT NULL DEFAULT 'pendente',
  gateway_id       TEXT,
  gateway_payload  JSONB,
  data_confirmacao TIMESTAMPTZ,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- =============================================
-- 5. METAS DAS VENDEDORAS
-- =============================================
CREATE TABLE IF NOT EXISTS alissonerp.metas_vendedoras (
  id               SERIAL PRIMARY KEY,
  vendedor_id      BIGINT        NOT NULL,
  mes              INTEGER       NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ano              INTEGER       NOT NULL,
  meta_valor       NUMERIC(12,2) NOT NULL,
  meta_quantidade  INTEGER,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, mes, ano)
);

-- =============================================
-- TRIGGERS
-- =============================================

-- Trigger 1: Recalcular totais da venda quando itens mudam
CREATE OR REPLACE FUNCTION alissonerp.fn_recalcular_totais_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_venda_id INTEGER;
  v_total_produtos NUMERIC(12,2);
  v_total_desconto NUMERIC(12,2);
  v_total_frete    NUMERIC(12,2);
  v_total_comissao NUMERIC(12,2);
BEGIN
  -- Determinar o venda_id correto (DELETE usa OLD, INSERT/UPDATE usa NEW)
  IF TG_OP = 'DELETE' THEN
    v_venda_id := OLD.venda_id;
  ELSE
    v_venda_id := NEW.venda_id;
  END IF;

  -- Calcular os totais agregados a partir dos itens
  SELECT
    COALESCE(SUM(total_item),                                    0),
    COALESCE(SUM((preco_lista - preco_unitario) * quantidade),   0),
    COALESCE(SUM(valor_comissao),                                0)
  INTO
    v_total_produtos,
    v_total_desconto,
    v_total_comissao
  FROM alissonerp.itens_venda_erp
  WHERE venda_id = v_venda_id;

  -- Buscar o frete atual (não é recalculado a partir dos itens)
  SELECT total_frete
  INTO   v_total_frete
  FROM   alissonerp.vendas_erp
  WHERE  id = v_venda_id;

  -- Atualizar a venda
  UPDATE alissonerp.vendas_erp
  SET
    total_produtos = v_total_produtos,
    total_desconto = v_total_desconto,
    total_venda    = v_total_produtos + COALESCE(v_total_frete, 0),
    total_comissao = v_total_comissao,
    updated_at     = now()
  WHERE id = v_venda_id;

  -- Retornar o registro correto para cada operação
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Aplica o trigger em itens_venda_erp
DROP TRIGGER IF EXISTS trg_recalcular_totais_venda ON alissonerp.itens_venda_erp;
CREATE TRIGGER trg_recalcular_totais_venda
  AFTER INSERT OR UPDATE OR DELETE
  ON alissonerp.itens_venda_erp
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_recalcular_totais_venda();

-- Trigger 2: Bloquear edição de venda bloqueada
CREATE OR REPLACE FUNCTION alissonerp.fn_bloquear_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.bloqueado = true THEN
    RAISE EXCEPTION 'Venda bloqueada não pode ser editada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_venda ON alissonerp.vendas_erp;
CREATE TRIGGER trg_bloquear_venda
  BEFORE UPDATE
  ON alissonerp.vendas_erp
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_bloquear_venda();

-- Trigger 3: Manter updated_at atualizado em vendas_erp
CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_vendas_erp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_vendas_erp ON alissonerp.vendas_erp;
CREATE TRIGGER trg_updated_at_vendas_erp
  BEFORE UPDATE
  ON alissonerp.vendas_erp
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_updated_at_vendas_erp();

-- =============================================
-- VIEW: vw_vendas_erp_completa
-- JOIN com public.contatos, public.vendedores + contagem de itens +
-- soma de pagamentos confirmados
-- =============================================
CREATE OR REPLACE VIEW alissonerp.vw_vendas_erp_completa AS
SELECT
  v.id,
  v.numero_venda,
  v.cliente_id,
  c.nome          AS cliente_nome,
  c.cpf_cnpj      AS cliente_cpf_cnpj,
  c.email         AS cliente_email,
  c.telefone      AS cliente_telefone,
  v.vendedor_id,
  vend.nome       AS vendedor_nome,
  v.data_venda,
  v.data_entrega,
  v.total_produtos,
  v.total_desconto,
  v.total_frete,
  v.total_venda,
  v.total_comissao,
  v.situacao,
  v.forma_envio,
  v.forma_frete,
  v.observacoes,
  v.observacoes_internas,
  v.tiny_pedido_id,
  v.tiny_sync_status,
  v.tiny_sync_at,
  v.tiny_sync_erro,
  v.bloqueado,
  v.created_by,
  v.created_at,
  v.updated_at,
  COUNT(DISTINCT i.id)                                          AS qtd_itens,
  COALESCE(SUM(p.valor) FILTER (WHERE p.status = 'confirmado'), 0) AS total_pago
FROM alissonerp.vendas_erp v
LEFT JOIN public.contatos      c    ON c.id_contato  = v.cliente_id
LEFT JOIN public.vendedores    vend ON vend.id_vendedor = v.vendedor_id
LEFT JOIN alissonerp.itens_venda_erp   i ON i.venda_id  = v.id
LEFT JOIN alissonerp.pagamentos_venda  p ON p.venda_id  = v.id
GROUP BY
  v.id,
  c.nome, c.cpf_cnpj, c.email, c.telefone,
  vend.nome;

-- =============================================
-- SEED em configuracoes_sistema
-- Colunas confirmadas: id, chave, valor, descricao, updated_at, updated_by
-- =============================================
INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES
  ('desconto_max_consultora',      '15', 'Desconto máximo (%) permitido para consultoras'),
  ('desconto_max_gerente',         '30', 'Desconto máximo (%) permitido para gerentes'),
  ('desconto_comissao_zero_acima', '30', 'Desconto (%) acima do qual a comissão cai a zero')
ON CONFLICT (chave) DO NOTHING;

-- =============================================
-- GRANTS
-- =============================================
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.faixas_comissao    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.vendas_erp          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.itens_venda_erp     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.pagamentos_venda    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON alissonerp.metas_vendedoras    TO authenticated;
GRANT SELECT                          ON alissonerp.vw_vendas_erp_completa TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE alissonerp.vendas_erp_id_seq         TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.itens_venda_erp_id_seq    TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.pagamentos_venda_id_seq   TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.metas_vendedoras_id_seq   TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.faixas_comissao_id_seq    TO authenticated;
