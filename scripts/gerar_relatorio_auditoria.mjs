/**
 * Script de Auditoria de Estoque — Gera relatório .md
 * 
 * Uso: node scripts/gerar_relatorio_auditoria.mjs
 * Saída: docs/relatorio-auditoria-estoque-2026-05-11.md
 */
import postgres from "postgres";
import fs from "fs";
import path from "path";

const sql = postgres("postgresql://postgres:k6M9b2Xd5Ff1Wp8Rj7Zt4Lc3Ns0VqY@72.60.55.140:5543/postgres", {
  ssl: false,
  max: 3,
});

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
const DATA_GERACAO = "2026-05-11";
const OUTPUT_PATH = path.resolve("docs/relatorio-auditoria-estoque-2026-05-11.md");

function esc(t) {
  if (t === null || t === undefined) return "-";
  return String(t).replace(/\|/g, "\\|");
}

async function main() {
  console.log("Gerando relatório de auditoria...");

  // 1. Buscar produtos
  const produtos = await sql`
    SELECT id_produto, sku, nome
    FROM public.produtos
    WHERE sku = ANY(${SKUS})
    ORDER BY sku
  `;

  const naoEncontrados = SKUS.filter(s => !produtos.find(p => p.sku === s));

  // 2. Para cada produto, coletar dados
  const detalhes = [];
  const linhasResumo = [];

  for (const prod of produtos) {
    const pid = prod.id_produto;
    const [localAntes] = await sql`
      SELECT nome FROM alissonerp.locais_estoque WHERE id = 1
    `;
    void localAntes; // unused

    // ── Saldos ──
    const saldos = await sql`
      SELECT v.local_estoque_id, v.saldo_fisico, v.reservado, v.disponivel, v.em_transito, le.nome AS local_nome
      FROM alissonerp.vw_saldo_estoque_comercial_v2 v
      LEFT JOIN alissonerp.locais_estoque le ON le.id = v.local_estoque_id
      WHERE v.produto_id = ${pid}
    `;

    // ── Movimentações ──
    const movs = await sql`
      SELECT m.id, m.tipo, m.quantidade, m.motivo, m.referencia_id, m.referencia_tipo,
             m.created_at, m.created_by, m.status, m.local_estoque_id, m.observacao,
             m.ordem_id, m.protocolo_id, m.devolucao_id, le.nome AS local_nome
      FROM alissonerp.movimentacoes_estoque_comercial m
      LEFT JOIN alissonerp.locais_estoque le ON le.id = m.local_estoque_id
      WHERE m.produto_id = ${pid}
        AND m.created_at >= ${PERIODO_INI}::date
        AND m.created_at < (${PERIODO_FIM}::date + interval '1 day')
      ORDER BY m.created_at DESC
    `;

    // ── Vendas ──
    const itensVenda = await sql`
      SELECT iv.quantidade, iv.total_item, iv.venda_id,
             v.numero_venda, v.situacao, v.data_venda, v.created_at
      FROM alissonerp.itens_venda_erp iv
      JOIN alissonerp.vendas_erp v ON v.id = iv.venda_id
      WHERE iv.produto_id = ${pid}
        AND v.created_at >= ${PERIODO_INI}::date
        AND v.created_at < (${PERIODO_FIM}::date + interval '1 day')
      ORDER BY v.created_at DESC
    `;

    // ── Ordens ──
    const itensOrdem = await sql`
      SELECT io.quantidade, io.ordem_id,
             o.numero_ordem, o.situacao, o.created_at, o.tipo_ordem, o.venda_id
      FROM alissonerp.itens_ordem io
      JOIN alissonerp.ordens o ON o.id = io.ordem_id
      WHERE io.produto_id = ${pid}
        AND o.created_at >= ${PERIODO_INI}::date
        AND o.created_at < (${PERIODO_FIM}::date + interval '1 day')
      ORDER BY o.created_at DESC
    `;

    detalhes.push({ prod, saldos, movs, itensVenda, itensOrdem });

    // ── Resumo (para tabelão) ──
    const [row] = await sql`
      SELECT COUNT(*)::int AS total_mov,
             COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN quantidade ELSE 0 END), 0)::int AS total_entradas,
             COALESCE(SUM(CASE WHEN tipo = 'saida' THEN quantidade ELSE 0 END), 0)::int AS total_saidas
      FROM alissonerp.movimentacoes_estoque_comercial
      WHERE produto_id = ${pid}
        AND created_at >= ${PERIODO_INI}::date
        AND created_at < (${PERIODO_FIM}::date + interval '1 day')
        AND status = 'efetivado'
    `;

    const [vendas] = await sql`
      SELECT COUNT(*)::int AS total_vendas, COALESCE(SUM(iv.quantidade), 0)::int AS qtd_vendida
      FROM alissonerp.itens_venda_erp iv
      JOIN alissonerp.vendas_erp v ON v.id = iv.venda_id
      WHERE iv.produto_id = ${pid}
        AND v.created_at >= ${PERIODO_INI}::date
        AND v.created_at < (${PERIODO_FIM}::date + interval '1 day')
    `;

    const [ordens] = await sql`
      SELECT COUNT(*)::int AS total_ordens, COALESCE(SUM(io.quantidade), 0)::int AS qtd_ordens
      FROM alissonerp.itens_ordem io
      JOIN alissonerp.ordens o ON o.id = io.ordem_id
      WHERE io.produto_id = ${pid}
        AND o.created_at >= ${PERIODO_INI}::date
        AND o.created_at < (${PERIODO_FIM}::date + interval '1 day')
    `;

    const [saldoTotal] = await sql`
      SELECT COALESCE(SUM(saldo_fisico), 0)::int AS saldo_total
      FROM alissonerp.vw_saldo_estoque_comercial_v2
      WHERE produto_id = ${pid}
    `;

    linhasResumo.push({ prod, row, vendas, ordens, saldoTotal: saldoTotal.saldo_total });
  }

  // ═══════════════════════════════════════════════════════
  // 3. GERAR MARKDOWN
  // ═══════════════════════════════════════════════════════
  let md = "";

  md += `# Relatório de Auditoria — Rastreabilidade de Estoque\n\n`;
  md += `**Data de geração:** ${DATA_GERACAO}\n\n`;
  md += `**Período analisado:** ${PERIODO_INI} a ${PERIODO_FIM}\n\n`;
  md += `**Total de SKUs consultados:** ${SKUS.length}\n\n`;
  md += `**Produtos encontrados:** ${produtos.length}\n\n`;

  // SKUs não encontrados
  if (naoEncontrados.length > 0) {
    md += `## ⚠️ SKUs Não Encontrados\n\n`;
    md += `Os seguintes SKUs da lista não foram localizados em \`public.produtos\`:\n\n`;
    for (const sku of naoEncontrados) {
      md += `- \`${sku}\`\n`;
    }
    md += `\n`;
  }

  // ═══════════════════════════════════════════════════════
  // RESUMO CONSOLIDADO
  // ═══════════════════════════════════════════════════════
  md += `## 📊 Resumo Consolidado\n\n`;
  md += `| SKU | ID | Produto | Mov. | Entradas | Saídas | Vendas | Qtd Vendida | OS | Saldo Total |\n`;
  md += `|-----|----|---------|:----:|:--------:|:------:|:-----:|:-----------:|:--:|:-----------:|\n`;

  for (const l of linhasResumo) {
    md += `| \`${esc(l.prod.sku)}\` | ${l.prod.id_produto} | ${esc(l.prod.nome.slice(0, 50))} | ${l.row.total_mov} | ${l.row.total_entradas} | ${l.row.total_saidas} | ${l.vendas.total_vendas} | ${l.vendas.qtd_vendida} | ${l.ordens.total_ordens} | ${l.saldoTotal} |\n`;
  }

  // ═══════════════════════════════════════════════════════
  // DETALHAMENTO POR SKU
  // ═══════════════════════════════════════════════════════
  md += `\n## 📋 Detalhamento por SKU\n\n`;

  for (const d of detalhes) {
    const { prod, saldos, movs, itensVenda, itensOrdem } = d;
    const pid = prod.id_produto;

    md += `---\n\n`;
    md += `### SKU: \`${prod.sku}\` (ID: ${pid})\n\n`;
    md += `**Produto:** ${prod.nome}\n\n`;

    // ── Saldo ──
    md += `#### 📦 Saldo Atual\n\n`;
    if (saldos.length === 0) {
      md += `*Nenhum saldo encontrado (produto sem movimentação).*\n\n`;
    } else {
      md += `| Local | Físico | Reservado | Disponível | Em Trânsito |\n`;
      md += `|-------|:------:|:---------:|:----------:|:-----------:|\n`;
      for (const s of saldos) {
        md += `| ${esc(s.local_nome)} | ${s.saldo_fisico} | ${s.reservado} | ${s.disponivel} | ${s.em_transito} |\n`;
      }
      md += `\n`;
    }

    // ── Movimentações ──
    md += `#### 📋 Movimentações de Estoque (${movs.length} no período)\n\n`;
    if (movs.length === 0) {
      md += `*Nenhuma movimentação no período.*\n\n`;
    } else {
      md += `| Data | Tipo | Qtd | Local | Motivo | Referência | Obs | Status |\n`;
      md += `|------|:----:|:---:|-------|--------|------------|-----|:------:|\n`;
      for (const m of movs) {
        const data = m.created_at ? String(m.created_at).slice(0, 10) : "-";
        const ref = m.referencia_tipo ? `${m.referencia_tipo}#${m.referencia_id ?? ""}` : "-";
        md += `| ${data} | ${esc(m.tipo)} | ${m.quantidade} | ${esc(m.local_nome)} | ${esc(m.motivo)} | ${esc(ref)} | ${esc(m.observacao ?? "")} | ${m.status} |\n`;
      }
      md += `\n`;
    }

    // ── Vendas ──
    md += `#### 🛒 Pedidos de Venda (${itensVenda.length} no período)\n\n`;
    if (itensVenda.length === 0) {
      md += `*Nenhum pedido de venda encontrado.*\n\n`;
    } else {
      md += `| Nº Venda | Data | Situação | Qtd | Total Item |\n`;
      md += `|:--------:|:----:|:--------:|:---:|:----------:|\n`;
      for (const iv of itensVenda) {
        const data = iv.data_venda ? String(iv.data_venda).slice(0, 10) : (iv.created_at ? String(iv.created_at).slice(0, 10) : "-");
        md += `| ${iv.numero_venda} | ${data} | ${esc(iv.situacao)} | ${iv.quantidade} | R$ ${Number(iv.total_item).toFixed(2)} |\n`;
      }
      md += `\n`;
    }

    // ── Ordens ──
    md += `#### 🔧 Ordens de Serviço/Produção (${itensOrdem.length} no período)\n\n`;
    if (itensOrdem.length === 0) {
      md += `*Nenhuma ordem de serviço encontrada.*\n\n`;
    } else {
      md += `| Nº Ordem | Data | Situação | Qtd | Tipo | Vinculada à Venda |\n`;
      md += `|:--------:|:----:|:--------:|:---:|:----:|:-----------------:|\n`;
      for (const io of itensOrdem) {
        const data = io.created_at ? String(io.created_at).slice(0, 10) : "-";
        const vinculo = io.venda_id ? `Venda #${io.venda_id}` : "-";
        md += `| ${io.numero_ordem} | ${data} | ${esc(io.situacao)} | ${io.quantidade} | ${esc(io.tipo_ordem ?? "-")} | ${vinculo} |\n`;
      }
      md += `\n`;
    }
  }

  // ═══════════════════════════════════════════════════════
  // ANÁLISE E OBSERVAÇÕES
  // ═══════════════════════════════════════════════════════
  md += `---\n\n`;
  md += `## 🔍 Análise e Observações\n\n`;

  // Produtos com saldo negativo ou zerado
  const semSaldo = linhasResumo.filter(l => l.saldoTotal <= 0);
  if (semSaldo.length > 0) {
    md += `### Produtos com Saldo Zero ou Negativo\n\n`;
    md += `${semSaldo.length} produto(s) estão com saldo \`<= 0\` em todos os locais:\n\n`;
    md += `| SKU | Produto | Saldo Total |\n`;
    md += `|-----|---------|:-----------:|\n`;
    for (const l of semSaldo) {
      md += `| \`${esc(l.prod.sku)}\` | ${esc(l.prod.nome.slice(0, 50))} | ${l.saldoTotal} |\n`;
    }
    md += `\n`;
  }

  // Produtos com maior movimentação (top 10)
  const topMov = [...linhasResumo].sort((a, b) => b.row.total_mov - a.row.total_mov).slice(0, 10);
  md += `### Top 10 — Produtos com Mais Movimentações\n\n`;
  md += `| SKU | Produto | Mov. | Entradas | Saídas | Vendas | OS |\n`;
  md += `|-----|---------|:----:|:--------:|:------:|:-----:|:--:|\n`;
  for (const l of topMov) {
    md += `| \`${esc(l.prod.sku)}\` | ${esc(l.prod.nome.slice(0, 45))} | ${l.row.total_mov} | ${l.row.total_entradas} | ${l.row.total_saidas} | ${l.vendas.total_vendas} | ${l.ordens.total_ordens} |\n`;
  }
  md += `\n`;

  // Produtos com vendas mas sem saída de estoque
  const vendasSemSaida = linhasResumo.filter(l => l.vendas.total_vendas > 0 && l.row.total_saidas === 0);
  if (vendasSemSaida.length > 0) {
    md += `### ⚠️ Produtos com Vendas mas SEM Saída de Estoque\n\n`;
    md += `Estes produtos têm pedidos de venda no período mas nenhuma movimentação de saída (possível divergência):\n\n`;
    md += `| SKU | Produto | Vendas | Qtd Vendida |\n`;
    md += `|-----|---------|:-----:|:-----------:|\n`;
    for (const l of vendasSemSaida) {
      md += `| \`${esc(l.prod.sku)}\` | ${esc(l.prod.nome.slice(0, 50))} | ${l.vendas.total_vendas} | ${l.vendas.qtd_vendida} |\n`;
    }
    md += `\n`;
  }

  // Estatísticas gerais
  md += `### Estatísticas Gerais\n\n`;
  const totalMov = linhasResumo.reduce((a, l) => a + l.row.total_mov, 0);
  const totalEnt = linhasResumo.reduce((a, l) => a + l.row.total_entradas, 0);
  const totalSai = linhasResumo.reduce((a, l) => a + l.row.total_saidas, 0);
  const totalVendas = linhasResumo.reduce((a, l) => a + l.vendas.total_vendas, 0);
  const totalQtdVendida = linhasResumo.reduce((a, l) => a + l.vendas.qtd_vendida, 0);
  const totalOrdens = linhasResumo.reduce((a, l) => a + l.ordens.total_ordens, 0);
  const totalSaldo = linhasResumo.reduce((a, l) => a + l.saldoTotal, 0);

  md += `| Indicador | Valor |\n`;
  md += `|-----------|:-----:|\n`;
  md += `| Total de movimentações no período | ${totalMov} |\n`;
  md += `| Total de entradas | ${totalEnt} |\n`;
  md += `| Total de saídas | ${totalSai} |\n`;
  md += `| Total de pedidos de venda | ${totalVendas} |\n`;
  md += `| Total de unidades vendidas | ${totalQtdVendida} |\n`;
  md += `| Total de ordens de serviço | ${totalOrdens} |\n`;
  md += `| Saldo físico total consolidado | ${totalSaldo} |\n`;
  md += `\n`;

  // Rodapé
  md += `---\n\n`;
  md += `*Relatório gerado automaticamente em ${DATA_GERACAO} às ${new Date().toLocaleTimeString("pt-BR")}.*\n`;

  // ═══════════════════════════════════════════════════════
  // 4. SALVAR ARQUIVO
  // ═══════════════════════════════════════════════════════
  fs.writeFileSync(OUTPUT_PATH, md, "utf-8");
  console.log(`\n✅ Relatório salvo em: ${OUTPUT_PATH}`);
  console.log(`   Tamanho: ${(Buffer.byteLength(md) / 1024).toFixed(1)} KB`);

  await sql.end();
}

main().catch(err => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
