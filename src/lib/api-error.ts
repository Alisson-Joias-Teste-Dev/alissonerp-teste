import { NextResponse } from "next/server";

/**
 * Resposta padronizada para erros nao-controlados (catch generico) em rotas API.
 *
 * Loga o erro completo (com stack) no server e devolve apenas uma mensagem
 * generica pro cliente — nunca vaza err.message do Postgres, stack trace,
 * nem hint de schema/coluna/constraint.
 *
 * Use SEMPRE que o catch capturar `unknown`/`Error` sem ser instancia de uma
 * classe de erro de dominio controlada (AuthError, ForbiddenError, HttpError).
 *
 * @param tag identificador da rota para o log ("[POST /api/X]")
 * @param err erro capturado no catch
 * @param fallback mensagem opcional exposta ao cliente (default "Erro interno")
 * @param status codigo HTTP (default 500)
 */
export function internalError(
  tag: string,
  err: unknown,
  fallback = "Erro interno",
  status = 500,
): NextResponse {
  console.error(tag, err);
  return NextResponse.json({ error: fallback }, { status });
}
