"use client";

import { useState, useEffect } from "react";
import { MessageCircle, CheckCircle, X, Save, EyeOff, Eye } from "lucide-react";
import { Input, Button } from "@/components/ui";

const P = { creme: "#111827", muted: "#9ca3af", sage: "#6b7280", verde: "#16a34a", vermelho: "#dc2626" };

const BadgeConfigurado = ({ ok }: { ok: boolean }) => (
  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
    style={{ backgroundColor: ok ? P.verde + "22" : P.vermelho + "22", color: ok ? P.verde : P.vermelho }}>
    {ok ? <><CheckCircle size={10} /> Configurado</> : <><X size={10} /> Não configurado</>}
  </span>
);

export default function IntegracaoKommo({ onMsg }: { onMsg: (msg: { tipo: "ok" | "erro"; texto: string } | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [kommoConfigured, setKommoConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [kommoUrl, setKommoUrl] = useState("");
  const [kommoToken, setKommoToken] = useState("");
  const [showKommoToken, setShowKommoToken] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracoes/integracoes");
        if (res.ok) { const data = await res.json(); setKommoConfigured(data.kommo_configured); }
      } catch { }
      setLoading(false);
    })();
  }, []);

  async function salvarKommo() {
    if (!kommoUrl.trim() && !kommoToken.trim()) return;
    setSaving(true); onMsg(null);
    const body: Record<string, string> = {};
    if (kommoUrl.trim()) body.kommo_url = kommoUrl.trim();
    if (kommoToken.trim()) body.kommo_token = kommoToken.trim();
    const res = await fetch("/api/configuracoes/integracoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) {
      setKommoUrl(""); setKommoToken("");
      onMsg({ tipo: "ok", texto: "Kommo salvo com sucesso" });
      fetch("/api/configuracoes/integracoes").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setKommoConfigured(d.kommo_configured); }).catch(() => { });
    } else {
      const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      onMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
    }
    setTimeout(() => onMsg(null), 4000);
  }

  if (loading) return null;

  return (
    <div className="rounded-xl p-5 space-y-4 bg-white border border-gray-200 h-full h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ backgroundColor: "#2AABEE" + "22", color: "#2AABEE" }}>
            <MessageCircle size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Kommo</p>
            <p className="text-xs text-gray-400">CRM / mensageiro</p>
          </div>
        </div>
        <BadgeConfigurado ok={kommoConfigured} />
      </div>

      <Input label="URL do Kommo" value={kommoUrl} onChange={(e) => setKommoUrl(e.target.value)} placeholder="https://seudominio.kommo.com" />

      <div className="relative">
        <Input label="Token de Acesso" type={showKommoToken ? "text" : "password"} value={kommoToken} onChange={(e) => setKommoToken(e.target.value)} placeholder="Cole seu token aqui" />
        <button onClick={() => setShowKommoToken(!showKommoToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {showKommoToken ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      <div className="flex-1" />
      <Button variant="primary" size="sm" loading={saving} disabled={!kommoUrl.trim() && !kommoToken.trim()} onClick={salvarKommo}>
        <Save size={13} /> Salvar Kommo
      </Button>
    </div>
  );
}
