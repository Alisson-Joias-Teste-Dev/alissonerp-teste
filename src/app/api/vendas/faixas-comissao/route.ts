import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const FaixaPatchSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  desconto_pct: z.coerce.number().optional(),
  comissao_pct: z.coerce.number().min(0),
  ativo: z.boolean().optional(),
}).passthrough();

const FaixaPostSchema = z.object({
  desconto_pct: z.coerce.number(),
  comissao_pct: z.coerce.number(),
}).passthrough();

// ─── GET /api/vendas/faixas-comissao ──────────────────────────────────────────
// Retorna todas as faixas de comissão (ativas ou todas via ?todas=1)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const todas = searchParams.get("todas") === "1";

  const faixas = await sql`
    SELECT id, desconto_pct, comissao_pct, ativo, updated_at
    FROM alissonerp.faixas_comissao
    ${todas ? sql`` : sql`WHERE ativo = true`}
    ORDER BY desconto_pct
  `;

  return NextResponse.json(
    faixas.map((f) => ({
      ...f,
      desconto_pct: Number(f.desconto_pct),
      comissao_pct: Number(f.comissao_pct),
    }))
  );
}

// ─── PATCH /api/vendas/faixas-comissao ────────────────────────────────────────
// Atualiza uma faixa (apenas gerente+)
// Body: { id, comissao_pct } ou { desconto_pct, comissao_pct }
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const PODE_EDITAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!PODE_EDITAR.includes(usuario.role)) {
    return NextResponse.json({ error: "Apenas gerentes podem editar faixas de comissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = FaixaPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  if (body.id) {
    await sql`
      UPDATE alissonerp.faixas_comissao SET
        comissao_pct = ${body.comissao_pct},
        ativo        = COALESCE(${body.ativo ?? null}, ativo),
        updated_at   = now(),
        updated_by   = ${user.id}::uuid
      WHERE id = ${body.id}
    `;
  } else if (body.desconto_pct != null) {
    await sql`
      UPDATE alissonerp.faixas_comissao SET
        comissao_pct = ${body.comissao_pct},
        ativo        = COALESCE(${body.ativo ?? null}, ativo),
        updated_at   = now(),
        updated_by   = ${user.id}::uuid
      WHERE desconto_pct = ${body.desconto_pct}
    `;
  } else {
    return NextResponse.json({ error: "Informe id ou desconto_pct" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

// ─── POST /api/vendas/faixas-comissao ─────────────────────────────────────────
// Cria nova faixa
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const PODE = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!usuario || !PODE.includes(usuario.role))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const rawPost = await req.json().catch(() => ({}));
  const parsedPost = FaixaPostSchema.safeParse(rawPost);
  if (!parsedPost.success) return zodError(parsedPost.error);
  const body = parsedPost.data;

  const [row] = await sql`
    INSERT INTO alissonerp.faixas_comissao (desconto_pct, comissao_pct, updated_by)
    VALUES (${body.desconto_pct}, ${body.comissao_pct}, ${user.id}::uuid)
    ON CONFLICT (desconto_pct) DO UPDATE SET comissao_pct = EXCLUDED.comissao_pct, updated_at = now()
    RETURNING id, desconto_pct::float, comissao_pct::float, ativo
  `;
  return NextResponse.json(row);
}
