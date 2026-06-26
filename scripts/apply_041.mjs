import postgres from 'postgres';
import { readFileSync } from 'fs';

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });

console.log('Applying migration 041...');
await sql.unsafe(readFileSync('supabase/migrations/041_protocolo_foto_rastreio_views.sql', 'utf8'));
console.log('OK');

// Verificar colunas novas
const cols = await sql`
  SELECT column_name, is_nullable FROM information_schema.columns
  WHERE table_schema = 'alissonerp' AND table_name = 'protocolos'
  AND column_name IN ('foto_criacao','foto_conclusao','motoboy_id','recebedor_id','created_by')
`;
console.log('Colunas protocolos:', JSON.stringify(cols, null, 2));

// Verificar arquivo_id nullable
const arq = await sql`
  SELECT column_name, is_nullable FROM information_schema.columns
  WHERE table_schema='alissonerp' AND table_name='protocolo_fotos' AND column_name='arquivo_id'
`;
console.log('arquivo_id nullable?', arq[0]);

// C-1046 deve estar excluída da vw_ordens_prontas_ida (está em protocolo #149 ativo)
const check = await sql`SELECT id, numero_ordem FROM alissonerp.vw_ordens_prontas_ida WHERE numero_ordem='C-1046'`;
console.log('C-1046 em vw_ordens_prontas_ida (deve ser vazio):', check);

await sql.end();
