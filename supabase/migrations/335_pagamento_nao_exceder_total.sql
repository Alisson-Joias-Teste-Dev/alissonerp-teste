-- ============================================================
-- Migration 335 — Trava: pagamento não pode exceder o total da venda (2026-06-23)
--
-- REGRA DE NEGÓCIO (ver docs/regras-negocio/crediario.md + skill /crediario):
--   O QUE: a soma das linhas de pagamento de uma venda (pagamentos_venda) NUNCA
--     pode passar do total_venda. "A Receber" — confirmado OU pendente — É forma
--     de pagamento e OCUPA valor; não é "vazio" enquanto está pendente.
--   POR QUE: bug real (venda 15343 / id 29855) — a venda tinha "A Receber R$ 400"
--     (= total) e mesmo assim nasceu uma 2ª linha "Cartão Point R$ 400" → soma
--     R$ 800 numa venda de R$ 400. Quando o A Receber foi baixado, a linha do
--     cartão ficou pendente e a venda nunca conclui ("Pagamento pendente" eterno).
--     A causa raiz: vários dos 13 caminhos que inserem pagamento olham só a soma
--     CONFIRMADA (ex.: criar-intent-point), então o A Receber pendente era tratado
--     como zero e liberava criar outra linha por cima.
--   ONDE: 13 caminhos inserem em pagamentos_venda. Em vez de repetir a checagem em
--     cada um (e arriscar esquecer num futuro), a regra fica num ÚNICO ponto — este
--     trigger no banco. As camadas de front (esconder botão) e back (traduzir o
--     erro) só REAGEM; não recalculam a regra. Fonte de verdade = aqui.
--   IMPACTO SE REMOVIDO: volta o risco de soma de pagamentos > total → venda que
--     não conclui / recebimento fantasma.
--
--   Comparação: bloqueia quando (soma das OUTRAS linhas) + NOVO.valor > total_venda
--     (tolerância de 1 centavo p/ arredondamento). Deixa PREENCHER EXATO (==), só
--     barra o que EXCEDE — então pagamento parcial (split do restante) continua ok.
--   Borda: total_venda = 0 ou NULL (rascunho em montagem, sem itens) → trava
--     DESLIGADA (ainda não há teto definido).
--   NÃO retroage: trigger BEFORE INSERT/UPDATE OF valor — vendas já com soma > total
--     (como a 15343 hoje) não são afetadas; a limpeza dessas é DELETE da linha extra
--     (DELETE não dispara este trigger).
--
--   Marcador 'PAGAMENTO_EXCEDE_TOTAL' na mensagem: o back o reconhece para devolver
--     409 amigável (src/lib/pagamento-excede.ts).
-- ============================================================

SET search_path TO alissonerp, directus, public;

CREATE OR REPLACE FUNCTION alissonerp.fn_pagamento_nao_exceder_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = alissonerp, directus, public
AS $$
DECLARE
  v_total  numeric(12,2);
  v_outras numeric(12,2);
BEGIN
  SELECT total_venda INTO v_total
  FROM alissonerp.vendas_erp
  WHERE id = NEW.venda_id;

  -- Venda inexistente (FK garante que não) ou rascunho sem total ainda:
  -- não há teto definido → não trava.
  IF v_total IS NULL OR v_total <= 0 THEN
    RETURN NEW;
  END IF;

  -- Soma das OUTRAS linhas (exclui a própria via id <> NEW.id — cobre tanto o
  -- INSERT, onde nenhuma linha tem NEW.id ainda, quanto o UPDATE OF valor).
  SELECT COALESCE(SUM(valor), 0) INTO v_outras
  FROM alissonerp.pagamentos_venda
  WHERE venda_id = NEW.venda_id
    AND id <> NEW.id;

  IF v_outras + NEW.valor > v_total + 0.01 THEN
    RAISE EXCEPTION
      'PAGAMENTO_EXCEDE_TOTAL: a soma das formas de pagamento (R$ %) passaria do total da venda (R$ %)',
      to_char(v_outras + NEW.valor, 'FM999990.00'),
      to_char(v_total, 'FM999990.00');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pagamento_nao_exceder_total ON alissonerp.pagamentos_venda;
CREATE TRIGGER trg_pagamento_nao_exceder_total
  BEFORE INSERT OR UPDATE OF valor ON alissonerp.pagamentos_venda
  FOR EACH ROW
  EXECUTE FUNCTION alissonerp.fn_pagamento_nao_exceder_total();
