import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

export const dynamic = "force-dynamic";

const LocalEstoquePostSchema = z.object({
  nome: z.string().min(1, "obrigatório").max(120),
}).passthrough();

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

  const raw = await req.json().catch(() => ({}));
  const parsed = LocalEstoquePostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { nome } = parsed.data;
  if (!nome || nome.trim() === "") {
    return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO alissonerp.locais_estoque (nome) VALUES (${nome.trim()}) RETURNING *
  `;
  return NextResponse.json(row, { status: 201 });
}
