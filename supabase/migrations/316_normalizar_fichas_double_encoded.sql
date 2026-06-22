-- ══════════════════════════════════════════════════════════════════════════
-- Migration 316 — Normalizar fichas_tecnicas.dados double-encoded (JSON em JSON)
-- ══════════════════════════════════════════════════════════════════════════
-- O QUÊ: converte fichas_tecnicas.dados gravado como STRING JSON (jsonb scalar
--        string, ex: '"{\"modelo\":...}"') para OBJETO jsonb. 156 de 162 fichas
--        estavam assim.
--
-- POR QUÊ: o padrão antigo `${JSON.stringify(obj)}::jsonb` no driver `postgres`
--        re-serializava a string JS como scalar jsonb (double-encode). O código
--        foi corrigido para `::text::jsonb` (grava objeto) em 7 pontos de escrita
--        (vendas-aprovar, api/ordens, api/ordens/[id]/ficha-tecnica,
--        api/fichas-tecnicas, api/vendas). Esta migration limpa os registros
--        ANTIGOS. Os leitores compensavam via guard `typeof === "string"`, então
--        NÃO houve quebra — é normalização (remove a fragilidade/dívida técnica).
--
-- IMPACTO se removido/revertido: as 156 fichas antigas voltam a ser string; os
--        guards typeof-string nos leitores (ordens/[id]/page.tsx,
--        OrdemDetalheClient) ainda seguram, mas a dívida técnica retorna.
--        MANTER os guards typeof-string como blindagem permanente.
--
-- SEGURO/IDEMPOTENTE: só toca quem ainda é string (WHERE jsonb_typeof='string').
--        Re-rodar é no-op. Sem schema change, sem delete de linha.
--        `#>> '{}'` extrai o texto interno e o re-parseia para objeto jsonb.
--
-- APLICADA EM PRODUÇÃO: 2026-06-22 (assinada via alissonerp.assinar_mudanca_banco,
--        autor jonathan / agente claude-code), após backup + dry-run.
-- ══════════════════════════════════════════════════════════════════════════

UPDATE alissonerp.fichas_tecnicas
SET dados = (dados #>> '{}')::jsonb
WHERE jsonb_typeof(dados) = 'string';
