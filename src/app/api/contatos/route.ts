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
    celular?: string;
    email?: string;
    endereco?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    cep?: string;
    uf?: string;
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
    INSERT INTO public.contatos (nome, cpf_cnpj, telefone, celular, email, endereco, numero, complemento, bairro, municipio, cep, uf)
    VALUES (
      ${body.nome.trim()},
      ${body.cpf_cnpj ? body.cpf_cnpj.replace(/\D/g, "") : null},
      ${body.telefone?.trim() || null},
      ${body.celular?.trim() || null},
      ${body.email?.trim() || null},
      ${body.endereco?.trim() || null},
      ${body.numero?.trim() || null},
      ${body.complemento?.trim() || null},
      ${body.bairro?.trim() || null},
      ${body.municipio?.trim() || null},
      ${body.cep?.replace(/\D/g, "") || null},
      ${body.uf?.trim().toUpperCase() || null}
    )
    RETURNING id_contato AS id, nome, cpf_cnpj, telefone, celular, email, endereco, numero, complemento, bairro, municipio, cep, uf
  `;

  return NextResponse.json(contato, { status: 201 });
}

// PATCH /api/contatos — atualizar contato existente
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json() as {
    id: number;
    nome?: string;
    cpf_cnpj?: string;
    telefone?: string;
    celular?: string;
    email?: string;
    endereco?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    municipio?: string;
    cep?: string;
    uf?: string;
  };

  if (!body.id) return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });

  const [contato] = await sql`
    UPDATE public.contatos SET
      nome         = COALESCE(${body.nome?.trim() ?? null}, nome),
      cpf_cnpj     = COALESCE(${body.cpf_cnpj ? body.cpf_cnpj.replace(/\D/g, "") : null}, cpf_cnpj),
      telefone     = COALESCE(${body.telefone?.trim() ?? null}, telefone),
      celular      = COALESCE(${body.celular?.trim() ?? null}, celular),
      email        = COALESCE(${body.email?.trim() ?? null}, email),
      endereco     = COALESCE(${body.endereco?.trim() ?? null}, endereco),
      numero       = COALESCE(${body.numero?.trim() ?? null}, numero),
      complemento  = COALESCE(${body.complemento?.trim() ?? null}, complemento),
      bairro       = COALESCE(${body.bairro?.trim() ?? null}, bairro),
      municipio    = COALESCE(${body.municipio?.trim() ?? null}, municipio),
      cep          = COALESCE(${body.cep ? body.cep.replace(/\D/g, "") : null}, cep),
      uf           = COALESCE(${body.uf?.trim().toUpperCase() ?? null}, uf)
    WHERE id_contato = ${body.id}
    RETURNING id_contato AS id, nome, cpf_cnpj, telefone, celular, email, endereco, numero, complemento, bairro, municipio, cep, uf
  `;

  if (!contato) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });
  return NextResponse.json(contato);
}
