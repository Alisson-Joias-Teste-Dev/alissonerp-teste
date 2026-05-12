"use client";

import { useState, useRef } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Camera, RotateCcw, Trash2, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

interface ConversaoItem {
  key: string;
  produto_id: number;
  nome_produto: string;
  sku: string;
  peso_total: string;      // peso total da conversão (NÃO multiplicado pela qtd)
  quantidade: string;
  disponivel: number;       // saldo disponível na loja (para limitar qtd)
}

interface SearchResult {
  id_produto: number;
  nome: string;
  sku: string | null;
  disponivel: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  produtoPreSelecionado?: { id: number; nome: string; sku: string; disponivel?: number } | null;
}

export default function ConversaoModal({ isOpen, onClose, onSuccess, produtoPreSelecionado }: Props) {
  const [itens, setItens] = useState<ConversaoItem[]>(() => {
    if (produtoPreSelecionado) {
      return [{
        key: Math.random().toString(36).slice(2),
        produto_id: produtoPreSelecionado.id,
        nome_produto: produtoPreSelecionado.nome,
        sku: produtoPreSelecionado.sku,
        peso_total: "",
        quantidade: "1",
        disponivel: produtoPreSelecionado.disponivel ?? 999,
      }];
    }
    return [];
  });
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── IDs já adicionados (para evitar duplicatas) ─────────────────────────
  const idsAdicionados = new Set(itens.map(i => i.produto_id));

  // ── Busca de produtos ──────────────────────────────────────────────────
  function buscarProdutos(term: string) {
    setSearchTerm(term);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!term || term.length < 2) { setSearchResults([]); return; }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/produtos/busca?q=${encodeURIComponent(term)}&limit=8&com_estoque=true`);
        if (r.ok) {
          const data: SearchResult[] = await r.json();
          // Filtra produtos já adicionados
          const filtrados = Array.isArray(data)
            ? data.filter(p => !idsAdicionados.has(p.id_produto))
            : [];
          setSearchResults(filtrados);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function adicionarItem(produto: SearchResult) {
    // Guard contra duplicata (segurança extra além do filtro)
    if (idsAdicionados.has(produto.id_produto)) return;

    setItens(prev => [...prev, {
      key: Math.random().toString(36).slice(2),
      produto_id: produto.id_produto,
      nome_produto: produto.nome,
      sku: produto.sku ?? "",
      peso_total: "",
      quantidade: "1",
      disponivel: produto.disponivel,
    }]);
    setSearchTerm("");
    setSearchResults([]);
  }

  function removerItem(key: string) {
    setItens(prev => prev.filter(i => i.key !== key));
  }

  function updateItem(key: string, field: keyof ConversaoItem, value: string | number | null) {
    setItens(prev => prev.map(i => {
      if (i.key !== key) return i;
      // Limitar quantidade ao disponível
      if (field === "quantidade") {
        const parsed = parseInt(String(value)) || 0;
        const max = i.disponivel;
        const clamped = Math.min(parsed, max);
        return { ...i, [field]: String(clamped) };
      }
      return { ...i, [field]: value };
    }));
  }

  // ── Cálculo do peso total (SOMA simples dos pesos_total) ──────────────
  const pesoTotal = itens.reduce((acc, item) => {
    return acc + (parseFloat(item.peso_total) || 0);
  }, 0);
  const quantidadeTotal = itens.reduce((acc, item) => acc + (parseInt(item.quantidade) || 0), 0);

  // ── Submit ─────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setError("");

    // Validações
    if (itens.length === 0) { setError("Adicione pelo menos um produto."); return; }
    for (const item of itens) {
      if (!item.produto_id) { setError("Produto inválido."); return; }
      const peso = parseFloat(item.peso_total);
      if (!peso || peso <= 0) { setError(`Peso total inválido para ${item.nome_produto}`); return; }
      const qtd = parseInt(item.quantidade);
      if (!qtd || qtd <= 0) { setError(`Quantidade inválida para ${item.nome_produto}`); return; }
      if (qtd > item.disponivel) { setError(`Quantidade excede o saldo disponível de ${item.nome_produto}`); return; }
    }
    if (!fotoFile) { setError("Foto de abertura é obrigatória."); return; }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      // Converter foto para base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(fotoFile);
      });

      const payload = {
        itens: itens.map(item => ({
          produto_id: item.produto_id!,
          peso_individual: parseFloat(item.peso_total), // DB column = peso_individual
          quantidade: parseInt(item.quantidade),
        })),
        foto_base64: base64,
      };

      const res = await fetch("/api/estoque-comercial/converter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);

      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao converter");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setError("");
    setSuccess(false);
    setFotoFile(null);
    setFotoPreview(null);
    setSearchResults([]);
    setSearchTerm("");
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Conversão de Estoque</h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              {itens.length} produto{itens.length !== 1 ? "s" : ""} · {quantidadeTotal} peça{quantidadeTotal !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Busca de produtos */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
              Adicionar Produto
            </p>
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por nome ou SKU..."
                value={searchTerm}
                onChange={(e) => buscarProdutos(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border text-sm outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
              {searching && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" style={{ color: "#9CA3AF" }} />
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="mt-1 rounded-lg overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
                {searchResults.map(p => (
                  <button
                    key={p.id_produto}
                    onClick={() => adicionarItem(p)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 text-left"
                  >
                    <span className="font-medium truncate mr-2" style={{ color: "#374151" }}>{p.nome}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-gray-400">{p.sku ?? "—"}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
                        {p.disponivel} disp.
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchTerm.length >= 2 && searchResults.length === 0 && !searching && (
              <p className="text-[11px] mt-1" style={{ color: "#9CA3AF" }}>
                Nenhum produto encontrado
                {idsAdicionados.size > 0 ? " (os já adicionados foram ocultados)" : ""}.
              </p>
            )}
          </div>

          {/* Lista de itens */}
          {itens.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>
                Produtos para Conversão
              </p>
              {itens.map((item) => (
                <div
                  key={item.key}
                  className="rounded-xl p-3"
                  style={{ border: `1px solid ${C.cremeBorder}`, backgroundColor: C.cremeBg }}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 flex-1 mr-2">
                      <p className="text-sm font-medium truncate" style={{ color: "#374151" }}>
                        {item.nome_produto}
                      </p>
                      {item.sku && (
                        <p className="text-xs text-gray-400 font-mono">{item.sku}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removerItem(item.key)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 shrink-0"
                    >
                      <Trash2 size={13} style={{ color: "#DC2626" }} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                        Peso Total (g) <span style={{ color: "#DC2626" }}>*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="ex: 5.0"
                        value={item.peso_total}
                        onChange={(e) => updateItem(item.key, "peso_total", e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white"
                        style={{ borderColor: C.cremeBorder }}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider mb-0.5" style={{ color: "#9CA3AF" }}>
                        Qtd <span style={{ color: "#DC2626" }}>*</span>
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={item.disponivel}
                        value={item.quantidade}
                        onChange={(e) => updateItem(item.key, "quantidade", e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border text-sm outline-none bg-white"
                        style={{ borderColor: C.cremeBorder }}
                      />
                      <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>
                        Saldo: <span className="font-medium">{item.disponivel}</span> disponível
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totalizador */}
          {itens.length > 0 && (
            <div className="rounded-xl p-3 flex items-center justify-between" style={{ backgroundColor: "#1840360D" }}>
              <div>
                <p className="text-xs font-medium" style={{ color: "#6B7280" }}>Total</p>
                <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{quantidadeTotal} peça{quantidadeTotal !== 1 ? "s" : ""}</p>
              </div>
              <p className="text-lg font-bold" style={{ color: C.esmeralda }}>{pesoTotal.toFixed(3)}g</p>
            </div>
          )}

          {/* Foto obrigatória */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
              Foto da Joia <span style={{ color: "#DC2626" }}>*</span>
            </p>
            {fotoPreview ? (
              <div className="relative rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoPreview} alt="Foto" className="w-full max-h-36 object-cover rounded-xl" />
                <button
                  onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
                >
                  <RotateCcw size={13} color="white" />
                </button>
              </div>
            ) : (
              <label
                className="flex flex-col items-center justify-center h-24 rounded-xl cursor-pointer transition-colors"
                style={{ border: `2px dashed ${C.cremeBorder}`, backgroundColor: C.cremeBg }}
              >
                <Camera size={22} style={{ color: "#9CA3AF" }} />
                <span className="text-xs mt-1.5" style={{ color: "#9CA3AF" }}>Tirar foto ou selecionar</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) { setFotoFile(file); setFotoPreview(URL.createObjectURL(file)); }
                  }}
                />
              </label>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 space-y-3" style={{ borderColor: C.cremeBorder }}>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Conversão criada! Aguardando aprovação.
            </div>
          )}
          <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2 md:gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2.5 md:py-2 rounded-lg text-[13px] text-center"
              style={{ color: "#6B7280" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || success || itens.length === 0 || !fotoFile}
              className="flex items-center justify-center gap-2 px-5 py-3 md:py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 w-full md:w-auto"
              style={{ backgroundColor: C.esmeralda, color: C.creme, minHeight: 44 }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin" />Convertendo...</> : `Confirmar Conversão (${pesoTotal.toFixed(1)}g)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
