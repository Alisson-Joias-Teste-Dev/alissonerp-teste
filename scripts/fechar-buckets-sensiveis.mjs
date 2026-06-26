// Fecha buckets sensíveis: torna `public=false`. Callers já migrados pra proxy.
// Rollback: UPDATE storage.buckets SET public = true WHERE id IN (...);

import { readFileSync } from "node:fs";
import postgres from "postgres";

const envText = readFileSync(".env.local", "utf-8");
const DATABASE_URL = envText.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
const sql = postgres(DATABASE_URL, { max: 1 });

const BUCKETS = ["ordem-fotos", "apontamento-fotos", "protocolo-fotos", "purificacao-fotos", "service-fotos"];

console.log("Buckets ANTES:");
const antes = await sql`SELECT id, public FROM storage.buckets WHERE id = ANY(${BUCKETS}) ORDER BY id`;
console.table(antes);

await sql`UPDATE storage.buckets SET public = false WHERE id = ANY(${BUCKETS})`;

console.log("\nBuckets DEPOIS:");
const depois = await sql`SELECT id, public FROM storage.buckets WHERE id = ANY(${BUCKETS}) ORDER BY id`;
console.table(depois);

await sql.end();
console.log("\nOK — buckets fechados. Acesso só via /api/storage/[bucket]/[...path]");
