import postgres from '../../node_modules/postgres/src/index.js';
const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', {ssl:false, max:2, idle_timeout:20, connection:{search_path:'alissonerp,public'}});
const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='estoque' ORDER BY column_name`;
console.log(JSON.stringify(cols, null, 2));
process.exit(0);
