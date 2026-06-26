-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION 281: Ajuste de status do cofre_ouro_baixas para fluxo Sangria
--
-- REGRA DE NEGÓCIO:
-- O fluxo de ouro foi expandido para separar etapas operacionais:
--   esperando_protocolo -> em_trafego -> recebido -> em_limpeza ->
--   aguardando_aprovacao -> concluido
--
-- O QUE:
-- Atualiza a CHECK constraint de status da tabela cofre_ouro_baixas para
-- aceitar os novos status, mantendo os legados para compatibilidade.
--
-- POR QUE:
-- Sem isso, qualquer INSERT/UPDATE para os novos status falha com erro 23514.
--
-- IMPACTO SE REMOVIDO/INCOMPLETO:
-- O fluxo para em tempo de execução (baixa, protocolo, limpeza, aprovação).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE alissonerp.cofre_ouro_baixas
  DROP CONSTRAINT IF EXISTS cofre_ouro_baixas_status_check;

ALTER TABLE alissonerp.cofre_ouro_baixas
  ADD CONSTRAINT cofre_ouro_baixas_status_check
  CHECK (
    (status)::text = ANY (
      ARRAY[
        'pendente',
        'esperando_protocolo',
        'em_trafego',
        'recebido',
        'em_limpeza',
        'aguardando_aprovacao',
        'concluido',
        'cancelado'
      ]::text[]
    )
  );

COMMIT;
