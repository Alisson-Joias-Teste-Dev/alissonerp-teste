/**
 * Aplica migration 159_fornecedor_e_site_wordpress.sql
 *   - Adiciona coluna fornecedor em alissonerp.erp_produtos
 *   - Cria tabelas alissonerp.fornecedores, site_config, site_produtos
 *   - Cria triggers de updated_at
 *
 * Uso:
 *   DATABASE_URL=postgres://... node scripts/apply_159.mjs
 */
import postgres from "postgres";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ou DATABASE_URL_DIRECT não definida");
  process.exit(1);
}
const sql = postgres(url, { ssl: false });

const migration = readFileSync(
  "supabase/migrations/159_fornecedor_e_site_wordpress.sql",
  "utf-8",
);

try {
  console.log("Aplicando migration 159...");
  await sql.unsafe(migration);
  console.log("✓ Migration 159 aplicada");

  // Validações pós-migration
  const [forn] = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema='alissonerp' AND table_name='erp_produtos' AND column_name='fornecedor'
  `;
  console.log(`✓ erp_produtos.fornecedor existe: ${!!forn}`);

  const [tbl1] = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_schema='alissonerp' AND table_name='fornecedores') AS e
  `;
  console.log(`✓ alissonerp.fornecedores existe: ${tbl1.e}`);

  const [tbl2] = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_schema='alissonerp' AND table_name='site_config') AS e
  `;
  console.log(`✓ alissonerp.site_config existe: ${tbl2.e}`);

  const [tbl3] = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables
      WHERE table_schema='alissonerp' AND table_name='site_produtos') AS e
  `;
  console.log(`✓ alissonerp.site_produtos existe: ${tbl3.e}`);

  const [cfg] = await sql`SELECT id, plataforma, ativo FROM alissonerp.site_config WHERE id = 1`;
  console.log("✓ site_config linha id=1:", cfg);
} catch (err) {
  console.error("❌ Erro:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
