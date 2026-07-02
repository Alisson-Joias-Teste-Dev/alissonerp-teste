-- ============================================================
-- Migration 340 — Corrige o ENDEREÇAMENTO da aprovação de conversão
--
-- O QUÊ: as funções fn_processar_conversao (mig 242) e
--   fn_processar_conversao_sku (mig 253) mandavam a tarefa de aprovação
--   para "um admin cujo email contém 'alisson'" (um L só) e, se não
--   achasse, "o primeiro admin qualquer". O email real do Alisson tem
--   DOIS L ('allisson...') → o filtro não casava → a tarefa caía num
--   admin arbitrário (não no aprovador certo). Ex.: conversão C-2567.
-- POR QUÊ: a aprovação precisa chegar de forma CONFIÁVEL a quem manda,
--   não por adivinhação de email.
-- COMO: passa a resolver o aprovador por configuração central
--   (configuracoes_sistema.aprovador_conversao), com fallback tolerante
--   (ILIKE '%aliss%' pega 1 ou 2 L) e, por último, o primeiro admin ativo.
-- IMPACTO SE REMOVIDO: aprovação de conversão volta a se perder.
--   Só recria funções (CREATE OR REPLACE — nunca DROP). Fora das zonas
--   no-touch (fn_processar_conversao* não está na lista do CLAUDE.md §2).
-- ============================================================

-- ── Conversão de estoque (metal) ──────────────────────────────
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
    -- APROVADOR (v2.83.1): configuração central > fallback tolerante > 1º admin
    COALESCE(
      (SELECT NULLIF(trim(both '"' from valor), '')::uuid
         FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_conversao' LIMIT 1),
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' AND email ILIKE '%aliss%' AND ativo = true LIMIT 1),
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' AND ativo = true LIMIT 1)
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

-- ── Conversão de SKU ──────────────────────────────────────────
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
    -- APROVADOR (v2.83.1): configuração central > fallback tolerante > 1º admin
    COALESCE(
      (SELECT NULLIF(trim(both '"' from valor), '')::uuid
         FROM alissonerp.configuracoes_sistema WHERE chave = 'aprovador_conversao' LIMIT 1),
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' AND email ILIKE '%aliss%' AND ativo = true LIMIT 1),
      (SELECT id FROM alissonerp.usuarios WHERE role = 'admin' AND ativo = true LIMIT 1)
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
