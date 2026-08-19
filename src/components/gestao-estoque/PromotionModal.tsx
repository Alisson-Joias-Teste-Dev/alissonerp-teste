"use client";

import React, { useState, useEffect } from "react";
import { X, Tag, Loader2, BookOpen } from "lucide-react";
import { TableRow } from "@/lib/gestao-estoque/types";
import jsPDF from 'jspdf';

// ── Identidade visual Alisson ──
const COLOR_ESMERALDA = [24, 64, 54] as const;        // #184036
const COLOR_DOURADO   = [219, 152, 100] as const;     // #DB9864
const COLOR_DOURADO_LIGHT = [254, 221, 180] as const; // #FEDDB4
const COLOR_CREME     = [250, 250, 247] as const;     // #FAFAF7
const COLOR_TEXT      = [26, 26, 26] as const;        // #1A1A1A
const COLOR_GRAY      = [120, 120, 120] as const;

// Carrega imagem via proxy server-side (resolve CORS) e converte em dataURL
// Retorna null se falhar (404 etc) — caller faz fallback visual
async function imageUrlToDataUrl(url: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' } | null> {
  try {
    // Usa proxy server-side: o S3 do Tiny nao permite CORS direto no browser
    const proxied = `/api/gestao-estoque/imagem-proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxied);
    if (!res.ok) return null;
    const blob = await res.blob();
    const isPng = blob.type.includes('png') || url.toLowerCase().endsWith('.png');
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ dataUrl: reader.result as string, format: isPng ? 'PNG' : 'JPEG' });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export interface PromotionItemPayload {
  produto_id: number;
  preco_promo: number;
}

export interface PromotionConflito {
  produto_id: number;
  sku: string | null;
  nome: string | null;
  promocao_id: number;
  nome_campanha: string;
  data_inicio: string;
  data_fim: string;
}

interface PromotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Submete a campanha. Retorna null em sucesso ou a lista de conflitos (409).
   * O caller eh quem fala com /api/promocoes pra manter a logica de upload no client.
   */
  onConfirm: (payload: {
    nome_campanha: string;
    data_inicio: string;
    data_fim: string;
    itens: PromotionItemPayload[];
  }) => Promise<PromotionConflito[] | null>;
  selectedItems: TableRow[];
  columns: string[];
  loading?: boolean;
}

const PromotionModal: React.FC<PromotionModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  selectedItems,
  columns,
  loading = false
}) => {
  const [basePrices, setBasePrices] = useState<Record<string, string>>({});
  const [promoPrices, setPromoPrices] = useState<Record<string, string>>({});
  const [bulkValue, setBulkValue] = useState<string>('');
  const [bulkType, setBulkType] = useState<'discount' | 'markup'>('discount');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });
  const [nomeCampanha, setNomeCampanha] = useState<string>('');
  const [dataInicio, setDataInicio] = useState<string>('');
  const [dataFim, setDataFim] = useState<string>('');
  const [conflitos, setConflitos] = useState<PromotionConflito[] | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Detect columns
  const effectiveColumns = columns.length > 0 ? columns : (selectedItems.length > 0 ? Object.keys(selectedItems[0]) : []);
  
  const priceCol = effectiveColumns.find(c => c === 'preco_curva') ||
                   effectiveColumns.find(c => /price|preco|valor|venda|amount/i.test(c)) || 'price';
  const nameCol = effectiveColumns.find(c => /name|nome|title|titulo|desc/i.test(c)) || effectiveColumns[0];
  const skuCol = effectiveColumns.find(c => /sku|code|referencia|ref/i.test(c));
  const pkCol = effectiveColumns.find(c => /id|uuid|code|pk/i.test(c)) || 'id';
  const stockCol = effectiveColumns.find(c => (/qty|quantity|quantidade|items|itens|stock|estoque/i.test(c)) && !/min|max|alert|security|seguranca/i.test(c));
  const weightCol = effectiveColumns.find(c => /peso_precificado|priced_weight/i.test(c)) || effectiveColumns.find(c => /weight|peso|gramas|mass/i.test(c));

  useEffect(() => {
    if (isOpen) {
      const initialBase: Record<string, string> = {};
      const initialPromo: Record<string, string> = {};

      selectedItems.forEach((item, idx) => {
        const id = String(item[pkCol] || idx);
        const val = item[priceCol];
        initialBase[id] = (val !== null && val !== undefined) ? String(val) : '';
        initialPromo[id] = '';
      });

      setBasePrices(initialBase);
      setPromoPrices(initialPromo);
      setConflitos(null);
      setSubmitError(null);
      // Datas default: hoje -> +7 dias
      const hoje = new Date();
      const fim = new Date(hoje); fim.setDate(fim.getDate() + 7);
      setDataInicio(hoje.toISOString().slice(0, 10));
      setDataFim(fim.toISOString().slice(0, 10));
      setNomeCampanha('');
    }
  }, [isOpen, selectedItems, pkCol, priceCol]);

  if (!isOpen) return null;

  const handleBaseChange = (id: string, value: string) => {
    setBasePrices(prev => ({ ...prev, [id]: value }));
  };

  const handlePromoChange = (id: string, value: string) => {
    setPromoPrices(prev => ({ ...prev, [id]: value }));
  };

  const applyBulkAction = () => {
    const percent = parseFloat(bulkValue);
    if (isNaN(percent)) return;

    if (bulkType === 'markup') {
      const newBasePrices = { ...basePrices };
      selectedItems.forEach((item, idx) => {
        const id = String(item[pkCol] || idx);
        const currentBase = parseFloat(basePrices[id]);
        if (!isNaN(currentBase)) {
          const finalPrice = (currentBase * (1 + percent / 100)).toFixed(2);
          newBasePrices[id] = finalPrice;
        }
      });
      setBasePrices(newBasePrices);
    } else {
      const newPromoPrices = { ...promoPrices };
      selectedItems.forEach((item, idx) => {
        const id = String(item[pkCol] || idx);
        const currentBase = parseFloat(basePrices[id]);
        if (!isNaN(currentBase)) {
          const finalPrice = (currentBase * (1 - percent / 100)).toFixed(2);
          newPromoPrices[id] = finalPrice;
        }
      });
      setPromoPrices(newPromoPrices);
    }
  };

  const removerConflitantes = () => {
    if (!conflitos) return;
    const idsRemover = new Set(conflitos.map(c => String(c.produto_id)));
    setPromoPrices(prev => {
      const next = { ...prev };
      idsRemover.forEach(id => { delete next[id]; });
      return next;
    });
    setConflitos(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setConflitos(null);

    if (!nomeCampanha.trim()) { setSubmitError('Informe o nome da campanha'); return; }
    if (!dataInicio || !dataFim) { setSubmitError('Datas obrigatorias'); return; }
    if (dataFim < dataInicio) { setSubmitError('data_fim deve ser >= data_inicio'); return; }

    const itens: PromotionItemPayload[] = [];
    Object.entries(promoPrices).forEach(([id, raw]) => {
      const v = parseFloat(raw);
      // v > 0: preco promocional ZERO dava peca de graca na loja se a API
      // nao barrasse (dinheiro — validar no client tambem)
      if (!Number.isFinite(v) || v <= 0) return;
      const produtoId = Number(id);
      if (!Number.isFinite(produtoId)) return;
      itens.push({ produto_id: produtoId, preco_promo: v });
    });

    if (itens.length === 0) {
      setSubmitError('Defina o preco promocional de ao menos 1 item');
      return;
    }

    const conf = await onConfirm({
      nome_campanha: nomeCampanha.trim(),
      data_inicio: dataInicio,
      data_fim: dataFim,
      itens,
    });
    if (conf && conf.length > 0) {
      setConflitos(conf);
    }
  };

  const formatCurrency = (val: any) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  const handleExportCatalog = async () => {
    if (selectedItems.length === 0) return;
    setExportLoading(true);
    setExportProgress({ current: 0, total: selectedItems.length });
    // try/finally: estouro de memoria do jsPDF (catalogo grande no celular)
    // deixava o botao preso em 'Gerando...' pra sempre
    try {

    // 1. Pre-fetch das imagens em paralelo (com progress)
    const imageField = (item: TableRow): string | null => {
      const candidates = ['imagem_capa', 'imagem', 'url_drive', 'foto', 'image'];
      for (const c of candidates) {
        const v = item[c];
        if (typeof v === 'string' && v.startsWith('http')) return v;
      }
      return null;
    };
    let done = 0;
    const images = await Promise.all(selectedItems.map(async (item) => {
      const url = imageField(item);
      const result = url ? await imageUrlToDataUrl(url) : null;
      done++;
      setExportProgress({ current: done, total: selectedItems.length });
      return result;
    }));

    // 2. Cria documento A4 retrato
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const PW = 210; // page width
    const PH = 297; // page height

    // ── CAPA ──
    // Background creme
    doc.setFillColor(...COLOR_CREME);
    doc.rect(0, 0, PW, PH, 'F');

    // Faixa esmeralda no topo (header)
    doc.setFillColor(...COLOR_ESMERALDA);
    doc.rect(0, 0, PW, 65, 'F');

    // Linha dourada decorativa
    doc.setFillColor(...COLOR_DOURADO);
    doc.rect(0, 65, PW, 2, 'F');

    // Logo "ALISSON" em serif (helvetica é o que jsPDF tem nativo)
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.text('ALISSON', PW / 2, 32, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLOR_DOURADO_LIGHT);
    doc.text('J O A L H E R I A   ·   F A B R I C A   D E   E X C E L Ê N C I A', PW / 2, 42, { align: 'center' });

    // Título do catálogo
    doc.setTextColor(...COLOR_ESMERALDA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.text('Catálogo de Promoções', PW / 2, 110, { align: 'center' });

    doc.setDrawColor(...COLOR_DOURADO);
    doc.setLineWidth(0.5);
    doc.line(PW / 2 - 30, 116, PW / 2 + 30, 116);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...COLOR_GRAY);
    doc.text(`${selectedItems.length} ${selectedItems.length === 1 ? 'peça selecionada' : 'peças selecionadas'}`, PW / 2, 128, { align: 'center' });

    const dataStr = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(dataStr, PW / 2, 135, { align: 'center' });

    // Box de chamada no centro
    doc.setFillColor(...COLOR_ESMERALDA);
    doc.roundedRect(40, 165, PW - 80, 50, 4, 4, 'F');
    doc.setTextColor(...COLOR_DOURADO_LIGHT);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('OFERTAS ESPECIAIS', PW / 2, 180, { align: 'center' });
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text('Peças selecionadas com preços', PW / 2, 192, { align: 'center' });
    doc.text('exclusivos por tempo limitado', PW / 2, 201, { align: 'center' });

    // Footer da capa
    doc.setTextColor(...COLOR_GRAY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Documento gerado pelo sistema Alisson ERP', PW / 2, PH - 15, { align: 'center' });

    // ── PÁGINAS DE PRODUTOS ──
    // Layout: 2 colunas × 3 linhas = 6 produtos por página
    // Card: largura 87mm × altura 78mm
    const COLS = 2;
    const ROWS = 3;
    const PER_PAGE = COLS * ROWS;
    const MARGIN_X = 12;
    const MARGIN_Y_TOP = 30;
    const CARD_W = 90;
    const CARD_H = 80;
    const GAP = 4;

    selectedItems.forEach((item, idx) => {
      const inPage = idx % PER_PAGE;
      if (inPage === 0) {
        doc.addPage();
        // Background creme
        doc.setFillColor(...COLOR_CREME);
        doc.rect(0, 0, PW, PH, 'F');
        // Header da página
        doc.setFillColor(...COLOR_ESMERALDA);
        doc.rect(0, 0, PW, 18, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('ALISSON', MARGIN_X, 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_DOURADO_LIGHT);
        doc.text('Catálogo de Promoções', MARGIN_X, 15);
        const pageNum = Math.floor(idx / PER_PAGE) + 1;
        const totalPages = Math.ceil(selectedItems.length / PER_PAGE);
        doc.setTextColor(...COLOR_DOURADO_LIGHT);
        doc.setFontSize(9);
        doc.text(`Página ${pageNum} de ${totalPages}`, PW - MARGIN_X, 11, { align: 'right' });
        // Linha dourada
        doc.setFillColor(...COLOR_DOURADO);
        doc.rect(0, 18, PW, 0.8, 'F');
      }

      const col = inPage % COLS;
      const row = Math.floor(inPage / COLS);
      const x = MARGIN_X + col * (CARD_W + GAP);
      const y = MARGIN_Y_TOP + row * (CARD_H + GAP);

      // Card background branco com borda esmeralda
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...COLOR_ESMERALDA);
      doc.setLineWidth(0.3);
      doc.roundedRect(x, y, CARD_W, CARD_H, 2, 2, 'FD');

      // Imagem (se carregou)
      const imgData = images[idx];
      const IMG_W = 38;
      const IMG_H = 38;
      const IMG_X = x + (CARD_W - IMG_W) / 2;
      const IMG_Y = y + 4;
      if (imgData) {
        try {
          doc.addImage(imgData.dataUrl, imgData.format, IMG_X, IMG_Y, IMG_W, IMG_H, undefined, 'FAST');
        } catch {
          // fallback
          doc.setFillColor(245, 245, 240);
          doc.rect(IMG_X, IMG_Y, IMG_W, IMG_H, 'F');
        }
      } else {
        // Placeholder cinza estilizado com selo Alisson (sem caracteres especiais
        // pois a fonte Helvetica padrao do jsPDF nao tem ◆/diamantes etc)
        doc.setFillColor(245, 243, 238);
        doc.rect(IMG_X, IMG_Y, IMG_W, IMG_H, 'F');
        // Borda interna decorativa
        doc.setDrawColor(...COLOR_DOURADO);
        doc.setLineWidth(0.3);
        doc.rect(IMG_X + 2, IMG_Y + 2, IMG_W - 4, IMG_H - 4);
        // Texto "ALISSON" centralizado
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...COLOR_DOURADO);
        doc.text('ALISSON', IMG_X + IMG_W / 2, IMG_Y + IMG_H / 2 - 1, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6);
        doc.setTextColor(...COLOR_GRAY);
        doc.text('SEM IMAGEM', IMG_X + IMG_W / 2, IMG_Y + IMG_H / 2 + 4, { align: 'center' });
      }

      // SKU pequeno acima do nome
      const id = String(item[pkCol] || idx);
      const sku = skuCol ? String(item[skuCol] || '') : '';
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...COLOR_DOURADO);
      if (sku) doc.text(sku.toUpperCase(), x + CARD_W / 2, IMG_Y + IMG_H + 4, { align: 'center' });

      // Nome (max 2 linhas)
      const name = String(item[nameCol] || `Item #${idx + 1}`);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...COLOR_TEXT);
      const nameLines = doc.splitTextToSize(name, CARD_W - 6) as string[];
      const truncated = nameLines.slice(0, 2);
      truncated.forEach((line, li) => {
        doc.text(line, x + CARD_W / 2, IMG_Y + IMG_H + 9 + li * 4, { align: 'center' });
      });

      // Linha divisória dourada
      doc.setDrawColor(...COLOR_DOURADO);
      doc.setLineWidth(0.2);
      doc.line(x + CARD_W / 2 - 15, y + CARD_H - 22, x + CARD_W / 2 + 15, y + CARD_H - 22);

      // Preços
      const baseRaw = basePrices[id] || item[priceCol];
      const promoRaw = promoPrices[id];
      const baseNum = parseFloat(String(baseRaw));
      const promoNum = parseFloat(String(promoRaw));
      const hasPromo = !isNaN(promoNum) && promoNum > 0 && promoNum !== baseNum;
      const finalPrice = hasPromo ? promoNum : (isNaN(baseNum) ? null : baseNum);

      // DE: (tachado) — só se tem promo válido
      if (hasPromo && !isNaN(baseNum)) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...COLOR_GRAY);
        const deTxt = `DE  ${formatCurrency(baseNum)}`;
        const deW = doc.getTextWidth(deTxt);
        const deX = x + CARD_W / 2;
        doc.text(deTxt, deX, y + CARD_H - 16, { align: 'center' });
        // Risco horizontal
        doc.setDrawColor(...COLOR_GRAY);
        doc.setLineWidth(0.25);
        doc.line(deX - deW / 2, y + CARD_H - 17, deX + deW / 2, y + CARD_H - 17);
      }

      // POR: grande e dourado
      if (finalPrice !== null) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...COLOR_ESMERALDA);
        const porTxt = formatCurrency(finalPrice);
        doc.text(porTxt, x + CARD_W / 2, y + CARD_H - 8, { align: 'center' });

        if (hasPromo && !isNaN(baseNum) && baseNum > 0) {
          const economiaPct = Math.round(((baseNum - promoNum) / baseNum) * 100);
          if (economiaPct > 0 && economiaPct < 100) {
            // Badge de economia no canto superior direito do card
            const badgeW = 22;
            const badgeH = 8;
            doc.setFillColor(...COLOR_DOURADO);
            doc.roundedRect(x + CARD_W - badgeW - 2, y + 2, badgeW, badgeH, 1.5, 1.5, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.text(`-${economiaPct}%`, x + CARD_W - badgeW / 2 - 2, y + 7.5, { align: 'center' });
          }
        }
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(...COLOR_GRAY);
        doc.text('Sob consulta', x + CARD_W / 2, y + CARD_H - 8, { align: 'center' });
      }

      // Stock + peso (rodapé do card)
      const stock = stockCol ? item[stockCol] : null;
      const weight = weightCol ? item[weightCol] : null;
      const meta: string[] = [];
      if (stock !== null && stock !== undefined && stock !== '') meta.push(`${stock} un`);
      if (weight !== null && weight !== undefined && weight !== '') meta.push(`${weight}g`);
      if (meta.length > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...COLOR_GRAY);
        doc.text(meta.join(' · '), x + CARD_W / 2, y + CARD_H - 2, { align: 'center' });
      }
    });

    // Footer da última página com data
    const totalPages = doc.getNumberOfPages();
    for (let p = 2; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFillColor(...COLOR_DOURADO);
      doc.rect(0, PH - 8, PW, 0.5, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...COLOR_GRAY);
      doc.text(`Catálogo gerado em ${new Date().toLocaleDateString('pt-BR')} · Alisson ERP`, PW / 2, PH - 4, { align: 'center' });
    }

    doc.save(`catalogo_alisson_${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExportLoading(false);
      setExportProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-2xl bg-white border border-alisson-gold/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-creme-200 bg-white/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-alisson-gold/10 flex items-center justify-center text-alisson-gold">
              <Tag size={20} />
            </div>
            <div>
              <h3 className="text-lg font-serif text-gray-900 tracking-wide">Definir Preços Promocionais</h3>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
                {selectedItems.length} Itens Selecionados
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-900 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          {/* Cabecalho da campanha: nome + janela */}
          <div className="px-6 py-4 bg-white border-b border-creme-200 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Nome da Campanha</label>
              <input
                type="text"
                value={nomeCampanha}
                onChange={(e) => setNomeCampanha(e.target.value)}
                maxLength={200}
                placeholder="Ex: Dia das Maes 2026"
                className="mt-1 w-full bg-white border border-creme-200 rounded-lg py-2 px-3 text-xs text-gray-900 focus:outline-none focus:border-alisson-gold/50"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Inicio</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="mt-1 w-full bg-white border border-creme-200 rounded-lg py-2 px-3 text-xs text-gray-900 focus:outline-none focus:border-alisson-gold/50"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="mt-1 w-full bg-white border border-creme-200 rounded-lg py-2 px-3 text-xs text-gray-900 focus:outline-none focus:border-alisson-gold/50"
              />
            </div>
          </div>

          {(submitError || (conflitos && conflitos.length > 0)) && (
            <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-xs text-red-700">
              {submitError && <p className="font-semibold mb-1">{submitError}</p>}
              {conflitos && conflitos.length > 0 && (
                <div>
                  <p className="font-semibold mb-1">
                    {conflitos.length} produto(s) ja em outra promocao nessa janela:
                  </p>
                  <ul className="space-y-0.5 max-h-24 overflow-y-auto">
                    {conflitos.map(c => (
                      <li key={`${c.produto_id}-${c.promocao_id}`}>
                        <span className="font-mono">{c.sku ?? c.produto_id}</span>: ja em &quot;{c.nome_campanha}&quot; ({c.data_inicio.slice(0,10)} - {c.data_fim.slice(0,10)})
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={removerConflitantes}
                    className="mt-2 px-3 py-1 text-[10px] font-bold uppercase tracking-widest bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Remover conflitantes
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Bulk Actions Header */}
          <div className="px-6 py-4 bg-creme-50 border-b border-creme-200 flex flex-col md:flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Ação em Lote:</span>
              <div className="flex bg-white/80 rounded-lg p-1 border border-creme-200">
                <button
                  type="button"
                  onClick={() => setBulkType('discount')}
                  className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${bulkType === 'discount' ? 'bg-red-500/20 text-red-400' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Desconto (POR)
                </button>
                <button
                  type="button"
                  onClick={() => setBulkType('markup')}
                  className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all ${bulkType === 'markup' ? 'bg-green-500/20 text-green-400' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  Aumento (DE)
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 w-full md:w-auto">
              <div className="relative flex-1 md:max-w-[120px]">
                <input
                  type="number"
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder="0"
                  className="w-full bg-white/80 border border-creme-200 rounded-lg py-2 pl-3 pr-8 text-xs text-gray-900 focus:outline-none focus:border-alisson-gold/50 transition-all placeholder-gray-700"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-600">%</span>
              </div>
              <button
                type="button"
                onClick={applyBulkAction}
                disabled={!bulkValue}
                className="px-4 py-2 bg-alisson-gold/10 border border-alisson-gold/20 text-alisson-gold text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-alisson-gold hover:text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Aplicar em Todos
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
            <div className="grid grid-cols-12 gap-4 px-2 mb-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest sticky top-0 bg-white z-10 py-2">
              <div className="col-span-6">Produto</div>
              <div className="col-span-3 text-center">DE (Atual)</div>
              <div className="col-span-3 text-center">POR (Novo)</div>
            </div>
            
            {selectedItems.map((item, idx) => {
              const id = String(item[pkCol] || idx);
              const name = item[nameCol] || `Item #${idx + 1}`;
              const sku = skuCol ? item[skuCol] : null;
              const stock = stockCol ? item[stockCol] : null;
              const weight = weightCol ? item[weightCol] : null;
              const originalPrice = parseFloat(item[priceCol]);

              return (
                <div key={id} className="grid grid-cols-12 gap-4 items-center p-3 bg-creme-50 rounded-xl border border-creme-200 hover:border-creme-200 transition-colors group">
                  <div className="col-span-6">
                    <div className="flex flex-col">
                      <p className="text-sm text-gray-700 truncate font-medium" title={String(name)}>
                        {String(name)}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {sku && (
                          <span className="text-[10px] bg-alisson-gold/10 text-alisson-gold px-1.5 py-0.5 rounded border border-alisson-gold/20 font-mono">
                            {String(sku)}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-600 font-mono">ID: {id}</span>
                        {/* New Info: Stock & Weight */}
                        {stock !== null && stock !== undefined && (
                          <span className="text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded border border-blue-500/20 font-mono" title="Quantidade em Estoque">
                            {String(stock)} un.
                          </span>
                        )}
                        {weight !== null && weight !== undefined && (
                          <span className="text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/20 font-mono" title="Peso">
                            {String(weight)}g
                          </span>
                        )}
                        {!isNaN(originalPrice) && (
                          <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded border border-green-500/20 font-mono" title="Preço Custo/Original">
                            Custo: {formatCurrency(originalPrice)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-span-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-600">
                        <span className="text-[10px] font-bold">R$</span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        value={basePrices[id] || ''}
                        onChange={(e) => handleBaseChange(id, e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-white/80 border border-creme-200 rounded-lg py-2 pl-8 pr-3 text-xs text-gray-600 focus:outline-none focus:border-white/30 transition-all placeholder-gray-700"
                      />
                    </div>
                  </div>
                  
                  <div className="col-span-3">
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-600">
                        <span className="text-[10px] font-bold">R$</span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        value={promoPrices[id] || ''}
                        onChange={(e) => handlePromoChange(id, e.target.value)}
                        placeholder="0,00"
                        className="w-full bg-white/80 border border-creme-200 rounded-lg py-2 pl-8 pr-3 text-xs text-alisson-gold focus:outline-none focus:border-alisson-gold/50 transition-all placeholder-gray-700"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-6 border-t border-creme-200 bg-white/80 flex gap-3">
            <button
              type="button"
              onClick={handleExportCatalog}
              disabled={exportLoading || selectedItems.length === 0}
              className="flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-alisson-gold border border-alisson-gold/20 hover:bg-alisson-gold/10 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Gerar PDF estilizado com identidade Alisson"
            >
              {exportLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {exportProgress.total > 0 ? `Carregando ${exportProgress.current}/${exportProgress.total}...` : 'Gerando...'}
                </>
              ) : (
                <>
                  <BookOpen size={16} />
                  Gerar Catálogo
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-gray-600 hover:text-gray-900 hover:bg-creme-50 transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || (Object.keys(basePrices).length === 0 && Object.keys(promoPrices).length === 0)}
              className="flex-1 py-3 rounded-xl bg-alisson-gold text-black text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-alisson-gold/10 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Tag size={16} />
                  Aplicar Preços
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PromotionModal;
