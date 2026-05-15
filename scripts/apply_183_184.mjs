import postgres from 'postgres';
import { readFileSync } from 'fs';

const sql = postgres(process.env.DATABASE_URL ||
  'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres',
  { ssl: false });

try {
  // ── Migration 183: auditoria automática PDV ──────────────────────────────
  console.log('=== Aplicando migration 183 (auditoria automática PDV) ===');
  await sql.unsafe(readFileSync('supabase/migrations/183_auditoria_automatica.sql', 'utf8'));
  console.log('✓ Migration 183 aplicada.');

  // ── Migration 184: backfill auditorias pendentes ─────────────────────────
  console.log('\n=== Aplicando migration 184 (backfill auditorias pendentes) ===');
  await sql.unsafe(readFileSync('supabase/migrations/184_backfill_auditorias_pendentes.sql', 'utf8'));
  console.log('✓ Migration 184 aplicada.');

  // ── Verificação ──────────────────────────────────────────────────────────
  console.log('\n=== Verificação pós-migração ===');

  const pendentes = await sql`
    SELECT COUNT(*) AS total
    FROM alissonerp.auditorias
    WHERE tipo_auditoria = 'loja' AND situacao = 'pendente'
  `;
  console.log('Auditorias loja ainda pendentes:', pendentes[0].total);

  const aguardando = await sql`
    SELECT COUNT(*) AS total
    FROM alissonerp.ordens
    WHERE status = 'aguardando'
  `;
  console.log('Ordens ainda em aguardando:', aguardando[0].total);

  const emAndamento = await sql`
    SELECT COUNT(*) AS total
    FROM alissonerp.ordens
    WHERE status = 'em_andamento'
  `;
  console.log('Ordens em em_andamento:', emAndamento[0].total);

} finally {
  await sql.end();
}
