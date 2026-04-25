"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Sliders, Save, Plus, Trash2, Cloud, Send, Loader2, LogOut, Percent,
  Table as TableIcon, Coins, TrendingUp, Scale, ChevronDown, Calculator,
  Maximize2, Minimize2, ArrowRightLeft,
} from "lucide-react";
import type { Category } from "@/types/precificacao";
import { prepareCategories, getPricingFactors, formatCurrency } from "@/lib/precificacao/pricing";
import { getWebhookUrl, saveWebhookUrl } from "@/lib/precificacao/storage";

interface ConfigurationTabProps {
  goldPrice: string;
  startMkp: number;
  setStartMkp: (val: number) => void;
  startCommission: number;
  setStartCommission: (val: number) => void;
  goldCostPercentage: number;
  setGoldCostPercentage: (val: number) => void;
  purchaseMin: number;
  setPurchaseMin: (val: number) => void;
  purchaseMax: number;
  setPurchaseMax: (val: number) => void;
  purchaseCommSplit: number;
  setPurchaseCommSplit: (val: number) => void;
  receiveMin?: number;
  setReceiveMin?: (val: number) => void;
  receiveMax?: number;
  setReceiveMax?: (val: number) => void;
  categories: Category[];
  setCategories: (cats: Category[]) => void;
  onSave: () => void;
  onDeleteCategory: (index: number) => void;
  onAddCategory: () => void;
  onOpenSync: () => void;
  onClose?: () => void;
  onShowToast: (msg: string, type: "success" | "error" | "info") => void;
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
}

const ConfigurationTab: React.FC<ConfigurationTabProps> = ({
  goldPrice, startMkp, setStartMkp, startCommission, setStartCommission,
  goldCostPercentage, setGoldCostPercentage,
  purchaseMin, setPurchaseMin, purchaseMax, setPurchaseMax,
  purchaseCommSplit, setPurchaseCommSplit,
  receiveMin, setReceiveMin, receiveMax, setReceiveMax,
  categories, setCategories,
  onSave, onDeleteCategory, onAddCategory, onOpenSync, onClose, onShowToast,
  isFullScreen = false, onToggleFullScreen,
}) => {
  const [webhookUrl, setWebhookUrl] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState<number | null>(null);

  const [simWeight, setSimWeight] = useState<string>("1");
  const [simMkp, setSimMkp] = useState<string>("");
  const [simCategoryIdx, setSimCategoryIdx] = useState<string>("");

  useEffect(() => {
    setWebhookUrl(getWebhookUrl());
  }, []);

  const handleCategoryChange = (
    index: number,
    field: keyof Category,
    value: string | number | boolean,
  ) => {
    const newCats = [...categories];
    newCats[index] = { ...newCats[index], [field]: value };
    setCategories(newCats);
  };

  const handleWebhookUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWebhookUrl(e.target.value);
  };

  const handleSaveWebhookUrl = () => {
    saveWebhookUrl(webhookUrl);
    onShowToast("URL do Webhook salva com sucesso!", "success");
  };

  const getStepForCategory = (catName: string): number => {
    const name = catName.toLowerCase();
    if (name.includes("leves")) return 0.1;
    if (name.includes("atacado") || name.includes("ultra pesadas") || name.includes("ultra-pesadas")) return 1.0;
    return 0.1;
  };

  const calculatedCats = useMemo(() => {
    return prepareCategories(categories, startMkp, startCommission);
  }, [categories, startMkp, startCommission]);

  const simulation = useMemo(() => {
    const gPrice = parseFloat(goldPrice) || 0;
    const w = parseFloat(simWeight) || 0;
    const costPrice = gPrice * (goldCostPercentage / 100) * w;

    if (w <= 0 || gPrice === 0) {
      return {
        costPrice: 0,
        auto: { mkp: 0, salePrice: 0, profit: 0, margin: 0 },
        manual: { mkp: 0, salePrice: 0, profit: 0, margin: 0, isValid: false },
      };
    }

    let autoMkp = 0;
    if (simCategoryIdx !== "") {
      const catIndex = parseInt(simCategoryIdx);
      if (!isNaN(catIndex) && calculatedCats[catIndex]) {
        autoMkp = calculatedCats[catIndex].targetMkp;
      } else {
        const factors = getPricingFactors(w, startMkp, startCommission, categories);
        autoMkp = factors.mkp;
      }
    } else {
      const factors = getPricingFactors(w, startMkp, startCommission, categories);
      autoMkp = factors.mkp;
    }

    const autoSalePrice = Math.round(w * gPrice * autoMkp);
    const autoProfit = autoSalePrice - costPrice;
    const autoMargin = autoSalePrice > 0 ? (autoProfit / autoSalePrice) * 100 : 0;

    const manualMkpVal = parseFloat(simMkp);
    const isManualValid = !isNaN(manualMkpVal) && manualMkpVal > 0;
    let manualSalePrice = 0;
    let manualProfit = 0;
    let manualMargin = 0;

    if (isManualValid) {
      manualSalePrice = Math.round(w * gPrice * manualMkpVal);
      manualProfit = manualSalePrice - costPrice;
      manualMargin = manualSalePrice > 0 ? (manualProfit / manualSalePrice) * 100 : 0;
    }

    return {
      costPrice,
      auto: { mkp: autoMkp, salePrice: autoSalePrice, profit: autoProfit, margin: autoMargin },
      manual: { mkp: manualMkpVal, salePrice: manualSalePrice, profit: manualProfit, margin: manualMargin, isValid: isManualValid },
    };
  }, [goldPrice, goldCostPercentage, startMkp, startCommission, categories, simWeight, simMkp, simCategoryIdx, calculatedCats]);

  const getLimitPrice = (weight: number) => {
    const gPrice = parseFloat(goldPrice) || 0;
    if (gPrice === 0) return 0;
    const factors = getPricingFactors(weight, startMkp, startCommission, categories);
    return Math.round(weight * gPrice * factors.mkp);
  };

  const getCategoryCurvePoints = (category: Category) => {
    const gPrice = parseFloat(goldPrice) || 0;

    const sorted = [...categories].sort((a, b) => a.maxWeight - b.maxWeight);
    const currentIndex = sorted.findIndex((c) => c.id === category.id);

    let startWeight = 0;
    if (currentIndex > 0) startWeight = sorted[currentIndex - 1].maxWeight;

    const points: { weight: number; mkp: number; comm: number; price: number }[] = [];
    let w = startWeight;
    let count = 0;

    while (w < category.maxWeight && count < 1000) {
      let step = 0.1;
      if (w >= 19.95) step = 1.0;

      w += step;

      if (step >= 1.0) w = Math.round(w * 10) / 10;
      else w = Math.round(w * 100) / 100;

      if (w > category.maxWeight + 0.001) break;

      const factors = getPricingFactors(w, startMkp, startCommission, categories);
      const price = Math.round(w * gPrice * factors.mkp);

      points.push({ weight: w, mkp: factors.mkp, comm: factors.commission, price });
      count++;
    }

    return points;
  };

  const handleSendToWebhook = async () => {
    if (!webhookUrl) {
      onShowToast("URL do Webhook não configurada.", "error");
      return;
    }
    setIsSending(true);
    try {
      const curveVisualization = calculatedCats.map((cat, index) => {
        const prevLimit = index === 0 ? 0 : calculatedCats[index - 1].maxWeight;
        const endW = cat.maxWeight;
        const step = getStepForCategory(cat.name);
        const points: { weight: number; markup: number; commission: number }[] = [];
        let currentW = index === 0 ? step : prevLimit + step;
        while (currentW <= endW + step / 2) {
          const w = step === 1.0 ? Math.round(currentW) : Math.round(currentW * 10) / 10;
          if (w > endW) break;
          const factors = getPricingFactors(w, startMkp, startCommission, categories);
          points.push({ weight: w, markup: factors.mkp, commission: factors.commission });
          currentW += step;
        }
        return {
          categoryName: cat.name,
          range: `${(index === 0 ? step : prevLimit).toFixed(1)}g - ${endW.toFixed(1)}g`,
          targetRef: cat.targetMkp,
          targetComm: cat.targetCommission,
          reduction: cat.variation,
          commReduction: cat.commVariation,
          curvePoints: points,
        };
      });

      const payload = { curveData: curveVisualization };
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) onShowToast("Tabela de curva enviada com sucesso!", "success");
      else throw new Error(`Erro ${response.status}: ${response.statusText}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Erro ao enviar";
      onShowToast(msg, "error");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-8 space-y-6 animate-[fadeIn_0.3s_ease-out] bg-[#F2E8D5] rounded-3xl border border-[#C59B6D]/30 text-[#1A3C34] h-full flex flex-col">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center pb-4 border-b border-[#1A3C34]/10 gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-bold text-[#1A3C34] flex items-center gap-2">
            <Sliders className="text-[#C59B6D]" /> Painel de Controle
          </h2>
          <p className="text-sm opacity-60 mt-1">Ajuste os parâmetros globais e veja o resultado ao lado.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {onToggleFullScreen && (
            <button
              onClick={onToggleFullScreen}
              className={`px-3 py-2 bg-white border border-[#1A3C34]/20 text-[#1A3C34] hover:bg-[#1A3C34] hover:text-[#C59B6D] rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2 ${isFullScreen ? "bg-[#1A3C34] text-[#C59B6D]" : ""}`}
              title={isFullScreen ? "Restaurar Visualização" : "Expandir Visualização"}
            >
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          )}

          <button
            onClick={onOpenSync}
            className="px-4 py-2 bg-white border border-[#1A3C34]/20 text-[#1A3C34] hover:bg-[#1A3C34] hover:text-[#C59B6D] rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2"
          >
            <Cloud size={16} /> Nuvem
          </button>
          <button
            onClick={onSave}
            className="px-6 py-2 bg-[#1A3C34] text-[#C59B6D] hover:bg-[#132A26] rounded-lg text-sm font-bold shadow-lg shadow-[#1A3C34]/20 transition-all flex items-center gap-2"
          >
            <Save size={16} /> Salvar
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-bold shadow-sm transition-all flex items-center gap-2 border border-red-100"
              title="Sair do Modo Admin"
            >
              <LogOut size={16} /> Sair
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-6">
        {/* Global Inputs Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-[#C59B6D]/30 flex flex-col justify-center shadow-sm">
            <label className="text-[10px] font-bold text-[#C59B6D] uppercase mb-1">Markup (MKP) Inicial</label>
            <div className="flex items-center gap-2">
              <input
                type="number" step="0.1" value={startMkp}
                onChange={(e) => setStartMkp(parseFloat(e.target.value) || 0)}
                className="w-full text-xl font-bold text-[#1A3C34] bg-white border-b border-[#C59B6D]/30 focus:border-[#C59B6D] outline-none py-0.5"
              />
              <span className="text-[#1A3C34]/50 font-bold text-xs">x</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#C59B6D]/30 flex flex-col justify-center shadow-sm">
            <label className="text-[10px] font-bold text-[#C59B6D] uppercase mb-1">Comissão Inicial</label>
            <div className="flex items-center gap-2">
              <input
                type="number" step="0.1" value={startCommission}
                onChange={(e) => setStartCommission(parseFloat(e.target.value) || 0)}
                className="w-full text-xl font-bold text-[#1A3C34] bg-white border-b border-[#C59B6D]/30 focus:border-[#C59B6D] outline-none py-0.5"
              />
              <span className="text-[#1A3C34]/50 font-bold text-xs">%</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#C59B6D]/30 flex flex-col justify-center shadow-sm">
            <div className="flex justify-between items-start mb-1">
              <label className="text-[10px] font-bold text-[#C59B6D] uppercase">Custo Ouro 18k</label>
              <Coins size={12} className="text-[#C59B6D]" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" step="1" value={goldCostPercentage}
                onChange={(e) => setGoldCostPercentage(parseFloat(e.target.value) || 0)}
                className="w-full text-xl font-bold text-[#1A3C34] bg-white border-b border-[#C59B6D]/30 focus:border-[#C59B6D] outline-none py-0.5"
              />
              <span className="text-[#1A3C34]/50 font-bold text-xs">%</span>
            </div>
            <p className="text-[8px] text-[#1A3C34]/40 mt-1 leading-tight">% da Cotação considerada como custo.</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#C59B6D]/30 flex flex-col justify-center shadow-sm">
            <label className="text-[10px] font-bold text-[#C59B6D] uppercase mb-1">Faixa de Compra (Sucata)</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[8px] font-bold text-[#1A3C34]/50 uppercase">Mín</label>
                <input
                  type="number" step="1" value={purchaseMin}
                  onChange={(e) => setPurchaseMin(parseFloat(e.target.value) || 0)}
                  className="w-full text-sm font-bold text-[#1A3C34] bg-white border-b border-[#C59B6D]/30 focus:border-[#C59B6D] outline-none py-0.5"
                />
              </div>
              <div className="text-[#1A3C34]/30 font-bold text-sm">-</div>
              <div className="flex-1">
                <label className="text-[8px] font-bold text-[#1A3C34]/50 uppercase">Máx</label>
                <input
                  type="number" step="1" value={purchaseMax}
                  onChange={(e) => setPurchaseMax(parseFloat(e.target.value) || 0)}
                  className="w-full text-sm font-bold text-[#1A3C34] bg-white border-b border-[#C59B6D]/30 focus:border-[#C59B6D] outline-none py-0.5"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-[#C59B6D]/30 flex flex-col justify-center shadow-sm">
            <div className="flex justify-between items-start">
              <label className="text-[10px] font-bold text-[#C59B6D] uppercase mb-1">Comissão s/ Economia</label>
              <Percent size={12} className="text-[#C59B6D]" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" step="1" value={purchaseCommSplit}
                onChange={(e) => setPurchaseCommSplit(parseFloat(e.target.value) || 0)}
                className="w-full text-xl font-bold text-[#1A3C34] bg-white border-b border-[#C59B6D]/30 focus:border-[#C59B6D] outline-none py-0.5"
              />
              <span className="text-[#1A3C34]/50 font-bold text-xs">%</span>
            </div>
          </div>

          {setReceiveMin && setReceiveMax && (
            <div className="bg-white p-4 rounded-2xl border border-[#C59B6D]/30 flex flex-col justify-center shadow-sm">
              <div className="flex justify-between items-start mb-1">
                <label className="text-[10px] font-bold text-[#C59B6D] uppercase">Receber (Troca) %</label>
                <ArrowRightLeft size={12} className="text-[#C59B6D]" />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-[8px] font-bold text-[#1A3C34]/50 uppercase">Mín</label>
                  <input
                    type="number" step="1" value={receiveMin}
                    onChange={(e) => setReceiveMin(parseFloat(e.target.value) || 0)}
                    className="w-full text-sm font-bold text-[#1A3C34] bg-white border-b border-[#C59B6D]/30 focus:border-[#C59B6D] outline-none py-0.5"
                  />
                </div>
                <div className="text-[#1A3C34]/30 font-bold text-sm">-</div>
                <div className="flex-1">
                  <label className="text-[8px] font-bold text-[#1A3C34]/50 uppercase">Máx</label>
                  <input
                    type="number" step="1" value={receiveMax}
                    onChange={(e) => setReceiveMax(parseFloat(e.target.value) || 0)}
                    className="w-full text-sm font-bold text-[#1A3C34] bg-white border-b border-[#C59B6D]/30 focus:border-[#C59B6D] outline-none py-0.5"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Profit Simulation */}
        <div className="bg-[#1A3C34] text-[#F2E8D5] rounded-2xl p-4 shadow-lg relative overflow-hidden flex flex-col gap-4">
          <div className="absolute right-0 top-0 h-full w-2 bg-[#C59B6D]"></div>

          <div className="z-10 w-full flex flex-col md:flex-row gap-4 items-start md:items-end justify-between border-b border-[#C59B6D]/10 pb-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="bg-[#C59B6D] text-[#1A3C34] p-1 rounded-md">
                  <TrendingUp size={14} />
                </div>
                <h3 className="font-bold text-sm uppercase tracking-wide">Simulação de Lucro</h3>
              </div>

              <div className="flex gap-3">
                <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded">
                  <label className="text-[10px] font-bold uppercase opacity-70 flex items-center gap-1">
                    <Scale size={10} /> Peso:
                  </label>
                  <input
                    type="number" step="0.01" value={simWeight}
                    onChange={(e) => setSimWeight(e.target.value)}
                    className="w-16 bg-transparent text-white font-bold text-sm focus:outline-none border-b border-[#C59B6D]/50 text-center"
                  />
                </div>

                <div className="flex items-center gap-1 bg-white/10 px-2 py-1 rounded">
                  <label className="text-[10px] font-bold uppercase opacity-70 flex items-center gap-1">
                    <TableIcon size={10} /> Tabela:
                  </label>
                  <div className="relative">
                    <select
                      value={simCategoryIdx}
                      onChange={(e) => setSimCategoryIdx(e.target.value)}
                      className="appearance-none bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer min-w-[100px]"
                    >
                      <option value="" className="text-[#1A3C34]">Automático</option>
                      {calculatedCats.map((cat, idx) => (
                        <option key={idx} value={idx} className="text-[#1A3C34]">
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[9px] uppercase font-bold opacity-60">Custo Base ({goldCostPercentage}%)</p>
              <p className="text-xl font-bold text-white">{formatCurrency(simulation.costPrice)}</p>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-[9px] uppercase text-[#C59B6D] font-bold border-b border-[#C59B6D]/20">
                  <th className="py-2 pl-2">Cenário</th>
                  <th className="py-2 text-center">MKP</th>
                  <th className="py-2 text-right">Venda</th>
                  <th className="py-2 text-right">Lucro</th>
                  <th className="py-2 text-right pr-2">Margem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C59B6D]/10">
                <tr className="hover:bg-white/5 transition-colors">
                  <td className="py-2 pl-2">
                    <span className="font-bold text-white text-xs">Sugerido (Auto)</span>
                  </td>
                  <td className="py-2 text-center">
                    <span className="font-mono text-white/70 text-xs">{simulation.auto.mkp.toFixed(3)}x</span>
                  </td>
                  <td className="py-2 text-right font-bold text-white">{formatCurrency(simulation.auto.salePrice)}</td>
                  <td className="py-2 text-right text-emerald-400 font-bold">{formatCurrency(simulation.auto.profit)}</td>
                  <td className="py-2 text-right pr-2 font-bold text-[#C59B6D]">{simulation.auto.margin.toFixed(1)}%</td>
                </tr>

                <tr className="bg-[#C59B6D]/5 hover:bg-[#C59B6D]/10 transition-colors">
                  <td className="py-2 pl-2">
                    <span className="font-bold text-[#C59B6D] text-xs flex items-center gap-1">
                      <Calculator size={12} /> Simulado
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    <input
                      type="number" step="0.01" value={simMkp}
                      onChange={(e) => setSimMkp(e.target.value)}
                      placeholder="0.00"
                      className="w-16 bg-[#C59B6D]/20 border border-[#C59B6D]/50 rounded px-1 py-0.5 text-center text-white font-bold text-sm focus:outline-none focus:bg-[#C59B6D]/30 placeholder-white/20"
                    />
                  </td>
                  <td className="py-2 text-right font-bold text-white">
                    {simulation.manual.isValid ? formatCurrency(simulation.manual.salePrice) : "--"}
                  </td>
                  <td className="py-2 text-right text-emerald-400 font-bold">
                    {simulation.manual.isValid ? formatCurrency(simulation.manual.profit) : "--"}
                  </td>
                  <td className="py-2 text-right pr-2 font-bold text-[#C59B6D]">
                    {simulation.manual.isValid ? `${simulation.manual.margin.toFixed(1)}%` : "--"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Categories Grid */}
        <div className="flex flex-col h-full min-h-[400px]">
          <div className="flex justify-between items-end mb-2">
            <h3 className="font-bold text-[#1A3C34] text-sm">Categorias de Variação</h3>
            <button
              onClick={onAddCategory}
              className="text-[10px] font-bold text-[#1A3C34] bg-[#C59B6D]/20 px-2 py-1 rounded border border-[#C59B6D]/40 hover:bg-[#C59B6D]/40 transition-colors flex items-center gap-1"
            >
              <Plus size={12} /> Nova Categoria
            </button>
          </div>

          <div className="bg-white border border-[#1A3C34]/10 rounded-xl overflow-hidden shadow-sm flex flex-col flex-1">
            <div className="grid grid-cols-12 gap-2 bg-[#1A3C34] py-3 px-3 text-[10px] font-bold uppercase text-white/90 border-b border-[#C59B6D]/20 items-center text-center shrink-0">
              <div className="col-span-1">Ativo</div>
              <div className="col-span-3 text-left pl-1">Categoria</div>
              <div className="col-span-2">Faixa (g)</div>
              <div className="col-span-2 text-red-200">Red. MKP</div>
              <div className="col-span-2 text-blue-200">Red. Com.</div>
              <div className="col-span-1 text-[#C59B6D]">Pontos</div>
              <div className="col-span-1">Ações</div>
            </div>

            <div className="overflow-y-auto custom-scroll max-h-[500px]">
              {categories.map((cat, index) => {
                const isActive = cat.active !== false;
                const limitPrice = getLimitPrice(cat.maxWeight);
                const isExpanded = expandedCategoryId === cat.id;

                const calcData = calculatedCats.find((c) => c.id === cat.id);
                const finalMkp = calcData ? calcData.targetMkp : 0;
                const finalComm = calcData ? calcData.targetCommission : 0;

                return (
                  <React.Fragment key={cat.id}>
                    <div className={`grid grid-cols-12 gap-2 py-1.5 px-3 items-center border-b border-[#1A3C34]/5 hover:bg-[#F2E8D5]/40 transition-colors ${!isActive ? "opacity-50" : ""}`}>
                      <div className="col-span-1 flex justify-center items-center gap-1">
                        <button
                          onClick={() => setExpandedCategoryId(isExpanded ? null : cat.id)}
                          className={`p-0.5 rounded hover:bg-[#C59B6D]/20 transition-all ${isExpanded ? "text-[#C59B6D] rotate-180" : "text-[#1A3C34]/40"}`}
                          title="Expandir Curva"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <input
                          type="checkbox" checked={isActive}
                          onChange={(e) => handleCategoryChange(index, "active", e.target.checked)}
                          className="w-3.5 h-3.5 text-[#C59B6D] rounded focus:ring-0 border-gray-300 cursor-pointer accent-[#C59B6D]"
                        />
                      </div>

                      <div className="col-span-3">
                        <input
                          type="text" value={cat.name}
                          onChange={(e) => handleCategoryChange(index, "name", e.target.value)}
                          className="w-full bg-transparent font-bold text-xs text-[#1A3C34] outline-none px-1 rounded h-6 border-b border-transparent focus:border-[#C59B6D]"
                          placeholder="Nome"
                        />
                      </div>

                      <div className="col-span-2 flex flex-col items-center justify-center">
                        <div className="flex items-center justify-center w-full">
                          <input
                            type="number" step="0.1" value={cat.maxWeight}
                            onChange={(e) => handleCategoryChange(index, "maxWeight", parseFloat(e.target.value) || 0)}
                            className="w-12 bg-transparent font-bold text-xs text-[#1A3C34] outline-none text-center h-6 border-b border-transparent focus:border-[#C59B6D]"
                          />
                        </div>
                        <div className="text-[8px] text-emerald-600 font-bold bg-emerald-50 px-1 rounded -mt-0.5">
                          ~ {formatCurrency(limitPrice)}
                        </div>
                      </div>

                      <div className="col-span-2 flex flex-col items-center justify-center">
                        <div className="flex items-center">
                          <span className="text-red-500 font-bold text-[10px] mr-0.5">-</span>
                          <input
                            type="number" step="0.001" value={cat.variation}
                            onChange={(e) => handleCategoryChange(index, "variation", parseFloat(e.target.value) || 0)}
                            className="w-14 bg-transparent font-bold text-xs text-red-500 outline-none text-center h-6 border-b border-transparent focus:border-red-300"
                          />
                        </div>
                        <div className="text-[9px] font-bold text-[#1A3C34] bg-[#C59B6D]/20 px-1.5 rounded-full mt-0.5">
                          = {finalMkp.toFixed(3)}x
                        </div>
                      </div>

                      <div className="col-span-2 flex flex-col items-center justify-center">
                        <div className="flex items-center">
                          <span className="text-blue-500 font-bold text-[10px] mr-0.5">-</span>
                          <input
                            type="number" step="0.1" value={cat.commVariation || 0}
                            onChange={(e) => handleCategoryChange(index, "commVariation", parseFloat(e.target.value) || 0)}
                            className="w-12 bg-transparent font-bold text-xs text-blue-500 outline-none text-center h-6 border-b border-transparent focus:border-blue-300"
                          />
                          <span className="text-[8px] text-blue-500 ml-0.5">%</span>
                        </div>
                        <div className="text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 rounded-full mt-0.5">
                          = {finalComm.toFixed(2)}%
                        </div>
                      </div>

                      <div className="col-span-1 flex items-center justify-center">
                        <input
                          type="number" step="1" value={cat.maxDiscount || 0}
                          onChange={(e) => handleCategoryChange(index, "maxDiscount", parseFloat(e.target.value) || 0)}
                          className="w-8 bg-transparent font-bold text-xs text-[#1A3C34] outline-none text-center h-6 border-b border-transparent focus:border-[#C59B6D]"
                        />
                      </div>

                      <div className="col-span-1 flex justify-center">
                        <button
                          onClick={() => onDeleteCategory(index)}
                          className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bg-[#F2E8D5]/20 p-2 border-b border-[#1A3C34]/10 shadow-inner animate-[fadeIn_0.1s_ease-out]">
                        <div className="max-h-[200px] overflow-y-auto custom-scroll pr-2">
                          <div className="flex items-center justify-between mb-2 sticky top-0 bg-[#F4EDE0] p-1.5 z-10 rounded border border-[#1A3C34]/5">
                            <p className="text-[9px] font-bold uppercase text-[#1A3C34]/60">
                              Curva: {cat.name} (Passo Dinâmico: 0.1g / &gt;30g: 1.0g)
                            </p>
                            <div className="flex gap-3 text-[9px]">
                              <span className="text-[#C59B6D] font-bold">MKP Alvo: {finalMkp.toFixed(3)}x</span>
                              <span className="text-blue-500 font-bold">Com: {finalComm.toFixed(2)}%</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-1.5">
                            {getCategoryCurvePoints(cat).map((p, pIdx) => (
                              <div key={pIdx} className="bg-white border border-[#1A3C34]/10 rounded p-1 text-center shadow-sm flex flex-col justify-center h-12 hover:border-[#C59B6D] transition-colors">
                                <div className="text-[9px] font-bold text-[#1A3C34]">{p.weight.toFixed(1)}g</div>
                                <div className="text-[8px] text-[#C59B6D] font-mono font-bold leading-none">{p.mkp.toFixed(3)}x</div>
                                <div className="text-[8px] text-emerald-600 font-bold border-t border-dashed border-[#1A3C34]/10 pt-0.5 mt-0.5 leading-none">
                                  {formatCurrency(p.price)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </div>

        {/* Webhook */}
        <div className="bg-white px-4 py-2 rounded-xl border border-[#C59B6D]/30 shadow-sm flex items-center justify-between gap-4">
          <h3 className="font-bold text-[#1A3C34] text-xs flex items-center gap-1 shrink-0">
            <TableIcon className="text-[#C59B6D]" size={14} /> Integração
          </h3>

          <div className="flex gap-2 flex-1 max-w-md">
            <div className="flex-1 relative">
              <input
                type="text" value={webhookUrl}
                onChange={handleWebhookUrlChange}
                placeholder="URL do Webhook"
                className="w-full pl-2 pr-2 py-1 bg-[#F2E8D5]/30 border border-[#1A3C34]/10 rounded text-[10px] text-[#1A3C34] focus:border-[#C59B6D] outline-none transition-all h-7"
              />
            </div>
            <button
              onClick={handleSaveWebhookUrl}
              className="px-2 py-1 bg-white border border-[#1A3C34]/20 text-[#1A3C34] rounded text-[10px] font-bold shadow-sm hover:bg-[#1A3C34] hover:text-[#C59B6D] transition-all flex items-center gap-1 h-7"
              title="Salvar URL"
            >
              <Save size={12} /> Salvar
            </button>
            <button
              onClick={handleSendToWebhook}
              disabled={isSending || !webhookUrl}
              className="px-2 py-1 bg-[#1A3C34] text-[#C59B6D] rounded text-[10px] font-bold shadow-sm hover:bg-[#132A26] transition-all disabled:opacity-50 flex items-center gap-1 h-7"
              title="Enviar Tabela"
            >
              {isSending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Enviar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigurationTab;
