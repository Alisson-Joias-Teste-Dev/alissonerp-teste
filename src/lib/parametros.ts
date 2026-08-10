import sql from "@/lib/db";

interface CachedParam {
  valor: string;
  tipo: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const cache = new Map<string, CachedParam>();
let cacheLoadedAt: number | null = null;

async function loadParametros(): Promise<void> {
  const rows = await sql<{ chave: string; valor: string; tipo: string }[]>`
    SELECT chave, valor, tipo FROM alissonerp.configuracoes_unificado
  `;
  cache.clear();
  for (const row of rows) {
    cache.set(row.chave, { valor: row.valor, tipo: row.tipo });
  }
  cacheLoadedAt = Date.now();
}

async function ensureLoaded(): Promise<void> {
  if (cacheLoadedAt === null || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await loadParametros();
  }
}

/** Retorna o valor bruto (string) de um parâmetro de sistema. */
export async function getParametro(chave: string): Promise<string> {
  await ensureLoaded();
  const entry = cache.get(chave);
  if (!entry) throw new Error(`Parâmetro '${chave}' não encontrado em alissonerp.configuracoes_unificado`);
  return entry.valor;
}

/** Retorna o valor numérico de um parâmetro de sistema. */
export async function getParametroNumber(chave: string): Promise<number> {
  const valor = await getParametro(chave);
  const num = Number(valor);
  if (isNaN(num)) throw new Error(`Parâmetro '${chave}' não é numérico: '${valor}'`);
  return num;
}

/** Invalida o cache forçando reload na próxima chamada. */
export function invalidarCacheParametros(): void {
  cacheLoadedAt = null;
  cache.clear();
}

// Chaves tipadas para evitar typos
export const PARAM = {
  ALMOXARIFADO_DEPOSITO_ID: "ALMOXARIFADO_DEPOSITO_ID",
  OURO_18K_INSUMO_ID:       "OURO_18K_INSUMO_ID",
  METAL_CATEGORIA_ID:       "METAL_CATEGORIA_ID",
  PEDRA_CATEGORIA_ID:       "PEDRA_CATEGORIA_ID",
  LOCAL_ESTOQUE_DEFAULT_ID: "LOCAL_ESTOQUE_DEFAULT_ID",
  OURO_24K_LIGA_INSUMO_ID:  "OURO_24K_LIGA_INSUMO_ID",
  INSUMO_CONVERSAO_PADRAO:  "INSUMO_CONVERSAO_PADRAO",
  INSUMO_SOBRA_CONVERSAO_SKU: "INSUMO_SOBRA_CONVERSAO_SKU",
} as const;
