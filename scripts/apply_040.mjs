import postgres from 'postgres';
import { readFileSync } from 'fs';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

const migration = readFileSync('supabase/migrations/040_servico_rota_protocolo.sql', 'utf8');

console.log('Applying migration 040...');
await sql.unsafe(migration);
console.log('Migration 040 OK');

// Verificar C-1046 depois
const c1046 = await sql`
  SELECT id, numero_ordem, tipo_ordem, rota, status FROM alissonerp.ordens WHERE numero_ordem = 'C-1046'
`;
console.log('C-1046 após migr 040:', JSON.stringify(c1046[0], null, 2));

// Verificar quantas ordens agora aparecem na view prontas_ida
const prontas = await sql`SELECT count(*) FROM alissonerp.vw_ordens_prontas_ida`;
console.log('vw_ordens_prontas_ida count:', prontas[0].count);

// Ver se C-1046 aparece
const check = await sql`SELECT id, numero_ordem, status FROM alissonerp.vw_ordens_prontas_ida WHERE numero_ordem = 'C-1046'`;
console.log('C-1046 em vw_ordens_prontas_ida:', JSON.stringify(check, null, 2));

await sql.end();
