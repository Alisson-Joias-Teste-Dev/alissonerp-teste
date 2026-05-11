-- Adiciona ordem para reordenação de colunas no kanban Rota de Fabricação.
-- Default 999 → setores novos caem no fim. Setores existentes recebem
-- numeração sequencial baseada em nome (ASC) pra manter ordem atual estável.
ALTER TABLE alissonerp.setores ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 999;

-- Numera os setores existentes (que ainda têm 999) por nome ASC, em incrementos
-- de 10 pra deixar espaço pra inserções intermediárias.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY nome ASC) * 10 AS nova_ordem
  FROM alissonerp.setores
  WHERE ordem = 999
)
UPDATE alissonerp.setores s
SET ordem = numbered.nova_ordem
FROM numbered
WHERE s.id = numbered.id;
