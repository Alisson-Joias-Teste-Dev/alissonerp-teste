// ── Tipos do Módulo de Orçamento ─────────────────────────────────────────────

import type { CalibracaoDefaults } from "./validations";

export enum ProfileType {
  Concava = "Concava",
  QuadradoCanal = "QuadradoCanal",
  Boleada = "Boleada",
  BoleadaDouble = "BoleadaDouble",
  Simples = "Simples",
  Chanfrada = "Chanfrada",
  Anatomica = "Anatomica",
}

export type GrooveType = "lateral" | "centro" | "duplo";
export type GrooveKind = "friso" | "risco";

export interface PricingCategory {
  id: number;
  name: string;
  maxWeight: number;
  variation: number;
  step?: number;
  color: string;
  targetMkp?: number;
  /** Desconto percentual aplicado durante o período de promoção (0-100). */
  desconto_promocao?: number;
}

export interface GrooveRule {
  id: number;
  ringWidth: number;
  grooveWidth: number;
  grooveDepth: number;
  grooveOffset: number;
}

export interface RingParams {
  diameter: number;
  width: number;
  height: number;
  concaveDepth: number;
  grooveSide: "UPPER" | "LOWER";
  grooveWidth: number;
  grooveDepth: number;
  grooveOffset: number;
  canalWidth: number;
  canalBorderHeight: number;
  chamferSize: number;
  domePercentage: number;
  metalColor: string;
  goldDensity: number;
  goldPrice: number;
  startMkp: number;
  discountPercent: number;
  hasGroove: boolean;
  grooveKind: GrooveKind;
  grooveType: GrooveType;
  hasStones: boolean;
  stoneSize: number;
  stoneRows: number;
  stoneCount: number;
  stoneDrill: boolean;
  stoneHalfMoon: boolean;
  stoneFull: boolean;
  stoneType: string;
  textEnabled: boolean;
  textFontType: 1 | 2;
  textContent: string;
}

export interface RingSize {
  size: number;
  diameter: number;
}

export interface PricingResult {
  weight: number;
  category: string;
  mkp: number;
  cost: number;
  price: number;
  discountPrice: number;
}

export interface ProfileOption {
  id: ProfileType;
  label: string;
  fichaLabel?: string;
}

export interface ConfigOrcamento {
  id: number;
  name: string;
  start_mkp: number;
  discount_percent: number;
  gold_price: number;
  camera_override: number | null;
  profile: string;
  pricing_categories: PricingCategory[];
  groove_rules: GrooveRule[];
  stone_markup: number;
  stone_prices: StonePrice[];
  /** Parâmetros de validação configuráveis (migration 132). Opcional pra compat. */
  calibracao?: CalibracaoDefaults | null;
  /** Curvatura padrão (%) aplicada a alianças novas (migration 255). */
  dome_percentage?: number;
  /** Migration 263: teor de ouro padrão (67–75%). Usado pra calcular
   *  densidade dinamicamente no frontend. Default 75 (18k). */
  teor_ouro_default?: number;
  /** Migration 264: acréscimo (%) aplicado quando aliança é ouro branco
   *  ou rose. Default 30. Range 0-100. */
  acrescimo_metal_premium?: number;
  /** Migration 265: ajuste global do ouro removido por pedra (%).
   *  Default 100 (sem ajuste). 120 = pedra remove 20% mais; 80 = 20% menos.
   *  Range 1-500. */
  ajuste_pedra_pct?: number;
  /** Migration 266: rótulos customizados da Ficha Técnica.
   *  Map chave → nome customizado. Ex: { "aro": "Tamanho do dedo" }.
   *  Default {} = usa labels padrão do código. */
  labels_ficha_tecnica?: Record<string, string> | null;
  risco_width?: number;
  risco_depth?: number;
  preco_gravacao?: number;
  stone_markups_table?: Record<string, Record<string, number>>;
  espessura_minima_por_modelo?: Record<string, number> | null;
  nomes_modelos?: Record<string, string> | null;
  promocao_inicio?: string | null;
  promocao_fim?: string | null;
  /** Migration 258: liga snapshot/lock do valor negociado. Default true. */
  snapshot_lock_enabled?: boolean;
}

export interface OrcamentoSnapshot {
  valor: number;
  peso: number;
  valor_ouro: number;
  valor_pedras: number;
  desconto_pct: number;
  markup: number;
  cotacao_ouro: number;
  cotacao_dolar: number;
}

export interface Orcamento {
  id: number;
  created_at: string;
  numero_orcamento: string;
  tipo: "alianca" | "peca";
  vendedor_id: number | null;
  usuario_id: string | null;
  nome_cliente: string;
  nome_modelo: string | null;
  peso: number | null;
  valor: number | null;
  markup: number | null;
  desconto_pct: number;
  cotacao_ouro: number | null;
  cotacao_dolar: number | null;
  valor_ouro: number | null;
  valor_pedras: number | null;
  ficha_tecnica_id: number | null;
  status: string;
  observacoes: string | null;
}

// ── Pedras Preciosas ────────────────────────────────────────────────────────

export type StoneType = "diamante" | "moissanita" | "rubi" | "esmeralda" | "safira" | "zirconia";

export type StoneCut = "brilhante" | "gota" | "oval" | "princesa" | "esmeralda_cut" | "marques";

export interface StoneEntry {
  id: number;
  tipo: StoneType;
  corte: StoneCut;
  tamanho_mm: number;
  qtd: number;
  ct_unitario: number;
  ct_total: number;
  pt_total: number;
  preco_unitario_rs: number;
  preco_total_rs: number;
}

export interface StonePrice {
  tipo: StoneType;
  preco_usd_ct: number;
  /** Preço fixo em R$ por unidade (usado para zircônia). Se definido, ignora USD/ct. */
  preco_rs_un?: number;
}

// ── Peça Personalizada ──────────────────────────────────────────────────────

export interface PecaParams {
  peso: number;
  metalColor: string;
  goldDensity: number;
  goldPrice: number;
  startMkp: number;
  discountPercent: number;
}
