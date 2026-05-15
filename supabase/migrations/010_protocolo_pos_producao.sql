-- =============================================
-- MIGRATION 010: PROTOCOLO + PÓS-PRODUÇÃO
-- =============================================
SET search_path TO alissonerp;

CREATE TABLE alissonerp.protocolos (
  id SERIAL PRIMARY KEY,
  direcao alissonerp.enum_direcao_protocolo NOT NULL,
  etapas alissonerp.enum_etapas_protocolo DEFAULT 'pendente',
  motoboy_id UUID REFERENCES auth.users(id),
  recebedor_id UUID REFERENCES auth.users(id),
  CONSTRAINT chk_motoboy_recebedor
    CHECK (motoboy_id IS NULL OR recebedor_id IS NULL OR motoboy_id != recebedor_id),
  data_conclusao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE alissonerp.protocolo_ordens (
  id SERIAL PRIMARY KEY,
  protocolo_id INTEGER REFERENCES alissonerp.protocolos(id) ON DELETE SET NULL,
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  UNIQUE(protocolo_id, ordem_id)
);

CREATE TABLE alissonerp.protocolo_fotos (
  id SERIAL PRIMARY KEY,
  protocolo_id INTEGER REFERENCES alissonerp.protocolos(id) ON DELETE CASCADE,
  arquivo_id UUID NOT NULL,
  tipo VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE alissonerp.aprovacoes_consultora (
  id SERIAL PRIMARY KEY,
  etapas alissonerp.enum_etapas_aprovacao DEFAULT 'pendente',
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  consultora_id BIGINT REFERENCES public.vendedores(id_vendedor),
  obs TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE alissonerp.preparacoes_entrega (
  id SERIAL PRIMARY KEY,
  etapas alissonerp.enum_etapas_entrega DEFAULT 'pendente',
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE alissonerp.auditorias (
  id SERIAL PRIMARY KEY,
  situacao VARCHAR(10) DEFAULT '1',
  tipo_auditoria VARCHAR(10),
  rota_processo VARCHAR(20),
  ordem_id INTEGER REFERENCES alissonerp.ordens(id) ON DELETE SET NULL,
  data_conclusao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE TABLE alissonerp.ordem_comentarios (
  id SERIAL PRIMARY KEY,
  ordem_id INTEGER NOT NULL REFERENCES alissonerp.ordens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES alissonerp.usuarios(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE alissonerp.ordem_comentario_mencoes (
  id SERIAL PRIMARY KEY,
  comentario_id INTEGER NOT NULL REFERENCES alissonerp.ordem_comentarios(id) ON DELETE CASCADE,
  ordem_id INTEGER NOT NULL REFERENCES alissonerp.ordens(id) ON DELETE CASCADE,
  user_id_mencionado UUID NOT NULL REFERENCES alissonerp.usuarios(id) ON DELETE CASCADE,
  user_id_mencionador UUID NOT NULL REFERENCES alissonerp.usuarios(id) ON DELETE CASCADE,
  lido BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE alissonerp.notificacoes (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES alissonerp.usuarios(id),
  tipo VARCHAR(50),
  titulo TEXT,
  mensagem TEXT,
  lida BOOLEAN DEFAULT false,
  dados JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
