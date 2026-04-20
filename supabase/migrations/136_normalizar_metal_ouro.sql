-- ============================================================
-- Migration 136 — Normalização: produtos ativos sem tipo_metal
-- cujo nome contém "ouro" (case-insensitive) → tipo_metal='Ouro 18k'.
-- A cor (Amarelo/Branco/Rose) permanece pendente.
-- Já aplicada em 2026-04-19 via /api/produtos/normalizar-metal
-- (1.829 linhas alteradas). Mantida aqui para versionamento.
-- ============================================================

UPDATE public.produtos
SET tipo_metal = 'Ouro 18k'
WHERE situacao = 'A'
  AND (tipo_metal IS NULL OR TRIM(tipo_metal) = '')
  AND nome ILIKE '%ouro%';
