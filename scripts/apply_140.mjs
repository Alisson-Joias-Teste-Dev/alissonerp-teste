import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== APPLY 140: Desacoplar friso + precificador pedras + gravação + risco ===\n');

try {
  // orcamento_fichas_tecnicas
  await sql`ALTER TABLE alissonerp.orcamento_fichas_tecnicas ADD COLUMN IF NOT EXISTS has_friso BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE alissonerp.orcamento_fichas_tecnicas ADD COLUMN IF NOT EXISTS friso_tipo VARCHAR(20)`;
  await sql`ALTER TABLE alissonerp.orcamento_fichas_tecnicas ADD COLUMN IF NOT EXISTS friso_kind VARCHAR(10) DEFAULT 'friso'`;
  console.log('✅ orcamento_fichas_tecnicas: has_friso, friso_tipo, friso_kind');

  // config_orcamento
  await sql`ALTER TABLE alissonerp.config_orcamento ADD COLUMN IF NOT EXISTS risco_width NUMERIC(5,2) DEFAULT 0.10`;
  await sql`ALTER TABLE alissonerp.config_orcamento ADD COLUMN IF NOT EXISTS risco_depth NUMERIC(5,2) DEFAULT 0.20`;
  await sql`ALTER TABLE alissonerp.config_orcamento ADD COLUMN IF NOT EXISTS preco_gravacao NUMERIC(10,2) DEFAULT 100.00`;
  await sql`ALTER TABLE alissonerp.config_orcamento ADD COLUMN IF NOT EXISTS stone_markups_table JSONB DEFAULT '{}'::jsonb`;
  console.log('✅ config_orcamento: risco_width, risco_depth, preco_gravacao, stone_markups_table');

  // COMMENTs
  await sql`COMMENT ON COLUMN alissonerp.orcamento_fichas_tecnicas.friso_kind IS 'Variante: friso (sulco largo) ou risco (sulco fino ~0.1mm)'`;
  await sql`COMMENT ON COLUMN alissonerp.orcamento_fichas_tecnicas.has_friso IS 'Se true, aliança tem friso (groove) aplicado sobre o perfil base'`;
  await sql`COMMENT ON COLUMN alissonerp.orcamento_fichas_tecnicas.friso_tipo IS 'Tipo de friso: lateral (um lado), centro (centralizado), duplo (ambos os lados)'`;
  await sql`COMMENT ON COLUMN alissonerp.config_orcamento.stone_markups_table IS 'Markups por pedra por tamanho. Ex: {"diamante":{"0":3.9,"1":3.7,...}}'`;
  console.log('✅ COMMENTs aplicados');

  // Verificação
  const colsFichas = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'orcamento_fichas_tecnicas'
      AND column_name IN ('has_friso','friso_tipo','friso_kind')
    ORDER BY column_name
  `;
  const colsConfig = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'config_orcamento'
      AND column_name IN ('risco_width','risco_depth','preco_gravacao','stone_markups_table')
    ORDER BY column_name
  `;
  console.log(`✅ orcamento_fichas_tecnicas: ${colsFichas.map(c => c.column_name).join(', ')}`);
  console.log(`✅ config_orcamento: ${colsConfig.map(c => c.column_name).join(', ')}`);

  if (colsFichas.length !== 3 || colsConfig.length !== 4) {
    throw new Error('Nem todas as colunas foram criadas');
  }

  console.log('\n=== MIGRATION 140 CONCLUÍDA ✅ ===');
} catch (err) {
  console.error('❌ ERRO:', err.message);
  process.exit(1);
} finally {
  await sql.end();
}
