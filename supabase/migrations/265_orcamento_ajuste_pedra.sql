-- =============================================
-- Migration 265 — Ajuste global do ouro removido por pedra
-- =============================================
-- Adiciona coluna ajuste_pedra_pct em config_orcamento.
-- Multiplica em LOTE o volume de ouro removido por cada pedra cravejada.
--
-- Default 100 = sem ajuste (comportamento atual).
-- 120 = pedra remove 20% A MAIS de ouro (aliança fica mais leve)
-- 80  = pedra remove 20% A MENOS de ouro (aliança fica mais pesada)
--
-- Range 1-500 (proteção contra 0 = aliança ignora pedra; e contra valores
-- absurdos que zerariam o peso final).
-- =============================================

ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS ajuste_pedra_pct NUMERIC(5,2) DEFAULT 100;

-- CHECK 1-500 (idempotente)
ALTER TABLE alissonerp.config_orcamento
  DROP CONSTRAINT IF EXISTS chk_ajuste_pedra_pct;
ALTER TABLE alissonerp.config_orcamento
  ADD CONSTRAINT chk_ajuste_pedra_pct
  CHECK (ajuste_pedra_pct >= 1 AND ajuste_pedra_pct <= 500);

-- Linhas pré-existentes (caso a coluna já existisse com NULL)
UPDATE alissonerp.config_orcamento
SET ajuste_pedra_pct = 100
WHERE ajuste_pedra_pct IS NULL;
