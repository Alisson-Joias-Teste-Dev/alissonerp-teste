-- ============================================================
-- Aplicação da migration 336 em PRODUÇÃO — script tudo-em-um
--
-- O QUÊ: executa o protocolo completo do projeto para a migration 336
--   (pendências do inventário comercial): etiqueta de conexão,
--   assinatura no livro, backup das tabelas e a migration em si —
--   tudo numa transação única (ou aplica tudo, ou nada).
-- POR QUÊ: o token do banco é compartilhado (CLAUDE.md §2) — toda
--   mudança manual precisa ficar assinada e com backup prévio.
-- COMO RODAR (no computador do Jonathan, na raiz do repo):
--   psql "$DATABASE_URL" -f scripts/aplicar_336_producao.sql
-- IMPACTO: só ADICIONA colunas/índice nas 2 tabelas de inventário.
--   Rodar mais de uma vez é seguro (tudo é IF NOT EXISTS).
-- ============================================================

BEGIN;

-- 1) Etiqueta da conexão (o livro captura o app_name sozinho)
SET LOCAL application_name = 'claude-code-jonathan';

-- 2) Assinatura OBRIGATÓRIA no livro de mudanças (migration 303)
SELECT alissonerp.assinar_mudanca_banco(
  'jonathan',
  'claude-code',
  'Migration 336 — pendências do inventário comercial: campos de pendência por item (descrição, autor/data, resolvida Sim/Não, obs/autor/data do desfecho), cancelado_por + motivo_cancelamento em inventários, índice parcial de pendências abertas e blindagem que garante a coluna diferenca como GENERATED',
  'ALTER TABLE alissonerp.itens_inventario_comercial ADD COLUMN IF NOT EXISTS pendencia_obs/pendencia_registrada_por/pendencia_registrada_em/pendencia_resolvida/pendencia_resolucao_obs/pendencia_resolvida_por/pendencia_resolvida_em/conferido/conferido_em; ALTER TABLE alissonerp.inventarios_comercial ADD COLUMN IF NOT EXISTS cancelado_por, motivo_cancelamento; CREATE INDEX IF NOT EXISTS idx_itens_inv_pendencia_aberta; DO block: se diferenca nao for GENERATED, backup + recria como GENERATED ALWAYS (COALESCE(quantidade_contada,0)-quantidade_sistema) STORED'
);

-- 3) BACKUP obrigatório antes de ALTER TABLE (Database Safety §2)
--    Só cria se ainda não existir (re-execução não duplica backup)
DO $$
BEGIN
  IF to_regclass('alissonerp._backup_336_pre_itens_inventario') IS NULL THEN
    EXECUTE 'CREATE TABLE alissonerp._backup_336_pre_itens_inventario AS
             SELECT * FROM alissonerp.itens_inventario_comercial';
  END IF;
  IF to_regclass('alissonerp._backup_336_pre_inventarios') IS NULL THEN
    EXECUTE 'CREATE TABLE alissonerp._backup_336_pre_inventarios AS
             SELECT * FROM alissonerp.inventarios_comercial';
  END IF;
END $$;

-- 4) A migration em si (arquivo oficial, sem duplicar código)
\ir ../supabase/migrations/336_inventario_pendencias.sql

COMMIT;

-- 5) CONFERÊNCIA: deve listar 7 colunas pendencia_* + cancelado_por/motivo
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'alissonerp'
  AND (
    (table_name = 'itens_inventario_comercial' AND column_name LIKE 'pendencia%')
    OR (table_name = 'inventarios_comercial' AND column_name IN ('cancelado_por','motivo_cancelamento'))
  )
ORDER BY table_name, column_name;

-- diferenca deve estar como ALWAYS (gerada pelo banco)
SELECT column_name, is_generated
FROM information_schema.columns
WHERE table_schema = 'alissonerp'
  AND table_name = 'itens_inventario_comercial'
  AND column_name = 'diferenca';
