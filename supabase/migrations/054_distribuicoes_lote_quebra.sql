-- Migration 054: Campos de rastreamento do balanço do lote na conclusão
-- Quebra/saldo agora é calculada no lote (distribuicoes), NÃO por ordem individual.
--
-- Regra: resultado = ouro_entregue - ouro_pecas
--   > 0 = QUEBRA (perdeu ouro)   < 0 = SALDO (sobrou ouro)   = 0 = Zerado
--
-- pmc, quebra, porcentagem_de_quebra já existem — reaproveitados para compat.
-- Novos campos para o novo fluxo:

ALTER TABLE alissonerp.distribuicoes
  ADD COLUMN IF NOT EXISTS ouro_entregue real,   -- Σ(aditivo + entrada) - retorno (da distribuição)
  ADD COLUMN IF NOT EXISTS ouro_pecas    real,   -- Σ peso_ouro_real de todas as ordens
  ADD COLUMN IF NOT EXISTS quebra_lote   real;   -- ouro_entregue - ouro_pecas (+ = quebra, - = saldo)

COMMENT ON COLUMN alissonerp.distribuicoes.ouro_entregue IS 'Ouro líquido entregue ao lote: (tipos 1+2) − retorno (tipo 5), categoria metal';
COMMENT ON COLUMN alissonerp.distribuicoes.ouro_pecas    IS 'Soma de distribuicao_ordens.peso_ouro_real para todas as ordens do lote';
COMMENT ON COLUMN alissonerp.distribuicoes.quebra_lote   IS 'Resultado do lote: ouro_entregue − ouro_pecas (positivo = quebra, negativo = saldo)';
