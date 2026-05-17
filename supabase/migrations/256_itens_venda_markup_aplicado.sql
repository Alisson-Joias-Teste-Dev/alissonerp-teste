-- 256_itens_venda_markup_aplicado.sql
-- Guarda o markup aplicado no item da venda quando ele veio de orçamento de
-- aliança ou peça personalizada. A tela de venda usa essa coluna pra calcular
-- comissão pela curva (commissionForMarkup) em vez de pela faixa por desconto.
-- Sem essa coluna, ao editar o item na venda o JS recalcula a comissão pela
-- tabela faixas_comissao[desconto], divergindo da regra nova.

ALTER TABLE alissonerp.itens_venda_erp
  ADD COLUMN IF NOT EXISTS markup_aplicado NUMERIC;

COMMENT ON COLUMN alissonerp.itens_venda_erp.markup_aplicado IS
  'Markup do item quando criado a partir de orcamento (faixa pricing_categories). NULL para produto comum, que segue faixas_comissao por desconto.';
