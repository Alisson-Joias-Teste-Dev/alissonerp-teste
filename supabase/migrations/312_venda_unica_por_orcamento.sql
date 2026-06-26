-- 312_venda_unica_por_orcamento.sql
--
-- REGRA DE NEGÓCIO (Jonathan, 18/06/2026 — task B9 "impedir venda duplicada do mesmo orçamento"):
--   O QUÊ: um orçamento só pode gerar UMA venda. Aprovar o mesmo orçamento de novo
--          (duplo clique, dois usuários ao mesmo tempo, ou reenvio por falha de rede)
--          NÃO pode criar uma segunda venda.
--   POR QUÊ: venda duplicada do mesmo orçamento = a peça pode ser produzida 2x na
--            fábrica, cobrada/contada 2x e a comissão dobra. Hoje NADA impede — o
--            índice existente (idx_vendas_orcamento) NÃO é único.
--   IMPACTO SE REMOVIDO: volta a permitir 2+ vendas para o mesmo orçamento.
--
-- O QUE ESTA MIGRATION FAZ: troca o índice NÃO-único `idx_vendas_orcamento` por um
-- índice ÚNICO parcial em vendas_erp(orcamento_id) WHERE orcamento_id IS NOT NULL —
-- a trava FINAL no próprio banco (defesa em profundidade junto com a checagem
-- idempotente no PATCH /api/orcamento/[id]). É ADITIVA: só adiciona restrição.
-- O índice único cobre as MESMAS buscas que o antigo servia (mesma coluna + mesmo
-- predicado parcial), por isso o antigo, agora redundante, é removido.
--
-- ESCOPO DA TRAVA: vale para QUALQUER situação da venda (inclusive 'cancelado').
-- Ou seja, uma vez que um orçamento gerou uma venda, ele fica "gasto" mesmo que a
-- venda seja cancelada depois. Isso espelha o comportamento atual (orçamento vira
-- status='convertido' ao aprovar e não volta atrás). Se um dia for preciso permitir
-- "cancelar a venda e reaprovar o orçamento", trocar o predicado para
-- `WHERE orcamento_id IS NOT NULL AND situacao <> 'cancelado'`.
--
-- PRÉ-CHECK OBRIGATÓRIO (já rodado em PROD e HOMOLOG em 18/06/2026 → 0 duplicados):
--   SELECT orcamento_id, COUNT(*) FROM alissonerp.vendas_erp
--     WHERE orcamento_id IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1;
--   Se retornar QUALQUER linha, LIMPAR os duplicados ANTES — senão o
--   CREATE UNIQUE INDEX falha (e é bom que falhe: avisa que já há duplicata).
--
-- ROLLBACK (se algum dia precisar reverter):
--   DROP INDEX IF EXISTS alissonerp.uq_vendas_erp_orcamento;
--   CREATE INDEX idx_vendas_orcamento ON alissonerp.vendas_erp (orcamento_id)
--     WHERE orcamento_id IS NOT NULL;
--
-- NÃO mexe em zona no-touch (CLAUDE.md §2). Roda com o token normal do dia a dia
-- (índice comum não exige superusuário). O vigia de DDL (mig 305) registra sozinho.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendas_erp_orcamento
  ON alissonerp.vendas_erp (orcamento_id)
  WHERE orcamento_id IS NOT NULL;

DROP INDEX IF EXISTS alissonerp.idx_vendas_orcamento;  -- redundante: o índice único cobre as mesmas buscas

COMMIT;
