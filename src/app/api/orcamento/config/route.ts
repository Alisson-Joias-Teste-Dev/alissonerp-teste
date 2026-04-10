import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ROLES_CONFIG = ["desenvolvedor", "admin", "gerente_loja"] as const;

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

  const body = await req.json();
  const {
    start_mkp, discount_percent, profile,
    pricing_categories, groove_rules,
    stone_markup, stone_prices,
    calibracao,
  } = body;

  const [updated] = await sql`
    UPDATE alissonerp.config_orcamento SET
      start_mkp = COALESCE(${start_mkp ?? null}::numeric, start_mkp),
      discount_percent = COALESCE(${discount_percent ?? null}::numeric, discount_percent),
      profile = COALESCE(${profile ?? null}, profile),
      pricing_categories = COALESCE(${JSON.stringify(pricing_categories ?? null)}::jsonb, pricing_categories),
      groove_rules = COALESCE(${JSON.stringify(groove_rules ?? null)}::jsonb, groove_rules),
      stone_markup = COALESCE(${stone_markup ?? null}::numeric, stone_markup),
      stone_prices = COALESCE(${JSON.stringify(stone_prices ?? null)}::jsonb, stone_prices),
      calibracao = COALESCE(${calibracao ? JSON.stringify(calibracao) : null}::jsonb, calibracao),
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
