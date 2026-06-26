-- Snapshot + lock para travar valor negociado do orçamento.
-- Sem isso, reabrir o orçamento recalculava da ficha técnica e o Salvar
-- subscrevia silenciosamente o valor combinado com o cliente.

ALTER TABLE alissonerp.orcamentos
  ADD COLUMN IF NOT EXISTS snapshot JSONB,
  ADD COLUMN IF NOT EXISTS congelado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS valor_negociado_locked BOOLEAN NOT NULL DEFAULT false;

-- Feature flag global (ligada por padrão; desligue só pra debug).
ALTER TABLE alissonerp.config_orcamento
  ADD COLUMN IF NOT EXISTS snapshot_lock_enabled BOOLEAN NOT NULL DEFAULT true;

-- Backfill: orçamentos ativos (rascunho/enviado/aprovado) recebem snapshot
-- dos valores atuais. Rejeitado/convertido ficam como estão — não fazem
-- mais parte do fluxo editável.
UPDATE alissonerp.orcamentos SET
  snapshot = jsonb_build_object(
    'valor', valor,
    'peso', peso,
    'valor_ouro', COALESCE(valor_ouro, 0),
    'valor_pedras', COALESCE(valor_pedras, 0),
    'desconto_pct', desconto_pct,
    'markup', markup,
    'cotacao_ouro', cotacao_ouro,
    'cotacao_dolar', COALESCE(cotacao_dolar, 0)
  ),
  congelado_em = COALESCE(updated_at, created_at, NOW()),
  valor_negociado_locked = true
WHERE status IN ('rascunho', 'enviado', 'aprovado')
  AND snapshot IS NULL;
