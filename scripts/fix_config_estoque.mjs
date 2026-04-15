import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

// Inserir config para produto 1501019
const r = await sql`
  INSERT INTO alissonerp.estoque_comercial_config (produto_id, ativo, estoque_minimo)
  VALUES (1501019, true, 0)
  ON CONFLICT (produto_id) DO UPDATE SET ativo = true
  RETURNING *
`;
console.log('Config criada:', r);

// Verificar saldo agora
const [saldo] = await sql`SELECT * FROM alissonerp.vw_saldo_estoque_comercial WHERE produto_id = 1501019`;
console.log('Saldo no estoque:', saldo);

await sql.end();
