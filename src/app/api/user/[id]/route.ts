import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";
import { invalidarCacheAuth } from "@/lib/auth-server";

const UserPatchSchema = z.object({
  nome: z.string().optional(),
  role: z.string().optional(),
  ativo: z.boolean().optional(),
  deposito_id: z.coerce.number().int().nullable().optional(),
  vendedor_id: z.coerce.number().int().nullable().optional(),
  email: z.string().optional(),
  nova_senha: z.string().optional(),
  tipos_ordem_permitidos: z.array(z.string()).optional(),
  tipos_protocolo_permitidos: z.array(z.string()).optional(),
  is_operador_service: z.boolean().optional(),
  is_transportador: z.boolean().optional(),
  mx_desconto_permitido: z.coerce.number().nullable().optional(),
}).passthrough();

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

  const raw = await req.json().catch(() => ({}));
  const parsedBody = UserPatchSchema.safeParse(raw);
  if (!parsedBody.success) return zodError(parsedBody.error);
  const body = parsedBody.data;

  // Não-admin: só pode alterar nome (proteção backend)
  const { nome, nova_senha } = body;
  const ativo                 = isAdmin ? body.ativo                 : undefined;
  const deposito_id           = isAdmin ? body.deposito_id           : undefined;
  const vendedor_id           = isAdmin ? body.vendedor_id           : undefined;
  const email                 = isAdmin ? body.email                 : undefined;
  const tipos_ordem_permitidos     = isAdmin ? body.tipos_ordem_permitidos     : undefined;
  const tipos_protocolo_permitidos = isAdmin ? body.tipos_protocolo_permitidos : undefined;
  const is_operador_service        = isAdmin ? body.is_operador_service         : undefined;
  const is_transportador           = isAdmin ? body.is_transportador            : undefined;
  const mx_desconto_permitido      = isAdmin ? body.mx_desconto_permitido       : undefined;

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

  // 1. Atualizar alissonerp.usuarios (tabela principal — email excluído, tratado atomicamente abaixo)
  if (role !== undefined) {
    await sql`
      UPDATE alissonerp.usuarios
      SET
        nome                  = COALESCE(${nome ?? null}, nome),
        role                  = COALESCE(${role}, role),
        ativo                 = COALESCE(${ativo ?? null}, ativo),
        deposito_id           = ${deposito_id !== undefined ? (deposito_id ?? null) : sql`deposito_id`},
        vendedor_id           = ${vendedor_id !== undefined ? (vendedor_id ?? null) : sql`vendedor_id`},
        mx_desconto_permitido = ${mx_desconto_permitido !== undefined ? (mx_desconto_permitido ?? null) : sql`mx_desconto_permitido`},
        updated_at            = now()
      WHERE id = ${id}::uuid
    `;
  } else {
    await sql`
      UPDATE alissonerp.usuarios
      SET
        nome                  = COALESCE(${nome ?? null}, nome),
        ativo                 = COALESCE(${ativo ?? null}, ativo),
        deposito_id           = ${deposito_id !== undefined ? (deposito_id ?? null) : sql`deposito_id`},
        vendedor_id           = ${vendedor_id !== undefined ? (vendedor_id ?? null) : sql`vendedor_id`},
        mx_desconto_permitido = ${mx_desconto_permitido !== undefined ? (mx_desconto_permitido ?? null) : sql`mx_desconto_permitido`},
        updated_at            = now()
      WHERE id = ${id}::uuid
    `;
  }

  // 1b. Atualizar tipos_ordem_permitidos (separado, apenas admin)
  if (tipos_ordem_permitidos !== undefined) {
    const arr = Array.isArray(tipos_ordem_permitidos) ? tipos_ordem_permitidos : [];
    await sql`
      UPDATE alissonerp.usuarios
      SET tipos_ordem_permitidos = ${sql.json(arr)},
          updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }

  // 1c. Atualizar tipos_protocolo_permitidos (separado, apenas admin)
  if (tipos_protocolo_permitidos !== undefined) {
    const arr = Array.isArray(tipos_protocolo_permitidos) ? tipos_protocolo_permitidos : [];
    await sql`
      UPDATE alissonerp.usuarios
      SET tipos_protocolo_permitidos = ${sql.json(arr)},
          updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }

  // 1d. Atualizar flags is_operador_service e is_transportador (separado, apenas admin)
  if (is_operador_service !== undefined) {
    await sql`
      UPDATE alissonerp.usuarios
      SET is_operador_service = ${is_operador_service},
          updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }
  if (is_transportador !== undefined) {
    await sql`
      UPDATE alissonerp.usuarios
      SET is_transportador = ${is_transportador},
          updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }

  // 2. Atualizar user_profiles (se existir) — nome/role/ativo; email tratado abaixo
  // WHERE por id_user (UUID estável) — evita falha quando emails diferem entre tabelas
  const [upExists] = await sql`
    SELECT 1 FROM public.user_profiles WHERE id_user = ${id}::uuid
  `;
  if (upExists) {
    if (role !== undefined) {
      await sql`
        UPDATE public.user_profiles
        SET
          name      = COALESCE(${nome ?? null}, name),
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
          is_active  = COALESCE(${ativo ?? null}, is_active),
          updated_at = now()
        WHERE id_user = ${id}::uuid
      `;
    } else {
      await sql`
        UPDATE public.user_profiles
        SET
          name       = COALESCE(${nome ?? null}, name),
          is_active  = COALESCE(${ativo ?? null}, is_active),
          updated_at = now()
        WHERE id_user = ${id}::uuid
      `;
    }
  }

  // 3. Atualizar email atomicamente nas 3 tabelas (transação)
  // auth.users.id = alissonerp.usuarios.id (mesmo UUID — join direto)
  if (email) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql.begin(async (tx: any) => {
      await tx`
        UPDATE auth.users
        SET email = ${email}, email_confirmed_at = now(), updated_at = now()
        WHERE id = ${id}::uuid
      `;
      await tx`
        UPDATE alissonerp.usuarios
        SET email = ${email}, updated_at = now()
        WHERE id = ${id}::uuid
      `;
      await tx`
        UPDATE public.user_profiles
        SET email = ${email}, updated_at = now()
        WHERE id_user = ${id}::uuid
      `;
    });
  }

  if (isSelfUpdate && nova_senha) {
    return NextResponse.json({ error: 'Para trocar sua própria senha, use a opção no seu perfil.' }, { status: 400 });
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

  // INVALIDACAO DE CACHE: requireAuth guarda role/ativo por 60s (cache-memoria).
  // Sem esta linha, promover, rebaixar ou DESATIVAR alguem so faria efeito depois
  // de 60s — um funcionario demitido continuaria operando o ERP nesse intervalo.
  invalidarCacheAuth(id);

  // Retornar usuário atualizado
  const [updated] = await sql`
    SELECT
      u.id, u.email, u.nome, u.role::text, u.ativo, u.deposito_id, u.vendedor_id, u.created_at,
      u.tipos_ordem_permitidos, u.tipos_protocolo_permitidos, u.is_operador_service, u.is_transportador, u.mx_desconto_permitido,
      up.avatar_url
    FROM alissonerp.usuarios u
    LEFT JOIN public.user_profiles up ON up.id_user = u.id
    WHERE u.id = ${id}::uuid
  `;

  return NextResponse.json({ usuario: updated });
}
