-- ============================================================
-- TESTE E2E — Fluxo de vendas (fluxo novo 06/2026)
-- Roda cada cenário em transação isolada (BEGIN/ROLLBACK): NADA persiste.
-- Cada DO block RAISE NOTICE 'PASS/FALHA'. Falha de asserção = EXCEPTION visível.
-- IDs do banco de teste: cliente c/ cel=1711, s/ cel=1769, vend=104891,
--   user=681f363c-9e67-48a9-bd5f-443edc8eb79e, produto c/ estoque=130
-- ============================================================
\set CLI 1711
\set CLISEM 1769
\set VEND 104891
\set USR '''681f363c-9e67-48a9-bd5f-443edc8eb79e'''
\set PROD 130

\echo '====== CENARIO 1: produto em estoque — ciclo completo ======'
BEGIN;
-- Desliga SO a notificacao n8n (usa http_post, extensao ausente no banco de teste;
-- em producao funciona). Volta no ROLLBACK. Nao afeta a logica de venda/estoque.
ALTER TABLE public.vendas DISABLE TRIGGER trg_notificar_n8n;
DO $$
DECLARE
  v_id INT; v_item INT; v_reserva TEXT; v_cr TEXT; v_sit TEXT;
  v_mov INT; v_reserva_fim TEXT;
BEGIN
  -- 1) cria venda rascunho
  INSERT INTO alissonerp.vendas_erp (numero_venda, cliente_id, vendedor_id, total_produtos, total_venda, situacao, created_by)
  VALUES ('E2E-1', 1711, 104891, 1000, 1000, 'rascunho', '681f363c-9e67-48a9-bd5f-443edc8eb79e')
  RETURNING id INTO v_id;

  -- 2) insere item -> deve criar RESERVA
  INSERT INTO alissonerp.itens_venda_erp (venda_id, produto_id, nome_produto, quantidade, preco_lista, preco_unitario, total_item)
  VALUES (v_id, 130, 'Produto E2E', 1, 1000, 1000, 1000) RETURNING id INTO v_item;
  SELECT status INTO v_reserva FROM alissonerp.reservas_estoque_comercial WHERE venda_id=v_id LIMIT 1;
  IF v_reserva = 'ativo' THEN RAISE NOTICE 'PASS 1.1 — item criou reserva ATIVA'; ELSE RAISE EXCEPTION 'FALHA 1.1 — reserva=%', COALESCE(v_reserva,'(nenhuma)'); END IF;

  -- 3) pagamento total confirmado -> deve criar CR ja PAGO (e venda fica rascunho ainda? nao: baixa so se nao rascunho)
  -- aprova primeiro (precisa nao ser rascunho p/ baixa). Mas trava: rascunho->aprovado OK.
  UPDATE alissonerp.vendas_erp SET situacao='aprovado' WHERE id=v_id;
  SELECT situacao INTO v_sit FROM alissonerp.vendas_erp WHERE id=v_id;
  IF v_sit='aprovado' THEN RAISE NOTICE 'PASS 1.2 — rascunho->aprovado OK'; ELSE RAISE EXCEPTION 'FALHA 1.2'; END IF;
  -- reserva permanece ativa apos aprovar
  SELECT status INTO v_reserva FROM alissonerp.reservas_estoque_comercial WHERE venda_id=v_id LIMIT 1;
  IF v_reserva='ativo' THEN RAISE NOTICE 'PASS 1.3 — reserva continua ATIVA apos aprovar (nao baixa no aprovar)'; ELSE RAISE EXCEPTION 'FALHA 1.3 — reserva=%', v_reserva; END IF;

  INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, valor, parcelas, status, data_confirmacao)
  VALUES (v_id, 'Pix', 1000, 1, 'confirmado', NOW());
  SELECT situacao INTO v_cr FROM alissonerp.contas_receber WHERE venda_erp_id=v_id LIMIT 1;
  IF v_cr='pago' THEN RAISE NOTICE 'PASS 1.4 — pagamento total criou conta a receber PAGA na hora'; ELSE RAISE EXCEPTION 'FALHA 1.4 — cr=%', COALESCE(v_cr,'(nenhuma)'); END IF;
  -- venda continua aprovada (pagamento nao muda status)
  SELECT situacao INTO v_sit FROM alissonerp.vendas_erp WHERE id=v_id;
  IF v_sit='aprovado' THEN RAISE NOTICE 'PASS 1.5 — pagamento NAO mudou status (continua aprovado)'; ELSE RAISE EXCEPTION 'FALHA 1.5 — sit=%', v_sit; END IF;

  -- 4) entrega -> reserva vira SAIDA, status fica ENTREGUE (nao concluido)
  UPDATE alissonerp.vendas_erp SET situacao='entregue' WHERE id=v_id;
  SELECT situacao INTO v_sit FROM alissonerp.vendas_erp WHERE id=v_id;
  IF v_sit='entregue' THEN RAISE NOTICE 'PASS 1.6 — venda FICA entregue (nao vira concluido)'; ELSE RAISE EXCEPTION 'FALHA 1.6 — sit=% (esperado entregue)', v_sit; END IF;
  SELECT status INTO v_reserva_fim FROM alissonerp.reservas_estoque_comercial WHERE venda_id=v_id LIMIT 1;
  IF v_reserva_fim='efetivado' THEN RAISE NOTICE 'PASS 1.7 — reserva virou EFETIVADO na entrega'; ELSE RAISE EXCEPTION 'FALHA 1.7 — reserva=%', v_reserva_fim; END IF;
  SELECT COUNT(*) INTO v_mov FROM alissonerp.movimentacoes_estoque_comercial WHERE referencia_id=v_id AND referencia_tipo='vendas_erp' AND tipo='saida';
  IF v_mov>=1 THEN RAISE NOTICE 'PASS 1.8 — saida de estoque registrada na entrega'; ELSE RAISE EXCEPTION 'FALHA 1.8 — movs saida=%', v_mov; END IF;

  -- CR nao duplicou
  SELECT COUNT(*)::text INTO v_cr FROM alissonerp.contas_receber WHERE venda_erp_id=v_id;
  IF v_cr='1' THEN RAISE NOTICE 'PASS 1.9 — conta a receber NAO duplicou (1 so)'; ELSE RAISE EXCEPTION 'FALHA 1.9 — qtd CR=%', v_cr; END IF;
END $$;
ROLLBACK;

\echo '====== CENARIO 2: trava de status barra transicoes invalidas ======'
BEGIN;
DO $$
DECLARE v_id INT; v_ok BOOLEAN;
BEGIN
  INSERT INTO alissonerp.vendas_erp (numero_venda, cliente_id, vendedor_id, total_produtos, total_venda, situacao, created_by)
  VALUES ('E2E-2', 1711, 104891, 500, 500, 'rascunho', '681f363c-9e67-48a9-bd5f-443edc8eb79e') RETURNING id INTO v_id;
  -- rascunho -> entregue deve FALHAR
  v_ok := true;
  BEGIN
    UPDATE alissonerp.vendas_erp SET situacao='entregue' WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  IF NOT v_ok THEN RAISE NOTICE 'PASS 2.1 — rascunho->entregue BARRADO pela trava'; ELSE RAISE EXCEPTION 'FALHA 2.1 — trava deixou passar'; END IF;
END $$;
ROLLBACK;

\echo '====== CENARIO 3: estorno de venda ENTREGUE nao desfaz (ponto final) ======'
BEGIN;
ALTER TABLE public.vendas DISABLE TRIGGER trg_notificar_n8n;
DO $$
DECLARE v_id INT; v_sit TEXT; v_ok BOOLEAN := true;
BEGIN
  INSERT INTO alissonerp.vendas_erp (numero_venda, cliente_id, vendedor_id, total_produtos, total_venda, situacao, created_by)
  VALUES ('E2E-3', 1711, 104891, 800, 800, 'aprovado', '681f363c-9e67-48a9-bd5f-443edc8eb79e') RETURNING id INTO v_id;
  UPDATE alissonerp.vendas_erp SET situacao='entregue' WHERE id=v_id;
  -- tentar voltar entregue->rascunho (o que o estorno antigo faria) deve FALHAR
  BEGIN
    UPDATE alissonerp.vendas_erp SET situacao='rascunho' WHERE id=v_id;
  EXCEPTION WHEN OTHERS THEN v_ok := false; END;
  IF NOT v_ok THEN RAISE NOTICE 'PASS 3.1 — entregue->rascunho BARRADO (estorno nao desfaz entrega)'; ELSE RAISE EXCEPTION 'FALHA 3.1'; END IF;
  -- entregue->cancelado deve PASSAR (correcao via cancelamento)
  UPDATE alissonerp.vendas_erp SET situacao='cancelado' WHERE id=v_id;
  SELECT situacao INTO v_sit FROM alissonerp.vendas_erp WHERE id=v_id;
  IF v_sit='cancelado' THEN RAISE NOTICE 'PASS 3.2 — entregue->cancelado PERMITIDO'; ELSE RAISE EXCEPTION 'FALHA 3.2 — sit=%', v_sit; END IF;
END $$;
ROLLBACK;

\echo '====== CENARIO 4: pagamento PARCIAL nao baixa conta a receber ======'
BEGIN;
DO $$
DECLARE v_id INT; v_qtd INT;
BEGIN
  INSERT INTO alissonerp.vendas_erp (numero_venda, cliente_id, vendedor_id, total_produtos, total_venda, situacao, created_by)
  VALUES ('E2E-4', 1711, 104891, 2000, 2000, 'aprovado', '681f363c-9e67-48a9-bd5f-443edc8eb79e') RETURNING id INTO v_id;
  INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, valor, parcelas, status, data_confirmacao)
  VALUES (v_id, 'Pix', 500, 1, 'confirmado', NOW());
  SELECT COUNT(*) INTO v_qtd FROM alissonerp.contas_receber WHERE venda_erp_id=v_id;
  IF v_qtd=0 THEN RAISE NOTICE 'PASS 4.1 — pagamento parcial NAO criou conta a receber'; ELSE RAISE EXCEPTION 'FALHA 4.1 — criou % CR', v_qtd; END IF;
  -- completa o total -> agora baixa
  INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, valor, parcelas, status, data_confirmacao)
  VALUES (v_id, 'Dinheiro', 1500, 1, 'confirmado', NOW());
  SELECT COUNT(*) INTO v_qtd FROM alissonerp.contas_receber WHERE venda_erp_id=v_id AND situacao='pago';
  IF v_qtd=1 THEN RAISE NOTICE 'PASS 4.2 — ao completar o total, conta a receber baixou (PAGA)'; ELSE RAISE EXCEPTION 'FALHA 4.2 — CR paga=%', v_qtd; END IF;
END $$;
ROLLBACK;

\echo '====== CENARIO 5: Na Entrega — cobranca na entrega baixa a conta ======'
BEGIN;
ALTER TABLE public.vendas DISABLE TRIGGER trg_notificar_n8n;
DO $$
DECLARE v_id INT; v_qtd INT; v_cr TEXT; v_sit TEXT;
BEGIN
  INSERT INTO alissonerp.vendas_erp (numero_venda, cliente_id, vendedor_id, total_produtos, total_venda, situacao, created_by)
  VALUES ('E2E-5', 1711, 104891, 1000, 1000, 'aprovado', '681f363c-9e67-48a9-bd5f-443edc8eb79e') RETURNING id INTO v_id;
  -- pagamento Na Entrega pendente (combinado de pagar na entrega)
  INSERT INTO alissonerp.pagamentos_venda (venda_id, forma, valor, parcelas, status)
  VALUES (v_id, 'Na Entrega', 1000, 1, 'pendente');
  SELECT COUNT(*) INTO v_qtd FROM alissonerp.contas_receber WHERE venda_erp_id=v_id;
  IF v_qtd=0 THEN RAISE NOTICE 'PASS 5.1 — Na Entrega pendente NAO gera conta a receber ainda'; ELSE RAISE EXCEPTION 'FALHA 5.1 — criou % CR', v_qtd; END IF;

  -- COBRAR NA ENTREGA: confirma o Na Entrega com a forma real (Dinheiro)
  UPDATE alissonerp.pagamentos_venda
  SET forma='Dinheiro', status='confirmado', data_confirmacao=NOW()
  WHERE venda_id=v_id AND forma='Na Entrega' AND status='pendente';
  SELECT situacao INTO v_cr FROM alissonerp.contas_receber WHERE venda_erp_id=v_id LIMIT 1;
  IF v_cr='pago' THEN RAISE NOTICE 'PASS 5.2 — cobranca na entrega criou conta a receber PAGA'; ELSE RAISE EXCEPTION 'FALHA 5.2 — cr=%', COALESCE(v_cr,'(nenhuma)'); END IF;
  SELECT situacao INTO v_sit FROM alissonerp.vendas_erp WHERE id=v_id;
  IF v_sit='aprovado' THEN RAISE NOTICE 'PASS 5.3 — cobranca NAO mudou status (continua aprovado)'; ELSE RAISE EXCEPTION 'FALHA 5.3 — sit=%', v_sit; END IF;

  UPDATE alissonerp.vendas_erp SET situacao='entregue' WHERE id=v_id;
  SELECT situacao INTO v_sit FROM alissonerp.vendas_erp WHERE id=v_id;
  IF v_sit='entregue' THEN RAISE NOTICE 'PASS 5.4 — apos cobrar, entrega concluida (entregue)'; ELSE RAISE EXCEPTION 'FALHA 5.4 — sit=%', v_sit; END IF;
END $$;
ROLLBACK;

\echo '====== CENARIO 6: Pix confirmado (PDV) -> aprovar -> CR pago ======'
BEGIN;
ALTER TABLE public.vendas DISABLE TRIGGER trg_notificar_n8n;
DO $$
DECLARE v_id INT; v_cr TEXT;
BEGIN
  INSERT INTO alissonerp.vendas_erp (numero_venda,cliente_id,vendedor_id,total_produtos,total_venda,situacao,created_by)
  VALUES ('E2E-6',224,134,200,200,'rascunho','681f363c-9e67-48a9-bd5f-443edc8eb79e') RETURNING id INTO v_id;
  INSERT INTO alissonerp.pagamentos_venda (venda_id,forma,valor,parcelas,status,data_confirmacao) VALUES (v_id,'Pix',200,1,'confirmado',NOW());
  UPDATE alissonerp.vendas_erp SET situacao='aprovado' WHERE id=v_id;
  SELECT situacao INTO v_cr FROM alissonerp.contas_receber WHERE venda_erp_id=v_id;
  IF v_cr='pago' THEN RAISE NOTICE 'PASS 6.1 — Pix confirmado: conta a receber nasce PAGA na aprovacao'; ELSE RAISE EXCEPTION 'FALHA 6.1 — cr=%',COALESCE(v_cr,'(nenhuma)'); END IF;
END $$;
ROLLBACK;

\echo '====== CENARIO 7: pagamento MISTO -> conta a receber so do saldo aberto ======'
BEGIN;
ALTER TABLE public.vendas DISABLE TRIGGER trg_notificar_n8n;
DO $$
DECLARE v_id INT; v_sit TEXT; v_val NUMERIC;
BEGIN
  INSERT INTO alissonerp.vendas_erp (numero_venda,cliente_id,vendedor_id,total_produtos,total_venda,situacao,created_by)
  VALUES ('E2E-7',224,134,200,200,'rascunho','681f363c-9e67-48a9-bd5f-443edc8eb79e') RETURNING id INTO v_id;
  INSERT INTO alissonerp.pagamentos_venda (venda_id,forma,valor,parcelas,status,data_confirmacao) VALUES (v_id,'Dinheiro',120,1,'confirmado',NOW());
  INSERT INTO alissonerp.pagamentos_venda (venda_id,forma,valor,parcelas,status) VALUES (v_id,'A Receber',80,1,'pendente');
  UPDATE alissonerp.vendas_erp SET situacao='aprovado' WHERE id=v_id;
  UPDATE alissonerp.vendas_erp SET situacao='entregue' WHERE id=v_id;
  SELECT situacao,valor INTO v_sit,v_val FROM alissonerp.contas_receber WHERE venda_erp_id=v_id;
  IF v_sit='pendente' AND v_val=80 THEN RAISE NOTICE 'PASS 7.1 — misto (120 dinheiro + 80 a receber): conta a receber = R$80 (so o aberto)'; ELSE RAISE EXCEPTION 'FALHA 7.1 — situacao=% valor=% (esperado pendente 80)',v_sit,v_val; END IF;
END $$;
ROLLBACK;

\echo '====== CENARIO 8: motoboy — aprovado -> em_rota -> entregue ======'
BEGIN;
ALTER TABLE public.vendas DISABLE TRIGGER trg_notificar_n8n;
DO $$
DECLARE v_id INT; v_sit TEXT;
BEGIN
  INSERT INTO alissonerp.vendas_erp (numero_venda,cliente_id,vendedor_id,total_produtos,total_venda,situacao,created_by)
  VALUES ('E2E-8',224,134,150,150,'aprovado','681f363c-9e67-48a9-bd5f-443edc8eb79e') RETURNING id INTO v_id;
  UPDATE alissonerp.vendas_erp SET situacao='em_rota' WHERE id=v_id;
  SELECT situacao INTO v_sit FROM alissonerp.vendas_erp WHERE id=v_id;
  IF v_sit='em_rota' THEN RAISE NOTICE 'PASS 8.1 — aprovado->em_rota (motoboy retirou)'; ELSE RAISE EXCEPTION 'FALHA 8.1'; END IF;
  UPDATE alissonerp.vendas_erp SET situacao='entregue' WHERE id=v_id;
  SELECT situacao INTO v_sit FROM alissonerp.vendas_erp WHERE id=v_id;
  IF v_sit='entregue' THEN RAISE NOTICE 'PASS 8.2 — em_rota->entregue (cliente recebeu)'; ELSE RAISE EXCEPTION 'FALHA 8.2'; END IF;
END $$;
ROLLBACK;

\echo '====== FIM DOS TESTES ======'
