// Testa como postgres.js trata o padrão JSON.stringify(obj)::jsonb
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  const testArray = [{ a: 1 }, { a: 2 }];

  // Teste 1: padrao usado pelo projeto - JSON.stringify + ::jsonb
  console.log('── Teste 1: JSON.stringify(obj)::jsonb ──');
  const [t1] = await sql`
    SELECT ${JSON.stringify(testArray)}::jsonb AS val,
           jsonb_typeof(${JSON.stringify(testArray)}::jsonb) AS tp
  `;
  console.log('  tipo JSONB:', t1.tp);
  console.log('  valor JS:', typeof t1.val, JSON.stringify(t1.val));

  // Teste 2: sql.json helper
  console.log('\n── Teste 2: sql.json(obj) ──');
  const [t2] = await sql`
    SELECT ${sql.json(testArray)} AS val,
           jsonb_typeof(${sql.json(testArray)}) AS tp
  `;
  console.log('  tipo JSONB:', t2.tp);
  console.log('  valor JS:', typeof t2.val, JSON.stringify(t2.val));

  // Teste 3: objeto direto (sem helper)
  console.log('\n── Teste 3: ${objDireto} ──');
  try {
    const [t3] = await sql`SELECT ${testArray}::jsonb AS val`;
    console.log('  valor:', typeof t3.val, JSON.stringify(t3.val));
  } catch (e) {
    console.log('  ERRO:', e.message);
  }

  // Teste 4: inserir num campo jsonb real e ler
  console.log('\n── Teste 4: INSERT em tabela real (tabela teste) ──');
  await sql`CREATE TEMP TABLE tmp_test (id SERIAL, data JSONB)`;

  await sql`INSERT INTO tmp_test (data) VALUES (${JSON.stringify(testArray)}::jsonb)`;
  await sql`INSERT INTO tmp_test (data) VALUES (${sql.json(testArray)})`;

  const rows = await sql`SELECT id, data, jsonb_typeof(data) AS tp FROM tmp_test ORDER BY id`;
  rows.forEach(r => {
    console.log(`  [${r.id}] typeof=${r.tp}, js=${typeof r.data}, val=${JSON.stringify(r.data)}`);
  });
} finally {
  await sql.end();
}
