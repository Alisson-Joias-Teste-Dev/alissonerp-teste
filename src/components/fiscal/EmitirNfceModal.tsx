"use client";

import { useState } from "react";
import { X, Plus, Loader2, Receipt, CheckCircle, Clock, XCircle } from "lucide-react";

const C = { esmeralda: "#184036", cremeBorder: "#E8DCC8", creme: "#F3EADA", cremeBg: "#FAFAF7" };

const FORMAS_PAGAMENTO = [
  { code: "01", label: "Dinheiro" },
  { code: "03", label: "Cartão Crédito" },
  { code: "04", label: "Cartão Débito" },
  { code: "05", label: "Crédito Loja" },
  { code: "99", label: "Outros" },
];

interface Pagamento {
  forma: string;
  valor: string;
}

interface Props {
  venda: { id: number; numero_venda: string; total_venda: number; cliente_id?: number | null };
  onClose: () => void;
  onSuccess: (result: { nota_fiscal_id: number; status: string; numero?: number; chave_44?: string }) => void;
}

type ResultadoEmissao = {
  nota_fiscal_id: number;
  status: string;
  numero?: number;
  chave_44?: string;
  mensagem_sefaz?: string;
};

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function parsePagamentos(pagamentos: Pagamento[]): { forma: string; valor: number }[] {
  return pagamentos.map((p) => ({ forma: p.forma, valor: parseFloat(p.valor.replace(",", ".")) || 0 }));
}

export default function EmitirNfceModal({ venda, onClose, onSuccess }: Props) {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([
    { forma: "01", valor: venda.total_venda.toFixed(2) },
  ]);
  const [incluirCliente, setIncluirCliente] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoEmissao | null>(null);

  const totalPagamentos = parsePagamentos(pagamentos).reduce((s, p) => s + p.valor, 0);
  const diferenca = Math.abs(totalPagamentos - venda.total_venda);
  const pagamentosOk = diferenca < 0.01;

  function addLinha() {
    setPagamentos((prev) => [...prev, { forma: "01", valor: "0.00" }]);
  }

  function removeLinha(idx: number) {
    if (pagamentos.length <= 1) return;
    setPagamentos((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLinha(idx: number, field: keyof Pagamento, value: string) {
    setPagamentos((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  }

  async function emitir() {
    if (!pagamentosOk) return;
    setLoading(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        venda_id: venda.id,
        pagamentos: parsePagamentos(pagamentos),
      };
      if (incluirCliente && venda.cliente_id) {
        body.cliente_id = venda.cliente_id;
      }
      const res = await fetch("/api/fiscal/emitir/nfce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setResultado(j);
      onSuccess(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao emitir NFC-e");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg border" style={{ borderColor: C.cremeBorder }}>
        {/* Cabeçalho */}
        <header
          className="px-6 py-4 flex items-center justify-between rounded-t-xl"
          style={{ background: C.creme }}
        >
          <div className="flex items-center gap-2">
            <Receipt size={18} style={{ color: C.esmeralda }} />
            <h2 className="text-lg font-serif" style={{ color: C.esmeralda }}>
              Emitir NFC-e — Venda #{venda.numero_venda}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors">
            <X size={20} />
          </button>
        </header>

        <div className="p-6 space-y-5">
          {/* Resultado */}
          {resultado ? (
            <div className="space-y-4">
              {resultado.status === "autorizada" && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle size={48} className="text-emerald-600" />
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-emerald-100 text-emerald-800">
                    Autorizada
                  </span>
                  {resultado.numero && (
                    <p className="text-sm text-gray-700">
                      Nota Fiscal nº <span className="font-semibold">{resultado.numero}</span>
                    </p>
                  )}
                  {resultado.chave_44 && (
                    <p className="text-[11px] font-mono text-gray-500 break-all text-center px-2">
                      {resultado.chave_44}
                    </p>
                  )}
                </div>
              )}
              {resultado.status === "processando" && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <Clock size={48} className="text-yellow-500" />
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800">
                    Aguardando SEFAZ
                  </span>
                  <p className="text-sm text-gray-600 text-center">
                    A nota está sendo processada. Você será notificado quando a SEFAZ confirmar.
                  </p>
                </div>
              )}
              {resultado.status === "rejeitada" && (
                <div className="flex flex-col items-center gap-3 py-4">
                  <XCircle size={48} className="text-red-500" />
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-red-100 text-red-800">
                    Rejeitada
                  </span>
                  {resultado.mensagem_sefaz && (
                    <p className="text-sm text-red-700 text-center">{resultado.mensagem_sefaz}</p>
                  )}
                </div>
              )}
              <div className="flex justify-center">
                <button
                  onClick={onClose}
                  className="px-6 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: C.esmeralda }}
                >
                  Fechar
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Formas de Pagamento */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium" style={{ color: C.esmeralda }}>
                    Formas de Pagamento
                  </h3>
                  <button
                    onClick={addLinha}
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border hover:bg-stone-50 transition-colors"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                  >
                    <Plus size={12} /> Adicionar
                  </button>
                </div>

                <div className="space-y-2">
                  {pagamentos.map((p, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <select
                        value={p.forma}
                        onChange={(e) => updateLinha(idx, "forma", e.target.value)}
                        className="flex-1 border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-emerald-700"
                        style={{ borderColor: C.cremeBorder }}
                      >
                        {FORMAS_PAGAMENTO.map((f) => (
                          <option key={f.code} value={f.code}>{f.label}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={p.valor}
                        onChange={(e) => updateLinha(idx, "valor", e.target.value)}
                        className="w-32 border rounded-lg px-2 py-1.5 text-sm text-right tabular-nums outline-none focus:border-emerald-700"
                        style={{ borderColor: C.cremeBorder }}
                      />
                      <button
                        onClick={() => removeLinha(idx)}
                        disabled={pagamentos.length <= 1}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Resumo totais */}
                <div className="mt-3 flex justify-between items-center text-sm border-t pt-3" style={{ borderColor: C.cremeBorder }}>
                  <span className="text-gray-500">Total da venda:</span>
                  <span className="font-semibold tabular-nums" style={{ color: C.esmeralda }}>{fmt(venda.total_venda)}</span>
                </div>
                <div className="flex justify-between items-center text-sm mt-1">
                  <span className="text-gray-500">Total pagamentos:</span>
                  <span className={`font-semibold tabular-nums ${pagamentosOk ? "text-emerald-700" : "text-red-600"}`}>
                    {fmt(totalPagamentos)}
                  </span>
                </div>
                {!pagamentosOk && (
                  <p className="mt-1.5 text-xs text-red-600">
                    Diferença de {fmt(totalPagamentos - venda.total_venda)} — ajuste os valores.
                  </p>
                )}
              </section>

              {/* Checkbox cliente */}
              {venda.cliente_id && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={incluirCliente}
                    onChange={(e) => setIncluirCliente(e.target.checked)}
                    className="w-4 h-4 accent-emerald-700"
                  />
                  <span className="text-sm text-gray-700">Incluir dados do cliente na nota</span>
                </label>
              )}

              {/* Erro */}
              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
                  {error}
                </div>
              )}

              {/* Footer */}
              <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg border text-sm"
                  style={{ borderColor: C.cremeBorder }}
                >
                  Cancelar
                </button>
                <button
                  onClick={emitir}
                  disabled={!pagamentosOk || loading}
                  className="px-5 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-2 disabled:opacity-50 transition-opacity"
                  style={{ background: C.esmeralda }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Emitindo...
                    </>
                  ) : (
                    <>
                      <Receipt size={14} />
                      Emitir NFC-e
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
