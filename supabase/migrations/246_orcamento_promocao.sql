-- Promoção do orçamento de aliança.
--
-- Permite definir um período (data início → data fim) durante o qual cada
-- faixa de preço do ouro pode ter um desconto percentual aplicado direto no
-- R$/g final. O desconto por faixa fica no JSONB `pricing_categories` em
-- `desconto_promocao` (number, %).
--
-- Lógica de aplicação (no client / cálculo):
--   if (hoje ∈ [promocao_inicio, promocao_fim] && faixa.desconto_promocao > 0)
--     preco_grama_efetivo = preco_grama × (1 - desconto_promocao/100)
--
-- Fora do período → preço cheio (sem desconto).

ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS promocao_inicio DATE,
  ADD COLUMN IF NOT EXISTS promocao_fim    DATE;

-- Constraint: se uma data está preenchida, a outra também precisa estar +
-- inicio <= fim
ALTER TABLE alissonerp.config_orcamento
  DROP CONSTRAINT IF EXISTS chk_promocao_periodo;
ALTER TABLE alissonerp.config_orcamento
  ADD CONSTRAINT chk_promocao_periodo CHECK (
    (promocao_inicio IS NULL AND promocao_fim IS NULL)
    OR (promocao_inicio IS NOT NULL AND promocao_fim IS NOT NULL AND promocao_inicio <= promocao_fim)
  );
