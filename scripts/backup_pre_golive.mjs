// Agente A — Backup completo PRÉ-RESET go-live
// Dump de todas as tabelas transacionais em JSON
import postgres from 'postgres';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DB_URL = 'postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres';
const sql = postgres(DB_URL, { ssl: false });

const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const BACKUP_DIR = `C:/Users/jonat/fabricaAJ/backups/pre_golive_${TIMESTAMP}`;

console.log(`=== BACKUP PRÉ-RESET GO-LIVE ===`);
console.log(`Diretório: ${BACKUP_DIR}\n`);

mkdirSync(BACKUP_DIR, { recursive: true });

const tabelas = [
  // Transacionais
  { schema: 'alissonerp', table: 'ordens' },
  { schema: 'alissonerp', table: 'pcp' },
  { schema: 'alissonerp', table: 'saidas_ordem' },
  { schema: 'alissonerp', table: 'apontamentos_pcp' },
  { schema: 'alissonerp', table: 'distribuicoes' },
  { schema: 'alissonerp', table: 'distribuicao_ordens' },
  { schema: 'alissonerp', table: 'distribuicao_saida_pedras' },
  { schema: 'alissonerp', table: 'transferencias_ordem' },
  { schema: 'alissonerp', table: 'protocolos' },
  { schema: 'alissonerp', table: 'protocolo_ordens' },
  { schema: 'alissonerp', table: 'protocolo_fotos' },
  { schema: 'alissonerp', table: 'auditorias' },
  { schema: 'alissonerp', table: 'quebra_operador' },
  { schema: 'alissonerp', table: 'movimentacoes_estoque' },
  { schema: 'alissonerp', table: 'comentarios_ordem' },
  { schema: 'alissonerp', table: 'notificacoes' },
  { schema: 'alissonerp', table: 'markup_alteracoes' },
  // Sequências (estado atual)
];

let totalRegistros = 0;
const manifest = { timestamp: TIMESTAMP, tabelas: [] };

for (const { schema, table } of tabelas) {
  try {
    const rows = await sql`SELECT * FROM ${sql(`${schema}.${table}`)}`;
    const path = join(BACKUP_DIR, `${schema}.${table}.json`);
    writeFileSync(path, JSON.stringify(rows, null, 2));
    console.log(`  ✅ ${schema}.${table.padEnd(30)} → ${rows.length} registros`);
    totalRegistros += rows.length;
    manifest.tabelas.push({ schema, table, count: rows.length, file: `${schema}.${table}.json` });
  } catch (err) {
    console.log(`  ⚠️  ${schema}.${table} → ERRO: ${err.message}`);
    manifest.tabelas.push({ schema, table, count: 0, error: err.message });
  }
}

// Backup das sequences
const sequences = await sql`
  SELECT sequencename, last_value
  FROM pg_sequences
  WHERE schemaname = 'alissonerp'
  ORDER BY sequencename
`;
writeFileSync(join(BACKUP_DIR, 'sequences_state.json'), JSON.stringify(sequences, null, 2));
console.log(`\n  ✅ sequences_state.json → ${sequences.length} sequences`);

// Backup dos metadados de storage (paths dos arquivos)
const storageObjects = await sql`
  SELECT id, bucket_id, name, metadata, created_at
  FROM storage.objects
  WHERE bucket_id IN ('apontamento-fotos', 'protocolo-fotos', 'ordem-fotos')
  ORDER BY bucket_id, created_at
`;
writeFileSync(join(BACKUP_DIR, 'storage_objects_erp.json'), JSON.stringify(storageObjects, null, 2));
console.log(`  ✅ storage_objects_erp.json → ${storageObjects.length} arquivos ERP`);

// Salvar manifest
manifest.total_registros = totalRegistros;
manifest.storage_files = storageObjects.length;
writeFileSync(join(BACKUP_DIR, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));

console.log(`\n=== BACKUP CONCLUÍDO ===`);
console.log(`Total de registros salvos: ${totalRegistros}`);
console.log(`Arquivos storage mapeados: ${storageObjects.length}`);
console.log(`Diretório: ${BACKUP_DIR}`);

await sql.end();
