import postgres from "postgres";
import { readFileSync } from "fs";

// Usa DATABASE_URL_DIRECT se existir (conexão com credenciais de superuser),
// caso contrário tenta DATABASE_URL.
const url = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL ou DATABASE_URL_DIRECT não definida");
  process.exit(1);
}
const sql = postgres(url, { ssl: false });

const migration = readFileSync(
  "supabase/migrations/157_fix_trigger_preco_produto_ouro_amarelo.sql",
  "utf-8",
);

try {
  console.log("Aplicando migration 157...");
  await sql.unsafe(migration);
  console.log("✓ Migration 157 aplicada");

  const [fatorFix] = await sql`
    SELECT COUNT(*)::int AS qtd FROM public.produtos
    WHERE fator = 1 AND situacao = 'A' AND peso_precificado > 0
  `;
  console.log(`✓ Produtos com fator=1: ${fatorFix.qtd}`);

  // Testa um produto
  const [teste] = await sql`
    SELECT sku, nome, tipo_metal, fator, markup, peso_precificado, preco_sync
    FROM public.produtos
    WHERE sku = '1599-16' LIMIT 1
  `;
  console.log("Produto 1599-16 antes de update manual:", teste);

  // Força re-execução do trigger: UPDATE trivial
  await sql`
    UPDATE public.produtos
    SET markup = markup
    WHERE sku = '1599-16'
  `;

  const [depois] = await sql`
    SELECT sku, fator, markup, peso_precificado, preco_sync, custo_na_cotacao
    FROM public.produtos
    WHERE sku = '1599-16' LIMIT 1
  `;
  console.log("Produto 1599-16 depois do trigger:", depois);
} catch (err) {
  console.error("❌ Erro:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
