/**
 * Curva dinamica de precificacao com interpolacao linear.
 *
 * Conceitos:
 *  - startMkp / startCommission: valores para peso = 0.1g
 *  - Cada categoria define quanto reduz MKP e comissao em relacao ao degrau anterior
 *  - Entre dois pontos, o valor e interpolado linearmente (rampa suave, nao salto)
 *  - maxDiscount e um limite por faixa (usado em validacao de orcamento/venda)
 *
 * Tudo em TypeScript para ser usado tanto no backend (APIs) quanto no frontend
 * (simulador em tempo real, accordion de pontos).
 */

export type Arredondamento = "dezena" | "unidade" | "centena";

export interface CurvaConfig {
  startMkp: number;
  startCommission: number;
  goldCostPercentage: number;
  sucataCompraMinPct: number;
  sucataCompraMaxPct: number;
  arredondamento: Arredondamento;
}

export interface CurvaCategoriaInput {
  id: number;
  nome: string;
  maxWeight: number;
  variation: number;
  commVariation: number;
  maxDiscount: number;
  ativo: boolean;
  ordem: number;
}

export interface CurvaCategoriaPreparada extends CurvaCategoriaInput {
  targetMkp: number;
  targetComm: number;
}

export interface PricingFactors {
  mkp: number;
  commission: number;
  maxDiscount: number;
  categoriaId: number;
  categoriaNome: string;
}

export interface PontoCurva {
  peso: number;
  mkp: number;
  commission: number;
  maxDiscount: number;
  custo: number;
  venda: number;
  lucro: number;
  margem: number;
}

/**
 * Ordena categorias ativas por peso e calcula targetMkp / targetComm
 * acumulados subtraindo a variacao de cada degrau.
 *
 * Mantem a regra de que MKP minimo = 1.0 e comissao minima = 0.0.
 */
export function prepareCategories(
  config: Pick<CurvaConfig, "startMkp" | "startCommission">,
  categorias: CurvaCategoriaInput[],
): CurvaCategoriaPreparada[] {
  const ativas = categorias
    .filter((c) => c.ativo)
    .sort((a, b) => a.maxWeight - b.maxWeight);

  let currentMkp = config.startMkp;
  let currentComm = config.startCommission;

  return ativas.map((cat) => {
    currentMkp = Math.max(1, currentMkp - (cat.variation ?? 0));
    currentComm = Math.max(0, currentComm - (cat.commVariation ?? 0));
    return { ...cat, targetMkp: currentMkp, targetComm: currentComm };
  });
}

/**
 * Retorna MKP, comissao e maxDiscount para qualquer peso informado.
 * Usa interpolacao linear entre o ponto anterior e o target da faixa atual.
 *
 * Regras de borda:
 *  - peso <= 0.1g ou faixa nao encontrada: retorna valores do primeiro ponto (startMkp)
 *  - peso acima do maxWeight da ultima faixa: retorna valores da ultima faixa
 */
export function getPricingFactors(
  weight: number,
  config: Pick<CurvaConfig, "startMkp" | "startCommission">,
  categorias: CurvaCategoriaInput[],
): PricingFactors {
  const cats = prepareCategories(config, categorias);

  if (cats.length === 0) {
    return {
      mkp: config.startMkp,
      commission: config.startCommission,
      maxDiscount: 0,
      categoriaId: 0,
      categoriaNome: "—",
    };
  }

  let prevWeight = 0.1;
  let prevMkp = config.startMkp;
  let prevComm = config.startCommission;

  for (const cat of cats) {
    if (weight <= cat.maxWeight) {
      const range = cat.maxWeight - prevWeight;
      const progress = range > 0 ? Math.max(0, Math.min(1, (weight - prevWeight) / range)) : 1;
      return {
        mkp: prevMkp - (prevMkp - cat.targetMkp) * progress,
        commission: prevComm - (prevComm - cat.targetComm) * progress,
        maxDiscount: cat.maxDiscount,
        categoriaId: cat.id,
        categoriaNome: cat.nome,
      };
    }
    prevWeight = cat.maxWeight;
    prevMkp = cat.targetMkp;
    prevComm = cat.targetComm;
  }

  // Peso maior que a ultima faixa: usa a ultima
  const last = cats[cats.length - 1];
  return {
    mkp: last.targetMkp,
    commission: last.targetComm,
    maxDiscount: last.maxDiscount,
    categoriaId: last.id,
    categoriaNome: last.nome,
  };
}

/**
 * Arredonda um valor conforme a regra configurada (dezena/unidade/centena).
 * Duplicado em PrecificacaoClient.tsx — extraido aqui para reuso server-side.
 */
export function aplicarArredondamento(valor: number, tipo: Arredondamento): number {
  if (tipo === "centena") return Math.round(valor / 100) * 100;
  if (tipo === "dezena") return Math.round(valor / 10) * 10;
  return Math.round(valor);
}

/**
 * Custo base do ouro: peso x cotacao x (goldCostPercentage / 100).
 * goldCostPercentage = 100 significa que o custo e 100% da cotacao (sem desconto).
 */
export function calcularCustoBase(peso: number, cotacaoOuro: number, goldCostPercentage: number): number {
  return peso * cotacaoOuro * (goldCostPercentage / 100);
}

/**
 * Preco de venda final arredondado: peso x cotacao x mkp, arredondado.
 */
export function calcularPrecoSync(
  peso: number,
  cotacaoOuro: number,
  mkp: number,
  arredondamento: Arredondamento,
): number {
  const bruto = peso * cotacaoOuro * mkp;
  return aplicarArredondamento(bruto, arredondamento);
}

export interface SimulacaoLucro {
  peso: number;
  cotacao: number;
  goldCostPercentage: number;
  custo: number;
  mkpAuto: number;
  comissaoAuto: number;
  vendaAuto: number;
  lucroAuto: number;
  margemAuto: number;
  mkpManual?: number;
  vendaManual?: number;
  lucroManual?: number;
  margemManual?: number;
}

/**
 * Simula lucratividade para um peso especifico.
 * Retorna custo, venda, lucro, margem usando tanto MKP automatico (curva) quanto
 * MKP manual opcional (para comparar cenarios).
 */
export function simularLucratividade(
  peso: number,
  cotacaoOuro: number,
  config: CurvaConfig,
  categorias: CurvaCategoriaInput[],
  mkpManual?: number,
): SimulacaoLucro {
  const factors = getPricingFactors(peso, config, categorias);
  const custo = calcularCustoBase(peso, cotacaoOuro, config.goldCostPercentage);

  const vendaAuto = calcularPrecoSync(peso, cotacaoOuro, factors.mkp, config.arredondamento);
  const lucroAuto = vendaAuto - custo;
  const margemAuto = vendaAuto > 0 ? (lucroAuto / vendaAuto) * 100 : 0;

  const out: SimulacaoLucro = {
    peso,
    cotacao: cotacaoOuro,
    goldCostPercentage: config.goldCostPercentage,
    custo,
    mkpAuto: factors.mkp,
    comissaoAuto: factors.commission,
    vendaAuto,
    lucroAuto,
    margemAuto,
  };

  if (mkpManual !== undefined && mkpManual > 0) {
    const vendaManual = calcularPrecoSync(peso, cotacaoOuro, mkpManual, config.arredondamento);
    const lucroManual = vendaManual - custo;
    const margemManual = vendaManual > 0 ? (lucroManual / vendaManual) * 100 : 0;
    out.mkpManual = mkpManual;
    out.vendaManual = vendaManual;
    out.lucroManual = lucroManual;
    out.margemManual = margemManual;
  }

  return out;
}

/**
 * Gera pontos da curva para o accordion da UI.
 * Passo dinamico: 0.1g ate 29.95g, depois 1.0g.
 */
export function gerarPontosCurva(
  rangeStart: number,
  rangeEnd: number,
  _step: number, // mantido na assinatura para retrocompatibilidade, ignorado internamente
  cotacaoOuro: number,
  config: CurvaConfig,
  categorias: CurvaCategoriaInput[],
): PontoCurva[] {
  const pontos: PontoCurva[] = [];
  let w = rangeStart;
  let count = 0;

  while (w <= rangeEnd + 0.001 && count < 2000) {
    const step = w >= 29.95 ? 1.0 : 0.1;
    const peso = step >= 1.0 ? Math.round(w * 10) / 10 : Math.round(w * 100) / 100;
    if (peso > rangeEnd + 0.001) break;

    const factors = getPricingFactors(peso, config, categorias);
    const custo = calcularCustoBase(peso, cotacaoOuro, config.goldCostPercentage);
    const venda = calcularPrecoSync(peso, cotacaoOuro, factors.mkp, config.arredondamento);
    const lucro = venda - custo;
    const margem = venda > 0 ? (lucro / venda) * 100 : 0;
    pontos.push({
      peso,
      mkp: factors.mkp,
      commission: factors.commission,
      maxDiscount: factors.maxDiscount,
      custo,
      venda,
      lucro,
      margem,
    });
    w += step;
    w = step >= 1.0 ? Math.round(w * 10) / 10 : Math.round(w * 100) / 100;
    count++;
  }

  return pontos;
}

export interface PontoCategoriaChip {
  weight: number;
  mkp: number;
  comm: number;
  price: number;
}

/**
 * Gera os chips de pontos de curva para uma categoria especifica.
 * Passo dinamico: 0.1g ate 29.95g, depois 1.0g.
 */
export function getCategoryPoints(
  category: CurvaCategoriaPreparada,
  sortedCategories: CurvaCategoriaPreparada[],
  cotacaoOuro: number,
  config: Pick<CurvaConfig, "startMkp" | "startCommission" | "goldCostPercentage" | "arredondamento">,
): PontoCategoriaChip[] {
  const idx = sortedCategories.findIndex((c) => c.id === category.id);
  const rangeStart = idx === 0 ? 0.1 : sortedCategories[idx - 1].maxWeight + 0.1;
  const rangeEnd = category.maxWeight;

  const points: PontoCategoriaChip[] = [];
  let w = rangeStart;
  let count = 0;

  while (count < 1000) {
    const step = w >= 29.95 ? 1.0 : 0.1;
    const peso = step >= 1.0 ? Math.round(w * 10) / 10 : Math.round(w * 100) / 100;
    if (peso > rangeEnd + 0.001) break;

    const factors = getPricingFactors(peso, config, sortedCategories);
    const price = Math.round(peso * cotacaoOuro * factors.mkp);
    points.push({ weight: peso, mkp: factors.mkp, comm: factors.commission, price });

    w += step;
    w = step >= 1.0 ? Math.round(w * 10) / 10 : Math.round(w * 100) / 100;
    count++;
  }

  return points;
}

/**
 * Retorna o preco de venda arredondado para um peso/cotacao/curva.
 * Util para mostrar o preco limite na coluna "Faixa (g)" da tabela de categorias.
 */
export function getLimitPrice(
  weight: number,
  cotacaoOuro: number,
  config: Pick<CurvaConfig, "startMkp" | "startCommission" | "goldCostPercentage" | "arredondamento">,
  categorias: CurvaCategoriaInput[],
): number {
  const factors = getPricingFactors(weight, config, categorias);
  return calcularPrecoSync(weight, cotacaoOuro, factors.mkp, config.arredondamento);
}

/**
 * Converte rows vindos do DB (snake_case, strings NUMERIC) para objetos TS.
 */
export function normalizeConfigRow(row: Record<string, unknown>): CurvaConfig {
  return {
    startMkp: Number(row.start_mkp),
    startCommission: Number(row.start_commission),
    goldCostPercentage: Number(row.gold_cost_percentage),
    sucataCompraMinPct: Number(row.sucata_compra_min_pct),
    sucataCompraMaxPct: Number(row.sucata_compra_max_pct),
    arredondamento: (row.arredondamento as Arredondamento) ?? "dezena",
  };
}

export function normalizeCategoriaRow(row: Record<string, unknown>): CurvaCategoriaInput {
  return {
    id: Number(row.id),
    nome: String(row.nome),
    maxWeight: Number(row.max_weight),
    variation: Number(row.variation),
    commVariation: Number(row.comm_variation),
    maxDiscount: Number(row.max_discount),
    ativo: Boolean(row.ativo),
    ordem: Number(row.ordem),
  };
}

