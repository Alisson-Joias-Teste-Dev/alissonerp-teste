-- Migration 134 — Snooze do alarme de menções
--
-- Permite que o usuário "adie" o alarme sonoro de menções por N minutos.
-- O snooze é global por usuário: vale para todas as menções pendentes
-- (incluindo novas que chegarem durante a janela de soneca).
--
-- Quando NOW() >= notif_alarme_silenciado_ate, o alarme volta a tocar
-- automaticamente no próximo polling do MencaoAlarme (até 10s depois).

ALTER TABLE alissonerp.usuarios
  ADD COLUMN IF NOT EXISTS notif_alarme_silenciado_ate TIMESTAMPTZ;
