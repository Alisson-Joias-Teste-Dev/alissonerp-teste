-- ============================================================================
-- Migration 234 — Cleanup de setores duplicados + prevenir duplicatas futuras
-- ============================================================================
-- Estado encontrado: vários setores com mesmo nome (Banca×6, Laser×5, CNC×4,
-- Fundição×4, Alianças×2). Foram cadastrados ao longo do tempo manualmente.
--
-- Estratégia (segura, idempotente):
--   1) Para cada nome duplicado, eleger o setor canônico = menor `id`.
--   2) Re-pointer todas as referências em alissonerp.produto_rota dos setores
--      duplicados pro canônico (preserva rotas existentes).
--   3) Inativar (ativo=false) os setores duplicados, em vez de DELETE — assim
--      preservamos histórico e qualquer FK em outras tabelas (apontamentos,
--      transferências) continua válida apontando pro setor antigo.
--   4) Adicionar UNIQUE INDEX parcial em LOWER(TRIM(nome)) WHERE ativo=true
--      pra impedir cadastro duplicado novo via UI.
--
-- Segurança:
--   • UPDATE/INSERT idempotentes (NOT EXISTS guard onde aplicável)
--   • Sem DELETE
--   • CREATE INDEX IF NOT EXISTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1+2) Merge: re-pointer produto_rota + inativar duplicatas
-- ----------------------------------------------------------------------------
-- Tabela temporária com (canonical_id, duplicate_id) para cada par a fundir.
WITH canonicos AS (
  SELECT
    LOWER(TRIM(nome)) AS chave,
    MIN(id) AS canonical_id
  FROM alissonerp.setores
  WHERE ativo = true
  GROUP BY LOWER(TRIM(nome))
),
duplicatas AS (
  SELECT s.id AS duplicate_id, c.canonical_id
  FROM alissonerp.setores s
  JOIN canonicos c ON c.chave = LOWER(TRIM(s.nome))
  WHERE s.ativo = true AND s.id <> c.canonical_id
)
-- 2a) Atualiza rotas pra apontar ao setor canônico
UPDATE alissonerp.produto_rota pr
SET setor_id = d.canonical_id, updated_at = NOW()
FROM duplicatas d
WHERE pr.setor_id = d.duplicate_id;

-- 2b) Inativa as duplicatas
UPDATE alissonerp.setores s
SET ativo = false, updated_at = NOW()
WHERE s.ativo = true
  AND s.id <> (
    SELECT MIN(s2.id) FROM alissonerp.setores s2
    WHERE s2.ativo = true AND LOWER(TRIM(s2.nome)) = LOWER(TRIM(s.nome))
  );

-- ----------------------------------------------------------------------------
-- 3) Unique index parcial (case-insensitive, ignora espaços) pra impedir
--    cadastros duplicados futuros via API.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_setores_nome_ativo
  ON alissonerp.setores (LOWER(TRIM(nome)))
  WHERE ativo = true;

COMMENT ON INDEX alissonerp.uniq_setores_nome_ativo IS
  'Impede 2 setores ATIVOS com mesmo nome (case-insensitive, ignora espaços nas pontas). Inativos podem repetir, pra preservar histórico.';

-- ============================================================================
-- Fim migration 234
-- ============================================================================
