-- =============================================
-- MIGRATION 006: TABELA ORDENS
-- Convive com directus.ordens até migração completa
-- =============================================
SET search_path TO alissonerp;

CREATE TABLE alissonerp.ordens (
  id SERIAL PRIMARY KEY,

  -- CAMPOS PDV (protegidos por trigger — só PDV altera)
  numero_ordem TEXT UNIQUE,
  cliente_id BIGINT REFERENCES public.contatos(id_contato) ON DELETE SET NULL,
  vendedor_id BIGINT REFERENCES public.vendedores(id_vendedor),
  pedido_id INTEGER REFERENCES public.vendas(id),
  tipo_ordem alissonerp.enum_tipo_ordem,
  data_entrega DATE,
  peso_metal_negociado REAL DEFAULT 0,
  peso_metal_externo REAL DEFAULT 0,
  ficha_tecnica_id INTEGER,
  itens_para_fabricacao VARCHAR(50),

  -- CAMPOS DE PRODUÇÃO (sistema edita)
  situacao alissonerp.enum_situacao_ordem DEFAULT 'criado',
  status alissonerp.enum_status_ordem DEFAULT 'aguardando',
  rota alissonerp.enum_rota_ordem,
  tipo_controle VARCHAR(20) DEFAULT 'individual',
  setor_atual INTEGER REFERENCES alissonerp.setores(id) ON DELETE SET NULL,
  local_atual INTEGER REFERENCES alissonerp.depositos(id),
  distribuicao_id INTEGER,
  protocolo_loja BOOLEAN DEFAULT false,

  -- SELF-REFERENCE
  id_ordem_relacionada INTEGER REFERENCES alissonerp.ordens(id),

  -- INTEGRAÇÃO
  id_asana BIGINT,

  -- REFERÊNCIA DIRECTUS (para migração)
  directus_ordem_id INTEGER,

  -- REPROVAÇÃO
  motivo_reprovacao INTEGER,
  origem_reprovacao TEXT,

  -- TIMESTAMPS
  data_conclusao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_ordens_status      ON alissonerp.ordens(status);
CREATE INDEX idx_ordens_situacao    ON alissonerp.ordens(situacao);
CREATE INDEX idx_ordens_setor       ON alissonerp.ordens(setor_atual);
CREATE INDEX idx_ordens_local       ON alissonerp.ordens(local_atual);
CREATE INDEX idx_ordens_vendedor    ON alissonerp.ordens(vendedor_id);
CREATE INDEX idx_ordens_cliente     ON alissonerp.ordens(cliente_id);
CREATE INDEX idx_ordens_numero      ON alissonerp.ordens(numero_ordem);
CREATE INDEX idx_ordens_directus    ON alissonerp.ordens(directus_ordem_id);

-- View de leitura das ordens do Directus (somente leitura)
-- NOTA: directus.ordens tem typo "peso_metal_negocido" — mantido na view com alias correto
CREATE VIEW alissonerp.vw_ordens_directus AS
SELECT
  o.id,
  o.numero_ordem,
  o.situacao,
  o.status,
  o.rota,
  o.tipo_ordem,
  o.setor_atual,
  o.local_atual,
  o.vendedor_id,
  o.cliente_id,
  o.pedido_id,
  o.peso_metal_negocido   AS peso_metal_negociado,
  o.peso_metal_externo,
  o.data_entrega,
  o.data_conclusao,
  o.date_created,
  o.date_updated
FROM directus.ordens o;

COMMENT ON TABLE alissonerp.ordens IS 'Tabela central. FKs cross-schema: vendedor/cliente→public, setor→alissonerp. directus_ordem_id cruza dados durante migração.';
COMMENT ON VIEW alissonerp.vw_ordens_directus IS 'Leitura das ordens do Directus. SOMENTE LEITURA. Alias peso_metal_negociado corrige typo do Directus.';
