import postgres from 'postgres';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const dbUrl = env.split('\n').find(l => l.startsWith('DATABASE_URL='))?.split('=').slice(1).join('=').trim();

const sql = postgres(dbUrl, { ssl: false, max: 1 });

try {
  // Test 1: Does the DECLARE v_role; DECLARE v_app_role; syntax work in PL/pgSQL?
  console.log('=== Test 1: DECLARE syntax ===');
  try {
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION alissonerp._test_declare()
      RETURNS TEXT AS $$
      DECLARE a TEXT;
      DECLARE b TEXT;
      BEGIN
        a := 'hello';
        b := 'world';
        RETURN a || ' ' || b;
      END;
      $$ LANGUAGE plpgsql;
    `);
    const [r] = await sql`SELECT alissonerp._test_declare() AS result`;
    console.log('Function result:', r?.result);
    
    // Cleanup
    await sql`DROP FUNCTION IF EXISTS alissonerp._test_declare()`;
    console.log('DECLARE syntax: OK (multiple DECLARE works)');
  } catch (e) {
    console.log('DECLARE syntax: FAILED -', e.message);
    await sql`DROP FUNCTION IF EXISTS alissonerp._test_declare()`.catch(() => {});
  }

  // Test 2: Direct simulation of the PATCH route on order 1944
  console.log('\n=== Test 2: Simulate PATCH route ===');
  
  // Create a test body (simulating what the frontend would send)
  const body = {
    data_entrega: '2026-05-25',
  };

  console.log('Body:', JSON.stringify(body));
  
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT set_config('app.role', 'desenvolvedor', true)`;
      
      const [updated] = await tx`
        UPDATE alissonerp.ordens
        SET
          data_entrega         = COALESCE(${body.data_entrega         ?? null}::date,      data_entrega),
          detalhes_ordem       = COALESCE(${body.detalhes_ordem       ?? null},            detalhes_ordem),
          situacao             = COALESCE(${body.situacao             ?? null},            situacao),
          cliente_id           = COALESCE(${body.cliente_id           ?? null}::bigint,    cliente_id),
          vendedor_id          = COALESCE(${body.vendedor_id          ?? null}::bigint,    vendedor_id),
          tipo_ordem           = COALESCE(${body.tipo_ordem           ?? null},            tipo_ordem),
          peso_metal_negociado = COALESCE(${body.peso_metal_negociado ?? null}::numeric,   peso_metal_negociado)
        WHERE id = 1944
        RETURNING id, numero_ordem, data_entrega::text, detalhes_ordem, situacao,
                  cliente_id, vendedor_id, tipo_ordem, peso_metal_negociado
      `;
      
      console.log('PATCH simulation SUCCESS:', JSON.stringify(updated));
      throw new Error('ROLLBACK');
    }).catch(e => {
      if (e.message === 'ROLLBACK') console.log('(rolled back - test passed)');
      else console.error('PATCH simulation ERROR:', e.message, e.code, e.severity);
    });
  } catch (e) {
    console.error('Transaction error:', e.message);
  }
  
  console.log('\n=== All tests done ===');
} catch (e) {
  console.error('FATAL:', e.message);
} finally {
  await sql.end();
}
