import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const locais = await sql`
    SELECT id, nome FROM alissonerp.locais_estoque
    WHERE ativo = true
    ORDER BY id
  `;

  return NextResponse.json(locais);
}
