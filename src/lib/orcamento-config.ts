import sql from "@/lib/db";
import type { ConfigOrcamento } from "@/app/(dashboard)/orcamento/types";

/** Normaliza Date | string | null para "YYYY-MM-DD" (ou null). Postgres
 *  driver retorna DATE como Date object — usamos toISOString().slice(0,10)
 *  pra extrair a data sem shift de timezone (DATE no banco eh UTC midnight). */
function toISODate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // Ja em "YYYY-MM-DD..."? mantem os 10 primeiros
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Tenta parse generico (string formato Date.toString())
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

/**
 * Loader único da config de orçamento — listagem e detalhe leem o MESMO set
 * de colunas. Sem isso, o detalhe ficava sem promoção/nomes_modelos/dome/
 * snapshot_lock, gerando divergência silenciosa de regras entre as telas.
 */
export async function loadOrcamentoConfig(): Promise<ConfigOrcamento | null> {
  let configRow: Record<string, unknown> | null = null;
  try {
    const rows = await sql`
      SELECT id, name, start_mkp, discount_percent, gold_price, camera_override,
             profile, pricing_categories, groove_rules, stone_markup, stone_prices,
             risco_width, risco_depth, preco_gravacao, stone_markups_table,
             calibracao, espessura_minima_por_modelo, nomes_modelos,
             promocao_inicio, promocao_fim, dome_percentage,
             snapshot_lock_enabled,
             teor_ouro_default, acrescimo_metal_premium,
             ajuste_pedra_pct, labels_ficha_tecnica
      FROM alissonerp.config_orcamento
      WHERE name = 'default'
      LIMIT 1
    `;
    configRow = (rows[0] as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
  if (!configRow) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = configRow as any;
  return {
    id: r.id as number,
    name: r.name as string,
    start_mkp: Number(r.start_mkp ?? 3.5),
    discount_percent: Number(r.discount_percent ?? 0),
    gold_price: Number(r.gold_price ?? 0),
    camera_override: r.camera_override ? Number(r.camera_override) : null,
    profile: (r.profile as string) ?? "Anatomica",
    pricing_categories: Array.isArray(r.pricing_categories) ? r.pricing_categories : [],
    groove_rules: Array.isArray(r.groove_rules) ? r.groove_rules : [],
    stone_markup: Number(r.stone_markup ?? 2.5),
    stone_prices: Array.isArray(r.stone_prices) ? r.stone_prices : [],
    risco_width: Number(r.risco_width ?? 0.1),
    risco_depth: Number(r.risco_depth ?? 0.2),
    preco_gravacao: Number(r.preco_gravacao ?? 100),
    stone_markups_table: (typeof r.stone_markups_table === "object" && r.stone_markups_table) ? r.stone_markups_table as Record<string, Record<string, number>> : {},
    calibracao: (typeof r.calibracao === "object" && r.calibracao) ? r.calibracao : null,
    espessura_minima_por_modelo: (typeof r.espessura_minima_por_modelo === "object" && r.espessura_minima_por_modelo) ? r.espessura_minima_por_modelo as Record<string, number> : null,
    nomes_modelos: (typeof r.nomes_modelos === "object" && r.nomes_modelos) ? r.nomes_modelos as Record<string, string> : null,
    // postgres.js retorna DATE como objeto Date (UTC midnight). String(Date)
    // vira "Tue May 12 2026 21:00:00 GMT-0300", e o client faz .slice(0,10)
    // pegando "Tue May 12" — comparacao lexicografica com "YYYY-MM-DD" sempre
    // falha, fazendo promocaoAtiva ser false mesmo dentro do periodo.
    // Normaliza pra "YYYY-MM-DD" aqui.
    promocao_inicio: toISODate(r.promocao_inicio),
    promocao_fim: toISODate(r.promocao_fim),
    dome_percentage: r.dome_percentage != null ? Number(r.dome_percentage) : 100,
    snapshot_lock_enabled: r.snapshot_lock_enabled !== false,
    teor_ouro_default: r.teor_ouro_default != null ? Number(r.teor_ouro_default) : 75,
    acrescimo_metal_premium: r.acrescimo_metal_premium != null ? Number(r.acrescimo_metal_premium) : 30,
    ajuste_pedra_pct: r.ajuste_pedra_pct != null ? Number(r.ajuste_pedra_pct) : 100,
    labels_ficha_tecnica: (typeof r.labels_ficha_tecnica === "object" && r.labels_ficha_tecnica) ? r.labels_ficha_tecnica as Record<string, string> : {},
  } as ConfigOrcamento;
}
