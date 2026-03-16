-- =============================================
-- MIGRATION 007: PCP + AUXILIARES
-- =============================================
SET search_path TO alissonerp;

-- Saída da ordem (precisa existir antes do PCP)
CREATE TABLE alissonerp.saidas_ordem (
  id SERIAL PRIMARY KEY,
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  peso REAL,
  obs TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- PCP
CREATE TABLE alissonerp.pcp (
  id SERIAL PRIMARY KEY,
  etapas alissonerp.enum_etapas_pcp DEFAULT 'novas_ordens',
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  saida_ordem_id INTEGER REFERENCES alissonerp.saidas_ordem(id) ON DELETE SET NULL,
  operador UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bloqueado BOOLEAN DEFAULT false,
  local_atual BOOLEAN DEFAULT true,

  -- Totais calculados
  total_metal REAL DEFAULT 0,
  retorno_metal REAL DEFAULT 0,
  total_pedras_un REAL DEFAULT 0,
  total_pedras_g REAL DEFAULT 0,
  total_geral_outros_pesos REAL DEFAULT 0,
  total_outros_pesos_g REAL DEFAULT 0,

  -- Cálculos PMC
  pmc REAL DEFAULT 0,
  quebra REAL DEFAULT 0,
  porcentagem_de_quebra REAL DEFAULT 0,
  peso_final REAL DEFAULT 0,
  peso_unitario REAL DEFAULT 0,
  quantidade REAL DEFAULT 0,
  metal_externo REAL DEFAULT 0,

  data_conclusao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_pcp_ordem  ON alissonerp.pcp(ordem_id);
CREATE INDEX idx_pcp_etapas ON alissonerp.pcp(etapas);

-- Apontamentos PCP
CREATE TABLE alissonerp.apontamentos_pcp (
  id SERIAL PRIMARY KEY,
  tipo_apontamento_id INTEGER REFERENCES alissonerp.tipos_apontamento(id),
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  setor_id INTEGER REFERENCES alissonerp.setores(id),
  insumo_id INTEGER REFERENCES alissonerp.insumos(id),
  pcp_id INTEGER REFERENCES alissonerp.pcp(id) ON DELETE SET NULL,
  qtd REAL NOT NULL,
  marcador JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_apt_pcp_pcp ON alissonerp.apontamentos_pcp(pcp_id);

-- Apontamentos do pote
CREATE TABLE alissonerp.apontamentos_pote (
  id SERIAL PRIMARY KEY,
  pcp_id INTEGER REFERENCES alissonerp.pcp(id) ON DELETE SET NULL,
  peso_bruto REAL,
  peso_liquido REAL,
  foto_balanca UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Transferências entre setores
CREATE TABLE alissonerp.transferencias_ordem (
  id SERIAL PRIMARY KEY,
  pcp_id INTEGER REFERENCES alissonerp.pcp(id) ON DELETE SET NULL,
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  setor_id INTEGER REFERENCES alissonerp.setores(id),
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  obs TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Outros insumos PCP
CREATE TABLE alissonerp.outros_insumos_pcp (
  id SERIAL PRIMARY KEY,
  pcp_id INTEGER REFERENCES alissonerp.pcp(id) ON DELETE SET NULL,
  ordem_id INTEGER REFERENCES alissonerp.ordens(id),
  insumo_id INTEGER REFERENCES alissonerp.insumos(id),
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  peso REAL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Itens da ordem: insumos
CREATE TABLE alissonerp.itens_ordem_insumos (
  id SERIAL PRIMARY KEY,
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  insumo_id INTEGER REFERENCES alissonerp.insumos(id),
  peso REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Itens da ordem: produtos (referencia public.produtos)
CREATE TABLE alissonerp.itens_ordem_produtos (
  id SERIAL PRIMARY KEY,
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  produto_id BIGINT REFERENCES public.produtos(id_produto),
  quantidade REAL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pedras das ordens
CREATE TABLE alissonerp.pedras_ordens (
  id SERIAL PRIMARY KEY,
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  peso REAL,
  peso_pedra REAL,
  qtd_pedras REAL,
  data_hora TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
