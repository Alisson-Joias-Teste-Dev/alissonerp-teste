-- ============================================================
-- Migration 295 — Blindagem dos códigos de entrega (2026-06-11)
--
-- REGRA DE NEGÓCIO:
-- O QUE: adiciona controle de tentativas de confirmação por código na
--   entrega. Após 5 tentativas erradas a entrega fica BLOQUEADA para
--   confirmação até um gerente/admin desbloquear.
-- POR QUE: o código tem 6 dígitos (1 milhão de combinações). Sem limite
--   de tentativas, um operador mal-intencionado poderia tentar adivinhar
--   o código e confirmar a entrega sem o cliente presente.
-- IMPACTO SE REMOVIDO: o sistema de dois códigos perde a proteção contra
--   força bruta (achado da análise docs/analise-vendas-entregas-2026-06.md).
--
-- Database Safety §2: apenas ADD COLUMN IF NOT EXISTS (sem DROP, sem
-- alteração de colunas existentes). Reversível com segurança.
-- ============================================================

ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS tentativas_codigo INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS codigo_bloqueado_em TIMESTAMPTZ;

COMMENT ON COLUMN alissonerp.entregas_venda.tentativas_codigo IS
  'Contador de tentativas ERRADAS de confirmação por código. Zera ao acertar ou ao desbloquear.';
COMMENT ON COLUMN alissonerp.entregas_venda.codigo_bloqueado_em IS
  'Quando preenchido, a entrega está bloqueada para confirmação por código (5 erros). Só gerente/admin desbloqueia.';

-- ============================================================
-- Fim migration 295
-- ============================================================
