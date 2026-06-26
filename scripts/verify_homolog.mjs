import postgres from 'postgres';

const DB = process.env.DATABASE_URL || process.argv[2];
if (!DB) { console.error('Need DATABASE_URL'); process.exit(1); }

const sql = postgres(DB, { max: 1, connect_timeout: 10 });
try {
  const [r] = await sql`SELECT * FROM alissonerp.vw_cofre_ouro_disponivel`;
  console.log('vw_cofre_ouro_disponivel:', JSON.stringify(r, null, 2));

  const [baixas] = await sql`SELECT count(*)::int AS c FROM alissonerp.cofre_ouro_baixas`;
  console.log('cofre_ouro_baixas:', baixas.c);

  const [rast] = await sql`SELECT count(*)::int AS c FROM alissonerp.cofre_ouro_rastreios`;
  console.log('cofre_ouro_rastreios:', rast.c);

  console.log('\n✅ Migration 202 aplicada com sucesso em homologação!');
} catch (err) {
  console.error('ERRO:', err instanceof Error ? err.message : String(err));
} finally {
  await sql.end();
}
