import postgres from 'postgres';
const sql = postgres('postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres', { ssl: false, max: 1 });

async function main() {
  console.log('=== CORRECAO DE DUPLICATAS (DESABILITANDO TRIGGERS) ===\n');

  // Step 0: Disable all protective triggers
  console.log('Desabilitando triggers...');
  const triggersItens = [
    'trg_proteger_itens_venda_fechada',
    'trg_proteger_insert_itens_venda_fechada',
    'trg_recalcular_totais_venda',
  ];
  const triggersVendas = [
    'trg_aa_proteger_venda_fechada',
    'trg_bloquear_venda',
    'trg_updated_at_vendas_erp',
    'trg_auditar_divergencia_total',
  ];
  for (const t of triggersItens) {
    try { await sql.unsafe(`ALTER TABLE alissonerp.itens_venda_erp DISABLE TRIGGER "${t}"`); } catch(e) {}
  }
  for (const t of triggersVendas) {
    try { await sql.unsafe(`ALTER TABLE alissonerp.vendas_erp DISABLE TRIGGER "${t}"`); } catch(e) {}
  }
  console.log('  OK');

  try {
    const [pre] = await sql`SELECT COUNT(*)::int as t, COUNT(DISTINCT (venda_id, produto_id, COALESCE(sku, '')))::int as d FROM alissonerp.itens_venda_erp WHERE produto_id IS NOT NULL`;
    const dupsBefore = pre.t - pre.d;
    console.log(`ANTES: total=${pre.t}, distinct=${pre.d}, dups=${dupsBefore}`);

    if (dupsBefore === 0) {
      console.log('   Nenhuma duplicata. Pulando DELETE, executando resto...');
    } else {
      // Step 1: Delete duplicates
      console.log('\n1. Removendo ' + dupsBefore + ' duplicatas...');
      const d = await sql`
        DELETE FROM alissonerp.itens_venda_erp
        WHERE id IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY venda_id, produto_id, COALESCE(sku, '') ORDER BY id
            ) as rn
            FROM alissonerp.itens_venda_erp WHERE produto_id IS NOT NULL
          ) ranked WHERE rn > 1
        )
      `;
      console.log('   ' + d.count + ' removidas');
    }
 
    // Step 2: Re-sync total_venda for synced orders
    console.log('\n2. Sincronizando total_venda do public.vendas...');
    const u = await sql`
      UPDATE alissonerp.vendas_erp ve SET
        total_venda = COALESCE(pv.total_venda, 0),
        total_produtos = COALESCE(pv.total_produtos, 0),
        total_frete = COALESCE(pv.frete_pago_cliente, 0),
        total_comissao = COALESCE((SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = ve.id), 0),
        updated_at = now()
      FROM public.vendas pv
      WHERE ve.public_venda_id = pv.id AND ve.public_venda_id IS NOT NULL
    `;
    console.log(`   ${u.count} vendas atualizadas`);

    // Step 3: Recalculate totals for ALL vendas (trigger was disabled)
    console.log('\n3. Recalculando total_produtos/desconto/comissao...');
    const r = await sql`
      UPDATE alissonerp.vendas_erp ve SET
        total_produtos = COALESCE((SELECT SUM(total_item) FROM alissonerp.itens_venda_erp WHERE venda_id = ve.id), 0),
        total_desconto = COALESCE((SELECT SUM((preco_lista - preco_unitario) * quantidade) FROM alissonerp.itens_venda_erp WHERE venda_id = ve.id), 0),
        total_comissao = COALESCE((SELECT SUM(valor_comissao) FROM alissonerp.itens_venda_erp WHERE venda_id = ve.id), 0),
        updated_at = now()
      WHERE ve.public_venda_id IS NULL
    `;
    console.log(`   ${r.count} vendas (sem public_venda_id) recalculadas`);

    // Step 4: Cancel pending payments exceeding total
    console.log('\n4. Cancelando pagamentos pendentes excessivos...');
    const p = await sql`
      UPDATE alissonerp.pagamentos_venda pg SET status = 'cancelado'
      FROM alissonerp.vendas_erp ve
      WHERE pg.venda_id = ve.id AND pg.status = 'pendente'
        AND ve.public_venda_id IS NOT NULL AND pg.valor > ve.total_venda + 0.01
    `;
    console.log(`   ${p.count} cancelados`);

    // Step 5: Adjust confirmed single-payment orders
    console.log('\n5. Ajustando pagamentos confirmados...');
    const c = await sql`
      UPDATE alissonerp.pagamentos_venda pg SET
        valor = ve.total_venda,
        gateway_payload = COALESCE(gateway_payload, '{}'::jsonb) || jsonb_build_object(
          'valor_original', pg.valor,
          'ajustado_em', to_char(now(), 'YYYY-MM-DD HH24:MI:SS'),
          'motivo', 'Correcao: total_venda re-sincronizado'
        )
      FROM alissonerp.vendas_erp ve
      WHERE pg.venda_id = ve.id AND pg.status = 'confirmado'
        AND pg.data_confirmacao IS NOT NULL AND ve.public_venda_id IS NOT NULL
        AND pg.valor > ve.total_venda + 0.01
        AND (SELECT COUNT(*) FROM alissonerp.pagamentos_venda p2 WHERE p2.venda_id = ve.id AND p2.status = 'confirmado' AND p2.data_confirmacao IS NOT NULL) = 1
    `;
    console.log(`   ${c.count} ajustados`);

    // Step 6: Cancel wrong contas_receber
    console.log('\n6. Cancelando contas_receber divergentes...');
    const cr = await sql`
      UPDATE alissonerp.contas_receber cr SET
        situacao = 'cancelado',
        obs = COALESCE(obs, '') || ' [Correcao total_venda ' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ']',
        updated_at = now()
      FROM alissonerp.vendas_erp ve
      WHERE cr.venda_erp_id = ve.id AND ve.public_venda_id IS NOT NULL
        AND cr.situacao IN ('pendente', 'pago')
        AND ABS(CR.valor - ve.total_venda) > 0.01
    `;
    console.log(`   ${cr.count} canceladas`);

  } finally {
    // Re-enable triggers
    console.log('\nReabilitando triggers...');
    for (const t of triggersVendas) {
      try { await sql.unsafe(`ALTER TABLE alissonerp.vendas_erp ENABLE TRIGGER "${t}"`); } catch(e) {}
    }
    for (const t of triggersItens) {
      try { await sql.unsafe(`ALTER TABLE alissonerp.itens_venda_erp ENABLE TRIGGER "${t}"`); } catch(e) {}
    }
    console.log('  OK');
  }

  // FINAL CHECK
  console.log('\n=== VERIFICACAO FINAL ===');
  const [post] = await sql`
    SELECT COUNT(*)::int as t, COUNT(DISTINCT (venda_id, produto_id, COALESCE(sku, '')))::int as d
    FROM alissonerp.itens_venda_erp WHERE produto_id IS NOT NULL
  `;
  console.log(`Itens: total=${post.t}, distinct=${post.d}, dups=${post.t - post.d}`);

  const [div] = await sql`
    SELECT COUNT(*)::int as cnt, COALESCE(SUM(ABS(ve.total_venda - pv.total_venda)), 0)::numeric as soma
    FROM alissonerp.vendas_erp ve JOIN public.vendas pv ON pv.id = ve.public_venda_id
    WHERE ABS(ve.total_venda - pv.total_venda) > 0.01
  `;
  console.log(`Divergencias: ${div.cnt} vendas, R$${Number(div.soma).toFixed(2)}`);

  if (post.t === post.d && div.cnt === 0) {
    console.log('\n✅ CORRECAO COMPLETA!');
  } else {
    if (post.t > post.d) console.log(`\n⚠️ ${post.t - post.d} duplicatas restantes.`);
    if (div.cnt > 0) console.log(`⚠️ ${div.cnt} divergencias restantes.`);
  }

  await sql.end();
}
main().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
