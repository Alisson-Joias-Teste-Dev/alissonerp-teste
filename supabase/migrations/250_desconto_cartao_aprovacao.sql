-- ═══════════════════════════════════════════════════════════════════════════════
-- 250 — Regra: Cartão de Crédito com desconto >20% precisa aprovação
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Colunas de controle na vendas_erp
ALTER TABLE alissonerp.vendas_erp
  ADD COLUMN IF NOT EXISTS desconto_cartao_aprovado_por UUID REFERENCES alissonerp.usuarios(id),
  ADD COLUMN IF NOT EXISTS desconto_cartao_aprovado_em  TIMESTAMPTZ;

-- 2. Seed da regra na rules engine (aprovador = Alisson)
INSERT INTO alissonerp.tarefas_regras_aprovacao
  (nome, descricao, tipo_evento, condicao_json, aprovador_id, template_id, ativo, prioridade_regra)
SELECT
  'Cartão de Crédito com desconto acima de 20%',
  'Bloqueia cartão de crédito quando item tem desconto >20%. Solicitar aprovação.',
  'cartao_desconto',
  '{"percentual": 20}',
  '684b3b30-6a7e-476e-ad3b-529127393183',
  NULL,
  true, 5
WHERE NOT EXISTS (
  SELECT 1 FROM alissonerp.tarefas_regras_aprovacao WHERE tipo_evento = 'cartao_desconto'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Trigger de segurança: auto-libera cartão quando tarefa é aprovada
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION alissonerp.fn_processar_aprovacao_cartao()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo = 'cartao_desconto' AND NEW.status = 'aprovada'
     AND (OLD.status IS DISTINCT FROM 'aprovada')
     AND NEW.venda_id IS NOT NULL THEN
    UPDATE alissonerp.vendas_erp
    SET aprovacao_credito_tarefa_id = NULL,
        desconto_cartao_aprovado_por = NEW.responsavel_id,
        desconto_cartao_aprovado_em  = NOW(),
        updated_at = NOW()
    WHERE id = NEW.venda_id
      AND desconto_cartao_aprovado_por IS NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_aprovacao_cartao ON alissonerp.tarefas;
CREATE TRIGGER trg_aprovacao_cartao
  AFTER UPDATE ON alissonerp.tarefas
  FOR EACH ROW EXECUTE FUNCTION alissonerp.fn_processar_aprovacao_cartao();
