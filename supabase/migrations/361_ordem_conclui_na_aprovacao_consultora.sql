-- ============================================================
-- 361 — Aprovação da consultora ENCERRA o fluxo da ordem
--
-- O QUE: quando a consultora aprova (aprovacoes_consultora.etapas='aprovado'),
--        a preparação de entrega já nasce CONCLUÍDA e a ordem já vira
--        status='concluido' no mesmo instante.
--
-- POR QUE: a "Preparação de Entrega" (tela /entrega) era um passo manual que
--        ninguém executava — a ordem ficava "em andamento" para sempre depois
--        de a consultora já ter aprovado a peça. 480 preparações pendentes e
--        48 ordens presas nesse passo (levantamento 23/07/2026). O aceite da
--        consultora é, na prática, o fim do fluxo da ordem.
--
-- IMPACTO SE REMOVIDO/REVERTIDO: as ordens voltam a parar no passo 8 e o funil
--        volta a entulhar. NÃO mexe em estoque: a entrada da peça no estoque
--        comercial acontece no PROTOCOLO DE VOLTA (fn_reposicao_entrada_estoque),
--        antes da aprovação da consultora. Nenhum gatilho dispara com
--        ordens.status='concluido' (conferido em 23/07/2026: os gatilhos de
--        ordens são fn_audit_log, fn_auto_auditoria_loja, fn_cancelar_pcp_ordem
--        e fn_proteger_campos_pdv — nenhum reage a status='concluido').
-- ============================================================

-- ─── PARTE 1 — Gatilho: aprovação da consultora conclui a ordem ───

CREATE OR REPLACE FUNCTION alissonerp.fn_aprovacao_para_entrega()
RETURNS TRIGGER AS $$
BEGIN
  -- Guard: só ao aprovar, e só na TRANSIÇÃO para aprovado (evita re-disparo)
  IF NEW.etapas != 'aprovado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.etapas = 'aprovado' THEN RETURN NEW; END IF;

  -- O QUE: a preparação de entrega nasce JÁ CONCLUÍDA.
  -- POR QUE: o registro continua existindo (histórico + tela /entrega + passo 8
  --   da vw_timeline_ordem), mas não é mais uma pendência a ser trabalhada.
  -- IMPACTO SE ALTERADO: voltar 'concluido' para 'pendente' reintroduz o passo
  --   manual e as ordens param de concluir sozinhas.
  INSERT INTO alissonerp.preparacoes_entrega (etapas, ordem_id, updated_at)
  VALUES ('concluido', NEW.ordem_id, now());

  -- O QUE: encerra a ordem no mesmo instante da aprovação.
  -- POR QUE: aceite da consultora = fim do fluxo (regra nova, 23/07/2026).
  -- IMPACTO SE REMOVIDO: a ordem fica "em andamento" mesmo com todos os passos
  --   da timeline verdes — que é exatamente o bug que esta migration corrige.
  -- BLINDAGEM: ordem CANCELADA nunca é ressuscitada; data_conclusao usa
  --   COALESCE para não sobrescrever um carimbo anterior.
  UPDATE alissonerp.ordens
  SET status         = 'concluido',
      data_conclusao = COALESCE(data_conclusao, now()),
      updated_at     = now()
  WHERE id = NEW.ordem_id
    AND status <> 'cancelado'
    AND status <> 'concluido';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION alissonerp.fn_aprovacao_para_entrega IS
  'Flow 06 (migration 361): aprovacoes_consultora->aprovado cria preparacoes_entrega JA CONCLUIDA e encerra a ordem (status=concluido). Antes criava pendente e a ordem so fechava na tela /entrega.';

-- ─── PARTE 2 — Retroativo: limpar o acúmulo do passo antigo ───

-- O QUE: fecha toda preparação de entrega que ficou pendente.
-- POR QUE: 480 registros parados na tela /entrega — 431 deles de ordens que já
--   estavam concluídas por outro caminho (conclusão forçada pelo admin).
-- IMPACTO: nenhuma movimentação de estoque/financeiro; é status administrativo.
UPDATE alissonerp.preparacoes_entrega
SET etapas     = 'concluido',
    updated_at = now()
WHERE etapas <> 'concluido';

-- O QUE: conclui as ordens que já tinham aprovação da consultora e ficaram
--   presas em andamento (48 na data desta migration).
-- POR QUE: pela regra nova elas já estariam concluídas desde a aprovação.
-- BLINDAGEM: só ordens com aprovação REALMENTE aprovada; canceladas ficam de
--   fora; data_conclusao herda a data da aprovação (não inventa "hoje" para
--   ordem aprovada meses atrás).
UPDATE alissonerp.ordens o
SET status         = 'concluido',
    data_conclusao = COALESCE(o.data_conclusao, ac.updated_at, now()),
    updated_at     = now()
FROM (
  SELECT ordem_id, max(updated_at) AS updated_at
  FROM alissonerp.aprovacoes_consultora
  WHERE etapas = 'aprovado'
  GROUP BY ordem_id
) ac
WHERE ac.ordem_id = o.id
  AND o.status NOT IN ('concluido', 'cancelado');
