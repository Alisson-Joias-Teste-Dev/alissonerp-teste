import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";

// POST /api/fichas-tecnicas
// Body: { ordem_id, tipo_item, dados }
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as {
    ordem_id?: number;
    tipo_item?: string;
    dados?: Record<string, unknown>;
  };

  const { ordem_id, tipo_item, dados } = body;

  if (!ordem_id || !tipo_item || !dados) {
    return NextResponse.json({ error: "ordem_id, tipo_item e dados são obrigatórios" }, { status: 400 });
  }

  const [ficha] = await sql`
    INSERT INTO alissonerp.fichas_tecnicas (ordem_id, tipo_item, dados, created_by)
    VALUES (${ordem_id}, ${tipo_item}, ${JSON.stringify(dados)}::jsonb, ${user.id}::uuid)
    RETURNING id
  `;

  return NextResponse.json({ id: ficha.id }, { status: 201 });
}
