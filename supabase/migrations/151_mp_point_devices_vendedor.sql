-- Migration 151: maquininhas por vendedor
-- Adiciona vendedor_id e is_reserva em mp_point_devices
-- Cria tabela de log de uso de máquina reserva

ALTER TABLE alissonerp.mp_point_devices
  ADD COLUMN IF NOT EXISTS vendedor_id BIGINT REFERENCES public.vendedores(id_vendedor),
  ADD COLUMN IF NOT EXISTS is_reserva  BOOLEAN NOT NULL DEFAULT false;

-- Log de uso de máquina reserva (quando vendedor sem maquininha própria usa uma reserva)
CREATE TABLE IF NOT EXISTS alissonerp.uso_maquina_reserva (
  id                SERIAL PRIMARY KEY,
  venda_id          BIGINT,
  vendedor_id       BIGINT NOT NULL,
  device_id_reserva TEXT NOT NULL,
  justificativa     TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
