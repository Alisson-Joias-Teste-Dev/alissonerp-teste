SET search_path TO alissonerp, public;

-- ─── Tabela de auditoria de transições de situação ───────────────────────────
CREATE TABLE IF NOT EXISTS alissonerp.vendas_transicoes (
  id            BIGSERIAL PRIMARY KEY,
  venda_id      BIGINT NOT NULL REFERENCES alissonerp.vendas_erp(id) ON DELETE CASCADE,
  de_situacao   VARCHAR(30),
  para_situacao VARCHAR(30) NOT NULL,
  usuario_id    UUID REFERENCES auth.users(id),
  motivo        TEXT,
  payload       JSONB,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendas_transicoes_venda_id
  ON alissonerp.vendas_transicoes(venda_id);

-- ─── Função: máquina de estados + log ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION alissonerp.fn_registrar_transicao_venda()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_de   VARCHAR(30) := OLD.situacao;
  v_para VARCHAR(30) := NEW.situacao;
  v_ok   BOOLEAN;
BEGIN
  -- Nao faz nada se situacao nao mudou
  IF v_de IS NOT DISTINCT FROM v_para THEN
    RETURN NEW;
  END IF;

  -- Máquina de estados
  -- Nota: v_de IS NULL cobre vendas criadas com situacao nula sendo inicializadas
  IF v_de IS NULL THEN
    v_ok := v_para = ANY(ARRAY['rascunho','aprovado','confirmado','cancelado']);
  ELSIF v_de = 'rascunho' THEN
    v_ok := v_para = ANY(ARRAY['aprovado','cancelado']);
  ELSIF v_de = 'aprovado' THEN
    -- concluido permitido para o fluxo de confirmação automática de pagamentos
    v_ok := v_para = ANY(ARRAY['confirmado','concluido','cancelado']);
  ELSIF v_de = 'confirmado' THEN
    v_ok := v_para = ANY(ARRAY['enviado','cancelado']);
  ELSIF v_de = 'enviado' THEN
    v_ok := v_para = ANY(ARRAY['entregue','cancelado']);
  ELSIF v_de = 'entregue' THEN
    v_ok := v_para = ANY(ARRAY['concluido']);
  ELSIF v_de IN ('concluido','cancelado') THEN
    v_ok := false;
  ELSE
    -- Estados desconhecidos: permissivo para compatibilidade futura
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Transição inválida: % → %', COALESCE(v_de, 'NULL'), v_para;
  END IF;

  -- Registrar transição
  INSERT INTO alissonerp.vendas_transicoes
    (venda_id, de_situacao, para_situacao, usuario_id, payload)
  VALUES (
    NEW.id,
    v_de,
    v_para,
    auth.uid(),
    jsonb_build_object(
      'total_venda', NEW.total_venda,
      'total_pago',  NEW.total_pago,
      'cliente_id',  NEW.cliente_id,
      'updated_at',  NEW.updated_at
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_registrar_transicao_venda ON alissonerp.vendas_erp;
CREATE TRIGGER trg_registrar_transicao_venda
  BEFORE UPDATE OF situacao ON alissonerp.vendas_erp
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_registrar_transicao_venda();
