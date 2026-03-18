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

  // Verificar role do usuário autenticado
  const [meuPerfil] = await sql`
    SELECT role::text AS role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
  `;
  if (!meuPerfil) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const isSelfUpdate = user.id === id;
  const isAdmin = isFullAccess(meuPerfil.role);

  // Não-admin só pode atualizar o próprio perfil
  if (!isAdmin && !isSelfUpdate) {
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
    tipos_ordem_permitidos?: string[];
  };

  // Não-admin: só pode alterar nome (proteção backend)
  const { nome, nova_senha } = body;
  const ativo                 = isAdmin ? body.ativo                 : undefined;
  const deposito_id           = isAdmin ? body.deposito_id           : undefined;
  const vendedor_id           = isAdmin ? body.vendedor_id           : undefined;
  const email                 = isAdmin ? body.email                 : undefined;
  const tipos_ordem_permitidos = isAdmin ? body.tipos_ordem_permitidos : undefined;

  // Usuário NUNCA pode alterar sua própria role (proteção dupla: frontend + backend)
  const role = isSelfUpdate ? undefined : body.role;

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

  // 1b. Atualizar tipos_ordem_permitidos (separado, apenas admin)
  if (tipos_ordem_permitidos !== undefined) {
    if (!Array.isArray(tipos_ordem_permitidos)) {
      return NextResponse.json({ error: "tipos_ordem_permitidos deve ser um array" }, { status: 400 });
    }
    await sql`
      UPDATE alissonerp.usuarios
      SET tipos_ordem_permitidos = ${JSON.stringify(tipos_ordem_permitidos)}::jsonb,
          updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }

  // 2. Atualizar user_profiles (se existir)
  // WHERE por email — funciona mesmo se id_user estiver desincronizado (ex: linha órfã com UUID antigo)
  const [upExists] = await sql`
    SELECT 1 FROM public.user_profiles
    WHERE email = (SELECT email FROM alissonerp.usuarios WHERE id = ${id}::uuid)
  `;
  if (upExists) {
    if (role !== undefined) {
      await sql`
        UPDATE public.user_profiles
        SET
          name      = COALESCE(${nome ?? null}, name),
          email     = COALESCE(${email ?? null}, email),
          role      = CASE ${role}
            WHEN 'desenvolvedor'      THEN 'admin'
            WHEN 'admin'              THEN 'admin'
            WHEN 'administrativo'     THEN 'admin'
            WHEN 'gerente_fabrica'    THEN 'gerente'
            WHEN 'gerente_loja'       THEN 'gerente'
            WHEN 'consultora'         THEN 'consultora'
            WHEN 'financeiro'         THEN 'financeiro'
            WHEN 'motoboy'            THEN 'logistica'
            WHEN 'logistica'          THEN 'logistica'
            WHEN 'pcp'                THEN 'producao'
            WHEN 'ourives'            THEN 'producao'
            WHEN 'estoquista_fabrica' THEN 'producao'
            WHEN 'estoquista_loja'    THEN 'user'
            ELSE 'user'
          END,
          is_active = COALESCE(${ativo ?? null}, is_active),
          updated_at = now()
        WHERE email = (SELECT email FROM alissonerp.usuarios WHERE id = ${id}::uuid)
      `;
    } else {
      await sql`
        UPDATE public.user_profiles
        SET
          name      = COALESCE(${nome ?? null}, name),
          email     = COALESCE(${email ?? null}, email),
          is_active = COALESCE(${ativo ?? null}, is_active),
          updated_at = now()
        WHERE email = (SELECT email FROM alissonerp.usuarios WHERE id = ${id}::uuid)
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
