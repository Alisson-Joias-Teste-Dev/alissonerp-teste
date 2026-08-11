-- ============================================================
-- Migration 336 — Pendências do inventário comercial + auditoria de cancelamento
--
-- O QUÊ: adiciona rastreamento de pendências por item do inventário
--   (descrição do problema + resolução Sim/Não com autor e data) e
--   registro de QUEM cancelou um inventário e POR QUÊ.
-- POR QUÊ: o estoque comercial vale milhões — toda divergência
--   (faltando/excedente) precisa de explicação registrada e de um
--   desfecho auditável ("foi resolvida ou não"), e nenhum cancelamento
--   pode ser anônimo.
-- IMPACTO SE REMOVIDO: a tela /estoque-comercial/inventario/[id] e a
--   rota PATCH /api/estoque-comercial/inventario/[id]/pendencia quebram
--   (colunas inexistentes); cancelamentos voltam a ser anônimos.
-- ============================================================

-- 1) Pendências por item (nunca remove colunas — Database Safety)
ALTER TABLE alissonerp.itens_inventario_comercial
  -- Descrição livre da pendência (ex: "peça no conserto", "vendida sem baixa")
  ADD COLUMN IF NOT EXISTS pendencia_obs            TEXT,
  ADD COLUMN IF NOT EXISTS pendencia_registrada_por UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS pendencia_registrada_em  TIMESTAMPTZ,
  -- NULL = ainda sem resposta | true = resolvida | false = não resolvida
  ADD COLUMN IF NOT EXISTS pendencia_resolvida      BOOLEAN,
  ADD COLUMN IF NOT EXISTS pendencia_resolucao_obs  TEXT,
  ADD COLUMN IF NOT EXISTS pendencia_resolvida_por  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS pendencia_resolvida_em   TIMESTAMPTZ,
  -- Reafirma migration 242 (conferido fisicamente) — idempotente
  ADD COLUMN IF NOT EXISTS conferido                BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conferido_em             TIMESTAMPTZ;

-- 2) Cancelamento auditável do inventário
ALTER TABLE alissonerp.inventarios_comercial
  ADD COLUMN IF NOT EXISTS cancelado_por       UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;

-- 3) Índice parcial: pendências registradas e ainda sem desfecho
--    (usado pelo bloqueio de conclusão e pelos cards de resumo)
CREATE INDEX IF NOT EXISTS idx_itens_inv_pendencia_aberta
  ON alissonerp.itens_inventario_comercial (inventario_id)
  WHERE pendencia_obs IS NOT NULL AND pendencia_resolvida IS NULL;

-- 4) BLINDAGEM: garante que "diferenca" é coluna GERADA pelo banco.
--    O QUÊ: se "diferenca" for coluna comum (dessincronizada da definição
--      da migration 140), converte para GENERATED ALWAYS ... STORED.
--    POR QUÊ: a rota /finalizar (app RFID) nunca escreve "diferenca";
--      se a coluna não for gerada, as divergências ficariam NULL/velhas
--      e o inventário mentiria sobre faltas/sobras.
--    IMPACTO SE REMOVIDO: risco de "diferenca" travada em valor antigo
--      → item furtado apareceria como OK.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'alissonerp'
      AND table_name   = 'itens_inventario_comercial'
      AND column_name  = 'diferenca'
      AND is_generated = 'NEVER'
  ) THEN
    -- Backup obrigatório antes de mexer na coluna (Database Safety)
    EXECUTE 'CREATE TABLE IF NOT EXISTS alissonerp._backup_336_itens_inventario AS
             SELECT * FROM alissonerp.itens_inventario_comercial';
    EXECUTE 'ALTER TABLE alissonerp.itens_inventario_comercial DROP COLUMN diferenca';
    EXECUTE 'ALTER TABLE alissonerp.itens_inventario_comercial
             ADD COLUMN diferenca INTEGER GENERATED ALWAYS AS
               (COALESCE(quantidade_contada, 0) - quantidade_sistema) STORED';
  END IF;
END $$;

COMMENT ON COLUMN alissonerp.itens_inventario_comercial.pendencia_obs IS
  'Descrição da pendência do item divergente (o que aconteceu). Registrada na contagem/conferência.';
COMMENT ON COLUMN alissonerp.itens_inventario_comercial.pendencia_resolvida IS
  'NULL = sem resposta | true = resolvida | false = não resolvida. Só gerência responde.';
COMMENT ON COLUMN alissonerp.inventarios_comercial.motivo_cancelamento IS
  'Motivo obrigatório informado por quem cancelou o inventário (cancelado_por).';
