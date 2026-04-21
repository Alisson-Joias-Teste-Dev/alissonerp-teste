import postgres from "postgres";

// Conexão direta — usada apenas em Server Components e Server Actions
const sql = postgres(process.env.DATABASE_URL!, {
  ssl: false,
  max: 5,
  idle_timeout: 20,
  // search_path garante que triggers SECURITY DEFINER (migrations 141, 161)
  // resolvam tabelas como 'vendas_erp' → 'alissonerp.vendas_erp'
  connection: {
    search_path: "alissonerp,public",
  },
});

export default sql;

/**
 * Converte campos NUMERIC (que postgres.js retorna como string) para number,
 * e campos JSONB/json_agg (que podem vir como string) para array/objeto.
 * Usar em TODA API route e Server Component que retorna dados com NUMERIC ou JSONB.
 */
export function normalizeRow<T extends Record<string, unknown>>(
  row: T,
  numericFields: string[],
  jsonFields: string[] = [],
): T {
  const result = { ...row } as Record<string, unknown>;
  for (const field of numericFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      const val = result[field];
      result[field] = typeof val === "string" ? parseFloat(val) : val;
    }
  }
  for (const field of jsonFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      const val = result[field];
      if (typeof val === "string") {
        try { result[field] = JSON.parse(val); } catch { result[field] = []; }
      }
      if (!Array.isArray(result[field])) {
        result[field] = [];
      }
    }
  }
  return result as T;
}
