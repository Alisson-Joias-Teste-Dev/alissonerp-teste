import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [envio, frete] = await Promise.all([
    sql`SELECT id::int, nome, id_api FROM public.forma_envio WHERE situacao = '1' ORDER BY id`,
    sql`SELECT id::int, nome, codigo, id_api_logistica FROM public.forma_frete ORDER BY id`,
  ]);

  return NextResponse.json({ envio, frete });
}
