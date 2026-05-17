-- Migration 245: Corrige descrição da tarefa de aprovação de conversão
-- A trigger fn_processar_conversao() dispara AFTER INSERT em conversoes_estoque,
-- mas os itens (conversao_itens) ainda não foram inseridos nesse momento,
-- fazendo com que os produtos apareçam como "N/D" na descrição da tarefa.
--
-- Solução: trigger AFTER INSERT em conversao_itens que atualiza a descrição
-- da tarefa com a lista real de produtos.

CREATE OR REPLACE FUNCTION alissonerp.fn_atualizar_descricao_tarefa_conversao()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_conversao   RECORD;
  v_ordem       RECORD;
  v_produtos    TEXT;
  v_tarefa_id   INTEGER;
BEGIN
  SELECT ce.*, o.numero_ordem, o.created_by INTO v_conversao
  FROM alissonerp.conversoes_estoque ce
  JOIN alissonerp.ordens o ON o.id = ce.ordem_id
  WHERE ce.id = NEW.conversao_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT string_agg(
    '• ' || p.nome || ' (SKU: ' || COALESCE(p.sku, 'N/D') || ')' || E'\n' ||
    '  Quantidade: ' || ci.quantidade || ' un × ' || ci.peso_individual || 'g = ' ||
    (ci.quantidade * ci.peso_individual)::numeric(10,3) || 'g',
    E'\n'
  ) INTO v_produtos
  FROM alissonerp.conversao_itens ci
  JOIN public.produtos p ON p.id_produto = ci.produto_id
  WHERE ci.conversao_id = NEW.conversao_id;

  v_tarefa_id := v_conversao.tarefa_aprovacao_id;
  IF v_tarefa_id IS NULL THEN RETURN NEW; END IF;

  UPDATE alissonerp.tarefas
  SET descricao =
    '📦 **Conversão de Estoque Comercial para Metal**' || E'\n\n' ||
    '**Ordem:** ' || v_conversao.numero_ordem || E'\n' ||
    '**Peso Total:** ' || v_conversao.peso_total || 'g' || E'\n' ||
    '**Quantidade Total:** ' || v_conversao.quantidade_total || ' peças' || E'\n\n' ||
    '**Produtos:**' || E'\n' || COALESCE(v_produtos, 'N/D') || E'\n\n' ||
    '🔴 **Aprovação necessária para liberar para protocolo.**' || E'\n' ||
    '✅ **Aprovar** → libera para protocolo de ida' || E'\n' ||
    '❌ **Rejeitar** → produtos retornam ao estoque',
    updated_at = NOW()
  WHERE id = v_tarefa_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_atualizar_tarefa_conversao ON alissonerp.conversao_itens;
CREATE TRIGGER trg_atualizar_tarefa_conversao
  AFTER INSERT ON alissonerp.conversao_itens
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_atualizar_descricao_tarefa_conversao();
