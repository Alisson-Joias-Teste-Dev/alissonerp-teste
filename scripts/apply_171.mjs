// Aplica migration 171 — cria alissonerp.produto_pedra_extras.
import postgres from 'postgres';
import { readFileSync } from 'fs';

const sql = postgres(process.env.DATABASE_URL ||
  'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres',
  { ssl: false });

try {
  console.log('=== Aplicando migration 171 ===');
  await sql.unsafe(readFileSync('supabase/migrations/171_produto_pedra_preco_quantidade.sql', 'utf8'));
  console.log('Migration aplicada.');

  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'produto_pedra_extras'
    ORDER BY ordinal_position
  `;
  console.table(cols);
} finally {
  await sql.end();
}
