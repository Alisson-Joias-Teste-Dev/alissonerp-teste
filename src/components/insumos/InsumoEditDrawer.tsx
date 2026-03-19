"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, AlertCircle, Upload, Trash2, ChevronDown, Search } from "lucide-react";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

const UNIDADES = ["g", "UN", "ml", "pç", "kg", "cm", "m", "ct", "mm", "l", "pc"];

// Categoria ID=2 = Pedras Preciosas → mostrar peso_pedra
const CAT_PEDRAS_ID = 2;

interface Categoria {
  id: number;
  nome: string;
}

interface Fornecedor {
  id_contato: number;
  nome: string;
}

interface InsumoData {
  id?: number;
  nome?: string;
  sku?: string | null;
  categoria_id?: number;
  unidade?: string;
  peso_pedra?: number | null;
  fornecedor_id?: number | null;
  observacao?: string | null;
  ativo?: boolean;
  foto?: string | null;
  custo_compra?: number | null;
  saldo?: number | null;
  saldo_real?: number | null;
  created_at?: string | null;
  estoque_minimo?: number | null;
  estoque_maximo?: number | null;
}

interface Props {
  insumo: InsumoData | null;   // null = modo criação
  categorias: Categoria[];
  onClose: () => void;
  onSaved: () => void;
}

// ── Compressão de imagem via canvas ─────────────────────────────────────────
async function compressImage(file: File, maxPx = 800, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        let w = width;
        let h = height;
        if (w > maxPx || h > maxPx) {
          if (w >= h) { h = Math.round((h * maxPx) / w); w = maxPx; }
          else { w = Math.round((w * maxPx) / h); h = maxPx; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { reject(new Error("Canvas context unavailable")); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Hook de debounce ─────────────────────────────────────────────────────────
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Componente FornecedorAutocomplete ────────────────────────────────────────
function FornecedorAutocomplete({
  value,
  onChange,
}: {
  value: { id: number; nome: string } | null;
  onChange: (v: { id: number; nome: string } | null) => void;
}) {
  const [query, setQuery] = useState(value?.nome ?? "");
  const [options, setOptions] = useState<Fornecedor[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 400);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) setQuery(value.nome);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/insumos/fornecedores?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data) => { setOptions(Array.isArray(data) ? data : []); })
      .catch(() => setOptions([]))
      .finally(() => setLoading(false));
  }, [debouncedQuery, open]);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectFornecedor(f: Fornecedor) {
    onChange({ id: f.id_contato, nome: f.nome });
    setQuery(f.nome);
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setQuery("");
    setOptions([]);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <Search size={13} className="absolute left-3 pointer-events-none" style={{ color: "#9CA3AF" }} />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange(null); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar fornecedor..."
          className="w-full pl-8 pr-8 py-2 rounded-lg text-sm border outline-none focus:ring-1"
          style={{ borderColor: C.cremeBorder }}
        />
        {(value || query) && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5"
          >
            <X size={13} style={{ color: "#9CA3AF" }} />
          </button>
        )}
      </div>
      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-lg border shadow-lg max-h-48 overflow-y-auto"
          style={{ borderColor: C.cremeBorder }}
        >
          {loading && (
            <div className="flex items-center gap-2 px-3 py-2.5 text-[12px]" style={{ color: "#9CA3AF" }}>
              <Loader2 size={12} className="animate-spin" /> Buscando...
            </div>
          )}
          {!loading && options.length === 0 && (
            <div className="px-3 py-2.5 text-[12px]" style={{ color: "#9CA3AF" }}>
              {query ? "Nenhum resultado" : "Digite para buscar"}
            </div>
          )}
          {!loading && options.map((f) => (
            <button
              key={f.id_contato}
              type="button"
              onClick={() => selectFornecedor(f)}
              className="w-full text-left px-3 py-2 text-[13px] hover:bg-gray-50 transition-colors"
              style={{ color: "#111827" }}
            >
              {f.nome}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function InsumoEditDrawer({ insumo, categorias, onClose, onSaved }: Props) {
  const isEdicao = insumo !== null && insumo?.id !== undefined;

  // Campos editáveis
  const [nome, setNome] = useState(insumo?.nome ?? "");
  const [sku, setSku] = useState(insumo?.sku ?? "");
  const [categoriaId, setCategoriaId] = useState<number | "">(insumo?.categoria_id ?? "");
  const [unidade, setUnidade] = useState(insumo?.unidade ?? "g");
  const [pesoPedra, setPesoPedra] = useState(insumo?.peso_pedra != null ? String(insumo.peso_pedra) : "");
  const [observacao, setObservacao] = useState(insumo?.observacao ?? "");
  const [ativo, setAtivo] = useState(insumo?.ativo !== false);
  const [fornecedor, setFornecedor] = useState<{ id: number; nome: string } | null>(null);

  // Foto
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [fotoBase64, setFotoBase64] = useState<string | null>(null); // nova foto a enviar
  const [fotoRemover, setFotoRemover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Foto original do servidor — para exibir se não trocou
  const fotoOriginal = insumo?.foto ?? null;

  console.log('[drawer] insumo recebido:', insumo?.id, 'foto:', insumo?.foto);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Inicializar fornecedor ao abrir drawer
  useEffect(() => {
    setFornecedor(null);
  }, [insumo?.id]);

  // URL pública direta — bucket é público, não precisa de signed URL nem API call
  const fotoOriginalUrl = (!fotoBase64 && !fotoRemover && fotoOriginal) ? fotoOriginal : null;

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file, 800, 0.8);
      setFotoBase64(compressed);
      setFotoPreview(compressed);
      setFotoRemover(false);
    } catch {
      setError("Erro ao processar imagem");
    }
    // Reset input
    e.target.value = "";
  }, []);

  function handleRemoverFoto() {
    setFotoBase64(null);
    setFotoPreview(null);
    setFotoRemover(true);
  }

  const fotoExibida = fotoPreview ?? fotoOriginalUrl;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { setError("Nome é obrigatório."); return; }
    if (!categoriaId) { setError("Categoria é obrigatória."); return; }

    setLoading(true);
    setError("");

    try {
      const payload: Record<string, unknown> = {
        nome: nome.trim(),
        sku: sku.trim() || undefined,
        categoria_id: Number(categoriaId),
        unidade,
        observacao: observacao.trim() || null,
        ativo,
        fornecedor_id: fornecedor?.id ?? null,
      };

      if (categoriaId === CAT_PEDRAS_ID) {
        payload.peso_pedra = pesoPedra ? Number(pesoPedra) : null;
      }

      if (fotoBase64) {
        payload.foto = fotoBase64;
      } else if (fotoRemover) {
        payload.foto_remover = true;
      }

      const url = isEdicao ? `/api/insumos/${insumo!.id}` : "/api/insumos";
      const method = isEdicao ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao salvar insumo");
    } finally {
      setLoading(false);
    }
  }

  const isCatPedras = Number(categoriaId) === CAT_PEDRAS_ID;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 h-full w-full md:w-[520px] bg-white z-50 flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: "#111827" }}>
              {isEdicao ? "Editar Insumo" : "Novo Insumo"}
            </h2>
            {isEdicao && (
              <p className="text-[11px] mt-0.5" style={{ color: "#9CA3AF" }}>
                ID #{insumo!.id}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <X size={16} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            {/* ── Foto ── */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
                Foto
              </label>
              <div className="flex items-start gap-3">
                {/* Preview */}
                <div
                  className="w-20 h-20 rounded-xl border overflow-hidden shrink-0 flex items-center justify-center"
                  style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
                >
                  {fotoExibida ? (
                    <img src={fotoExibida} alt="Foto insumo" className="w-full h-full object-cover" />
                  ) : (
                    <Upload size={20} style={{ color: "#D1D5DB" }} />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors hover:bg-gray-50"
                    style={{ borderColor: C.cremeBorder, color: "#374151" }}
                  >
                    {fotoExibida ? "Trocar foto" : "Selecionar foto"}
                  </button>
                  {fotoExibida && (
                    <button
                      type="button"
                      onClick={handleRemoverFoto}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors hover:opacity-80"
                      style={{ color: "#DC2626", backgroundColor: "#FEF2F2" }}
                    >
                      <Trash2 size={12} /> Remover
                    </button>
                  )}
                  <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                    JPEG/PNG/WebP · máx. 5 MB
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {/* ── Nome ── */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                Nome <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Ouro 18k Amarelo"
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-1 focus:ring-[#184036]/30"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>

            {/* ── SKU ── */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                SKU
              </label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex: AU-001"
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-1 focus:ring-[#184036]/30"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>

            {/* ── Categoria + Unidade ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                  Categoria <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <div className="relative">
                  <select
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none appearance-none focus:ring-1 focus:ring-[#184036]/30"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    <option value="">Selecionar</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                  Unidade
                </label>
                <div className="relative">
                  <select
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none appearance-none focus:ring-1 focus:ring-[#184036]/30"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
                </div>
              </div>
            </div>

            {/* ── Peso unitário (só Pedras) ── */}
            {isCatPedras && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                  Peso Unitário (ct / mm)
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={pesoPedra}
                  onChange={(e) => setPesoPedra(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-1 focus:ring-[#184036]/30"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
            )}

            {/* ── Fornecedor ── */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                Fornecedor
              </label>
              <FornecedorAutocomplete value={fornecedor} onChange={setFornecedor} />
            </div>

            {/* ── Observação ── */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                Observação
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={3}
                placeholder="Notas internas sobre o insumo..."
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none resize-none focus:ring-1 focus:ring-[#184036]/30"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>

            {/* ── Ativo (toggle) ── */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium" style={{ color: "#374151" }}>Ativo</p>
                <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                  {ativo ? "Visível no sistema" : "Oculto do sistema"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAtivo((v) => !v)}
                className="relative w-11 h-6 rounded-full transition-colors duration-200"
                style={{ backgroundColor: ativo ? C.esmeralda : "#D1D5DB" }}
              >
                <span
                  className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
                  style={{ transform: ativo ? "translateX(20px)" : "translateX(0)" }}
                />
              </button>
            </div>

            {/* ── Info readonly (só edição) ── */}
            {isEdicao && (
              <div
                className="rounded-xl p-4 space-y-2"
                style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "#9CA3AF" }}>
                  Informações do sistema
                </p>
                {insumo?.custo_compra != null && insumo.custo_compra !== 0 && (
                  <div className="flex justify-between text-[12px]">
                    <span style={{ color: "#6B7280" }}>Último custo</span>
                    <span className="font-mono font-semibold" style={{ color: "#111827" }}>
                      R$ {Number(insumo.custo_compra).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {(insumo?.saldo_real != null || insumo?.saldo != null) && (
                  <div className="flex justify-between text-[12px]">
                    <span style={{ color: "#6B7280" }}>Saldo atual</span>
                    <span className="font-mono font-semibold" style={{ color: "#111827" }}>
                      {Number(insumo.saldo_real ?? insumo.saldo ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {insumo.unidade}
                    </span>
                  </div>
                )}
                {insumo?.created_at && (
                  <div className="flex justify-between text-[12px]">
                    <span style={{ color: "#6B7280" }}>Criado em</span>
                    <span style={{ color: "#6B7280" }}>
                      {new Date(insumo.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ── Erro ── */}
            {error && (
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
              >
                <AlertCircle size={14} className="shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="flex items-center justify-end gap-3 px-5 py-4 border-t shrink-0"
            style={{ borderColor: C.cremeBorder, backgroundColor: "#FFFFFF" }}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium transition-colors hover:bg-gray-50"
              style={{ color: "#6B7280" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 transition-opacity"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin" />Salvando...</>
              ) : (
                isEdicao ? "Salvar alterações" : "Criar insumo"
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
