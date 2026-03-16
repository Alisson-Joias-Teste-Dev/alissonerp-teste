-- =============================================
-- MIGRATION 008: DISTRIBUIÇÃO + AUXILIARES
-- =============================================
SET search_path TO alissonerp;

CREATE TABLE alissonerp.saidas_distribuicao (
  id SERIAL PRIMARY KEY,
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  pf REAL,
  obs TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE alissonerp.distribuicoes (
  id SERIAL PRIMARY KEY,
  etapas alissonerp.enum_etapas_distribuicao DEFAULT 'em_andamento',
  setor alissonerp.enum_setor_distribuicao,
  operador UUID REFERENCES auth.users(id),
  saida_id INTEGER REFERENCES alissonerp.saidas_distribuicao(id),
  total_metal REAL DEFAULT 0,
  retorno_metal REAL DEFAULT 0,
  total_pedras_un REAL DEFAULT 0,
  total_pedras_g REAL DEFAULT 0,
  total_outros_pesos REAL DEFAULT 0,
  total_geral_outros_pesos REAL DEFAULT 0,
  pmc REAL DEFAULT 0,
  quebra REAL DEFAULT 0,
  porcentagem_de_quebra REAL DEFAULT 0,
  peso_final REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- FK circular: ordens.distribuicao_id → distribuicoes (deixada em aberto na 006)
ALTER TABLE alissonerp.ordens
  ADD CONSTRAINT fk_ordens_distribuicao
  FOREIGN KEY (distribuicao_id) REFERENCES alissonerp.distribuicoes(id) ON DELETE SET NULL;

CREATE INDEX idx_ordens_distribuicao ON alissonerp.ordens(distribuicao_id);

-- M2M: distribuição ↔ ordens
CREATE TABLE alissonerp.distribuicao_ordens (
  id SERIAL PRIMARY KEY,
  distribuicao_id INTEGER REFERENCES alissonerp.distribuicoes(id) ON DELETE SET NULL,
  ordens_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  UNIQUE(distribuicao_id, ordens_id)
);

CREATE TABLE alissonerp.apontamentos_distribuicao (
  id SERIAL PRIMARY KEY,
  tipo_apontamento_id INTEGER REFERENCES alissonerp.tipos_apontamento(id),
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  setor_id INTEGER REFERENCES alissonerp.setores(id),
  insumo_id INTEGER REFERENCES alissonerp.insumos(id),
  distribuicao_id INTEGER REFERENCES alissonerp.distribuicoes(id) ON DELETE SET NULL,
  qtd REAL NOT NULL,
  obs TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE alissonerp.itens_distribuicao (
  id SERIAL PRIMARY KEY,
  distribuicao_id INTEGER REFERENCES alissonerp.distribuicoes(id) ON DELETE SET NULL,
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  insumo_id INTEGER REFERENCES alissonerp.insumos(id),
  peso REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE alissonerp.outros_insumos_distribuicao (
  id SERIAL PRIMARY KEY,
  distribuicao_id INTEGER REFERENCES alissonerp.distribuicoes(id) ON DELETE SET NULL,
  insumo_id INTEGER REFERENCES alissonerp.insumos(id),
  peso REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE alissonerp.fechamentos_distribuicao (
  id SERIAL PRIMARY KEY,
  distribuicao_id INTEGER REFERENCES alissonerp.distribuicoes(id) ON DELETE SET NULL,
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  peso REAL DEFAULT 0,
  pmc REAL DEFAULT 0,
  total_pedras_un REAL DEFAULT 0,
  total_pedras_g REAL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE alissonerp.fechamentos_fabrica (
  id SERIAL PRIMARY KEY,
  setor_id INTEGER REFERENCES alissonerp.setores(id),
  deposito_id INTEGER REFERENCES alissonerp.depositos(id),
  entrada REAL DEFAULT 0,
  saida REAL DEFAULT 0,
  quebra REAL DEFAULT 0,
  quebra_percentual REAL DEFAULT 0,
  ids_processados JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
