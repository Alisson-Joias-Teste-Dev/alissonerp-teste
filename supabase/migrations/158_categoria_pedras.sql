-- ============================================================
-- Migration 158 — Categoria "Pedras"
--
-- 1. Normaliza variações da categoria ("Pedra", "Pedras Preciosas",
--    "pedras", "Pedras -> Diamante", etc.) para a string canônica "Pedras".
--    Mantém a hierarquia "Pedras -> Filho" se existir.
--
-- 2. Força categoria = 'Pedras' em produtos ATIVOS marcados como
--    tem_pedra_preciosa=true que estejam sem categoria (NULL/vazia).
--    Isso garante que a categoria apareça no filtro /produtos antes
--    mesmo do primeiro cadastro em massa.
--
-- Segurança:
--   - Só UPDATE (não DROP / DELETE).
--   - Só mexe no campo categoria.
--   - Aceita re-execução (idempotente).
-- ============================================================

-- ── 1. Normaliza variações para 'Pedras' (preserva subcategoria se houver) ─
UPDATE public.produtos
SET categoria = REGEXP_REPLACE(
    TRIM(categoria),
    '^(pedra|pedras)(\s+preciosas?)?(\s*->\s*)?',
    CASE
        WHEN TRIM(categoria) ~* '^(pedra|pedras)(\s+preciosas?)?\s*->' THEN 'Pedras -> '
        ELSE 'Pedras'
    END,
    'i'
)
WHERE categoria IS NOT NULL
  AND TRIM(categoria) <> ''
  AND TRIM(categoria) ~* '^(pedra|pedras)(\s+preciosas?)?($|\s*->)'
  AND TRIM(categoria) <> 'Pedras'
  AND TRIM(categoria) NOT LIKE 'Pedras -> %';

-- ── 2. Atribui 'Pedras' a pedras preciosas sem categoria ──────────────────
UPDATE public.produtos
SET categoria = 'Pedras'
WHERE situacao = 'A'
  AND tem_pedra_preciosa = true
  AND (categoria IS NULL OR TRIM(categoria) = '');
