"use client";

import { useState, useEffect } from "react";
import { Landmark, CheckCircle, X, Save, EyeOff, Eye, RefreshCw } from "lucide-react";
import { Input, Button } from "@/components/ui";

const P = { creme: "#111827", muted: "#9ca3af", sage: "#6b7280", verde: "#16a34a", vermelho: "#dc2626", border: "#e5e7eb" };

const BadgeConfigurado = ({ ok }: { ok: boolean }) => (
  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
    style={{ backgroundColor: ok ? P.verde + "22" : P.vermelho + "22", color: ok ? P.verde : P.vermelho }}>
    {ok ? <><CheckCircle size={10} /> Configurado</> : <><X size={10} /> Não configurado</>}
  </span>
);

export default function IntegracaoBancoInter({ onMsg }: { onMsg: (msg: { tipo: "ok" | "erro"; texto: string } | null) => void }) {
  const [loading, setLoading] = useState(true);
  const [interConfigured, setInterConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [interClientId, setInterClientId] = useState("");
  const [interClientSecret, setInterClientSecret] = useState("");
  const [interCertPem, setInterCertPem] = useState("");
  const [interKeyPem, setInterKeyPem] = useState("");
  const [interContaCorrente, setInterContaCorrente] = useState("");
  const [interCronSecret, setInterCronSecret] = useState("");
  const [showInterClientSecret, setShowInterClientSecret] = useState(false);
  const [showInterCronSecret, setShowInterCronSecret] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/configuracoes/integracoes");
        if (res.ok) { const data = await res.json(); setInterConfigured(data.inter_configured ?? false); }
      } catch { }
      setLoading(false);
    })();
  }, []);

  async function salvarInter() {
    setSaving(true); onMsg(null);
    const body: Record<string, string> = {};
    if (interClientId.trim()) body.inter_client_id = interClientId.trim();
    if (interClientSecret.trim()) body.inter_client_secret = interClientSecret.trim();
    if (interCertPem.trim()) body.inter_cert_pem = interCertPem.trim();
    if (interKeyPem.trim()) body.inter_key_pem = interKeyPem.trim();
    if (interContaCorrente.trim()) body.inter_conta_corrente = interContaCorrente.trim();
    if (interCronSecret.trim()) body.inter_cron_secret = interCronSecret.trim();
    const res = await fetch("/api/configuracoes/integracoes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) {
      setInterClientId(""); setInterClientSecret(""); setInterCertPem(""); setInterKeyPem(""); setInterContaCorrente(""); setInterCronSecret("");
      setInterConfigured(true);
      onMsg({ tipo: "ok", texto: "Banco Inter salvo com sucesso" });
    } else { const d = await res.json().catch(() => ({ error: "Erro" })); onMsg({ tipo: "erro", texto: d.error ?? "Erro" }); }
    setTimeout(() => onMsg(null), 4000);
  }

  function gerarCronSecret() {
    const secret = Array.from({ length: 32 }, () => Math.random().toString(36).charAt(2)).join("");
    setInterCronSecret(secret);
  }

  if (loading) return null;

  return (
    <div className="rounded-xl p-5 space-y-4 bg-white border border-gray-200 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg p-2" style={{ backgroundColor: "#FF6900" + "22", color: "#FF6900" }}><Landmark size={18} /></div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Banco Inter</p>
            <p className="text-xs text-gray-400">Boleto, PIX e extrato bancário</p>
          </div>
        </div>
        <BadgeConfigurado ok={interConfigured} />
      </div>

      <Input label="Client ID" value={interClientId} onChange={(e) => setInterClientId(e.target.value)} placeholder="Client ID do app Inter" />

      <div className="relative">
        <Input label="Client Secret" type={showInterClientSecret ? "text" : "password"} value={interClientSecret} onChange={(e) => setInterClientSecret(e.target.value)} placeholder="Client Secret" />
        <button onClick={() => setShowInterClientSecret(!showInterClientSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showInterClientSecret ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-widest block mb-1.5 font-semibold text-gray-500">Certificado (.crt — PEM)</label>
        <textarea value={interCertPem} onChange={(e) => setInterCertPem(e.target.value)} placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
          className="w-full px-3 py-2 rounded-lg text-xs font-mono border border-gray-200 bg-white text-gray-900 outline-none focus:border-[#184036] resize-none" rows={3} />
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-widest block mb-1.5 font-semibold text-gray-500">Chave Privada (.key — PEM)</label>
        <textarea value={interKeyPem} onChange={(e) => setInterKeyPem(e.target.value)} placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
          className="w-full px-3 py-2 rounded-lg text-xs font-mono border border-gray-200 bg-white text-gray-900 outline-none focus:border-[#184036] resize-none" rows={3} />
      </div>

      <Input label="Conta Corrente" value={interContaCorrente} onChange={(e) => setInterContaCorrente(e.target.value)} placeholder="Número da conta corrente" />

      <div className="relative">
        <Input label="Cron Secret (segredo p/ webhook)" type={showInterCronSecret ? "text" : "password"} value={interCronSecret} onChange={(e) => setInterCronSecret(e.target.value)} placeholder="Gere ou cole um segredo" />
        <button onClick={() => setShowInterCronSecret(!showInterCronSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showInterCronSecret ? <EyeOff size={15} /> : <Eye size={15} />}</button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="primary" size="sm" loading={saving} onClick={salvarInter}>
          <Save size={13} /> Salvar Banco Inter
        </Button>
        <Button variant="secondary" size="sm" onClick={gerarCronSecret}>
          <RefreshCw size={12} /> Gerar Cron Secret
        </Button>
      </div>

      {interConfigured && (
        <p className="text-xs flex items-center gap-1 text-green-600"><CheckCircle size={12} /> Banco Inter configurado</p>
      )}
    </div>
  );
}
