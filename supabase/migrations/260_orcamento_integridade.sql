-- 260_orcamento_integridade.sql
-- ============================================================================
-- Fecha lacunas estruturais detectadas em auditoria profunda do modulo
-- orcamento (commits 74b4786, 086c6f2, e9828af).
--
-- Todas as operacoes sao IDEMPOTENTES e NAO-DESTRUTIVAS:
--   - ADD COLUMN IF NOT EXISTS    (safe se ja existir)
--   - ADD CONSTRAINT IF NOT EXISTS via DO block (PG nao tem IF NOT EXISTS pra
--     constraints, entao checamos pg_constraint antes)
--   - CHECK constraint NOT VALID  (nao revalida linhas existentes)
--   - CREATE UNIQUE INDEX CONCURRENTLY com IF NOT EXISTS
--   - SELECT setval                (apenas avanca, nunca regride)
--
-- DIAGNOSTICO RODADO ANTES (em 72.60.55.140:5543, staging):
--   - tipo_pedra existe sem migration declarando (drift)
--   - FK vendedor_id AUSENTE
--   - UNIQUE em numero_orcamento AUSENTE
--   - 0 CHECK constraints em orcamentos
--   - venda_numero_seq DESALINHADA em 1 (15222 vs 15223 max real)
--   - 0 duplicatas em numero_orcamento (safe pra adicionar UNIQUE)
--   - 0 orcamentos com lock=true+snapshot=null (backfill nao necessario)
--   - 0 orcamentos com quantidade=NULL
--
-- BACKUP RECOMENDADO ANTES: pg_dump --schema-only alissonerp > backup_pre260.sql
-- ============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- (1) Formaliza coluna tipo_pedra (drift: existe em prod, sem migration).
-- IF NOT EXISTS = no-op se ja estiver la (cenario atual em staging/prod).
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE alissonerp.orcamento_fichas_tecnicas
  ADD COLUMN IF NOT EXISTS tipo_pedra TEXT;

COMMENT ON COLUMN alissonerp.orcamento_fichas_tecnicas.tipo_pedra IS
  'Tipo da pedra principal (diamante/zirconia/etc). Migrado retroativamente em 260 — coluna existia em prod sem migration declarando.';

-- ──────────────────────────────────────────────────────────────────────────
-- (2) FK orcamentos.vendedor_id -> public.vendedores. NOT VALID evita lock
-- longo em tabelas grandes; novas linhas sao validadas, historicas nao.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'alissonerp.orcamentos'::regclass
      AND conname = 'orcamentos_vendedor_id_fkey'
  ) THEN
    ALTER TABLE alissonerp.orcamentos
      ADD CONSTRAINT orcamentos_vendedor_id_fkey
      FOREIGN KEY (vendedor_id) REFERENCES public.vendedores(id_vendedor)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

-- Indice pra acelerar JOINs e o lookup do FK. Parcial pra economizar disco
-- (a maioria dos orcamentos NAO tem vendedor_id setado historicamente).
CREATE INDEX IF NOT EXISTS idx_orcamentos_vendedor_id
  ON alissonerp.orcamentos(vendedor_id)
  WHERE vendedor_id IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- (3) UNIQUE em numero_orcamento. Diagnostico confirmou ZERO duplicatas em
-- staging. Se rodar em ambiente com duplicatas, falha aqui (proposital —
-- forca conferencia manual antes de seguir).
-- ──────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_orcamentos_numero_orcamento
  ON alissonerp.orcamentos(numero_orcamento);

-- ──────────────────────────────────────────────────────────────────────────
-- (4) CHECK constraints em status, tipo, quantidade.
-- NOT VALID = nao revalida linhas existentes (defesa pra inserts/updates
-- futuros). Se for rodar VALIDATE depois, garantir que prod ja esta limpo.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'alissonerp.orcamentos'::regclass
      AND conname = 'chk_orcamentos_status') THEN
    ALTER TABLE alissonerp.orcamentos
      ADD CONSTRAINT chk_orcamentos_status
      CHECK (status IN ('rascunho','enviado','aprovado','rejeitado','convertido'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'alissonerp.orcamentos'::regclass
      AND conname = 'chk_orcamentos_tipo') THEN
    ALTER TABLE alissonerp.orcamentos
      ADD CONSTRAINT chk_orcamentos_tipo
      CHECK (tipo IN ('alianca','peca'))
      NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'alissonerp.orcamentos'::regclass
      AND conname = 'chk_orcamentos_quantidade') THEN
    ALTER TABLE alissonerp.orcamentos
      ADD CONSTRAINT chk_orcamentos_quantidade
      CHECK (quantidade IS NULL OR quantidade IN (1,2))
      NOT VALID;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────────────
-- (5) Alinha venda_numero_seq com o maximo real. Diagnostico mostrou
-- last_value=15222 mas MAX real=15223 (provavel insert manual fora do
-- nextval). Sem fix, proxima aprovacao gera 15223 -> unique_violation no
-- numero_venda; o retry da rota cobre, mas eh desperdicio. setval garante
-- alinhamento.
-- ──────────────────────────────────────────────────────────────────────────
SELECT setval(
  'alissonerp.venda_numero_seq',
  GREATEST(
    (SELECT last_value FROM alissonerp.venda_numero_seq),
    (SELECT COALESCE(MAX(numero_pedido), 0) FROM public.vendas),
    (SELECT COALESCE(MAX(numero_venda::bigint), 0)
       FROM alissonerp.vendas_erp
       WHERE numero_venda ~ '^[0-9]+$')
  )
);

-- ──────────────────────────────────────────────────────────────────────────
-- (6) Alinha orcamento_seq tambem (defesa em profundidade — diagnostico
-- mostrou alinhada hoje, mas se algum INSERT manual mudar isso, garantir).
-- ──────────────────────────────────────────────────────────────────────────
SELECT setval(
  'alissonerp.orcamento_seq',
  GREATEST(
    (SELECT last_value FROM alissonerp.orcamento_seq),
    (SELECT COALESCE(
      MAX(NULLIF(REGEXP_REPLACE(numero_orcamento, '^ORC-0*', ''), '')::bigint),
      0
    )
    FROM alissonerp.orcamentos
    WHERE numero_orcamento ~ '^ORC-[0-9]+$')
  )
);

-- ──────────────────────────────────────────────────────────────────────────
-- (7) GRANTs nas sequences (consistencia com migration 104 que ja faz pra
-- promocoes_produtos). Idempotente.
-- ──────────────────────────────────────────────────────────────────────────
GRANT USAGE, SELECT ON SEQUENCE alissonerp.orcamento_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE alissonerp.venda_numero_seq TO authenticated;
