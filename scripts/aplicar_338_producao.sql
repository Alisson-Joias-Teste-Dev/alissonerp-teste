-- ============================================================
-- Aplicação da migration 338 em PRODUÇÃO — script tudo-em-um
--
-- O QUÊ: protocolo completo para a migration 338 (desfecho blindado da
--   pendência do inventário comercial): etiqueta de conexão, assinatura
--   no livro, backup da tabela e a migration — transação única.
-- POR QUÊ: token do banco é compartilhado (CLAUDE.md §2) — toda mudança
--   manual precisa ficar assinada e com backup prévio.
-- COMO RODAR: colar TUDO no SQL Editor do Supabase (ou:
--   psql "$DATABASE_URL" -f scripts/aplicar_338_producao.sql — nesse caso
--   o \ir abaixo funciona; no Supabase use a versão inline do chat).
-- IMPACTO: só ADICIONA 2 colunas + 1 constraint CHECK. Re-execução é segura.
-- ============================================================

BEGIN;

-- 1) Etiqueta da conexão
SET LOCAL application_name = 'claude-code-jonathan';

-- 2) Assinatura OBRIGATÓRIA no livro de mudanças (migration 303)
SELECT alissonerp.assinar_mudanca_banco(
  'jonathan',
  'claude-code',
  'Migration 338 — desfecho blindado da pendência do inventário comercial: pendencia_desfecho_tipo (venda_sem_baixa|perda|localizada|excedente_confirmado|outro, com CHECK) e pendencia_desfecho_venda_id (FK vendas_erp) em itens_inventario_comercial',
  'ALTER TABLE alissonerp.itens_inventario_comercial ADD COLUMN IF NOT EXISTS pendencia_desfecho_tipo VARCHAR(30), ADD COLUMN IF NOT EXISTS pendencia_desfecho_venda_id INTEGER REFERENCES alissonerp.vendas_erp(id); DO block: ADD CONSTRAINT chk_itens_inv_desfecho_tipo CHECK (tipo IN 5 valores) se nao existir'
);

-- 3) BACKUP obrigatório antes de ALTER TABLE (só cria se não existir)
DO $$
BEGIN
  IF to_regclass('alissonerp._backup_338_pre_itens_inventario') IS NULL THEN
    EXECUTE 'CREATE TABLE alissonerp._backup_338_pre_itens_inventario AS
             SELECT * FROM alissonerp.itens_inventario_comercial';
  END IF;
END $$;

-- 4) A migration em si (arquivo oficial, sem duplicar código)
\ir ../supabase/migrations/338_inventario_desfechos.sql

COMMIT;

-- 5) CONFERÊNCIA: deve listar as 2 colunas novas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'alissonerp'
  AND table_name = 'itens_inventario_comercial'
  AND column_name LIKE 'pendencia_desfecho%'
ORDER BY column_name;
