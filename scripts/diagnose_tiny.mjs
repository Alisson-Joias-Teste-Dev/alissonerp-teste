// Diagnóstico: estrutura da tabela configuracoes_secrets e estado dos tokens Tiny
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

try {
  // 1. Estrutura da tabela
  console.log('=== 1. COLUNAS de configuracoes_secrets ===');
  const cols = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp' AND table_name = 'configuracoes_secrets'
    ORDER BY ordinal_position
  `;
  cols.forEach(c => console.log(`  ${c.column_name}: ${c.data_type} ${c.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)'}`));

  // 2. Linhas com tiny_*
  console.log('\n=== 2. LINHAS tiny_* ===');
  const rows = await sql`
    SELECT chave,
           LENGTH(valor_encrypted::text) AS tamanho,
           SUBSTRING(valor_encrypted::text, 1, 80) AS preview
    FROM alissonerp.configuracoes_secrets
    WHERE chave LIKE 'tiny_%'
    ORDER BY chave
  `;
  rows.forEach(r => console.log(`  ${r.chave}: tamanho=${r.tamanho}, preview="${r.preview}"`));

  // 3. Verificar se existe coluna "valor" também
  console.log('\n=== 3. COLUNA "valor" existe? ===');
  const hasValor = cols.some(c => c.column_name === 'valor');
  console.log(`  Coluna "valor" existe: ${hasValor ? 'SIM' : 'NÃO'}`);
  console.log(`  Coluna "valor_encrypted" existe: ${cols.some(c => c.column_name === 'valor_encrypted') ? 'SIM' : 'NÃO'}`);

  // 4. Se existe a coluna valor, mostrar valores dela pra tiny_*
  if (hasValor) {
    console.log('\n=== 4. CONTEÚDO de "valor" (não "valor_encrypted") ===');
    const valRows = await sql`
      SELECT chave,
             LENGTH(valor::text) AS tamanho,
             SUBSTRING(valor::text, 1, 80) AS preview
      FROM alissonerp.configuracoes_secrets
      WHERE chave LIKE 'tiny_%'
      ORDER BY chave
    `;
    valRows.forEach(r => console.log(`  ${r.chave}: tamanho=${r.tamanho}, preview="${r.preview}"`));
  }

  // 5. Data de expiração atual
  console.log('\n=== 5. EXPIRAÇÃO do access_token ===');
  const [expRow] = await sql`
    SELECT valor_encrypted FROM alissonerp.configuracoes_secrets
    WHERE chave = 'tiny_token_expires_at'
  `;
  if (expRow) {
    const rawVal = expRow.valor_encrypted;
    console.log(`  raw: "${rawVal}"`);
    try {
      const iso = JSON.parse(rawVal);
      const d = new Date(iso);
      const agora = new Date();
      const diffMin = Math.floor((d.getTime() - agora.getTime()) / 60000);
      console.log(`  data parseada: ${iso}`);
      console.log(`  expira em: ${diffMin} minuto(s) (${diffMin < 0 ? 'JÁ EXPIROU há ' + Math.abs(diffMin) + ' min' : 'OK'})`);
    } catch (e) {
      console.log('  ERRO parseando:', e.message);
    }
  } else {
    console.log('  NÃO ENCONTRADO');
  }

} finally {
  await sql.end();
}
