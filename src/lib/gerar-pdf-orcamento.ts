import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ItemPDF {
  nome: string;
  sku: string;
  quantidade: number;
  preco_lista: number;
  desconto_pct: number;
  preco_unitario: number;
  total: number;
}

export interface OrcamentoPDF {
  numero_venda: string;
  cliente_nome: string;
  cliente_email?: string;
  cliente_telefone?: string;
  cliente_cpf_cnpj?: string;
  data_venda: string;
  data_entrega?: string;
  total_produtos: number;
  total_desconto: number;
  total_frete: number;
  total_venda: number;
  forma_envio?: string;
  observacoes?: string;
  itens: ItemPDF[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const COR_VERDE = "#184036";
const COR_CREME = "#F3EADA";

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// ─── Generator ────────────────────────────────────────────────────────────────
export function gerarPDFOrcamento(dados: OrcamentoPDF): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 15;
  const contentW = pageW - marginX * 2;
  let y = 15;

  // ── Header bar ──────────────────────────────────────────────────────────────
  doc.setFillColor(COR_VERDE);
  doc.rect(0, 0, pageW, 32, "F");

  doc.setTextColor("#FFFFFF");
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("ALISSON", marginX, 14);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Joalheria & Fábrica", marginX, 20);

  // Número do orçamento (direita)
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(`Orçamento ${dados.numero_venda}`, pageW - marginX, 14, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Data: ${fmtDate(dados.data_venda)}`, pageW - marginX, 20, { align: "right" });
  if (dados.data_entrega) {
    doc.text(`Entrega: ${fmtDate(dados.data_entrega)}`, pageW - marginX, 25, { align: "right" });
  }

  y = 40;

  // ── Cliente ─────────────────────────────────────────────────────────────────
  doc.setFillColor(COR_CREME);
  doc.roundedRect(marginX, y, contentW, 22, 2, 2, "F");

  doc.setTextColor(COR_VERDE);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("CLIENTE", marginX + 4, y + 6);

  doc.setTextColor("#374151");
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(dados.cliente_nome || "Sem cliente", marginX + 4, y + 13);

  const infoCliente: string[] = [];
  if (dados.cliente_cpf_cnpj) infoCliente.push(dados.cliente_cpf_cnpj);
  if (dados.cliente_telefone) infoCliente.push(dados.cliente_telefone);
  if (dados.cliente_email) infoCliente.push(dados.cliente_email);
  if (infoCliente.length > 0) {
    doc.setFontSize(8);
    doc.setTextColor("#6B7280");
    doc.text(infoCliente.join("  ·  "), marginX + 4, y + 19);
  }

  y += 28;

  // ── Tabela de itens ─────────────────────────────────────────────────────────
  const tableBody = dados.itens.map((item) => [
    item.nome,
    item.sku || "—",
    String(item.quantidade),
    fmt(item.preco_lista),
    item.desconto_pct > 0 ? `${item.desconto_pct.toFixed(1)}%` : "—",
    fmt(item.preco_unitario),
    fmt(item.total),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Produto", "SKU", "Qtd", "Preço Lista", "Desc.", "Preço Unit.", "Total"]],
    body: tableBody,
    headStyles: {
      fillColor: COR_VERDE,
      textColor: "#FFFFFF",
      fontSize: 8,
      fontStyle: "bold",
      halign: "left",
    },
    bodyStyles: {
      fontSize: 8,
      textColor: "#374151",
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 12, halign: "center" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 26, halign: "right" },
      6: { cellWidth: 26, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: {
      fillColor: "#F9FAFB",
    },
    theme: "grid",
    styles: {
      lineColor: "#E5E7EB",
      lineWidth: 0.3,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable?.finalY ?? y + 40;
  y += 8;

  // ── Totais ──────────────────────────────────────────────────────────────────
  const totaisX = pageW - marginX - 65;
  const totaisW = 65;

  const linhas: { label: string; valor: string; bold?: boolean }[] = [
    { label: "Subtotal", valor: fmt(dados.total_produtos) },
  ];
  if (dados.total_desconto > 0) {
    linhas.push({ label: "Desconto", valor: `- ${fmt(dados.total_desconto)}` });
  }
  if (dados.total_frete > 0) {
    linhas.push({ label: "Frete", valor: fmt(dados.total_frete) });
  }
  linhas.push({ label: "TOTAL", valor: fmt(dados.total_venda), bold: true });

  for (const linha of linhas) {
    if (linha.bold) {
      doc.setFillColor(COR_VERDE);
      doc.roundedRect(totaisX - 2, y - 4, totaisW + 4, 10, 1, 1, "F");
      doc.setTextColor("#FFFFFF");
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
    } else {
      doc.setTextColor("#6B7280");
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
    }
    doc.text(linha.label, totaisX, y);
    doc.text(linha.valor, totaisX + totaisW, y, { align: "right" });
    y += linha.bold ? 12 : 7;
  }

  // ── Forma de envio ──────────────────────────────────────────────────────────
  if (dados.forma_envio) {
    doc.setTextColor("#6B7280");
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Forma de envio: ${dados.forma_envio}`, marginX, y);
    y += 6;
  }

  // ── Observações ─────────────────────────────────────────────────────────────
  if (dados.observacoes) {
    y += 4;
    doc.setFillColor(COR_CREME);
    const obsLines = doc.splitTextToSize(dados.observacoes, contentW - 8);
    const obsH = Math.max(obsLines.length * 4.5 + 10, 16);
    doc.roundedRect(marginX, y, contentW, obsH, 2, 2, "F");

    doc.setTextColor(COR_VERDE);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("OBSERVAÇÕES", marginX + 4, y + 6);

    doc.setTextColor("#374151");
    doc.setFont("helvetica", "normal");
    doc.text(obsLines, marginX + 4, y + 12);
    y += obsH + 4;
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setDrawColor("#E5E7EB");
  doc.line(marginX, pageH - 15, pageW - marginX, pageH - 15);
  doc.setTextColor("#9CA3AF");
  doc.setFontSize(7);
  doc.text(
    "Este orçamento é válido por 7 dias. Valores sujeitos a alteração sem aviso prévio.",
    pageW / 2,
    pageH - 10,
    { align: "center" },
  );

  return doc;
}
