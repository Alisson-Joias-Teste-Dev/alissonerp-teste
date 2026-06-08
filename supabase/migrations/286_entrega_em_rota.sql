-- Migration 286: Adiciona status 'em_rota' ao enum de entrega
--
-- REGRA DE NEGÓCIO: quando o motoboy retira a mercadoria na loja (Código B),
-- a entrega muda de "pendente" para "em_rota". O estoque já foi baixado,
-- mas a venda ainda não é "entregue" — só vira quando o Código A do cliente
-- confirmar o recebimento.
--
-- IMPACTO SE REMOVIDO: entregas via motoboy pós-Código B ficam "pendente",
-- sem distinção visual entre "ainda na loja" e "já saiu com o motoboy".

ALTER TYPE alissonerp.enum_entrega_situacao ADD VALUE 'em_rota' AFTER 'pendente';
