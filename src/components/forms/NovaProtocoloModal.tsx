"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Search, Camera, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

const TIPO_LABEL: Record<string, string> = {
  servico_venda: "Serv. Venda",
  fabricacao: "Fabricação",
  reposicao_venda: "Rep. Venda",
  reposicao_loja: "Rep. Loja",
  compra_fornecedor: "Compra",
  garantia: "Garantia",
  servico_interno: "S. Interno",
};

interface OrdemOption {
  id: number;
  numero_ordem: string | null;
  status: string | null;
  tipo_ordem?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  direcao: "ida" | "volta";
  tipoProtocolo: string;
  onSuccess?: () => void;
}

export default function NovaProtocoloModal({ isOpen, onClose, direcao, tipoProtocolo, onSuccess }: Props) {
  const [ordens, setOrdens] = useState<OrdemOption[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingOrdens, setLoadingOrdens] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);

  // Buscar ordens ao abrir (tipo já definido pelo dropdown)
  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set());
    setSearch("");
    setError("");
    setSuccess(false);
    setFotoFile(null);
    setFotoPreview(null);
    setOrdens([]);
    setLoadingOrdens(true);

    fetch(`/api/protocolo/ordens?direcao=${direcao}&tipo_protocolo=${tipoProtocolo}`)
      .then((r) => r.json())
      .then((data) => setOrdens(Array.isArray(data) ? data : []))
      .catch(() => setOrdens([]))
      .finally(() => setLoadingOrdens(false));
  }, [isOpen, direcao, tipoProtocolo]);

  const filtered = ordens.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(o.id).includes(q) ||
      (o.numero_ordem ?? "").toLowerCase().includes(q) ||
      (o.status ?? "").toLowerCase().includes(q)
    );
  });

  function toggleOrdem(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setError("");
    if (selected.size === 0) { setError("Selecione ao menos uma ordem."); return; }
    if (!fotoFile) { setError("Foto das joias é obrigatória."); return; }
    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const fotoPath = `criacao/${user?.id ?? "anon"}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("protocolo-fotos")
        .upload(fotoPath, fotoFile, { contentType: fotoFile.type || "image/jpeg", upsert: false });
      if (uploadErr) throw new Error(`Upload foto: ${uploadErr.message}`);

      const res = await fetch("/api/protocolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direcao,
          ordem_ids: Array.from(selected),
          motoboy_id: user?.id,
          foto_criacao: fotoPath,
          user_id: user?.id,
          tipo_protocolo: tipoProtocolo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      setSuccess(true);
      setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao criar protocolo");
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const isService = tipoProtocolo === "service";
  const titulo = direcao === "ida" ? "Novo Protocolo Ida" : "Novo Protocolo Volta";

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto flex flex-col rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        {/* Header com badge de tipo fixo */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>{titulo}</h3>
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                style={{
                  backgroundColor: isService ? "#FEF3C7" : "#F3F4F6",
                  color: isService ? "#B45309" : "#6B7280",
                }}
              >
                {isService ? "🔧 Service" : "🏭 Fábrica"}
              </span>
            </div>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              {selected.size} ordem{selected.size !== 1 ? "s" : ""} selecionada{selected.size !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
            <input
              type="text"
              placeholder="Buscar ordem..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-3 md:py-2 rounded-lg border text-base md:text-sm focus:outline-none"
              style={{ borderColor: C.cremeBorder }}
            />
          </div>
        </div>

        {/* Ordens list */}
        <div className="overflow-y-auto flex-1 px-6 pb-2">
          {loadingOrdens ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin" style={{ color: "#9CA3AF" }} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-sm" style={{ color: "#9CA3AF" }}>Nenhuma ordem encontrada</p>
          ) : (
            <div className="space-y-1">
              {filtered.map((o) => {
                const isSelected = selected.has(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => toggleOrdem(o.id)}
                    className="w-full flex items-center gap-3 px-3 py-3.5 md:py-2.5 rounded-lg text-left transition-colors active:scale-[0.98]"
                    style={{
                      backgroundColor: isSelected ? "#18403612" : "transparent",
                      border: `1px solid ${isSelected ? C.esmeralda + "40" : C.cremeBorder}`,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors"
                      style={{
                        backgroundColor: isSelected ? C.esmeralda : "#fff",
                        borderColor: isSelected ? C.esmeralda : "#D1D5DB",
                      }}
                    >
                      {isSelected && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3L3.5 5.5L8 1" stroke="#F3EADA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: C.esmeralda }}>
                        {o.numero_ordem ?? `Ordem #${o.id}`}
                      </p>
                      <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                        {o.tipo_ordem ? (TIPO_LABEL[o.tipo_ordem] ?? o.tipo_ordem) : (o.status ?? "—")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Foto obrigatória */}
        <div className="px-6 pb-3 shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#9CA3AF" }}>
            Foto das Joias <span style={{ color: "#DC2626" }}>*</span>
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

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 space-y-3" style={{ borderColor: C.cremeBorder }}>
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle size={14} className="shrink-0" />Protocolo criado!
            </div>
          )}
          <div className="flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-2 md:gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 md:py-2 rounded-lg text-[13px] text-center"
              style={{ color: "#6B7280" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || success || selected.size === 0 || !fotoFile}
              className="flex items-center justify-center gap-2 px-5 py-3 md:py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50 w-full md:w-auto"
              style={{ backgroundColor: C.esmeralda, color: C.creme, minHeight: 44 }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin" />Criando...</> : `Criar Protocolo (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
