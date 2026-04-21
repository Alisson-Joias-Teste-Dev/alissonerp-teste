"use client";

import React, { useState, useEffect } from "react";
import { X, Tag, Loader2, FileText } from "lucide-react";
import { TableRow } from "@/lib/gestao-estoque/types";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PromotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (updates: Record<string, { basePrice?: number; promoPrice?: number }>) => void;
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

  // Detect columns
  const effectiveColumns = columns.length > 0 ? columns : (selectedItems.length > 0 ? Object.keys(selectedItems[0]) : []);
  
  const priceCol = effectiveColumns.find(c => /price|preco|valor|venda|amount/i.test(c)) || 'price';
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalUpdates: Record<string, { basePrice?: number; promoPrice?: number }> = {};
    
    const allIds = new Set([...Object.keys(basePrices), ...Object.keys(promoPrices)]);
    
    allIds.forEach((id) => {
      const baseVal = parseFloat(basePrices[id]);
      const promoVal = parseFloat(promoPrices[id]);
      
      const update: { basePrice?: number; promoPrice?: number } = {};
      if (!isNaN(baseVal)) update.basePrice = baseVal;
      if (!isNaN(promoVal)) update.promoPrice = promoVal;
      
      if (Object.keys(update).length > 0) {
        finalUpdates[id] = update;
      }
    });

    if (Object.keys(finalUpdates).length > 0) {
      onConfirm(finalUpdates);
    }
  };

  const formatCurrency = (val: any) => {
    const num = parseFloat(val);
    if (isNaN(num)) return val;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(18);
    doc.text('Lista de Preços Promocionais - ALISSON', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);
    
    const tableRows = selectedItems.map((item, idx) => {
      const id = String(item[pkCol] || idx);
      const name = String(item[nameCol] || `Item #${idx + 1}`);
      const sku = skuCol ? String(item[skuCol] || '-') : '-';
      const stockInfo = stockCol ? String(item[stockCol] || '0') : '-';
      const weightInfo = weightCol ? `${item[weightCol]}g` : '-';
      const base = basePrices[id] ? formatCurrency(basePrices[id]) : formatCurrency(item[priceCol]);
      const promo = promoPrices[id] ? formatCurrency(promoPrices[id]) : 'Sem alteração';
      
      return [sku, name, stockInfo, weightInfo, base, promo];
    });

    autoTable(doc, {
      startY: 40,
      head: [['SKU', 'Produto', 'Qtd', 'Peso', 'Preço Original', 'Preço Promocional']],
      body: tableRows,
      theme: 'grid',
      headStyles: { fillColor: [212, 175, 55], textColor: [0, 0, 0] }, // Alisson Gold
      styles: { fontSize: 9 },
    });

    doc.save(`promocao_alisson_${new Date().getTime()}.pdf`);
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
              onClick={handleExportPDF}
              className="flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-alisson-gold border border-alisson-gold/20 hover:bg-alisson-gold/10 transition-all flex items-center justify-center gap-2"
            >
              <FileText size={16} />
              Exportar PDF
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
