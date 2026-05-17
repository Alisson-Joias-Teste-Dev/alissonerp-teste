/**
 * Diagnostico read-only pre-migration 260.
 * Roda: npx tsx scripts/diag-orcamento-260.ts
 *
 * Nao modifica nada. Apenas SELECT.
 */
import postgres from "postgres";
import { readFileSync } from "fs";

// Carrega .env.local manualmente (evita dep externa)
try {
  const env = readFileSync(".env.local", "utf-8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\r$/, "").replace(/^["']|["']$/g, "");
  }
} catch { /* ignora se nao tiver */ }

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL ausente em .env.local"); process.exit(1); }

const sql = postgres(url, { max: 1, idle_timeout: 5 });

async function diag() {
  console.log("Conectado em:", url.replace(/\/\/[^@]*@/, "//<creds>@"));
  console.log("=".repeat(70));

  // 1) Coluna tipo_pedra existe em orcamento_fichas_tecnicas?
  const [tipoPedra] = await sql`
    SELECT 1 AS ok
    FROM information_schema.columns
    WHERE table_schema = 'alissonerp'
      AND table_name = 'orcamento_fichas_tecnicas'
      AND column_name = 'tipo_pedra'
    LIMIT 1
  `;
  console.log(`[1] tipo_pedra existe: ${tipoPedra ? "SIM (drift confirmado)" : "NAO"}`);

  // 2) FK em orcamentos.cliente_id existe?
  const fks = await sql`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'alissonerp.orcamentos'::regclass
      AND contype = 'f'
    ORDER BY conname
  `;
  const fkCliente = fks.some(f => f.def.includes("(cliente_id)"));
  const fkUsuario = fks.some(f => f.def.includes("(usuario_id)"));
  const fkVendedor = fks.some(f => f.def.includes("(vendedor_id)"));
  console.log(`[2] FK orcamentos.cliente_id: ${fkCliente ? "EXISTE" : "AUSENTE"}`);
  console.log(`[3] FK orcamentos.usuario_id: ${fkUsuario ? "EXISTE" : "AUSENTE"}`);
  console.log(`[4] FK orcamentos.vendedor_id: ${fkVendedor ? "EXISTE" : "AUSENTE"}`);
  console.log(`    Todas as FKs: ${fks.map(f => f.conname).join(", ")}`);

  // 5) UNIQUE em numero_orcamento existe?
  const uniq = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'alissonerp'
      AND tablename = 'orcamentos'
      AND indexdef ILIKE '%unique%numero_orcamento%'
  `;
  console.log(`[5] UNIQUE em numero_orcamento: ${uniq.length > 0 ? "EXISTE" : "AUSENTE"}`);

  // 6) Duplicatas em numero_orcamento?
  const dups = await sql`
    SELECT numero_orcamento, COUNT(*) AS n
    FROM alissonerp.orcamentos
    GROUP BY numero_orcamento
    HAVING COUNT(*) > 1
  `;
  console.log(`[6] Duplicatas em numero_orcamento: ${dups.length}`);
  if (dups.length > 0) console.log(`    Exemplos: ${dups.slice(0, 5).map(d => `${d.numero_orcamento}(${d.n})`).join(", ")}`);

  // 7) CHECKs existentes
  const checks = await sql`
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'alissonerp.orcamentos'::regclass
      AND contype = 'c'
  `;
  console.log(`[7] CHECKs em orcamentos: ${checks.length}`);
  checks.forEach(c => console.log(`    - ${c.conname}: ${c.def}`));

  // 8) Orcamentos com lock=true e snapshot=null (B4 — risco da regressao v2.42.0)
  const [orfaos] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE valor_negociado_locked = true AND snapshot IS NULL) AS lock_sem_snapshot,
      COUNT(*) FILTER (WHERE status = 'convertido' AND valor_negociado_locked = true AND snapshot IS NULL) AS convertido_lock_sem_snap,
      COUNT(*) FILTER (WHERE status = 'rejeitado' AND valor_negociado_locked = true AND snapshot IS NULL) AS rejeitado_lock_sem_snap,
      COUNT(*) AS total
    FROM alissonerp.orcamentos
  `;
  console.log(`[8] Orcamentos lock=true sem snapshot: ${orfaos.lock_sem_snapshot}/${orfaos.total}`);
  console.log(`    convertidos: ${orfaos.convertido_lock_sem_snap}, rejeitados: ${orfaos.rejeitado_lock_sem_snap}`);

  // 9) Orcamentos com quantidade NULL
  const [qtdNull] = await sql`
    SELECT COUNT(*) AS n FROM alissonerp.orcamentos WHERE quantidade IS NULL
  `;
  console.log(`[9] Orcamentos com quantidade=NULL: ${qtdNull.n}`);

  // 10) Sequence venda_numero_seq alinhada?
  const [seqVenda] = await sql`SELECT last_value FROM alissonerp.venda_numero_seq`;
  const [maxVenda] = await sql`
    SELECT GREATEST(
      COALESCE((SELECT MAX(numero_pedido) FROM public.vendas), 0),
      COALESCE((SELECT MAX(numero_venda::bigint) FROM alissonerp.vendas_erp WHERE numero_venda ~ '^[0-9]+$'), 0)
    ) AS max_existente
  `;
  console.log(`[10] venda_numero_seq.last_value=${seqVenda.last_value}, max real=${maxVenda.max_existente}`);

  // 11) Sequence orcamento_seq alinhada?
  const [seqOrc] = await sql`SELECT last_value FROM alissonerp.orcamento_seq`;
  const [maxOrc] = await sql`
    SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(numero_orcamento, '^ORC-0*', ''), '')::bigint), 0) AS max_orc
    FROM alissonerp.orcamentos
    WHERE numero_orcamento ~ '^ORC-[0-9]+$'
  `;
  console.log(`[11] orcamento_seq.last_value=${seqOrc.last_value}, max real=${maxOrc.max_orc}`);

  // 12) Status invalidos atualmente
  const statusUsados = await sql`
    SELECT status, COUNT(*) AS n FROM alissonerp.orcamentos GROUP BY status ORDER BY n DESC
  `;
  console.log(`[12] Status em uso:`);
  statusUsados.forEach(s => console.log(`    - "${s.status}": ${s.n}`));

  // 13) Quantidades em uso
  const qtds = await sql`
    SELECT quantidade, COUNT(*) AS n FROM alissonerp.orcamentos GROUP BY quantidade ORDER BY n DESC
  `;
  console.log(`[13] Quantidades em uso:`);
  qtds.forEach(q => console.log(`    - ${q.quantidade}: ${q.n}`));

  // 14) Total geral
  const [total] = await sql`SELECT COUNT(*) AS n FROM alissonerp.orcamentos`;
  console.log(`[14] Total de orcamentos: ${total.n}`);

  console.log("=".repeat(70));
  console.log("Diagnostico concluido.");
  await sql.end();
}

diag().catch(e => {
  console.error("ERRO:", e);
  process.exit(1);
});
