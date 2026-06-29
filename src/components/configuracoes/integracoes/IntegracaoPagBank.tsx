"use client";

import { useState, useEffect } from "react";
import {
  CreditCard,
  CheckCircle,
  Save,
} from "lucide-react";
import { Button, Toggle, Badge } from "@/components/ui";

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
export default function IntegracaoPagBank({
  onMsg,
}: {
  onMsg: (msg: { tipo: "ok" | "erro"; texto: string } | null) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [pagbankConfigured, setPagbankConfigured] = useState(false);
  const [pagbankAtivo, setPagbankAtivo] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pagbankToken, setPagbankToken] = useState("");
  const [pagbankWebhookSecret, setPagbankWebhookSecret] = useState("");
  const [pagbankWebhookBaseUrl, setPagbankWebhookBaseUrl] = useState("");
  const [pagbankSaved, setPagbankSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracoes/integracoes");
        if (res.ok) {
          const data = await res.json();
          setPagbankConfigured(data.pagbank_configured ?? false);
          if (typeof data.pagbank_ativo === "boolean") setPagbankAtivo(data.pagbank_ativo);
        }
      } catch { /* silenciar */ }
      setLoading(false);
    })();
  }, []);

  async function salvarPagBank() {
    if (!pagbankToken.trim() && !pagbankWebhookSecret.trim() && !pagbankWebhookBaseUrl.trim()) return;
    setSaving(true);
    onMsg(null);
    const body: Record<string, string> = {};
    if (pagbankToken.trim())          body.pagbank_access_token    = pagbankToken.trim();
    if (pagbankWebhookSecret.trim())  body.pagbank_webhook_secret  = pagbankWebhookSecret.trim();
    if (pagbankWebhookBaseUrl.trim()) body.pagbank_webhook_base_url = pagbankWebhookBaseUrl.trim();
    const res = await fetch("/api/configuracoes/integracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setPagbankSaved(true);
      setTimeout(() => setPagbankSaved(false), 3000);
      onMsg({ tipo: "ok", texto: "PagBank salvo com sucesso" });
      fetch("/api/configuracoes/integracoes")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d) setPagbankConfigured(d.pagbank_configured ?? false);
        })
        .catch(() => {});
    } else {
      const d = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      onMsg({ tipo: "erro", texto: d.error ?? "Erro ao salvar" });
    }
    setTimeout(() => onMsg(null), 4000);
  }

  /** REGRA DE NEGÓCIO: toggle ativar/desativar gateway PagBank. */
  async function alternarPagbankAtivo() {
    const novo = !pagbankAtivo;
    setPagbankAtivo(novo);
    await fetch("/api/configuracoes/integracoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pagbank_ativo: String(novo) }),
    });
  }

  if (loading) return null;

  return (
    <div className="rounded-xl p-5 space-y-4 bg-white border border-gray-200 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="rounded-lg p-2 flex items-center justify-center"
            style={{ backgroundColor: "#00D972" + "22", color: "#00D972" }}
          >
            <CreditCard size={18} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: P.creme }}>
              PagBank
              {pagbankConfigured && (
                <span className="ml-2 text-xs font-normal" style={{ color: P.verde }}>✓ configurado</span>
              )}
            </p>
            <p className="text-xs" style={{ color: P.muted }}>
              Pagamentos via PIX, cartão de crédito e link de pagamento
            </p>
          </div>
        </div>
        {/* Toggle ativar/desativar gateway */}
        <div className="flex items-center gap-2">
          <Toggle ativo={pagbankAtivo} onChange={alternarPagbankAtivo} />
          <Badge color={pagbankAtivo ? "success" : "neutral"}>{pagbankAtivo ? "Ativo" : "Inativo"}</Badge>
        </div>
      </div>

      <div className="space-y-3 text-xs" style={{ color: P.muted }}>
        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            URL do Webhook (copie e cole no painel PagBank)
          </label>
          <input
            type="text"
            readOnly
            value={`${typeof window !== "undefined" ? window.location.origin : "https://erp.alisson.api.br"}/api/webhooks/pagbank`}
            className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
            style={{ borderColor: P.border, color: P.muted }}
            onFocus={(e) => e.target.select()}
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            Ambiente
          </label>
          <select
            defaultValue="producao"
            onChange={async (e) => {
              const v = e.target.value;
              try {
                await fetch("/api/configuracoes/integracoes", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ pagbank_ambiente: v }),
                });
              } catch { /* silencia */ }
            }}
            className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
            style={{ borderColor: P.border, color: P.creme }}
          >
            <option value="producao">Produção (api.pagseguro.com)</option>
            <option value="sandbox">Sandbox (sandbox.api.pagseguro.com)</option>
          </select>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            Token PagBank
            {pagbankSaved && <span className="ml-1 text-[10px] font-normal" style={{ color: P.verde }}>✓ salvou!</span>}
          </label>
          <input
            type="password"
            value={pagbankToken}
            onChange={(e) => setPagbankToken(e.target.value)}
            placeholder="Token de integração fornecido no painel PagBank"
            className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
            style={{
              borderColor: pagbankSaved ? P.verde : P.border,
              color: P.creme,
              transition: "border-color 0.3s ease",
            }}
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            Webhook Secret (normalmente o mesmo Token)
            {pagbankSaved && <span className="ml-1 text-[10px] font-normal" style={{ color: P.verde }}>✓ salvou!</span>}
          </label>
          <input
            type="password"
            value={pagbankWebhookSecret}
            onChange={(e) => setPagbankWebhookSecret(e.target.value)}
            placeholder="Usado para validar notificações — geralmente o mesmo Token acima"
            className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
            style={{
              borderColor: pagbankSaved ? P.verde : P.border,
              color: P.creme,
              transition: "border-color 0.3s ease",
            }}
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-widest block mb-1" style={{ color: P.sage }}>
            Webhook Base URL (opcional)
          </label>
          <input
            type="text"
            value={pagbankWebhookBaseUrl}
            onChange={(e) => setPagbankWebhookBaseUrl(e.target.value)}
            placeholder="https://erp.alisson.api.br"
            className="w-full bg-transparent px-3 py-2 rounded-lg text-xs border outline-none"
            style={{ borderColor: P.border, color: P.creme }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <Button variant="primary" size="sm" loading={saving} disabled={!pagbankToken.trim() && !pagbankWebhookSecret.trim()} onClick={salvarPagBank}>
          <Save size={12} /> Salvar PagBank
        </Button>
        {pagbankConfigured && (
          <span className="text-xs flex items-center gap-1 font-semibold" style={{ color: pagbankAtivo ? P.verde : P.muted }}>
            <CheckCircle size={13} /> {pagbankAtivo ? "PagBank configurado e ativo" : "PagBank configurado mas INATIVO nas vendas"}
          </span>
        )}
      </div>

      <p className="text-[10px]" style={{ color: P.muted }}>
        As credenciais são salvas via API em configuracoes_secrets com criptografia. Configure também o webhook no painel PagBank apontando para a URL acima.
      </p>
    </div>
  );
}
