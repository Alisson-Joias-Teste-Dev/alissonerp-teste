const postgres = require('C:\\Users\\jonat\\fabricaAJ\\node_modules\\postgres');
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres');

async function run() {
  const result = await sql`
    UPDATE alissonerp.configuracoes_sistema
    SET valor = 'gemini-2.0-flash-001', updated_at = NOW()
    WHERE chave = 'ia_modelo_gemini'
    RETURNING chave, valor
  `;
  console.log('Updated:', result);

  const check = await sql`
    SELECT chave, valor FROM alissonerp.configuracoes_sistema
    WHERE chave LIKE 'ia_%'
    ORDER BY chave
  `;
  console.log('Current IA config:', check);

  await sql.end();
}

run().catch(console.error);
