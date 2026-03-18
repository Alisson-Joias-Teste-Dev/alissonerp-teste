import postgres from 'postgres';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', {
  ssl: false,
  connect_timeout: 30,
});

async function run() {
  try {
    // 1. Columns of alissonerp.ordens
    console.log('\n=== 1. alissonerp.ordens COLUMNS ===');
    const ordensColumns = await sql`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'alissonerp' AND table_name = 'ordens'
      ORDER BY ordinal_position
    `;
    console.table(ordensColumns);

    // 2. Enum values for enum_tipo_ordem
    console.log('\n=== 2. enum_tipo_ordem VALUES ===');
    const enumTipoOrdem = await sql`
      SELECT enumlabel
      FROM pg_enum
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
      WHERE pg_type.typname = 'enum_tipo_ordem'
        AND pg_type.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp')
      ORDER BY enumsortorder
    `;
    console.table(enumTipoOrdem);

    // 3. Last 5 numero_ordem in alissonerp.ordens starting with C-
    console.log('\n=== 3. alissonerp.ordens LAST 5 C- ===');
    const alissonnerpCOrdens = await sql`
      SELECT numero_ordem FROM alissonerp.ordens
      WHERE numero_ordem LIKE 'C-%'
      ORDER BY numero_ordem DESC
      LIMIT 5
    `;
    console.table(alissonnerpCOrdens);

    // 4. Last 5 numero_ordem in directus.ordens starting with C-
    console.log('\n=== 4. directus.ordens LAST 5 C- ===');
    const directusCOrdens = await sql`
      SELECT numero_ordem FROM directus.ordens
      WHERE numero_ordem LIKE 'C-%'
      ORDER BY numero_ordem DESC
      LIMIT 5
    `;
    console.table(directusCOrdens);

    // 5. fn_ponte code
    console.log('\n=== 5. fn_ponte_directus_para_alissonerp SOURCE ===');
    const fnPonte = await sql`
      SELECT prosrc FROM pg_proc
      WHERE proname = 'fn_ponte_directus_para_alissonerp'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'alissonerp')
    `;
    if (fnPonte.length > 0) {
      console.log(fnPonte[0].prosrc.substring(0, 3000) + (fnPonte[0].prosrc.length > 3000 ? '\n...[TRUNCATED]...' : ''));
    } else {
      console.log('NOT FOUND');
    }

    // 6. alissonerp.auditorias columns
    console.log('\n=== 6. alissonerp.auditorias COLUMNS ===');
    const auditoriasColumns = await sql`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'alissonerp' AND table_name = 'auditorias'
      ORDER BY ordinal_position
    `;
    console.table(auditoriasColumns);

    // 7. public.produtos columns (specific ones)
    console.log('\n=== 7. public.produtos COLUMNS (selected) ===');
    const produtosColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'produtos'
        AND column_name IN ('id_produto', 'nome', 'sku', 'peso_precificado', 'tipo_metal', 'situacao')
      ORDER BY ordinal_position
    `;
    console.table(produtosColumns);

    // 8. public.contatos columns
    console.log('\n=== 8. public.contatos COLUMNS ===');
    const contatosColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'contatos'
        AND column_name IN ('id_contato', 'nome', 'telefone', 'email')
      ORDER BY ordinal_position
    `;
    console.table(contatosColumns);

    // 9. public.vendedores columns
    console.log('\n=== 9. public.vendedores COLUMNS ===');
    const vendedoresColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vendedores'
      ORDER BY ordinal_position
    `;
    console.table(vendedoresColumns);

    // 10. alissonerp.usuarios columns
    console.log('\n=== 10. alissonerp.usuarios COLUMNS ===');
    const usuariosColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'alissonerp' AND table_name = 'usuarios'
      ORDER BY ordinal_position
    `;
    console.table(usuariosColumns);

    // 11. Check if origem column exists in alissonerp.ordens
    console.log('\n=== 11. CHECK origem COLUMN IN alissonerp.ordens ===');
    const origemCheck = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'alissonerp' AND table_name = 'ordens' AND column_name = 'origem'
    `;
    console.log(origemCheck.length > 0 ? 'EXISTS: ' + origemCheck[0].column_name : 'NOT FOUND — column "origem" does not exist');

    // 12. Check if itens_ordem table exists
    console.log('\n=== 12. CHECK itens_ordem TABLE IN alissonerp ===');
    const itensOrdemCheck = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'alissonerp' AND table_name = 'itens_ordem'
    `;
    console.log(itensOrdemCheck.length > 0 ? 'EXISTS: ' + itensOrdemCheck[0].table_name : 'NOT FOUND — table "itens_ordem" does not exist');

    // 13. Storage buckets
    console.log('\n=== 13. storage.buckets ===');
    const buckets = await sql`
      SELECT id, name FROM storage.buckets ORDER BY name
    `;
    console.table(buckets);

    // 14. MAX numero_ordem across both schemas
    console.log('\n=== 14. MAX numero_ordem ===');
    const maxAlissonerp = await sql`
      SELECT MAX(numero_ordem) FROM alissonerp.ordens WHERE numero_ordem ~ '^C-[0-9]+$'
    `;
    console.log('alissonerp.ordens MAX:', maxAlissonerp[0].max);

    const maxDirectus = await sql`
      SELECT MAX(numero_ordem) FROM directus.ordens WHERE numero_ordem ~ '^C-[0-9]+$'
    `;
    console.log('directus.ordens MAX:', maxDirectus[0].max);

    // 15. Check public.vendedores for ativo column
    console.log('\n=== 15. CHECK ativo COLUMN IN public.vendedores ===');
    const ativoCheck = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'vendedores' AND column_name = 'ativo'
    `;
    console.log(ativoCheck.length > 0 ? 'EXISTS: ' + ativoCheck[0].column_name : 'NOT FOUND — column "ativo" does not exist');

    console.log('\n=== ALL CHECKS COMPLETE ===');
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await sql.end();
  }
}

run();
