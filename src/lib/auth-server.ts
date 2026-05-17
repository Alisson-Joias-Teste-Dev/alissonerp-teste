import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { temPermissao } from "@/lib/permissoes";
import { NextResponse, type NextRequest } from "next/server";

export class AuthError extends Error {
  status = 401;
  constructor(msg = "Não autenticado") {
    super(msg);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(msg = "Sem permissão") {
    super(msg);
    this.name = "ForbiddenError";
  }
}

export interface AuthUser {
  id: string;    // UUID do supabase
  role: string;  // de alissonerp.usuarios
  email: string;
}

/**
 * Consolida o padrão repetido em 100+ rotas:
 * supabase.auth.getUser() + SELECT role FROM alissonerp.usuarios
 */
export async function requireAuth(req?: NextRequest): Promise<AuthUser> {
  void req; // reservado para extrair JWT do header no futuro
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new AuthError();
  const [row] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!row) throw new AuthError("Usuário não encontrado");
  return { id: user.id, role: row.role as string, email: user.email ?? "" };
}

/**
 * Lança ForbiddenError se a permissão granular não for satisfeita.
 * Passa role para temPermissao (admin/dev têm fullAccess automático).
 */
export async function requirePermissao(user: AuthUser, permissao: string): Promise<void> {
  const ok = await temPermissao(user.id, permissao, user.role);
  if (!ok) throw new ForbiddenError(`Requer permissão: ${permissao}`);
}

/**
 * Wrapper "tudo em uma chamada": autentica e retorna [user, null] em sucesso,
 * ou [null, NextResponse de erro] em falha. Use em handlers para evitar try/catch
 * repetido. Exemplo:
 *
 *   const [user, errRes] = await authOr401(req);
 *   if (errRes) return errRes;
 *   // ...usar user.id, user.role
 */
export async function authOr401(req?: NextRequest): Promise<[AuthUser, null] | [null, NextResponse]> {
  try {
    const user = await requireAuth(req);
    return [user, null];
  } catch (e) {
    if (e instanceof AuthError) {
      return [null, NextResponse.json({ error: e.message }, { status: 401 })];
    }
    if (e instanceof ForbiddenError) {
      return [null, NextResponse.json({ error: e.message }, { status: 403 })];
    }
    throw e;
  }
}
