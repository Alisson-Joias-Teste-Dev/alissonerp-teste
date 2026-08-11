/**
 * frete-verba.ts — cálculo da VERBA MENSAL de frete grátis (BLOCO 3, 21/07).
 *
 * REGRA DE NEGÓCIO (definida pelo Jonathan — ver migration 356 e
 * docs/regras-negocio/entregas.md): a loja recebe todo mês uma verba para
 * dar frete grátis de cortesia (o normal é o cliente pagar). Verba = 0,1%
 * (config `percentual_verba_frete`, default 0.1) do FATURAMENTO LÍQUIDO DO
 * MÊS ANTERIOR ao de competência — *"a verba do mês de julho é o faturamento
 * do mês de junho"*.
 *
 * ⚠️ REVISADO EM 03/08/2026 (§10.8): o que mudou foi (a) bruto → LÍQUIDO
 * (bruto − vale-troca) e (b) o RÓTULO do fechamento, que passou a ser a
 * COMPETÊNCIA (o mês fechado) em vez do mês em que a rotina rodou. A relação
 * "base = mês anterior" NÃO mudou.
 *
 * O QUE: `calcularFaturamentoLiquidoMes(inicio, fim)` é a FONTE ÚNICA do
 * cálculo de faturamento usado pela verba — reaproveita, campo a campo e
 * filtro a filtro, a MESMA consulta já usada pela dashboard comercial (GET
 * /api/dashboard-comercial/vendas-dashboard/route.ts): `FROM
 * alissonerp.vw_dash_vendas_todas WHERE data_venda BETWEEN ... AND status IS
 * NOT NULL AND status != 4`, somando `total_venda` e subtraindo
 * `valor_vale_troca` — a MESMA conta do `alcancado_periodo` (líquido) de lá.
 * `calcularFaturamentoMes` (bruto, = `alcancado_bruto`) continua existindo
 * como contraprova dos dois números.
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
 * Faturamento LÍQUIDO do período — bruto MENOS vale-troca. É esta a base da
 * verba desde 03/08/2026 (decisão do Jonathan: *"o saldo que é gerado ele é do
 * faturamento líquido e não do bruto"*).
 *
 * O QUE MUDA: `SUM(total_venda) - SUM(valor_vale_troca)`. MESMO filtro
 * (view/data/status) de `calcularFaturamentoMes` acima — o teste ANTI-VOLTA
 * `frete-verba-equivalente-dashboard.test.ts` compara o filtro dos dois
 * arquivos e quebra se divergirem.
 *
 * POR QUE ESTA subtração e não outra: é EXATAMENTE a conta que a dashboard
 * comercial já faz para o `alcancado_periodo` (o número "líquido" que o
 * Jonathan olha na tela) — `vendas-dashboard/route.ts` ~L118-122:
 * `totalLiquido = totalBruto - valorVale`. Inventar uma segunda definição de
 * "líquido" aqui (descontando devolução, desconto, o que for) faria a verba
 * parar de bater com a tela que ele confia — o mesmo risco que motivou a
 * `calcularFaturamentoMes` a copiar o filtro da dashboard.
 *
 * NÚMEROS REAIS de julho/2026 (conferidos em prod, 03/08): bruto
 * R$ 751.010,92 − vale-troca R$ 19.306,00 = líquido R$ 731.704,92 → verba
 * R$ 731,70 (era R$ 751,01 no bruto).
 *
 * `calcularFaturamentoMes` (bruto) fica EXPORTADA de propósito: é ela que
 * espelha o `alcancado_bruto` da dashboard e serve de contraprova quando
 * alguém questionar a diferença entre os dois números.
 */
export async function calcularFaturamentoLiquidoMes(inicio: string, fim: string): Promise<number> {
  const [row] = await sql<{ total: string | null }[]>`
    SELECT COALESCE(SUM(total_venda) - SUM(COALESCE(valor_vale_troca, 0)), 0)::text AS total
    FROM alissonerp.vw_dash_vendas_todas
    WHERE data_venda BETWEEN ${inicio}::date AND ${fim}::date
      AND status IS NOT NULL AND status != 4
  `;
  return Number(row?.total ?? 0);
}

/**
 * Lê o percentual da verba de frete grátis — config `percentual_verba_frete`
 * em alissonerp.configuracoes_unificado (valor "0.1" = 0,1%). Default
 * PERCENTUAL_VERBA_FRETE_DEFAULT se a chave ainda não existir — mesmo
 * padrão de leitura direta (sem cache) usado por
 * desconto_fallback_sem_cadastro_pct/limite_desconto_cartao_pct em
 * src/app/api/configuracoes/aprovadores/route.ts.
 * IMPACTO SE HARDCODED NO MEIO DO CÓDIGO: mudar o percentual exigiria
 * deploy — com a config, o Jonathan ajusta pela tela.
 */
export async function obterPercentualVerbaFrete(): Promise<number> {
  const [config] = await sql<{ valor: string }[]>`
    SELECT valor FROM alissonerp.configuracoes_unificado WHERE chave = 'percentual_verba_frete'
  `;
  const num = Number(config?.valor);
  return Number.isFinite(num) ? num : PERCENTUAL_VERBA_FRETE_DEFAULT;
}

export interface VerbaFreteGratisCalculada {
  /** Valor da verba a creditar no fechamento (percentual% do faturamento base). */
  verba: number;
  /** Faturamento LÍQUIDO da competência — auditoria (fechamentos_frete.faturamento_base). */
  faturamentoBase: number;
  /** Percentual aplicado (%) — auditoria (fechamentos_frete.percentual_verba). */
  percentual: number;
  /** Início/fim (YYYY-MM-DD) do mês de COMPETÊNCIA usado como base do cálculo. */
  inicioCompetencia: string;
  fimCompetencia: string;
}

/**
 * Calcula a verba de frete grátis da COMPETÊNCIA `mesCompetencia` — 0,1% (ou o
 * percentual configurado) do faturamento LÍQUIDO **do próprio mês de
 * competência**.
 *
 * ⚠️ MUDANÇAS DE 03/08/2026 (decisões do Jonathan, ver docs/regras-negocio/
 * entregas.md §10.8):
 *   1. A base virou o faturamento LÍQUIDO (bruto − vale-troca), não mais o
 *      bruto: *"o saldo que é gerado ele é do faturamento líquido e não do
 *      bruto"*. Ver `calcularFaturamentoLiquidoMes`.
 *   2. O parâmetro virou o mês de COMPETÊNCIA (o mês FECHADO), não mais o mês
 *      de execução da rotina.
 *
 * 🔴 ERRO COMETIDO E CORRIGIDO NO MESMO DIA — não repetir: ao aplicar a
 * mudança (2), a base foi trocada junto, passando a somar o PRÓPRIO mês de
 * competência. Está errado. O Jonathan corrigiu: *"verba do mês de julho é o
 * faturamento do mês de junho"*. Só o RÓTULO mudou de agosto para julho; a
 * base sempre foi, e continua sendo, o **mês anterior ao de competência**.
 *
 * PROVA INDEPENDENTE: no relatório consolidado de julho que ele fechou à mão
 * em 31/07/2026, a verba usada foi **R$ 777,86** — exatamente 0,1% do
 * faturamento líquido de JUNHO (R$ 777.860,82). O líquido de julho daria
 * R$ 731,70, que não bate com nada que ele já tinha fechado.
 *
 * IMPACTO SE ALGUÉM TIRAR O `- 1`: a verba passa a ser calculada sobre o mês
 * que acabou de fechar em vez do anterior — número diferente todo mês, sem
 * erro visível na tela.
 *
 * IMPACTO SE ALTERADO: fechamentos_frete.verba_creditada/faturamento_base/
 * percentual_verba (migration 356) dependem deste retorno para gravar a
 * auditoria de cada fechamento mensal.
 */
export async function calcularVerbaFreteGratis(mesCompetencia: Date): Promise<VerbaFreteGratisCalculada> {
  // 🔴 A base é o mês ANTERIOR ao de competência — "a verba do mês de julho é o
  // faturamento do mês de junho" (Jonathan, 03/08). Competência julho ⇒ soma
  // 01/06 a 30/06.
  const inicioMes = new Date(mesCompetencia.getFullYear(), mesCompetencia.getMonth() - 1, 1);
  const fimMes = new Date(mesCompetencia.getFullYear(), mesCompetencia.getMonth(), 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const inicio = fmt(inicioMes);
  const fim = fmt(fimMes);

  const [faturamentoBase, percentual] = await Promise.all([
    calcularFaturamentoLiquidoMes(inicio, fim),
    obterPercentualVerbaFrete(),
  ]);

  const verba = arredondarMoeda(faturamentoBase * (percentual / 100));

  return { verba, faturamentoBase, percentual, inicioCompetencia: inicio, fimCompetencia: fim };
}
