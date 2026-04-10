import type { GrooveRule, PricingCategory, PricingResult, ProfileOption, RingParams, RingSize, StoneEntry, StonePrice, StoneType, StoneCut } from "./types";
import { ProfileType } from "./types";

// ── Tamanhos de Aro (1–36) ──────────────────────────────────────────────────

export const RING_SIZES: RingSize[] = [
  { size: 1, diameter: 13.05 }, { size: 2, diameter: 13.38 },
  { size: 3, diameter: 13.72 }, { size: 4, diameter: 14.06 },
  { size: 5, diameter: 14.39 }, { size: 6, diameter: 14.64 },
  { size: 7, diameter: 14.99 }, { size: 8, diameter: 15.33 },
  { size: 9, diameter: 15.67 }, { size: 10, diameter: 15.92 },
  { size: 11, diameter: 16.27 }, { size: 12, diameter: 16.61 },
  { size: 13, diameter: 16.95 }, { size: 14, diameter: 17.15 },
  { size: 15, diameter: 17.51 }, { size: 16, diameter: 17.89 },
  { size: 17, diameter: 18.23 }, { size: 18, diameter: 18.57 },
  { size: 19, diameter: 18.91 }, { size: 20, diameter: 19.1 },
  { size: 21, diameter: 19.58 }, { size: 22, diameter: 19.92 },
  { size: 23, diameter: 20.26 }, { size: 24, diameter: 20.37 },
  { size: 25, diameter: 20.72 }, { size: 26, diameter: 21.06 },
  { size: 27, diameter: 21.4 },  { size: 28, diameter: 21.74 },
  { size: 29, diameter: 22.08 }, { size: 30, diameter: 22.28 },
  { size: 31, diameter: 22.62 }, { size: 32, diameter: 22.96 },
  { size: 33, diameter: 23.3 },  { size: 34, diameter: 23.64 },
  { size: 35, diameter: 23.87 }, { size: 36, diameter: 24.19 },
];

// ── Fator de correção por perfil ────────────────────────────────────────────
// ⚠️ FONTE ÚNICA DA VERDADE — consumido por computeWeight().
// Valores alinhados com o switch empírico que era usado historicamente.
// NÃO duplicar em switches isolados — sempre ler deste Record.

export const PROFILE_CORRECTION_FACTOR: Record<ProfileType, number> = {
  [ProfileType.Concava]:       0.82,
  [ProfileType.FrisoUnico]:    0.88,
  [ProfileType.FrisoLateral]:  0.90,
  [ProfileType.QuadradoCanal]: 0.95,
  [ProfileType.Boleada]:       0.85,
  [ProfileType.BoleadaDouble]: 0.78,
  [ProfileType.Simples]:       1.00,
  [ProfileType.Chanfrada]:     0.88,
  [ProfileType.Anatomica]:     0.88,
};

// ── Categorias de preço (default) ───────────────────────────────────────────

export const DEFAULT_PRICING_CATEGORIES: PricingCategory[] = [
  { id: 1, name: "Leves", maxWeight: 5.0, variation: 0.5, step: 0.1, color: "text-slate-600" },
  { id: 2, name: "Medias", maxWeight: 15.0, variation: 0.8, step: 0.5, color: "text-blue-600" },
  { id: 3, name: "Pesadas", maxWeight: 50.0, variation: 0.4, step: 0.5, color: "text-indigo-600" },
  { id: 4, name: "Ultra Pesadas", maxWeight: 500.0, variation: 0.3, step: 0.5, color: "text-purple-700" },
];

// ── Regras de friso (default) ───────────────────────────────────────────────

export const DEFAULT_GROOVE_RULES: GrooveRule[] = [
  { id: 1, ringWidth: 2.0, grooveWidth: 0.2, grooveDepth: 0.2, grooveOffset: 0.5 },
  { id: 2, ringWidth: 3.0, grooveWidth: 0.5, grooveDepth: 0.3, grooveOffset: 0.6 },
  { id: 3, ringWidth: 4.0, grooveWidth: 0.8, grooveDepth: 0.3, grooveOffset: 0.8 },
  { id: 4, ringWidth: 5.0, grooveWidth: 1.0, grooveDepth: 0.4, grooveOffset: 1.0 },
  { id: 5, ringWidth: 6.0, grooveWidth: 1.2, grooveDepth: 0.4, grooveOffset: 1.2 },
];

// ── Parâmetros default da aliança ───────────────────────────────────────────

export const DEFAULT_PARAMS: RingParams = {
  diameter: 17.51,
  width: 6.0,
  height: 1.5,
  concaveDepth: 0.4,
  grooveSide: "UPPER",
  grooveWidth: 0.5,
  grooveDepth: 0.2,
  grooveOffset: 0.8,
  canalWidth: 3.0,
  canalBorderHeight: 1.0,
  chamferSize: 0.5,
  domePercentage: 100,
  metalColor: "#FFD700",
  goldDensity: 14.69,
  goldPrice: 0,
  startMkp: 3.5,
  discountPercent: 0,
  hasStones: false,
  stoneSize: 1.5,
  stoneCount: 1,
  stoneRows: 1,
  stoneDrill: true,
  stoneHalfMoon: false,
  stoneFull: false,
  textEnabled: false,
  textFontType: 1,
  textContent: "",
};

// ── Opções de perfil para UI ────────────────────────────────────────────────

export const PROFILE_OPTIONS: ProfileOption[] = [
  { id: ProfileType.Anatomica, label: "Anatomica" },
  { id: ProfileType.Boleada, label: "Boleada" },
  { id: ProfileType.BoleadaDouble, label: "Boleada Dupla" },
  { id: ProfileType.Chanfrada, label: "Chanfrada" },
  { id: ProfileType.Concava, label: "Concava" },
  { id: ProfileType.FrisoUnico, label: "Friso Unico" },
  { id: ProfileType.FrisoLateral, label: "Friso Lateral" },
  { id: ProfileType.QuadradoCanal, label: "Quadrado Canal" },
  { id: ProfileType.Simples, label: "Reta" },
];

// ── Cores de metal ──────────────────────────────────────────────────────────

export const METAL_COLORS = [
  { label: "Ouro Amarelo", value: "#FFD700", density: 14.69 },
  { label: "Ouro Branco", value: "#E8E8E8", density: 15.25 },
  { label: "Ouro Rose", value: "#E8A090", density: 14.69 },
];

// ── Helpers de cálculo ──────────────────────────────────────────────────────

export function findGrooveRule(width: number, rules: GrooveRule[]): GrooveRule {
  const exact = rules.find((r) => r.ringWidth === Math.round(width));
  if (exact) return exact;
  return rules.reduce((prev, curr) => {
    const prevDelta = Math.abs(prev.ringWidth - width);
    const currDelta = Math.abs(curr.ringWidth - width);
    return currDelta < prevDelta ? curr : prev;
  }, rules[0]);
}

export function computeCalculatedCategories(
  startMkp: number,
  categories: PricingCategory[],
  weight: number
) {
  let currentMkp = startMkp;
  const ordered = [...categories].sort((a, b) => a.maxWeight - b.maxWeight);
  const calc = ordered.map((cat) => {
    const target = currentMkp - cat.variation;
    currentMkp = target;
    return { ...cat, targetMkp: target };
  });
  const activeCategory = calc.find((c) => weight <= c.maxWeight) || calc[calc.length - 1];
  return { calc, activeCategory };
}

export function computeWeight(
  params: RingParams,
  profile: ProfileType
): { volume: number; weight: number; weightRaw: number } {
  const rIn = params.diameter / 2;
  const rOut = rIn + params.height;
  const baseVolume = Math.PI * (rOut ** 2 - rIn ** 2) * params.width;

  // Fonte única da verdade: PROFILE_CORRECTION_FACTOR
  const factor = PROFILE_CORRECTION_FACTOR[profile] ?? 1.0;

  const grooveLoss = params.grooveDepth * params.grooveWidth * params.width * 0.7;
  const canalLoss =
    profile === ProfileType.QuadradoCanal
      ? Math.PI * (rOut ** 2 - (rIn + params.canalBorderHeight) ** 2) * params.canalWidth
      : 0;

  const adjustedVolume = Math.max(baseVolume * factor - grooveLoss - canalLoss, 0.1);
  const weightRaw = (adjustedVolume * params.goldDensity) / 1000;
  const weight = Math.round(weightRaw * 2) / 2; // passos de 0,5g
  return { volume: adjustedVolume, weight, weightRaw };
}

export function computeStoneCapacity(
  diameter: number,
  height: number,
  canalBorderHeight: number,
  stoneSize: number,
  stoneRows: number,
  profile: ProfileType
): number {
  const rStones =
    profile === ProfileType.QuadradoCanal
      ? diameter / 2 + canalBorderHeight
      : diameter / 2 + height;
  const circumference = 2 * Math.PI * rStones;
  const stoneSpace = stoneSize + 0.2;
  const capacity = Math.floor(circumference / stoneSpace);
  if (profile === ProfileType.QuadradoCanal) {
    return capacity * stoneRows;
  }
  return capacity;
}

export function computePricing(
  weight: number,
  goldPrice: number,
  startMkp: number,
  discountPercent: number,
  _categories: PricingCategory[]
): PricingResult {
  // Fórmula: peso × cotação do ouro × markup
  const mkp = startMkp;
  const cost = weight * goldPrice;
  const price = cost * mkp;
  const discountPriceRaw = price * (1 - discountPercent / 100);
  const discountInt = Math.round(discountPriceRaw);
  const remainder = discountInt % 10;
  const discountPrice = remainder < 5 ? discountInt - remainder : discountInt + (10 - remainder);
  return {
    weight,
    category: "—",
    mkp,
    cost,
    price,
    discountPrice,
  };
}

// ── Pedras Preciosas ────────────────────────────────────────────────────────

export const STONE_TYPES: { value: StoneType; label: string; is_preciosa: boolean }[] = [
  { value: "diamante",   label: "Diamante Natural", is_preciosa: true  },
  { value: "moissanita", label: "Moissanita",        is_preciosa: true  },
  { value: "rubi",       label: "Rubi",              is_preciosa: true  },
  { value: "esmeralda",  label: "Esmeralda",         is_preciosa: true  },
  { value: "safira",     label: "Safira",            is_preciosa: true  },
  { value: "zirconia",   label: "Zirconia",          is_preciosa: false },
];

/** Retorna true se o tipo de pedra entra no cálculo de preço (preciosa). */
export function isPedraPreciosa(tipo: StoneType): boolean {
  return STONE_TYPES.find((t) => t.value === tipo)?.is_preciosa ?? false;
}

export const STONE_CUTS: { value: StoneCut; label: string }[] = [
  { value: "brilhante", label: "Brilhante" },
  { value: "gota", label: "Gota" },
  { value: "oval", label: "Oval" },
  { value: "princesa", label: "Princesa" },
  { value: "esmeralda_cut", label: "Esmeralda" },
  { value: "marques", label: "Marquês" },
];

// Tabela de conversão tamanho (mm) → ct aproximado (corte brilhante)
export const STONE_CT_TABLE: { mm: number; ct: number }[] = [
  { mm: 0.8, ct: 0.003 },
  { mm: 1.0, ct: 0.005 },
  { mm: 1.25, ct: 0.01 },
  { mm: 1.5, ct: 0.015 },
  { mm: 1.75, ct: 0.02 },
  { mm: 2.0, ct: 0.03 },
  { mm: 2.25, ct: 0.04 },
  { mm: 2.5, ct: 0.06 },
  { mm: 3.0, ct: 0.10 },
  { mm: 3.5, ct: 0.17 },
  { mm: 4.0, ct: 0.25 },
  { mm: 4.5, ct: 0.35 },
  { mm: 5.0, ct: 0.50 },
  { mm: 5.5, ct: 0.65 },
  { mm: 6.0, ct: 0.80 },
  { mm: 6.5, ct: 1.00 },
  { mm: 7.0, ct: 1.25 },
];

export const STONE_SIZES_MM = STONE_CT_TABLE.map((s) => s.mm);

// Valores de mercado (atacado de pedras comerciais p/ joalheria, 2025).
// Editaveis via tela de Configuracoes (persistem em config_orcamento.stone_prices).
export const DEFAULT_STONE_PRICES: StonePrice[] = [
  { tipo: "diamante",   preco_usd_ct: 600 }, // melee VS-SI G-H padrao joia
  { tipo: "moissanita", preco_usd_ct: 80  }, // ~1/7 do diamante
  { tipo: "rubi",       preco_usd_ct: 350 }, // rubi tratado comercial
  { tipo: "esmeralda",  preco_usd_ct: 450 }, // esmeralda comercial
  { tipo: "safira",     preco_usd_ct: 300 }, // safira azul comercial
  { tipo: "zirconia",   preco_usd_ct: 0   }, // zirconia nao cobra: so ouro
];

/** Busca ct unitário por tamanho (mm) — interpolação linear */
export function stoneMmToCt(mm: number): number {
  const table = STONE_CT_TABLE;
  if (mm <= table[0].mm) return table[0].ct;
  if (mm >= table[table.length - 1].mm) return table[table.length - 1].ct;
  for (let i = 0; i < table.length - 1; i++) {
    if (mm >= table[i].mm && mm <= table[i + 1].mm) {
      const ratio = (mm - table[i].mm) / (table[i + 1].mm - table[i].mm);
      return table[i].ct + ratio * (table[i + 1].ct - table[i].ct);
    }
  }
  return table[0].ct;
}

/**
 * Calcula preço de uma entrada de pedra.
 *
 * REGRA DE NEGÓCIO:
 *   • Pedras preciosas (diamante, moissanita, rubi, esmeralda, safira):
 *     preço = ct × USD/ct × cotação_dolar × markup_pedra
 *   • Pedras não-preciosas (zircônia): preço = 0 (só cobra o ouro)
 *
 * Metadados continuam sendo calculados (ct, gramas) pra mostrar na UI.
 */
export function computeStoneEntryPrice(
  entry: { tipo: StoneType; tamanho_mm: number; qtd: number },
  stonePrices: StonePrice[],
  stoneMarkup: number,
  dollarRate: number,
): { ct_unitario: number; ct_total: number; pt_total: number; preco_unitario_rs: number; preco_total_rs: number } {
  const ct_unitario = stoneMmToCt(entry.tamanho_mm);
  const ct_total = ct_unitario * entry.qtd;
  const pt_total = ct_total * 0.2;

  // Zirconia (e qualquer outra nao-preciosa) nao cobra
  if (!isPedraPreciosa(entry.tipo)) {
    return { ct_unitario, ct_total, pt_total, preco_unitario_rs: 0, preco_total_rs: 0 };
  }

  const priceRow = stonePrices.find((p) => p.tipo === entry.tipo);
  const usdPerCt = priceRow?.preco_usd_ct ?? 0;
  const preco_unitario_rs = ct_unitario * usdPerCt * dollarRate * stoneMarkup;
  const preco_total_rs = preco_unitario_rs * entry.qtd;
  return { ct_unitario, ct_total, pt_total, preco_unitario_rs, preco_total_rs };
}

/** Calcula total de todas as pedras */
export function computeStonesTotalRS(
  entries: StoneEntry[],
): number {
  return entries.reduce((sum, e) => sum + e.preco_total_rs, 0);
}
