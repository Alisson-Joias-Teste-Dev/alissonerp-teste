import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ItemPDF {
  nome: string; sku: string; quantidade: number;
  preco_lista: number; desconto_pct: number; preco_unitario: number; total: number;
}
export interface PagamentoPDF {
  forma: string; gateway?: string | null; parcelas: number; valor: number;
}
export interface OrcamentoPDF {
  numero_venda: string;
  cliente_nome: string;
  cliente_email?: string;
  cliente_telefone?: string;
  cliente_cpf_cnpj?: string;
  vendedor_nome?: string;
  endereco_entrega?: string;
  data_venda: string;
  data_entrega?: string;
  created_at?: string;
  total_produtos: number;
  total_desconto: number;
  total_frete: number;
  total_venda: number;
  forma_envio?: string;
  observacoes?: string;
  itens: ItemPDF[];
  pagamentos?: PagamentoPDF[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const VERDE = "#059669";
const VERDE_ESCURO = "#184036";
const VERDE_CLARO_BG = "#ECFDF5";
const CINZA = "#6B7280";
const CINZA_CLARO = "#F3F4F6";
const PRETO = "#111827";

function fmt(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return `${dt.toLocaleDateString("pt-BR")} às ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// ─── Generator (layout Ranyel) ───────────────────────────────────────────────
export function gerarPDFOrcamento(dados: OrcamentoPDF): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const mx = 15;
  const cw = pageW - mx * 2;
  let y = 15;

  // ── Logo ALISSON ───────────────────────────────────────────────────────────
  doc.setTextColor(VERDE_ESCURO);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("ALISSON", mx, y);
  doc.setFontSize(7);
  doc.text("\u00AE", mx + 38, y - 3); // ®

  y += 10;

  // ── Card verde claro: Pedido #XXXXX ────────────────────────────────────────
  doc.setFillColor(VERDE_CLARO_BG);
  doc.setDrawColor("#A7F3D0");
  doc.roundedRect(mx, y, cw, 20, 3, 3, "FD");

  doc.setTextColor(VERDE_ESCURO);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`Pedido #${dados.numero_venda}`, pageW / 2, y + 9, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(CINZA);
  doc.text(`Venda: ${fmtDate(dados.data_venda)}`, pageW / 2, y + 16, { align: "center" });

  y += 28;

  // ── Dados do Cliente + Vendedor (2 colunas) ────────────────────────────────
  const colW = (cw - 6) / 2;

  // Card Cliente
  doc.setDrawColor("#E5E7EB");
  doc.setFillColor("#FAFAFA");
  doc.roundedRect(mx, y, colW, 32, 2, 2, "FD");

  doc.setTextColor(PRETO);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Dados do Cliente", mx + 4, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#374151");
  let cy = y + 13;
  doc.text(dados.cliente_nome || "—", mx + 4, cy);
  cy += 5;
  if (dados.cliente_cpf_cnpj) { doc.setTextColor(CINZA); doc.text(`CPF/CNPJ: ${dados.cliente_cpf_cnpj}`, mx + 4, cy); cy += 4.5; }
  if (dados.cliente_telefone) { doc.setTextColor(CINZA); doc.text(dados.cliente_telefone, mx + 4, cy); cy += 4.5; }
  if (dados.cliente_email) { doc.setTextColor(CINZA); doc.text(dados.cliente_email, mx + 4, cy); }

  // Card Vendedor
  const vx = mx + colW + 6;
  doc.setDrawColor("#E5E7EB");
  doc.setFillColor("#FAFAFA");
  doc.roundedRect(vx, y, colW, 32, 2, 2, "FD");

  doc.setTextColor(PRETO);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Vendedor Responsável", vx + 4, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor("#374151");
  doc.text(dados.vendedor_nome || "—", vx + 4, y + 13);

  y += 38;

  // ── Endereço de entrega ────────────────────────────────────────────────────
  if (dados.endereco_entrega) {
    doc.setDrawColor("#E5E7EB");
    doc.line(mx, y, mx + cw, y);
    y += 6;
    doc.setTextColor(PRETO);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Endereço de Entrega", mx, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(CINZA);
    const endLines = doc.splitTextToSize(dados.endereco_entrega, cw);
    doc.text(endLines, mx, y);
    y += endLines.length * 4 + 4;
  }

  // ── Separador + Itens do Pedido ────────────────────────────────────────────
  doc.setDrawColor("#E5E7EB");
  doc.line(mx, y, mx + cw, y);
  y += 6;
  doc.setTextColor(PRETO);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Itens do Pedido", mx, y);
  y += 5;

  // Cards de itens (como Ranyel)
  for (const item of dados.itens) {
    if (y > 260) { doc.addPage(); y = 15; }

    doc.setDrawColor("#E5E7EB");
    doc.setFillColor("#FFFFFF");
    doc.roundedRect(mx, y, cw, 18, 2, 2, "FD");

    // Placeholder foto
    doc.setFillColor(CINZA_CLARO);
    doc.roundedRect(mx + 3, y + 2, 14, 14, 1, 1, "F");
    doc.setTextColor("#9CA3AF");
    doc.setFontSize(5);
    doc.text("Sem foto", mx + 5.5, y + 10);

    // Nome + SKU
    doc.setTextColor(PRETO);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    const nomeMax = doc.splitTextToSize(item.nome, cw - 70);
    doc.text(nomeMax[0], mx + 20, y + 7);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(CINZA);
    doc.text(`SKU: ${item.sku || "—"}`, mx + 20, y + 12);

    // Qtde x preço + total (direita)
    doc.setFontSize(7.5);
    doc.setTextColor(CINZA);
    doc.text(`${item.quantidade} UN x ${fmt(item.preco_unitario)}`, mx + cw - 4, y + 7, { align: "right" });
    doc.setTextColor(VERDE);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(fmt(item.total), mx + cw - 4, y + 13, { align: "right" });

    y += 21;
  }

  y += 4;

  // ── Resumo do Pedido (card verde claro) ────────────────────────────────────
  if (y > 240) { doc.addPage(); y = 15; }

  doc.setFillColor(VERDE_CLARO_BG);
  doc.setDrawColor("#A7F3D0");
  doc.roundedRect(mx, y, cw, 28, 2, 2, "FD");

  doc.setTextColor(PRETO);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Resumo do Pedido", mx + 4, y + 7);

  const cols = [
    { label: "Nº de itens", value: String(dados.itens.length) },
    { label: "Soma das qtdes", value: String(dados.itens.reduce((s, i) => s + i.quantidade, 0)) },
    { label: "Total produtos", value: fmt(dados.total_produtos) },
    { label: "Total do pedido", value: fmt(dados.total_venda), green: true },
  ];
  const colSpacing = cw / 4;
  for (let i = 0; i < cols.length; i++) {
    const cx = mx + 4 + i * colSpacing;
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(CINZA);
    doc.text(cols[i].label, cx, y + 14);
    doc.setFontSize(cols[i].green ? 11 : 9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(cols[i].green ? VERDE : PRETO);
    doc.text(cols[i].value, cx, y + 21);
  }

  y += 34;

  // ── Pagamento ──────────────────────────────────────────────────────────────
  if (dados.pagamentos && dados.pagamentos.length > 0) {
    if (y > 255) { doc.addPage(); y = 15; }
    doc.setDrawColor("#E5E7EB");
    doc.line(mx, y, mx + cw, y);
    y += 6;
    doc.setTextColor(PRETO);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Pagamento", mx, y);
    y += 6;

    for (const pag of dados.pagamentos) {
      const pagCols: { label: string; value: string }[] = [
        { label: "Forma", value: pag.forma },
      ];
      if (pag.gateway) pagCols.push({ label: "Gateway", value: pag.gateway });
      pagCols.push({ label: "Parcelas", value: `${pag.parcelas}x` });

      for (let i = 0; i < pagCols.length; i++) {
        const px = mx + i * 50;
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(CINZA);
        doc.text(pagCols[i].label, px, y);
        doc.setFontSize(8.5);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(PRETO);
        doc.text(pagCols[i].value, px, y + 5);
      }
      y += 12;
    }
  }

  // ── Observações ────────────────────────────────────────────────────────────
  if (dados.observacoes) {
    if (y > 250) { doc.addPage(); y = 15; }
    doc.setDrawColor("#E5E7EB");
    doc.line(mx, y, mx + cw, y);
    y += 6;
    doc.setTextColor(PRETO);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Observações", mx, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(CINZA);
    const obsLines = doc.splitTextToSize(dados.observacoes, cw);
    doc.text(obsLines, mx, y);
    y += obsLines.length * 4 + 4;
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setTextColor("#9CA3AF");
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Este documento foi gerado automaticamente pelo sistema Alisson Joias. Gerado em ${fmtDateTime(dados.created_at)}`,
    pageW / 2, pageH - 8, { align: "center" }
  );

  return doc;
}
