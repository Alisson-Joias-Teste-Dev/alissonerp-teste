-- =====================================================================
-- Migration 175: Dashboard Comercial — Permissões de módulo
-- =====================================================================
-- Registra o módulo 'dashboard_comercial' em alissonerp.role_permissoes
-- para as roles que têm acesso (conforme decisão do Jonathan):
--   ✓ desenvolvedor  → acesso total
--   ✓ admin          → acesso total
--   ✓ gerente_loja   → acesso total (é quem mais usa)
--   ✓ consultora     → acesso total (vê a própria performance)
--   ✗ gerente_fabrica → sem acesso (é fábrica)
--   ✗ ourives / pcp  → sem acesso (fábrica)
--   ✗ motoboy        → sem acesso
--   ✗ estoquistas    → sem acesso
-- =====================================================================

INSERT INTO alissonerp.role_permissoes (role, modulo, pode_ler, pode_escrever, ativo)
VALUES
  ('desenvolvedor', 'dashboard_comercial', true, true,  true),
  ('admin',         'dashboard_comercial', true, true,  true),
  ('gerente_loja',  'dashboard_comercial', true, true,  true),
  ('consultora',    'dashboard_comercial', true, false, true)
ON CONFLICT (role, modulo) DO UPDATE SET
  pode_ler = EXCLUDED.pode_ler,
  pode_escrever = EXCLUDED.pode_escrever,
  ativo = true,
  atualizado_em = now();
