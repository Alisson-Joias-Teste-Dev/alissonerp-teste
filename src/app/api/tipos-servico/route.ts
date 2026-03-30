import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

const FULL_ACCESS_ROLES = ["desenvolvedor", "admin"];

// GET /api/tipos-servico
// ?todos=true → inclui inativos (admin)
// Default: só ativos (modal)
// Retorna: { tipos: [{ id, nome, ativo, created_at }] }
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const todos = req.nextUrl.searchParams.get("todos") === "true";

  const tipos = await sql`
    SELECT id, nome, ativo, created_at
    FROM alissonerp.tipos_servico
    ${todos ? sql`` : sql`WHERE ativo = true`}
    ORDER BY nome ASC
  `;

  return NextResponse.json({ tipos });
}

// POST /api/tipos-servico
// Body: { nome: string }
// Roles: admin, desenvolvedor
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  if (!FULL_ACCESS_ROLES.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão para criar tipos de serviço" }, { status: 403 });
  }

  const body = await req.json();
  const nome = (body.nome ?? "").toString().trim();
  if (!nome) {
    return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  }

  const [novo] = await sql`
    INSERT INTO alissonerp.tipos_servico (nome)
    VALUES (${nome})
    RETURNING id, nome, ativo, created_at
  `;

  return NextResponse.json({ tipo: novo }, { status: 201 });
}

// PATCH /api/tipos-servico
// Body: { id: number, nome?: string, ativo?: boolean }
// Roles: admin, desenvolvedor
// NÃO DELETE físico — apenas desativar (ativo=false)
export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });
  if (!FULL_ACCESS_ROLES.includes(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão para editar tipos de serviço" }, { status: 403 });
  }

  const body = await req.json();
  const { id, nome, ativo } = body;

  if (!id || typeof id !== "number") {
    return NextResponse.json({ error: "id é obrigatório e deve ser número" }, { status: 400 });
  }

  // Construir updates dinamicamente
  if (nome !== undefined) {
    const nomeTrimmed = nome.toString().trim();
    if (!nomeTrimmed) {
      return NextResponse.json({ error: "Nome não pode ser vazio" }, { status: 400 });
    }
    if (ativo !== undefined) {
      await sql`
        UPDATE alissonerp.tipos_servico
        SET nome = ${nomeTrimmed}, ativo = ${Boolean(ativo)}
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE alissonerp.tipos_servico
        SET nome = ${nomeTrimmed}
        WHERE id = ${id}
      `;
    }
  } else if (ativo !== undefined) {
    await sql`
      UPDATE alissonerp.tipos_servico
      SET ativo = ${Boolean(ativo)}
      WHERE id = ${id}
    `;
  } else {
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });
  }

  const [updated] = await sql`
    SELECT id, nome, ativo, created_at
    FROM alissonerp.tipos_servico
    WHERE id = ${id}
  `;

  return NextResponse.json({ tipo: updated });
}
