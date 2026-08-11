-- ═══════════════════════════════════════════════════════════════════════════
-- 363 — Comissão vira EXTRATO (livro-razão) + débito de devolução + crédito de vale
--
-- O QUÊ
--   1. vale_troca.comissiona_no_uso  → marca o vale cujo uso PODE pagar comissão
--   2. fechamento_comissao_itens.fechamento_id passa a aceitar NULO
--      → o lançamento nasce no MOMENTO DO FATO e o fechamento "adota" depois
--   3. índice de leitura do extrato por consultora atravessando meses
--
-- O PORQUÊ (regra de negócio — decidida por Jonathan em 03/08/2026)
--   A comissão passa a funcionar como EXTRATO BANCÁRIO: cada fato vira um
--   lançamento datado (crédito ou débito) e o saldo rola de um mês pro outro.
--     • cliente pagou              → crédito no mês do pagamento
--     • peça voltou pro estoque    → débito no mês da volta
--     • cliente usou o vale        → crédito pra quem fez a venda nova
--     • empresa pagou a consultora → débito (baixa) no mês do pagamento
--   Invariante que sustenta tudo: CADA REAL RECEBIDO GERA COMISSÃO UMA VEZ SÓ.
--   Por isso o vale só comissiona no uso quando o dinheiro por trás dele
--   ou nunca comissionou, ou já teve a comissão debitada na devolução.
--
--   Antes desta migration a devolução NÃO debitava comissão e o vale-troca
--   NUNCA comissionava (comissionavel=false cravado). Resultado: a comissão
--   ficava presa na venda desfeita e a venda que de fato ficou de pé não pagava
--   nada. Ver docs/regras-negocio/comercial.md §2.
--
-- O IMPACTO SE FOR REMOVIDO
--   • Sem `comissiona_no_uso`: ou todo vale comissiona (paga em dobro nos vales
--     antigos, que nunca foram debitados), ou nenhum comissiona (volta o bug).
--   • Sem `fechamento_id` nulo: o débito da devolução não tem onde nascer fora
--     de um fechamento — o extrato deixa de existir e a comissão volta a só
--     ser calculada na hora de fechar o mês.
--
-- Aditiva: não remove coluna, não altera dado existente, não dropa nada.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. A trava do vale ──────────────────────────────────────────────────────
ALTER TABLE alissonerp.vale_troca
  ADD COLUMN IF NOT EXISTS comissiona_no_uso boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN alissonerp.vale_troca.comissiona_no_uso IS
  'true = usar este vale numa venda PAGA comissão a quem vendeu. Marcado quando '
  'o dinheiro por trás do vale já teve a comissão debitada (vale de devolução) '
  'ou nunca comissionou (vale de venda não paga). Vales anteriores a 07/2026 '
  'ficam false: nunca tiveram débito, comissioná-los pagaria em dobro.';

-- ── 2. O lançamento pode existir antes do fechamento ────────────────────────
ALTER TABLE alissonerp.fechamento_comissao_itens
  ALTER COLUMN fechamento_id DROP NOT NULL;

COMMENT ON COLUMN alissonerp.fechamento_comissao_itens.fechamento_id IS
  'NULO = lançamento solto no extrato, ainda não recolhido por um fechamento. '
  'O fechamento do mês adota os lançamentos soltos da consultora no período. '
  'Antes da migration 363 era obrigatório e a comissão só existia dentro de um '
  'fechamento — o que impedia o débito de devolução de nascer no dia do fato.';

-- ── 3. Leitura do extrato (por consultora, atravessando meses) ──────────────
CREATE INDEX IF NOT EXISTS idx_fech_com_itens_extrato
  ON alissonerp.fechamento_comissao_itens (consultora_id, data_recebimento);

CREATE INDEX IF NOT EXISTS idx_fech_com_itens_soltos
  ON alissonerp.fechamento_comissao_itens (consultora_id, data_recebimento)
  WHERE fechamento_id IS NULL;

-- ── 4. Rastreio do lançamento até a devolução que o gerou ───────────────────
ALTER TABLE alissonerp.fechamento_comissao_itens
  ADD COLUMN IF NOT EXISTS devolucao_id integer REFERENCES alissonerp.devolucoes_venda(id);

COMMENT ON COLUMN alissonerp.fechamento_comissao_itens.devolucao_id IS
  'Preenchido no lançamento de débito gerado pela conclusão de uma devolução. '
  'Serve de trava anti-duplicidade (uma devolução debita uma vez só) e de '
  'rastro no extrato ("Devolução DV-00045").';

-- UMA linha de débito por devolução (soma dos itens que voltaram ao estoque),
-- não uma por item — é assim que o extrato lê. O índice único é a trava: se a
-- conclusão for reprocessada, o segundo INSERT falha em vez de debitar 2x.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fech_com_itens_devolucao
  ON alissonerp.fechamento_comissao_itens (devolucao_id)
  WHERE devolucao_id IS NOT NULL AND status <> 'cancelado';
