import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/usuarios/busca?q=nome — busca usuários por nome
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "";

  const usuarios = await sql`
    SELECT id, nome, role FROM alissonerp.usuarios
    WHERE ativo = true AND nome ILIKE ${"%" + q + "%"}
    ORDER BY nome
    LIMIT ${q ? 30 : 200}
  `;

  return NextResponse.json(usuarios);
}
