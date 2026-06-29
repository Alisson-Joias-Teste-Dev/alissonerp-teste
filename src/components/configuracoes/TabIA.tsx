"use client";

import { toast } from "sonner";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Save } from "lucide-react";
import { PROVEDORES } from "./constants";
import type { ConfigIA, KeysStatus, ResultadoIA } from "./types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { InputField } from "@/components/ui/InputField";
import { Switch } from "@/components/ui/Switch";
import { Label } from "@/components/ui/Label";
import { DropZone } from "@/components/ui/DropZone";

export default function TabIA() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [config, setConfig] = useState<ConfigIA>({ ia_ativa: "true", ia_provedor: "claude", ia_modelo_claude: "claude-haiku-4-5-20251001", ia_modelo_openai: "gpt-4o", ia_modelo_gemini: "gemini-2.0-flash" });
  const [keysStatus, setKeysStatus] = useState<KeysStatus>({ claude: false, openai: false, gemini: false });
  const [loading, setLoading] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const [margemPedra, setMargemPedra] = useState("10");
  const [salvandoMargem, setSalvandoMargem] = useState(false);

  const [testFile, setTestFile] = useState<File | null>(null);
  const [testPeso, setTestPeso] = useState("");
  const [testando, setTestando] = useState(false);
  const [testResult, setTestResult] = useState<ResultadoIA | null>(null);

  useEffect(() => { fetch("/api/configuracoes/ia").then(r => r.json()).then((d: { config: ConfigIA; keys_status: KeysStatus }) => { setConfig(d.config); setKeysStatus(d.keys_status); if (d.config.ia_margem_pedra_pct) setMargemPedra(d.config.ia_margem_pedra_pct); setLoading(false); }).catch(() => setLoading(false)); }, []);

  async function salvarProvedor(novo: string) { setSalvandoConfig(true); const r = await fetch("/api/configuracoes/ia", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provedor: novo }) }); setSalvandoConfig(false); if (!r.ok) { const b = await r.json().catch(() => ({})) as { error?: string }; toast.error("Erro: " + (b.error ?? r.status)); return; } setConfig(c => ({ ...c, ia_provedor: novo })); toast.success("Provedor alterado"); startTransition(() => router.refresh()); }

  async function toggleIA() { const novo = config.ia_ativa !== "true"; setSalvandoConfig(true); const r = await fetch("/api/configuracoes/ia", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ativa: novo }) }); setSalvandoConfig(false); if (!r.ok) { const b = await r.json().catch(() => ({})) as { error?: string }; toast.error("Erro: " + (b.error ?? r.status)); return; } setConfig(c => ({ ...c, ia_ativa: novo ? "true" : "false" })); toast.success(novo ? "IA ativada" : "IA desativada"); }

  async function salvarMargem() { const v = parseFloat(margemPedra); if (isNaN(v) || v < 0 || v > 50) { toast.error("Margem entre 0 e 50%"); return; } setSalvandoMargem(true); const r = await fetch("/api/configuracoes/ia", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ margem_pedra_pct: v }) }); setSalvandoMargem(false); if (r.ok) toast.success("Margem salva!"); else { const b = await r.json().catch(() => ({})) as { error?: string }; toast.error(b.error ?? "Erro."); } }

  async function testar() { if (!testFile || !testPeso) return; setTestando(true); setTestResult(null); const fd = new FormData(); fd.append("file", testFile); fd.append("peso", testPeso); const r = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd }); setTestResult(await r.json() as ResultadoIA); setTestando(false); }

  if (loading) return <div className="flex items-center gap-2 py-10 text-sm text-gray-500"><Loader2 size={16} className="animate-spin" />Carregando configurações de IA...</div>;

  const iaAtiva = config.ia_ativa === "true";
  const modeloAtual = config[`ia_modelo_${config.ia_provedor}` as keyof ConfigIA] ?? "—";

  return (
    <div className="space-y-5 sm:space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Validação por IA</h3>
            <p className="mt-1 text-xs text-gray-500">{iaAtiva ? `Ativa — ${config.ia_provedor} · ${modeloAtual}` : "Desativada — peso aceito sem conferência"}</p>
          </div>
          <Switch checked={iaAtiva} onChange={toggleIA} disabled={salvandoConfig} color="brand" />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
      <Card title="Provedor Ativo">
        <div className="space-y-2">
          {PROVEDORES.map(prov => {
            const sel = config.ia_provedor === prov.id;
            const temKey = keysStatus[prov.id as keyof KeysStatus];
            const modelo = config[`ia_modelo_${prov.id}` as keyof ConfigIA] ?? "—";
            return (
              <button key={prov.id} onClick={() => !sel && salvarProvedor(prov.id)} disabled={salvandoConfig}
                className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition disabled:opacity-50 ${sel ? "border-esmeralda-300 bg-esmeralda-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${sel ? "border-esmeralda-500" : "border-gray-300"}`}>
                    {sel && <div className="w-2 h-2 rounded-full bg-esmeralda-500" />}
                  </div>
                  <div><span className="text-sm font-medium text-gray-900">{prov.nome}</span><span className="text-xs ml-2 text-gray-500">{prov.empresa}</span><p className="text-xs font-mono mt-0.5 text-gray-400">{modelo}</p></div>
                </div>
                <Badge color={temKey ? "success" : "error"} size="sm">{temKey ? "Key configurada" : "Sem key"}</Badge>
              </button>
            );
          })}
        </div>
      </Card>

      <Card title="Tolerância de Validação">
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Ouro / Metal</p>
              <p className="text-xs mt-0.5 text-gray-500">Tolerância zero — peso lido pela IA deve coincidir exatamente com o digitado (±0.005g)</p>
            </div>
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Pedras</p>
              <p className="text-xs mt-0.5 mb-3 text-gray-500">Margem configurável — compara peso calculado com a balança</p>
              <Label className="mb-1.5 text-xs font-medium text-gray-700">Margem de erro</Label>
              <div className="flex items-center gap-3">
                <InputField type="number" min="0" max="50" step="1" value={margemPedra} onChange={e => setMargemPedra(e.target.value)} className="w-20 text-center" suffix="%" />
                <Button size="sm" onClick={salvarMargem} loading={salvandoMargem} startIcon={<Save size={11} />}>Salvar</Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Testar Validação">
        <div className="space-y-4">
          <Label>Foto da balança</Label>
          <DropZone
            file={testFile}
            onFileSelect={(f) => { setTestFile(f); setTestResult(null); }}
            onClear={() => { setTestFile(null); setTestResult(null); }}
            accept={{ "image/*": [".png", ".jpg", ".jpeg", ".webp"] }}
          />
          <div>
            <Label className="mb-1.5 text-xs font-medium text-gray-700">Peso digitado (g)</Label>
            <div className="flex items-center gap-3">
              <InputField type="number" step="0.001" placeholder="12.340" value={testPeso} onChange={e => { setTestPeso(e.target.value); setTestResult(null); }} className="w-32" suffix="g" />
              <Button onClick={testar} loading={testando} disabled={!testFile || !testPeso} size="sm" startIcon={!testando ? <Bot size={14} /> : undefined}>
                {testando ? "Testando..." : "Testar"}
              </Button>
            </div>
          </div>
          {testResult && (
            <div className={`rounded-xl border px-4 py-3 text-sm space-y-1 ${testResult.match ? "bg-success-50 border-success-200" : "bg-error-50 border-error-200"}`}>
              <p className={`font-semibold ${testResult.match ? "text-success-600" : "text-error-600"}`}>{testResult.match ? "✅ Peso confirmado" : testResult.mensagem}</p>
              {testResult.match && <p className="text-gray-600">Balança: {testResult.peso_balanca}g</p>}
              <p className="text-xs text-gray-500">Provedor: {testResult.provedor} · Confiança: {testResult.confianca}</p>
            </div>
          )}
        </div>
      </Card>
      </div>
    </div>
  );
}
