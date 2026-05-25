-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 269: Módulo de Compra e Recebimento de Metal
--
-- Criado como parte do Plano de Implementação aprovado (docs/plano-modulo-metal.md)
-- Este módulo gerencia dois fluxos de entrada de metal:
--   1. COMPRA DE METAL: a EMPRESA compra metal de fornecedores/pessoas.
--      O pagamento é feito via Mercado Pago. O ID do pagamento fica amarrado
--      à compra. Metal entra no cofre_ouro após confirmação do pagamento.
--   2. RECEBIMENTO DE METAL: o CLIENTE entrega metal como parte do pagamento
--      de uma joia. O crédito é vinculado a uma venda específica. Se o valor
--      do crédito > valor da venda, o excedente vira saldo do cliente na
--      tabela creditos_cliente. Metal entra IMEDIATAMENTE no cofre_ouro.
--
-- REGRA DE NEGÓCIO (Não alterar):
--   - Compra: status pendente_pagamento → confirmado (após MP aprovar) ou cancelado
--   - Recebimento: status ativo → cancelado (nunca tem pendência de pagamento)
--   - Compra usa fornecedor, recebimento usa cliente
--   - Ambos alimentam cofre_ouro_rastreios via triggers
--   - Fotos da balança salvas no bucket pagamento-fotos
--
-- IMPACTO SE REMOVIDO:
--   - Perde rastreabilidade de entrada de metal no cofre
--   - Impossível registrar compras de metal com pagamento MP
--   - Impossível receber metal como parte de pagamento de venda
--   - Crédito excedente de cliente não é registrado
-- ═══════════════════════════════════════════════════════════════════════════════

SET search_path TO alissonerp;

-- ════════════════════════════════════════════════════
-- 1. SEQUENCES
-- ════════════════════════════════════════════════════

-- Sequence para número de compra: CM-AAAA-NNNN
CREATE SEQUENCE IF NOT EXISTS alissonerp.compras_metal_seq START WITH 1;

-- Sequence para número de recebimento: RM-AAAA-NNNN
CREATE SEQUENCE IF NOT EXISTS alissonerp.recebimentos_metal_seq START WITH 1;

COMMENT ON SEQUENCE alissonerp.compras_metal_seq IS
  'Usada para gerar números sequenciais de compra de metal. Formato CM-AAAA-NNNN';

COMMENT ON SEQUENCE alissonerp.recebimentos_metal_seq IS
  'Usada para gerar números sequenciais de recebimento de metal. Formato RM-AAAA-NNNN';

-- ════════════════════════════════════════════════════
-- 2. TABELA: compras_metal
-- ════════════════════════════════════════════════════

-- REGRA DE NEGÓCIO: Compra de metal é quando a EMPRESA compra metal de
-- um fornecedor/pessoa. O pagamento é feito via Mercado Pago. O metal
-- só entra no cofre após confirmação do pagamento (status confirmado).
-- O ID do pagamento MP fica amarrado (mp_payment_id) para rastreabilidade.
--
-- fornecedor_id = FK para a pessoa/fornecedor que VENDEU o metal para a empresa
-- spread_grama = maxLimit - valor_pago_grama (economia por grama)
-- economia_total = spread × peso (economia total)
-- comissao_valor = economia_total × comissao_pct / 100 (comissão do funcionário)
CREATE TABLE IF NOT EXISTS alissonerp.compras_metal (
  id                 SERIAL PRIMARY KEY,
  numero             VARCHAR(20) UNIQUE NOT NULL,

  -- Dados da transação
  fornecedor_id      BIGINT REFERENCES public.contatos(id_contato),
  peso_gramas        NUMERIC(10,3) NOT NULL CHECK (peso_gramas > 0),
  cotacao_ouro       NUMERIC(12,2) NOT NULL,

  -- Limites e valores
  valor_pago_grama   NUMERIC(12,2) NOT NULL CHECK (valor_pago_grama > 0),
  min_limit          NUMERIC(12,2) NOT NULL,
  max_limit          NUMERIC(12,2) NOT NULL,
  spread_grama       NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_total        NUMERIC(12,2) NOT NULL,
  economia_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  comissao_pct       NUMERIC(5,2) NOT NULL DEFAULT 50,
  comissao_valor     NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Foto da balança + validação IA
  foto_path          TEXT,
  foto_peso_ia       NUMERIC(10,3),
  ia_confianca       VARCHAR(20),
  ia_match           BOOLEAN,

  -- Ciclo de vida
  -- REGRA DE NEGÓCIO:
  --   pendente_pagamento → confirmado (após MP aprovar pagamento)
  --   pendente_pagamento → cancelado (se não houver pagamento)
  --   confirmado → cancelado (NUNCA, metal já entrou no cofre)
  status             VARCHAR(20) NOT NULL DEFAULT 'pendente_pagamento'
                     CHECK (status IN ('pendente_pagamento', 'confirmado', 'cancelado')),

  -- Mercado Pago — IDs amarrados para rastreabilidade
  -- REGRA DE NEGÓCIO: O ID do pagamento no Mercado Pago fica amarrado
  -- à compra. A verificação compara mp_valor_pago com valor_total.
  -- Se diferente, o sistema mantém pendente e registra mp_diferenca_valor.
  mp_preference_id   VARCHAR(100),
  mp_payment_id      VARCHAR(100),
  mp_payment_status  VARCHAR(50),
  mp_valor_pago      NUMERIC(12,2),
  mp_data_pagamento  TIMESTAMPTZ,
  mp_diferenca_valor NUMERIC(12,2),

  -- Flag de controle — evita duplicação no cofre_ouro
  cofre_registrado   BOOLEAN NOT NULL DEFAULT false,

  -- Auditoria
  observacao         TEXT,
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE alissonerp.compras_metal IS
  'Registra compras de metal (sucata/ouro) que a EMPRESA adquire de fornecedores.
   Pagamento via Mercado Pago. Metal entra no cofre_ouro após confirmação.';

COMMENT ON COLUMN alissonerp.compras_metal.numero IS
  'Formato: CM-AAAA-NNNN (Compra Metal + ano + sequencial)';
COMMENT ON COLUMN alissonerp.compras_metal.fornecedor_id IS
  'A pessoa/fornecedor que vendeu o metal para a empresa. FK para public.contatos';
COMMENT ON COLUMN alissonerp.compras_metal.spread_grama IS
  'Economia por grama: maxLimit - valor_pago_grama. Se 0, comissão = 0';
COMMENT ON COLUMN alissonerp.compras_metal.economia_total IS
  'Economia total: spread_grama × peso_gramas';
COMMENT ON COLUMN alissonerp.compras_metal.comissao_valor IS
  'Comissão do funcionário: economia_total × comissao_pct / 100';
COMMENT ON COLUMN alissonerp.compras_metal.mp_preference_id IS
  'ID da preference criada no MP para o link de pagamento';
COMMENT ON COLUMN alissonerp.compras_metal.mp_payment_id IS
  'ID do pagamento no MP. Usado para fetchPayment() na verificação';
COMMENT ON COLUMN alissonerp.compras_metal.mp_diferenca_valor IS
  'Se > 0, o valor pago no MP diferiu do valor_total esperado. Mantém pendente';
COMMENT ON COLUMN alissonerp.compras_metal.cofre_registrado IS
  'Flag que impede duplicação no cofre_ouro_rastreios em caso de re-processamento';

-- ════════════════════════════════════════════════════
-- 3. TABELA: recebimentos_metal
-- ════════════════════════════════════════════════════

-- REGRA DE NEGÓCIO: Recebimento de metal é quando o CLIENTE entrega metal
-- como parte do pagamento de uma joia. O crédito é vinculado a uma venda
-- específica (venda_id). Se o valor do crédito > valor da venda, o excedente
-- vira saldo do cliente na tabela creditos_cliente para uso futuro.
-- Metal entra IMEDIATAMENTE no cofre_ouro (sem pendência de pagamento).
CREATE TABLE IF NOT EXISTS alissonerp.recebimentos_metal (
  id                 SERIAL PRIMARY KEY,
  numero             VARCHAR(20) UNIQUE NOT NULL,

  -- Dados da transação
  cliente_id         BIGINT REFERENCES public.contatos(id_contato),
  peso_gramas        NUMERIC(10,3) NOT NULL CHECK (peso_gramas > 0),
  cotacao_ouro       NUMERIC(12,2) NOT NULL,

  -- Limites e valores
  valor_credito_grama NUMERIC(12,2) NOT NULL CHECK (valor_credito_grama > 0),
  min_limit          NUMERIC(12,2) NOT NULL,
  max_limit          NUMERIC(12,2) NOT NULL,
  excedeu_teto       BOOLEAN NOT NULL DEFAULT false,
  valor_total        NUMERIC(12,2) NOT NULL,

  -- Vínculo com venda
  -- REGRA DE NEGÓCIO: O recebimento SEMPRE é vinculado a uma venda.
  -- O crédito abate o valor da venda. Se sobrar, vira saldo do cliente.
  venda_id           INTEGER REFERENCES alissonerp.vendas_erp(id),
  credito_excedente  NUMERIC(12,2),
  -- FK para creditos_cliente adicionada via ALTER TABLE (após criação da tabela)
  credito_excedente_id INTEGER,

  -- Foto da balança + validação IA
  foto_path          TEXT,
  foto_peso_ia       NUMERIC(10,3),
  ia_confianca       VARCHAR(20),
  ia_match           BOOLEAN,

  -- Ciclo de vida
  status             VARCHAR(20) NOT NULL DEFAULT 'ativo'
                     CHECK (status IN ('ativo', 'cancelado')),

  -- Flag de controle — evita duplicação no cofre_ouro
  cofre_registrado   BOOLEAN NOT NULL DEFAULT false,

  -- Auditoria
  observacao         TEXT,
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE alissonerp.recebimentos_metal IS
  'Registra recebimento de metal como parte de pagamento de venda.
   Gera crédito vinculado à venda. Excedente vira saldo do cliente.';

COMMENT ON COLUMN alissonerp.recebimentos_metal.numero IS
  'Formato: RM-AAAA-NNNN (Recebimento Metal + ano + sequencial)';
COMMENT ON COLUMN alissonerp.recebimentos_metal.cliente_id IS
  'O cliente que entregou o metal. FK para public.contatos';
COMMENT ON COLUMN alissonerp.recebimentos_metal.excedeu_teto IS
  'True se valor_credito_grama > maxLimit (alerta, não bloquear)';
COMMENT ON COLUMN alissonerp.recebimentos_metal.venda_id IS
  'Venda à qual este recebimento está vinculado. O crédito abate esta venda';
COMMENT ON COLUMN alissonerp.recebimentos_metal.credito_excedente IS
  'Se valor_total > valor da venda, este é o excedente que virou saldo do cliente';
COMMENT ON COLUMN alissonerp.recebimentos_metal.credito_excedente_id IS
  'FK para o registro em creditos_cliente gerado a partir do excedente';

-- ════════════════════════════════════════════════════
-- 4. TABELA: creditos_cliente
-- ════════════════════════════════════════════════════

-- REGRA DE NEGÓCIO: Saldo de crédito acumulativo por cliente.
-- Criado quando o valor do metal recebido > valor da venda.
-- O cliente pode usar este saldo em compras futuras.
-- Cada registro é vinculado ao recebimento que o originou.
CREATE TABLE IF NOT EXISTS alissonerp.creditos_cliente (
  id                 SERIAL PRIMARY KEY,
  cliente_id         BIGINT REFERENCES public.contatos(id_contato),
  saldo_disponivel   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo_disponivel >= 0),
  recebimento_id     INTEGER REFERENCES alissonerp.recebimentos_metal(id),
  venda_origem_id    INTEGER REFERENCES alissonerp.vendas_erp(id),
  status             VARCHAR(20) NOT NULL DEFAULT 'ativo'
                     CHECK (status IN ('ativo', 'usado', 'cancelado')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE alissonerp.creditos_cliente IS
  'Saldo de crédito dos clientes gerado a partir do excedente de recebimentos de metal.';
COMMENT ON COLUMN alissonerp.creditos_cliente.saldo_disponivel IS
  'Valor disponível para uso em compras futuras. Sempre >= 0';
COMMENT ON COLUMN alissonerp.creditos_cliente.recebimento_id IS
  'Recebimento que originou este crédito';
COMMENT ON COLUMN alissonerp.creditos_cliente.venda_origem_id IS
  'Venda original onde o crédito foi gerado (excedente)';
COMMENT ON COLUMN alissonerp.creditos_cliente.status IS
  'ativo = disponível para uso, usado = já aplicado em venda, cancelado = recebimento cancelado';

-- ═════════════════════════════════════════════════════════════════════════
-- 4b. FK circular adicionada APÓS ambas as tabelas existirem
-- ═════════════════════════════════════════════════════════════════════════
-- REGRA DE NEGÓCIO: A FK entre recebimentos_metal e creditos_cliente
-- é adicionada separadamente porque o PostgreSQL exige que a tabela
-- referenciada exista no momento da criação da FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_recebimentos_credito_excedente'
      AND table_schema = 'alissonerp'
      AND table_name = 'recebimentos_metal'
  ) THEN
    ALTER TABLE alissonerp.recebimentos_metal
      ADD CONSTRAINT fk_recebimentos_credito_excedente
      FOREIGN KEY (credito_excedente_id)
      REFERENCES alissonerp.creditos_cliente(id);
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════
-- 5. ÍNDICES
-- ════════════════════════════════════════════════════

-- Índices para compras_metal
CREATE INDEX IF NOT EXISTS idx_compras_metal_numero
  ON alissonerp.compras_metal(numero);

CREATE INDEX IF NOT EXISTS idx_compras_metal_fornecedor
  ON alissonerp.compras_metal(fornecedor_id, created_at DESC)
  WHERE fornecedor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compras_metal_status
  ON alissonerp.compras_metal(status);

CREATE INDEX IF NOT EXISTS idx_compras_metal_created
  ON alissonerp.compras_metal(created_at DESC);

-- Índices parciais para buscas de MP — só indexa quando não nulo
CREATE INDEX IF NOT EXISTS idx_compras_metal_mp_preference
  ON alissonerp.compras_metal(mp_preference_id)
  WHERE mp_preference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compras_metal_mp_payment
  ON alissonerp.compras_metal(mp_payment_id)
  WHERE mp_payment_id IS NOT NULL;

-- Índices para recebimentos_metal
CREATE INDEX IF NOT EXISTS idx_recebimentos_metal_numero
  ON alissonerp.recebimentos_metal(numero);

CREATE INDEX IF NOT EXISTS idx_recebimentos_metal_cliente
  ON alissonerp.recebimentos_metal(cliente_id, created_at DESC)
  WHERE cliente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recebimentos_metal_venda
  ON alissonerp.recebimentos_metal(venda_id, created_at DESC)
  WHERE venda_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_recebimentos_metal_created
  ON alissonerp.recebimentos_metal(created_at DESC);

-- Índices para creditos_cliente
CREATE INDEX IF NOT EXISTS idx_creditos_cliente_cliente
  ON alissonerp.creditos_cliente(cliente_id, status)
  WHERE status = 'ativo';

-- ════════════════════════════════════════════════════
-- 6. TRIGGERS
-- ════════════════════════════════════════════════════

-- 6.1 Atualização automática de updated_at para compras_metal
CREATE OR REPLACE FUNCTION alissonerp.fn_compras_metal_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compras_metal_updated_at ON alissonerp.compras_metal;
CREATE TRIGGER trg_compras_metal_updated_at
  BEFORE UPDATE ON alissonerp.compras_metal
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_compras_metal_updated_at();

-- 6.2 Atualização automática de updated_at para recebimentos_metal
CREATE OR REPLACE FUNCTION alissonerp.fn_recebimentos_metal_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recebimentos_metal_updated_at ON alissonerp.recebimentos_metal;
CREATE TRIGGER trg_recebimentos_metal_updated_at
  BEFORE UPDATE ON alissonerp.recebimentos_metal
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_recebimentos_metal_updated_at();

-- 6.3 Atualização automática de updated_at para creditos_cliente
CREATE OR REPLACE FUNCTION alissonerp.fn_creditos_cliente_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_creditos_cliente_updated_at ON alissonerp.creditos_cliente;
CREATE TRIGGER trg_creditos_cliente_updated_at
  BEFORE UPDATE ON alissonerp.creditos_cliente
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_creditos_cliente_updated_at();

-- ════════════════════════════════════════════════════
-- 7. TRIGGERS: COFRE OURO RASTREIO
-- ════════════════════════════════════════════════════

-- REGRA DE NEGÓCIO: Quando uma compra é confirmada (pagamento MP aprovado),
-- o metal entra no cofre_ouro automaticamente via este trigger.
-- A flag cofre_registrado impede duplicação.
-- IMPACTO SE REMOVIDO: Metal de compra não é rastreado no cofre_ouro.
CREATE OR REPLACE FUNCTION alissonerp.fn_rastreio_compra_metal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Só registra no cofre quando status muda para 'confirmado'
  -- (evita duplicação em re-processamento)
  IF NEW.status = 'confirmado' AND (OLD.status IS NULL OR OLD.status != 'confirmado') THEN
    INSERT INTO alissonerp.cofre_ouro_rastreios
      (evento, gramas, origem_nome, observacao)
    VALUES
      ('entrada_compra_metal', NEW.peso_gramas, 'Compra Metal',
       'Compra #' || NEW.numero ||
       ' — Fornecedor ID ' || COALESCE(NEW.fornecedor_id::text, 'N/A') ||
       ' — MP Payment: ' || COALESCE(NEW.mp_payment_id, 'N/A'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rastreio_compra_metal ON alissonerp.compras_metal;
CREATE TRIGGER trg_rastreio_compra_metal
  AFTER UPDATE ON alissonerp.compras_metal
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_rastreio_compra_metal();

-- REGRA DE NEGÓCIO: Quando um recebimento é criado, o metal entra
-- IMEDIATAMENTE no cofre_ouro (não tem pendência de pagamento).
-- IMPACTO SE REMOVIDO: Metal de recebimento não é rastreado no cofre_ouro.
CREATE OR REPLACE FUNCTION alissonerp.fn_rastreio_recebimento_metal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO alissonerp.cofre_ouro_rastreios
    (evento, gramas, origem_nome, observacao)
  VALUES
    ('entrada_recebimento_metal', NEW.peso_gramas, 'Recebimento Metal',
     'Recebimento #' || NEW.numero ||
     ' — Venda #' || COALESCE(NEW.venda_id::text, 'N/A') ||
     CASE WHEN NEW.credito_excedente > 0
          THEN ' — Excedente: R$ ' || NEW.credito_excedente::text || ' → saldo cliente'
          ELSE ''
     END);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rastreio_recebimento_metal ON alissonerp.recebimentos_metal;
CREATE TRIGGER trg_rastreio_recebimento_metal
  AFTER INSERT ON alissonerp.recebimentos_metal
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_rastreio_recebimento_metal();

-- ════════════════════════════════════════════════════
-- 8. SEED: CONFIGURAÇÕES DO MÓDULO
-- ════════════════════════════════════════════════════

-- REGRA DE NEGÓCIO: As configurações do módulo metal são armazenadas em
-- alissonerp.configuracoes_sistema, mesma tabela usada por outros módulos.
-- Valores padrão refletem as faixas de negociação da Alisson Joias.
INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES
  ('compra_metal_min_pct', '80',  'Percentual MÍNIMO da cotação XAU pago na compra de metal pela empresa'),
  ('compra_metal_max_pct', '85',  'Percentual MÁXIMO (teto) da cotação XAU pago na compra de metal pela empresa'),
  ('compra_metal_comm_pct', '50', 'Percentual de comissão do funcionário sobre a economia (spread) gerada na compra'),
  ('receb_metal_min_pct', '95',   'Percentual MÍNIMO da cotação XAU creditado ao cliente no recebimento de metal'),
  ('receb_metal_max_pct', '100',  'Percentual MÁXIMO (teto) da cotação XAU creditado ao cliente no recebimento de metal')
ON CONFLICT (chave) DO NOTHING;

-- ════════════════════════════════════════════════════
-- 9. SEED: PERMISSÕES
-- ════════════════════════════════════════════════════

-- REGRA DE NEGÓCIO: O módulo Metal é acessível para cargos de fábrica e
-- gerência de loja. Vendedores de loja NÃO têm acesso (função operacional).
INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever)
VALUES
  ('desenvolvedor',     'metal', true, true),
  ('admin',             'metal', true, true),
  ('gerente_fabrica',   'metal', true, true),
  ('gerente_loja',      'metal', true, true),
  ('estoquista_fabrica', 'metal', true, true)
ON CONFLICT (role, modulo) DO UPDATE SET
  pode_ler = EXCLUDED.pode_ler,
  pode_escrever = EXCLUDED.pode_escrever;

-- ════════════════════════════════════════════════════
-- 10. GRANTS
-- ════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE ON alissonerp.compras_metal     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.recebimentos_metal TO authenticated;
GRANT SELECT, INSERT, UPDATE ON alissonerp.creditos_cliente   TO authenticated;

GRANT USAGE, SELECT ON SEQUENCE alissonerp.compras_metal_id_seq     TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.recebimentos_metal_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.creditos_cliente_id_seq   TO authenticated;
GRANT USAGE        ON SEQUENCE alissonerp.compras_metal_seq          TO authenticated;
GRANT USAGE        ON SEQUENCE alissonerp.recebimentos_metal_seq     TO authenticated;

-- ════════════════════════════════════════════════════
-- 11. ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════

ALTER TABLE alissonerp.compras_metal     ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.recebimentos_metal ENABLE ROW LEVEL SECURITY;
ALTER TABLE alissonerp.creditos_cliente   ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para authenticated (autorização é feita nas API Routes)
CREATE POLICY compras_metal_select ON alissonerp.compras_metal
  FOR SELECT TO authenticated USING (true);
CREATE POLICY compras_metal_insert ON alissonerp.compras_metal
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY compras_metal_update ON alissonerp.compras_metal
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY recebimentos_metal_select ON alissonerp.recebimentos_metal
  FOR SELECT TO authenticated USING (true);
CREATE POLICY recebimentos_metal_insert ON alissonerp.recebimentos_metal
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY recebimentos_metal_update ON alissonerp.recebimentos_metal
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY creditos_cliente_select ON alissonerp.creditos_cliente
  FOR SELECT TO authenticated USING (true);
CREATE POLICY creditos_cliente_insert ON alissonerp.creditos_cliente
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY creditos_cliente_update ON alissonerp.creditos_cliente
  FOR UPDATE TO authenticated USING (true);
