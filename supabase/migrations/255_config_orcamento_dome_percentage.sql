-- 255_config_orcamento_dome_percentage.sql
-- Adiciona dome_percentage (curvatura padrão global) à config do orçamento.
-- Antes desta migration, o input "Curvatura padrão (%)" da tela de config
-- mexia em params.domePercentage (state local de UMA aliança) e nunca era
-- persistido — então o valor digitado era jogado fora ao recarregar.

ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS dome_percentage NUMERIC DEFAULT 100;

UPDATE alissonerp.config_orcamento
  SET dome_percentage = 100
  WHERE dome_percentage IS NULL;
