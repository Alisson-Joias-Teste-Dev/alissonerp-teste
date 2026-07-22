-- Migration 359: quem paga o frete avulso solicitado (loja x cliente)
-- REGRA DE NEGÓCIO (decisão do Jonathan, 21/07):
--   O que faz: adiciona à SOLICITAÇÃO de frete avulso (migration 353) o campo
--     "quem paga" — 'loja' ou 'cliente' — e a coluna do comprovante de
--     pagamento (foto), obrigatório só quando quem paga é o cliente.
--   Por que: o aprovador certo muda conforme quem assume o custo.
--     'cliente' paga  -> exige foto do comprovante -> tarefa vai para o MESMO
--       pool de sempre (`aprovadores_frete_avulso`), que aqui serve para
--       ACOMPANHAR a entrega (o dinheiro já está com a loja).
--     'loja' paga     -> foto não é exigida -> tarefa vai para uma lista NOVA
--       e separada (`aprovadores_frete_avulso_loja`, Config › Aprovadores),
--       que autoriza o CUSTO assumido pela loja.
--     Continua sendo UMA etapa só de aprovação nos dois casos — só muda QUEM
--     decide (ver eventoDaTarefa em src/lib/aprovacoes/evento-da-tarefa.ts,
--     que lê a tag `frete_pagante:loja` gravada na tarefa para escolher entre
--     os eventos 'frete_avulso' e 'frete_avulso_loja' do catálogo).
--   Impacto se removido: não dá para diferenciar quem paga a corrida, e o
--     aprovador correto (pool vs custo da loja) não pode ser resolvido.
--   Impacto nas entregas normais e no avulso direto (loja/admin/estoquista):
--     ZERO — colunas são todas NULL/opcionais; só o modo SOLICITAÇÃO grava
--     `pagante` (validado em criarFreteAvulso, src/lib/entrega-venda.ts).

BEGIN;

SET search_path TO alissonerp;

-- 1. Quem paga o frete avulso solicitado.
-- REGRA: só preenchido no modo solicitação (modoSolicitacao=true). NULL nos
-- registros antigos (anteriores a esta migration) e na criação DIRETA
-- (loja/admin/estoquista/entregador), que continua sempre a cargo da loja
-- sem passar por este campo.
-- IMPACTO SE REMOVIDO: perde-se a informação de quem assume o custo — a
-- resolução do aprovador (evento 'frete_avulso' x 'frete_avulso_loja') fica
-- sem dado para decidir.
ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS pagante TEXT;

ALTER TABLE alissonerp.entregas_venda
  DROP CONSTRAINT IF EXISTS chk_entrega_frete_avulso_pagante;

ALTER TABLE alissonerp.entregas_venda
  ADD CONSTRAINT chk_entrega_frete_avulso_pagante
    CHECK (pagante IS NULL OR pagante IN ('loja', 'cliente'));

-- 2. Comprovante de pagamento do frete (quando pagante='cliente').
-- REGRA: coluna PRÓPRIA — `foto_entrega_path` (migration 287) já existe, mas
-- é a foto tirada na CONFIRMAÇÃO da entrega (retirada/recebimento pelo código
-- A/B, ver confirmarEntrega em entrega-venda.ts), semanticamente diferente e
-- gravada em outro momento do ciclo de vida. O comprovante aqui é anexado
-- pela CONSULTORA, na SOLICITAÇÃO, antes de qualquer decisão do aprovador —
-- reusa o MESMO bucket de storage (`pagamento-fotos`, já usado por
-- foto_entrega_path e por compras/recebimentos de metal), só em coluna nova.
-- IMPACTO SE REMOVIDO: sem onde guardar o path, a exigência de comprovante
-- (pagante='cliente') não teria como ser validada nem consultada depois.
ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS comprovante_pagante_path TEXT;

COMMIT;
