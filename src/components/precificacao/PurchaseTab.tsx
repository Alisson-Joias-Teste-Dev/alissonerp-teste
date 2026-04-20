"use client";

import React, { useState } from "react";
import { TrendingUp, DollarSign, Scale } from "lucide-react";
import { formatCurrency } from "@/lib/precificacao/pricing";

interface PurchaseTabProps {
  goldPrice: string;
  setGoldPrice: (val: string) => void;
  purchaseMin: number;
  purchaseMax: number;
  purchaseCommSplit: number;
  onShowToast: (msg: string, type: "success" | "error" | "info") => void;
}

const PurchaseTab: React.FC<PurchaseTabProps> = ({
  goldPrice,
  purchaseMin,
  purchaseMax,
  purchaseCommSplit,
  onShowToast,
}) => {
  const [weight, setWeight] = useState<string>("");
  const [pricePaid, setPricePaid] = useState<string>("");

  const numericGoldPrice = parseFloat(goldPrice) || 0;
  const minLimit = numericGoldPrice * (purchaseMin / 100);
  const maxLimit = numericGoldPrice * (purchaseMax / 100);

  const w = parseFloat(weight) || 0;
  const paidPerGram = parseFloat(pricePaid) || 0;

  const priceDifference = Math.max(0, maxLimit - paidPerGram);

  const totalSavings = Math.round(priceDifference * w);
  const commissionValue = Math.round(totalSavings * (purchaseCommSplit / 100));
  const totalCost = Math.round(w * paidPerGram);

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const numVal = parseFloat(val);

    if (!isNaN(numVal) && numVal > maxLimit) {
      setPricePaid(maxLimit.toFixed(2));
      onShowToast("Valor travado no teto máximo permitido!", "error");
    } else {
      setPricePaid(val);
    }
  };

  let priceColor = "text-[#1A3C34]";
  if (paidPerGram > 0) {
    if (paidPerGram <= minLimit) priceColor = "text-emerald-600";
    else priceColor = "text-blue-600";
  }

  return (
    <div className="p-6 space-y-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Header - Gold Price & Limits */}
      <div className="bg-[#1A3C34] text-[#F2E8D5] rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <DollarSign size={80} />
        </div>

        <div className="flex justify-between items-start z-10 relative">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-60">
                Cotação Atual (g) · Via ERP
              </span>
            </div>
            <div className="text-3xl font-bold text-[#C59B6D]">
              R$ {numericGoldPrice.toFixed(2)}
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold opacity-60 uppercase mb-1">Teto Máximo</p>
            <div className="text-xl font-bold text-white">{formatCurrency(maxLimit)}</div>
          </div>
        </div>

        {/* Range Bar */}
        <div className="mt-6">
          <div className="flex justify-between text-[10px] font-bold opacity-60 mb-1">
            <span>Mín: {formatCurrency(minLimit)}</span>
            <span>Máx: {formatCurrency(maxLimit)}</span>
          </div>
          <div className="h-2 bg-[#132A26] rounded-full overflow-hidden flex border border-[#C59B6D]/20">
            <div className="bg-emerald-500/80 h-full" style={{ width: "30%" }}></div>
            <div className="bg-[#C59B6D] h-full" style={{ width: "40%" }}></div>
            <div className="bg-red-500/30 h-full" style={{ width: "30%" }}></div>
          </div>
        </div>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#C59B6D]/30 shadow-sm group focus-within:border-[#C59B6D] transition-all">
          <label className="text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1 flex items-center gap-1">
            <Scale size={12} /> Peso (g)
          </label>
          <input
            type="number"
            step="0.01"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="0.0"
            className="w-full bg-transparent text-2xl font-bold text-[#1A3C34] outline-none placeholder-[#1A3C34]/20"
          />
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#C59B6D]/30 shadow-sm group focus-within:border-[#C59B6D] transition-all">
          <label className="text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1 flex items-center gap-1">
            <DollarSign size={12} /> Valor Pago (g)
          </label>
          <input
            type="number"
            step="0.01"
            value={pricePaid}
            onChange={handlePriceChange}
            placeholder={formatCurrency(minLimit).replace("R$", "").trim()}
            className={`w-full bg-transparent text-2xl font-bold outline-none placeholder-[#1A3C34]/20 ${priceColor}`}
          />
        </div>
      </div>

      {/* Results Card */}
      <div className="bg-[#1A3C34] text-[#F2E8D5] rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-[#F2E8D5]/10">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-[10px] font-bold opacity-60 uppercase">Valor Total da Compra</p>
              <p className="text-2xl font-bold text-white">{formatCurrency(totalCost)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold opacity-60 uppercase">Margem (Spread)</p>
              <p
                className={`text-sm font-bold ${
                  priceDifference > 0 ? "text-emerald-400" : "text-slate-400"
                }`}
              >
                {priceDifference > 0 ? `+${formatCurrency(priceDifference)}/g` : "R$ 0,00"}
              </p>
            </div>
          </div>
        </div>

        {/* Commission Highlight */}
        <div className="bg-[#132A26] p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute right-0 top-0 h-full w-2 bg-[#C59B6D]"></div>

          <div>
            <p className="text-[10px] font-bold text-[#C59B6D] uppercase mb-1 flex items-center gap-1">
              <TrendingUp size={14} /> Sua Comissão ({purchaseCommSplit}%)
            </p>
            <p className="text-[10px] opacity-60 max-w-[150px] leading-tight">
              Calculada sobre a economia gerada em relação ao teto máximo.
            </p>
          </div>

          <div className="text-right">
            <span className="text-3xl font-bold text-[#C59B6D] tracking-tight">
              {formatCurrency(commissionValue)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseTab;
