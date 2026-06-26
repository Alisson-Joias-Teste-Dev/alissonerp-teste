import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const UserPostSchema = z.object({
  nome: z.string().min(1, "obrigatório"),
  email: z.string().email("e-mail inválido"),
  senha: z.string().min(6, "mínimo 6 caracteres"),
  role: z.string().min(1, "obrigatório"),
}).passthrough();

// POST /api/user — criar novo usuário
// Requer: admin ou desenvolvedor
export async function POST(req: NextRequest) {
  // 1. Auth check
  const supabase = await createServerSupabase();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const [caller] = await sql`
    SELECT role::text AS role
    FROM alissonerp.usuarios
    WHERE id = ${user.id}::uuid
    LIMIT 1
  `;
  if (!caller || !isFullAccess(caller.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // 2. Parse body
  const raw = await req.json().catch(() => ({}));
  const parsed = UserPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { nome, email, senha, role } = parsed.data;

  // 3. Validate required fields
  if (!nome?.trim() || !email?.trim() || !senha || !role) {
    return NextResponse.json({ error: "Todos os campos são obrigatórios" }, { status: 400 });
  }
  if (senha.length < 6) {
    return NextResponse.json({ error: "Senha deve ter no mínimo 6 caracteres" }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return NextResponse.json({ error: "E-mail inválido" }, { status: 400 });
  }

  // 4. Validate role exists and is active
  const [roleValida] = await sql`
    SELECT nome FROM alissonerp.roles
    WHERE nome = ${role} AND ativo = true
    LIMIT 1
  `;
  if (!roleValida) {
    return NextResponse.json({ error: "Role inválida ou inativa" }, { status: 400 });
  }

  // 5. Check for duplicate email
  const [existente] = await sql`
    SELECT id FROM auth.users
    WHERE email = ${email.trim().toLowerCase()}
    LIMIT 1
  `;
  if (existente) {
    return NextResponse.json({ error: "E-mail já cadastrado" }, { status: 409 });
  }

  // 6. Create in auth.users
  // IMPORTANT: confirmation_token, recovery_token, email_change_token_new,
  // email_change_token_current, reauthentication_token, email_change,
  // phone_change, phone_change_token MUST be '' (empty string), NOT NULL.
  const [novoUser] = await sql`
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change_token_current,
      reauthentication_token,
      email_change,
      phone_change,
      phone_change_token,
      is_sso_user,
      is_anonymous,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      ${email.trim().toLowerCase()},
      extensions.crypt(${senha}, extensions.gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      false,
      false,
      ${sql.json({ provider: "email", providers: ["email"] })},
      ${sql.json({ nome: nome.trim(), role })},
      now(),
      now()
    )
    RETURNING id, email
  `;

  // 7. Create auth.identities (REQUIRED for login to work)
  // NOTE: 'email' is a GENERATED column in auth.identities — do NOT insert it.
  // provider_id must be the user UUID as text, not the email address.
  await sql`
    INSERT INTO auth.identities (
      id,
      user_id,
      provider,
      provider_id,
      identity_data,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      ${novoUser.id as string}::uuid,
      'email',
      ${novoUser.id as string},
      ${sql.json({ sub: novoUser.id as string, email: email.trim().toLowerCase(), email_verified: false, phone_verified: false })},
      now(),
      now(),
      now()
    )
  `;

  // 8. fn_handle_new_user trigger already inserted a row in alissonerp.usuarios.
  //    Update it with the correct nome and role (trigger may use fallback values).
  await sql`
    UPDATE alissonerp.usuarios
    SET
      nome       = ${nome.trim()},
      role       = ${role},
      ativo      = true,
      updated_at = now()
    WHERE id = ${novoUser.id as string}::uuid
  `;

  return NextResponse.json({
    success: true,
    usuario: {
      id:    novoUser.id,
      email: novoUser.email,
      nome:  nome.trim(),
      role,
    },
  });
}
