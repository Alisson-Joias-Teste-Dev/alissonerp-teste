"use client";

import { useState, useEffect } from "react";
import { CreditCard, CheckCircle, X, Save, EyeOff, Eye, RefreshCw, Pencil } from "lucide-react";
import { Input, Button, Toggle, StatusBadge } from "@/components/ui";

const P = { creme: "#111827", muted: "#9ca3af", sage: "#6b7280", verde: "#16a34a", vermelho: "#dc2626", border: "#e5e7eb", bg: "#f9fafb" };

const BadgeConfigurado = ({ ok }: { ok: boolean }) => (
  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
    style={{ backgroundColor: ok ? P.verde + "22" : P.vermelho + "22", color: ok ? P.verde : P.vermelho }}>
    {ok ? <><CheckCircle size={10} /> Configurado</> : <><X size={10} /> Não configurado</>}
  </span>
);

interface PointDeviceRow { id: number; device_id: string; nome_legivel: string; loja: string | null; operating_mode: string | null; ativo: boolean; last_sync_at: string | null; }

export default function IntegracaoMercadoPago({ onMsg }: { onMsg: (msg: { tipo: "ok" | "erro"; texto: string } | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [mpConfigured, setMpConfigured] = useState(false);
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [mpWebhookSecret, setMpWebhookSecret] = useState("");
  const [mpUserId, setMpUserId] = useState("");
  const [mpAtivo, setMpAtivo] = useState(true);
  const [mpWebhookBaseUrl, setMpWebhookBaseUrl] = useState("");
  const [showMpToken, setShowMpToken] = useState(false);
  const [showMpSecret, setShowMpSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mpDevices, setMpDevices] = useState<PointDeviceRow[]>([]);
  const [mpSyncLoading, setMpSyncLoading] = useState(false);
  const [mpEditDeviceId, setMpEditDeviceId] = useState<number | null>(null);
  const [mpEditNome, setMpEditNome] = useState("");
  const [mpEditLoja, setMpEditLoja] = useState("");

  const carregarMpDevices = async () => { try { const res = await fetch("/api/mercado-pago/devices"); if (res.ok) setMpDevices(await res.json()); } catch { } };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracoes/integracoes");
        if (res.ok) {
          const data = await res.json();
          setMpConfigured(data.mp_configured ?? false);
          if (typeof data.mp_ativo === "boolean") setMpAtivo(data.mp_ativo);
          if (data.mp_configured) carregarMpDevices();
        }
      } catch { }
      setLoading(false);
    })();
  }, []);

  async function salvarMercadoPago() {
    setSaving(true); onMsg(null);
    const body: Record<string, string | boolean> = {};
    if (mpAccessToken.trim()) body.mp_access_token = mpAccessToken.trim();
    if (mpWebhookSecret.trim()) body.mp_webhook_secret = mpWebhookSecret.trim();
    if (mpUserId.trim()) body.mp_user_id = mpUserId.trim();
    if (mpWebhookBaseUrl.trim()) body.mp_webhook_base_url = mpWebhookBaseUrl.trim();
    const res = await fetch("/api/configuracoes/integracoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) {
      setMpAccessToken(""); setMpWebhookSecret(""); setMpUserId(""); setMpWebhookBaseUrl("");
      setMpConfigured(true);
      onMsg({ tipo: "ok", texto: "Mercado Pago salvo com sucesso" });
    } else { const d = await res.json().catch(() => ({ error: "Erro" })); onMsg({ tipo: "erro", texto: d.error ?? "Erro" }); }
    setTimeout(() => onMsg(null), 4000);
  }

  async function alternarMpAtivo() {
    const novo = !mpAtivo;
    setMpAtivo(novo);
    await fetch("/api/configuracoes/integracoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mp_ativo: novo }) });
  }

  async function sincronizarMpDevices() {
    setMpSyncLoading(true); onMsg(null);
    try {
      const res = await fetch("/api/mercado-pago/devices", { method: "POST" });
      const body = await res.json();
      if (res.ok) { onMsg({ tipo: "ok", texto: `Maquininhas: ${body.inserted} novas, ${body.updated} atualizadas (total ${body.total})` }); await carregarMpDevices(); }
      else { onMsg({ tipo: "erro", texto: body.error ?? "Erro" }); }
    } catch { onMsg({ tipo: "erro", texto: "Erro de rede" }); }
    setMpSyncLoading(false);
    setTimeout(() => onMsg(null), 5000);
  }

  async function alternarDeviceAtivo(id: number, ativo: boolean) {
    await fetch("/api/mercado-pago/devices", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ativo: !ativo }) });
    await carregarMpDevices();
  }

  async function salvarDevice(id: number) {
    await fetch("/api/mercado-pago/devices", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, nome_legivel: mpEditNome.trim() || undefined, loja: mpEditLoja.trim() || null }) });
    setMpEditDeviceId(null); setMpEditNome(""); setMpEditLoja(""); await carregarMpDevices();
  }

  if (loading) return null;

  return (
    <div className="rounded-xl p-5 space-y-4 bg-white border border-gray-200 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ backgroundColor: "#00B1EA" + "22", color: "#00B1EA" }}><CreditCard size={18} /></div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Mercado Pago</p>
            <p className="text-xs text-gray-400">Pagamentos PIX, cartão e link</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <BadgeConfigurado ok={mpConfigured} />
          <div className="flex items-center gap-2">
            <Toggle ativo={mpAtivo} onChange={alternarMpAtivo} />
            <StatusBadge ativo={mpAtivo} />
          </div>
        </div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-widest block mb-1 font-semibold text-gray-500">URL do webhook</label>
        <input readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/mercado-pago`}
          className="w-full px-3 py-2 rounded-lg text-xs border border-gray-200 bg-gray-50 text-gray-500 select-all outline-none"
          onClick={(e) => (e.target as HTMLInputElement).select()} />
      </div>

      <div className="relative">
        <Input label="Access Token (Production)" type={showMpToken ? "text" : "password"} value={mpAccessToken} onChange={(e) => setMpAccessToken(e.target.value)} placeholder="APP_USR-..." />
        <button onClick={() => setShowMpToken(!showMpToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showMpToken ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>

      <div className="relative">
        <Input label="Webhook Secret (HMAC)" type={showMpSecret ? "text" : "password"} value={mpWebhookSecret} onChange={(e) => setMpWebhookSecret(e.target.value)} placeholder="Chave secreta do painel MP" />
        <button onClick={() => setShowMpSecret(!showMpSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showMpSecret ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>

      <Input label="User ID (opcional)" value={mpUserId} onChange={(e) => setMpUserId(e.target.value)} placeholder="User ID da conta MP" />

      <div>
        <Input label="URL base p/ webhook (dev: ngrok)" value={mpWebhookBaseUrl} onChange={(e) => setMpWebhookBaseUrl(e.target.value)} placeholder="https://abc123.ngrok.io" />
        <p className="text-[10px] mt-1 text-gray-400">Usada como prefixo do notification_url. Deixe em branco para usar o origin atual.</p>
      </div>

      <Button variant="primary" size="sm" loading={saving} disabled={!mpAccessToken.trim() && !mpWebhookSecret.trim() && !mpUserId.trim() && !mpWebhookBaseUrl.trim()} onClick={salvarMercadoPago}>
        <Save size={13} /> Salvar Mercado Pago
      </Button>

      {mpConfigured && (
        <div className="pt-4 mt-2 border-t border-gray-200 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Maquininhas Point</p>
              <p className="text-[11px] text-gray-400">{mpDevices.length === 0 ? "Nenhuma sincronizada" : `${mpDevices.length} maquininha${mpDevices.length > 1 ? "s" : ""}`}</p>
            </div>
            <Button variant="primary" size="sm" loading={mpSyncLoading} onClick={sincronizarMpDevices}><RefreshCw size={12} /> Sincronizar</Button>
          </div>

          {mpDevices.length > 0 && (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Nome</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Loja</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Modo</th>
                    <th className="text-center px-3 py-2 font-semibold text-gray-500">Ativo</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {mpDevices.map((d) => {
                    const editando = mpEditDeviceId === d.id;
                    return (
                      <tr key={d.id} className="border-t border-gray-200">
                        <td className="px-3 py-2">
                          {editando ? <input value={mpEditNome} onChange={(e) => setMpEditNome(e.target.value)} className="w-full px-2 py-1 rounded border text-xs border-gray-200" />
                            : <><div className="font-medium text-gray-900">{d.nome_legivel}</div><div className="text-[10px] font-mono text-gray-400">{d.device_id.slice(0, 32)}...</div></>}
                        </td>
                        <td className="px-3 py-2">
                          {editando ? <input value={mpEditLoja} onChange={(e) => setMpEditLoja(e.target.value)} placeholder="Matriz / Filial..." className="w-full px-2 py-1 rounded border text-xs border-gray-200" />
                            : <span className="text-gray-400">{d.loja ?? "—"}</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{d.operating_mode ?? "—"}</td>
                        <td className="px-3 py-2 text-center"><Toggle ativo={d.ativo} onChange={() => alternarDeviceAtivo(d.id, d.ativo)} /></td>
                        <td className="px-3 py-2 text-right">
                          {editando ? <div className="flex items-center gap-1 justify-end">
                            <Button variant="primary" size="sm" onClick={() => salvarDevice(d.id)}>Salvar</Button>
                            <Button variant="ghost" size="sm" onClick={() => { setMpEditDeviceId(null); setMpEditNome(""); setMpEditLoja(""); }}><X size={13} /></Button>
                          </div> : <Button variant="ghost" size="sm" onClick={() => { setMpEditDeviceId(d.id); setMpEditNome(d.nome_legivel); setMpEditLoja(d.loja ?? ""); }}><Pencil size={13} /></Button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
