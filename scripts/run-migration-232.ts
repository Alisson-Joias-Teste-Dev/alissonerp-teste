/**
 * Script para rodar migration 232: corrigir comissões zeradas.
 *
 * Uso: npx tsx scripts/run-migration-232.ts
 */

import postgres from "postgres";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ═══ Carregar DATABASE_URL do .env.local ════════════════════════════════════

const envPath = resolve(process.cwd(), ".env.local");
if (!existsSync(envPath)) {
  console.error("ERRO: .env.local não encontrado.");
  process.exit(1);
}

const envContent = readFileSync(envPath, "utf-8").replace(/^\uFEFF/, "");
const envVars: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim().replace(/\r$/, "");
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
}

const DATABASE_URL = envVars.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERRO: DATABASE_URL não encontrada.");
  process.exit(1);
}

console.log("Conectando ao banco...");

const sql = postgres(DATABASE_URL, {
  ssl: false,
  max: 1,
  idle_timeout: 10,
  connection: { search_path: "alissonerp,public" },
});

// ═══ Executar ════════════════════════════════════════════════════════════════

async function main() {
  try {
    // ── DIAGNÓSTICO: quantos itens com comissão zerada? ──────────────────
    console.log("\n─── DIAGNÓSTICO ───");

    const [total] = await sql`
      SELECT COUNT(*)::int AS total
      FROM alissonerp.itens_venda_erp
      WHERE pct_comissao = 0
    `;
    console.log(`Itens com comissão zerada: ${total.total}`);

    if (total.total === 0) {
      console.log("Nada a corrigir. Saindo.");
      await sql.end();
      return;
    }

    const faixas = await sql`
      SELECT desconto_pct, comissao_pct FROM alissonerp.faixas_comissao WHERE ativo = true ORDER BY desconto_pct
    `;
    console.log(`Faixas de comissão carregadas: ${faixas.length}`);

    // Agrupar itens por desconto arredondado para ver o que será aplicado
    const byDesc = await sql`
      SELECT
        ROUND(pct_desconto)::int AS desc_arredondado,
        COUNT(*)::int AS qtd_itens,
        ROUND(SUM(total_item)::numeric, 2)::text AS soma_total
      FROM alissonerp.itens_venda_erp
      WHERE pct_comissao = 0
      GROUP BY ROUND(pct_desconto)::int
      ORDER BY 1
    `;
    console.log("\nDistribuição por desconto arredondado:");
    for (const r of byDesc) {
      const faixa = faixas.find((f: Record<string, unknown>) => Number(f.desconto_pct) === Number(r.desc_arredondado));
      console.log(`  Desconto ${r.desc_arredondado}% → ${r.qtd_itens} itens (R$ ${r.soma_total}) → comissão ${faixa ? faixa.comissao_pct + '%' : 'SEM FAIXA'}`);
    }

    // ── CORREÇÃO ──────────────────────────────────────────────────────────
    console.log("\n─── CORRIGINDO ───");

    // Itens 0%–30%: via faixas_comissao
    const [r1] = await sql`
      WITH updated AS (
        UPDATE alissonerp.itens_venda_erp ive
        SET
          pct_comissao   = fc.comissao_pct,
          valor_comissao = ROUND((ive.total_item * fc.comissao_pct / 100)::numeric, 2)
        FROM alissonerp.faixas_comissao fc
        WHERE ive.pct_comissao = 0
          AND ive.pct_desconto <= 30
          AND fc.desconto_pct = ROUND(ive.pct_desconto)
          AND fc.ativo = true
        RETURNING ive.id
      )
      SELECT COUNT(*)::int AS corrigidos FROM updated
    `;
    console.log(`Itens 0-30% corrigidos: ${r1.corrigidos}`);

    // Itens >30%: comissão fixa 0.5%
    const [r2] = await sql`
      WITH updated AS (
        UPDATE alissonerp.itens_venda_erp
        SET
          pct_comissao   = 0.5,
          valor_comissao = ROUND((total_item * 0.5 / 100)::numeric, 2)
        WHERE pct_comissao = 0
          AND pct_desconto > 30
        RETURNING id
      )
      SELECT COUNT(*)::int AS corrigidos FROM updated
    `;
    console.log(`Itens >30% corrigidos: ${r2.corrigidos}`);

    // ── RECALCULAR TOTAIS ─────────────────────────────────────────────────
    if (r1.corrigidos > 0 || r2.corrigidos > 0) {
      console.log("\n─── RECALCULANDO TOTAIS DAS VENDAS ───");

      // Recalcular para TODAS as vendas que tinham itens com comissao zerada
      const [r3] = await sql`
        WITH vendas_afetadas AS (
          SELECT DISTINCT venda_id
          FROM alissonerp.itens_venda_erp
          WHERE pct_comissao > 0
        )
        UPDATE alissonerp.vendas_erp ve
        SET
          total_comissao = COALESCE((
            SELECT SUM(valor_comissao)
            FROM alissonerp.itens_venda_erp
            WHERE venda_id = ve.id
          ), 0),
          updated_at = NOW()
        FROM vendas_afetadas va
        WHERE ve.id = va.venda_id
        RETURNING ve.id
      `;
      console.log(`Vendas com total_comissao recalculado: ${r3.length}`);
    }

    // ── CONFERÊNCIA ───────────────────────────────────────────────────────
    const [resto] = await sql`
      SELECT COUNT(*)::int AS total FROM alissonerp.itens_venda_erp WHERE pct_comissao = 0
    `;
    console.log(`\n--- CONFERÊNCIA ---`);
    console.log(`Itens ainda com comissão zerada: ${resto.total}`);

    if (resto.total > 0) {
      const amostra = await sql`
        SELECT id, venda_id, pct_desconto, total_item
        FROM alissonerp.itens_venda_erp
        WHERE pct_comissao = 0
        LIMIT 5
      `;
      console.log("Amostra dos que sobraram:");
      for (const a of amostra) {
        console.log(`  id=${a.id} venda=${a.venda_id} desc=${a.pct_desconto}% total=R$ ${a.total_item}`);
      }
    }

    console.log("\n✅ Concluído.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
