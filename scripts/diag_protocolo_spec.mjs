import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

console.log('=== Q1: Estrutura protocolos ===');
const q1 = await sql`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'alissonerp' AND table_name = 'protocolos'
  ORDER BY ordinal_position
`;
console.log(JSON.stringify(q1, null, 2));

console.log('\n=== Q2: Estrutura protocolo_ordens ===');
const q2 = await sql`
  SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
  WHERE table_schema = 'alissonerp' AND table_name = 'protocolo_ordens'
  ORDER BY ordinal_position
`;
console.log(JSON.stringify(q2, null, 2));

console.log('\n=== Q3: Campos foto/resp/user ===');
const q3 = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'alissonerp' AND table_name = 'protocolos'
  AND (column_name LIKE '%foto%' OR column_name LIKE '%resp%' OR column_name LIKE '%criado%'
    OR column_name LIKE '%conclu%' OR column_name LIKE '%user%' OR column_name LIKE '%by%')
`;
console.log(JSON.stringify(q3, null, 2));

console.log('\n=== Q4: fn_concluir_protocolo ===');
const q4 = await sql`
  SELECT pg_get_functiondef(oid) FROM pg_proc
  WHERE proname = 'fn_concluir_protocolo'
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp')
`;
console.log(q4[0]?.pg_get_functiondef ?? 'NÃO ENCONTRADA');

console.log('\n=== Q5: Storage buckets ===');
try {
  const q5 = await sql`SELECT id, name, public FROM storage.buckets`;
  console.log(JSON.stringify(q5, null, 2));
} catch(e) { console.log('Erro acesso storage:', e.message); }

await sql.end();
