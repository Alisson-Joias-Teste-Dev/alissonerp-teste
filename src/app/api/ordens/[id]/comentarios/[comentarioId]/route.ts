import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// PATCH /api/ordens/[id]/comentarios/[comentarioId] — editar (somente autor)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; comentarioId: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { comentarioId } = await params;
  const { texto } = await req.json();

  if (!texto?.trim())
    return NextResponse.json({ error: "Texto obrigatório" }, { status: 400 });

  const [c] = await sql`
    SELECT autor_id FROM alissonerp.comentarios_ordem WHERE id = ${parseInt(comentarioId)}
  `;
  if (!c)
    return NextResponse.json(
      { error: "Comentário não encontrado" },
      { status: 404 }
    );
  if (c.autor_id !== user.id)
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await sql`
    UPDATE alissonerp.comentarios_ordem
    SET texto = ${texto}, editado = true, editado_em = now()
    WHERE id = ${parseInt(comentarioId)}
  `;

  return NextResponse.json({ success: true });
}

// DELETE /api/ordens/[id]/comentarios/[comentarioId] — autor ou admin/desenvolvedor
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; comentarioId: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { comentarioId } = await params;

  const [c] = await sql`
    SELECT autor_id FROM alissonerp.comentarios_ordem WHERE id = ${parseInt(comentarioId)}
  `;
  if (!c)
    return NextResponse.json(
      { error: "Comentário não encontrado" },
      { status: 404 }
    );

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  const isAdmin = ["admin", "desenvolvedor"].includes(usuario?.role);

  if (c.autor_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await sql`DELETE FROM alissonerp.comentarios_ordem WHERE id = ${parseInt(comentarioId)}`;
  return NextResponse.json({ success: true });
}
