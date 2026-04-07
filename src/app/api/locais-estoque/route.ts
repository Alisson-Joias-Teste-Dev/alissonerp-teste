import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// GET /api/locais-estoque — lista todos os locais ativos
export async function GET() {
  const rows = await sql`
    SELECT * FROM alissonerp.locais_estoque
    WHERE ativo = true
    ORDER BY id
  `;
  return NextResponse.json(rows);
}

// POST /api/locais-estoque — cria novo local (roles: admin, desenvolvedor)
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  const ROLES_PERMITIDAS = ["admin", "desenvolvedor"];
  if (!caller || !ROLES_PERMITIDAS.includes(caller.role as string)) {
    return NextResponse.json({ error: "Sem permissão — requer admin ou desenvolvedor" }, { status: 403 });
  }

  const { nome } = await req.json() as { nome: string };
  if (!nome || nome.trim() === "") {
    return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO alissonerp.locais_estoque (nome) VALUES (${nome.trim()}) RETURNING *
  `;
  return NextResponse.json(row, { status: 201 });
}
