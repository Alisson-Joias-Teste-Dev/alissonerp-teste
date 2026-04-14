-- ══════════════════════════════════════════════════════════════════════════
-- Migration 136 — Instalar extensão unaccent
-- ══════════════════════════════════════════════════════════════════════════
-- Objetivo: permitir buscas insensíveis a acentos em todo o sistema.
--
-- Problema resolvido: usuário digita "Joao" e a busca ILIKE não retorna
-- "João" porque PostgreSQL trata os caracteres como diferentes. Com unaccent,
-- normalizamos ambos os lados da comparação:
--
--   WHERE unaccent(cliente_nome) ILIKE unaccent('%termo%')
--
-- Afeta inicialmente:
--   • src/app/(dashboard)/ordens/page.tsx (busca principal de ordens)
--   • src/app/api/pcp/buscar/route.ts (busca PCP server-side)
--
-- Seguro: CREATE EXTENSION IF NOT EXISTS é idempotente. unaccent é uma
-- extensão oficial do PostgreSQL (contrib), sem efeito colateral.
-- ══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Teste: deve retornar 'Joao Maria Ce' (sem acentos)
-- SELECT unaccent('João Maria Çé');
