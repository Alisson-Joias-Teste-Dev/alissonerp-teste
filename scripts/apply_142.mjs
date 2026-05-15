import postgres from 'postgres';
import fs from 'fs';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 142: Devolucoes + Vale-Troca + Reembolso ===\n');

const migrationPath = new URL('../supabase/migrations/142_devolucoes_vale_troca.sql', import.meta.url);
const sqlText = fs.readFileSync(migrationPath, 'utf-8');

try {
  await sql.unsafe(sqlText);
  console.log('Migration executada.\n');

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='alissonerp'
      AND table_name IN ('devolucoes_venda','devolucoes_itens','vale_troca','reembolsos')
    ORDER BY table_name
  `;
  console.log('Tabelas criadas:', tables.map(t => t.table_name).join(', '));

  const seqs = await sql`
    SELECT sequence_name FROM information_schema.sequences
    WHERE sequence_schema='alissonerp'
      AND sequence_name IN ('devolucoes_seq','vale_troca_seq')
    ORDER BY sequence_name
  `;
  console.log('Sequences:', seqs.map(s => s.sequence_name).join(', '));

  const perms = await sql`
    SELECT role, modulo FROM alissonerp.role_permissoes
    WHERE modulo IN ('devolucoes','vale_troca')
    ORDER BY modulo, role
  `;
  console.log('Permissoes:');
  perms.forEach(p => console.log(`  ${p.role} -> ${p.modulo}`));

  const cfg = await sql`
    SELECT chave, valor FROM alissonerp.configuracoes_sistema
    WHERE chave = 'devolucao_retencao_nao_entregue'
  `;
  console.log('Config seed:', cfg[0] ?? 'NAO ENCONTRADO');

  console.log('\n=== MIGRATION 142 CONCLUIDA ===');
} catch (err) {
  console.error('ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
