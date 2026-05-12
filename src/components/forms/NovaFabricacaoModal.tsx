"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Search, Factory } from "lucide-react";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

interface ProdutoOption {
  id_produto: number;
  nome: string;
  sku: string | null;
}

interface DepositoOption {
  id: number;
  nome: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

// Modal de criação de ORDEM DE FABRICAÇÃO manual (Fase 2 da rota de fabricação).
// Apenas INSERT em alissonerp.ordens — triggers já existentes criam auditoria
// + aprovam + criam PCP automaticamente (rota_etapa_atual=1, etapa novas_ordens).
export default function NovaFabricacaoModal({ isOpen, onClose, onSuccess }: Props) {
  // Produto (autocomplete)
  const [produtoBusca, setProdutoBusca] = useState("");
  const [produtoResults, setProdutoResults] = useState<ProdutoOption[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoOption | null>(null);
  const [buscandoProduto, setBuscandoProduto] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Form
  const [quantidade, setQuantidade] = useState<number>(1);
  const [peso, setPeso] = useState<string>("");
  const [dataEntrega, setDataEntrega] = useState<string>("");
  const [detalhes, setDetalhes] = useState<string>("");
  const [depositos, setDepositos] = useState<DepositoOption[]>([]);
  const [depositoId, setDepositoId] = useState<number | "">("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ numero_ordem: string; pcp_id: number | null } | null>(null);
  // Timer de "fechar após sucesso" — cancelado se modal desmontar antes
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Reset ao abrir
  useEffect(() => {
    if (!isOpen) return;
    setProdutoBusca("");
    setProdutoResults([]);
    setProdutoSelecionado(null);
    setQuantidade(1);
    setPeso("");
    setDataEntrega("");
    setDetalhes("");
    setDepositoId("");
    setError("");
    setSuccess(null);

    // Carrega depósitos pra atribuir operador
    fetch("/api/pcp/depositos")
      .then((r) => r.ok ? r.json() : [])
      .then((data: DepositoOption[]) => {
        setDepositos(Array.isArray(data) ? data.filter((d) => d.id !== 1) : []);
      })
      .catch(() => { /* silencioso */ });
  }, [isOpen]);

  // Autocomplete de produto (debounce 250ms, min 2 chars)
  useEffect(() => {
    if (produtoSelecionado) return; // já tem seleção
    const q = produtoBusca.trim();
    if (q.length < 2) {
      setProdutoResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setBuscandoProduto(true);
      try {
        const res = await fetch(`/api/produtos/busca?q=${encodeURIComponent(q)}&limit=10`);
        if (res.ok) {
          const data = await res.json() as ProdutoOption[];
          setProdutoResults(Array.isArray(data) ? data : []);
        }
      } catch { /* silencioso */ }
      finally { setBuscandoProduto(false); }
    }, 250);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [produtoBusca, produtoSelecionado]);

  async function handleSubmit() {
    setError("");
    if (!produtoSelecionado) { setError("Selecione um produto"); return; }
    const pesoNum = parseFloat(peso.replace(",", "."));
    if (!Number.isFinite(pesoNum) || pesoNum <= 0) { setError("Peso deve ser maior que 0"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/ordens-fabricacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_id: produtoSelecionado.id_produto,
          quantidade,
          peso_metal_negociado: pesoNum,
          data_entrega: dataEntrega || null,
          detalhes: detalhes.trim() || null,
          deposito_id: depositoId === "" ? null : Number(depositoId),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? `Erro ${res.status}`);
        setLoading(false);
        return;
      }
      const data = await res.json() as { numero_ordem: string; pcp_id: number | null };
      setSuccess(data);
      closeTimerRef.current = window.setTimeout(() => { onSuccess?.(); onClose(); }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede");
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <div className="flex items-center gap-2">
            <Factory size={20} style={{ color: C.esmeralda }} />
            <div>
              <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
                Nova Fabricação
              </h3>
              <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
                Ordem manual de fabricação (tipo: fabricacao, rota: PCP)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
          >
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4 flex-1">
          {/* Produto */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Produto *</label>
            {produtoSelecionado ? (
              <div
                className="flex items-center justify-between px-3 py-2 rounded-lg border"
                style={{ borderColor: C.esmeralda + "40", backgroundColor: "#18403608" }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: C.esmeralda }}>
                    {produtoSelecionado.nome}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    SKU: {produtoSelecionado.sku ?? "—"} · ID {produtoSelecionado.id_produto}
                  </p>
                </div>
                <button
                  onClick={() => { setProdutoSelecionado(null); setProdutoBusca(""); }}
                  className="text-[11px] text-red-500 hover:text-red-700 ml-3 shrink-0"
                >
                  trocar
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
                <input
                  type="text"
                  value={produtoBusca}
                  onChange={(e) => setProdutoBusca(e.target.value)}
                  placeholder="Buscar por nome ou SKU..."
                  className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
                {buscandoProduto && (
                  <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: C.esmeralda }} />
                )}
                {produtoResults.length > 0 && (
                  <div
                    className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border bg-white shadow-lg"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    {produtoResults.map((p) => (
                      <button
                        key={p.id_produto}
                        onClick={() => { setProdutoSelecionado(p); setProdutoResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0"
                        style={{ borderColor: C.cremeBorder }}
                      >
                        <p className="text-sm font-medium truncate" style={{ color: "#111827" }}>{p.nome}</p>
                        <p className="text-[10px] text-gray-500">SKU: {p.sku ?? "—"}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Peso + Quantidade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Peso estimado (g) *</label>
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                placeholder="5.0"
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Quantidade</label>
              <input
                type="number"
                min={1}
                step={1}
                value={quantidade}
                onChange={(e) => setQuantidade(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
          </div>

          {/* Data entrega + Operador */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Data entrega</label>
              <input
                type="date"
                value={dataEntrega}
                onChange={(e) => setDataEntrega(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-gray-500 mb-1">Operador inicial</label>
              <select
                value={depositoId}
                onChange={(e) => setDepositoId(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none bg-white"
                style={{ borderColor: C.cremeBorder }}
              >
                <option value="">— atribuir depois —</option>
                {depositos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Detalhes */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 mb-1">Detalhes / observações</label>
            <textarea
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
              rows={2}
              placeholder="Anotações sobre a fabricação..."
              className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>

          {error && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
            >
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
            >
              <CheckCircle size={14} className="shrink-0" />
              {success.numero_ordem} criada! PCP #{success.pcp_id}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-end gap-3" style={{ borderColor: C.cremeBorder }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[13px]"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !!success || !produtoSelecionado || !peso}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? <><Loader2 size={14} className="animate-spin" />Criando...</> : "Criar Fabricação"}
          </button>
        </div>
      </div>
    </div>
  );
}
