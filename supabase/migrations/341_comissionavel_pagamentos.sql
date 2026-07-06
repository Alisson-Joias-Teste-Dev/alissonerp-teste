-- ============================================================
-- Migration 341 — Coluna comissionavel em pagamentos_venda
--
-- O QUÊ: adiciona alissonerp.pagamentos_venda.comissionavel (bool, default
--   true) e faz backfill = false para Vale-Troca.
-- POR QUÊ: o motor de comissão só sabia excluir pagamento por
--   forma = 'Vale-Troca'. Mas registrar-pagamento (crediário) deixava
--   forma_recebimento OPCIONAL — quando o operador confirmava uma baixa
--   sem escolher a forma, `forma` ficava 'A Receber' para sempre, mesmo
--   quando na prática foi Vale-Troca, permuta ou desconto tirado da
--   própria consultora. Resultado: 3 pagamentos assim geraram comissão
--   indevida no fechamento de jun/2026 (R$179,06 — achado e revertido
--   em 06/07/2026, ver docs/regras-negocio/comercial.md §2).
-- COMO: coluna explícita e obrigatória (não depende de string-matching
--   em `forma` nem de ler comentário livre). registrar-pagamento passa a
--   EXIGIR forma_recebimento e marca comissionavel=false para
--   Vale-Troca/Permuta/Ajuste Consultora.
-- IMPACTO SE REMOVIDO: comissão volta a poder ser calculada sobre
--   pagamento que não é dinheiro novo.
-- ============================================================

ALTER TABLE alissonerp.pagamentos_venda
  ADD COLUMN IF NOT EXISTS comissionavel boolean NOT NULL DEFAULT true;

UPDATE alissonerp.pagamentos_venda
SET comissionavel = false
WHERE forma = 'Vale-Troca' AND comissionavel = true;

COMMENT ON COLUMN alissonerp.pagamentos_venda.comissionavel IS
  'false = este pagamento não é dinheiro novo (Vale-Troca/Permuta/Ajuste Consultora) e nunca deve gerar comissão. Fonte única para o motor de fechamento de comissão — ver comercial.md §2.';
