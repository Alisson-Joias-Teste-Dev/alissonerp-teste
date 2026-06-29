"use client";

import { useState, useEffect } from "react";
import { Package, CheckCircle, X, Save, EyeOff, Eye, RefreshCw, ExternalLink } from "lucide-react";
import { Input, Button } from "@/components/ui";

const P = { creme: "#111827", muted: "#9ca3af", sage: "#6b7280", verde: "#16a34a", vermelho: "#dc2626" };

export default function IntegracaoTiny({ onMsg }: { onMsg: (msg: { tipo: "ok" | "erro"; texto: string } | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [tinyConfigured, setTinyConfigured] = useState(false);
  const [tinyHasCredentials, setTinyHasCredentials] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tinyClientId, setTinyClientId] = useState("");
  const [tinyClientSecret, setTinyClientSecret] = useState("");
  const [showTinySecret, setShowTinySecret] = useState(false);
  const [retryingAllTiny, setRetryingAllTiny] = useState(false);
  const [retryAllMsg, setRetryAllMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracoes/integracoes");
        if (res.ok) { const data = await res.json(); setTinyConfigured(data.tiny_configured); setTinyHasCredentials(data.tiny_has_credentials ?? false); }
      } catch { }
      setLoading(false);
    })();
  }, []);

  if (loading) return null;

  return (
    <div className="rounded-xl p-5 space-y-4 bg-white border border-gray-200 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ backgroundColor: "#00B1A3" + "22", color: "#00B1A3" }}><Package size={18} /></div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Tiny ERP (Olist)</p>
            <p className="text-xs text-gray-400">ERP para estoque e pedidos (OAuth2)</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tinyConfigured ? "text-green-600" : "text-gray-400"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${tinyConfigured ? "bg-green-500" : "bg-gray-300"}`} />
          {tinyConfigured ? "Conectado" : "Desconectado"}
        </span>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-widest block mb-1 font-semibold text-gray-500">URL de Redirecionamento</label>
        <input readOnly
          value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/integracoes/tiny/callback`}
          className="w-full px-3 py-2 rounded-lg text-xs border border-gray-200 bg-gray-50 text-gray-500 select-all outline-none"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
      </div>

      <Input label="Client ID" value={tinyClientId} onChange={(e) => setTinyClientId(e.target.value)} placeholder="Client ID do app Tiny" />

      <div className="relative">
        <Input label="Client Secret" type={showTinySecret ? "text" : "password"} value={tinyClientSecret} onChange={(e) => setTinyClientSecret(e.target.value)} placeholder="Client Secret do app Tiny" />
        <button onClick={() => setShowTinySecret(!showTinySecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {showTinySecret ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>

      <div className="flex-1" />
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="primary" size="sm" loading={saving} disabled={!tinyClientId.trim() || !tinyClientSecret.trim()}
          onClick={async () => {
            if (!tinyClientId.trim() || !tinyClientSecret.trim()) return;
            setSaving(true); onMsg(null);
            const res = await fetch("/api/configuracoes/integracoes", {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tiny_client_id: tinyClientId.trim(), tiny_client_secret: tinyClientSecret.trim() }),
            });
            setSaving(false);
            if (res.ok) {
              setTinyClientId(""); setTinyClientSecret(""); setTinyHasCredentials(true);
              onMsg({ tipo: "ok", texto: "Credenciais Tiny salvas. Clique em 'Conectar ao Tiny' para autorizar." });
            } else { const d = await res.json().catch(() => ({ error: "Erro ao salvar" })); onMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" }); }
            setTimeout(() => onMsg(null), 6000);
          }}>
          <Save size={13} /> Salvar Credenciais
        </Button>

        {tinyHasCredentials && (
          <a href="/api/integracoes/tiny/auth" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold no-underline transition-opacity hover:opacity-90"
            style={{ backgroundColor: tinyConfigured ? P.sage : "#2563EB", color: "#fff" }}>
            <ExternalLink size={12} /> {tinyConfigured ? "Reconectar Tiny" : "Conectar ao Tiny"}
          </a>
        )}

        {tinyConfigured && (
          <>
            <Button variant="outline" size="sm" loading={retryingAllTiny}
              onClick={async () => {
                setRetryingAllTiny(true); setRetryAllMsg(null);
                const res = await fetch("/api/tiny/resync-erros", { method: "POST" });
                setRetryingAllTiny(false);
                if (res.ok) {
                  const d = await res.json();
                  if (d.total === 0) setRetryAllMsg({ tipo: "ok", texto: "Nenhuma venda com erro para reenviar." });
                  else setRetryAllMsg({ tipo: d.erros === 0 ? "ok" : "erro", texto: `${d.sincronizados}/${d.total} reenviados.${d.erros > 0 ? ` ${d.erros} falharam.` : ""}` });
                } else { const d = await res.json().catch(() => ({ error: "Erro" })); setRetryAllMsg({ tipo: "erro", texto: d.error ?? "Erro ao reenviar" }); }
                setTimeout(() => setRetryAllMsg(null), 8000);
              }}>
              <RefreshCw size={12} /> Reenviar Pendentes
            </Button>
            {retryAllMsg && <p className={`text-xs ${retryAllMsg.tipo === "ok" ? "text-green-600" : "text-red-500"}`}>{retryAllMsg.texto}</p>}
          </>
        )}
      </div>
    </div>
  );
}
