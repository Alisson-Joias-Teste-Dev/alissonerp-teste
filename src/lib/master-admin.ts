/**
 * Master Admin — fonte de verdade pra identificar o dono (Alisson).
 *
 * Decisao de negocio:
 *   - Existe UM unico master admin (o dono). Imutavel via trigger fn_proteger_master_admin
 *     em alissonerp.parametros_sistema (chave MASTER_ADMIN_USER_ID).
 *   - Master aprova qualquer coisa (inclusive proprias solicitacoes).
 *   - Outros admins/gerentes seguem regras configuradas em
 *     alissonerp.tarefas_regras_aprovacao — SEM hardcode de limites aqui.
 *     Esta lib SO responde "quem eh o master?".
 *
 * Vide migration 269_master_admin_e_limites_aprovacao.sql.
 */

import sql from "@/lib/db";

// Cache em memoria — master_admin_user_id eh imutavel; TTL longo eh seguro.
let cached: { masterId: string; expiresAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60_000; // 5 minutos

/** Forca recarregar o cache (uso raro — apos migration). */
export function clearMasterAdminCache(): void {
  cached = null;
}

/** UUID do master admin (Alisson). Throws se nao encontrar. */
export async function getMasterAdminId(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt) return cached.masterId;

  const [row] = await sql<{ valor: string }[]>`
    SELECT valor FROM alissonerp.parametros_sistema WHERE chave = 'MASTER_ADMIN_USER_ID' LIMIT 1
  `;
  if (!row?.valor) {
    throw new Error("MASTER_ADMIN_USER_ID nao configurado em parametros_sistema");
  }
  cached = { masterId: row.valor, expiresAt: Date.now() + CACHE_TTL_MS };
  return row.valor;
}

/** True se o userId eh o master. */
export async function isMasterAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const master = await getMasterAdminId();
  return userId === master;
}
