"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Search } from "lucide-react";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

interface ProdutoOption {
  id_produto: number;
  nome: string;
  sku: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * REGRA DE NEGOCIO: passo 1 do fluxo — a consultora solicita a(s) peca(s).
 * Pode escolher produtos por SKU (poucas pecas) E/OU escrever uma descricao
 * livre para lote grande ("todos os aneis da vitrine 3"). Sem foto aqui — a
 * peca ainda esta no estoque; a foto entra na entrega.
 */
export default function SolicitarPecaModal({ isOpen, onClose, onSuccess }: Props) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ProdutoOption[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [selecionados, setSelecionados] = useState<ProdutoOption[]>([]);
  const [descricao, setDescricao] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBusca(""); setResultados([]); setSelecionados([]); setDescricao("");
    setError(""); setSuccess(false);
  }, [isOpen]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (busca.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    debounceRef.current = setTimeout(() => {
      fetch(`/api/produtos/busca?q=${encodeURIComponent(busca.trim())}&limit=15`)
        .then((r) => r.json())
        .then((data) => setResultados(Array.isArray(data) ? data : []))
        .catch(() => setResultados([]))
        .finally(() => setBuscando(false));
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca]);

  function toggleProduto(p: ProdutoOption) {
    setSelecionados((prev) =>
      prev.some((s) => s.id_produto === p.id_produto)
        ? prev.filter((s) => s.id_produto !== p.id_produto)
        : [...prev, p]
    );
  }

  const podeEnviar = selecionados.length > 0 || descricao.trim().length > 0;

  async function handleSubmit() {
    setError("");
    if (!podeEnviar) { setError("Selecione ao menos um produto ou escreva uma descricao."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/solicitacao-peca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          produto_ids: selecionados.map((p) => p.id_produto),
          descricao: descricao.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao solicitar");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Solicitar Peça</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              {selecionados.length > 0 ? `${selecionados.length} produto(s)` : "por SKU ou descrição"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
            <input
              type="text"
              placeholder="Buscar produto por nome ou SKU..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full pl-8 pr-3 py-3 md:py-2 rounded-lg border text-base md:text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>
          {selecionados.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {selecionados.map((p) => (
                <span key={p.id_produto} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px]" style={{ backgroundColor: "#18403612", color: C.esmeralda }}>
                  {p.nome}
                  <button onClick={() => toggleProduto(p)}><X size={11} /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-2" style={{ minHeight: 100 }}>
          {buscando ? (
            <div className="flex items-center justify-center py-6"><Loader2 size={20} className="animate-spin" style={{ color: "#9CA3AF" }} /></div>
          ) : busca.trim().length < 2 ? (
            <p className="text-center py-6 text-sm" style={{ color: "#9CA3AF" }}>Digite ao menos 2 letras pra buscar</p>
          ) : resultados.length === 0 ? (
            <p className="text-center py-6 text-sm" style={{ color: "#9CA3AF" }}>Nenhum produto encontrado</p>
          ) : (
            <div className="space-y-1">
              {resultados.map((p) => {
                const isSelected = selecionados.some((s) => s.id_produto === p.id_produto);
                return (
                  <button key={p.id_produto} onClick={() => toggleProduto(p)}
                    className="w-full flex items-center gap-3 px-3 py-3.5 md:py-2.5 rounded-lg text-left transition-colors active:scale-[0.98]"
                    style={{ backgroundColor: isSelected ? "#18403612" : "transparent", border: `1px solid ${isSelected ? C.esmeralda + "40" : C.cremeBorder}` }}>
                    <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors"
                      style={{ backgroundColor: isSelected ? C.esmeralda : "#fff", borderColor: isSelected ? C.esmeralda : "#D1D5DB" }}>
                      {isSelected && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3L3.5 5.5L8 1" stroke="#F3EADA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: C.esmeralda }}>{p.nome}</p>
                      <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{p.sku ?? "—"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="px-6 pb-3 shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
            Descrição (para lote grande)
          </p>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="Ex: todos os anéis da vitrine 3"
            rows={2}
            className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
            style={{ borderColor: C.cremeBorder }}
          />
        </div>

        <div className="px-6 py-4 border-t shrink-0 space-y-3" style={{ borderColor: C.cremeBorder }}>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Solicitado!
            </div>
          )}
          <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2 md:gap-3">
            <button onClick={onClose} className="px-4 py-2.5 md:py-2 rounded-lg text-[13px] text-center" style={{ color: "#6B7280" }}>Cancelar</button>
            <button onClick={handleSubmit} disabled={loading || success || !podeEnviar}
              className="flex items-center justify-center gap-2 px-5 py-3 md:py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 w-full md:w-auto"
              style={{ backgroundColor: C.esmeralda, color: C.creme, minHeight: 44 }}>
              {loading ? <><Loader2 size={14} className="animate-spin" />Solicitando...</> : "Solicitar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
