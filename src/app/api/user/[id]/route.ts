import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

// Validação de role: verificar contra alissonerp.roles (dinâmico)
async function isRoleValida(role: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM alissonerp.roles WHERE nome = ${role} AND ativo = true`;
  return rows.length > 0;
}

// PATCH /api/user/[id] — atualizar dados do usuário
// Body: { nome?, role?, ativo?, deposito_id?, email?, nova_senha? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Verificar autenticação
  const supabase = await createServerSupabase();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Verificar que é admin/desenvolvedor (join por UUID — emails podem diferir entre tabelas)
  const [meuPerfil] = await sql`
    SELECT role::text AS role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  if (!meuPerfil || !isFullAccess(meuPerfil.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json() as {
    nome?: string;
    role?: string;
    ativo?: boolean;
    deposito_id?: number | null;
    vendedor_id?: number | null;
    email?: string;
    nova_senha?: string;
  };

  const { nome, ativo, deposito_id, vendedor_id, email, nova_senha } = body;

  // Usuário NUNCA pode alterar sua própria role (proteção dupla: frontend + backend)
  const role = (user.id === id) ? undefined : body.role;

  // Validar role contra tabela alissonerp.roles (dinâmica)
  if (role !== undefined && !(await isRoleValida(role))) {
    return NextResponse.json({ error: "Role inválida" }, { status: 400 });
  }

  // Validar email
  if (email !== undefined && email !== "") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
    }
  }

  // Validar senha
  if (nova_senha !== undefined && nova_senha !== "") {
    if (nova_senha.length < 6) {
      return NextResponse.json({ error: "Senha mínimo 6 caracteres" }, { status: 400 });
    }
  }

  // 1. Atualizar alissonerp.usuarios (tabela principal)
  if (role !== undefined) {
    await sql`
      UPDATE alissonerp.usuarios
      SET
        nome        = COALESCE(${nome ?? null}, nome),
        email       = COALESCE(${email ?? null}, email),
        role        = COALESCE(${role}, role),
        ativo       = COALESCE(${ativo ?? null}, ativo),
        deposito_id = ${deposito_id ?? null},
        vendedor_id = ${vendedor_id ?? null},
        updated_at  = now()
      WHERE id = ${id}::uuid
    `;
  } else {
    await sql`
      UPDATE alissonerp.usuarios
      SET
        nome        = COALESCE(${nome ?? null}, nome),
        email       = COALESCE(${email ?? null}, email),
        ativo       = COALESCE(${ativo ?? null}, ativo),
        deposito_id = ${deposito_id ?? null},
        vendedor_id = ${vendedor_id ?? null},
        updated_at  = now()
      WHERE id = ${id}::uuid
    `;
  }

  // 2. Atualizar user_profiles (se existir)
  const [upExists] = await sql`SELECT 1 FROM public.user_profiles WHERE id_user = ${id}::uuid`;
  if (upExists) {
    if (role !== undefined) {
      await sql`
        UPDATE public.user_profiles
        SET
          name      = COALESCE(${nome ?? null}, name),
          email     = COALESCE(${email ?? null}, email),
          role      = COALESCE(${role ?? null}, role),
          is_active = COALESCE(${ativo ?? null}, is_active),
          updated_at = now()
        WHERE id_user = ${id}::uuid
      `;
    } else {
      await sql`
        UPDATE public.user_profiles
        SET
          name      = COALESCE(${nome ?? null}, name),
          email     = COALESCE(${email ?? null}, email),
          is_active = COALESCE(${ativo ?? null}, is_active),
          updated_at = now()
        WHERE id_user = ${id}::uuid
      `;
    }
  }

  // 3. Atualizar auth.users (email e/ou senha)
  // auth.users.id = alissonerp.usuarios.id (mesmo UUID — join direto, sem email)
  if (email) {
    await sql`
      UPDATE auth.users
      SET
        email                = ${email},
        email_confirmed_at   = now(),
        updated_at           = now()
      WHERE id = ${id}::uuid
    `;
  }

  if (nova_senha && nova_senha.length >= 6) {
    await sql`
      UPDATE auth.users
      SET
        encrypted_password = extensions.crypt(${nova_senha}, extensions.gen_salt('bf')),
        updated_at         = now()
      WHERE id = ${id}::uuid
    `;
  }

  // Retornar usuário atualizado
  const [updated] = await sql`
    SELECT
      u.id, u.email, u.nome, u.role::text, u.ativo, u.deposito_id, u.vendedor_id, u.created_at,
      up.avatar_url
    FROM alissonerp.usuarios u
    LEFT JOIN public.user_profiles up ON up.id_user = u.id
    WHERE u.id = ${id}::uuid
  `;

  return NextResponse.json({ usuario: updated });
}
