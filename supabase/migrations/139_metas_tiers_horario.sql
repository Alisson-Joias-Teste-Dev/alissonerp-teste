-- Migration 139: Metas com tiers (Prata/Ouro/Diamante) + horário/dias trabalhados
-- v2.21.0

ALTER TABLE alissonerp.metas_vendedoras
  ADD COLUMN IF NOT EXISTS meta_prata            NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS meta_ouro             NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS meta_diamante         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS horario_inicio        TIME DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS horas_por_dia         INTEGER DEFAULT 8,
  ADD COLUMN IF NOT EXISTS dias_nao_trabalhados  INTEGER[] DEFAULT '{}';

-- Backfill: meta_valor existente vira meta_prata
UPDATE alissonerp.metas_vendedoras
SET meta_prata = meta_valor
WHERE meta_prata IS NULL AND meta_valor IS NOT NULL;
