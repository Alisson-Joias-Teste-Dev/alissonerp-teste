-- Migration 353: frete avulso com solicitação e liberação (modelo TAREFA/POOL)
-- NOTA: esta migration nasceu numerada como 346 e foi RENUMERADA para 353 antes
-- do PR — o número 346 já pertencia a `346_conversao_reversa.sql`, que subiu para
-- produção enquanto esta feature estava parada. O conteúdo não mudou.
-- REGRA DE NEGÓCIO:
--   O que faz: adiciona o passo "solicitada" ao frete avulso. A consultora
--     solicita a corrida a partir de uma VENDA (para puxar cliente+endereço)
--     e o frete NASCE 'solicitada' (SEM lançar saldo de frete). A solicitação
--     vira uma TAREFA DE APROVAÇÃO (mesma engrenagem de compra comercial e
--     inventário) para os usuários configurados na chave MULTI de config
--     `aprovadores_frete_avulso` (Config › Aprovadores). QUALQUER um desses
--     aprovadores — ou admin/dev/diretor — pode decidir a MESMA tarefa (pool:
--     ver as 3 extensões aditivas do módulo Tarefas, escopadas por
--     tipo='frete_avulso') e LIBERAR ('solicitada'->'pendente', aí sim lança
--     saldo) ou RECUSAR ('cancelada'). Estoquista/admin/gerente continuam
--     criando o avulso já 'pendente' (sem passar por solicitação/tarefa).
--   Por que: dar à consultora autonomia para pedir a corrida sem poder liberar
--     custo de frete sozinha — a liberação (e o lançamento no saldo da gerente)
--     fica com qualquer aprovador da lista, não com um único responsável fixo
--     (evita gargalo quando o responsável escolhido está ausente). Reusa a
--     infraestrutura de Tarefas/aprovações já existente em vez de duplicar
--     tabela e tela próprias (modelo anterior, revertido nesta migration).
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
--   liberada_por / liberada_em = quem liberou (solicitada->pendente) e quando.
--   motivo_recusa           = texto obrigatório na recusa (solicitada->cancelada).
-- IMPACTO SE REMOVIDO: perde-se rastreabilidade de quem pediu, quem liberou e por quê.
ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS endereco_entrega          TEXT,
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

-- 4. Vínculo da solicitação com a tarefa de aprovação (modelo TAREFA).
-- REGRA DE NEGÓCIO:
--   O que faz: guarda em qual tarefa (alissonerp.tarefas) está a decisão desta
--     solicitação de frete avulso — mesmo padrão de
--     compras_comercial.tarefa_aprovacao_id e solicitacoes_inventario.tarefa_id.
--     O handler da decisão (PATCH /api/tarefas/[id]/aprovacao, tipo
--     'frete_avulso') busca a entrega por este campo para chamar
--     liberarFreteAvulso/recusarFreteAvulso.
--   Por que: substitui a lista própria de liberadores (frete_avulso_liberadores,
--     removida acima) — quem pode decidir é configurado na chave MULTI
--     `aprovadores_frete_avulso` (Config › Aprovadores), e a decisão em si
--     acontece na TAREFA (aprovacoes_tarefa), não numa aba própria de entregas.
--   Impacto se removido: a solicitação criaria a tarefa mas o dispatcher de
--     aprovação não saberia qual entrega liberar/recusar.
ALTER TABLE alissonerp.entregas_venda
  ADD COLUMN IF NOT EXISTS tarefa_aprovacao_id INTEGER REFERENCES alissonerp.tarefas(id);

CREATE INDEX IF NOT EXISTS idx_entregas_tarefa_aprovacao
  ON alissonerp.entregas_venda(tarefa_aprovacao_id) WHERE tarefa_aprovacao_id IS NOT NULL;

COMMIT;
