// Aplica migration 173 e backfill peso_ct para todas as pedras existentes.
import postgres from 'postgres';
import { readFileSync } from 'fs';

const STONE_CT_TABLE = [
  { mm: 1.0, ct: 0.005 }, { mm: 1.1, ct: 0.006 }, { mm: 1.2, ct: 0.007 },
  { mm: 1.3, ct: 0.009 }, { mm: 1.4, ct: 0.012 }, { mm: 1.5, ct: 0.015 },
  { mm: 1.6, ct: 0.017 }, { mm: 1.7, ct: 0.019 }, { mm: 1.8, ct: 0.022 },
  { mm: 1.9, ct: 0.026 }, { mm: 2.0, ct: 0.030 }, { mm: 2.1, ct: 0.035 },
  { mm: 2.2, ct: 0.040 }, { mm: 2.3, ct: 0.046 }, { mm: 2.4, ct: 0.053 },
  { mm: 2.5, ct: 0.060 },
];
function mmToCt(mm) {
  const t = STONE_CT_TABLE;
  if (mm <= t[0].mm) return t[0].ct;
  const last = t[t.length - 1];
  if (mm >= last.mm) return Math.round(last.ct * Math.pow(mm / last.mm, 3) * 1000) / 1000;
  for (let i = 0; i < t.length - 1; i++) {
    if (mm >= t[i].mm && mm <= t[i+1].mm) {
      const ratio = (mm - t[i].mm) / (t[i+1].mm - t[i].mm);
      return t[i].ct + ratio * (t[i+1].ct - t[i].ct);
    }
  }
  return t[0].ct;
}

const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false });
try {
  console.log('=== Aplicando migration 173 ===');
  await sql.unsafe(readFileSync('supabase/migrations/173_pedra_peso_ct.sql', 'utf8'));
  console.log('Migration aplicada.\n');

  console.log('=== Backfill peso_ct ===');
  const pedras = await sql`
    SELECT id_produto, sku, nome
    FROM public.produtos
    WHERE categoria ILIKE 'Pedras%' AND situacao = 'A'
  `;
  console.log(`Encontradas ${pedras.length} pedras.`);
  let upsertados = 0, ignorados = 0;
  for (const p of pedras) {
    const m = /([0-9]+(?:\.[0-9]+)?)\s*mm\s*$/i.exec(p.nome ?? '');
    if (!m) { ignorados++; continue; }
    const mm = parseFloat(m[1]);
    if (!isFinite(mm) || mm <= 0) { ignorados++; continue; }
    const ct = Math.round(mmToCt(mm) * 10000) / 10000;
    await sql`
      INSERT INTO alissonerp.produto_pedra_extras (produto_id, peso_ct)
      VALUES (${p.id_produto}, ${ct})
      ON CONFLICT (produto_id) DO UPDATE SET peso_ct = EXCLUDED.peso_ct, updated_at = NOW()
    `;
    upsertados++;
  }
  console.log(`Upsertados: ${upsertados}, ignorados: ${ignorados}`);

  // Amostra
  const amostra = await sql`
    SELECT p.sku, p.nome, p.peso_precificado AS pg, ppe.peso_ct
    FROM public.produtos p
    LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
    WHERE p.categoria ILIKE 'Pedras%' AND p.nome ILIKE 'Diamante Natural%'
    ORDER BY p.nome LIMIT 8
  `;
  console.table(amostra);
} finally { await sql.end(); }
