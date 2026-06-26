-- ============================================================
-- Migration 137 — Unificação das categorias de metal
-- 'Ouro' + 'Ouro 18k' → 'Ouro Amarelo 18k'
-- Aplicada em 2026-04-19 via /api/produtos/rename-metal
-- (13.876 linhas atualizadas, incluindo pais e variações).
-- ============================================================

UPDATE public.produtos
SET tipo_metal = 'Ouro Amarelo 18k'
WHERE tipo_metal IN ('Ouro', 'Ouro 18k');
