-- Migration 331: etapa de CHEGADA na compra comercial
-- REGRA DE NEGOCIO:
-- - O que faz: cria a primeira etapa do compras comercial (a "chegada"). Quando a mercadoria
--   chega na loja, registra-se o LOTE (qtd de pecas, peso total em g e valor total) + 2 fotos
--   (balanca e pecas). O sistema calcula o valor da grama, ja gera a conta a pagar do lote e
--   passa a contar esse metal como "pendente de cadastro" na loja — antes de cadastrar peca a peca.
-- - Por que: o ouro precisa ser rastreado assim que entra na loja, mesmo sem os produtos cadastrados.
--   O cadastro detalhado (itens) e a conclusao vem depois.
-- - Impacto se alterado/removido: o metal recem-chegado deixa de ser rastreado ate o cadastro,
--   e a conta a pagar deixa de nascer na chegada (volta a nascer so na conclusao).

SET search_path TO alissonerp;

-- 1) Colunas de LOTE + FOTOS + leitura da IA no cabecalho da compra.
--    valor_total_lote = valor acordado do lote (ex: R$ 30.000). E a base financeira (conta a pagar),
--    diferente de "total" (que e recalculado pela soma dos itens na conclusao).
--    valor_grama = valor_total_lote / peso_total_g (ex: 30000 / 10 = 3000).
ALTER TABLE alissonerp.compras_comercial
  ADD COLUMN IF NOT EXISTS total_pecas      INTEGER,
  ADD COLUMN IF NOT EXISTS peso_total_g     NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS valor_total_lote NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS valor_grama      NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS foto_balanca_path TEXT,
  ADD COLUMN IF NOT EXISTS foto_pecas_path   TEXT,
  ADD COLUMN IF NOT EXISTS ia_peso_balanca  NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS ia_match         BOOLEAN,
  ADD COLUMN IF NOT EXISTS ia_confianca     VARCHAR(20),
  ADD COLUMN IF NOT EXISTS ia_mensagem      TEXT;

-- 2) Tolerancia de peso do lote (em gramas) para a "diferenca de balanca".
--    Usada na chegada (IA confere a foto da balanca x peso informado) e na conferencia
--    da conclusao (soma do peso dos itens cadastrados x peso do lote). Acima disso → pede aprovacao.
INSERT INTO alissonerp.configuracoes_sistema (chave, valor)
VALUES ('tolerancia_lote_peso_g', '0.30')
ON CONFLICT (chave) DO NOTHING;

-- 3) View do "metal/lote pendente de cadastro" por local.
--    REGRA DE NEGOCIO: o saldo pendente = peso do lote informado na chegada MENOS o peso ja
--    cadastrado em itens, somado por local, enquanto a compra estiver em 'recebido_pendente_cadastro'.
--    NAO duplica estoque: e derivado da propria compra. Some sozinho conforme as pecas sao cadastradas
--    e zera quando a compra e concluida (sai desse status).
CREATE OR REPLACE VIEW alissonerp.vw_saldo_lote_pendente_comercial AS
SELECT
  c.local_estoque_id,
  le.nome AS local_nome,
  COUNT(*)::int AS lotes_pendentes,
  COALESCE(SUM(c.peso_total_g), 0)                              AS peso_lote_total_g,
  COALESCE(SUM(itens.peso_cadastrado), 0)                      AS peso_cadastrado_g,
  COALESCE(SUM(c.peso_total_g), 0) - COALESCE(SUM(itens.peso_cadastrado), 0) AS peso_pendente_g,
  COALESCE(SUM(c.valor_total_lote), 0)                         AS valor_lote_total
FROM alissonerp.compras_comercial c
LEFT JOIN alissonerp.locais_estoque le ON le.id = c.local_estoque_id
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(ic.peso_total), 0) AS peso_cadastrado
  FROM alissonerp.itens_compra_comercial ic
  WHERE ic.compra_comercial_id = c.id
) itens ON true
WHERE c.situacao = 'recebido_pendente_cadastro'
GROUP BY c.local_estoque_id, le.nome;

GRANT SELECT ON alissonerp.vw_saldo_lote_pendente_comercial TO authenticated;

-- 4) Geracao da conta a pagar JA NA CHEGADA, a partir do valor do lote (nao da soma dos itens).
--    REGRA DE NEGOCIO: na chegada ja se sabe o valor acordado (ex: R$ 30.000) e o plano de parcelas.
--    O compromisso financeiro nasce aqui. A funcao de conclusao (fn_gerar_conta_pagar_compra_comercial)
--    continua existindo, mas como ela so gera "se ainda nao existir conta", ela vira no-op nesse fluxo
--    — nao duplica. (Nao alteramos aquela funcao para nao mexer em codigo que funciona.)
CREATE OR REPLACE FUNCTION alissonerp.fn_gerar_conta_pagar_chegada_comercial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fornecedor_nome TEXT;
  v_parcelas INTEGER;
  v_total NUMERIC(12,2);
  v_base NUMERIC(12,2);
  v_soma NUMERIC(12,2);
  v_diff NUMERIC(12,2);
  v_valor_parcela NUMERIC(12,2);
  i INTEGER;
BEGIN
  -- So gera para a chegada (status novo) com valor de lote informado.
  IF NEW.situacao <> 'recebido_pendente_cadastro' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.valor_total_lote, 0) <= 0 THEN RETURN NEW; END IF;

  -- Blindagem contra duplicidade: nunca gera se ja existe conta a pagar dessa compra.
  IF EXISTS (
    SELECT 1 FROM alissonerp.contas_pagar cp WHERE cp.compra_comercial_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT nome INTO v_fornecedor_nome FROM public.contatos WHERE id_contato = NEW.fornecedor_id;

  v_parcelas := GREATEST(COALESCE(NEW.qtd_parcelas, 1), 1);
  v_total := COALESCE(NEW.valor_total_lote, 0);

  v_base := ROUND((v_total / v_parcelas)::numeric, 2);
  v_soma := ROUND((v_base * v_parcelas)::numeric, 2);
  v_diff := ROUND((v_total - v_soma)::numeric, 2);

  FOR i IN 1..v_parcelas LOOP
    v_valor_parcela := v_base;
    IF i = v_parcelas THEN
      -- Ajuste de centavos so na ultima parcela para a soma bater com o total.
      v_valor_parcela := ROUND((v_base + v_diff)::numeric, 2);
    END IF;

    INSERT INTO alissonerp.contas_pagar (
      descricao, fornecedor_id, fornecedor_nome, compra_comercial_id,
      valor, data_vencimento, situacao, categoria, created_by, obs
    ) VALUES (
      'Compra Comercial #' || NEW.id || ' - Parcela ' || i || '/' || v_parcelas,
      NEW.fornecedor_id,
      v_fornecedor_nome,
      NEW.id,
      v_valor_parcela,
      ((NEW.primeiro_vencimento::date + ((i - 1) || ' month')::interval))::date,
      'pendente',
      'compra_comercial',
      NEW.created_by,
      'Gerado na chegada da compra comercial #' || NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chegada_gerar_conta_pagar ON alissonerp.compras_comercial;
CREATE TRIGGER trg_chegada_gerar_conta_pagar
  AFTER INSERT ON alissonerp.compras_comercial
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_gerar_conta_pagar_chegada_comercial();

-- 5) Conclusao: permitir concluir vindo da CHEGADA e de APROVADO (alem de rascunho/recebida).
--    REGRA DE NEGOCIO: o fluxo novo conclui a partir de 'recebido_pendente_cadastro' (peso bateu)
--    ou de 'aprovado' (peso divergiu e foi aprovado). Mantem todo o resto identico ao original (272).
CREATE OR REPLACE FUNCTION alissonerp.fn_concluir_compra_comercial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
BEGIN
  IF NEW.situacao != 'concluido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.situacao = 'concluido' THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' AND OLD.situacao NOT IN ('rascunho', 'recebida', 'recebido_pendente_cadastro', 'aprovado') THEN
    RAISE EXCEPTION 'Compra comercial #% precisa estar em rascunho, recebida, chegada (pendente de cadastro) ou aprovada para concluir (status atual: %)',
      OLD.id, OLD.situacao;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM alissonerp.itens_compra_comercial ic
    WHERE ic.compra_comercial_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Compra comercial #% não possui itens para concluir', NEW.id;
  END IF;

  FOR v_item IN
    SELECT ic.*
    FROM alissonerp.itens_compra_comercial ic
    WHERE ic.compra_comercial_id = NEW.id
  LOOP
    INSERT INTO alissonerp.movimentacoes_estoque_comercial
      (produto_id, tipo, quantidade, motivo, local_estoque_id, status, observacao, created_by)
    VALUES
      (v_item.produto_id, 'entrada', v_item.qtd, 'compra_comercial', NEW.local_estoque_id, 'efetivado',
       'Entrada via compra comercial #' || NEW.id,
       COALESCE(NEW.created_by, auth.uid()));
  END LOOP;

  NEW.bloqueado := true;

  SELECT COALESCE(SUM(valor_total), 0) INTO NEW.total
  FROM alissonerp.itens_compra_comercial
  WHERE compra_comercial_id = NEW.id;

  RETURN NEW;
END;
$$;

-- 6) Bloqueio de edicao: alem de aprovar/rejeitar, permitir CONCLUIR uma compra aprovada (que esta bloqueada).
--    REGRA DE NEGOCIO: ao solicitar aprovacao a compra trava (bloqueado=true). Quando o peso diverge,
--    ela e aprovada e precisa poder ser concluida — essa transicao aprovado→concluido fica liberada aqui.
--    Impacto se removido: compra aprovada com divergencia fica presa, sem como concluir.
CREATE OR REPLACE FUNCTION alissonerp.fn_bloquear_compra_comercial()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.bloqueado = true AND NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    IF NEW.situacao IN ('aprovado', 'rejeitado') THEN
      RETURN NEW;
    END IF;
    IF OLD.situacao = 'aprovado' AND NEW.situacao = 'concluido' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Compra comercial #% está bloqueada para edição', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
