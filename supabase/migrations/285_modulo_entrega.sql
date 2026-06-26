-- Migration 285: módulo de entrega (entregas de vendas, motoboys, frete grátis, fechamento)
-- REGRA DE NEGÓCIO:
--   - O que faz: cria o módulo completo de controle de entregas de vendas do ERP,
--     com códigos de verificação (A=cliente, B=motoboy), baixa de estoque condicional,
--     gestão de motoboys, saldo de frete grátis por gerente e fechamento mensal.
--   - Por que: a operação precisa rastrear entregas parciais/totais de vendas,
--     impedir baixa de estoque sem confirmação de código, controlar o custo de
--     motoboy vs frete cobrado, e gerenciar o saldo de frete grátis da gerente
--     com acerto mensal (positivo carrega, negativo desconta em folha).
--   - Impacto se removido: perde-se a rastreabilidade completa de entregas,
--     saldo de frete grátis e pagamento de motoboys voltam a ser manuais.
--   - Este módulo NÃO substitui vendas_erp.forma_envio nem vendas_erp.data_entrega:
--     aqueles campos permanecem como visão resumida; entregas_venda é o registro
--     operacional detalhado (uma venda pode ter N entregas parciais).
--   - Tabelas: entregas_venda, entregas_venda_itens, saldo_frete_gratis,
--     fechamentos_frete, motoboys

BEGIN;

SET search_path TO alissonerp;

-- =============================================================================
-- 1. ENUMS DO MÓDULO DE ENTREGA
-- =============================================================================

-- REGRA DE NEGÓCIO: classifica o tipo de entrega. "parcial" = apenas alguns itens
-- da venda, "total" = todos os itens pendentes da venda.
-- IMPACTO SE ALTERADO: o frontend e as regras de validação dependem destes valores.
DO $$ BEGIN
  CREATE TYPE alissonerp.enum_entrega_tipo AS ENUM ('parcial', 'total');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- REGRA DE NEGÓCIO: ciclo de vida da entrega. "pendente" = criada, aguardando
-- código de verificação. "confirmada" = código validado, estoque baixado.
-- "cancelada" = entrega desfeita (só permitido enquanto pendente).
-- IMPACTO SE ALTERADO: views de pendência e lógica de baixa de estoque dependem.
DO $$ BEGIN
  CREATE TYPE alissonerp.enum_entrega_situacao AS ENUM ('pendente', 'confirmada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- REGRA DE NEGÓCIO: como a entrega é executada logisticamente.
-- "retirada" = cliente busca na loja. "motoboy" = entregador leva ao cliente.
-- IMPACTO SE ALTERADO: a lógica de código de verificação e fluxo de confirmação
-- depende desta classificação.
DO $$ BEGIN
  CREATE TYPE alissonerp.enum_entrega_forma AS ENUM ('retirada', 'motoboy');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- REGRA DE NEGÓCIO: região da entrega para cálculo do valor do motoboy.
-- "fortaleza" = R$20. "fora_fortaleza" = R$50. "longe" = valor negociado manual.
-- "correios" = envio postal (sem motoboy).
-- IMPACTO SE ALTERADO: a função calcularValorMotoboy() do frontend/lib usa estes
-- valores; adicionar/remover regiões requer atualizar a lógica de preço.
DO $$ BEGIN
  CREATE TYPE alissonerp.enum_entrega_regiao AS ENUM ('fortaleza', 'fora_fortaleza', 'longe', 'correios');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- REGRA DE NEGÓCIO: controla se a movimentação no saldo de frete grátis é
-- crédito (abastece o saldo) ou débito (consome o saldo).
-- IMPACTO SE ALTERADO: o cálculo de saldo é creditos - debitos.
DO $$ BEGIN
  CREATE TYPE alissonerp.enum_saldo_frete_tipo AS ENUM ('credito', 'debito');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- =============================================================================
-- 2. TABELAS DO MÓDULO DE ENTREGA
-- =============================================================================

-- -------------------------------------------------------------------------
-- 2.1 motoboys — cadastro de entregadores
-- -------------------------------------------------------------------------
-- REGRA DE NEGÓCIO: cada motoboy é um entregador (próprio ou terceirizado)
-- vinculado a um usuário do sistema (auth.users) com role "motoboy".
-- IMPACTO SE REMOVIDO: perde-se o vínculo da entrega com o entregador.
CREATE TABLE IF NOT EXISTS alissonerp.motoboys (
  id              SERIAL PRIMARY KEY,
  user_id         UUID UNIQUE REFERENCES auth.users(id),
  nome            TEXT NOT NULL,
  telefone        TEXT,
  veiculo         TEXT,
  placa           TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- -------------------------------------------------------------------------
-- 2.2 entregas_venda — cabeçalho da entrega vinculada a uma venda
-- -------------------------------------------------------------------------
-- REGRA DE NEGÓCIO: uma venda pode ter múltiplas entregas parciais.
-- O código_entrega (ENT-YYYYMMDD-XXXXX) é o identificador público.
-- O código_cliente (6 dígitos) é enviado ao cliente para verificação.
-- O código_motoboy (6 dígitos) é enviado ao motoboy — NULL se retirada.
-- O estoque só é baixado quando um código de verificação é confirmado.
-- IMPACTO SE REMOVIDO: perde-se todo o rastreamento operacional de entregas.
CREATE TABLE IF NOT EXISTS alissonerp.entregas_venda (
  id                    SERIAL PRIMARY KEY,
  venda_id              INTEGER NOT NULL REFERENCES alissonerp.vendas_erp(id),

  -- Códigos de rastreamento e verificação
  -- REGRA DE NEGÓCIO: codigo_entrega identifica a remessa publicamente.
  -- codigo_cliente (A) é enviado ao cliente por WhatsApp/email.
  -- codigo_motoboy (B) é enviado ao motoboy pelo app.
  -- IMPACTO SE REMOVIDO: impossível fazer verificação em duas etapas.
  codigo_entrega        TEXT NOT NULL UNIQUE,
  codigo_cliente        TEXT NOT NULL UNIQUE,
  codigo_motoboy        TEXT UNIQUE,

  -- Classificação
  tipo                  alissonerp.enum_entrega_tipo NOT NULL,
  situacao              alissonerp.enum_entrega_situacao NOT NULL DEFAULT 'pendente',
  forma_entrega         alissonerp.enum_entrega_forma NOT NULL,
  regiao                alissonerp.enum_entrega_regiao,

  -- Valores financeiros
  -- REGRA DE NEGÓCIO: frete_cobrado = quanto o cliente pagou (vem da venda).
  -- frete_motoboy = quanto o motoboy recebe (R$20 Fortaleza, R$50 fora, ou negociado).
  -- A diferença (frete_cobrado - frete_motoboy) abastece ou consome o saldo da gerente.
  -- IMPACTO SE ALTERADO: fechamentos de frete e saldo da gerente dependem destes campos.
  frete_cobrado         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (frete_cobrado >= 0),
  frete_motoboy         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (frete_motoboy >= 0),

  -- Retirada na loja
  -- REGRA DE NEGÓCIO: preenchidos quando o cliente vai à loja com o Código A
  -- e o vendedor confirma a retirada no sistema.
  data_retirada         TIMESTAMPTZ,
  retirado_por          TEXT,
  confirmado_por_retirada UUID REFERENCES auth.users(id),

  -- Motoboy
  -- REGRA DE NEGÓCIO: motoboy_id referencia o usuário do sistema com role "motoboy".
  -- data_saida = momento que o motoboy digital o Código B e retira da loja.
  -- data_entrega_realizada = momento que o Código A (cliente) é digitado como confirmação.
  -- IMPACTO SE REMOVIDO: perde-se rastreabilidade de quem retirou e quando.
  motoboy_id            UUID REFERENCES auth.users(id),
  data_saida            TIMESTAMPTZ,
  data_entrega_prevista DATE,
  data_entrega_realizada TIMESTAMPTZ,
  confirmado_por_motoboy_retirada UUID REFERENCES auth.users(id),
  confirmado_por_motoboy_entrega  UUID REFERENCES auth.users(id),

  -- Correios
  -- REGRA DE NEGÓCIO: código de rastreio dos Correios digitado manualmente
  -- pelo motoboy após a postagem na agência. Fase 1: manual. Fase 2: integração.
  correios_rastreio     TEXT,
  correios_data_postagem TIMESTAMPTZ,

  -- Aprovação de frete
  -- REGRA DE NEGÓCIO: se frete_cobrado < frete_motoboy, a gerente precisa
  -- aprovar. Se frete_cobrado = 0 (grátis), também precisa de aprovação.
  -- A gerente pode aprovar mesmo sem saldo suficiente (limite brando).
  -- IMPACTO SE REMOVIDO: frete grátis/parcial seria liberado sem controle.
  aprovacao_frete_necessaria BOOLEAN NOT NULL DEFAULT false,
  aprovacao_frete_status     VARCHAR(20),
  aprovacao_frete_por        UUID REFERENCES auth.users(id),
  aprovacao_frete_em         TIMESTAMPTZ,

  -- Observações e auditoria
  observacoes           TEXT,
  created_by            UUID NOT NULL REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- -------------------------------------------------------------------------
-- 2.3 entregas_venda_itens — itens incluídos em cada entrega
-- -------------------------------------------------------------------------
-- REGRA DE NEGÓCIO: permite entrega parcial. Cada linha vincula um item da
-- venda a uma entrega, com a quantidade efetivamente enviada nesta remessa.
-- baixa_estoque_realizada = true após confirmação do código de verificação.
-- IMPACTO SE REMOVIDO: perde-se controle do que já foi entregue vs pendente.
CREATE TABLE IF NOT EXISTS alissonerp.entregas_venda_itens (
  id                        SERIAL PRIMARY KEY,
  entrega_id                INTEGER NOT NULL
    REFERENCES alissonerp.entregas_venda(id) ON DELETE CASCADE,
  item_venda_id             INTEGER NOT NULL
    REFERENCES alissonerp.itens_venda_erp(id),
  quantidade_entregue       INTEGER NOT NULL CHECK (quantidade_entregue > 0),
  baixa_estoque_realizada   BOOLEAN NOT NULL DEFAULT false,
  movimentacao_estoque_id   INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Garantia: mesmo item não pode aparecer 2x na mesma entrega
  UNIQUE(entrega_id, item_venda_id)
);


-- -------------------------------------------------------------------------
-- 2.4 saldo_frete_gratis — conta-corrente de frete grátis da gerente
-- -------------------------------------------------------------------------
-- REGRA DE NEGÓCIO: cada gerente de loja tem um saldo de frete grátis.
-- Créditos: abastecem quando frete_cobrado > frete_motoboy (sobra do frete).
-- Débitos: consomem quando frete_cobrado < frete_motoboy ou frete grátis total.
-- No fechamento mensal: positivo carrega, negativo desconta da folha da gerente.
-- Padrão similar a saldo_credito_loja (SELECT FOR UPDATE).
-- IMPACTO SE REMOVIDO: perde-se controle do orçamento de frete grátis.
CREATE TABLE IF NOT EXISTS alissonerp.saldo_frete_gratis (
  id              SERIAL PRIMARY KEY,
  gerente_id      UUID NOT NULL REFERENCES auth.users(id),
  tipo            alissonerp.enum_saldo_frete_tipo NOT NULL,
  valor           NUMERIC(12,2) NOT NULL,
  saldo_antes     NUMERIC(12,2) NOT NULL,
  saldo_depois    NUMERIC(12,2) NOT NULL,
  entrega_id      INTEGER REFERENCES alissonerp.entregas_venda(id),
  venda_id        INTEGER REFERENCES alissonerp.vendas_erp(id),
  descricao       TEXT,
  fechamento_id   INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES auth.users(id)
);

COMMENT ON TABLE alissonerp.saldo_frete_gratis IS
'Conta-corrente de frete grátis por gerente. Créditos abastecem (frete cobrado > motoboy). Débitos consomem (frete grátis ou parcial). Fechamento mensal: positivo carrega, negativo desconta em folha.';


-- -------------------------------------------------------------------------
-- 2.5 fechamentos_frete — fechamento mensal do saldo de frete
-- -------------------------------------------------------------------------
-- REGRA DE NEGÓCIO: todo mês, o saldo da gerente é consolidado.
-- Se saldo_final positivo: carrega para o mês seguinte.
-- Se saldo_final negativo: valor_descontado_folha = |saldo_final|, desconta
-- da folha de pagamento da gerente, e o saldo zera para o mês seguinte.
-- IMPACTO SE REMOVIDO: perde-se a capacidade de fechar e auditar o
-- orçamento mensal de frete e a integração com a folha de pagamento.
CREATE TABLE IF NOT EXISTS alissonerp.fechamentos_frete (
  id                    SERIAL PRIMARY KEY,
  gerente_id            UUID NOT NULL REFERENCES auth.users(id),
  mes_referencia        DATE NOT NULL,
  saldo_anterior        NUMERIC(12,2) NOT NULL,
  total_creditos        NUMERIC(12,2) NOT NULL,
  total_debitos         NUMERIC(12,2) NOT NULL,
  saldo_final           NUMERIC(12,2) NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'aberto',
  valor_descontado_folha NUMERIC(12,2) DEFAULT 0,
  observacoes           TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES auth.users(id),

  UNIQUE(gerente_id, mes_referencia)
);

-- FK de saldo_frete_gratis → fechamentos_frete (agora que a tabela já existe)
ALTER TABLE alissonerp.saldo_frete_gratis
  ADD CONSTRAINT fk_saldo_frete_fechamento
  FOREIGN KEY (fechamento_id) REFERENCES alissonerp.fechamentos_frete(id)
  NOT VALID;


-- =============================================================================
-- 3. ÍNDICES
-- =============================================================================
-- REGRA DE NEGÓCIO: índices otimizam as queries mais frequentes do módulo.
-- IMPACTO SE REMOVIDO: performance degrada com o volume de entregas.

CREATE INDEX IF NOT EXISTS idx_entregas_venda_venda_id
  ON alissonerp.entregas_venda(venda_id);

CREATE INDEX IF NOT EXISTS idx_entregas_venda_situacao
  ON alissonerp.entregas_venda(situacao);

CREATE INDEX IF NOT EXISTS idx_entregas_venda_motoboy_id
  ON alissonerp.entregas_venda(motoboy_id) WHERE motoboy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entregas_venda_codigo_cliente
  ON alissonerp.entregas_venda(codigo_cliente);

CREATE INDEX IF NOT EXISTS idx_entregas_venda_codigo_motoboy
  ON alissonerp.entregas_venda(codigo_motoboy) WHERE codigo_motoboy IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entregas_venda_created_at
  ON alissonerp.entregas_venda(created_at);

CREATE INDEX IF NOT EXISTS idx_entregas_itens_entrega_id
  ON alissonerp.entregas_venda_itens(entrega_id);

CREATE INDEX IF NOT EXISTS idx_entregas_itens_item_venda_id
  ON alissonerp.entregas_venda_itens(item_venda_id);

CREATE INDEX IF NOT EXISTS idx_saldo_frete_gerente_id
  ON alissonerp.saldo_frete_gratis(gerente_id);

CREATE INDEX IF NOT EXISTS idx_saldo_frete_entrega_id
  ON alissonerp.saldo_frete_gratis(entrega_id);

CREATE INDEX IF NOT EXISTS idx_saldo_frete_created_at
  ON alissonerp.saldo_frete_gratis(created_at);

CREATE INDEX IF NOT EXISTS idx_fechamentos_gerente_mes
  ON alissonerp.fechamentos_frete(gerente_id, mes_referencia);

CREATE INDEX IF NOT EXISTS idx_motoboys_ativo
  ON alissonerp.motoboys(ativo) WHERE ativo = true;

CREATE INDEX IF NOT EXISTS idx_motoboys_user_id
  ON alissonerp.motoboys(user_id);


-- =============================================================================
-- 4. VIEWS
-- =============================================================================

-- 4.1 vw_entregas_pendentes — saldo a entregar por item da venda
-- REGRA DE NEGÓCIO: calcula, para cada item vendido, quanto já foi entregue
-- (apenas entregas confirmadas) e quanto ainda falta. Usada para validação
-- de não exceder a quantidade vendida ao criar nova entrega.
-- IMPACTO SE REMOVIDO: a aplicação precisaria recalcular manualmente,
-- arriscando entregar mais do que o vendido.
CREATE OR REPLACE VIEW alissonerp.vw_entregas_pendentes AS
SELECT
  iv.id AS item_venda_id,
  iv.venda_id,
  iv.produto_id,
  iv.nome_produto,
  iv.sku,
  iv.quantidade AS qtd_vendida,
  COALESCE(SUM(ei.quantidade_entregue) FILTER (
    WHERE ev.situacao = 'confirmada'
  ), 0) AS qtd_entregue,
  iv.quantidade - COALESCE(SUM(ei.quantidade_entregue) FILTER (
    WHERE ev.situacao = 'confirmada'
  ), 0) AS saldo_pendente
FROM alissonerp.itens_venda_erp iv
LEFT JOIN alissonerp.entregas_venda_itens ei ON ei.item_venda_id = iv.id
LEFT JOIN alissonerp.entregas_venda ev ON ev.id = ei.entrega_id
GROUP BY iv.id, iv.venda_id, iv.produto_id, iv.nome_produto, iv.sku, iv.quantidade;


-- 4.2 vw_motoboy_entregas — entregas agrupadas por motoboy (base para pagamento)
-- REGRA DE NEGÓCIO: facilita o cálculo de quanto pagar para cada motoboy
-- com base nas entregas confirmadas via motoboy. Filtra apenas entregas
-- concluídas com forma_entrega = 'motoboy'.
-- IMPACTO SE REMOVIDO: pagamento de motoboys ficaria manual.
CREATE OR REPLACE VIEW alissonerp.vw_motoboy_entregas AS
SELECT
  ev.id AS entrega_id,
  ev.motoboy_id,
  mb.nome AS motoboy_nome,
  ev.codigo_entrega,
  ev.venda_id,
  ev.data_entrega_realizada,
  ev.regiao,
  ev.frete_motoboy,
  ev.situacao,
  ev.created_at
FROM alissonerp.entregas_venda ev
LEFT JOIN alissonerp.motoboys mb ON mb.user_id = ev.motoboy_id
WHERE ev.situacao = 'confirmada'
  AND ev.forma_entrega = 'motoboy';


COMMIT;
