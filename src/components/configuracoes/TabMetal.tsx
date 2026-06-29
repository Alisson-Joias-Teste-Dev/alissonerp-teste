"use client";

import { toast } from "sonner";
import { useState, useEffect } from "react";
import { Save, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { InputField } from "@/components/ui/InputField";

export default function TabMetal() {
  const [config, setConfig] = useState({ compra_metal_min_pct: 80, compra_metal_max_pct: 85, compra_metal_comm_pct: 50, receb_metal_min_pct: 95, receb_metal_max_pct: 100, metal_home_roles: [] as string[] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erroMsg, setErroMsg] = useState("");
  const [erroLoad, setErroLoad] = useState("");

  useEffect(() => { fetch("/api/metal/configuracoes").then(r => { if (!r.ok) throw new Error(`Erro ${r.status}`); return r.json(); }).then(d => { if (d && typeof d === "object") setConfig(c => ({ ...c, ...d })); }).catch(e => setErroLoad((e as Error).message || "Falha ao carregar")).finally(() => setLoading(false)); }, []);

  async function salvar() { setSaving(true); setSaved(false); setErroMsg(""); try { const res = await fetch("/api/metal/configuracoes", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }); if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || err.details || `Erro ${res.status}`); } setSaved(true); toast.success("Configurações salvas"); setTimeout(() => setSaved(false), 2000); } catch (e) { setErroMsg((e as Error).message || "Erro ao salvar"); toast.error("Erro ao salvar"); } finally { setSaving(false); } }

  if (loading) return <div className="text-center py-8 text-sm text-gray-500"><Loader2 size={18} className="animate-spin mx-auto mb-2" />Carregando...</div>;
  if (erroLoad) return <div className="text-center py-8"><p className="text-sm text-error-600">{erroLoad}</p><button onClick={() => { setErroLoad(""); setLoading(true); window.location.reload(); }} className="text-xs text-esmeralda-600 underline mt-2">Tentar novamente</button></div>;

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
      <Card title="Compra de Metal (Fornecedor)" desc="A empresa paga ao fornecedor um percentual da cotação do ouro. Comissão do funcionário é calculada sobre o spread.">
        <div className="space-y-4">
          <InputField label="% Mínimo da Cotação" type="number" min={0} max={100} value={config.compra_metal_min_pct} onChange={e => setConfig(c => ({ ...c, compra_metal_min_pct: Number(e.target.value) }))} />
          <div>
            <InputField label="% Máximo da Cotação" type="number" min={0} max={100} value={config.compra_metal_max_pct} onChange={e => setConfig(c => ({ ...c, compra_metal_max_pct: Number(e.target.value) }))} />
            <div className="mt-2 h-2 rounded-full bg-esmeralda-100 overflow-hidden"><div className="h-full rounded-full bg-esmeralda-600" style={{ width: `${Math.min(100, config.compra_metal_max_pct - config.compra_metal_min_pct)}%` }} /></div>
            <p className="text-xs text-gray-400 mt-1">Faixa: {config.compra_metal_min_pct}% – {config.compra_metal_max_pct}%</p>
          </div>
          <InputField label="% Comissão sobre Spread" type="number" min={0} max={100} value={config.compra_metal_comm_pct} onChange={e => setConfig(c => ({ ...c, compra_metal_comm_pct: Number(e.target.value) }))} />
        </div>
      </Card>

      <Card title="Recebimento de Metal (Cliente)" desc="Cliente entrega metal como parte do pagamento de uma joia. Percentual define o crédito concedido por grama.">
        <div className="space-y-4">
          <InputField label="% Mínimo da Cotação" type="number" min={0} max={100} value={config.receb_metal_min_pct} onChange={e => setConfig(c => ({ ...c, receb_metal_min_pct: Number(e.target.value) }))} />
          <div>
            <InputField label="% Máximo da Cotação" type="number" min={0} max={100} value={config.receb_metal_max_pct} onChange={e => setConfig(c => ({ ...c, receb_metal_max_pct: Number(e.target.value) }))} />
            <div className="mt-2 h-2 rounded-full bg-esmeralda-100 overflow-hidden"><div className="h-full rounded-full bg-esmeralda-600" style={{ width: `${Math.min(100, config.receb_metal_max_pct - config.receb_metal_min_pct)}%` }} /></div>
            <p className="text-xs text-gray-400 mt-1">Faixa: {config.receb_metal_min_pct}% – {config.receb_metal_max_pct}%</p>
          </div>
        </div>
      </Card>
      </div>

      <Card title="Abrir Metal ao Logar" desc="Usuários com estas roles serão redirecionados para o módulo Metal ao acessar o sistema.">
        <div className="flex flex-wrap gap-2">
          {["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica", "consultora"].map((role) => {
            const checked = config.metal_home_roles.includes(role);
            return (
              <label key={role} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs font-medium transition-colors ${checked ? "bg-esmeralda-600 border-esmeralda-600 text-white" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => setConfig(c => ({ ...c, metal_home_roles: checked ? c.metal_home_roles.filter(r => r !== role) : [...c.metal_home_roles, role] }))} />
                <span className="capitalize">{role.replace(/_/g, " ")}</span>
              </label>
            );
          })}
        </div>
      </Card>

      {erroMsg && <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-sm text-error-700">{erroMsg}</div>}

      <Button size="md" onClick={salvar} loading={saving} startIcon={<Save size={15} />}>
        {saving ? "Salvando..." : saved ? "Salvo!" : "Salvar"}
      </Button>
    </div>
  );
}
