-- =============================================
-- MIGRATION 003: TABELAS USUÁRIOS E COMERCIAL BASE
-- Schema: alissonerp
-- =============================================

SET search_path TO alissonerp;

-- Vendedores (consultoras da loja)
CREATE TABLE vendedores (
  id_vendedor BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  id_api_vendedor BIGINT UNIQUE,
  id_api_kommo BIGINT,
  situacao alissonerp.enum_situacao_ativa DEFAULT 'ativo',
  comissao_id INTEGER REFERENCES alissonerp.comissoes(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Usuários (extensão do auth.users do Supabase)
CREATE TABLE usuarios (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  nome VARCHAR(255) NOT NULL,
  role alissonerp.enum_role NOT NULL DEFAULT 'ourives',
  vendedor_id BIGINT REFERENCES alissonerp.vendedores(id_vendedor),
  mx_desconto_permitido DECIMAL(5,2) DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Contatos (clientes e fornecedores)
CREATE TABLE contatos (
  id_contato BIGSERIAL PRIMARY KEY,
  id_api_contato BIGINT UNIQUE,
  nome TEXT NOT NULL,
  cpf_cnpj VARCHAR(20),
  email VARCHAR(255),
  telefone VARCHAR(20),
  tipo_idapi INTEGER,
  vendedor_idapi BIGINT,
  endereco JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_contatos_api ON alissonerp.contatos(id_api_contato);
CREATE INDEX idx_contatos_nome ON alissonerp.contatos(nome);

-- Insumos (ouro, pedras, outros materiais)
-- ID 1 = Ouro 18k Amarelo — fixo, referenciado nos cálculos de PMC
CREATE TABLE insumos (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(50),
  nome VARCHAR(255) NOT NULL,
  categoria_id INTEGER REFERENCES alissonerp.categorias_insumo(id),
  saldo REAL DEFAULT 0,
  peso_pedra REAL DEFAULT 0,
  peso_total REAL DEFAULT 0,
  custo_compra REAL DEFAULT 0,
  estoque_minimo REAL DEFAULT 0,
  estoque_maximo REAL DEFAULT 0,
  fornecedor_id BIGINT REFERENCES alissonerp.contatos(id_contato),
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_insumos_categoria ON alissonerp.insumos(categoria_id);
CREATE INDEX idx_insumos_sku ON alissonerp.insumos(sku);
