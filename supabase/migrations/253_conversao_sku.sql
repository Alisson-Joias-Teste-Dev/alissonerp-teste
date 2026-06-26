-- ============================================================
-- MIGRATION 253: CONVERSÃO DE SKU
-- Fluxo completa: solicitação → aprovação → protocolo ida →
-- execução (serviço) → protocolo volta → conclusão
-- ============================================================

SET search_path TO alissonerp;

-- ════════════════════════════════════════════════════════════
-- 1. ADICIONAR 'conversao_sku' AO ENUM enum_tipo_ordem
-- ════════════════════════════════════════════════════════════
ALTER TYPE alissonerp.enum_tipo_ordem ADD VALUE IF NOT EXISTS 'conversao_sku';

-- ════════════════════════════════════════════════════════════
-- 2. TABELA: conversoes_sku (cabeçalho)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.conversoes_sku (
  id                SERIAL PRIMARY KEY,
  ordem_id          INTEGER NOT NULL REFERENCES alissonerp.ordens(id),

  -- Origem
  sku_origem_id            BIGINT NOT NULL REFERENCES public.produtos(id_produto),
  sku_origem_quantidade    INTEGER NOT NULL CHECK (sku_origem_quantidade > 0),
  sku_origem_peso          NUMERIC(10,3) NOT NULL CHECK (sku_origem_peso > 0),
  local_origem_id          INTEGER NOT NULL REFERENCES alissonerp.locais_estoque(id),

  -- Destino
  sku_destino_id                 BIGINT NOT NULL REFERENCES public.produtos(id_produto),
  sku_destino_quantidade_desejada INTEGER NOT NULL CHECK (sku_destino_quantidade_desejada > 0),
  local_destino_id               INTEGER NOT NULL REFERENCES alissonerp.locais_estoque(id),

  -- Resultado (preenchido pelo operador)
  peso_final            NUMERIC(10,3),
  quantidade_produzida  INTEGER,
  foto_balanca_final    TEXT,

  -- Sobra/Quebra
  peso_sobra_calculado  NUMERIC(10,3), -- sku_origem_peso - peso_final
  peso_sobra_real       NUMERIC(10,3), -- pesado pelo operador
  foto_sobra            TEXT,
  quebra                NUMERIC(10,3), -- sobra_calculado - sobra_real (se positivo)
  insumo_destino_sobra  INTEGER DEFAULT 1,

  -- Motivo da conversão
  motivo TEXT,

  -- Abertura
  foto_abertura TEXT,

  -- Status
  status_conversao VARCHAR(20) NOT NULL DEFAULT 'pendente'
    CHECK (status_conversao IN (
      'pendente','aprovado','recusado',
      'em_fabrica','aguardando_volta','concluido'
    )),

  -- Reserva (origem)
  reserva_id INTEGER REFERENCES alissonerp.reservas_estoque_comercial(id),

  -- Ordem de Serviço vinculada (criada ao concluir protocolo ida)
  ordem_servico_id INTEGER REFERENCES alissonerp.ordens(id),

  -- Aprovação
  tarefa_aprovacao_id INTEGER REFERENCES alissonerp.tarefas(id),
  aprovado_por      UUID REFERENCES auth.users(id),
  aprovado_em       TIMESTAMPTZ,
  recusado_por      UUID REFERENCES auth.users(id),
  recusado_em       TIMESTAMPTZ,
  foto_recusa       TEXT,
  motivo_recusa     TEXT,

  -- Auditoria
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversoes_sku_ordem  ON alissonerp.conversoes_sku(ordem_id);
CREATE INDEX IF NOT EXISTS idx_conversoes_sku_status ON alissonerp.conversoes_sku(status_conversao);

-- ════════════════════════════════════════════════════════════
-- 3. TRIGGER UPDATED_AT para conversoes_sku
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_conversoes_sku()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_conversoes_sku ON alissonerp.conversoes_sku;
CREATE TRIGGER trg_updated_at_conversoes_sku
  BEFORE UPDATE ON alissonerp.conversoes_sku
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_updated_at_conversoes_sku();

-- ════════════════════════════════════════════════════════════
-- 4. FUNÇÃO: fn_processar_conversao_sku
-- Trigger AFTER INSERT em conversoes_sku
-- Cria tarefa de aprovação para admin
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_conversao_sku()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ordem    RECORD;
  v_origem   RECORD;
  v_destino  RECORD;
  v_tarefa_id INTEGER;
  v_local_nome TEXT;
BEGIN
  SELECT numero_ordem, created_by INTO v_ordem
  FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  SELECT nome, sku INTO v_origem
  FROM public.produtos WHERE id_produto = NEW.sku_origem_id;

  SELECT nome, sku INTO v_destino
  FROM public.produtos WHERE id_produto = NEW.sku_destino_id;

  SELECT nome INTO v_local_nome
  FROM alissonerp.locais_estoque WHERE id = NEW.local_origem_id;

  INSERT INTO alissonerp.tarefas (
    titulo, descricao, responsavel_id, criado_por,
    prioridade, status, tipo, ordem_id, tags
  ) VALUES (
    'Aprovação de Conversão SKU — Ordem ' || COALESCE(v_ordem.numero_ordem, '#' || NEW.ordem_id),
    '🔄 **Conversão de SKU**' || E'\n\n' ||
    '**Origem:** ' || COALESCE(v_origem.nome, 'N/D') || ' (SKU: ' || COALESCE(v_origem.sku, 'N/D') || ')' || E'\n' ||
    '**Peso:** ' || NEW.sku_origem_peso || 'g' || E'\n' ||
    '**Quantidade:** ' || NEW.sku_origem_quantidade || E'\n' ||
    '**Local:** ' || COALESCE(v_local_nome, 'N/D') || E'\n\n' ||
    '**Destino:** ' || COALESCE(v_destino.nome, 'N/D') || ' (SKU: ' || COALESCE(v_destino.sku, 'N/D') || ')' || E'\n' ||
    '**Quantidade Desejada:** ' || NEW.sku_destino_quantidade_desejada || E'\n\n' ||
    '🔴 **Aprovação necessária para liberar para protocolo.**' || E'\n' ||
    '✅ **Aprovar** → libera para protocolo de ida' || E'\n' ||
    '❌ **Rejeitar** → SKU retorna ao estoque',
    COALESCE(
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' AND email LIKE '%alisson%' LIMIT 1),
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' LIMIT 1)
    ),
    NEW.created_by,
    'alta',
    'aguardando_aprovacao',
    'conversao_sku',
    NEW.ordem_id,
    ARRAY['conversao_sku', 'estoque', 'aprovacao']
  )
  RETURNING id INTO v_tarefa_id;

  UPDATE alissonerp.conversoes_sku
  SET tarefa_aprovacao_id = v_tarefa_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criar_tarefa_conversao_sku ON alissonerp.conversoes_sku;
CREATE TRIGGER trg_criar_tarefa_conversao_sku
  AFTER INSERT ON alissonerp.conversoes_sku
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_conversao_sku();

-- ════════════════════════════════════════════════════════════
-- 5. FUNÇÃO: fn_concluir_protocolo_conversao_sku
-- Trigger AFTER UPDATE em protocolos (etapas='concluido')
-- Processa ordens conversao_sku:
--   Ida: cria entrada do SKU origem na fabrica/service + cria OS vinculada
--   Volta: cria entrada do SKU destino no local final + conclui
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_protocolo_conversao_sku()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ordem        RECORD;
  v_conv         RECORD;
  v_mov_id       BIGINT;
  v_local_id     INTEGER;
  v_origem_nome  TEXT;
  v_destino_nome TEXT;
  v_detalhes     TEXT;
BEGIN
  IF NEW.etapas::text != 'concluido' THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo_protocolo = 'service' THEN
    v_local_id := 3;
  ELSE
    v_local_id := 1;
  END IF;

  FOR v_ordem IN
    SELECT o.id, o.numero_ordem
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.ordens o ON o.id = po.ordem_id
    WHERE po.protocolo_id = NEW.id
      AND o.tipo_ordem::text = 'conversao_sku'
  LOOP
    SELECT * INTO v_conv
    FROM alissonerp.conversoes_sku
    WHERE ordem_id = v_ordem.id
    LIMIT 1;

    IF NOT FOUND THEN CONTINUE; END IF;

    IF NEW.direcao::text = 'ida' THEN
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
         ordem_id, protocolo_id, observacao, created_by)
      VALUES
        (v_conv.sku_origem_id, 'entrada', v_conv.sku_origem_quantidade,
         'conversao_sku_ida', v_local_id, 'efetivado',
         v_conv.ordem_id, NEW.id,
         'Entrada na fabrica (Ordem ' || COALESCE(v_ordem.numero_ordem, '#' || v_ordem.id) || ')',
         NEW.recebedor_id)
      RETURNING id INTO v_mov_id;

      UPDATE alissonerp.conversoes_sku
      SET status_conversao = 'em_fabrica', updated_at = NOW()
      WHERE id = v_conv.id;

      SELECT nome INTO v_origem_nome FROM public.produtos WHERE id_produto = v_conv.sku_origem_id;
      SELECT nome INTO v_destino_nome FROM public.produtos WHERE id_produto = v_conv.sku_destino_id;

      v_detalhes := 'CONVERSAO DE SKU' || chr(10) ||
                    'ORIGEM: ' || COALESCE(v_origem_nome, 'N/D') || chr(10) ||
                    '   Peso: ' || v_conv.sku_origem_peso || 'g' || chr(10) ||
                    '   Qtd: ' || v_conv.sku_origem_quantidade || chr(10) ||
                    'DESTINO: ' || COALESCE(v_destino_nome, 'N/D') || chr(10) ||
                    '   Qtd desejada: ' || v_conv.sku_destino_quantidade_desejada || chr(10) ||
                    CASE WHEN v_conv.motivo IS NOT NULL THEN 'MOTIVO: ' || v_conv.motivo || chr(10) ELSE '' END ||
                    'Para concluir informe: peso final, qtd produzida, foto balanca, peso sobra e foto sobra.';

      UPDATE alissonerp.ordens
      SET detalhes_ordem = v_detalhes, updated_at = NOW()
      WHERE id = v_ordem.id;

    ELSIF NEW.direcao::text = 'volta' THEN
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status,
         ordem_id, protocolo_id, observacao, created_by)
      VALUES
        (v_conv.sku_destino_id, 'entrada', COALESCE(v_conv.quantidade_produzida, v_conv.sku_destino_quantidade_desejada),
         'conversao_sku_volta', v_conv.local_destino_id, 'efetivado',
         v_conv.ordem_id, NEW.id,
         'Entrada no destino (Ordem ' || COALESCE(v_ordem.numero_ordem, '#' || v_ordem.id) || ')',
         NEW.recebedor_id)
      RETURNING id INTO v_mov_id;

      UPDATE alissonerp.conversoes_sku
      SET status_conversao = 'concluido', updated_at = NOW()
      WHERE id = v_conv.id;

      UPDATE alissonerp.ordens
      SET status = 'concluido', data_conclusao = NOW(), updated_at = NOW()
      WHERE id = v_ordem.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concluir_conversao_sku ON alissonerp.protocolos;
CREATE TRIGGER trg_concluir_conversao_sku
  AFTER UPDATE ON alissonerp.protocolos
  FOR EACH ROW WHEN (NEW.etapas::text = 'concluido' AND (OLD.etapas::text IS DISTINCT FROM 'concluido'))
  EXECUTE FUNCTION alissonerp.fn_concluir_protocolo_conversao_sku();

-- ════════════════════════════════════════════════════════════
-- 6. ATUALIZAR vw_ordens_prontas_ida
-- ════════════════════════════════════════════════════════════
DROP VIEW IF EXISTS alissonerp.vw_ordens_prontas_ida CASCADE;
CREATE VIEW alissonerp.vw_ordens_prontas_ida AS
SELECT DISTINCT o.id,
    o.numero_ordem,
    o.status::text AS status
FROM alissonerp.ordens o
JOIN alissonerp.auditorias a
  ON a.ordem_id = o.id
  AND a.tipo_auditoria::text = 'loja'::text
  AND a.situacao::text = 'aprovado'::text
WHERE o.rota::text = 'protocolo'::text
  AND o.status::text <> ALL (ARRAY['cancelado','entregue','concluido'])
  AND o.tipo_ordem::text NOT IN ('conversao', 'conversao_sku')
  AND o.id NOT IN (
    SELECT po.ordem_id
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
    WHERE p.etapas::text != 'concluido'
      AND p.direcao::text = 'ida'
  )
UNION ALL
SELECT DISTINCT o.id,
    o.numero_ordem,
    o.status::text AS status
FROM alissonerp.ordens o
JOIN alissonerp.conversoes_estoque ce ON ce.ordem_id = o.id
WHERE o.tipo_ordem::text = 'conversao'
  AND o.rota::text = 'protocolo'
  AND o.situacao::text = 'criado'
  AND o.status::text = 'aguardando'
  AND ce.status_conversao = 'aprovado'
  AND ce.tarefa_aprovacao_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM alissonerp.tarefas t
    WHERE t.id = ce.tarefa_aprovacao_id
      AND t.status = 'aprovada'
  )
  AND o.status::text <> ALL (ARRAY['cancelado','entregue','concluido'])
  AND o.id NOT IN (
    SELECT po.ordem_id
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
    WHERE p.etapas::text != 'concluido'
      AND p.direcao::text = 'ida'
  )
UNION ALL
SELECT DISTINCT o.id,
    o.numero_ordem,
    o.status::text AS status
FROM alissonerp.ordens o
JOIN alissonerp.conversoes_sku cs ON cs.ordem_id = o.id
WHERE o.tipo_ordem::text = 'conversao_sku'
  AND o.rota::text = 'protocolo'
  AND o.situacao::text = 'criado'
  AND o.status::text = 'aguardando'
  AND cs.status_conversao = 'aprovado'
  AND cs.tarefa_aprovacao_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM alissonerp.tarefas t
    WHERE t.id = cs.tarefa_aprovacao_id
      AND t.status = 'aprovada'
  )
  AND o.status::text <> ALL (ARRAY['cancelado','entregue','concluido'])
  AND o.id NOT IN (
    SELECT po.ordem_id
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
    WHERE p.etapas::text != 'concluido'
      AND p.direcao::text = 'ida'
  )
ORDER BY id DESC;

-- ════════════════════════════════════════════════════════════
-- 7. CRIAR vw_ordens_prontas_volta
-- View para ordens conversao_sku prontas para protocolo volta
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW alissonerp.vw_ordens_prontas_volta AS
SELECT DISTINCT o.id,
    o.numero_ordem,
    o.status::text AS status
FROM alissonerp.ordens o
JOIN alissonerp.conversoes_sku cs ON cs.ordem_id = o.id
WHERE o.tipo_ordem::text = 'conversao_sku'
  AND cs.status_conversao = 'aguardando_volta'
  AND o.status::text IN ('aguardando', 'em_andamento')
  AND o.id NOT IN (
    SELECT po.ordem_id
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.protocolos p ON p.id = po.protocolo_id
    WHERE p.etapas::text != 'concluido'
      AND p.direcao::text = 'volta'
  )
ORDER BY id DESC;

-- ════════════════════════════════════════════════════════════
-- 8. ATUALIZAR VIEWS COM CASE 'conversao_sku'
-- ════════════════════════════════════════════════════════════
SET search_path TO public;

-- 8.1 vw_ordens_completa
DROP VIEW IF EXISTS alissonerp.vw_ordens_completa CASCADE;
CREATE VIEW alissonerp.vw_ordens_completa AS
SELECT o.id,
    o.numero_ordem,
    o.numero_pedido,
    o.venda_id,
    o.situacao::text AS situacao_cod,
        CASE o.situacao::text
            WHEN 'cancelado' THEN 'Cancelado'
            WHEN 'criado'    THEN 'Criado'
            WHEN 'rascunho'  THEN 'Rascunho'
            ELSE 'Desconhecido'
        END AS situacao,
    o.status::text AS status_cod,
        CASE o.status::text
            WHEN 'aguardando'   THEN 'Aguardando'
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            WHEN 'cancelado'    THEN 'Cancelado'
            ELSE 'Desconhecido'
        END AS status,
    o.rota::text AS rota_cod,
        CASE o.rota::text
            WHEN 'pcp'       THEN 'PCP'
            WHEN 'protocolo' THEN 'Protocolo'
            ELSE '—'
        END AS rota,
    o.tipo_ordem::text AS tipo_ordem_cod,
        CASE o.tipo_ordem::text
            WHEN 'servico_venda'      THEN 'Serviço Venda'
            WHEN 'servico_loja'       THEN 'Serviço Loja'
            WHEN 'fabricacao'         THEN 'Fabricação'
            WHEN 'reposicao_venda'    THEN 'Reposição Venda'
            WHEN 'reposicao_loja'     THEN 'Reposição Loja'
            WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
            WHEN 'garantia'           THEN 'Garantia'
            WHEN 'servico_interno'    THEN 'Serviço Interno'
            WHEN 'conversao'          THEN 'Conversão Estoque'
            WHEN 'conversao_sku'      THEN 'Conversão SKU'
            ELSE '—'
        END AS tipo_ordem,
    o.setor_atual AS setor_id,
    s.nome AS setor_nome,
    o.local_atual AS deposito_id,
    d.nome AS deposito_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.created_at AS date_created,
    o.updated_at AS date_updated
FROM alissonerp.ordens o
LEFT JOIN alissonerp.setores s ON s.id = o.setor_atual
LEFT JOIN alissonerp.depositos d ON d.id = o.local_atual
LEFT JOIN vendedores v ON v.id_vendedor = o.vendedor_id
LEFT JOIN contatos c ON c.id_contato = o.cliente_id;

-- 8.2 vw_ordens_por_tipo
DROP VIEW IF EXISTS alissonerp.vw_ordens_por_tipo CASCADE;
CREATE VIEW alissonerp.vw_ordens_por_tipo AS
SELECT
    CASE o.tipo_ordem::text
        WHEN 'servico_venda'      THEN 'Serviço Venda'
        WHEN 'servico_loja'       THEN 'Serviço Loja'
        WHEN 'fabricacao'         THEN 'Fabricação'
        WHEN 'reposicao_venda'    THEN 'Reposição Venda'
        WHEN 'reposicao_loja'     THEN 'Reposição Loja'
        WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
        WHEN 'garantia'           THEN 'Garantia'
        WHEN 'servico_interno'    THEN 'Serviço Interno'
        WHEN 'conversao'          THEN 'Conversão Estoque'
        WHEN 'conversao_sku'      THEN 'Conversão SKU'
        ELSE 'N/D'
    END AS tipo,
    COUNT(*) AS total
FROM alissonerp.ordens o
WHERE o.created_at > NOW() - INTERVAL '6 months'
GROUP BY o.tipo_ordem
ORDER BY COUNT(*) DESC;

-- 8.3 vw_ordem_detalhe
DROP VIEW IF EXISTS alissonerp.vw_ordem_detalhe CASCADE;
CREATE VIEW alissonerp.vw_ordem_detalhe AS
SELECT o.id,
    o.numero_ordem,
    o.numero_pedido,
    o.situacao::text AS situacao_cod,
        CASE o.situacao::text
            WHEN 'cancelado' THEN 'Cancelado'
            WHEN 'criado'    THEN 'Criado'
            WHEN 'rascunho'  THEN 'Rascunho'
            ELSE 'Desconhecido'
        END AS situacao,
    o.status::text AS status_cod,
        CASE o.status::text
            WHEN 'aguardando'   THEN 'Aguardando'
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            WHEN 'cancelado'    THEN 'Cancelado'
            ELSE 'Desconhecido'
        END AS status,
    o.rota::text AS rota_cod,
        CASE o.rota::text
            WHEN 'pcp'       THEN 'PCP'
            WHEN 'protocolo' THEN 'Protocolo'
            ELSE '—'
        END AS rota,
    o.tipo_ordem::text AS tipo_ordem_cod,
        CASE o.tipo_ordem::text
            WHEN 'servico_venda'      THEN 'Serviço Venda'
            WHEN 'servico_loja'       THEN 'Serviço Loja'
            WHEN 'fabricacao'         THEN 'Fabricação'
            WHEN 'reposicao_venda'    THEN 'Reposição Venda'
            WHEN 'reposicao_loja'     THEN 'Reposição Loja'
            WHEN 'compra_fornecedor'  THEN 'Compra de Fornecedor'
            WHEN 'garantia'           THEN 'Garantia'
            WHEN 'servico_interno'    THEN 'Serviço Interno'
            WHEN 'conversao'          THEN 'Conversão Estoque'
            WHEN 'conversao_sku'      THEN 'Conversão SKU'
            ELSE '—'
        END AS tipo_ordem,
    o.setor_atual AS setor_id,
    s.nome AS setor_nome,
    o.local_atual AS deposito_id,
    d.nome AS deposito_nome,
    o.vendedor_id,
    v.nome AS vendedor_nome,
    o.cliente_id,
    c.nome AS cliente_nome,
    o.peso_metal_negociado,
    o.peso_metal_externo,
    o.data_entrega,
    o.data_conclusao,
    o.distribuicao_id,
    o.protocolo_loja,
    o.id_asana,
    o.detalhes_ordem,
    o.created_at AS date_created,
    o.updated_at AS date_updated,
    o.foto_peca_servico,
    o.peso_peca_servico,
    o.video_observacao,
    p.id AS pcp_id,
    p.etapas::text AS pcp_etapas_cod,
        CASE p.etapas::text
            WHEN 'novas_ordens' THEN 'Novas Ordens'
            WHEN 'pendencia'    THEN 'Pendência'
            WHEN 'aguardando'   THEN 'Aguardando'
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            WHEN 'cancelado'    THEN 'Cancelado'
            ELSE '—'
        END AS pcp_etapas,
    p.total_metal AS pcp_total_metal,
    p.retorno_metal AS pcp_retorno_metal,
    p.total_pedras_un AS pcp_total_pedras_un,
    p.total_pedras_g AS pcp_total_pedras_g,
    p.total_geral_outros_pesos AS pcp_total_outros,
    p.pmc AS pcp_pmc,
    p.quebra AS pcp_quebra,
    p.porcentagem_de_quebra AS pcp_quebra_pct,
    p.peso_final AS pcp_peso_final,
    p.metal_externo AS pcp_metal_externo,
    p.bloqueado AS pcp_bloqueado,
    p.data_conclusao AS pcp_data_conclusao,
    p.local_atual AS pcp_local_atual,
    COALESCE(NULLIF(TRIM(BOTH FROM up.name), ''::text), (au.email)::text, 'Sem operador'::text) AS pcp_operador_nome,
    dist.id AS dist_id,
    dist.setor::text AS dist_setor,
    dist.etapas::text AS dist_etapas_cod,
        CASE dist.etapas::text
            WHEN 'em_andamento' THEN 'Em Andamento'
            WHEN 'concluido'    THEN 'Concluído'
            ELSE NULL::text
        END AS dist_etapas,
    dist.pmc AS dist_pmc,
    dist.quebra AS dist_quebra,
    dist.porcentagem_de_quebra AS dist_quebra_pct
FROM alissonerp.ordens o
LEFT JOIN alissonerp.setores s ON s.id = o.setor_atual
LEFT JOIN alissonerp.depositos d ON d.id = o.local_atual
LEFT JOIN vendedores v ON v.id_vendedor = o.vendedor_id
LEFT JOIN contatos c ON c.id_contato = o.cliente_id
LEFT JOIN alissonerp.pcp p ON p.ordem_id = o.id
LEFT JOIN auth.users au ON au.id = p.operador
LEFT JOIN user_profiles up ON up.id_user = au.id
LEFT JOIN alissonerp.distribuicoes dist ON dist.id = o.distribuicao_id;

-- ════════════════════════════════════════════════════════════
-- 9. PARÂMETRO DE SISTEMA: insumo padrão para sobra SKU
-- ════════════════════════════════════════════════════════════
SET search_path TO alissonerp;

INSERT INTO alissonerp.parametros_sistema (chave, valor, tipo, descricao)
SELECT 'INSUMO_SOBRA_CONVERSAO_SKU', '1', 'number', 'ID do insumo (metal) usado como destino da sobra nas conversões SKU. Default: 1 = Ouro 18k Amarelo.'
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.parametros_sistema WHERE chave = 'INSUMO_SOBRA_CONVERSAO_SKU'
);

-- ════════════════════════════════════════════════════════════
-- 10. GRANTS
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON alissonerp.conversoes_sku TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.conversoes_sku_id_seq TO authenticated;

GRANT SELECT ON alissonerp.vw_ordens_completa   TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordens_por_tipo    TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordem_detalhe      TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordens_prontas_ida  TO authenticated, anon;
GRANT SELECT ON alissonerp.vw_ordens_prontas_volta TO authenticated, anon;
