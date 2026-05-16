import sql from "@/lib/db";
import type { ConfigOrcamento } from "@/app/(dashboard)/orcamento/types";

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
             snapshot_lock_enabled
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
    promocao_inicio: r.promocao_inicio ? String(r.promocao_inicio) : null,
    promocao_fim: r.promocao_fim ? String(r.promocao_fim) : null,
    dome_percentage: r.dome_percentage != null ? Number(r.dome_percentage) : 100,
    snapshot_lock_enabled: r.snapshot_lock_enabled !== false,
  } as ConfigOrcamento;
}
