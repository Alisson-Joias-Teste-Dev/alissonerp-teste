-- ═══════════════════════════════════════════════════════════════════════════
-- 365 — Entregas de TESTE: somem do relatório de frete grátis
--
-- MOTIVO (03/08/2026): a migration 364 marca contatos de teste, mas **frete
-- avulso não tem cliente**. A corrida "teste de frete avulso" (entrega 47,
-- ENT-20260610-00009, cobrado R$ 0,00 / motoboy R$ 20,00) nasceu sem venda e
-- sem `contato_id` — nenhuma lista de contatos alcança ela. O Jonathan pediu
-- que também não aparecesse; esta chave é a única forma de marcar uma corrida
-- solta.
--
-- ⚠️ EXIBIÇÃO APENAS, igual à 364: não estorna, não mexe em saldo. A entrega 47
-- já foi CANCELADA de verdade em produção (log 353), com contra-lançamento de
-- crédito de R$ 20,00 — esta config só tira a linha do relatório, que continua
-- mostrando o mês de julho como ele foi gravado.
--
-- ⚠️ Lista MANUAL de exceções: cada id aqui é uma linha que some do relatório
-- sem sair do razão. Marcar corrida REAL aqui esconde movimento verdadeiro.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
VALUES (
  'entregas_teste',
  '47',
  'IDs de alissonerp.entregas_venda criadas para TESTE. Os lançamentos de frete grátis delas são ocultados do relatório de fechamento (exibição apenas — não altera saldo nem estorna). Complementa contatos_teste, que não alcança frete avulso (sem cliente). Separar por vírgula.'
)
ON CONFLICT (chave) DO NOTHING;
