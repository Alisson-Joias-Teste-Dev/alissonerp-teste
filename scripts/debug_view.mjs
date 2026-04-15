import postgres from 'postgres';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

// Ver definição da view
const [view] = await sql`SELECT pg_get_viewdef('alissonerp.vw_saldo_estoque_comercial', true) AS def`;
console.log('VIEW DEFINITION:\n', view.def);

// Ver o produto na tabela de produtos
const [prod] = await sql`SELECT id_produto, nome, ativo FROM public.produtos WHERE id_produto = 1501019`;
console.log('\nPRODUTO:', prod);

await sql.end();
