// Agente A — Pre-check enum servico (passos 3-10)
import postgres from 'postgres';

const DB_URL = 'postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false });

console.log('=== PRE-CHECK ENUM SERVICO ===\n');

try {
  // Passo 3 — Enum atual
  console.log('── PASSO 3: enum_tipo_ordem atual ──');
  const enumVals = await sql`
    SELECT enumlabel, enumsortorder
    FROM pg_enum
    JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
    WHERE pg_type.typname = 'enum_tipo_ordem'
    AND pg_type.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp')
    ORDER BY enumsortorder
  `;
  enumVals.forEach(e => console.log(`  [${e.enumsortorder}] ${e.enumlabel}`));

  // Passo 4 — Contagem por tipo
  console.log('\n── PASSO 4: Ordens por tipo ──');
  const countByTipo = await sql`
    SELECT tipo_ordem::text, COUNT(*)::int AS total
    FROM alissonerp.ordens
    GROUP BY tipo_ordem
    ORDER BY 2 DESC
  `;
  countByTipo.forEach(r => console.log(`  ${String(r.tipo_ordem).padEnd(25)} = ${r.total}`));

  // Passo 5 — Versão PostgreSQL
  console.log('\n── PASSO 5: PostgreSQL version ──');
  const [ver] = await sql`SELECT version()`;
  console.log(' ', ver.version.slice(0, 60));

  // Passo 6 — Código da função ponte
  console.log('\n── PASSO 6: fn_ponte_directus_para_alissonerp ──');
  const [fn] = await sql`SELECT prosrc FROM pg_proc WHERE proname = 'fn_ponte_directus_para_alissonerp'`;
  console.log(fn ? fn.prosrc : '  ⚠️  FUNÇÃO NÃO ENCONTRADA');

  // Passo 7 — Views que referenciam 'servico'
  console.log('\n── PASSO 7: Views com referência a servico ──');
  const views = await sql`
    SELECT viewname, definition
    FROM pg_views
    WHERE schemaname = 'alissonerp' AND definition ILIKE '%servico%'
  `;
  views.forEach(v => {
    // Extrair apenas as linhas com 'servico'
    const linhas = v.definition.split('\n').filter(l => l.toLowerCase().includes('servico'));
    console.log(`\n  VIEW: ${v.viewname}`);
    linhas.forEach(l => console.log(`    ${l.trim()}`));
  });

  // Passo 8 — Functions que referenciam 'servico' (exceto a ponte)
  console.log('\n── PASSO 8: Functions com referência a servico ──');
  const fns = await sql`
    SELECT proname, prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'alissonerp' AND prosrc ILIKE '%servico%'
  `;
  fns.forEach(f => {
    const linhas = f.prosrc.split('\n').filter(l => l.toLowerCase().includes('servico'));
    console.log(`\n  FUNCTION: ${f.proname}`);
    linhas.forEach(l => console.log(`    ${l.trim()}`));
  });

  // Passo 9 — Colunas de alissonerp.ordens
  console.log('\n── PASSO 9: Colunas de alissonerp.ordens ──');
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'ordens'
    ORDER BY ordinal_position
  `;
  cols.forEach(c => console.log(`  ${c.column_name.padEnd(35)} ${c.data_type}`));

  // Passo 10 — Buckets
  console.log('\n── PASSO 10: Storage buckets ──');
  const buckets = await sql`SELECT id, name, public FROM storage.buckets ORDER BY name`;
  buckets.forEach(b => console.log(`  [${b.id}] public=${b.public}`));

} catch (err) {
  console.error('ERRO:', err.message);
} finally {
  await sql.end();
}
