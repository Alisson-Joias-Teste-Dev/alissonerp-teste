import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

const ROLES = ["desenvolvedor", "admin", "gerente_loja"];

export async function POST(
  _req: NextRequest,
  { params }: Params
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !ROLES.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const auditoriaId = Number(id);

  const [auditoria] = await sql`
    SELECT id, status FROM alissonerp.auditorias_estoque WHERE id = ${auditoriaId}
  `;
  if (!auditoria) {
    return NextResponse.json({ error: "Auditoria não encontrada" }, { status: 404 });
  }
  if (auditoria.status === "concluido") {
    return NextResponse.json({ error: "Não é possível cancelar auditoria já concluída" }, { status: 409 });
  }
  if (auditoria.status === "cancelado") {
    return NextResponse.json({ error: "Auditoria já cancelada" }, { status: 409 });
  }

  await sql`
    UPDATE alissonerp.auditorias_estoque
    SET status = 'cancelado', data_conclusao = now()
    WHERE id = ${auditoriaId}
  `;

  return NextResponse.json({ id: auditoriaId, status: "cancelado" });
}
