/**
 * Helpers de ownership para vendas / orcamento / crediario.
 *
 * Regra (mesma do modulo ordens, conforme CLAUDE.md):
 *  - Roles em ROLES_VENDAS_FULL veem/editam TODAS.
 *  - Demais roles autorizadas (ex: consultora) so operam sobre recursos
 *    proprios (vendedor_id = mapeamento do user.id em alissonerp.usuarios).
 *
 * Onda 1D (v2.50.0): fecha IDOR onde `consultora` lia/editava vendas
 * de qualquer colega (vetor direto de fraude de comissao/endereco de entrega).
 */

import sql from "@/lib/db";
import { AuthError, ForbiddenError, type AuthUser } from "@/lib/auth-server";

/**
 * Roles que veem TODAS as vendas/orcamentos/crediarios.
 * (Inclui gerente_loja/gerente_fabrica alem do ROLES_FULL_ACCESS de roles.ts.)
 */
export const ROLES_VENDAS_FULL = [
  "admin",
  "desenvolvedor",
  "diretor",
  "gerente_loja",
  "gerente_fabrica",
] as const;

export function isVendasFullAccess(role: string | null | undefined): boolean {
  return ROLES_VENDAS_FULL.includes(
    role as typeof ROLES_VENDAS_FULL[number],
  );
}

/** Sinaliza venda/orcamento/crediario nao encontrado. Caller mapeia pra 404. */
export class NotFoundError extends Error {
  status = 404;
  constructor(msg = "Recurso nao encontrado") {
    super(msg);
    this.name = "NotFoundError";
  }
}

/**
 * Busca o vendedor_id do user em alissonerp.usuarios.
 * Throws AuthError se usuario nao tem mapeamento de vendedor.
 */
export async function getUserVendedorId(userId: string): Promise<number> {
  const [row] = await sql<{ vendedor_id: number | null }[]>`
    SELECT vendedor_id
      FROM alissonerp.usuarios
     WHERE id = ${userId}::uuid
     LIMIT 1
  `;
  if (!row || row.vendedor_id == null) {
    throw new AuthError("Usuario sem vendedor_id vinculado");
  }
  return Number(row.vendedor_id);
}

/**
 * Garante que `user` pode operar sobre a venda `vendaId`.
 *
 * - Roles full passam direto (busca a venda apenas pra validar existencia).
 * - Outras roles: confere `vendas_erp.vendedor_id == user.vendedor_id`.
 *
 * Throws:
 *  - NotFoundError se venda nao existe.
 *  - ForbiddenError se role nao-full e ownership nao bate.
 *  - AuthError se user nao tem vendedor_id vinculado.
 */
export async function requireVendaOwnership(
  user: AuthUser,
  vendaId: number,
): Promise<{ vendedor_id: number | null }> {
  const [row] = await sql<{ vendedor_id: number | null }[]>`
    SELECT vendedor_id
      FROM alissonerp.vendas_erp
     WHERE id = ${vendaId}
     LIMIT 1
  `;
  if (!row) throw new NotFoundError("Venda nao encontrada");
  if (isVendasFullAccess(user.role)) return row;

  const userVendedorId = await getUserVendedorId(user.id);
  if (row.vendedor_id == null || Number(row.vendedor_id) !== userVendedorId) {
    throw new ForbiddenError("Sem permissao para esta venda");
  }
  return row;
}

/**
 * Idem para orcamento, mas a ownership eh por `usuario_id UUID` (FK auth.users),
 * nao por vendedor_id (apesar da tabela ter ambos).
 */
export async function requireOrcamentoOwnership(
  user: AuthUser,
  orcamentoId: number,
): Promise<{ usuario_id: string | null }> {
  const [row] = await sql<{ usuario_id: string | null }[]>`
    SELECT usuario_id
      FROM alissonerp.orcamentos
     WHERE id = ${orcamentoId}
     LIMIT 1
  `;
  if (!row) throw new NotFoundError("Orcamento nao encontrado");
  if (isVendasFullAccess(user.role)) return row;

  if (row.usuario_id == null || row.usuario_id !== user.id) {
    throw new ForbiddenError("Sem permissao para este orcamento");
  }
  return row;
}

/**
 * Para crediario, vendedor_id vive na view vw_crediario (vem do JOIN com vendas).
 */
export async function requireCrediarioOwnership(
  user: AuthUser,
  contaId: number,
): Promise<{ vendedor_id: number | null }> {
  const [row] = await sql<{ vendedor_id: number | null }[]>`
    SELECT vendedor_id
      FROM alissonerp.vw_crediario
     WHERE conta_receber_id = ${contaId}
     LIMIT 1
  `;
  if (!row) throw new NotFoundError("Conta de crediario nao encontrada");
  if (isVendasFullAccess(user.role)) return row;

  const userVendedorId = await getUserVendedorId(user.id);
  if (row.vendedor_id == null || Number(row.vendedor_id) !== userVendedorId) {
    throw new ForbiddenError("Sem permissao para esta conta");
  }
  return row;
}

/**
 * Atalho: devolve sql fragment para `WHERE <alias>.vendedor_id = X`
 * (ou `1=1` para roles full).
 *
 * Use em GET de lista de vendas:
 *   const ownership = await ownershipWhereVendas(user, "v");
 *   sql`SELECT ... FROM ... v WHERE ... AND ${ownership}`
 *
 * Tipo de retorno via `any` porque postgres@3 tagged template retorna
 * `PendingQuery<Row[]>` mas TS nao casa esse tipo automaticamente com
 * `ParameterOrFragment<never>` quando passado a outro template. Os helpers
 * inline (sql`AND x = ${y}` : sql``) funcionam por causa do union literal —
 * helpers que retornam o fragmento perdem essa inferencia.
 *
 * @param alias prefixo da coluna no SQL (default: sem prefixo). Passe o alias
 *              da tabela quando o GET fizer JOIN para evitar ambiguidade.
 *              Apenas identificadores controlados pelo backend — nunca aceitar
 *              valor vindo do usuario aqui.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ownershipWhereVendas(user: AuthUser, alias?: string): Promise<any> {
  if (isVendasFullAccess(user.role)) {
    return sql`1=1`;
  }
  const vid = await getUserVendedorId(user.id);
  if (alias) {
    return sql`${sql.unsafe(`${alias}.vendedor_id`)} = ${vid}`;
  }
  return sql`vendedor_id = ${vid}`;
}
