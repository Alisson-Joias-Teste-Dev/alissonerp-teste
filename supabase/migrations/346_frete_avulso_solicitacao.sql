-- Migration 346: frete avulso com solicitação e liberação
-- REGRA DE NEGÓCIO:
--   O que faz: adiciona o passo "solicitada" ao frete avulso. A consultora
--     solicita a corrida a partir de uma VENDA (para puxar cliente+endereço),
--     escolhe um responsável pela liberação, e o frete NASCE 'solicitada'
--     (SEM lançar saldo de frete). O responsável (ou admin) depois LIBERA
--     ('solicitada'->'pendente', aí sim lança saldo) ou RECUSA ('cancelada').
--     Estoquista/admin/gerente continuam criando o avulso já 'pendente'.
--   Por que: dar à consultora autonomia para pedir a corrida sem poder liberar
--     custo de frete sozinha — a liberação (e o lançamento no saldo da gerente)
--     fica com o responsável designado.
--   Impacto se removido: consultora não consegue solicitar; o avulso volta a
--     nascer sempre liberado.
--   Impacto nas entregas normais e no avulso já existente: ZERO — colunas são
--     todas NULL/opcionais e o valor 'solicitada' é novo; nada que já existe usa.

-- 1. Novo valor do enum de situação.
-- REGRA: 'solicitada' é o estado inicial do avulso pedido pela consultora,
-- antes da liberação. Fica ANTES de 'pendente' (ordem lógica do ciclo de vida).
-- IMPACTO SE REMOVIDO: não há como distinguir avulso pedido de avulso já liberado.
-- OBS TÉCNICA: ALTER TYPE ADD VALUE roda FORA de transação (igual à migration 286).
ALTER TYPE alissonerp.enum_entrega_situacao
  ADD VALUE IF NOT EXISTS 'solicitada' BEFORE 'pendente';

BEGIN;

SET search_path TO alissonerp;

-- 2. Colunas novas do fluxo de solicitação/liberação (todas opcionais).
-- REGRA:
--   endereco_entrega        = endereço confirmado pela consultora, gravado NA
--                             ENTREGA (texto livre); NÃO altera o cadastro do cliente.
--   liberacao_responsavel_id= usuário escolhido pela consultora para liberar/recusar.
--   liberada_por / liberada_em = quem liberou (solicitada->pendente) e quando.
--   motivo_recusa           = texto obrigatório na recusa (solicitada->cancelada).
-- IMPACTO SE REMOVIDO: perde-se rastreabilidade de quem pediu, quem liberou e por quê.
ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS endereco_entrega          TEXT,
  ADD COLUMN IF NOT EXISTS liberacao_responsavel_id  UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS liberada_por              UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS liberada_em               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_recusa             TEXT;

-- 3. Refazer chk_entrega_origem para PERMITIR venda_id em avulso.
-- REGRA: entrega normal (is_avulso=false) continua EXIGINDO venda_id.
-- Avulso (is_avulso=true) passa a ACEITAR venda_id preenchido (solicitação da
-- consultora aponta para a venda) OU nulo (avulso sem venda).
-- IMPACTO SE REMOVIDO: avulso 'solicitada' com venda_id violaria a constraint antiga.
ALTER TABLE alissonerp.entregas_venda
  DROP CONSTRAINT IF EXISTS chk_entrega_origem;

ALTER TABLE alissonerp.entregas_venda
  ADD CONSTRAINT chk_entrega_origem
    CHECK (
      (is_avulso = false AND venda_id IS NOT NULL) OR
      (is_avulso = true)
    );

-- 4. Índice para a aba "Solicitações" filtrar por responsável (partial index).
-- REGRA: a tela lista os avulsos 'solicitada' do responsável logado.
-- IMPACTO SE REMOVIDO: a query da aba faz seq scan conforme cresce o volume.
CREATE INDEX IF NOT EXISTS idx_entregas_liberacao_responsavel
  ON alissonerp.entregas_venda(liberacao_responsavel_id)
  WHERE liberacao_responsavel_id IS NOT NULL;

COMMIT;
