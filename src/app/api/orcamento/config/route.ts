import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const ROLES_CONFIG = ["desenvolvedor", "admin", "gerente_loja"] as const;

const OrcamentoConfigPostSchema = z.object({
  start_mkp: z.coerce.number().optional(),
  discount_percent: z.coerce.number().optional(),
  profile: z.string().optional(),
  pricing_categories: z.unknown().optional(),
  groove_rules: z.unknown().optional(),
  stone_markup: z.coerce.number().optional(),
  stone_prices: z.unknown().optional(),
  calibracao: z.unknown().optional(),
  risco_width: z.coerce.number().optional(),
  risco_depth: z.coerce.number().optional(),
  preco_gravacao: z.coerce.number().optional(),
  stone_markups_table: z.unknown().optional(),
  espessura_minima_por_modelo: z.unknown().optional(),
  nomes_modelos: z.unknown().optional(),
  promocao_inicio: z.string().nullable().optional(),
  promocao_fim: z.string().nullable().optional(),
  dome_percentage: z.coerce.number().optional(),
  teor_ouro_default: z.coerce.number().int().min(67).max(75).optional(),
  acrescimo_metal_premium: z.coerce.number().min(0).max(100).optional(),
}).passthrough();

// GET /api/orcamento/config — busca config ativa
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const [row] = await sql`
    SELECT * FROM alissonerp.config_orcamento WHERE name = 'default' LIMIT 1
  `;

  return NextResponse.json({ config: row ?? null });
}

// POST /api/orcamento/config — salva config
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const [caller] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  if (!caller) return NextResponse.json({ error: "Usuario nao encontrado" }, { status: 404 });

  const role = caller.role as string;
  const canConfig = isFullAccess(role) || ROLES_CONFIG.includes(role as typeof ROLES_CONFIG[number]);
  if (!canConfig) return NextResponse.json({ error: "Sem permissao" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = OrcamentoConfigPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = parsed.data as any;
  const {
    start_mkp, discount_percent, profile,
    pricing_categories, groove_rules,
    stone_markup, stone_prices,
    calibracao,
    risco_width, risco_depth,
    preco_gravacao,
    stone_markups_table,
    espessura_minima_por_modelo,
    nomes_modelos,
    promocao_inicio,
    promocao_fim,
    dome_percentage,
    teor_ouro_default,
    acrescimo_metal_premium,
  } = body;

  // IMPORTANTE: usar sql.json() em vez de JSON.stringify+::jsonb.
  // O padrao antigo salvava JSONB como escalar string ("[\"...\"]") em vez de
  // array nativo, quebrando operacoes @>, ||, jsonb_array_length. Com sql.json()
  // o postgres.js serializa como JSONB nativo.
  const [updated] = await sql`
    UPDATE alissonerp.config_orcamento SET
      start_mkp = COALESCE(${start_mkp ?? null}::numeric, start_mkp),
      discount_percent = COALESCE(${discount_percent ?? null}::numeric, discount_percent),
      profile = COALESCE(${profile ?? null}, profile),
      pricing_categories = COALESCE(${pricing_categories != null ? sql.json(pricing_categories) : null}, pricing_categories),
      groove_rules = COALESCE(${groove_rules != null ? sql.json(groove_rules) : null}, groove_rules),
      stone_markup = COALESCE(${stone_markup ?? null}::numeric, stone_markup),
      stone_prices = COALESCE(${stone_prices != null ? sql.json(stone_prices) : null}, stone_prices),
      calibracao = COALESCE(${calibracao != null ? sql.json(calibracao) : null}, calibracao),
      risco_width = COALESCE(${risco_width ?? null}::numeric, risco_width),
      risco_depth = COALESCE(${risco_depth ?? null}::numeric, risco_depth),
      preco_gravacao = COALESCE(${preco_gravacao ?? null}::numeric, preco_gravacao),
      stone_markups_table = COALESCE(${stone_markups_table != null ? sql.json(stone_markups_table) : null}, stone_markups_table),
      espessura_minima_por_modelo = COALESCE(${espessura_minima_por_modelo != null ? sql.json(espessura_minima_por_modelo) : null}, espessura_minima_por_modelo),
      nomes_modelos = COALESCE(${nomes_modelos != null ? sql.json(nomes_modelos) : null}, nomes_modelos),
      promocao_inicio = ${promocao_inicio !== undefined ? promocao_inicio : sql`promocao_inicio`},
      promocao_fim = ${promocao_fim !== undefined ? promocao_fim : sql`promocao_fim`},
      dome_percentage = COALESCE(${dome_percentage ?? null}::numeric, dome_percentage),
      teor_ouro_default = COALESCE(${teor_ouro_default ?? null}::integer, teor_ouro_default),
      acrescimo_metal_premium = COALESCE(${acrescimo_metal_premium ?? null}::numeric, acrescimo_metal_premium),
      updated_at = now(),
      updated_by = ${user.id}::uuid
    WHERE name = 'default'
    RETURNING *
  `;

  if (!updated) {
    return NextResponse.json({ error: "Config default nao encontrada" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, config: updated });
}
