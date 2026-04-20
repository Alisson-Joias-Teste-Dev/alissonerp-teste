"use client";

import React, { useState } from "react";
import { ArrowRightLeft, DollarSign, Scale } from "lucide-react";
import { formatCurrency } from "@/lib/precificacao/pricing";

interface TradeInTabProps {
  goldPrice: string;
  setGoldPrice: (val: string) => void;
  receiveMin: number;
  receiveMax: number;
  onShowToast: (msg: string, type: "success" | "error" | "info") => void;
}

const TradeInTab: React.FC<TradeInTabProps> = ({
  goldPrice,
  receiveMin,
  receiveMax,
}) => {
  const [weight, setWeight] = useState<string>("");
  const [creditValue, setCreditValue] = useState<string>("");

  const numericGoldPrice = parseFloat(goldPrice) || 0;

  const minLimit = numericGoldPrice * (receiveMin / 100);
  const maxLimit = numericGoldPrice * (receiveMax / 100);

  const w = parseFloat(weight) || 0;
  const creditPerGram = parseFloat(creditValue) || 0;

  const totalCredit = Math.round(w * creditPerGram);

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCreditValue(e.target.value);
  };

  let priceColor = "text-[#1A3C34]";
  if (creditPerGram > 0) {
    if (creditPerGram >= minLimit && creditPerGram <= maxLimit)
      priceColor = "text-emerald-600";
    else if (creditPerGram > maxLimit) priceColor = "text-amber-600";
    else priceColor = "text-blue-600";
  }

  return (
    <div className="p-6 space-y-6 animate-[fadeIn_0.3s_ease-out]">
      {/* Header - Gold Price & Limits */}
      <div className="bg-[#1A3C34] text-[#F2E8D5] rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-5">
          <ArrowRightLeft size={80} />
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
            <p className="text-[10px] font-bold opacity-60 uppercase mb-1">Teto Recebimento</p>
            <div className="text-xl font-bold text-white">{formatCurrency(maxLimit)}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex justify-between text-[10px] font-bold opacity-60 mb-1">
            <span>Mín: {formatCurrency(minLimit)}</span>
            <span>Máx: {formatCurrency(maxLimit)}</span>
          </div>
          <div className="h-2 bg-[#132A26] rounded-full overflow-hidden flex border border-[#C59B6D]/20">
            <div className="bg-emerald-500/30 h-full" style={{ width: "10%" }}></div>
            <div className="bg-[#C59B6D] h-full" style={{ width: "80%" }}></div>
            <div className="bg-red-500/30 h-full" style={{ width: "10%" }}></div>
          </div>
        </div>
      </div>

      {/* Inputs Grid */}
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
            <DollarSign size={12} /> Valor Recebido (g)
          </label>
          <input
            type="number"
            step="0.01"
            value={creditValue}
            onChange={handlePriceChange}
            placeholder={formatCurrency(maxLimit).replace("R$", "").trim()}
            className={`w-full bg-transparent text-2xl font-bold outline-none placeholder-[#1A3C34]/20 ${priceColor}`}
          />
          <div className="text-right mt-1">
            <p className="text-[9px] font-bold text-[#1A3C34]/40">
              Permitido: {formatCurrency(minLimit)} - {formatCurrency(maxLimit)}
            </p>
          </div>
        </div>
      </div>

      {/* Results Card */}
      <div className="bg-[#1A3C34] text-[#F2E8D5] rounded-2xl shadow-xl overflow-hidden p-6 flex flex-col items-center justify-center text-center">
        <p className="text-[10px] font-bold text-[#C59B6D] uppercase mb-2 flex items-center gap-1">
          <ArrowRightLeft size={14} /> Crédito Gerado (Troca)
        </p>
        <p className="text-4xl font-bold text-white tracking-tight">
          {formatCurrency(totalCredit)}
        </p>
        <p className="text-[10px] opacity-60 mt-2 max-w-[250px]">
          Valor a ser abatido na compra da nova joia.
        </p>
      </div>
    </div>
  );
};

export default TradeInTab;
