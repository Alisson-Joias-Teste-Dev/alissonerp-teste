-- Migration 348: Garantia vitalícia por tipo de serviço
-- ─────────────────────────────────────────────────────────────────────────────
-- O QUÊ:
--   Adiciona alissonerp.tipos_servico.garantia_vitalicia (BOOLEAN, default false)
--   e marca 'Acabamento e polimento' como o único tipo vitalício hoje.
--
-- PORQUÊ:
--   Regra aprovada pelo Jonathan em 17/07/2026 (docs/regras-negocio/ordens.md §2.2):
--   garantia de acabamento/polimento é VITALÍCIA (sem prazo, desde que a venda
--   esteja entregue); todo o resto vale 7 dias úteis a partir da entrega, e fora
--   disso só com aprovação.
--
--   A marcação é DADO, não código, de propósito: o Jonathan muda quais serviços
--   são vitalícios na tela de tipos de serviço (admin), sem deploy. Se fosse uma
--   lista no TypeScript, cada mudança de regra de negócio viraria uma release.
--
--   Default FALSE é a escolha segura: tipo de serviço novo nasce COM prazo. O
--   contrário (nascer vitalício por engano) daria garantia eterna sem ninguém
--   perceber.
--
-- POR QUE SÓ 'Acabamento e polimento' (decisão B1, 17/07):
--   - 'Solda e Limpeza' (100 usos) NÃO entra: o tipo mistura limpeza (que seria
--     vitalícia) com solda (que não é). Marcar vitalício daria solda de graça
--     para sempre.
--   - 'Outros' (166 usos, o tipo mais usado) NÃO entra: é texto livre, não dá
--     para saber o que é.
--
-- IMPACTO SE REMOVIDO/ALTERADO:
--   Sem a coluna, avaliarGarantia() (src/lib/garantia/prazo-garantia.ts) não
--   consegue distinguir serviço vitalício de serviço com prazo, e TODA garantia
--   passa a cair na regra dos 7 dias úteis — inclusive polimento, que deveria ser
--   vitalício. Marcar um tipo errado como vitalício abre garantia eterna para ele.
--
-- IDEMPOTENTE: pode rodar de novo sem efeito colateral.
--
-- ROLLBACK:
--   ALTER TABLE alissonerp.tipos_servico DROP COLUMN garantia_vitalicia;
--   (não faça isso em prod sem antes remover a leitura no código — a garantia
--    volta a não ter regra de prazo nenhuma)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. A coluna. NOT NULL + default false: tipo novo nasce COM prazo (ver acima).
ALTER TABLE alissonerp.tipos_servico
  ADD COLUMN IF NOT EXISTS garantia_vitalicia BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN alissonerp.tipos_servico.garantia_vitalicia IS
  'Garantia vitalícia (sem prazo) para este tipo de serviço, desde que a venda '
  'esteja entregue. false = vale o prazo de 7 dias úteis desde a entrega. '
  'Editável pelo admin na tela de tipos de serviço — é config, não código. '
  'Regra: docs/regras-negocio/ordens.md §2.2 (Jonathan, 17/07/2026).';

-- 2. O único vitalício hoje. Casado por NOME (não por id): o id 3 é o de PRODUÇÃO,
--    mas homolog/local podem ter numeração diferente. O nome vem do seed da
--    migration 100 e é o mesmo nos dois ambientes.
UPDATE alissonerp.tipos_servico
   SET garantia_vitalicia = true
 WHERE nome = 'Acabamento e polimento'
   AND garantia_vitalicia IS DISTINCT FROM true;

-- 3. Rede de segurança: se o nome do seed mudou, o UPDATE acima não pega nada e a
--    regra sobe muda — polimento cairia nos 7 dias e ninguém perceberia até um
--    cliente ser barrado. Falha aqui, alto e claro, em vez de errar em silêncio.
DO $$
DECLARE
  v_qtd INTEGER;
BEGIN
  SELECT count(*) INTO v_qtd
    FROM alissonerp.tipos_servico
   WHERE garantia_vitalicia = true;

  IF v_qtd = 0 THEN
    RAISE EXCEPTION
      'Migration 348: nenhum tipo de serviço ficou marcado como garantia_vitalicia. '
      'Esperado: "Acabamento e polimento". O nome do tipo mudou? '
      'Conferir alissonerp.tipos_servico e ajustar antes de seguir.';
  END IF;

  RAISE NOTICE 'Migration 348: % tipo(s) de serviço marcado(s) como garantia vitalícia.', v_qtd;
END $$;
