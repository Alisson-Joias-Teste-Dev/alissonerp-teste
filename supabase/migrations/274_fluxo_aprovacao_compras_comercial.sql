-- Migration 274: fluxo de aprovacao para compras comercial
-- REGRA DE NEGOCIO:
-- - O que faz: adiciona trilha de aprovacao na compra comercial antes de executar estoque/financeiro.
-- - Por que: garantir segregacao de decisao (solicitante x aprovador) sem quebrar fluxo atual de aprovacoes.
-- - Impacto se alterado/removido: compras podem ser processadas sem aprovacao formal ou ficar sem rastreabilidade.

SET search_path TO alissonerp;

ALTER TABLE alissonerp.compras_comercial
  ADD COLUMN IF NOT EXISTS aprovador_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS aprovado_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS data_decisao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT,
  ADD COLUMN IF NOT EXISTS tarefa_aprovacao_id INTEGER REFERENCES alissonerp.tarefas(id);

CREATE INDEX IF NOT EXISTS idx_compras_comercial_tarefa_aprovacao
  ON alissonerp.compras_comercial(tarefa_aprovacao_id)
  WHERE tarefa_aprovacao_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compras_comercial_aprovador
  ON alissonerp.compras_comercial(aprovador_id)
  WHERE aprovador_id IS NOT NULL;

-- Chave configuravel em Configuracoes > Aprovadores para fallback de aprovador.
INSERT INTO alissonerp.configuracoes_sistema (chave, valor)
VALUES ('aprovador_compra_comercial', '')
ON CONFLICT (chave) DO NOTHING;

-- REGRA DE NEGOCIO:
-- - O que faz: compra bloqueada nao pode ser editada, mas transicoes de aprovacao sao permitidas.
-- - Por que: ao solicitar aprovacao a ordem trava; somente aprovacao/rejeicao pode mudar o status.
-- - Impacto se alterado/removido: ordem aprovada/rejeitada pode ficar presa sem transicao valida.
CREATE OR REPLACE FUNCTION alissonerp.fn_bloquear_compra_comercial()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.bloqueado = true AND NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    IF NEW.situacao IN ('aprovado', 'rejeitado') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Compra comercial #% está bloqueada para edição', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
