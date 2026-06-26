-- 079_marcadores_pedras.sql
-- Adiciona marcadores de movimentação de pedras no PCP:
--   SP  = Saída de Pedra (pedra consumida na peça, baixa definitiva)
--   QBP = Quebra/Baixa de Pedra PCP (pedra perdida no processo, sem retorno)
--
-- SP já existia no enum (confirmado em 2026-03-19).
-- QBP não existia → adicionado aqui.

ALTER TYPE alissonerp.enum_marcador_estoque ADD VALUE IF NOT EXISTS 'QBP';
