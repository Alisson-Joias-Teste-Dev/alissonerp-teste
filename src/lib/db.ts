import postgres from "postgres";

// Conexão direta — usada apenas em Server Components e Server Actions
const sql = postgres(process.env.DATABASE_URL!, {
  ssl: false,
  max: 5,
  idle_timeout: 20,
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
  const result = { ...row };
  for (const field of numericFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      const val = result[field];
      result[field] = (typeof val === "string" ? parseFloat(val) : val) as T[keyof T];
    }
  }
  for (const field of jsonFields) {
    if (field in result && result[field] !== null && result[field] !== undefined) {
      const val = result[field];
      if (typeof val === "string") {
        try { result[field] = JSON.parse(val) as T[keyof T]; } catch { result[field] = [] as T[keyof T]; }
      }
      if (!Array.isArray(result[field])) {
        result[field] = [] as T[keyof T];
      }
    }
  }
  return result;
}
