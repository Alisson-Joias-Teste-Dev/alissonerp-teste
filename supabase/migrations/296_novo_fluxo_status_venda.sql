-- ============================================================
-- Migration 296 — Novo fluxo de status da venda (2026-06-11)
--
-- REGRA DE NEGÓCIO:
-- O QUE: simplifica a máquina de estados da venda para
--   rascunho → aprovado → em_rota → entregue (+cancelado).
--   'concluido' e 'enviado' deixam de existir para vendas NOVAS:
--   nenhum estado pode mais transicionar PARA eles. Vendas antigas
--   que já estão nesses status ficam intocadas (histórico) e ainda
--   podem sair deles (ex.: enviado → entregue).
-- POR QUE: decisão do Jonathan (plano 11/06/2026 +
--   docs/analise-vendas-entregas-2026-06.md): o fim natural da venda
--   é a ENTREGA, não a "conclusão". O status concluido duplicava o
--   significado de entregue e gerava divergência entre telas.
-- IMPACTO SE REMOVIDO: vendas novas voltam a poder virar 'concluido'/
--   'enviado', quebrando relatórios e o fluxo de pagamento na entrega
--   (Etapas 3 e 4 da refatoração dependem deste fluxo).
--
-- Funções alteradas (CREATE OR REPLACE, sem DROP — Database Safety §2):
--   1. fn_registrar_transicao_venda  (versões anteriores: 267 → 290)
--   2. fn_venda_gerar_conta_receber  (versão anterior: 113)
--   3. fn_proteger_itens_venda_fechada (versão anterior: 114)
--
-- Views: vw_dash_vendas_todas JÁ inclui 'em_rota' desde a migration
--   290 (linhas 92/99/107/133/146 daquele arquivo) — sem alteração aqui.
-- ============================================================

SET search_path TO alissonerp, directus, public;

-- ──────────────────────────────────────────────────────────────
-- 1. State Machine: fn_registrar_transicao_venda
-- ──────────────────────────────────────────────────────────────
-- Novo fluxo:
--   rascunho → aprovado | cancelado
--   aprovado → em_rota | entregue | cancelado
--     (aprovado → entregue direto = caso Correios: registrar o
--      rastreio marca a venda como entregue, sem integração)
--   em_rota  → entregue | cancelado
--   entregue / cancelado = TERMINAIS (correção só via
--      solicitacoes_alteracao, nunca editando a venda)
--
-- Estados HISTÓRICOS ('confirmado', 'enviado', 'concluido'):
--   aceitos como estado ATUAL (vendas antigas), podem SAIR para o
--   fluxo novo, mas NENHUMA transição nova chega PARA eles.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_registrar_transicao_venda()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_de   VARCHAR(30) := OLD.situacao;
  v_para VARCHAR(30) := NEW.situacao;
  v_ok   BOOLEAN;
BEGIN
  -- Nao faz nada se situacao nao mudou
  IF v_de IS NOT DISTINCT FROM v_para THEN
    RETURN NEW;
  END IF;

  IF v_de IS NULL THEN
    -- Venda sem situacao anterior: só pode entrar no fluxo novo.
    -- 'confirmado' removido daqui (era aceito até a 290) — nenhuma
    -- transição nova PARA estado histórico.
    v_ok := v_para = ANY(ARRAY['rascunho','aprovado','cancelado']);
  ELSIF v_de = 'rascunho' THEN
    v_ok := v_para = ANY(ARRAY['aprovado','cancelado']);
  ELSIF v_de = 'aprovado' THEN
    -- em_rota = motoboy retirou (Código B). entregue direto = Correios.
    v_ok := v_para = ANY(ARRAY['em_rota','entregue','cancelado']);
  ELSIF v_de = 'em_rota' THEN
    v_ok := v_para = ANY(ARRAY['entregue','cancelado']);
  ELSIF v_de = 'confirmado' THEN
    -- Histórico: pode migrar para o fluxo novo, nunca para outro histórico
    v_ok := v_para = ANY(ARRAY['aprovado','em_rota','entregue','cancelado']);
  ELSIF v_de = 'enviado' THEN
    -- Histórico: venda que já estava em trânsito só pode terminar
    v_ok := v_para = ANY(ARRAY['entregue','cancelado']);
  ELSIF v_de IN ('entregue','concluido','cancelado') THEN
    -- Terminais ('concluido' = terminal histórico)
    v_ok := false;
  ELSE
    -- Estados desconhecidos: permissivo para compatibilidade futura
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Transição inválida: % → %', COALESCE(v_de, 'NULL'), v_para;
  END IF;

  -- Auditoria de transição (mesma assinatura da 290)
  INSERT INTO alissonerp.vendas_transicoes
    (venda_id, de_situacao, para_situacao, created_at)
  VALUES (NEW.id, v_de, v_para, now());

  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. fn_venda_gerar_conta_receber
-- ──────────────────────────────────────────────────────────────
-- O QUE: passa a disparar também quando a venda vira 'entregue'.
-- POR QUE: no fluxo novo a venda nunca mais vira 'concluido', então
--   sem isso vendas novas NUNCA gerariam conta a receber.
--   'confirmado'/'concluido' mantidos por compatibilidade com vendas
--   antigas que ainda transitem por eles.
-- IMPACTO SE REMOVIDO: vendas entregues sem conta a receber =
--   financeiro às cegas.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_gerar_conta_receber()
RETURNS TRIGGER AS $$
DECLARE
  v_cliente_nome TEXT;
  v_existe BOOLEAN;
BEGIN
  -- Só executa se situação mudou para entregue (fluxo novo) ou
  -- confirmado/concluido (compat com vendas antigas)
  IF NEW.situacao NOT IN ('confirmado', 'concluido', 'entregue') THEN
    RETURN NEW;
  END IF;

  -- Não reprocessar se já estava em um estado que gera CR
  IF OLD.situacao IN ('confirmado', 'concluido', 'entregue') THEN
    RETURN NEW;
  END IF;

  -- Guard duplicata: 1 conta a receber por venda
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber WHERE venda_erp_id = NEW.id
  ) INTO v_existe;

  IF v_existe THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_cliente_nome
  FROM public.contatos WHERE id_contato = NEW.cliente_id;

  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(NEW.numero_venda, '#' || NEW.id),
    NEW.cliente_id,
    v_cliente_nome,
    NEW.id,
    NEW.total_venda,
    COALESCE(NEW.data_entrega, CURRENT_DATE + interval '30 days'),
    'pendente',
    'venda',
    NEW.created_by
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- 3. fn_proteger_itens_venda_fechada
-- ──────────────────────────────────────────────────────────────
-- O QUE: inclui 'entregue' na lista de vendas fechadas (itens imutáveis).
-- POR QUE: decisão do Jonathan — pós-aprovado nada é editável; entregue
--   é o fim do fluxo novo e precisa da mesma blindagem que concluido
--   tinha (protege comissões contra recálculo).
-- IMPACTO SE REMOVIDO: itens de vendas entregues poderiam ser alterados,
--   recalculando comissão de consultora depois do fato.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_proteger_itens_venda_fechada()
RETURNS TRIGGER AS $$
DECLARE
  v_situacao TEXT;
BEGIN
  SELECT situacao INTO v_situacao
  FROM alissonerp.vendas_erp
  WHERE id = COALESCE(NEW.venda_id, OLD.venda_id);

  -- Vendas fechadas (incl. 'entregue' no fluxo novo): BLOQUEAR itens
  IF v_situacao IN ('confirmado', 'concluido', 'entregue') THEN
    RAISE EXCEPTION 'Venda fechada (%). Itens não podem ser alterados. Solicite revisão ao gerente.', v_situacao
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────────
-- Grants (re-aplicados por segurança; CREATE OR REPLACE preserva,
-- mas migrations anteriores sempre re-grantam)
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION alissonerp.fn_registrar_transicao_venda()    TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_venda_gerar_conta_receber()    TO authenticated;
GRANT EXECUTE ON FUNCTION alissonerp.fn_proteger_itens_venda_fechada() TO authenticated;

-- ============================================================
-- Fim migration 296
-- ============================================================
