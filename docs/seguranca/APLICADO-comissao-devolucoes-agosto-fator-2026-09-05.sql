-- APLICADO EM PRODUCAO 05/09/2026 (log_mudancas_banco 480) — autorizado pelo Jonathan.
--
-- O QUE FAZ: ajusta 3 debitos de devolucao da Debora Eduarda (consultora_id 4) para
--   METADE do valor, porque sao devolucoes de VENDAS DE AGOSTO/2026 — mes em que ela
--   nao bateu a meta (88,94%) e a comissao foi paga pela metade.
--
-- O PORQUE: devolve-se so o que foi PAGO. O debito foi gravado pelo valor cheio,
--   antes da regra do fator existir (migration 376). Sem este acerto, o extrato da
--   tela mostra R$ 344,31 de debito enquanto o valor efetivamente pago ao setor
--   considerou R$ 290,60 — divergencia de R$ 53,71 contra a consultora.
--
-- O IMPACTO SE NAO RODAR: a tela de comissao de agosto nao bate com o que foi pago.
-- O IMPACTO SE RODAR DUAS VEZES: os debitos cairiam para 1/4 do valor. Por isso o
--   UPDATE e por ID e so age quando o valor ainda e o cheio (guarda no WHERE).
--
-- Os 3 itens estao SOLTOS (fechamento_id IS NULL): agosto/2026 ainda nao tem
-- fechamento gerado, entao nenhum pagamento e reaberto por este acerto.

SELECT alissonerp.assinar_mudanca_banco(
  'jonathan',
  'claude-code',
  'Ajusta 3 debitos de devolucao de ago/2026 da Debora (vendas de agosto, mes sem meta) para metade — devolve-se so o que foi pago (regra da migration 376)',
  'UPDATE alissonerp.fechamento_comissao_itens SET comissao_calculada = comissao_calculada/2, comissao_bruta, fator_meta=0.5, motivo_fator WHERE id IN (596b6c87..., 18b7130a..., 6dc8c3a7...)'
);

UPDATE alissonerp.fechamento_comissao_itens SET
  comissao_bruta     = comissao_calculada,               -- guarda o valor cheio
  comissao_calculada = ROUND(comissao_calculada / 2, 2), -- fator 0,5 de agosto/2026
  fator_meta         = 0.5,
  motivo_fator       = 'débito proporcional — a comissão desta venda foi paga a 50,00%',
  updated_at         = now()
WHERE id IN (
  '596b6c87-3447-4d76-aa3c-a07227e48efc',  -- DV-00067, pedido 15932, venda 07/08 — -62,49 -> -31,25
  '18b7130a-e362-4439-9bc2-21f0484fff73',  -- DV-00080, pedido 16003, venda 21/08 —  -6,90 ->  -3,45
  '6dc8c3a7-9e6d-4e4e-916c-dd579ccaa55a'   -- DV-00082, pedido 16022, venda 26/08 — -38,04 -> -19,02
)
  AND fator_meta IS NULL      -- guarda anti-duplicidade: so age em item ainda sem fator
  AND fechamento_id IS NULL;  -- nunca mexe em item que ja entrou num fechamento

-- Conferencia (esperado: -31,25 / -3,45 / -19,02, somando -53,72 de alivio):
SELECT numero_venda_snapshot, comissao_bruta, comissao_calculada, fator_meta
FROM alissonerp.fechamento_comissao_itens
WHERE id IN ('596b6c87-3447-4d76-aa3c-a07227e48efc',
             '18b7130a-e362-4439-9bc2-21f0484fff73',
             '6dc8c3a7-9e6d-4e4e-916c-dd579ccaa55a');
