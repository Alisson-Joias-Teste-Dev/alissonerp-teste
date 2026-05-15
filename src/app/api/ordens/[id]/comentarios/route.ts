import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { uploadFile } from "@/lib/storage";

// GET /api/ordens/[id]/comentarios
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const ordemId = parseInt(id);
  if (isNaN(ordemId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const comentarios = await sql`
    SELECT c.id, c.texto, c.mencoes, c.autor_id, c.editado, c.editado_em, c.created_at,
           c.foto_path,
           u.nome AS autor_nome, u.role AS autor_role
    FROM alissonerp.comentarios_ordem c
    JOIN alissonerp.usuarios u ON u.id = c.autor_id
    WHERE c.ordem_id = ${ordemId} AND (c.excluido = false OR c.excluido IS NULL)
    ORDER BY c.created_at ASC
  `;

  return NextResponse.json(comentarios);
}

// POST /api/ordens/[id]/comentarios
export async function POST() {
  // COMENTÁRIOS DESATIVADOS globalmente (Opção B).
  // A criação de novos comentários está bloqueada no servidor.
  // Reativar: restaurar o código original (git checkout).
  return NextResponse.json(
    { error: "Comentários estão desativados", success: false },
    { status: 403 }
  );
}
