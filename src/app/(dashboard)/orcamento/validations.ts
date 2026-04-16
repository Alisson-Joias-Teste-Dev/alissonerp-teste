// ══════════════════════════════════════════════════════════════════════════
// Validações de orçamento de alianças — módulo PURO (sem React, sem fetch)
// ══════════════════════════════════════════════════════════════════════════
// Reutilizado por:
//   • Frontend (OrcamentoClient.tsx) — travas em tempo real no editor
//   • Backend (api/orcamento/route.ts POST + [id]/route.ts PUT) — re-validação
//     para impedir burla via Postman/cURL
//
// Defaults conservadores "a favor do ourives": se errar, a peça vem mais
// grossa/robusta — nunca mais fina que o necessário pra cravar a pedra.
//
// Todos os valores são sobrescrevíveis via config_orcamento.calibracao (JSONB).
// ══════════════════════════════════════════════════════════════════════════

import { ProfileType, type RingParams, type StoneEntry } from "./types";

// ── Tipos ────────────────────────────────────────────────────────────────

export interface CalibracaoDefaults {
  /** Espessura mínima da chapa = pedra × multiplicador + constante */
  espessura_min: {
    multiplicador: number;
    constante: number;
  };
  /** Largura mínima da chapa = pedra + offset, por tipo de cravação */
  largura_min: {
    canaleta: number; // QuadradoCanal
    grao: number;     // Concava, Boleada, Simples, Anatomica, Chanfrada, BoleadaDouble
    pave: number;     // FrisoUnico, FrisoLateral
  };
  /** Folga mínima entre pedras (mm) */
  folga_pedras: number;
}

export type ValidationField =
  | "espessura"
  | "largura"
  | "canalWidth"
  | "canalBorderHeight"
  | "fileiras"
  | "pedras_capacidade"
  | "pedras_qtd";

export interface ValidationError {
  field: ValidationField;
  message: string;
}

// ── Defaults conservadores ──────────────────────────────────────────────

// Regra real: espessura mín = pedra × 70% (com furo) ou pedra × 73% (sem furo)
//   pedra 1.0mm → 0.7mm (furo) / 0.7mm (sem) | 1.5mm → 1.1mm / 1.1mm
//   2.0mm → 1.4mm / 1.5mm | 3.0mm → 2.1mm / 2.2mm | 5.0mm → 3.5mm / 3.7mm
export const CALIBRACAO_DEFAULTS: CalibracaoDefaults = {
  espessura_min: { multiplicador: 0.73, constante: 0 },
  largura_min:   { canaleta: 1.0, grao: 0.8, pave: 1.4 },
  folga_pedras:  0.2,
};

// ── Helpers ─────────────────────────────────────────────────────────────

/** Arredonda pra 1 casa decimal, evitando 1.2999999... */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function getCalib(c?: CalibracaoDefaults): CalibracaoDefaults {
  return c ?? CALIBRACAO_DEFAULTS;
}

/** Classifica o perfil em uma categoria de cravação */
export function cravacaoDoPerfil(
  profile: ProfileType
): "canaleta" | "grao" | "pave" {
  if (profile === ProfileType.QuadradoCanal) return "canaleta";
  return "grao";
}

/** Mapeia perfis legados (FrisoUnico/FrisoLateral) para perfis válidos */
export function migrateProfile(perfil: string): ProfileType {
  if (perfil === "FrisoUnico" || perfil === "FrisoLateral") return ProfileType.Simples;
  return perfil as ProfileType;
}

// ── Funções de cálculo mínimo ────────────────────────────────────────────

/**
 * Espessura mínima da chapa pra comportar uma pedra do tamanho indicado.
 * Fórmula: pedra × 70% (com furo passante) ou pedra × 73% (sem furo).
 *
 * Exemplos:
 *   pedra 1.0mm → 0.7mm (furo) / 0.7mm (sem)
 *   pedra 2.0mm → 1.4mm / 1.5mm
 *   pedra 3.0mm → 2.1mm / 2.2mm
 */
export function computeMinThickness(
  stoneSize: number,
  calib?: CalibracaoDefaults,
  hasDrill?: boolean,
): number {
  const c = getCalib(calib);
  if (!stoneSize || stoneSize <= 0) return 0;
  // Com furo passante: 70%. Sem furo: usa multiplicador da config (default 73%)
  const mult = hasDrill ? 0.70 : c.espessura_min.multiplicador;
  return round1(stoneSize * mult + c.espessura_min.constante);
}

/**
 * Largura mínima da aliança pra comportar a pedra.
 * Bordas Elevadas: sem folga (mín = tamanho da pedra).
 * Demais perfis: pedra + offset por tipo de cravação.
 */
export function computeMinWidth(
  stoneSize: number,
  profile: ProfileType,
  calib?: CalibracaoDefaults
): number {
  const c = getCalib(calib);
  if (!stoneSize || stoneSize <= 0) return 0;
  // Bordas Elevadas: largura mínima = tamanho da pedra (sem folga)
  if (profile === ProfileType.QuadradoCanal) return stoneSize;
  const cravacao = cravacaoDoPerfil(profile);
  const offset = c.largura_min[cravacao];
  return round1(stoneSize + offset);
}

/**
 * Número máximo de fileiras de pedras que cabem dentro do canal (Bordas Elevadas).
 * Sem folga entre fileiras — ex: canal 6mm, pedra 2mm = 3 fileiras.
 */
export function computeMaxStoneRows(
  canalWidth: number,
  stoneSize: number,
  _calib?: CalibracaoDefaults
): number {
  if (!canalWidth || !stoneSize || stoneSize <= 0) return 1;
  const max = Math.floor(canalWidth / stoneSize);
  return Math.max(1, max);
}

// ── Validação completa do desenho ───────────────────────────────────────

export interface RingDesignInput {
  profile: ProfileType;
  width: number;
  height: number;
  canalWidth: number;
  canalBorderHeight: number;
  hasStones: boolean;
  stoneSize: number;
  stoneRows: number;
  stoneCount: number;
  stoneHalfMoon: boolean;
  stoneFull: boolean;
  stoneDrill: boolean;
}

/**
 * Valida o desenho completo de uma aliança (params + stoneEntries detalhadas).
 *
 * Retorna uma lista de erros. Se estiver vazia, o orçamento é válido pra
 * produção na bancada.
 *
 * Regras:
 *   1. Se hasStones: espessura ≥ computeMinThickness(stoneSize)
 *   2. Se hasStones: largura ≥ computeMinWidth(stoneSize, profile)
 *   3. Se QuadradoCanal com pedras: canalBorderHeight ≥ espessura mínima
 *   4. Se QuadradoCanal: stoneRows ≤ computeMaxStoneRows
 *   5. Soma (stoneCount + Σ stoneEntries.qtd) ≤ stoneCapacity
 */
export function validateRingDesign(
  input: RingDesignInput,
  stoneEntries: StoneEntry[],
  stoneCapacity: number,
  calib?: CalibracaoDefaults
): ValidationError[] {
  const errors: ValidationError[] = [];
  const c = getCalib(calib);

  if (!input.hasStones) {
    // Sem pedras, sem travas de chapa. Só valida sanidade básica.
    if (input.width <= 0) errors.push({ field: "largura", message: "Largura deve ser maior que 0" });
    if (input.height <= 0) errors.push({ field: "espessura", message: "Espessura deve ser maior que 0" });
    return errors;
  }

  // ── Trava de espessura ─────────────────────────────────────────────────
  const minT = computeMinThickness(input.stoneSize, c, input.stoneDrill);
  if (input.profile === ProfileType.QuadradoCanal) {
    if (input.canalBorderHeight < minT) {
      errors.push({
        field: "canalBorderHeight",
        message: `Altura da borda do canal mínima pra pedra ${input.stoneSize}mm é ${minT}mm (atual ${input.canalBorderHeight}mm)`,
      });
    }
  } else {
    if (input.height < minT) {
      errors.push({
        field: "espessura",
        message: `Espessura mínima pra pedra ${input.stoneSize}mm é ${minT}mm (atual ${input.height}mm)`,
      });
    }
  }

  // ── Trava de largura ───────────────────────────────────────────────────
  const minW = computeMinWidth(input.stoneSize, input.profile, c);
  if (input.profile === ProfileType.QuadradoCanal) {
    // No canal a "largura da pedra" é a própria canalWidth
    // Bordas Elevadas: largura mínima do canal = tamanho da pedra (sem folga)
    const minCanal = input.stoneSize;
    if (input.canalWidth < minCanal) {
      errors.push({
        field: "canalWidth",
        message: `Largura do canal mínima pra pedra ${input.stoneSize}mm é ${minCanal}mm (atual ${input.canalWidth}mm)`,
      });
    }
  } else {
    if (input.width < minW) {
      errors.push({
        field: "largura",
        message: `Largura mínima pra pedra ${input.stoneSize}mm é ${minW}mm (atual ${input.width}mm)`,
      });
    }
  }

  // ── Fileiras máximas em canaleta ──────────────────────────────────────
  if (input.profile === ProfileType.QuadradoCanal) {
    const maxRows = computeMaxStoneRows(input.canalWidth, input.stoneSize, c);
    if (input.stoneRows > maxRows) {
      errors.push({
        field: "fileiras",
        message: `Canal de ${input.canalWidth}mm com pedra ${input.stoneSize}mm comporta no máximo ${maxRows} fileira(s) (atual ${input.stoneRows})`,
      });
    }
  }

  // ── Capacidade total de pedras ────────────────────────────────────────
  // Soma as stoneEntries (diamante + zircônia etc) e valida contra capacidade.
  const totalEntries = stoneEntries.reduce((sum, e) => sum + (e.qtd ?? 0), 0);

  // stoneCount só conta se for modo pontual (não full nem half)
  const countBase = (!input.stoneFull && !input.stoneHalfMoon) ? input.stoneCount : 0;
  const totalPedras = totalEntries + countBase;

  if (stoneCapacity > 0 && totalPedras > stoneCapacity) {
    errors.push({
      field: "pedras_capacidade",
      message: `Total de ${totalPedras} pedras excede a capacidade máxima da peça (${stoneCapacity})`,
    });
  }

  // ── Quantidade individual por entry inválida ──────────────────────────
  stoneEntries.forEach((e, idx) => {
    if (e.qtd <= 0) {
      errors.push({
        field: "pedras_qtd",
        message: `Pedra ${idx + 1}: quantidade deve ser maior que 0`,
      });
    }
  });

  return errors;
}

// ── Adaptador pra validação no backend a partir do formato da "ficha" ─

/**
 * Valida o desenho a partir do objeto `ficha` enviado na API
 * (formato persistido em orcamento_fichas_tecnicas).
 *
 * Usado em api/orcamento/route.ts (POST) e api/orcamento/[id]/route.ts (PUT).
 */
export function validateFichaTecnica(
  ficha: Record<string, unknown>,
  stoneCapacity: number,
  calib?: CalibracaoDefaults
): ValidationError[] {
  const hasStones = Boolean(ficha.qtd_pedras || ficha.tamanho_pedra || ficha.pedra_volta_completa || ficha.pedra_meia_lua);

  // Extrai stoneEntries de pedras_detalhadas (JSONB que pode vir como array ou string)
  let entries: StoneEntry[] = [];
  const raw = ficha.pedras_detalhadas;
  if (Array.isArray(raw)) {
    entries = raw as StoneEntry[];
  } else if (typeof raw === "string") {
    try {
      entries = JSON.parse(raw) as StoneEntry[];
    } catch {
      entries = [];
    }
  }

  const input: RingDesignInput = {
    profile: migrateProfile(String(ficha.perfil ?? "Simples")),
    width: Number(ficha.largura ?? 0),
    height: Number(ficha.espessura ?? 0),
    canalWidth: Number(ficha.canal_largura ?? 0),
    canalBorderHeight: Number(ficha.canal_borda_altura ?? 0),
    hasStones,
    stoneSize: Number(ficha.tamanho_pedra ?? 0),
    stoneRows: Number(ficha.pedra_fileiras ?? 1),
    stoneCount: Number(ficha.qtd_pedras ?? 0),
    stoneHalfMoon: Boolean(ficha.pedra_meia_lua),
    stoneFull: Boolean(ficha.pedra_volta_completa),
    stoneDrill: Boolean(ficha.pedra_drill),
  };

  return validateRingDesign(input, entries, stoneCapacity, calib);
}

/**
 * Adaptador que constrói um RingDesignInput a partir de um RingParams
 * completo do frontend. Útil em tempo real no editor.
 */
export function ringParamsToInput(
  params: RingParams,
  profile: ProfileType
): RingDesignInput {
  return {
    profile,
    width: params.width,
    height: params.height,
    canalWidth: params.canalWidth,
    canalBorderHeight: params.canalBorderHeight,
    hasStones: params.hasStones,
    stoneSize: params.stoneSize,
    stoneRows: params.stoneRows,
    stoneCount: params.stoneCount,
    stoneHalfMoon: params.stoneHalfMoon,
    stoneFull: params.stoneFull,
    stoneDrill: params.stoneDrill,
  };
}
