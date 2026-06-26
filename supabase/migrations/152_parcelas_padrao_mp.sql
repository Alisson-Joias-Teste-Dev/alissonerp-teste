-- Migration 152: parcelas padrão por vendedor no Mercado Pago
-- Quando um vendedor abre a cobrança via maquininha, o número de parcelas
-- já vem pré-selecionado com o valor configurado para ele.

ALTER TABLE alissonerp.usuarios
  ADD COLUMN IF NOT EXISTS parcelas_padrao_mp INTEGER NOT NULL DEFAULT 1
    CHECK (parcelas_padrao_mp BETWEEN 1 AND 12);
