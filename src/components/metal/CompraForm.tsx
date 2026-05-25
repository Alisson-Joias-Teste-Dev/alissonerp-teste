"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-020: CompraForm — Formulário de Compra de Metal
//
// REGRA DE NEGÓCIO:
//   - A EMPRESA compra metal de fornecedores
//   - Valor pago/g entre compra_metal_min_pct e max_pct da cotação
//   - Se valor = teto, comissão = 0 (sem economia)
//   - Ao registrar, status = pendente_pagamento
//
// IMPACTO SE REMOVIDO: Impossível registrar compras de metal.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Scale, Calculator, Info } from "lucide-react";
import ClienteSelector from "./ClienteSelector";
import FotoBalancaInput from "./FotoBalancaInput";
import type { ClienteOption } from "./ClienteSelector";
import type { IaValidacaoResult, MetalConfig } from "@/lib/metal/types";

interface CompraFormProps {
  cotacaoOuro: number;
  configs: MetalConfig;
}

export default function CompraForm({ cotacaoOuro, configs }: CompraFormProps) {
  const router = useRouter();
  const [fornecedor, setFornecedor] = useState<ClienteOption | null>(null);
  const [peso, setPeso] = useState("");
  const [valorPago, setValorPago] = useState("");
  const [observacao, setObservacao] = useState("");
  const [fotoBase64, setFotoBase64] = useState("");
  const [fotoMediaType, setFotoMediaType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Cálculos em tempo real
  const numericPeso = parseFloat(peso) || 0;
  const numericValor = parseFloat(valorPago) || 0;
  const minLimit = cotacaoOuro * (configs.compra_metal_min_pct / 100);
  const maxLimit = cotacaoOuro * (configs.compra_metal_max_pct / 100);
  const spread = Math.max(0, maxLimit - numericValor);
  const valorTotal = numericPeso * numericValor;
  const economiaTotal = spread * numericPeso;
  const comissaoValor = economiaTotal * (configs.compra_metal_comm_pct / 100);

  const iaResultRef: { current: IaValidacaoResult | null } = { current: null };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!fornecedor) {
      setError("Selecione o fornecedor");
      return;
    }
    if (!peso || numericPeso <= 0) {
      setError("Informe o peso do metal");
      return;
    }
    if (!valorPago || numericValor <= 0) {
      setError("Informe o valor pago por grama");
      return;
    }
    if (numericValor < minLimit) {
      setError(`Valor mínimo permitido: R$ ${minLimit.toFixed(2)}/g (${configs.compra_metal_min_pct}%)`);
      return;
    }
    if (numericValor > maxLimit) {
      setError(`Valor máximo permitido: R$ ${maxLimit.toFixed(2)}/g (${configs.compra_metal_max_pct}%)`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/metal/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedor_id: fornecedor.id_contato,
          peso_gramas: numericPeso,
          valor_pago_grama: numericValor,
          foto_base64: fotoBase64 || undefined,
          foto_media_type: fotoMediaType || undefined,
          observacao: observacao || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || "Erro ao registrar compra");
      }

      const compra = await res.json();
      router.push(`/metal/historico`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar compra");
    } finally {
      setSubmitting(false);
    }
  }

  const pctMin = configs.compra_metal_min_pct;
  const pctMax = configs.compra_metal_max_pct;
  const faixaSize = pctMax - pctMin;
  const posicao = numericValor > 0 ? ((numericValor - minLimit) / (maxLimit - minLimit)) * 100 : 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Cliente/Fornecedor */}
      <ClienteSelector
        label="Fornecedor (quem vendeu o metal)"
        value={fornecedor}
        onChange={setFornecedor}
        placeholder="Buscar fornecedor por nome ou CPF..."
        error={error && !fornecedor ? "Selecione o fornecedor" : undefined}
      />

      {/* Peso */}
      <div className="bg-white p-4 rounded-xl border border-[#C59B6D]/30 shadow-sm">
        <label className="block text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1 flex items-center gap-1">
          <Scale size={12} /> Peso (g)
        </label>
        <input
          type="number"
          step="0.01"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          placeholder="0.0"
          className="w-full bg-transparent text-2xl font-bold text-[#1A3C34] outline-none placeholder-[#1A3C34]/20"
        />
      </div>

      {/* Foto */}
      <FotoBalancaInput
        pesoReferencia={numericPeso}
        onFotoChange={(base64, mt) => {
          setFotoBase64(base64);
          setFotoMediaType(mt);
        }}
        onIaResult={(r) => { iaResultRef.current = r; }}
      />

      {/* Cotação + Range */}
      <div className="bg-[#1A3C34] text-[#F2E8D5] rounded-2xl p-5 shadow-lg">
        <div className="flex justify-between items-center mb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Cotação Atual</p>
            <p className="text-2xl font-bold text-[#C59B6D]">R$ {cotacaoOuro.toFixed(2)}/g</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase opacity-60">Teto Máximo</p>
            <p className="text-lg font-bold">R$ {maxLimit.toFixed(2)}/g</p>
          </div>
        </div>

        <div className="bg-[#132A26] rounded-xl p-4">
          <label className="text-[10px] font-bold text-[#C59B6D] uppercase mb-2 block">
            Valor Pago por Grama
          </label>
          <input
            type="number"
            step="0.01"
            value={valorPago}
            onChange={(e) => setValorPago(e.target.value)}
            placeholder={minLimit.toFixed(2)}
            className={`w-full bg-transparent text-3xl font-bold outline-none mb-2 ${
              numericValor > maxLimit ? "text-red-400" : numericValor > 0 ? "text-emerald-400" : "text-white"
            }`}
          />

          {/* Range bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[9px] font-bold opacity-60 mb-1">
              <span>R$ {minLimit.toFixed(2)} ({pctMin}%)</span>
              <span>R$ {maxLimit.toFixed(2)} ({pctMax}%)</span>
            </div>
            <div className="h-3 bg-[#1A3C34] rounded-full overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  numericValor > maxLimit ? "bg-red-500" : numericValor > 0 ? "bg-emerald-500" : "bg-[#C59B6D]/30"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, posicao))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resumo */}
      {numericPeso > 0 && numericValor > 0 && (
        <div className="bg-white border-2 border-[#1A3C34] rounded-2xl p-5 shadow-lg">
          <h3 className="text-[10px] font-bold uppercase text-[#C59B6D] mb-3 flex items-center gap-1">
            <Calculator size={12} /> Resumo
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#1A3C34]/60">Peso × Valor/g</span>
              <span className="font-bold">{numericPeso.toFixed(3)}g × R$ {numericValor.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-lg border-t border-[#1A3C34]/10 pt-2">
              <span className="text-[#1A3C34]/80">Valor Total</span>
              <span className="font-bold text-[#1A3C34]">R$ {valorTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#1A3C34]/60">Economia (Spread)</span>
              <span className={`font-bold ${economiaTotal > 0 ? "text-emerald-600" : "text-[#1A3C34]/40"}`}>
                R$ {economiaTotal.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[#1A3C34]/60">Comissão ({configs.compra_metal_comm_pct}%)</span>
              <span className={`font-bold ${comissaoValor > 0 ? "text-[#C59B6D]" : "text-[#1A3C34]/40"}`}>
                R$ {comissaoValor.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Observação */}
      <div className="bg-white p-4 rounded-xl border border-[#C59B6D]/30 shadow-sm">
        <label className="block text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1 flex items-center gap-1">
          <Info size={12} /> Observação
        </label>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Observações sobre a compra..."
          rows={2}
          className="w-full bg-transparent text-sm text-[#1A3C34] outline-none placeholder-[#1A3C34]/30 resize-none"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 py-3 border border-[#1A3C34]/20 text-[#1A3C34] rounded-xl text-sm font-bold hover:bg-[#1A3C34]/5 transition-all"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 py-3 bg-[#1A3C34] text-[#C59B6D] rounded-xl text-sm font-bold hover:bg-[#132A26] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-[#C59B6D] border-t-transparent rounded-full animate-spin" />
              Registrando...
            </>
          ) : (
            "Registrar Compra"
          )}
        </button>
      </div>
    </form>
  );
}
