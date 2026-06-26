"use client";

// ═══════════════════════════════════════════════════════════════════════════
// TASK-021: RecebimentoForm — Formulário de Recebimento de Metal
//
// REGRA DE NEGÓCIO:
//   - Cliente entrega metal como parte do pagamento de uma joia
//   - SEMPRE vinculado a uma venda (venda_id)
//   - Crédito/g entre receb_metal_min_pct e max_pct da cotação
//   - Se exceder teto, marca excedeu_teto (alerta visual)
//   - Se crédito > venda, excedente vira saldo do cliente
//   - Metal entra IMEDIATAMENTE no cofre_ouro
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Scale, Calculator, AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import ClienteSelector from "./ClienteSelector";
import FotoBalancaInput from "./FotoBalancaInput";
import type { ClienteOption } from "./ClienteSelector";
import type { MetalConfig } from "@/lib/metal/types";

interface RecebimentoFormProps {
  cotacaoOuro: number;
  configs: MetalConfig;
}

export default function RecebimentoForm({ cotacaoOuro, configs }: RecebimentoFormProps) {
  const router = useRouter();
  const [cliente, setCliente] = useState<ClienteOption | null>(null);
  const [vendaId, setVendaId] = useState("");
  const [valorVenda, setValorVenda] = useState<number | null>(null);
  const [peso, setPeso] = useState("");
  const [creditoGrama, setCreditoGrama] = useState("");
  const [observacao, setObservacao] = useState("");
  const [fotoBase64, setFotoBase64] = useState("");
  const [fotoMediaType, setFotoMediaType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [buscaVenda, setBuscaVenda] = useState<"idle" | "loading" | "found" | "error">("idle");
  // Controle de validação IA: só habilita submit se o peso bater com a foto
  const [iaMatch, setIaMatch] = useState(false);

  // Reseta validação IA sempre que o peso mudar (nova conferência necessária)
  useEffect(() => {
    setIaMatch(false);
  }, [peso]);

  // Cálculos
  const numericPeso = parseFloat(peso) || 0;
  const numericCredito = parseFloat(creditoGrama) || 0;
  const minLimit = cotacaoOuro * (configs.receb_metal_min_pct / 100);
  const maxLimit = cotacaoOuro * (configs.receb_metal_max_pct / 100);
  const excedeuTeto = numericCredito > maxLimit;
  const acimaTeto = numericCredito > maxLimit;
  const aprovadorConfigurado = !!configs.metal_aprovador_id?.trim();
  const valorTotal = numericPeso * numericCredito;

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

  const creditoAplicado = valorVenda !== null ? Math.min(valorTotal, valorVenda) : valorTotal;
  const creditoExcedente = valorVenda !== null ? Math.max(0, valorTotal - valorVenda) : 0;

  async function buscarVenda() {
    const id = parseInt(vendaId);
    if (!id) return;

    setBuscaVenda("loading");
    try {
      const res = await fetch(`/api/vendas/${id}`);
      if (!res.ok) throw new Error("Venda não encontrada");

      const data = await res.json();
      setValorVenda(parseFloat(data.total_venda ?? data.total ?? 0));
      setBuscaVenda("found");
    } catch {
      setBuscaVenda("error");
      setValorVenda(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!cliente) { setError("Selecione o cliente"); return; }
    if (!vendaId || !parseInt(vendaId)) { setError("Informe o ID da venda"); return; }
    if (!peso || numericPeso <= 0) { setError("Informe o peso do metal"); return; }
    if (!creditoGrama || numericCredito <= 0) { setError("Informe o valor do crédito"); return; }
    if (acimaTeto && !aprovadorConfigurado) {
      setError("Defina o aprovador em Configurações > Aprovadores > Compra de Metal acima do teto.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/metal/recebimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: cliente.id_contato,
          venda_id: parseInt(vendaId),
          peso_gramas: numericPeso,
          valor_credito_grama: numericCredito,
          foto_base64: fotoBase64 || undefined,
          foto_media_type: fotoMediaType || undefined,
          observacao: observacao || null,
          acima_teto: acimaTeto || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || "Erro ao registrar recebimento");
      }

      const result = await res.json();
      if (result.status === "pendente_aprovacao") {
        toast.success(`Recebimento ${result?.numero || ""} enviado para aprovação!`);
      } else {
        toast.success(`Recebimento ${result?.numero || ""} registrado!`);
      }
      setTimeout(() => router.push("/metal/historico"), 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar recebimento");
    } finally {
      setSubmitting(false);
    }
  }

  const pctMin = configs.receb_metal_min_pct;
  const pctMax = configs.receb_metal_max_pct;
  const faixaSize = pctMax - pctMin;
  const posicao = numericCredito > 0 ? ((numericCredito - minLimit) / (maxLimit - minLimit)) * 100 : 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Cliente */}
      <ClienteSelector
        label="Cliente"
        value={cliente}
        onChange={setCliente}
        placeholder="Buscar cliente por nome ou CPF..."
        error={error && !cliente ? "Selecione o cliente" : undefined}
      />

      {/* Venda */}
      <div className="bg-white p-4 rounded-xl border border-[#C59B6D]/30 shadow-sm">
        <label className="block text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1">
          Venda
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            value={vendaId}
            onChange={(e) => setVendaId(e.target.value)}
            placeholder="ID da venda..."
            className="flex-1 bg-transparent text-lg font-bold text-[#1A3C34] outline-none placeholder-[#1A3C34]/20"
          />
          <button
            type="button"
            onClick={buscarVenda}
            disabled={buscaVenda === "loading" || !vendaId}
            className="px-3 py-1 bg-[#1A3C34] text-[#C59B6D] rounded-lg text-[10px] font-bold hover:bg-[#132A26] disabled:opacity-50 flex items-center gap-1"
          >
            {buscaVenda === "loading" ? (
              <><div className="w-3 h-3 border border-[#C59B6D] border-t-transparent rounded-full animate-spin" /> Buscando</>
            ) : "Buscar"}
          </button>
        </div>

        {buscaVenda === "found" && valorVenda !== null && (
          <p className="text-emerald-600 text-xs font-bold mt-1">
            Valor da venda: R$ {valorVenda.toFixed(2)}
          </p>
        )}
        {buscaVenda === "error" && (
          <p className="text-red-500 text-xs mt-1">Venda não encontrada</p>
        )}
      </div>

      {/* Peso */}
      <div className="bg-white p-4 rounded-xl border border-[#C59B6D]/30 shadow-sm">
        <label className="block text-[10px] font-bold text-[#1A3C34]/60 uppercase tracking-wide mb-1 flex items-center gap-1">
          <Scale size={12} /> Peso do Metal (g)
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
        onFotoChange={(b, mt) => { setFotoBase64(b); setFotoMediaType(mt); }}
        onIaResult={(r) => { setIaMatch(r?.match === true); }}
      />

      {/* Crédito */}
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
            Valor de Crédito por Grama
          </label>
          <input
            type="number"
            step="0.01"
            value={creditoGrama}
            onChange={(e) => setCreditoGrama(e.target.value)}
            placeholder={minLimit.toFixed(2)}
            className={`w-full bg-transparent text-3xl font-bold outline-none mb-2 ${
              excedeuTeto ? "text-amber-400" : numericCredito > 0 ? "text-emerald-400" : "text-white"
            }`}
          />
          {excedeuTeto && (
            <div className="flex items-center gap-1 text-amber-400 text-[10px] font-bold mt-1">
              <AlertTriangle size={12} />
              Valor acima do teto ({pctMax}% da cotação)
            </div>
          )}

          <div className="mt-3">
            <div className="flex justify-between text-[9px] font-bold opacity-60 mb-1">
              <span>R$ {minLimit.toFixed(2)} ({pctMin}%)</span>
              <span>R$ {maxLimit.toFixed(2)} ({pctMax}%)</span>
            </div>
            <div className="h-4 bg-[#1A3C34] rounded-full overflow-hidden relative">
              <div
                className={`h-full rounded-full transition-all ${
                  excedeuTeto ? "bg-amber-500" : numericCredito > 0 ? "bg-emerald-500" : "bg-[#C59B6D]/30"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, posicao))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Resumo */}
      {numericPeso > 0 && numericCredito > 0 && valorVenda !== null && (
        <div className="bg-white border-2 border-[#1A3C34] rounded-2xl p-5 shadow-lg">
          <h3 className="text-[10px] font-bold uppercase text-[#C59B6D] mb-3 flex items-center gap-1">
            <Calculator size={12} /> Resumo do Crédito
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#1A3C34]/60">Crédito Total</span>
              <span className="font-bold">R$ {valorTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#1A3C34]/60">Valor da Venda</span>
              <span className="font-bold">R$ {valorVenda.toFixed(2)}</span>
            </div>
            <div className="border-t border-[#1A3C34]/10 pt-2">
              <div className="flex justify-between text-emerald-700 font-bold">
                <span>Abatido na Venda</span>
                <span>R$ {creditoAplicado.toFixed(2)}</span>
              </div>
              {creditoExcedente > 0 && (
                <div className="flex justify-between text-amber-600 font-bold mt-1">
                  <span>Excedente → Saldo do Cliente</span>
                  <span>R$ {creditoExcedente.toFixed(2)}</span>
                </div>
              )}
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
          placeholder="Observações..."
          rows={2}
          className="w-full bg-transparent text-sm text-[#1A3C34] outline-none placeholder-[#1A3C34]/30 resize-none"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* REGRA DE NEGÓCIO: motivo de bloqueio explica por que o botão de submit
          está desabilitado, igual ao CompraForm. */}
      {!submitting && !!motivoBloqueio && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {motivoBloqueio}
        </p>
      )}

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
          disabled={submitting || !fotoBase64 || numericPeso <= 0 || !iaMatch || (acimaTeto && !aprovadorConfigurado)}
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
            "Registrar Recebimento"
          )}
        </button>
      </div>

      {acimaTeto && !aprovadorConfigurado && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Para solicitar aprovação acima do teto, selecione o aprovador em Configurações &gt; Aprovadores &gt; Compra de Metal acima do teto.
        </p>
      )}
    </form>
  );
}
