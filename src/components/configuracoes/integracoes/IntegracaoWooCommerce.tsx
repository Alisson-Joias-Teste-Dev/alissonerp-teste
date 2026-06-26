"use client";

import { useState, useEffect } from "react";
import {
  ShoppingCart,
  CheckCircle,
  X,
  Save,
  EyeOff,
  Eye,
} from "lucide-react";
import { Input, Button } from "@/components/ui";

const P = {
  creme: "#111827",
  muted: "#9ca3af",
  sage: "#6b7280",
  verde: "#16a34a",
  vermelho: "#dc2626",
};

const BadgeConfigurado = ({ ok }: { ok: boolean }) => (
  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
    style={{ backgroundColor: ok ? P.verde + "22" : P.vermelho + "22", color: ok ? P.verde : P.vermelho }}>
    {ok ? <><CheckCircle size={10} /> Configurado</> : <><X size={10} /> Não configurado</>}
  </span>
);

export default function IntegracaoWooCommerce({ onMsg }: { onMsg: (msg: { tipo: "ok" | "erro"; texto: string } | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [wooConfigured, setWooConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wooUrl, setWooUrl] = useState("");
  const [wooKey, setWooKey] = useState("");
  const [wooSecret, setWooSecret] = useState("");
  const [showWooKey, setShowWooKey] = useState(false);
  const [showWooSecret, setShowWooSecret] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracoes/integracoes");
        if (res.ok) {
          const data = await res.json();
          setWooConfigured(data.woo_configured);
        }
      } catch { }
      setLoading(false);
    })();
  }, []);

  async function salvarWoo() {
    if (!wooUrl.trim() && !wooKey.trim() && !wooSecret.trim()) return;
    setSaving(true);
    onMsg(null);
    const body: Record<string, string> = {};
    if (wooUrl.trim()) body.woo_url = wooUrl.trim();
    if (wooKey.trim()) body.woo_consumer_key = wooKey.trim();
    if (wooSecret.trim()) body.woo_consumer_secret = wooSecret.trim();
    const res = await fetch("/api/configuracoes/integracoes", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setWooUrl(""); setWooKey(""); setWooSecret("");
      onMsg({ tipo: "ok", texto: "WooCommerce salvo com sucesso" });
      fetch("/api/configuracoes/integracoes").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setWooConfigured(d.woo_configured); }).catch(() => { });
    } else {
      const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      onMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
    }
    setTimeout(() => onMsg(null), 4000);
  }

  if (loading) return null;

  return (
    <div className="rounded-xl p-5 space-y-4 bg-white border border-gray-200 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2 flex items-center justify-center" style={{ backgroundColor: "#96588A" + "22", color: "#96588A" }}>
            <ShoppingCart size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">WooCommerce</p>
            <p className="text-xs text-gray-400">Integração com loja virtual</p>
          </div>
        </div>
        <BadgeConfigurado ok={wooConfigured} />
      </div>

      <Input label="URL da Loja" value={wooUrl} onChange={(e) => setWooUrl(e.target.value)} placeholder="https://sualoja.com.br" />

      <div className="relative">
        <Input label="Consumer Key" type={showWooKey ? "text" : "password"} value={wooKey} onChange={(e) => setWooKey(e.target.value)} placeholder="ck_..." />
        <button onClick={() => setShowWooKey(!showWooKey)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
          {showWooKey ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      <div className="relative">
        <Input label="Consumer Secret" type={showWooSecret ? "text" : "password"} value={wooSecret} onChange={(e) => setWooSecret(e.target.value)} placeholder="cs_..." />
        <button onClick={() => setShowWooSecret(!showWooSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
          {showWooSecret ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      <div className="flex-1" />
      <Button variant="primary" size="sm" loading={saving} disabled={!wooUrl.trim() && !wooKey.trim() && !wooSecret.trim()} onClick={salvarWoo}>
        <Save size={13} /> Salvar WooCommerce
      </Button>
    </div>
  );
}
