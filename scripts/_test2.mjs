import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();

const sql = postgres(dbUrl, { ssl: false, max: 1, connect_timeout: 10 });

try {
  console.log('Conectando...');
  const [r] = await sql`SELECT 1 AS ok`;
  console.log('OK:', r);
  
  // Check trigger function works
  console.log('\nTestando trigger com update real (rollback)...');
  
  const order = await sql`SELECT id, data_entrega FROM alissonerp.ordens WHERE id = 1944`;
  console.log('Ordem:', order[0]);
  
  if (order[0]) {
    const testDate = '2026-06-01';
    
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.role', 'desenvolvedor', true)`;
      console.log('Test date:', testDate);
      const [r] = await tx`
        UPDATE alissonerp.ordens
        SET data_entrega = ${testDate}::date
        WHERE id = 1944
        RETURNING id, data_entrega::text
      `;
      console.log('SUCCESS:', r);
      throw new Error('ROLLBACK');
    }).catch(e => {
      if (e.message === 'ROLLBACK') console.log('(rollback OK - trigger permitiu o update)');
      else console.error('FAILED:', e.message);
    });
  }
} catch (e) {
  console.error('ERROR:', e.message);
} finally {
  await sql.end();
}
