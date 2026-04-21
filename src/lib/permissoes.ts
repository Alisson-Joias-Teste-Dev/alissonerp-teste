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

/**
 * Verifica acesso a um módulo via role_permissoes (configurável no painel).
 * Admin/desenvolvedor sempre passam.
 */
export async function temAcessoModulo(
  role: string,
  modulo: string,
  tipo: "ler" | "escrever" = "ler",
): Promise<boolean> {
  if (isFullAccess(role)) return true;

  const [row] = await sql`
    SELECT pode_ler, pode_escrever
    FROM alissonerp.role_permissoes
    WHERE role = ${role} AND modulo = ${modulo}
  `;

  return tipo === "ler" ? row?.pode_ler === true : row?.pode_escrever === true;
}
