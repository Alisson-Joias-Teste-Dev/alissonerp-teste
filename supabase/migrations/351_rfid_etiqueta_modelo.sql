-- Migration 351: RFID — modelos de etiqueta (dimensões, offset, posição do chip)
-- ─────────────────────────────────────────────────────────────────────────────
-- Permite cadastrar VÁRIOS modelos de etiqueta (cada joia/mídia tem o seu):
-- dimensões (largura/altura), deslocamento de impressão (offset X/Y, aplicado
-- via ^LH no ZPL) e a posição de programação do chip (^RS) achada na calibração.
-- Um modelo pode ser marcado como padrão (usado quando não se escolhe outro).
--
-- Medidas em MILÍMETROS (a UI usa mm; o gerador converte p/ dots a 203 dpi).
-- PGAPPNAME: rfid_migration_351

CREATE TABLE IF NOT EXISTS alissonerp.rfid_etiqueta_modelo (
  id            serial PRIMARY KEY,
  nome          text          NOT NULL,
  largura_mm    numeric(6,2)  NOT NULL,
  altura_mm     numeric(6,2)  NOT NULL,
  offset_x_mm   numeric(6,2)  NOT NULL DEFAULT 0,
  offset_y_mm   numeric(6,2)  NOT NULL DEFAULT 0,
  posicao_rfid  text,                       -- ex.: 'F1' (posição de programação calibrada)
  padrao        boolean       NOT NULL DEFAULT false,
  ativo         boolean       NOT NULL DEFAULT true,
  criado_em     timestamptz   NOT NULL DEFAULT now(),
  atualizado_em timestamptz   NOT NULL DEFAULT now()
);

-- No máximo 1 modelo padrão.
CREATE UNIQUE INDEX IF NOT EXISTS rfid_etiqueta_modelo_um_padrao
  ON alissonerp.rfid_etiqueta_modelo (padrao) WHERE padrao = true;
