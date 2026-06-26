-- 311_nao_controla_estoque_sem_reserva_baixa.sql
--
-- REGRA DE NEGÓCIO (Jonathan, 17-18/06/2026):
--   O QUÊ: produto marcado como "não controla estoque" (estoque_comercial_config.controla_estoque = false)
--          NÃO cria reserva e NÃO dá baixa de estoque quando vendido. Ex.: serviço (Conserto, Soldagem,
--          Ródio) que existe como produto só pra cobrar o valor; ou produto real que foi DESLIGADO do
--          controle de estoque (mantém o histórico, mas não controla no período em que estiver marcado).
--   POR QUÊ: serviço/produto sem controle não tem peça física a reservar/baixar. Sem esta trava, eles
--            criavam "reserva fantasma" (ex.: 38 reservas ativas em produção em serviços), bagunçando o
--            saldo comercial (disponível negativo).
--   IMPACTO SE REMOVIDO: volta a criar reserva/baixa para serviços e produtos desligados.
--
-- Esta migration estende fn_estoque_comercial_baixa_venda (última definição: migration 267) ADICIONANDO
-- apenas a guarda `IF v_controla IS FALSE THEN RETURN NEW`. Todo o resto é idêntico à 267 — nada mais muda.
-- NÃO mexe em zona no-touch (esta função não está na lista do CLAUDE.md).
-- ATENÇÃO: a guarda é "pular" (RETURN NEW), NUNCA dar erro — senão quebra venda que tenha linha de serviço.

CREATE OR REPLACE FUNCTION alissonerp.fn_estoque_comercial_baixa_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'alissonerp', 'directus', 'public'
AS $function$
DECLARE
  v_config_ativo BOOLEAN;
  v_controla     BOOLEAN;
  v_situacao     TEXT;
BEGIN
  SELECT situacao INTO v_situacao FROM alissonerp.vendas_erp WHERE id = NEW.venda_id;
  IF v_situacao = 'cancelado' THEN RETURN NEW; END IF;

  SELECT ativo, controla_estoque
    INTO v_config_ativo, v_controla
    FROM alissonerp.estoque_comercial_config
    WHERE produto_id = NEW.produto_id;

  -- Produto sem config de estoque comercial OU inativo: não reserva/baixa (comportamento original).
  IF v_config_ativo IS NULL OR v_config_ativo = false THEN RETURN NEW; END IF;

  -- TRAVA (regra acima): produto que NÃO controla estoque não reserva nem baixa. Pular, não dar erro.
  IF v_controla IS FALSE THEN RETURN NEW; END IF;

  IF v_situacao IN ('rascunho', 'aprovado', 'enviado') THEN
    INSERT INTO alissonerp.reservas_estoque_comercial
      (produto_id, venda_id, item_venda_id, quantidade, local_estoque_id, status)
    VALUES
      (NEW.produto_id, NEW.venda_id, NEW.id, NEW.quantidade, 2, 'ativo');
  ELSE
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
       local_estoque_id, status, observacao)
    VALUES
      (NEW.produto_id, 'saida', NEW.quantidade, 'venda', NEW.venda_id, 'vendas_erp',
       2, 'efetivado', 'Venda automática - item #' || NEW.id);
  END IF;

  RETURN NEW;
END;
$function$;
