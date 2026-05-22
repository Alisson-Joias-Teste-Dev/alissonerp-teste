/**
 * Master Admin — fonte de verdade pra hierarquia de aprovacoes.
 *
 * Decisao de negocio:
 *   - Existe UM unico master admin (o dono). Imutavel. Aprova qualquer coisa.
 *   - Outros admins/gerentes aprovam descontos ate um limite (config em
 *     parametros_sistema). Acima do limite, soh master aprova.
 *   - Nenhum admin (incluindo o proprio master) pode aprovar a propria
 *     solicitacao — exceto o master, que aprova si mesmo por design (dono).
 *
 * Vide migration 269_master_admin_e_limites_aprovacao.sql.
 */

import sql from "@/lib/db";

// Cache em memoria — parametros_sistema raramente muda. Invalidacao manual
// via clearMasterAdminCache() apos UPDATE direto (raro).
let cachedMasterId: string | null = null;
let cachedLimits: { gerente_loja: number; admin: number } | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000; // 1 minuto

function cacheValido(): boolean {
  return Date.now() < cacheExpiresAt;
}

async function loadCache(): Promise<void> {
  const rows = await sql<{ chave: string; valor: string }[]>`
    SELECT chave, valor FROM alissonerp.parametros_sistema
    WHERE chave IN ('MASTER_ADMIN_USER_ID', 'DESCONTO_MAX_GERENTE_LOJA', 'DESCONTO_MAX_ADMIN')
  `;
  const map = new Map(rows.map((r) => [r.chave, r.valor]));
  cachedMasterId = map.get("MASTER_ADMIN_USER_ID") ?? null;
  cachedLimits = {
    gerente_loja: Number(map.get("DESCONTO_MAX_GERENTE_LOJA") ?? 20),
    admin: Number(map.get("DESCONTO_MAX_ADMIN") ?? 30),
  };
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
}

/** Forca recarregar o cache na proxima leitura (apos UPDATE direto). */
export function clearMasterAdminCache(): void {
  cacheExpiresAt = 0;
}

/** UUID do master admin (Alisson). Throws se nao encontrar. */
export async function getMasterAdminId(): Promise<string> {
  if (!cacheValido()) await loadCache();
  if (!cachedMasterId) {
    throw new Error("MASTER_ADMIN_USER_ID nao configurado em parametros_sistema");
  }
  return cachedMasterId;
}

/** True se o userId eh o master. */
export async function isMasterAdmin(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  const master = await getMasterAdminId();
  return userId === master;
}

/**
 * Desconto maximo (%) que o role pode aprovar sozinho.
 * Acima desse valor, deve escalar pro master.
 *
 * Returns Infinity para master (aprova tudo).
 * Returns 0 para roles que NAO aprovam descontos (consultora, ourives, etc).
 */
export async function getDescontoMaxAprovavel(
  role: string,
  isMaster: boolean,
): Promise<number> {
  if (isMaster) return Infinity;
  if (!cacheValido()) await loadCache();
  const lim = cachedLimits!;
  switch (role) {
    case "gerente_loja":
      return lim.gerente_loja;
    case "admin":
      return lim.admin;
    case "desenvolvedor":
      // Dev tem acesso tecnico — nao deve aprovar negocio. Cai pra admin.
      return lim.admin;
    default:
      return 0;
  }
}

/**
 * Encontra o aprovador apropriado para uma solicitacao de desconto.
 *
 * Regras:
 *   - Se desconto > limite do role mais alto NAO-master => retorna master.
 *   - Se solicitante eh master => retorna o proprio master (auto-aprovacao
 *     consciente por design — dono aprova proprias coisas).
 *   - Caso contrario, retorna admin/gerente_loja ativo com limite suficiente,
 *     EXCLUINDO o solicitante. Se nao houver candidato disponivel, escala pro
 *     master.
 *
 * Sempre retorna um UUID valido (master no pior caso).
 */
export async function encontrarAprovadorParaDesconto(opts: {
  pctDesconto: number;
  solicitanteId: string;
}): Promise<{ aprovadorId: string; escalouParaMaster: boolean }> {
  const master = await getMasterAdminId();

  // Solicitante = master? Master aprova si mesmo (dono).
  if (opts.solicitanteId === master) {
    return { aprovadorId: master, escalouParaMaster: true };
  }

  if (!cacheValido()) await loadCache();
  const lim = cachedLimits!;

  // Desconto acima do limite MAIS ALTO (admin) => so master
  if (opts.pctDesconto > lim.admin) {
    return { aprovadorId: master, escalouParaMaster: true };
  }

  // Procura admin ativo (excluindo solicitante)
  if (opts.pctDesconto > lim.gerente_loja) {
    const [admin] = await sql<{ id: string }[]>`
      SELECT id::text AS id FROM alissonerp.usuarios
      WHERE role IN ('admin', 'desenvolvedor')
        AND ativo = true
        AND id != ${opts.solicitanteId}::uuid
        AND id != ${master}::uuid
      ORDER BY CASE WHEN role = 'admin' THEN 1 ELSE 2 END
      LIMIT 1
    `;
    if (admin?.id) return { aprovadorId: admin.id, escalouParaMaster: false };
    // Sem admin disponivel != master => escala pro master
    return { aprovadorId: master, escalouParaMaster: true };
  }

  // Desconto pequeno (<= limite gerente_loja): procura gerente_loja
  const [gerente] = await sql<{ id: string }[]>`
    SELECT id::text AS id FROM alissonerp.usuarios
    WHERE role = 'gerente_loja'
      AND ativo = true
      AND id != ${opts.solicitanteId}::uuid
    ORDER BY created_at ASC
    LIMIT 1
  `;
  if (gerente?.id) return { aprovadorId: gerente.id, escalouParaMaster: false };

  // Fallback final: master
  return { aprovadorId: master, escalouParaMaster: true };
}
