import { getParametroNumberArray, PARAM } from "@/lib/parametros";

/**
 * PONTO ÚNICO DE VERDADE: quem NÃO entra nos cálculos da dashboard comercial.
 *
 * REGRA DE NEGÓCIO
 * O QUE FAZ: devolve os id_vendedor que devem ser ignorados por TODOS os
 *   endpoints da dashboard comercial (Geral, Performance, Frete, Comissões,
 *   Ranking e comparativo anual). Hoje: [134] = "Loja Alisson".
 *
 * O PORQUÊ: "Loja Alisson" não é consultora — é o vendedor genérico usado para
 *   lançar venda de balcão/institucional que não pertence a ninguém da equipe.
 *   Não tem meta cadastrada nem lead, mas o faturamento dela entrava nos mesmos
 *   totais das consultoras: inflava faturamento, ticket médio e comissão, e
 *   colocava a Loja disputando o pódio (3º lugar em ago/2026, R$ 71.560).
 *   Decisão do Jonathan em 21/08/2026: sai de todos os cálculos e de todas as
 *   listas da dashboard comercial.
 *
 * O IMPACTO SE ALTERAR/REMOVER: sem este filtro a dashboard volta a somar a Loja
 *   junto com as consultoras (faturamento, ticket, % de meta, comissão, ranking,
 *   frete e comparativo anual todos sobem artificialmente). A lista vem do
 *   parâmetro DASHBOARD_VENDEDORES_EXCLUIDOS (migration 374), então acrescentar
 *   ou tirar vendedor é cadastro, não deploy.
 *
 * NÃO afeta outros módulos: a view alissonerp.vw_dash_vendas_todas fica intacta,
 * logo financeiro (verba de frete grátis) e gestão de estoque não mudam.
 */
export async function getVendedoresExcluidosDashboard(): Promise<number[]> {
  return await getParametroNumberArray(PARAM.DASHBOARD_VENDEDORES_EXCLUIDOS);
}

/*
 * REGRA DE NEGÓCIO (por que o filtro SQL usa COALESCE):
 * A forma canônica do filtro nos endpoints é:
 *
 *     AND COALESCE(<coluna_vendedor>, -1) <> ALL(${excluidos}::bigint[])
 *
 * O PORQUÊ: existem vendas legadas SEM vendedor (vendedor_id NULL) que hoje
 *   contam nos totais. Em SQL, `NULL = ANY(lista)` é NULL, e `NOT NULL` não é
 *   verdadeiro — sem o COALESCE essas vendas seriam descartadas por acidente
 *   (R$ 33.564,50 em 12 meses, medido em 21/08/2026). O -1 é um id impossível,
 *   então a linha sem vendedor sempre passa.
 *
 * O IMPACTO SE ALTERAR: trocar por `NOT IN` ou tirar o COALESCE muda
 *   silenciosamente o faturamento das telas. Lista vazia (`<> ALL('{}')`) é
 *   verdadeira para todos, ou seja: parâmetro apagado = dashboard volta ao
 *   comportamento antigo sozinha.
 */
