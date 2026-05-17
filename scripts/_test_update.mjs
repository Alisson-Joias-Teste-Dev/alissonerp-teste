import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();
if (!dbUrl) { console.error('DATABASE_URL não encontrado'); process.exit(1); }

const sql = postgres(dbUrl, { ssl: false, max: 1 });

const ordemId = 1944;

try {
  // Test the exact same update that the PATCH route would do
  console.log(`=== Testando UPDATE na ordem ${ordemId} via fn_proteger_campos_pdv ===\n`);
  
  await sql.begin(async (tx) => {
    await tx`SELECT set_config('app.role', 'desenvolvedor', true)`;
    
    // First check what the current data_entrega is
    const [current] = await tx`
      SELECT id, numero_ordem, data_entrega::text, situacao, tipo_ordem, peso_metal_negociado
      FROM alissonerp.ordens
      WHERE id = ${ordemId}
    `;
    console.log('Dados atuais:', JSON.stringify(current, null, 2));
    
    // Try updating with a new date
    const newDate = '2026-05-20';
    console.log(`\nTentando alterar data_entrega para: ${newDate}`);
    
    try {
      const [updated] = await tx`
        UPDATE alissonerp.ordens
        SET
          data_entrega         = COALESCE(${newDate}::date, data_entrega),
          detalhes_ordem       = COALESCE(${null}, detalhes_ordem),
          situacao             = COALESCE(${null}, situacao),
          cliente_id           = COALESCE(${null}::bigint, cliente_id),
          vendedor_id          = COALESCE(${null}::bigint, vendedor_id),
          tipo_ordem           = COALESCE(${null}, tipo_ordem),
          peso_metal_negociado = COALESCE(${null}::numeric, peso_metal_negociado)
        WHERE id = ${ordemId}
        RETURNING id, numero_ordem, data_entrega::text, situacao, tipo_ordem, peso_metal_negociado
      `;
      console.log('\nUPDATE bem-sucedido!');
      console.log('Resultado:', JSON.stringify(updated, null, 2));
      console.log('\n(O update foi revertido — rollback)');
      throw new Error('ROLLBACK_TEST'); // Rollback the test
    } catch (e) {
      if (e.message === 'ROLLBACK_TEST') throw e;
      console.error('\nERRO no UPDATE:', e.message);
      console.error('Detalhes:', e.code, e.severity, e.routine);
      throw new Error('ROLLBACK_TEST');
    }
  }).catch(e => {
    if (e.message !== 'ROLLBACK_TEST') {
      console.error('Transaction error:', e.message);
    }
  });
  
  console.log('\n=== Teste concluído ===');
} catch (e) {
  if (e.message !== 'ROLLBACK_TEST') {
    console.error('ERROR:', e.message);
  }
} finally {
  await sql.end();
}
