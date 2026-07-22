/**
 * frete-verba.ts — cálculo da VERBA MENSAL de frete grátis (BLOCO 3, 21/07).
 *
 * REGRA DE NEGÓCIO (definida pelo Jonathan, não reabrir — ver migration 356 e
 * docs/regras-negocio/entregas.md): a loja recebe todo mês uma verba para
 * dar frete grátis de cortesia (o normal é o cliente pagar). Verba = 0,1%
 * (config `percentual_verba_frete`, default 0.1) do FATURAMENTO DO MÊS
 * ANTERIOR ao mês de referência do fechamento.
 *
 * O QUE: `calcularFaturamentoMes(inicio, fim)` é a FONTE ÚNICA do cálculo de
 * faturamento usado pela verba — reaproveita, campo a campo e filtro a
 * filtro, a MESMA consulta já usada pela dashboard comercial (GET
 * /api/dashboard-comercial/vendas-dashboard/route.ts, campo
 * `visaoGeral.alcancado_bruto` = soma de `total_venda` sem descontar
 * vale-troca): `FROM alissonerp.vw_dash_vendas_todas WHERE data_venda
 * BETWEEN ... AND status IS NOT NULL AND status != 4`.
 *
 * POR QUE: o Jonathan conferiu manualmente (homolog, jul/26: 17 vendas,
 * R$ 217.867,00) que esse é o número que bate com a tela que ele já usa e
 * confia — criar uma 2ª soma de faturamento (mesmo que "equivalente") corre
 * o risco de um dia divergir silenciosamente e a verba parar de bater com o
 * que o Jonathan vê no dashboard.
 *
 * ⚠️ NÃO escrever outra consulta de faturamento. Se o filtro do dashboard
 * mudar (view, coluna de data, ou a condição de status cancelado), este
 * arquivo TEM que mudar junto — ver o teste ANTI-VOLTA em
 * src/__tests__/frete-verba-equivalente-dashboard.test.ts, que lê o
 * texto-fonte dos dois arquivos e falha se os filtros divergirem (não dá
 * para comparar as duas consultas rodando contra um banco real dentro do
 * setup de teste atual — vitest roda com environment:"node", sem banco; ver
 * comentário completo no teste).
 *
 * IMPACTO SE ALTERADO SÓ AQUI (sem espelhar no dashboard, ou vice-versa): a
 * verba de frete grátis do mês passa a ser calculada sobre um faturamento
 * diferente do que a loja vê na tela — pode gerar verba maior ou menor do
 * que 0,1% do que realmente vendeu, sem ninguém perceber.
 */

import sql from "@/lib/db";

/** Default do percentual da verba (%) — usado só se a config não existir. */
const PERCENTUAL_VERBA_FRETE_DEFAULT = 0.1;

/**
 * Arredonda para 2 casas decimais (padrão NUMERIC(x,2) do banco) — mesmo
 * problema de imprecisão de ponto flutuante do JS resolvido pelo helper
 * `money()` local de src/lib/entrega-venda.ts (não exportado de lá — helper
 * de 1 linha replicado aqui de propósito para não acoplar este arquivo, que
 * é só cálculo, à lib de entrega/saldo).
 */
function arredondarMoeda(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Calcula o faturamento do período [inicio, fim] (datas YYYY-MM-DD,
 * inclusive nos dois extremos) — MESMA consulta e MESMO filtro da dashboard
 * comercial (ver cabeçalho do arquivo). Soma bruta de `total_venda` — NÃO
 * desconta vale-troca (a dashboard chama esse número de `alcancado_bruto`).
 *
 * IMPACTO SE DUPLICADO EM OUTRO LUGAR: 2 fontes de faturamento que podem
 * divergir — ver teste anti-volta citado no cabeçalho deste arquivo.
 */
export async function calcularFaturamentoMes(inicio: string, fim: string): Promise<number> {
  const [row] = await sql<{ total: string | null }[]>`
    SELECT COALESCE(SUM(total_venda), 0)::text AS total
    FROM alissonerp.vw_dash_vendas_todas
    WHERE data_venda BETWEEN ${inicio}::date AND ${fim}::date
      AND status IS NOT NULL AND status != 4
  `;
  return Number(row?.total ?? 0);
}

/**
 * Lê o percentual da verba de frete grátis — config `percentual_verba_frete`
 * em alissonerp.configuracoes_sistema (valor "0.1" = 0,1%). Default
 * PERCENTUAL_VERBA_FRETE_DEFAULT se a chave ainda não existir — mesmo
 * padrão de leitura direta (sem cache) usado por
 * desconto_fallback_sem_cadastro_pct/limite_desconto_cartao_pct em
 * src/app/api/configuracoes/aprovadores/route.ts.
 * IMPACTO SE HARDCODED NO MEIO DO CÓDIGO: mudar o percentual exigiria
 * deploy — com a config, o Jonathan ajusta pela tela.
 */
export async function obterPercentualVerbaFrete(): Promise<number> {
  const [config] = await sql<{ valor: string }[]>`
    SELECT valor FROM alissonerp.configuracoes_sistema WHERE chave = 'percentual_verba_frete'
  `;
  const num = Number(config?.valor);
  return Number.isFinite(num) ? num : PERCENTUAL_VERBA_FRETE_DEFAULT;
}

export interface VerbaFreteGratisCalculada {
  /** Valor da verba a creditar no fechamento (percentual% do faturamento base). */
  verba: number;
  /** Faturamento do mês anterior usado como base — auditoria (fechamentos_frete.faturamento_base). */
  faturamentoBase: number;
  /** Percentual aplicado (%) — auditoria (fechamentos_frete.percentual_verba). */
  percentual: number;
  /** Início/fim (YYYY-MM-DD) do mês anterior usado como base do cálculo. */
  inicioMesAnterior: string;
  fimMesAnterior: string;
}

/**
 * Calcula a verba de frete grátis para o fechamento de `mesReferencia` —
 * 0,1% (ou o percentual configurado) do faturamento do MÊS ANTERIOR a
 * `mesReferencia`. Fundação para o fechamento automático do dia 01 (cron
 * fora do escopo desta sessão — Blocos 1-3 são só a base: gerente
 * configurável, migration e este cálculo).
 *
 * IMPACTO SE ALTERADO: fechamentos_frete.verba_creditada/faturamento_base/
 * percentual_verba (migration 356) dependem deste retorno para gravar a
 * auditoria de cada fechamento mensal.
 */
export async function calcularVerbaFreteGratis(mesReferencia: Date): Promise<VerbaFreteGratisCalculada> {
  // Mês anterior ao mês de referência — ex.: fechamento de agosto usa o
  // faturamento de julho (regra: "verba do mês novo = 0,1% do faturamento
  // do MÊS ANTERIOR").
  const inicioMesAnterior = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth() - 1, 1);
  const fimMesAnterior = new Date(mesReferencia.getFullYear(), mesReferencia.getMonth(), 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const inicio = fmt(inicioMesAnterior);
  const fim = fmt(fimMesAnterior);

  const [faturamentoBase, percentual] = await Promise.all([
    calcularFaturamentoMes(inicio, fim),
    obterPercentualVerbaFrete(),
  ]);

  const verba = arredondarMoeda(faturamentoBase * (percentual / 100));

  return { verba, faturamentoBase, percentual, inicioMesAnterior: inicio, fimMesAnterior: fim };
}
