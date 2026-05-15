-- ============================================================
-- MIGRATION 242: CONVERSÃO DE ESTOQUE COMERCIAL → METAL
-- Fluxo: reserva → aprovação (tarefas) → protocolo ida → conclusão
-- ============================================================

SET search_path TO alissonerp;

-- ════════════════════════════════════════════════════════════
-- 1. ADICIONAR 'conversao' AO ENUM enum_tipo_ordem
-- ════════════════════════════════════════════════════════════
ALTER TYPE alissonerp.enum_tipo_ordem ADD VALUE IF NOT EXISTS 'conversao';

-- ════════════════════════════════════════════════════════════
-- 2. TABELA: conversoes_estoque (cabeçalho)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.conversoes_estoque (
  id                SERIAL PRIMARY KEY,
  ordem_id          INTEGER NOT NULL REFERENCES alissonerp.ordens(id),
  peso_total        NUMERIC(10,3) NOT NULL,
  quantidade_total  INTEGER NOT NULL,
  foto_abertura     TEXT,
  insumo_destino    INTEGER DEFAULT 1,
  status_conversao  VARCHAR(20) NOT NULL DEFAULT 'pendente'
                    CHECK (status_conversao IN ('pendente','aprovado','recusado','em_rota','concluido')),
  tarefa_aprovacao_id INTEGER REFERENCES alissonerp.tarefas(id),
  aprovado_por      UUID REFERENCES auth.users(id),
  aprovado_em       TIMESTAMPTZ,
  recusado_por      UUID REFERENCES auth.users(id),
  recusado_em       TIMESTAMPTZ,
  foto_recusa       TEXT,
  motivo_recusa     TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversoes_ordem ON alissonerp.conversoes_estoque(ordem_id);
CREATE INDEX IF NOT EXISTS idx_conversoes_status ON alissonerp.conversoes_estoque(status_conversao);

-- ════════════════════════════════════════════════════════════
-- 3. TABELA: conversao_itens (detalhe por produto + rastro)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS alissonerp.conversao_itens (
  id                    SERIAL PRIMARY KEY,
  conversao_id          INTEGER NOT NULL REFERENCES alissonerp.conversoes_estoque(id) ON DELETE CASCADE,
  produto_id            BIGINT NOT NULL REFERENCES public.produtos(id_produto),
  peso_individual       NUMERIC(10,3) NOT NULL,
  quantidade            INTEGER NOT NULL,
  movimento_reserva_id  BIGINT REFERENCES alissonerp.movimentacoes_estoque_comercial(id),
  movimento_rota_id     BIGINT REFERENCES alissonerp.movimentacoes_estoque_comercial(id),
  movimento_baixa_id    BIGINT REFERENCES alissonerp.movimentacoes_estoque_comercial(id),
  peso_aceito           NUMERIC(10,3),
  foto_item             TEXT
);

CREATE INDEX IF NOT EXISTS idx_conversao_itens_conversao ON alissonerp.conversao_itens(conversao_id);
CREATE INDEX IF NOT EXISTS idx_conversao_itens_produto  ON alissonerp.conversao_itens(produto_id);

-- ════════════════════════════════════════════════════════════
-- 4. TRIGGER UPDATED_AT para conversoes_estoque
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION alissonerp.fn_updated_at_conversoes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_conversoes ON alissonerp.conversoes_estoque;
CREATE TRIGGER trg_updated_at_conversoes
  BEFORE UPDATE ON alissonerp.conversoes_estoque
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_updated_at_conversoes();

-- ════════════════════════════════════════════════════════════
-- 5. FUNÇÃO: fn_processar_conversao
-- Trigger AFTER INSERT em conversoes_estoque
-- Cria tarefa de aprovação para Alisson + log no histórico
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_conversao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ordem      RECORD;
  v_produtos   TEXT;
  v_tarefa_id  INTEGER;
BEGIN
  SELECT numero_ordem, created_by INTO v_ordem
  FROM alissonerp.ordens WHERE id = NEW.ordem_id;

  SELECT string_agg(
    p.nome || ' (SKU: ' || COALESCE(p.sku, 'N/D') || ') — ' ||
    ci.quantidade || ' un x ' || ci.peso_individual || 'g = ' ||
    (ci.quantidade * ci.peso_individual)::numeric(10,3) || 'g',
    E'\n'
  ) INTO v_produtos
  FROM alissonerp.conversao_itens ci
  JOIN public.produtos p ON p.id_produto = ci.produto_id
  WHERE ci.conversao_id = NEW.id;

  INSERT INTO alissonerp.tarefas (
    titulo, descricao, responsavel_id, criado_por,
    prioridade, status, tipo, ordem_id, tags
  ) VALUES (
    'Aprovação de Conversão de Estoque — Ordem ' || COALESCE(v_ordem.numero_ordem, '#' || NEW.ordem_id),
    '📦 **Conversão de Estoque Comercial para Metal**' || E'\n\n' ||
    '**Peso Total:** ' || NEW.peso_total || 'g' || E'\n' ||
    '**Quantidade Total:** ' || NEW.quantidade_total || ' peças' || E'\n\n' ||
    '**Produtos:**' || E'\n' || COALESCE(v_produtos, 'N/D') || E'\n\n' ||
    '🔴 **Aprovação necessária para liberar para protocolo.**' || E'\n' ||
    '✅ **Aprovar** → libera para protocolo de ida' || E'\n' ||
    '❌ **Rejeitar** → produtos retornam ao estoque',
    COALESCE(
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' AND email LIKE '%alisson%' LIMIT 1),
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' LIMIT 1)
    ),
    NEW.created_by,
    'alta',
    'aguardando_aprovacao',
    'conversao',
    NEW.ordem_id,
    ARRAY['conversao', 'estoque', 'aprovacao']
  )
  RETURNING id INTO v_tarefa_id;

  UPDATE alissonerp.conversoes_estoque
  SET tarefa_aprovacao_id = v_tarefa_id
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_criar_tarefa_conversao ON alissonerp.conversoes_estoque;
CREATE TRIGGER trg_criar_tarefa_conversao
  AFTER INSERT ON alissonerp.conversoes_estoque
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_conversao();

-- ════════════════════════════════════════════════════════════
-- 6. FUNÇÃO: fn_concluir_protocolo_conversao
-- Trigger AFTER UPDATE em protocolos (etapas='concluido')
-- Processa ordens de conversão: baixa EC + entrada metal
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_protocolo_conversao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ordem        RECORD;
  v_conversao    RECORD;
  v_item         RECORD;
  v_mov_saida    BIGINT;
  v_mov_baixa    BIGINT;
  v_par_saida    BIGINT;
  v_par_entrada  BIGINT;
  v_insumo_id    INTEGER;
BEGIN
  IF NEW.etapas::text != 'concluido' THEN
    RETURN NEW;
  END IF;

  FOR v_ordem IN
    SELECT o.id, o.numero_ordem
    FROM alissonerp.protocolo_ordens po
    JOIN alissonerp.ordens o ON o.id = po.ordem_id
    WHERE po.protocolo_id = NEW.id
      AND o.tipo_ordem::text = 'conversao'
  LOOP
    SELECT * INTO v_conversao
    FROM alissonerp.conversoes_estoque
    WHERE ordem_id = v_ordem.id
    LIMIT 1;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE alissonerp.conversoes_estoque
    SET status_conversao = 'concluido'
    WHERE id = v_conversao.id;

    FOR v_item IN
      SELECT * FROM alissonerp.conversao_itens
      WHERE conversao_id = v_conversao.id
    LOOP
      INSERT INTO alissonerp.movimentacoes_estoque_comercial
        (produto_id, tipo, quantidade, motivo, local_estoque_id, status, ordem_id, protocolo_id, observacao, created_by)
      VALUES
        (v_item.produto_id, 'saida', v_item.quantidade, 'virou_peso', 1, 'efetivado',
         v_conversao.ordem_id, NEW.id,
         'Conversão de estoque — virou peso (Ordem ' || v_ordem.numero_ordem || ')',
         NEW.recebedor_id)
      RETURNING id INTO v_mov_baixa;

      UPDATE alissonerp.conversao_itens
      SET movimento_baixa_id = v_mov_baixa
      WHERE id = v_item.id;
    END LOOP;

    v_insumo_id := COALESCE(v_conversao.insumo_destino, 1);

    SELECT * INTO v_par_saida, v_par_entrada
    FROM alissonerp.fn_criar_par_movimentacao(
      v_insumo_id,
      v_conversao.peso_total,
      1, 1, 1, 1,
      'entrada_compra'::alissonerp.enum_marcador_estoque,
      v_conversao.ordem_id,
      'Conversão de estoque comercial — entrada de ' || v_conversao.peso_total || 'g de metal (Ordem ' || v_ordem.numero_ordem || ')',
      1
    );

    UPDATE alissonerp.ordens
    SET status = 'concluido', data_conclusao = NOW(), updated_at = NOW()
    WHERE id = v_ordem.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_concluir_conversao ON alissonerp.protocolos;
CREATE TRIGGER trg_concluir_conversao
  AFTER UPDATE ON alissonerp.protocolos
  FOR EACH ROW WHEN (NEW.etapas::text = 'concluido' AND (OLD.etapas::text IS DISTINCT FROM 'concluido'))
  EXECUTE FUNCTION alissonerp.fn_concluir_protocolo_conversao();

-- ════════════════════════════════════════════════════════════
-- 7. ATUALIZAR vw_ordens_prontas_ida
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW alissonerp.vw_ordens_prontas_ida AS
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
ORDER BY id DESC;

-- ════════════════════════════════════════════════════════════
-- 8. ATUALIZAR VIEWS COM CASE 'conversao'
-- NOTA: usamos search_path default (public) para acessar vendedores, contatos, user_profiles
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
-- 9. PARÂMETRO DE SISTEMA: insumo padrão para conversão
-- ════════════════════════════════════════════════════════════
SET search_path TO alissonerp;

INSERT INTO alissonerp.parametros_sistema (chave, valor, tipo, descricao)
SELECT 'INSUMO_CONVERSAO_PADRAO', '1', 'number', 'ID do insumo (metal) usado como destino padrão nas conversões de estoque comercial. Default: 1 = Ouro 18k Amarelo.'
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.parametros_sistema WHERE chave = 'INSUMO_CONVERSAO_PADRAO'
);

-- ════════════════════════════════════════════════════════════
-- 10. GRANTS
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON alissonerp.conversoes_estoque TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.conversoes_estoque_id_seq TO authenticated;

GRANT SELECT, INSERT, UPDATE ON alissonerp.conversao_itens TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.conversao_itens_id_seq TO authenticated;

GRANT SELECT ON alissonerp.vw_ordens_completa TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordens_por_tipo  TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordem_detalhe    TO anon, authenticated;
GRANT SELECT ON alissonerp.vw_ordens_prontas_ida TO authenticated, anon;
