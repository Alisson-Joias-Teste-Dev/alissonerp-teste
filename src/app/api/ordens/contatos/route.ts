import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// GET /api/ordens/contatos?busca=texto
// Autocomplete de clientes para o modal de criação de ordens
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const busca = req.nextUrl.searchParams.get("busca")?.trim() ?? "";
  if (busca.length < 2) return NextResponse.json([]);

  const termo = `%${busca}%`;
  const contatos = await sql`
    SELECT id_contato, nome, telefone, email
    FROM public.contatos
    WHERE nome ILIKE ${termo}
       OR telefone ILIKE ${termo}
    ORDER BY nome
    LIMIT 20
  `;

  return NextResponse.json(contatos);
}
