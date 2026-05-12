/**
 * Cria o bucket 'conversao-fotos' no Supabase Storage via SQL direto.
 * Como a SERVICE_ROLE_KEY está com problema de assinatura JWT,
 * usamos postgres.js para inserir diretamente na tabela storage.buckets.
 *
 * Uso: node scripts/criar_bucket_conversao.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import postgres from "postgres";

const DIR = dirname(fileURLToPath(import.meta.url));
const LOG = join(DIR, "..", "_criar_bucket_conversao_log.txt");
const envRaw = readFileSync(join(DIR, "..", ".env.local"), "utf-8");
const env = {};
for (const line of envRaw.split("\n")) {
  const idx = line.indexOf("=");
  if (idx > 0) env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
}

const DB_URL = env.DATABASE_URL;
if (!DB_URL) { console.log("ERRO: Sem DATABASE_URL"); process.exit(1); }

const sql = postgres(DB_URL, { max: 2, idle_timeout: 10, connect_timeout: 10 });
const lines = [];
function log(msg) { console.log(msg); lines.push(msg); }

async function main() {
  // 1. Criar bucket se não existir
  const [existing] = await sql`
    SELECT id FROM storage.buckets WHERE id = 'conversao-fotos' LIMIT 1
  `;

  if (existing) {
    log("OK: Bucket 'conversao-fotos' já existe.");
  } else {
    await sql`
      INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
      VALUES (
        'conversao-fotos',
        'conversao-fotos',
        TRUE,
        FALSE,
        10485760,
        ARRAY['image/jpeg', 'image/png', 'image/webp']
      )
    `;
    log("OK: Bucket 'conversao-fotos' criado.");
  }

  // 2. Política de SELECT público
  const [policy] = await sql`
    SELECT 1 FROM storage.policies 
    WHERE name = 'conversao-fotos-public-select' LIMIT 1
  `;
  if (!policy) {
    await sql`
      CREATE POLICY "conversao-fotos-public-select"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'conversao-fotos')
    `;
    log("OK: Política SELECT público criada.");
  } else {
    log("OK: Política SELECT já existe.");
  }

  // 3. Política de INSERT para authenticated
  const [policyInsert] = await sql`
    SELECT 1 FROM storage.policies 
    WHERE name = 'conversao-fotos-auth-insert' LIMIT 1
  `;
  if (!policyInsert) {
    await sql`
      CREATE POLICY "conversao-fotos-auth-insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'conversao-fotos')
    `;
    log("OK: Política INSERT para authenticated criada.");
  } else {
    log("OK: Política INSERT já existe.");
  }

  // 4. Policy de UPDATE para authenticated (para substituir fotos)
  const [policyUpdate] = await sql`
    SELECT 1 FROM storage.policies 
    WHERE name = 'conversao-fotos-auth-update' LIMIT 1
  `;
  if (!policyUpdate) {
    await sql`
      CREATE POLICY "conversao-fotos-auth-update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (bucket_id = 'conversao-fotos')
    `;
    log("OK: Política UPDATE para authenticated criada.");
  }

  await sql.end();
  log("\nBucket 'conversao-fotos' configurado com sucesso!");
  writeFileSync(LOG, lines.join("\n") + "\n");
}

main().catch(e => {
  const errMsg = `ERRO: ${e.message || e}`;
  console.error(errMsg);
  writeFileSync(LOG, errMsg + "\n");
  process.exit(1);
});
