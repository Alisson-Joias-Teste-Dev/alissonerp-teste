-- Migration 374: DASHBOARD_VENDEDORES_EXCLUIDOS
--
-- REGRA DE NEGOCIO
-- O QUE FAZ: cadastra a lista de vendedores que NAO entram em nenhum calculo da
--   dashboard comercial. Valor inicial: [134] = "Loja Alisson".
--
-- O PORQUE: "Loja Alisson" (id_vendedor 134) nao e consultora — e o vendedor
--   generico usado para lancar venda de balcao/institucional que nao pertence a
--   ninguem da equipe. Ela nao tem meta cadastrada, nao tem lead e nao concorre
--   ao ranking, mas o faturamento dela entrava nos mesmos totais das consultoras.
--   Isso inflava faturamento, ticket medio, comissao e — pior — colocava a Loja
--   competindo no podio (3o lugar em ago/2026 com R$ 71.560). Decisao do Jonathan
--   em 21/08/2026: toda venda da Loja sai de TODOS os calculos da dashboard.
--
-- O IMPACTO SE ALTERAR/REMOVER: esvaziar ou apagar esta chave faz a dashboard
--   comercial voltar a somar a Loja junto com as consultoras — faturamento,
--   ticket, % de meta, comissao, ranking e comparativo anual todos sobem
--   artificialmente. Acrescentar um id aqui remove aquele vendedor da dashboard
--   INTEIRA (Geral, Performance, Frete, Comissoes, Ranking) sem deploy.
--   NAO afeta outros modulos: a view vw_dash_vendas_todas continua intacta, logo
--   financeiro (verba de frete gratis) e gestao de estoque nao mudam.
--
-- Aditiva: apenas INSERT ... ON CONFLICT DO NOTHING. Nenhum DDL.
-- Tipo 'json' ja e aceito pelo CHECK da tabela (migration 192).

INSERT INTO alissonerp.parametros_sistema (chave, valor, tipo, descricao) VALUES
  (
    'DASHBOARD_VENDEDORES_EXCLUIDOS',
    '[134]',
    'json',
    'IDs de vendedores que NAO entram em nenhum calculo da dashboard comercial (faturamento, ticket, metas, comissao, ranking, frete, leads, comparativo anual). 134 = Loja Alisson (venda de balcao/institucional, nao e consultora). Lido por src/lib/dashboard-comercial/vendedores-excluidos.ts.'
  )
ON CONFLICT (chave) DO NOTHING;
