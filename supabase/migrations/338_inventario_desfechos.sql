-- ============================================================
-- Migration 338 — Desfecho blindado da pendência do inventário comercial
--
-- O QUÊ: adiciona o TIPO do desfecho da pendência (o que aconteceu com a
--   peça) e o vínculo com a venda quando o desfecho é "venda sem baixa".
--   Tipos: venda_sem_baixa | perda | localizada | excedente_confirmado | outro.
-- POR QUÊ: "resolvida = Sim" solto não diz o que aconteceu com a peça.
--   Estoque de milhões — fechar pendência passa a exigir um desfecho
--   concreto, e quando há efeito no estoque o movimento fica amarrado ao
--   item (movimento_ajuste_id, coluna já existente da migration 140).
-- IMPACTO SE REMOVIDO: a rota PATCH /pendencia e a tela do inventário
--   quebram (colunas inexistentes); desfechos voltam a ser texto solto.
-- ============================================================

-- 1) Tipo do desfecho + venda vinculada (nunca remove colunas — Database Safety)
ALTER TABLE alissonerp.itens_inventario_comercial
  -- Qual foi o desfecho da pendência (NULL = ainda sem desfecho)
  ADD COLUMN IF NOT EXISTS pendencia_desfecho_tipo     VARCHAR(30),
  -- Venda que explica a falta (obrigatória no desfecho venda_sem_baixa)
  ADD COLUMN IF NOT EXISTS pendencia_desfecho_venda_id INTEGER REFERENCES alissonerp.vendas_erp(id);

-- 2) BLINDAGEM: só os 5 tipos válidos entram no banco
--    (ADD CONSTRAINT não tem IF NOT EXISTS — DO block garante idempotência)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_itens_inv_desfecho_tipo'
      AND conrelid = 'alissonerp.itens_inventario_comercial'::regclass
  ) THEN
    ALTER TABLE alissonerp.itens_inventario_comercial
      ADD CONSTRAINT chk_itens_inv_desfecho_tipo CHECK (
        pendencia_desfecho_tipo IS NULL OR pendencia_desfecho_tipo IN
          ('venda_sem_baixa', 'perda', 'localizada', 'excedente_confirmado', 'outro')
      );
  END IF;
END $$;

COMMENT ON COLUMN alissonerp.itens_inventario_comercial.pendencia_desfecho_tipo IS
  'Desfecho da pendência: venda_sem_baixa | perda | localizada | excedente_confirmado | outro. NULL = sem desfecho. Movimento gerado fica em movimento_ajuste_id.';
COMMENT ON COLUMN alissonerp.itens_inventario_comercial.pendencia_desfecho_venda_id IS
  'Venda que explica a falta (desfecho venda_sem_baixa). Sempre indicada — nunca acusação solta.';
