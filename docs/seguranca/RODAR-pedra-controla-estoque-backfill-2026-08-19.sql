-- ════════════════════════════════════════════════════════════════════════════
-- RODAR NO BANCO — Pedras já cadastradas: corrige controla_estoque + tem_pedra_preciosa
-- Autorizado por: Alisson — 2026-08-19 ("nenhuma pedra controla estoque")
-- Reversível (não apaga nada, só corrige 2 campos). Escopo: só categoria='Pedras'.
--
-- Contexto: o revert de emergência de 13/08 (87806d16) apagou por engano um ajuste
-- de 12/08 no CADASTRO de pedra (peça avulsa / lote) — já corrigido em
-- src/app/api/produtos/{peca-avulsa,pedras-bulk}/route.ts (commit e2ef6907, v2.83.9).
-- Este script arruma os dados das pedras que já existiam ANTES desse conserto —
-- o código novo só protege pedra cadastrada daqui pra frente.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Diagnóstico ANTES (confira os números aqui antes de confirmar) ───────────
SELECT
  (SELECT COUNT(*) FROM alissonerp.erp_produtos p
    WHERE p.categoria ILIKE 'Pedras%'
      AND NOT EXISTS (SELECT 1 FROM alissonerp.estoque_comercial_config c WHERE c.produto_id = p.produto_id)
  ) AS pedras_sem_config_estoque,
  (SELECT COUNT(*) FROM alissonerp.erp_produtos p
    JOIN alissonerp.estoque_comercial_config c ON c.produto_id = p.produto_id
    WHERE p.categoria ILIKE 'Pedras%' AND c.controla_estoque = true
  ) AS pedras_com_controla_estoque_errado,
  (SELECT COUNT(*) FROM alissonerp.erp_produtos
    WHERE categoria ILIKE 'Pedras%' AND tem_pedra_preciosa = true
  ) AS pedras_com_tem_pedra_preciosa_errado;

-- ─── PARTE 1 ─── Nenhuma pedra controla estoque de venda (saldo é à parte) ─────
SELECT alissonerp.assinar_mudanca_banco(
  'alisson', 'claude-code',
  'Pedras (categoria=Pedras) já cadastradas: garante controla_estoque=false em estoque_comercial_config — pedra solta usa saldo próprio em public.estoque, nunca reserva/baixa de venda comercial. Cria a linha quando falta; corrige quando já existe com true.',
  'INSERT INTO alissonerp.estoque_comercial_config (produto_id, controla_estoque, ativo) SELECT produto_id, false, true FROM alissonerp.erp_produtos WHERE categoria ILIKE ''Pedras%'' ON CONFLICT (produto_id) DO UPDATE SET controla_estoque = false'
);

INSERT INTO alissonerp.estoque_comercial_config (produto_id, controla_estoque, ativo)
SELECT p.produto_id, false, true
FROM alissonerp.erp_produtos p
WHERE p.categoria ILIKE 'Pedras%'
ON CONFLICT (produto_id) DO UPDATE SET controla_estoque = false;

-- ─── PARTE 2 ─── tem_pedra_preciosa é da JOIA com pedra, nunca da pedra solta ──
SELECT alissonerp.assinar_mudanca_banco(
  'alisson', 'claude-code',
  'Pedras (categoria=Pedras) já cadastradas com tem_pedra_preciosa=true (bug do cadastro em lote, reintroduzido pelo revert de 13/08): corrige para false — esse campo marca joia que TEM pedra engastada, não a pedra sozinha.',
  'UPDATE alissonerp.erp_produtos SET tem_pedra_preciosa = false WHERE categoria ILIKE ''Pedras%'' AND tem_pedra_preciosa = true'
);

UPDATE alissonerp.erp_produtos
SET tem_pedra_preciosa = false
WHERE categoria ILIKE 'Pedras%' AND tem_pedra_preciosa = true;

-- ─── Diagnóstico DEPOIS (os 3 números acima devem virar 0) ─────────────────────
SELECT
  (SELECT COUNT(*) FROM alissonerp.erp_produtos p
    WHERE p.categoria ILIKE 'Pedras%'
      AND NOT EXISTS (SELECT 1 FROM alissonerp.estoque_comercial_config c WHERE c.produto_id = p.produto_id)
  ) AS pedras_sem_config_estoque,
  (SELECT COUNT(*) FROM alissonerp.erp_produtos p
    JOIN alissonerp.estoque_comercial_config c ON c.produto_id = p.produto_id
    WHERE p.categoria ILIKE 'Pedras%' AND c.controla_estoque = true
  ) AS pedras_com_controla_estoque_errado,
  (SELECT COUNT(*) FROM alissonerp.erp_produtos
    WHERE categoria ILIKE 'Pedras%' AND tem_pedra_preciosa = true
  ) AS pedras_com_tem_pedra_preciosa_errado;

-- Se os 3 números acima estiverem 0: COMMIT;
-- Se algum número parecer estranho (muito maior que o esperado): ROLLBACK; e avisa.
COMMIT;
