import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/ordens/vendedores
// Lista vendedores para o dropdown do modal de criação de ordens
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const vendedores = await sql`
    SELECT id_vendedor, nome, email
    FROM public.vendedores
    ORDER BY nome
  `;

  return NextResponse.json(vendedores);
}
