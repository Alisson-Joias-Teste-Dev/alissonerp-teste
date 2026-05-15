import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!isFullAccess(usuario?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const subId = Number(id);
  if (isNaN(subId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  await sql`UPDATE alissonerp.tarefas_substitutos SET ativo = false WHERE id = ${subId}`;
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!isFullAccess(usuario?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const subId = Number(id);
  if (isNaN(subId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json() as {
    inicio?: string;
    fim?: string | null;
  };

  await sql`
    UPDATE alissonerp.tarefas_substitutos SET
      inicio = COALESCE(${body.inicio ?? null}::date, inicio),
      fim    = COALESCE(${body.fim ?? null}::date, fim)
    WHERE id = ${subId}
  `;

  return NextResponse.json({ ok: true });
}
