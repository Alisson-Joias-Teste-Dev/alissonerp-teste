import sql from "@/lib/db";
import { cacheGet, cacheSet, cacheInvalidar } from "@/lib/cache-memoria";
import { createServerSupabase } from "@/lib/supabase/server";
import { temPermissao } from "@/lib/permissoes";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Validade do cache de identidade (role/ativo), em milissegundos.
 * 60s: equilibrio entre aliviar o banco e refletir rapido uma desativacao
 * feita fora do painel. Baixar reduz o ganho de performance; subir aumenta a
 * janela em que um usuario desativado direto no banco ainda consegue operar.
 */
const TTL_AUTH_MS = 60_000;

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
  // CACHE (60s): role/ativo vem do NOSSO banco e muda raramente. Sem cache isso
  // era 1 consulta em TODA requisicao do ERP, disputando o pool de conexoes.
  // Quem altera usuario (api/user, api/user/[id]) invalida esta chave na hora,
  // entao mudanca feita pelo painel vale imediatamente; so alteracao feita
  // DIRETO NO BANCO demora ate 60s para pegar.
  const chaveCache = `auth:${user.id}`;
  let dados = cacheGet<{ role: string; ativo: boolean | null }>(chaveCache, TTL_AUTH_MS);

  if (dados === undefined) {
    const [row] = await sql`
      SELECT role, ativo FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
    `;
    if (!row) throw new AuthError("Usuário não encontrado");
    dados = { role: row.role as string, ativo: row.ativo as boolean | null };
    cacheSet(chaveCache, dados);
  }

  // BLINDAGEM: checa flag `ativo` em alissonerp.usuarios. Usuario desativado
  // (ex: funcionario demitido) tinha sessao Supabase valida e conseguia operar
  // o ERP normalmente — agora eh bloqueado com 401.
  if (dados.ativo === false) {
    throw new AuthError("Usuário desativado. Contate o administrador.");
  }

  return { id: user.id, role: dados.role, email: user.email ?? "" };
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

/**
 * Limpa o cache de identidade (role/ativo) de UM usuario.
 *
 * O QUE FAZ: apaga a chave `auth:<userId>` usada por requireAuth.
 * O PORQUE: sem isso, promover/rebaixar/desativar alguem so faria efeito
 * depois do TTL de 60s.
 * O IMPACTO SE REMOVIDO: um funcionario demitido continuaria operando o ERP
 * por ate 60s apos a desativacao — risco de seguranca, nao so de UX.
 *
 * CHAMAR SEMPRE apos UPDATE em alissonerp.usuarios que toque role ou ativo.
 */
export function invalidarCacheAuth(userId: string): void {
  cacheInvalidar(`auth:${userId}`);
}
