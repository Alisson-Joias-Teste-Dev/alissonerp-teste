// Sincroniza banco: aplica migrations pendentes + limpa duplicatas + valida.
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const sql = postgres('postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres', { ssl: false });

async function main() {
  // ── 1. Detectar migrations pendentes ──────────────────────────────────────
  console.log('=== 1. Verificando migrations ===');
  const dir = 'supabase/migrations';
  const files = readdirSync(dir).filter(f => /^\d{3}_.+\.sql$/.test(f)).sort();
  // Migrations relevantes recentes
  const candidatas = files.filter(f => /^(169|170|171|172|173)_/.test(f));

  // Checagens funcionais (pq não temos tabela de _migrations)
  const checks = {
    '169_fix_trigger_search_path.sql':
      sql`SELECT 1 FROM pg_proc WHERE proname = 'fn_processar_apontamento_pcp' LIMIT 1`,
    '170_solicitacoes_desconto.sql':
      sql`SELECT 1 FROM information_schema.tables WHERE table_schema='alissonerp' AND table_name='solicitacoes_desconto' LIMIT 1`,
    '171_produto_pedra_preco_quantidade.sql':
      sql`SELECT 1 FROM information_schema.tables WHERE table_schema='alissonerp' AND table_name='produto_pedra_extras' LIMIT 1`,
    '172_editor_ia_historico.sql':
      sql`SELECT 1 FROM information_schema.tables WHERE table_schema='alissonerp' AND table_name='editor_ia_historico' LIMIT 1`,
    '173_pedra_peso_ct.sql':
      sql`SELECT 1 FROM information_schema.columns WHERE table_schema='alissonerp' AND table_name='produto_pedra_extras' AND column_name='peso_ct' LIMIT 1`,
  };

  for (const file of candidatas) {
    const check = checks[file];
    if (!check) { console.log(`  ${file} — sem check, pulando`); continue; }
    const r = await check;
    if (r.length > 0) {
      console.log(`  ${file} — JÁ APLICADA`);
    } else {
      console.log(`  ${file} — APLICANDO...`);
      const sqlPath = join(dir, file);
      try {
        await sql.unsafe(readFileSync(sqlPath, 'utf8'));
        console.log(`  ${file} — OK`);
      } catch (e) {
        console.log(`  ${file} — FALHOU: ${e.message}`);
      }
    }
  }

  // ── 2. Limpar duplicatas Diamante Natural ──────────────────────────────────
  console.log('\n=== 2. Dedup Diamante Natural ===');
  // Para cada nome "Diamante Natural Xmm" que tem mais de 1 produto ativo,
  // mantém o que tem categoria='Pedras' + peso_ct e desativa os outros.
  const dups = await sql`
    SELECT p.nome, COUNT(*)::int AS qtd
    FROM public.produtos p
    WHERE p.nome ILIKE 'Diamante Natural %mm'
      AND p.situacao = 'A'
    GROUP BY p.nome
    HAVING COUNT(*) > 1
  `;
  console.log(`Nomes com duplicata: ${dups.length}`);
  let removidos = 0;
  for (const d of dups) {
    const cands = await sql`
      SELECT p.id_produto, p.sku, p.categoria, ppe.peso_ct
      FROM public.produtos p
      LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
      WHERE p.nome = ${d.nome} AND p.situacao = 'A'
    `;
    // Mantém o que tiver categoria='Pedras' + peso_ct; remove os demais.
    const manter = cands.find(c => c.categoria && /pedras/i.test(c.categoria) && c.peso_ct != null) || cands[0];
    const remover = cands.filter(c => c.id_produto !== manter.id_produto);
    if (remover.length === 0) continue;
    const ids  = remover.map(r => r.id_produto);
    const skus = remover.map(r => r.sku);
    await sql.begin(async tx => {
      await tx`DELETE FROM public.estoque WHERE sku = ANY(${skus})`;
      await tx`DELETE FROM alissonerp.produto_pedra_extras WHERE produto_id = ANY(${ids})`;
      await tx`DELETE FROM alissonerp.produto_composicao WHERE produto_id = ANY(${ids})`.catch(()=>{});
      await tx`DELETE FROM alissonerp.fichas_tecnicas_produto WHERE produto_id = ANY(${ids})`.catch(()=>{});
      await tx`DELETE FROM alissonerp.erp_produtos WHERE produto_id = ANY(${ids})`;
      await tx`DELETE FROM public.produtos WHERE id_produto = ANY(${ids})`;
    });
    removidos += remover.length;
  }
  console.log(`Duplicatas removidas: ${removidos}`);

  // ── 3. Pedras antigas sem categoria/peso_ct (não duplicadas) ───────────────
  console.log('\n=== 3. Pedras "órfãs" sem categoria/peso_ct ===');
  // Produtos cujo nome é "<algo> XmmXmm" mas categoria != Pedras → marcar como Pedras
  const orfas = await sql`
    SELECT p.id_produto, p.sku, p.nome
    FROM public.produtos p
    LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
    WHERE p.nome ~* '^(Diamante Natural|Moissanita|Rubi|Esmeralda|Safira|Zirconia)\\s+[0-9]+(\\.[0-9]+)?mm$'
      AND p.situacao = 'A'
      AND (p.categoria IS NULL OR p.categoria NOT ILIKE 'Pedras%' OR ppe.peso_ct IS NULL)
  `;
  console.log(`Órfãs encontradas: ${orfas.length}`);
  if (orfas.length > 0) console.table(orfas.slice(0, 5));

  for (const o of orfas) {
    const m = /([0-9]+(?:\.[0-9]+)?)\s*mm\s*$/i.exec(o.nome);
    if (!m) continue;
    const mm = parseFloat(m[1]);
    // Computa ct via tabela canônica + extrapolação cúbica
    const TBL = [[1.0,0.005],[1.1,0.006],[1.2,0.007],[1.3,0.009],[1.4,0.012],[1.5,0.015],[1.6,0.017],[1.7,0.019],[1.8,0.022],[1.9,0.026],[2.0,0.030],[2.1,0.035],[2.2,0.040],[2.3,0.046],[2.4,0.053],[2.5,0.060]];
    let ct;
    if (mm <= 1.0) ct = 0.005;
    else if (mm >= 2.5) ct = Math.round(0.060 * Math.pow(mm/2.5, 3) * 1000) / 1000;
    else {
      for (let i = 0; i < TBL.length - 1; i++) {
        if (mm >= TBL[i][0] && mm <= TBL[i+1][0]) {
          const r = (mm - TBL[i][0]) / (TBL[i+1][0] - TBL[i][0]);
          ct = TBL[i][1] + r * (TBL[i+1][1] - TBL[i][1]);
          break;
        }
      }
    }
    await sql`UPDATE public.produtos SET categoria = 'Pedras' WHERE id_produto = ${o.id_produto} AND (categoria IS NULL OR categoria NOT ILIKE 'Pedras%')`;
    await sql`
      INSERT INTO alissonerp.produto_pedra_extras (produto_id, peso_ct)
      VALUES (${o.id_produto}, ${Number(ct.toFixed(4))})
      ON CONFLICT (produto_id) DO UPDATE SET peso_ct = EXCLUDED.peso_ct, updated_at = NOW()
    `;
  }

  // ── 4. Estado final ────────────────────────────────────────────────────────
  console.log('\n=== 4. Estado final ===');
  const final = await sql`
    SELECT p.sku, p.nome, p.preco_tiny, ppe.peso_ct,
           ROUND((ppe.peso_ct * 100)::numeric, 1) AS pontos
    FROM public.produtos p
    LEFT JOIN alissonerp.produto_pedra_extras ppe ON ppe.produto_id = p.id_produto
    WHERE p.categoria ILIKE 'Pedras%' AND p.situacao = 'A'
    ORDER BY p.nome
  `;
  console.log(`Pedras ativas (categoria='Pedras'): ${final.length}`);
  console.table(final);
}

try {
  await main();
} catch (e) {
  console.error('ERRO:', e);
} finally {
  await sql.end();
}
