// Lista política dos buckets relevantes (público vs privado).
// Uso: node scripts/check-bucket-policy.mjs

import { readFileSync } from "node:fs";
import postgres from "postgres";

const envText = readFileSync(".env.local", "utf-8");
const DATABASE_URL = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!DATABASE_URL) throw new Error("DATABASE_URL nao encontrado em .env.local");

const sql = postgres(DATABASE_URL, { max: 1 });

const buckets = ["ordem-fotos","apontamento-fotos","protocolo-fotos","purificacao-fotos","imagens","avatars","insumo-fotos","produto-fotos","produto-imagens","servicos","servicos-internos"];
const rows = await sql`
  SELECT id, public, file_size_limit, allowed_mime_types, created_at
  FROM storage.buckets
  ORDER BY id
`;

console.log("\n=== TODOS os buckets do projeto ===\n");
console.table(rows.map(r => ({ id: r.id, public: r.public, file_size_limit: r.file_size_limit, mime_types: Array.isArray(r.allowed_mime_types) ? r.allowed_mime_types.length + " tipos" : "qualquer" })));

console.log("\n=== Esperado (CLAUDE.md): privados (signed URL) ===\n");
const PRIVADOS_ESPERADOS = ["ordem-fotos","apontamento-fotos","protocolo-fotos"];
for (const id of PRIVADOS_ESPERADOS) {
  const found = rows.find(r => r.id === id);
  if (!found) {
    console.log(`  ${id}: NAO EXISTE no projeto`);
    continue;
  }
  console.log(`  ${id}: public=${found.public}  ${found.public ? "❌ DEVERIA SER PRIVADO" : "✅ OK"}`);
}

await sql.end();
