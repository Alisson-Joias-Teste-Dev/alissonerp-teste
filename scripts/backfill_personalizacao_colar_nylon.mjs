// Backfill: preenche personalizacao em itens_venda_erp para vendas de Abril/2026
// com o produto "Colar com nome nylon" (PZ0001) onde personalizacao IS NULL
// mas observacao contém o nome gravado no formato "Nome gravado: VALOR"
import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

console.log('=== BACKFILL personalizacao — Colar com nome nylon (Abril/2026) ===\n');

async function main() {
  // 1. Listar todos os itens afetados
  const itens = await sql`
    SELECT
      iv.id             AS item_id,
      iv.venda_id,
      ve.numero_venda,
      iv.nome_produto,
      iv.sku,
      iv.observacao,
      iv.personalizacao,
      ve.created_at::date AS data_venda
    FROM alissonerp.itens_venda_erp iv
    JOIN alissonerp.vendas_erp ve ON ve.id = iv.venda_id
    WHERE iv.sku = 'PZ0001'
      AND DATE_TRUNC('month', ve.created_at) = DATE_TRUNC('month', CURRENT_DATE)
    ORDER BY ve.created_at DESC
  `;

  console.log(`Total de itens encontrados este mês: ${itens.length}\n`);

  const comPersonalizacao   = itens.filter(i => i.personalizacao != null);
  const semPersonalizacao   = itens.filter(i => i.personalizacao == null);
  const comNomeNaObs        = semPersonalizacao.filter(i => i.observacao?.includes('Nome'));
  const semNenhuma          = semPersonalizacao.filter(i => !i.observacao?.includes('Nome'));

  console.log(`  ✅ Já têm personalizacao preenchida : ${comPersonalizacao.length}`);
  console.log(`  ⚠️  personalizacao NULL              : ${semPersonalizacao.length}`);
  console.log(`     └─ com nome na observacao        : ${comNomeNaObs.length}`);
  console.log(`     └─ sem nenhum dado disponível    : ${semNenhuma.length}`);
  console.log('');

  if (semPersonalizacao.length > 0) {
    console.log('─── Detalhes dos itens sem personalizacao ───────────────────────');
    for (const i of semPersonalizacao) {
      const nomeExtraido = extrairNome(i.observacao);
      console.log(`  Venda #${i.numero_venda} (item ${i.item_id}) | data: ${i.data_venda} | obs: ${JSON.stringify(i.observacao)} | extraído: ${nomeExtraido ?? '—'}`);
    }
    console.log('');
  }

  // 2. Backfill: atualizar onde conseguimos extrair o nome da observacao
  const paraAtualizar = semPersonalizacao.filter(i => extrairNome(i.observacao) != null);

  if (paraAtualizar.length === 0) {
    console.log('Nenhum item pode ser atualizado automaticamente via observacao.');
    console.log('Use a consulta abaixo para atualizar manualmente no banco:\n');
    console.log(`UPDATE alissonerp.itens_venda_erp`);
    console.log(`SET personalizacao = '{"tipo":"nome","label":"Nome a gravar","valor":"SEU_NOME"}'::jsonb`);
    console.log(`WHERE id = <item_id>;\n`);
    await sql.end();
    return;
  }

  console.log(`Atualizando ${paraAtualizar.length} item(ns) automaticamente...\n`);

  for (const item of paraAtualizar) {
    const nome = extrairNome(item.observacao);
    const personalizacaoJson = {
      tipo: 'nome',
      label: 'Nome a gravar',
      valor: nome,
    };
    await sql`
      UPDATE alissonerp.itens_venda_erp
      SET personalizacao = ${sql.json(personalizacaoJson)}
      WHERE id = ${item.item_id}
    `;
    console.log(`  ✅ Venda #${item.numero_venda} item ${item.item_id} → "${nome}"`);
  }

  console.log('\n=== CONCLUÍDO ===');
  await sql.end();
}

function extrairNome(observacao) {
  if (!observacao) return null;
  // Formatos possíveis: "Nome gravado: RICARDO", "Nome a gravar: MARIA"
  const match = observacao.match(/Nome[^:]*:\s*([^\n]+)/i);
  return match ? match[1].trim().toUpperCase() : null;
}

main().catch(e => { console.error(e); process.exit(1); });
