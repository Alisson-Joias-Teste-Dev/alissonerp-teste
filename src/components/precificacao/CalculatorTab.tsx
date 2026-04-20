"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Category } from "@/types/precificacao";
import { getPricingFactors, formatCurrency } from "@/lib/precificacao/pricing";

interface CalculatorTabProps {
  goldPrice: string;
  setGoldPrice: (val: string) => void;
  startMkp: number;
  startCommission: number;
  categories: Category[];
  purchaseMin: number;
  purchaseMax: number;
  purchaseCommSplit: number;
  goldCostPercentage?: number;
  onShowToast: (msg: string, type: "success" | "error" | "info") => void;
}

const CalculatorTab: React.FC<CalculatorTabProps> = ({
  goldPrice,
  startMkp,
  startCommission,
  categories,
  onShowToast,
}) => {
  const [weight, setWeight] = useState<string>("");
  const [discount, setDiscount] = useState<string>("");
  const [showDetails, setShowDetails] = useState(false);

  const wVal = parseFloat(weight) || 0;
  const activeCats = categories.filter((c) => c.active !== false);
  const sortedCats = [...activeCats].sort((a, b) => a.maxWeight - b.maxWeight);
  const currentCategory =
    sortedCats.find((c) => wVal <= c.maxWeight) || sortedCats[sortedCats.length - 1];
  const maxDiscountAllowed = currentCategory ? (currentCategory.maxDiscount ?? 100) : 100;

  const [result, setResult] = useState({
    mkp: 0,
    commissionPercent: 0,
    commissionValue: 0,
    basePrice: 0,
    finalPrice: 0,
    pricePerGram: 0,
    discountAmount: 0,
    catName: "--",
    catColor: "text-slate-400",
  });

  useEffect(() => {
    const currentDisc = parseFloat(discount);
    if (!isNaN(currentDisc) && currentDisc > maxDiscountAllowed) {
      setDiscount(maxDiscountAllowed.toString());
      onShowToast(
        `Desconto ajustado para o limite da categoria (${maxDiscountAllowed}%)`,
        "info",
      );
    }
  }, [maxDiscountAllowed, discount, onShowToast]);

  const handleDiscountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    const val = parseFloat(valStr);

    if (!isNaN(val) && val > maxDiscountAllowed) {
      setDiscount(maxDiscountAllowed.toString());
      onShowToast(
        `Desconto máximo para ${currentCategory?.name || "esta categoria"} é ${maxDiscountAllowed}%`,
        "error",
      );
    } else {
      setDiscount(valStr);
    }
  };

  const calculate = useCallback(() => {
    const gPrice = parseFloat(goldPrice);
    const w = parseFloat(weight);
    const dPercent = parseFloat(discount) || 0;

    if (!gPrice || !w) {
      setResult({
        mkp: 0,
        commissionPercent: 0,
        commissionValue: 0,
        basePrice: 0,
        finalPrice: 0,
        pricePerGram: 0,
        discountAmount: 0,
        catName: "--",
        catColor: "text-slate-400",
      });
      return;
    }

    const factors = getPricingFactors(w, startMkp, startCommission, categories);

    const activeCatsCalc = categories.filter((c) => c.active !== false);
    const sortedCatsCalc = [...activeCatsCalc].sort((a, b) => a.maxWeight - b.maxWeight);
    const cat =
      sortedCatsCalc.find((c) => w <= c.maxWeight) || sortedCatsCalc[sortedCatsCalc.length - 1];

    const basePrice = Math.round(w * gPrice * factors.mkp);
    const discountAmount = Math.round(basePrice * (dPercent / 100));
    const finalPrice = basePrice - discountAmount;
    const pricePerGram = finalPrice / w;
    const commissionValue = Math.round(finalPrice * (factors.commission / 100));

    setResult({
      mkp: factors.mkp,
      commissionPercent: factors.commission,
      commissionValue,
      basePrice,
      finalPrice,
      pricePerGram,
      discountAmount,
      catName: cat ? cat.name : "--",
      catColor: cat ? cat.color : "text-slate-400",
    });
  }, [goldPrice, weight, discount, startMkp, startCommission, categories]);

  useEffect(() => {
    calculate();
  }, [calculate]);

  return (
    <div className="p-6 space-y-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Top Row: Gold Price ONLY */}
      <div className="w-full">
        <div className="bg-white p-4 rounded-xl border border-[#C59B6D]/30 shadow-sm relative overflow-hidden flex items-center justify-between">
          <div className="flex flex-col">
            <label className="block text-[10px] font-bold text-[#1A3C34] uppercase tracking-wide mb-1">
              Cotação do Ouro (g)
            </label>
            <div className="relative flex items-center">
              <span className="text-[#1A3C34] font-bold text-sm mr-2">R$</span>
              <input
                type="number"
                step="0.01"
                value={goldPrice}
                readOnly
                placeholder="0,00"
                className="bg-transparent text-3xl font-bold text-[#1A3C34] outline-none placeholder-[#1A3C34]/30 cursor-not-allowed w-48"
              />
            </div>
          </div>
          <div className="text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide pr-2">
            Via ERP
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#C59B6D]/30 shadow-sm group focus-within:border-[#C59B6D] transition-all">
          <label className="block text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1 group-focus-within:text-[#1A3C34]">
            Peso (g)
          </label>
          <input
            type="number"
            step="0.01"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="0.0"
            className="w-full bg-transparent text-xl font-bold text-[#1A3C34] outline-none placeholder-[#1A3C34]/20"
          />
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#C59B6D]/30 shadow-sm group focus-within:border-[#C59B6D] transition-all">
          <label className="block text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1 group-focus-within:text-[#1A3C34]">
            Desconto (%)
          </label>
          <div className="flex items-center">
            <input
              type="number"
              step="1"
              value={discount}
              onChange={handleDiscountChange}
              placeholder="0"
              className="w-full bg-transparent text-xl font-bold text-[#1A3C34] outline-none text-center placeholder-[#1A3C34]/20"
            />
            <span className="text-[#1A3C34]/50 text-sm font-bold">%</span>
          </div>
        </div>
      </div>

      {/* Result Area */}
      <div className="bg-[#1A3C34] rounded-2xl p-6 shadow-xl transition-all relative overflow-hidden text-[#F2E8D5]">
        <div
          className={`transition-all duration-500 ease-in-out overflow-hidden ${
            showDetails ? "max-h-[200px] opacity-100 mb-6" : "max-h-0 opacity-0 mb-0"
          }`}
        >
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold opacity-60 uppercase">Valor do Grama</p>
              <div className="flex flex-col">
                <span className="text-2xl font-bold text-white">
                  {formatCurrency(result.pricePerGram)}
                </span>
                <div className="flex items-center mt-1 gap-2">
                  <span className="text-[10px] font-bold bg-[#C59B6D] text-[#1A3C34] px-2 py-0.5 rounded">
                    REF: {result.mkp > 0 ? `${result.mkp.toFixed(3)}x` : "--"}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-[#C59B6D]">
                    {result.catName}
                  </span>
                </div>
              </div>
            </div>

            <div className="text-right">
              <p className="text-[10px] font-bold opacity-60 uppercase">Preço Base (Tabela)</p>
              <span className="text-sm font-semibold">{formatCurrency(result.basePrice)}</span>

              <div className="mt-2 text-right">
                <p className="text-[10px] font-bold text-[#C59B6D] uppercase">
                  Comissão ({result.commissionPercent.toFixed(1)}%)
                </p>
                <span className="text-xs font-semibold">
                  {formatCurrency(result.commissionValue)}
                </span>
              </div>
            </div>
          </div>
          <div className="border-t border-[#F2E8D5]/10 mt-4"></div>
        </div>

        <div
          onClick={() => setShowDetails(!showDetails)}
          className="text-center cursor-pointer select-none active:scale-95 transition-transform"
        >
          <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mb-1">
            Preço Final (Total)
          </p>
          <h2 className="text-4xl font-bold text-[#C59B6D] tracking-tight">
            {formatCurrency(result.finalPrice)}
          </h2>
          {result.discountAmount > 0 && (
            <div className="mt-2 text-xs font-bold text-red-300">
              -{formatCurrency(result.discountAmount)} de Desconto
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalculatorTab;
