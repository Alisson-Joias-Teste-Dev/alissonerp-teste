// ═══════════════════════════════════════════════════════════════════════════
// TASK-003: Configurações do módulo Metal
//
// REGRA DE NEGÓCIO: As configurações do módulo metal são armazenadas em
// alissonerp.configuracoes_sistema. Se não existirem, usa-se os defaults
// (80-85% para compra, 95-100% para recebimento, 50% para comissão).
//
// IMPACTO SE REMOVIDO: Módulo metal não consegue ler cotação do ouro
// nem as faixas de preço configuradas, impossibilitando operações.
// ═══════════════════════════════════════════════════════════════════════════

import sql from "@/lib/db";
import { DEFAULT_METAL_CONFIG, type MetalConfig } from "./types";

/**
 * Lê as configurações do módulo metal de alissonerp.configuracoes_sistema.
 * Se alguma chave não existir no banco, usa o valor DEFAULT como fallback.
 */
export async function getModuloConfig(): Promise<MetalConfig> {
  const rows = await sql<{ chave: string; valor: string }[]>`
    SELECT chave, valor FROM alissonerp.configuracoes_sistema
    WHERE chave IN (
      'compra_metal_min_pct', 'compra_metal_max_pct', 'compra_metal_comm_pct',
      'receb_metal_min_pct', 'receb_metal_max_pct'
    )
  `;

  const config: Record<string, number> = {};
  for (const r of rows) {
    config[r.chave] = parseFloat(r.valor);
  }

  return {
    compra_metal_min_pct: config.compra_metal_min_pct ?? DEFAULT_METAL_CONFIG.compra_metal_min_pct,
    compra_metal_max_pct: config.compra_metal_max_pct ?? DEFAULT_METAL_CONFIG.compra_metal_max_pct,
    compra_metal_comm_pct: config.compra_metal_comm_pct ?? DEFAULT_METAL_CONFIG.compra_metal_comm_pct,
    receb_metal_min_pct: config.receb_metal_min_pct ?? DEFAULT_METAL_CONFIG.receb_metal_min_pct,
    receb_metal_max_pct: config.receb_metal_max_pct ?? DEFAULT_METAL_CONFIG.receb_metal_max_pct,
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
    await sql`
      INSERT INTO alissonerp.configuracoes_sistema (chave, valor, descricao)
      VALUES (${chave}, ${String(valor)}, 'Módulo Metal — atualizado via API')
      ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()
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
  // Tenta primeiro a tabela public.parametros (fonte principal)
  let [row] = await sql`
    SELECT ouro FROM public.parametros LIMIT 1
  `;
  if (row) {
    const val = parseFloat(String(row.ouro));
    if (!isNaN(val) && val > 0) return val;
  }

  // Fallback: tenta alissonerp.curva_config (campo auxiliar)
  [row] = await sql`
    SELECT start_mkp FROM alissonerp.curva_config WHERE id = 1
  `;
  if (row) {
    // Usa gold_cost_percentage como referência (não é cotação, é fallback)
    throw new Error("Cotação do ouro não configurada em public.parametros.ouro");
  }

  throw new Error("Cotação do ouro não configurada. Configure em Configurações > Integrações.");
}
