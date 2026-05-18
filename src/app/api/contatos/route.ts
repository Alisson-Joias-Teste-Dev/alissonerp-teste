import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const ContatoBaseFields = {
  nome: z.string().min(1).optional(),
  cpf_cnpj: z.string().optional(),
  telefone: z.string().optional(),
  celular: z.string().optional(),
  email: z.string().optional(),
  endereco: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  municipio: z.string().optional(),
  cep: z.string().optional(),
  uf: z.string().optional(),
};

const ContatoPostSchema = z.object({
  ...ContatoBaseFields,
  nome: z.string().min(1, "obrigatório"),
}).passthrough();

const ContatoPatchSchema = z.object({
  ...ContatoBaseFields,
  id: z.coerce.number().int().positive(),
}).passthrough();

// POST /api/contatos — cadastrar novo contato
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = ContatoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

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

  // Enfileira sync com Tiny (assíncrono, não bloqueia criação do contato)
  await sql`
    INSERT INTO alissonerp.fila_sync_externo (sistema, acao, payload)
    VALUES ('tiny', 'sync_contato', ${JSON.stringify({ id_contato: Number(contato.id) })}::jsonb)
  `;

  return NextResponse.json(contato, { status: 201 });
}

// PATCH /api/contatos — atualizar contato existente
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const rawPatch = await req.json().catch(() => ({}));
  const parsedPatch = ContatoPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return zodError(parsedPatch.error);
  const body = parsedPatch.data;

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

  // Enfileira sync com Tiny (assíncrono, não bloqueia atualização do contato)
  await sql`
    INSERT INTO alissonerp.fila_sync_externo (sistema, acao, payload)
    VALUES ('tiny', 'sync_contato', ${JSON.stringify({ id_contato: body.id })}::jsonb)
  `;

  return NextResponse.json(contato);
}
