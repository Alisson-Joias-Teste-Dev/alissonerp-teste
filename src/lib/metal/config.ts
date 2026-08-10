// ═══════════════════════════════════════════════════════════════════════════
// TASK-003: Configurações do módulo Metal
//
// REGRA DE NEGÓCIO: As configurações do módulo metal são armazenadas em
// alissonerp.configuracoes_unificado. Se não existirem, usa-se os defaults
// (80-85% para compra, 95-100% para recebimento, 50% para comissão).
//
// IMPACTO SE REMOVIDO: Módulo metal não consegue ler cotação do ouro
// nem as faixas de preço configuradas, impossibilitando operações.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { DEFAULT_METAL_CONFIG, type MetalConfig } from "./types";

/**
 * Lê as configurações do módulo metal de alissonerp.configuracoes_unificado.
 * Se alguma chave não existir no banco, usa o valor DEFAULT como fallback.
 */
export async function getModuloConfig(): Promise<MetalConfig> {
  const rows = await sql<{ chave: string; valor: string }[]>`
    SELECT chave, valor FROM alissonerp.configuracoes_unificado
    WHERE chave IN (
      'compra_metal_min_pct', 'compra_metal_max_pct', 'compra_metal_comm_pct',
      'receb_metal_min_pct', 'receb_metal_max_pct', 'metal_aprovador_id',
      'metal_home_roles'
    )
  `;

  const config: Record<string, string | number | string[]> = {};
  for (const r of rows) {
    if (r.chave === 'metal_aprovador_id') {
      config[r.chave] = r.valor;
    } else if (r.chave === 'metal_home_roles') {
      // REGRA DE NEGÓCIO: metal_home_roles é armazenado como JSON array.
      // Parse seguro com fallback para array vazio.
      try {
        const parsed = JSON.parse(r.valor);
        config[r.chave] = Array.isArray(parsed) ? parsed : [];
      } catch {
        config[r.chave] = [];
      }
    } else {
      config[r.chave] = parseFloat(r.valor);
    }
  }

  return {
    compra_metal_min_pct: (config.compra_metal_min_pct as number) ?? DEFAULT_METAL_CONFIG.compra_metal_min_pct,
    compra_metal_max_pct: (config.compra_metal_max_pct as number) ?? DEFAULT_METAL_CONFIG.compra_metal_max_pct,
    compra_metal_comm_pct: (config.compra_metal_comm_pct as number) ?? DEFAULT_METAL_CONFIG.compra_metal_comm_pct,
    receb_metal_min_pct: (config.receb_metal_min_pct as number) ?? DEFAULT_METAL_CONFIG.receb_metal_min_pct,
    receb_metal_max_pct: (config.receb_metal_max_pct as number) ?? DEFAULT_METAL_CONFIG.receb_metal_max_pct,
    metal_aprovador_id: (config.metal_aprovador_id as string) ?? DEFAULT_METAL_CONFIG.metal_aprovador_id,
    metal_home_roles: (config.metal_home_roles as string[]) ?? DEFAULT_METAL_CONFIG.metal_home_roles,
  };
}

/**
 * Atualiza configurações do módulo metal (partial update).
 * Só altera os campos enviados. Os não enviados permanecem inalterados.
 *
 * REGRA DE NEGÓCIO: Apenas admin/desenvolvedor/diretor podem alterar.
 * A validação de permissão deve ser feita na API route antes de chamar.
 */
export async function updateModuloConfig(
  updates: Partial<MetalConfig>,
): Promise<MetalConfig> {
  const entries = Object.entries(updates).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return getModuloConfig();

  for (const [chave, valor] of entries) {
    // REGRA DE NEGÓCIO: metal_home_roles é array de strings, serializado como JSON.
    const valorStr = chave === 'metal_home_roles' && Array.isArray(valor)
      ? JSON.stringify(valor)
      : String(valor);
    await sql`
      INSERT INTO alissonerp.configuracoes_unificado (chave, valor, descricao)
      VALUES (${chave}, ${valorStr}, 'Módulo Metal — atualizado via API')
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_em = now()
    `;
  }

  return getModuloConfig();
}

/**
 * Lê a cotação atual do ouro de public.parametros.
 *
 * REGRA DE NEGÓCIO: A cotação é CONGELADA no momento da compra/recebimento
 * para auditoria. Variações futuras da cotação não alteram registros passados.
 */
export async function getCotacaoOuro(): Promise<number> {
  // REGRA DE NEGÓCIO:
  // O QUE: prioriza public.parametros.ouro e usa fallback em alissonerp.parametros.cotacao_ouro.
  // POR QUE: em produção pode haver restrição de acesso/contexto na fonte principal; o módulo
  //          não pode exibir cotação zerada se existe valor válido em fonte secundária oficial.
  // IMPACTO: sem esse fallback, falha pontual de leitura vira 0,00/g na UI e bloqueia operação.

  // Fonte principal do módulo metal.
  try {
    const [row] = await sql<{ ouro: string | number | null }[]>`
      SELECT ouro FROM public.parametros LIMIT 1
    `;
    const val = Number(row?.ouro ?? 0);
    if (Number.isFinite(val) && val > 0) return val;
  } catch {
    // Não interrompe aqui: tenta fallback oficial no schema alissonerp.
  }

  // Fallback oficial de cotação no ERP.
  try {
    const [row] = await sql<{ cotacao_ouro: string | number | null }[]>`
      SELECT cotacao_ouro FROM alissonerp.parametros WHERE id = 1
    `;
    const val = Number(row?.cotacao_ouro ?? 0);
    if (Number.isFinite(val) && val > 0) return val;
  } catch {
    // Deixa o erro final padronizado abaixo.
  }

  throw new Error("Cotação do ouro indisponível em public.parametros.ouro e alissonerp.parametros.cotacao_ouro.");
}
