-- =============================================
-- MIGRATION 002: TABELAS DE CONFIGURAÇÃO
-- Schema: alissonerp
-- =============================================

SET search_path TO alissonerp;

-- Depósitos (ID 1 = Almoxarifado Central — hub de todas movimentações)
CREATE TABLE depositos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  tipo alissonerp.enum_tipo_deposito NOT NULL DEFAULT 'producao',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Setores de produção
CREATE TABLE setores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tipos de apontamento (IDs 1-9 fixos — referenciados nos triggers)
CREATE TABLE tipos_apontamento (
  id SERIAL PRIMARY KEY,
  descricao VARCHAR(100) NOT NULL,
  scope alissonerp.enum_tipo_apontamento_scope NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categorias de insumo (IDs fixos: 1=Metal, 2=Pedras, 8=Outros)
CREATE TABLE categorias_insumo (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Parâmetros globais (singleton — CHECK garante só 1 linha)
CREATE TABLE parametros (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cotacao_ouro DECIMAL(12,2),
  cotacao_dolar DECIMAL(12,2),
  cotacao_euro DECIMAL(12,2),
  cotacao_prata DECIMAL(12,2),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Comissões
CREATE TABLE comissoes (
  id SERIAL PRIMARY KEY,
  descricao VARCHAR(100),
  percentual DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT now()
);
