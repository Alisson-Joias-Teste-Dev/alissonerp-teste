import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const ROLES_ADMIN_FRETE = ["desenvolvedor", "admin", "gerente_loja"];

// ─── PATCH /api/configuracoes/fretes-bairro/[id] ──────────────────────────────
// Atualiza valor e/ou ativo de um bairro. Requer role admin/desenvolvedor/gerente_loja.
// Body: { valor?: number, ativo?: boolean, bairro?: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || !ROLES_ADMIN_FRETE.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const freteId = Number(id);
  if (isNaN(freteId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json() as {
    valor?:  number;
    ativo?:  boolean;
    bairro?: string;
  };

  if (body.valor !== undefined && (typeof body.valor !== "number" || body.valor < 0)) {
    return NextResponse.json({ error: "valor deve ser um número >= 0" }, { status: 400 });
  }

  try {
    const [existing] = await sql`
      SELECT id FROM alissonerp.fretes_bairro WHERE id = ${freteId}
    `;
    if (!existing) return NextResponse.json({ error: "Bairro não encontrado" }, { status: 404 });

    const [updated] = await sql`
      UPDATE alissonerp.fretes_bairro SET
        valor  = COALESCE(${body.valor  ?? null}, valor),
        ativo  = COALESCE(${body.ativo  ?? null}, ativo),
        bairro = COALESCE(${body.bairro ?? null}, bairro)
      WHERE id = ${freteId}
      RETURNING id, bairro, municipio, valor, ativo
    `;
    return NextResponse.json({ ...updated, valor: Number(updated.valor) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao atualizar";
    const notFound = msg.includes("does not exist") || msg.includes("relation");
    return NextResponse.json(
      { error: notFound ? "Tabela não encontrada — execute a migration 153 no banco" : msg },
      { status: 500 }
    );
  }
}
