import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// GET /api/dashboard-comercial/premiacao
export async function GET() {
  const [row] = await sql<Array<{ texto: string }>>`
    SELECT texto FROM alissonerp.config_premiacao WHERE id = 1
  `;
  return NextResponse.json({ texto: row?.texto ?? "" });
}

// PATCH /api/dashboard-comercial/premiacao
// Body: { texto: string }
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { texto } = await req.json() as { texto: string };
  if (typeof texto !== "string") return NextResponse.json({ error: "Campo texto obrigatório" }, { status: 400 });

  await sql`
    UPDATE alissonerp.config_premiacao
    SET texto = ${texto}, updated_at = now()
    WHERE id = 1
  `;

  return NextResponse.json({ ok: true });
}
