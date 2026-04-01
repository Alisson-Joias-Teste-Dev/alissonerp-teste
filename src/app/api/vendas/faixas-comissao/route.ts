import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

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

  const body = await req.json() as {
    id?:           number;
    desconto_pct?: number;
    comissao_pct:  number;
    ativo?:        boolean;
  };

  if (body.comissao_pct == null || body.comissao_pct < 0) {
    return NextResponse.json({ error: "comissao_pct inválida" }, { status: 400 });
  }

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
