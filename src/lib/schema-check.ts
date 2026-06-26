/**
 * Helpers para verificar se colunas/tabelas existem antes de executar queries
 * que dependem delas. Usado para tornar o código tolerante a migrations
 * pendentes (evita erros "relation does not exist" quebrando cadastros).
 *
 * Estratégia de cache:
 *   • Resultados positivos (existe=true) são cacheados indefinidamente
 *     (tabelas/colunas não somem em runtime).
 *   • Resultados negativos (existe=false) expiram em 30s — assim, quando
 *     você aplica uma migration sem reiniciar o servidor, a próxima
 *     chamada re-verifica e passa a retornar true.
 */
import sql from "@/lib/db";

type PgSql = ReturnType<typeof Object> & typeof sql;

const NEGATIVE_TTL_MS = 30_000;

// Cache: null = não cacheado; true = existe (permanente);
// { negUntil } = marcado como não-existente até esse timestamp.
type CacheEntry = true | { negUntil: number };
const tabelaCache = new Map<string, CacheEntry>();
const colunaCache = new Map<string, CacheEntry>();

function lookup(cache: Map<string, CacheEntry>, key: string): boolean | null {
  const entry = cache.get(key);
  if (entry === undefined) return null;
  if (entry === true) return true;
  if (Date.now() < entry.negUntil) return false;
  cache.delete(key); // TTL expirou
  return null;
}

function save(cache: Map<string, CacheEntry>, key: string, existe: boolean) {
  cache.set(key, existe ? true : { negUntil: Date.now() + NEGATIVE_TTL_MS });
}

/** Verifica se uma tabela existe no schema. Cache positivo permanente,
 *  negativo 30s. */
export async function tabelaExiste(
  schema: string,
  tabela: string,
  client: PgSql = sql as unknown as PgSql,
): Promise<boolean> {
  const key = `${schema}.${tabela}`;
  const cached = lookup(tabelaCache, key);
  if (cached !== null) return cached;

  const [row] = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = ${schema} AND table_name = ${tabela}
    ) AS exists
  `;
  const ok = !!row?.exists;
  save(tabelaCache, key, ok);
  return ok;
}

/** Verifica se uma coluna existe numa tabela. Cache positivo permanente,
 *  negativo 30s. */
export async function colunaExiste(
  schema: string,
  tabela: string,
  coluna: string,
  client: PgSql = sql as unknown as PgSql,
): Promise<boolean> {
  const key = `${schema}.${tabela}.${coluna}`;
  const cached = lookup(colunaCache, key);
  if (cached !== null) return cached;

  const [row] = await client<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = ${schema} AND table_name = ${tabela} AND column_name = ${coluna}
    ) AS exists
  `;
  const ok = !!row?.exists;
  save(colunaCache, key, ok);
  return ok;
}

/** Invalida todo o cache. Útil após aplicar migrations em runtime. */
export function invalidarSchemaCache() {
  tabelaCache.clear();
  colunaCache.clear();
}
