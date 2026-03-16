-- =============================================
-- MIGRATION 027: TRIGGER PONTE TEMPORÁRIO
-- directus.ordens → alissonerp.ordens
-- Copia ordens com situacao='2' (Criado)
-- UPSERT: não duplica via directus_ordem_id
-- REMOVER quando migrar o PDV para alissonerp
-- =============================================
SET search_path TO alissonerp;

-- ─── 1. UNIQUE INDEX para ON CONFLICT (directus_ordem_id) ──────────────────
-- O índice atual idx_ordens_directus NÃO é unique — criar um novo UNIQUE
-- Nota: índice parcial (WHERE IS NOT NULL) NÃO funciona para ON CONFLICT
-- PostgreSQL permite múltiplos NULLs em UNIQUE index, então não há problema com a 1 linha sem directus_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_ordens_directus_unique
  ON alissonerp.ordens(directus_ordem_id);

-- ─── 2. FUNÇÃO PONTE ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp()
RETURNS TRIGGER AS $$
BEGIN
  -- Guard: só processar ordens com situacao = '2' (Criado)
  IF NEW.situacao != '2' THEN
    RETURN NEW;
  END IF;

  INSERT INTO alissonerp.ordens (
    numero_ordem,
    cliente_id,
    vendedor_id,
    pedido_id,
    tipo_ordem,
    data_entrega,
    peso_metal_negociado,   -- alissonerp: sem typo
    peso_metal_externo,
    itens_para_fabricacao,
    situacao,
    status,
    rota,
    tipo_controle,
    setor_atual,
    local_atual,
    distribuicao_id,
    protocolo_loja,
    id_ordem_relacionada,
    id_asana,
    data_conclusao,
    created_at,
    updated_at,
    directus_ordem_id
  ) VALUES (
    NEW.numero_ordem,
    NEW.cliente_id,
    NEW.vendedor_id,
    NEW.pedido_id,
    -- tipo_ordem: string → enum (mapeamento confirmado via ETL 5.1)
    CASE NEW.tipo_ordem
      WHEN '1' THEN 'producao'::alissonerp.enum_tipo_ordem
      WHEN '2' THEN 'reparo'::alissonerp.enum_tipo_ordem
      WHEN '3' THEN 'ajuste'::alissonerp.enum_tipo_ordem
      WHEN '4' THEN 'banho'::alissonerp.enum_tipo_ordem
      WHEN '5' THEN 'gravacao'::alissonerp.enum_tipo_ordem
      WHEN '6' THEN 'reposicao'::alissonerp.enum_tipo_ordem
      WHEN '7' THEN 'outro'::alissonerp.enum_tipo_ordem
      ELSE        'outro'::alissonerp.enum_tipo_ordem
    END,
    NEW.data_entrega,
    COALESCE(NEW.peso_metal_negocido, 0),  -- directus: typo histórico (sem "ia")
    COALESCE(NEW.peso_metal_externo, 0),
    NEW.itens_para_fabricacao,
    'criado'::alissonerp.enum_situacao_ordem,
    CASE NEW.status
      WHEN '1' THEN 'aguardando'::alissonerp.enum_status_ordem
      WHEN '2' THEN 'em_andamento'::alissonerp.enum_status_ordem
      WHEN '3' THEN 'concluido'::alissonerp.enum_status_ordem
      ELSE          'aguardando'::alissonerp.enum_status_ordem
    END,
    CASE NEW.rota
      WHEN '1' THEN 'pcp'::alissonerp.enum_rota_ordem
      WHEN '2' THEN 'protocolo'::alissonerp.enum_rota_ordem
      ELSE NULL
    END,
    NEW.tipo_controle,
    NEW.setor_atual,
    NEW.local_atual::integer,              -- bigint → integer
    NEW.distribuicao_id,
    COALESCE(NEW.protocolo_loja::boolean, false),  -- VARCHAR → boolean
    NEW.id_ordem_relacionada::integer,     -- bigint → integer
    NEW.id_asana,
    NEW.data_conclusao,
    COALESCE(NEW.date_created, now()),
    now(),
    NEW.id                                 -- chave de deduplicação
  )
  -- ON CONFLICT: atualiza apenas campos operacionais
  -- Campos protegidos por fn_proteger_campos_pdv NÃO podem ser atualizados:
  -- numero_ordem, cliente_id, vendedor_id, pedido_id, tipo_ordem,
  -- data_entrega, peso_metal_negociado, ficha_tecnica_id
  ON CONFLICT (directus_ordem_id) DO UPDATE SET
    peso_metal_externo    = EXCLUDED.peso_metal_externo,
    itens_para_fabricacao = EXCLUDED.itens_para_fabricacao,
    status                = EXCLUDED.status,
    rota                  = EXCLUDED.rota,
    setor_atual           = EXCLUDED.setor_atual,
    local_atual           = EXCLUDED.local_atual,
    updated_at            = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 3. TRIGGER ─────────────────────────────────────────────────────────────
-- Nota: DROP TRIGGER requer ownership da tabela; CREATE OR REPLACE não
-- postgres tem TRIGGER privilege em directus.ordens mas não é owner
CREATE OR REPLACE TRIGGER trg_ponte_ordens
  AFTER INSERT OR UPDATE ON directus.ordens
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_ponte_directus_para_alissonerp();

-- ─── 4. COMENTÁRIOS ─────────────────────────────────────────────────────────
COMMENT ON FUNCTION alissonerp.fn_ponte_directus_para_alissonerp IS
  'TEMPORÁRIO: Copia ordens situacao=2 do directus para alissonerp. UPSERT via directus_ordem_id. REMOVER quando migrar PDV.';

COMMENT ON INDEX alissonerp.idx_ordens_directus_unique IS
  'UNIQUE index em directus_ordem_id para suportar ON CONFLICT na fn_ponte_directus_para_alissonerp.';
