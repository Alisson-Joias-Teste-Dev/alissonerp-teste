-- ============================================================
-- Migration 297 — Trava de status (state machine) + baixa automática
--   da conta a receber no pagamento (2026-06-11)
--
-- Duas mudanças decididas pelo Jonathan (11/06/2026):
--
-- 1) TRAVA DE STATUS (rede de segurança no banco)
--    O QUE: liga de fato a máquina de estados da venda — cria a tabela de
--      histórico `vendas_transicoes` e o gatilho que valida cada troca de
--      situacao em alissonerp.vendas_erp.
--    POR QUE: o código (SITUACOES_VALIDAS no PATCH) já valida, mas a trava no
--      banco é a 2ª camada: barra transição inválida mesmo se vier de UPDATE
--      direto no banco ou de código novo com bug. A migration 178 criou a
--      função mas o gatilho/tabela NUNCA foram aplicados em produção (a função
--      ficava inerte). Aqui aplicamos de verdade.
--    IMPACTO SE REMOVIDO: volta a confiar só no código; bagunça de status
--      (ex.: editar venda cancelada, pular rascunho→entregue) deixa de ser
--      barrada pelo banco.
--
-- 2) BAIXA AUTOMÁTICA NO PAGAMENTO
--    O QUE: quando os pagamentos confirmados cobrem o total da venda, cria a
--      conta a receber JÁ QUITADA ('pago'), na hora, SEM mexer no status da
--      venda (ela segue 'aprovado' até a entrega).
--    POR QUE: decisão do Jonathan — "pago na venda já baixa". No fluxo novo a
--      venda não vira mais 'concluido' no pagamento, então sem isso o dinheiro
--      pago não apareceria em contas_receber até a entrega.
--    IMPACTO SE REMOVIDO: venda paga antes de entregar fica sem recebido no
--      financeiro até a entrega.
--
-- Database Safety §2: CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE, nenhuma
-- coluna removida. Reversível (basta dropar os 2 gatilhos novos).
-- ============================================================

SET search_path TO alissonerp, directus, public;

-- ──────────────────────────────────────────────────────────────
-- PARTE 1 — Trava de status
-- ──────────────────────────────────────────────────────────────

-- Tabela de auditoria de transições (originalmente migration 178, nunca aplicada)
CREATE TABLE IF NOT EXISTS alissonerp.vendas_transicoes (
  id            BIGSERIAL PRIMARY KEY,
  venda_id      BIGINT NOT NULL REFERENCES alissonerp.vendas_erp(id) ON DELETE CASCADE,
  de_situacao   VARCHAR(30),
  para_situacao VARCHAR(30) NOT NULL,
  usuario_id    UUID,
  motivo        TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_transicoes_venda_id
  ON alissonerp.vendas_transicoes(venda_id);

GRANT SELECT, INSERT ON alissonerp.vendas_transicoes TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.vendas_transicoes_id_seq TO authenticated;

-- Máquina de estados — SUPERSEDE a versão da migration 296.
-- Transições PERMITIDAS (mapeadas a partir do que o código realmente faz):
--   rascunho  → aprovado, cancelado, concluido(rota legado)
--   aprovado  → em_rota, entregue, cancelado, rascunho(estorno), concluido(legado)
--   em_rota   → entregue, cancelado, rascunho(estorno)
--   confirmado(hist) → aprovado, em_rota, entregue, cancelado, rascunho, concluido
--   enviado(hist)    → entregue, cancelado, rascunho, concluido
--   entregue  → cancelado, concluido   (NÃO volta pra rascunho — ponto final)
--   concluido → cancelado              (só cancelamento; terminal histórico)
--   cancelado → (nada — terminal)
-- 'concluido'/'enviado' continuam ACEITOS como destino só para compat com a
-- rota legado e vendas históricas; o código (SITUACOES_VALIDAS) é quem impede
-- venda NOVA de virar concluido/enviado.
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
  -- Não faz nada se a situacao não mudou
  IF v_de IS NOT DISTINCT FROM v_para THEN
    RETURN NEW;
  END IF;

  IF v_de IS NULL THEN
    -- Linha sem situacao anterior: permissivo (o gatilho é só de UPDATE)
    v_ok := true;
  ELSIF v_de = 'rascunho' THEN
    v_ok := v_para = ANY(ARRAY['aprovado','cancelado','concluido']);
  ELSIF v_de = 'aprovado' THEN
    -- rascunho = estorno volta a venda; concluido = rota legado
    v_ok := v_para = ANY(ARRAY['em_rota','entregue','cancelado','rascunho','concluido']);
  ELSIF v_de = 'em_rota' THEN
    v_ok := v_para = ANY(ARRAY['entregue','cancelado','rascunho']);
  ELSIF v_de = 'confirmado' THEN
    -- histórico: pode migrar pro fluxo novo (e estorno)
    v_ok := v_para = ANY(ARRAY['aprovado','em_rota','entregue','cancelado','rascunho','concluido']);
  ELSIF v_de = 'enviado' THEN
    -- histórico: venda já em trânsito só termina (ou estorno/cancelamento)
    v_ok := v_para = ANY(ARRAY['entregue','cancelado','rascunho','concluido']);
  ELSIF v_de = 'entregue' THEN
    -- PONTO FINAL: não volta pra rascunho. Só cancelamento (correção) ou
    -- conclusão histórica.
    v_ok := v_para = ANY(ARRAY['cancelado','concluido']);
  ELSIF v_de = 'concluido' THEN
    -- terminal histórico: só cancelamento
    v_ok := v_para = ANY(ARRAY['cancelado']);
  ELSIF v_de = 'cancelado' THEN
    -- terminal: nada sai daqui
    v_ok := false;
  ELSE
    -- estados desconhecidos: permissivo (compat futura)
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'TRANSICAO_INVALIDA: % → % (venda %)', COALESCE(v_de,'NULL'), v_para, NEW.id;
  END IF;

  -- Registra a transição (histórico de_para). usuario_id fica NULL: o backend
  -- usa postgres npm (sem auth.uid()), e QUEM alterou já é gravado por logAudit
  -- nas rotas. Esta tabela serve ao histórico de fluxo da venda.
  INSERT INTO alissonerp.vendas_transicoes
    (venda_id, de_situacao, para_situacao, payload, created_at)
  VALUES (
    NEW.id, v_de, v_para,
    jsonb_build_object('total_venda', NEW.total_venda, 'cliente_id', NEW.cliente_id),
    now()
  );

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION alissonerp.fn_registrar_transicao_venda() TO authenticated;

-- Liga o gatilho (BEFORE UPDATE OF situacao = valida ANTES de gravar).
-- Idempotente: DROP IF EXISTS + CREATE.
DROP TRIGGER IF EXISTS trg_registrar_transicao_venda ON alissonerp.vendas_erp;
CREATE TRIGGER trg_registrar_transicao_venda
  BEFORE UPDATE OF situacao ON alissonerp.vendas_erp
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_registrar_transicao_venda();

-- ──────────────────────────────────────────────────────────────
-- PARTE 2 — Baixa automática da conta a receber no pagamento
-- ──────────────────────────────────────────────────────────────
-- Gatilho em pagamentos_venda: sempre que um pagamento fica 'confirmado',
-- verifica se a soma dos confirmados cobre o total da venda. Se cobrir, e a
-- venda já estiver aprovada (não rascunho/cancelado), e ainda não houver conta
-- a receber ativa, cria a CR JÁ COMO 'pago'. Status da venda NÃO muda.
--
-- Por ser gatilho no banco, funciona em TODAS as formas de pagamento (MP,
-- PagBank, crediário, dinheiro/pix manual) sem o código precisar chamar nada.
--
-- Guarda contra duplicata: ignora se já existe CR não-cancelada pra venda
-- (a CR criada aqui também impede o trigger de entrega 296 de criar outra,
-- pois aquele checa EXISTS por venda_erp_id).
CREATE OR REPLACE FUNCTION alissonerp.fn_venda_baixar_recebimento_pago()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_venda        RECORD;
  v_soma         NUMERIC;
  v_existe       BOOLEAN;
  v_cliente_nome TEXT;
BEGIN
  -- Só interessa pagamento que ficou confirmado
  IF NEW.status <> 'confirmado' THEN
    RETURN NEW;
  END IF;

  SELECT id, situacao, total_venda, cliente_id, numero_venda, data_entrega, created_by
    INTO v_venda
    FROM alissonerp.vendas_erp
   WHERE id = NEW.venda_id;
  IF v_venda IS NULL THEN
    RETURN NEW;
  END IF;

  -- Só baixa de venda aprovada em diante (rascunho/cancelado não geram recebido)
  IF v_venda.situacao IN ('rascunho', 'cancelado') THEN
    RETURN NEW;
  END IF;

  -- Já tem conta a receber ativa? Não duplica (CR cancelada não conta).
  SELECT EXISTS(
    SELECT 1 FROM alissonerp.contas_receber
    WHERE venda_erp_id = NEW.venda_id AND situacao <> 'cancelado'
  ) INTO v_existe;
  IF v_existe THEN
    RETURN NEW;
  END IF;

  -- Soma dos pagamentos confirmados da venda
  SELECT COALESCE(SUM(valor), 0) INTO v_soma
    FROM alissonerp.pagamentos_venda
   WHERE venda_id = NEW.venda_id AND status = 'confirmado';

  -- Ainda não quitou (tolerância de 1 centavo) → não baixa
  IF v_soma + 0.01 < v_venda.total_venda THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_cliente_nome
    FROM public.contatos WHERE id_contato = v_venda.cliente_id;

  -- Cria a conta a receber JÁ QUITADA
  INSERT INTO alissonerp.contas_receber (
    descricao, cliente_id, cliente_nome, venda_erp_id, valor,
    data_vencimento, data_recebimento, situacao, categoria, created_by
  ) VALUES (
    'Venda ' || COALESCE(v_venda.numero_venda, '#' || v_venda.id),
    v_venda.cliente_id,
    v_cliente_nome,
    v_venda.id,
    v_venda.total_venda,
    COALESCE(v_venda.data_entrega, CURRENT_DATE),
    CURRENT_DATE,
    'pago',
    'venda',
    v_venda.created_by
  );

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION alissonerp.fn_venda_baixar_recebimento_pago() TO authenticated;

DROP TRIGGER IF EXISTS trg_venda_baixar_recebimento_pago ON alissonerp.pagamentos_venda;
CREATE TRIGGER trg_venda_baixar_recebimento_pago
  AFTER INSERT OR UPDATE OF status ON alissonerp.pagamentos_venda
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_venda_baixar_recebimento_pago();

-- ──────────────────────────────────────────────────────────────
-- PARTE 3 — Desligar a "ponte de volta" public.vendas → vendas_erp
-- ──────────────────────────────────────────────────────────────
-- O QUE: remove os 2 gatilhos que faziam public.vendas (sistema antigo
--   Evolury) ESCREVER de volta em alissonerp.vendas_erp.
-- POR QUE: decisão do Jonathan (11/06/2026) — alissonerp.vendas_erp é a ÚNICA
--   fonte de verdade; o schema public NÃO deve espelhar de volta no sistema.
--   Além disso, esses gatilhos causavam um bug no fluxo novo: ao marcar uma
--   venda como 'entregue', o espelhamento ida-e-volta a transformava sozinha
--   em 'concluido' (em public.vendas, 'entregue' e 'concluido' usam o MESMO
--   código de status — 2 — e a volta escolhia 'concluido'). Sem isso, a venda
--   nunca ficava 'entregue'. O Evolury é SÓ HISTÓRICO (não cria/edita venda
--   nova neste banco), então essa ponte de volta é peso morto.
-- O QUE CONTINUA: o espelhamento de IDA (vendas_erp → public.vendas) permanece,
--   mantendo public.vendas como cópia só-leitura do ERP para relatórios legados.
-- IMPACTO SE REMOVIDO (este DROP): volta o bug — 'entregue' vira 'concluido'
--   sozinho e o fluxo novo não funciona.
DROP TRIGGER IF EXISTS trg_sync_venda_insert_from_public ON public.vendas;
DROP TRIGGER IF EXISTS trg_sync_venda_update_from_public ON public.vendas;

-- ============================================================
-- Fim migration 297
-- ============================================================
