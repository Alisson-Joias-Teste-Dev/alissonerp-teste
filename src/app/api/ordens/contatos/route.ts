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
  const cpf = req.nextUrl.searchParams.get("cpf")?.trim() ?? "";

  // Busca por CPF
  if (cpf.length >= 6) {
    const contatos = await sql`
      SELECT id_contato, nome, telefone, email, cpf_cnpj
      FROM public.contatos
      WHERE cpf_cnpj ILIKE ${`%${cpf.replace(/\D/g, "")}%`}
      ORDER BY nome
      LIMIT 10
    `;
    return NextResponse.json(contatos);
  }

  // Busca por nome/telefone
  if (busca.length < 2) return NextResponse.json([]);

  const termo = `%${busca}%`;
  const termoDigitos = `%${busca.replace(/\D/g, "")}%`;
  const contatos = await sql`
    SELECT id_contato, nome, telefone, email, cpf_cnpj
    FROM public.contatos
    WHERE nome ILIKE ${termo}
       OR telefone ILIKE ${termo}
       OR celular ILIKE ${termo}
       OR regexp_replace(COALESCE(cpf_cnpj, ''), '\D', '', 'g') ILIKE ${termoDigitos}
    ORDER BY nome
    LIMIT 20
  `;

  return NextResponse.json(contatos);
}
