"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-020: CompraForm — Formulário de Compra de Metal
//
// REGRA DE NEGÓCIO:
//   - A EMPRESA compra metal de fornecedores
//   - Valor pago/g entre compra_metal_min_pct e max_pct da cotação
//   - Se valor = teto, comissão = 0 (sem economia)
//   - Ao registrar, status = pendente_pagamento
//   - Se valor > teto: botão vira "Solicitar Aprovação". Compra nasce
//     com status 'pendente_aprovacao' e só é liberada após aprovação
//     do aprovador configurado em Configurações > Metal.
//
// IMPACTO SE REMOVIDO: Impossível registrar compras de metal.
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Scale, Calculator, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import ClienteSelector from "./ClienteSelector";
import FotoBalancaInput from "./FotoBalancaInput";
import type { ClienteOption } from "./ClienteSelector";
import type { MetalConfig } from "@/lib/metal/types";

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
  // Controle de validação IA: só habilita submit se o peso bater com a foto
  const [iaMatch, setIaMatch] = useState(false);

  // Reseta validação IA sempre que o peso mudar (nova conferência necessária)
  useEffect(() => {
    setIaMatch(false);
  }, [peso]);

  // Cálculos em tempo real
  const numericPeso = parseFloat(peso) || 0;
  const numericValor = parseFloat(valorPago) || 0;
  const minLimit = cotacaoOuro * (configs.compra_metal_min_pct / 100);
  const maxLimit = cotacaoOuro * (configs.compra_metal_max_pct / 100);
  const spread = Math.max(0, maxLimit - numericValor);
  const valorTotal = numericPeso * numericValor;
  const economiaTotal = spread * numericPeso;
  const comissaoValor = economiaTotal * (configs.compra_metal_comm_pct / 100);

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
    if (!fotoBase64) {
      setError("Envie a foto da balança para continuar");
      return;
    }
    if (!iaMatch) {
      setError("A validação da IA precisa confirmar o peso da balança");
      return;
    }
    if (numericValor < minLimit) {
      setError(`Valor mínimo permitido: R$ ${minLimit.toFixed(2)}/g (${configs.compra_metal_min_pct}%)`);
      return;
    }

    const acimaTeto = numericValor > maxLimit;
    const aprovadorConfigurado = !!configs.metal_aprovador_id?.trim();
    if (acimaTeto && !aprovadorConfigurado) {
      setError("Defina o aprovador em Configurações > Aprovadores > Compra de Metal acima do teto.");
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
          acima_teto: acimaTeto || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || "Erro ao registrar compra");
      }

      const compra = await res.json();
      // REGRA DE NEGÓCIO: toast de sucesso antes do redirect para feedback imediato.
      toast.success(`Compra ${compra?.numero || ""} registrada com sucesso!`);
      setTimeout(() => router.push("/metal/historico"), 400);
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

  const acimaTeto = numericValor > maxLimit;
  const aprovadorConfigurado = !!configs.metal_aprovador_id?.trim();
  const motivoBloqueio =
    !fotoBase64
      ? "Envie a foto da balança para continuar."
      : numericPeso <= 0
      ? "Informe o peso do metal para continuar."
      : !iaMatch
      ? "A validação da IA precisa confirmar o peso da balança."
      : acimaTeto && !aprovadorConfigurado
      ? "Defina o aprovador em Configurações > Aprovadores > Compra de Metal acima do teto."
      : "";

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
        onIaResult={(r) => { setIaMatch(r?.match === true); }}
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
            <div className="h-4 bg-[#1A3C34] rounded-full overflow-hidden relative">
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
            {acimaTeto && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg mt-2">
                <AlertTriangle size={14} />
                <span>
                  Valor acima do teto (R$ {maxLimit.toFixed(2)}/g). Será necessário aprovação
                  {configs.metal_aprovador_id
                    ? " do responsável."
                    : ". Nenhum aprovador configurado em Configurações > Aprovadores."}
                </span>
              </div>
            )}
            {numericValor <= maxLimit && (
              <>
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
              </>
            )}
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
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
            acimaTeto
              ? "bg-amber-500 text-white hover:bg-amber-600"
              : "bg-[#1A3C34] text-[#C59B6D] hover:bg-[#132A26]"
          }`}
        >
          {submitting ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              {acimaTeto ? "Enviando..." : "Registrando..."}
            </>
          ) : acimaTeto ? (
            "Solicitar Aprovação"
          ) : (
            "Registrar Compra"
          )}
        </button>
      </div>

      {acimaTeto && !aprovadorConfigurado && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Para solicitar aprovação acima do teto, selecione o aprovador em Configurações &gt; Aprovadores &gt; Compra de Metal acima do teto.
        </p>
      )}

      {!submitting && !!motivoBloqueio && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {motivoBloqueio}
        </p>
      )}
    </form>
  );
}
