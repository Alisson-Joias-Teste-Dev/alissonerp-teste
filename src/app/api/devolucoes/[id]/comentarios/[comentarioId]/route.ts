// Editar/excluir comentario da DEVOLUCAO (B2) — espelho do das ordens.
// PATCH: somente autor. DELETE (soft): autor ou admin/desenvolvedor.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const ComentarioPatchSchema = z.object({
  texto: z.string().min(1, "obrigatório"),
}).passthrough();

// PATCH /api/devolucoes/[id]/comentarios/[comentarioId] — editar (somente autor)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; comentarioId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { comentarioId } = await params;
  const raw = await req.json().catch(() => ({}));
  const parsed = ComentarioPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { texto } = parsed.data;

  const [c] = await sql`
    SELECT autor_id FROM alissonerp.comentarios_devolucao WHERE id = ${parseInt(comentarioId)}
  `;
  if (!c) return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
  if (c.autor_id !== user.id) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await sql`
    UPDATE alissonerp.comentarios_devolucao
    SET texto_original = CASE WHEN texto_original IS NULL THEN texto ELSE texto_original END,
        texto = ${texto}, editado = true, editado_em = now()
    WHERE id = ${parseInt(comentarioId)}
  `;
  return NextResponse.json({ success: true });
}

// DELETE /api/devolucoes/[id]/comentarios/[comentarioId] — autor ou admin/desenvolvedor
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; comentarioId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { comentarioId } = await params;

  const [c] = await sql`
    SELECT autor_id FROM alissonerp.comentarios_devolucao WHERE id = ${parseInt(comentarioId)}
  `;
  if (!c) return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  const isAdmin = ["admin", "desenvolvedor"].includes(usuario?.role);

  if (c.autor_id !== user.id && !isAdmin) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await sql`
    UPDATE alissonerp.comentarios_devolucao
    SET excluido = true, excluido_em = now(), excluido_por = ${user.id}::uuid
    WHERE id = ${parseInt(comentarioId)}
  `;
  return NextResponse.json({ success: true });
}
