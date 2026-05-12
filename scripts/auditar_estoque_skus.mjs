import postgres from "postgres";

const sql = postgres("postgresql://postgres:V9qT1Zx3mL7Nf5Rg8Kc2Wb4Jp6Hy0DsA@72.60.55.140:5543/postgres", {
  ssl: false,
  max: 3,
});

// ── Lista de SKUs para auditoria ──────────────────────────────────────────────
const SKUS = [
  "1551-22", "1573-14", "1570-13", "1572-14", "1592-19",
  "1543-13", "1559-17", "1525-9",  "1594-14", "1007-15",
  "1465-13", "1479-18", "1518-13", "1562-3",  "teste-evolury",
  "1468-12", "1563-13", "1568-16", "1137-15", "1137-13",
  "1137-10", "1137-16", "1160-13", "1196-10", "1137-11",
  "1420-10", "1196-8",  "1137-9",  "1420-15", "1275-16",
  "1160-12", "1129-20", "1099-13", "1013-12", "1401-16",
  "1700-14", "1020-9",  "1137-8",  "1013-10", "1160-19",
  "1345-17", "1117-17", "1558-14", "1224-9",  "1296-4",
];

const PERIODO_INI = "2026-03-01";
const PERIODO_FIM = "2026-05-11";

async function main() {
  console.log("=".repeat(80));
  console.log("  AUDITORIA DE RASTREABILIDADE DE ESTOQUE");
  console.log(`  Período: ${PERIODO_INI} a ${PERIODO_FIM}`);
  console.log(`  Total de SKUs: ${SKUS.length}`);
  console.log("=".repeat(80));

  // 1. Buscar todos os produtos pela lista de SKUs
  const produtos = await sql`
    SELECT id_produto, sku, nome
    FROM public.produtos
    WHERE sku = ANY(${SKUS})
    ORDER BY sku
  `;

  console.log(`\n📦 Produtos encontrados: ${produtos.length} de ${SKUS.length}\n`);

  const naoEncontrados = SKUS.filter(s => !produtos.find(p => p.sku === s));
  if (naoEncontrados.length > 0) {
    console.log(`⚠️  SKUs NÃO ENCONTRADOS em public.produtos:`);
    naoEncontrados.forEach(s => console.log(`    - ${s}`));
    console.log();
  }

  // 2. Para cada produto, buscar dados
  for (const prod of produtos) {
    const pid = prod.id_produto;
    console.log("╔" + "═".repeat(78) + "╗");
    console.log(`║  SKU: ${prod.sku.padEnd(20)}  ID: ${String(pid).padEnd(8)}  Produto: ${prod.nome}`);
    console.log("╚" + "═".repeat(78) + "╝");

    // ── a. Saldo atual por local ─────────────────────────────────────────
    const saldos = await sql`
      SELECT local_estoque_id, saldo_fisico, reservado, disponivel, em_transito
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE produto_id = ${pid}
    `;

    console.log("\n  📦 SALDO ATUAL:");
    if (saldos.length === 0) {
      console.log("    Nenhum saldo encontrado (produto sem movimentação)");
    } else {
      for (const s of saldos) {
        const [local] = await sql`
          SELECT nome FROM alissonerp.locais_estoque WHERE id = ${s.local_estoque_id}
        `;
        const nomeLocal = local ? local.nome : `ID ${s.local_estoque_id}`;
        console.log(`    ${nomeLocal.padEnd(20)}  Físico: ${String(s.saldo_fisico).padStart(4)}  Reservado: ${String(s.reservado).padStart(4)}  Disponível: ${String(s.disponivel).padStart(4)}  Trânsito: ${String(s.em_transito).padStart(4)}`);
      }
    }

    // ── b. Movimentações de estoque comercial ────────────────────────────
    const movs = await sql`
      SELECT id, tipo, quantidade, motivo, referencia_id, referencia_tipo,
             created_at, created_by, status, local_estoque_id, observacao,
             ordem_id, protocolo_id, devolucao_id
      FROM alissonerp.movimentacoes_estoque_comercial
      WHERE produto_id = ${pid}
        AND created_at >= ${PERIODO_INI}::date
        AND created_at < (${PERIODO_FIM}::date + interval '1 day')
      ORDER BY created_at DESC
    `;

    console.log(`\n  📋 MOVIMENTAÇÕES DE ESTOQUE (${movs.length} registros no período):`);
    if (movs.length === 0) {
      console.log("    Nenhuma movimentação no período.");
    } else {
      // Agrupar por tipo de operação
      const saidasVenda = movs.filter(m => m.motivo === 'venda' || m.referencia_tipo === 'venda');
      const ajustes = movs.filter(m => m.motivo?.startsWith('ajuste') || m.motivo === 'inventario');
      const transferencias = movs.filter(m => m.motivo?.startsWith('transferencia'));
      const devolucoes = movs.filter(m => m.motivo === 'devolucao' || m.devolucao_id);
      const outros = movs.filter(m =>
        !saidasVenda.includes(m) && !ajustes.includes(m) &&
        !transferencias.includes(m) && !devolucoes.includes(m)
      );

      if (saidasVenda.length > 0) {
        console.log(`    ── VENDAS (${saidasVenda.length} movimentações) ──`);
        for (const m of saidasVenda) {
          const [local] = await sql`SELECT nome FROM alissonerp.locais_estoque WHERE id = ${m.local_estoque_id}`;
          const nomeLocal = local ? local.nome : `ID ${m.local_estoque_id}`;
          const data = m.created_at ? m.created_at.toISOString?.()?.slice(0, 10) ?? String(m.created_at)?.slice(0, 10) : String(m.created_at);
          console.log(`       ${data}  |  ${m.tipo.padEnd(7)}  |  Qtd: ${String(m.quantidade).padStart(3)}  |  ${nomeLocal.padEnd(10)}  |  Ref: ${m.referencia_tipo ?? '-'}#${m.referencia_id ?? '-'}  |  Status: ${m.status}`);
        }
      }

      if (ajustes.length > 0) {
        console.log(`    ── AJUSTES (${ajustes.length} movimentações) ──`);
        for (const m of ajustes) {
          const [local] = await sql`SELECT nome FROM alissonerp.locais_estoque WHERE id = ${m.local_estoque_id}`;
          const nomeLocal = local ? local.nome : `ID ${m.local_estoque_id}`;
          const data = m.created_at ? m.created_at.toISOString?.()?.slice(0, 10) ?? String(m.created_at)?.slice(0, 10) : String(m.created_at);
          console.log(`       ${data}  |  ${m.tipo.padEnd(7)}  |  Qtd: ${String(m.quantidade).padStart(3)}  |  ${nomeLocal.padEnd(10)}  |  Motivo: ${m.motivo.padEnd(15)}  |  Obs: ${m.observacao ?? '-'}`);
        }
      }

      if (transferencias.length > 0) {
        console.log(`    ── TRANSFERÊNCIAS (${transferencias.length} movimentações) ──`);
        for (const m of transferencias) {
          const [local] = await sql`SELECT nome FROM alissonerp.locais_estoque WHERE id = ${m.local_estoque_id}`;
          const nomeLocal = local ? local.nome : `ID ${m.local_estoque_id}`;
          const data = m.created_at ? m.created_at.toISOString?.()?.slice(0, 10) ?? String(m.created_at)?.slice(0, 10) : String(m.created_at);
          console.log(`       ${data}  |  ${m.tipo.padEnd(7)}  |  Qtd: ${String(m.quantidade).padStart(3)}  |  ${nomeLocal.padEnd(10)}  |  Motivo: ${m.motivo.padEnd(20)}`);
        }
      }

      if (devolucoes.length > 0) {
        console.log(`    ── DEVOLUÇÕES (${devolucoes.length} movimentações) ──`);
        for (const m of devolucoes) {
          const data = m.created_at ? m.created_at.toISOString?.()?.slice(0, 10) ?? String(m.created_at)?.slice(0, 10) : String(m.created_at);
          console.log(`       ${data}  |  ${m.tipo.padEnd(7)}  |  Qtd: ${String(m.quantidade).padStart(3)}  |  Devolução #${m.devolucao_id ?? '-'}`);
        }
      }

      if (outros.length > 0) {
        console.log(`    ── OUTROS (${outros.length} movimentações) ──`);
        for (const m of outros) {
          const data = m.created_at ? m.created_at.toISOString?.()?.slice(0, 10) ?? String(m.created_at)?.slice(0, 10) : String(m.created_at);
          console.log(`       ${data}  |  ${m.tipo.padEnd(7)}  |  Qtd: ${String(m.quantidade).padStart(3)}  |  Motivo: ${m.motivo.padEnd(15)}`);
        }
      }
    }

    // ── c. Pedidos de venda (itens_venda_erp + vendas_erp) ─────────────
    const itensVenda = await sql`
      SELECT iv.id, iv.quantidade, iv.total_item, iv.venda_id,
             v.numero_venda, v.situacao, v.data_venda, v.created_by,
             v.created_at
      FROM alissonerp.itens_venda_erp iv
      JOIN alissonerp.vendas_erp v ON v.id = iv.venda_id
      WHERE iv.produto_id = ${pid}
        AND v.created_at >= ${PERIODO_INI}::date
        AND v.created_at < (${PERIODO_FIM}::date + interval '1 day')
      ORDER BY v.created_at DESC
    `;

    console.log(`\n  🛒 PEDIDOS DE VENDA (${itensVenda.length} registros no período):`);
    if (itensVenda.length === 0) {
      console.log("    Nenhum pedido de venda encontrado.");
    } else {
      for (const iv of itensVenda) {
        const data = iv.data_venda ? String(iv.data_venda).slice(0, 10) : (iv.created_at ? String(iv.created_at).slice(0, 10) : '-');
        console.log(`    Nº ${String(iv.numero_venda).padStart(8)}  |  ${data}  |  Situação: ${String(iv.situacao).padEnd(12)}  |  Qtd: ${String(iv.quantidade).padStart(3)}  |  Total: R$ ${Number(iv.total_item).toFixed(2)}  |  Venda ID: ${iv.venda_id}`);
      }
    }

    // ── d. Ordens de serviço / produção ─────────────────────────────────
    const itensOrdem = await sql`
      SELECT io.id, io.quantidade, io.ordem_id,
             o.numero_ordem, o.situacao, o.created_at, o.tipo_ordem,
             o.venda_id
      FROM alissonerp.itens_ordem io
      JOIN alissonerp.ordens o ON o.id = io.ordem_id
      WHERE io.produto_id = ${pid}
        AND o.created_at >= ${PERIODO_INI}::date
        AND o.created_at < (${PERIODO_FIM}::date + interval '1 day')
      ORDER BY o.created_at DESC
    `;

    console.log(`\n  🔧 ORDENS DE SERVIÇO/PRODUÇÃO (${itensOrdem.length} registros no período):`);
    if (itensOrdem.length === 0) {
      console.log("    Nenhuma ordem de serviço encontrada.");
    } else {
      for (const io of itensOrdem) {
        const data = io.created_at ? String(io.created_at).slice(0, 10) : '-';
        const vinculoVenda = io.venda_id ? ` (Venda #${io.venda_id})` : '';
        console.log(`    OS ${String(io.numero_ordem).padStart(8)}  |  ${data}  |  Situação: ${String(io.situacao).padEnd(15)}  |  Qtd: ${String(io.quantidade).padStart(3)}  |  Tipo: ${io.tipo_ordem ?? '-'}${vinculoVenda}`);
      }
    }

    // ── e. Movimentações de estoque de insumos (se for ouro/insumo) ────
    const insumoMovs = await sql`
      SELECT m.id, m.entrada, m.saida, m.deposito_id, m.ordem_id,
             m.marcador, m.obs, m.data_hora, m.created_by,
             d.nome AS deposito_nome
      FROM alissonerp.movimentacoes_estoque m
      LEFT JOIN alissonerp.depositos d ON d.id = m.deposito_id
      WHERE m.ordem_id IN (
        SELECT ordem_id FROM alissonerp.itens_ordem WHERE produto_id = ${pid}
      )
        AND m.data_hora >= ${PERIODO_INI}::date
        AND m.data_hora < (${PERIODO_FIM}::date + interval '1 day')
      ORDER BY m.data_hora DESC
      LIMIT 20
    `;

    if (insumoMovs.length > 0) {
      console.log(`\n  ⛏️  MOV. DE INSUMOS VINCULADAS (${insumoMovs.length} registros):`);
      for (const m of insumoMovs) {
        const data = m.data_hora ? String(m.data_hora).slice(0, 10) : '-';
        const tipo = m.entrada > 0 ? `Entrada ${m.entrada}g` : `Saída ${m.saida}g`;
        console.log(`    ${data}  |  ${tipo.padEnd(15)}  |  Depósito: ${m.deposito_nome ?? m.deposito_id}  |  Marcador: ${m.marcador ?? '-'}  |  OS #${m.ordem_id ?? '-'}`);
      }
    }

    console.log(); // linha em branco entre produtos
  }

  // ── RESUMO FINAL ──────────────────────────────────────────────────────
  console.log("=".repeat(80));
  console.log("  📊 RESUMO DA AUDITORIA");
  console.log("=".repeat(80));

  for (const prod of produtos) {
    const [row] = await sql`
      SELECT COUNT(*)::int AS total_mov,
             COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE 0 END), 0)::int AS total_entradas,
             COALESCE(SUM(CASE WHEN tipo = 'saida' THEN quantidade ELSE 0 END), 0)::int AS total_saidas
      FROM alissonerp.movimentacoes_estoque_comercial
      WHERE produto_id = ${prod.id_produto}
        AND created_at >= ${PERIODO_INI}::date
        AND created_at < (${PERIODO_FIM}::date + interval '1 day')
        AND status = 'efetivado'
    `;

    const [vendas] = await sql`
      SELECT COUNT(*)::int AS total_vendas,
             COALESCE(SUM(iv.quantidade), 0)::int AS qtd_vendida
      FROM alissonerp.itens_venda_erp iv
      JOIN alissonerp.vendas_erp v ON v.id = iv.venda_id
      WHERE iv.produto_id = ${prod.id_produto}
        AND v.created_at >= ${PERIODO_INI}::date
        AND v.created_at < (${PERIODO_FIM}::date + interval '1 day')
    `;

    const [ordens] = await sql`
      SELECT COUNT(*)::int AS total_ordens,
             COALESCE(SUM(io.quantidade), 0)::int AS qtd_ordens
      FROM alissonerp.itens_ordem io
      JOIN alissonerp.ordens o ON o.id = io.ordem_id
      WHERE io.produto_id = ${prod.id_produto}
        AND o.created_at >= ${PERIODO_INI}::date
        AND o.created_at < (${PERIODO_FIM}::date + interval '1 day')
    `;

    const [saldo] = await sql`
      SELECT COALESCE(SUM(saldo_fisico), 0)::int AS saldo_total
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE produto_id = ${prod.id_produto}
    `;

    console.log(`  ${prod.sku.padEnd(12)} → Mov: ${String(row.total_mov).padStart(3)} (E:${String(row.total_entradas).padStart(2)}/S:${String(row.total_saidas).padStart(2)})  |  Vendas: ${String(vendas.total_vendas).padStart(2)} (${String(vendas.qtd_vendida).padStart(3)} un)  |  OS: ${String(ordens.total_ordens).padStart(2)}  |  Saldo: ${String(saldo.saldo_total).padStart(3)}`);
  }

  await sql.end();
  console.log("\n✅ Auditoria concluída.");
}

main().catch(err => {
  console.error("❌ Erro na auditoria:", err);
  process.exit(1);
});
