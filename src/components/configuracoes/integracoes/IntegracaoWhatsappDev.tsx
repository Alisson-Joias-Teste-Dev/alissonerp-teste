"use client";

import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";

// ─── Paleta ──────────────────────────────────────────────────────────────────
const P = {
  bg:       "#f9fafb",
  card:     "#ffffff",
  border:   "#e5e7eb",
  creme:    "#111827",
  sage:     "#6b7280",
  muted:    "#9ca3af",
  dourado:  "#d97706",
  verde:    "#16a34a",
  vermelho: "#dc2626",
};

// ─── Componente ──────────────────────────────────────────────────────────────
export default function IntegracaoWhatsappDev({
  onMsg,
}: {
  onMsg: (msg: { tipo: "ok" | "erro"; texto: string } | null) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [whatsappDev, setWhatsappDev] = useState("");
  const [savingWhatsappDev, setSavingWhatsappDev] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracoes/integracoes");
        if (res.ok) {
          const data = await res.json();
          if (typeof data.whatsapp_desenvolvedor === "string") setWhatsappDev(data.whatsapp_desenvolvedor);
        }
      } catch { /* silenciar */ }
      setLoading(false);
    })();
  }, []);

  async function salvarWhatsappDev() {
    setSavingWhatsappDev(true);
    onMsg(null);
    try {
      const res = await fetch("/api/configuracoes/integracoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ whatsapp_desenvolvedor: whatsappDev.trim() }),
      });
      if (res.ok) onMsg({ tipo: "ok", texto: "WhatsApp do desenvolvedor salvo." });
      else onMsg({ tipo: "erro", texto: "Erro ao salvar o WhatsApp do desenvolvedor." });
    } catch {
      onMsg({ tipo: "erro", texto: "Erro ao salvar o WhatsApp do desenvolvedor." });
    } finally {
      setSavingWhatsappDev(false);
    }
  }

  if (loading) return null;

  return (
    <div className="rounded-xl p-5 space-y-4 bg-white border border-gray-200 h-full flex flex-col">
      <div className="flex items-center gap-3">
        <div
          className="rounded-lg p-2 flex items-center justify-center"
          style={{ backgroundColor: "#25D366" + "22", color: "#128C7E" }}
        >
          <MessageCircle size={18} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: P.creme }}>
            WhatsApp do desenvolvedor
          </p>
          <p className="text-xs" style={{ color: P.muted }}>
            Recebe o código de entrega + o erro quando o envio ao cliente falha
          </p>
        </div>
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs font-medium" style={{ color: P.muted }}>
            Número (com DDD, ex: 85999999999)
          </label>
          <input
            type="tel"
            value={whatsappDev}
            onChange={(e) => setWhatsappDev(e.target.value)}
            placeholder="85999999999"
            className="w-full mt-1 rounded-lg px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: P.card, border: `1px solid ${P.border}`, color: P.creme }}
          />
        </div>
        <button
          onClick={salvarWhatsappDev}
          disabled={savingWhatsappDev}
          className="rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: P.verde, color: "#fff" }}
        >
          {savingWhatsappDev ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
