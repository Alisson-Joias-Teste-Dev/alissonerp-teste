-- ============================================================
-- MÓDULO SERVICE v2.13.0 — Sprint 1
-- ============================================================

-- 1. FLAG DE ACESSO NO USUÁRIO
ALTER TABLE alissonerp.usuarios
  ADD COLUMN IF NOT EXISTS is_operador_service BOOLEAN DEFAULT false;

COMMENT ON COLUMN alissonerp.usuarios.is_operador_service IS
  'Flag: usuário tem acesso ao app Service (dark mobile). Independente da role.';

-- 2. TABELA PRINCIPAL: servicos
CREATE TABLE IF NOT EXISTS alissonerp.servicos (
  id                SERIAL PRIMARY KEY,
  ordem_id          INTEGER NOT NULL REFERENCES alissonerp.ordens(id),
  pcp_id            INTEGER REFERENCES alissonerp.pcp(id),
  operador_id       INTEGER REFERENCES alissonerp.depositos(id),
  tentativa         INTEGER NOT NULL DEFAULT 1,

  -- Pesos
  peso_entrada      NUMERIC(10,2) NOT NULL,
  peso_saida        NUMERIC(10,2),

  -- Solda (modo A1: pesagem do fio)
  usou_solda        BOOLEAN,
  peso_fio_antes    NUMERIC(10,2),
  peso_fio_depois   NUMERIC(10,2),
  consumo_solda     NUMERIC(10,2),

  -- Pedras
  colocou_pedra     BOOLEAN DEFAULT false,
  pedras_colocadas  JSONB DEFAULT '[]'::jsonb,
  -- formato: [{insumo_id, nome, qtd, peso_unitario, peso_total, origem}]
  -- origem: 'estoque' | 'cliente'

  -- Status
  status            VARCHAR(20) NOT NULL DEFAULT 'aguardando',
  -- aguardando   = protocolo ida pendente, peça não chegou
  -- em_servico   = operador recebeu a peça
  -- concluido    = operador finalizou
  -- reprovado    = consultora rejeitou → gera nova tentativa

  -- Fotos (URLs completas)
  foto_recebimento  TEXT,
  foto_conclusao    TEXT,
  foto_fio_solda    TEXT,

  -- Timestamps
  recebido_em       TIMESTAMPTZ,
  concluido_em      TIMESTAMPTZ,
  concluido_por     UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servicos_ordem    ON alissonerp.servicos(ordem_id);
CREATE INDEX IF NOT EXISTS idx_servicos_operador ON alissonerp.servicos(operador_id);
CREATE INDEX IF NOT EXISTS idx_servicos_status   ON alissonerp.servicos(status);
CREATE INDEX IF NOT EXISTS idx_servicos_pcp      ON alissonerp.servicos(pcp_id);

COMMENT ON TABLE alissonerp.servicos IS
  'Módulo Service v2.13.0: rastreio de serviços e garantias com controle de solda e pedras';

-- 3. CONFIGURAÇÃO: Operador padrão para serviços
INSERT INTO alissonerp.configuracoes_sistema (chave, valor)
VALUES ('operador_servico_padrao', '{"deposito_id": null}'::jsonb)
ON CONFLICT (chave) DO NOTHING;

INSERT INTO alissonerp.configuracoes_sistema (chave, valor)
VALUES ('service_tipos_ordem', '["servico_venda", "garantia"]'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- 4. GRANTS
GRANT SELECT, INSERT, UPDATE ON alissonerp.servicos TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.servicos_id_seq TO authenticated;

-- ============================================================
-- TRIGGER: Auto-criar servico quando PCP é criado para servico_venda ou garantia
-- ============================================================
CREATE OR REPLACE FUNCTION alissonerp.fn_criar_servico_from_pcp()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo_ordem    VARCHAR;
  v_peso_entrada  NUMERIC;
  v_dep_padrao    INTEGER;
  v_tipos_service JSONB;
BEGIN
  -- Buscar tipo da ordem e peso da peça
  SELECT tipo_ordem, COALESCE(peso_peca_servico, 0)
  INTO v_tipo_ordem, v_peso_entrada
  FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  -- Buscar tipos de ordem que são service
  SELECT COALESCE(valor, '["servico_venda","garantia"]'::jsonb)
  INTO v_tipos_service
  FROM alissonerp.configuracoes_sistema
  WHERE chave = 'service_tipos_ordem';

  -- Só cria servico para tipos configurados
  IF v_tipo_ordem IS NOT NULL AND v_tipos_service ? v_tipo_ordem THEN
    -- Buscar operador padrão
    SELECT (valor->>'deposito_id')::INTEGER
    INTO v_dep_padrao
    FROM alissonerp.configuracoes_sistema
    WHERE chave = 'operador_servico_padrao';

    -- Criar registro de serviço
    INSERT INTO alissonerp.servicos
      (ordem_id, pcp_id, operador_id, peso_entrada, status)
    VALUES
      (NEW.ordem_id, NEW.id,
       COALESCE(v_dep_padrao, NEW.deposito_id),
       v_peso_entrada,
       'em_servico');

    -- Auto-atribuir PCP ao operador padrão (se configurado e PCP sem depósito)
    IF v_dep_padrao IS NOT NULL AND NEW.deposito_id IS NULL THEN
      UPDATE alissonerp.pcp
      SET deposito_id = v_dep_padrao
      WHERE id = NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_criar_servico_from_pcp ON alissonerp.pcp;
CREATE TRIGGER trg_criar_servico_from_pcp
  AFTER INSERT ON alissonerp.pcp
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_criar_servico_from_pcp();
