import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";

/**
 * Verifica se um usuário tem permissão para uma ação.
 * Admin e desenvolvedor sempre passam (fullAccess).
 * Para outros roles, consulta alissonerp.permissoes_usuario.
 */
export async function temPermissao(
  userId: string,
  acao: string,
  role: string,
): Promise<boolean> {
  if (isFullAccess(role)) return true;

  const [row] = await sql`
    SELECT permitido
    FROM alissonerp.permissoes_usuario
    WHERE usuario_id = ${userId}::uuid
      AND acao = ${acao}
  `;

  return row?.permitido === true;
}
