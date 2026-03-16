"use client";

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle, AlertCircle, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

interface OrdemOption {
  id: number;
  numero_ordem: string | null;
  status: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function NovaPCPModal({ isOpen, onClose, onSuccess }: Props) {
  const [ordens, setOrdens] = useState<OrdemOption[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingOrdens, setLoadingOrdens] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    if (!isOpen) return;
    setSelected(null);
    setSearch("");
    setError("");
    setSuccess(false);
    setLoadingOrdens(true);

    // Ordens com auditoria LOJA aprovada, rota=pcp, sem PCP ainda
    supabase
      .from("vw_ordens_prontas_pcp")
      .select("id, numero_ordem, status")
      .order("id", { ascending: false })
      .limit(200)
      .then(({ data }) => {
        setOrdens((data as OrdemOption[]) ?? []);
        setLoadingOrdens(false);
      });
  }, [isOpen]);

  const filtered = ordens.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(o.id).includes(q) ||
      (o.numero_ordem ?? "").toLowerCase().includes(q)
    );
  });

  async function handleSubmit() {
    setError("");
    if (!selected) { setError("Selecione uma ordem."); return; }
    setLoading(true);

    const { error: e } = await supabase
      .from("pcp")
      .insert({ ordem_id: selected });

    setLoading(false);
    if (e) { setError(e.message); return; }
    setSuccess(true);
    setTimeout(() => { onSuccess?.(); onClose(); }, 1200);
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: C.cremeBorder }}
        >
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
              Nova Ordem — PCP
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              Ordens com auditoria loja aprovada (rota: PCP)
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100"
          >
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
              className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
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
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhuma ordem disponível</p>
              <p className="text-[11px] mt-1" style={{ color: "#C4B5A0" }}>
                Ordens aparecem aqui após auditoria loja aprovada
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filtered.map((o) => {
                const isSelected = selected === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => setSelected(isSelected ? null : o.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                    style={{
                      backgroundColor: isSelected ? "#18403612" : "transparent",
                      border: `1px solid ${isSelected ? C.esmeralda + "40" : C.cremeBorder}`,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-colors"
                      style={{
                        backgroundColor: isSelected ? C.esmeralda : "#fff",
                        borderColor: isSelected ? C.esmeralda : "#D1D5DB",
                      }}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: C.creme }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: C.esmeralda }}>
                        {o.numero_ordem ?? `Ordem #${o.id}`}
                      </p>
                      <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{o.status ?? "—"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 space-y-3" style={{ borderColor: C.cremeBorder }}>
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
              <CheckCircle size={14} className="shrink-0" />Ordem adicionada ao PCP!
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px]"
              style={{ color: "#6B7280" }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || success || !selected}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin" />Criando...</>
              ) : (
                "Adicionar ao PCP"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
