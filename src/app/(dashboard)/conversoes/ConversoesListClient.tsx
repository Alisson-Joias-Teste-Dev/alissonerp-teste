"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Repeat2, Plus, Clock, CheckCircle, XCircle, ArrowRight, Search, ChevronDown } from "lucide-react";
import Link from "next/link";
import ConversaoModal from "@/components/forms/ConversaoModal";
import ConversaoSkuModal from "@/components/forms/ConversaoSkuModal";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg: "#FAFAF7",
};

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  pendente:        { label: "Pendente",         color: "#92400E", bg: "#FEF3C7" },
  aprovado:        { label: "Aprovado",         color: "#065F46", bg: "#D1FAE5" },
  recusado:        { label: "Recusado",         color: "#991B1B", bg: "#FEE2E2" },
  em_rota:         { label: "Em Rota",          color: "#1E40AF", bg: "#DBEAFE" },
  concluido:       { label: "Concluído",        color: "#065F46", bg: "#D1FAE5" },
  em_fabrica:      { label: "Na Fábrica",       color: "#7C3AED", bg: "#EDE9FE" },
  aguardando_volta:{ label: "Aguardando Volta", color: "#B45309", bg: "#FEF3C7" },
};

function Badge({ status }: { status: string }) {
  const cfg = STATUS_BADGE[status] ?? { label: status, color: "#6B7280", bg: "#F3F4F6" };
  return (
    <span style={{ display: "inline-flex", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

export default function ConversoesListClient({ conversoes, userRole }: any) {
  const [showModal, setShowModal] = useState<"metal" | "sku" | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Repeat2 size={22} color={C.esmeralda} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1F2937", margin: 0 }}>Conversões</h1>
        </div>
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: C.esmeralda, color: "#fff" }}
          >
            <Plus size={16} />
            Nova Conversão
            <ChevronDown size={14} />
          </button>
          {showDropdown && (
            <div
              style={{
                position: "absolute", top: "100%", right: 0, marginTop: 4,
                backgroundColor: "#fff", borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                minWidth: 220, zIndex: 50, overflow: "hidden",
              }}
            >
              <button
                onClick={() => { setShowDropdown(false); setShowModal("metal"); }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center gap-3"
                style={{ color: "#374151" }}
              >
                <Repeat2 size={16} style={{ color: C.esmeralda }} />
                <div>
                  <div style={{ fontWeight: 500 }}>Conversão de Metal</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>Joia → Metal (ouro)</div>
                </div>
              </button>
              <div style={{ height: 1, backgroundColor: "#E5E7EB" }} />
              <button
                onClick={() => { setShowDropdown(false); setShowModal("sku"); }}
                className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 flex items-center gap-3"
                style={{ color: "#374151" }}
              >
                <Repeat2 size={16} style={{ color: "#7C3AED" }} />
                <div>
                  <div style={{ fontWeight: 500 }}>Conversão de SKU</div>
                  <div style={{ fontSize: 11, color: "#9CA3AF" }}>SKU → SKU (transformação)</div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>

      {conversoes.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: "#9CA3AF" }}>
          <Repeat2 size={40} style={{ margin: "0 auto 12", display: "block", opacity: 0.4 }} />
          <p style={{ fontSize: 14 }}>Nenhuma conversão encontrada</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {conversoes.map((c: any) => (
            <Link
              key={`${c.tipo}-${c.ordem_id}`}
              href={`/conversoes/${c.ordem_id}`}
              style={{ textDecoration: "none" }}
            >
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16", backgroundColor: "#fff", borderRadius: 8,
                border: "1px solid #E5E7EB", transition: "box-shadow 0.15s",
              }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)"}
                onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%",
                    backgroundColor: c.tipo === "sku" ? "#EDE9FE" : "#D1FAE5",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Repeat2 size={14} color={c.tipo === "sku" ? "#7C3AED" : C.esmeralda} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "#1F2937" }}>
                      {c.numero_ordem}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                      {c.tipo === "metal" ? "Conversão de Metal" : "Conversão SKU"}
                      {" · "}{c.criado_por_nome || "—"}
                      {" · "}{format(new Date(c.conversao_created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <span style={{ fontSize: 12, color: "#6B7280" }}>
                    {c.tipo === "metal"
                      ? `${c.quantidade_total} itens · ${c.peso_total}g`
                      : `${c.sku_origem_cod || "?"} → ${c.sku_destino_cod || "?"}`
                    }
                  </span>
                  <Badge status={c.status_conversao} />
                  <ArrowRight size={14} color="#9CA3AF" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <ConversaoModal
        isOpen={showModal === "metal"}
        onClose={() => setShowModal(null)}
        onSuccess={(result) => { setShowModal(null); window.location.href = `/conversoes/${result.ordem_id}`; }}
      />

      <ConversaoSkuModal
        isOpen={showModal === "sku"}
        onClose={() => setShowModal(null)}
        onSuccess={(result) => { setShowModal(null); window.location.href = `/conversoes/${result.ordem_id}`; }}
      />
    </div>
  );
}
