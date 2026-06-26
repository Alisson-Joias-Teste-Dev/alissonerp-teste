-- Migration 283: permitir 'conversao' como origem válida em baixas do cofre
-- REGRA DE NEGÓCIO:
--   - Conversão 2.0: joias aprovadas entram no Caixa de Ouro (cofre_registrado=true).
--   - Para seguir o fluxo normal de baixa, a baixa precisa aceitar 'conversao'
--     como origem_tipo em cofre_ouro_baixa_itens.
--   - Sem esta mudança, o front não consegue selecionar conversões para dar baixa.
-- IMPACTO SE REMOVIDO:
--   - Conversões que entraram no cofre não poderiam ser baixadas (derretidas),
--     ficando eternamente no saldo disponível sem possibilidade de saída.

SET search_path TO alissonerp, public;

-- Remove a constraint antiga (3 origens) e recria com 4 origens
ALTER TABLE alissonerp.cofre_ouro_baixa_itens
  DROP CONSTRAINT cofre_ouro_baixa_itens_origem_tipo_check;

ALTER TABLE alissonerp.cofre_ouro_baixa_itens
  ADD CONSTRAINT cofre_ouro_baixa_itens_origem_tipo_check
    CHECK (origem_tipo IN ('venda_ouro', 'compra_metal', 'recebimento_metal', 'conversao'));
