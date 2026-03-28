import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;

// PATCH /api/locais-estoque/[id] — edita nome e/ou ativo
// PROTECT: id=1 (Fábrica) não pode ser desativado
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const localId = parseInt(id);

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

  const body = await req.json() as { nome?: string; ativo?: boolean };

  // Proteção: id=1 (Fábrica) não pode ser desativado
  if (localId === 1 && body.ativo === false) {
    return NextResponse.json(
      { error: "O local Fábrica (id=1) não pode ser desativado" },
      { status: 403 },
    );
  }

  const [existing] = await sql`
    SELECT * FROM alissonerp.locais_estoque WHERE id = ${localId} LIMIT 1
  `;
  if (!existing) return NextResponse.json({ error: "Local não encontrado" }, { status: 404 });

  const nome  = body.nome  !== undefined ? body.nome.trim()  : (existing.nome as string);
  const ativo = body.ativo !== undefined ? body.ativo        : (existing.ativo as boolean);

  const [updated] = await sql`
    UPDATE alissonerp.locais_estoque
    SET nome = ${nome}, ativo = ${ativo}, updated_at = now()
    WHERE id = ${localId}
    RETURNING *
  `;
  return NextResponse.json(updated);
}
