import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/contatos — cadastrar novo contato
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as {
    nome: string;
    cpf_cnpj?: string;
    telefone?: string;
    email?: string;
  };

  if (!body.nome?.trim()) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  // Verificar duplicidade por CPF
  if (body.cpf_cnpj) {
    const cpfLimpo = body.cpf_cnpj.replace(/\D/g, "");
    if (cpfLimpo.length >= 11) {
      const [existe] = await sql`
        SELECT id_contato, nome FROM public.contatos WHERE cpf_cnpj = ${cpfLimpo} LIMIT 1
      `;
      if (existe) {
        return NextResponse.json(
          { error: `CPF já cadastrado para ${existe.nome}`, contato: existe },
          { status: 409 }
        );
      }
    }
  }

  const [contato] = await sql`
    INSERT INTO public.contatos (nome, cpf_cnpj, telefone, email)
    VALUES (
      ${body.nome.trim()},
      ${body.cpf_cnpj ? body.cpf_cnpj.replace(/\D/g, "") : null},
      ${body.telefone?.trim() || null},
      ${body.email?.trim() || null}
    )
    RETURNING id_contato, nome, cpf_cnpj, telefone, email
  `;

  return NextResponse.json(contato, { status: 201 });
}
