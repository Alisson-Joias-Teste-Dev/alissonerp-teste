/**
 * Helper server-side para obter as chaves de API do Editor IA.
 * Precedência: banco (configuracoes_sistema) > variável de ambiente.
 * NUNCA expor este módulo no client.
 */
import sql from "@/lib/db";

const DB_KEYS = {
  gemini: "editor_ia_gemini_key",
  openai: "editor_ia_openai_key",
} as const;

export interface ApiKeys {
  gemini: string;
  openai: string;
}

export async function getApiKeys(): Promise<ApiKeys> {
  const rows = await sql<Array<{ chave: string; valor: string | null }>>`
    SELECT chave, valor FROM alissonerp.configuracoes_sistema
     WHERE chave IN (${DB_KEYS.gemini}, ${DB_KEYS.openai})
  `.catch(() => [] as Array<{ chave: string; valor: string | null }>);

  const byKey = new Map(rows.map((r) => [r.chave, r.valor ?? ""]));

  return {
    gemini: (byKey.get(DB_KEYS.gemini) || process.env.GEMINI_API_KEY || "").trim(),
    openai: (byKey.get(DB_KEYS.openai) || process.env.OPENAI_API_KEY || "").trim(),
  };
}
