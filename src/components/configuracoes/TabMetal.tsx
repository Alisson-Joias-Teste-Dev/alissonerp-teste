"use client";

import { useState, useEffect } from "react";
import { Button, MessageBox, Input } from "@/components/ui";

export default function TabMetal() {
  const [config, setConfig] = useState({
    compra_metal_min_pct: 80,
    compra_metal_max_pct: 85,
    compra_metal_comm_pct: 50,
    receb_metal_min_pct: 95,
    receb_metal_max_pct: 100,
    metal_home_roles: [] as string[],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [erroMsg, setErroMsg] = useState("");
  const [erroLoad, setErroLoad] = useState("");

  useEffect(() => {
    fetch("/api/metal/configuracoes")
      .then((r) => {
        if (!r.ok) throw new Error(`Erro ${r.status} ao carregar`);
        return r.json();
      })
      .then((d) => {
        if (d && typeof d === "object") setConfig((c) => ({ ...c, ...d }));
      })
      .catch((e) => {
        setErroLoad((e as Error).message || "Falha ao carregar configurações");
      })
      .finally(() => setLoading(false));
  }, []);

  async function salvar() {
    setSaving(true);
    setSaved(false);
    setErroMsg("");
    try {
      const res = await fetch("/api/metal/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.details || `Erro ${res.status}`);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setErroMsg((e as Error).message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-center py-8 text-sm text-muted-foreground">Carregando...</div>;

  if (erroLoad) return (
    <div className="text-center py-8 space-y-2">
      <p className="text-sm text-red-600">{erroLoad}</p>
      <button onClick={() => { setErroLoad(""); setLoading(true); window.location.reload(); }} className="text-xs text-[#1A3C34] underline">Tentar novamente</button>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Compra de Metal */}
      <div className="bg-white rounded-2xl border border-[#C59B6D]/20 p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#1A3C34]">Compra de Metal (Fornecedor)</h3>
        <p className="text-xs text-[#1A3C34]/60">
          A empresa paga ao fornecedor um percentual da cotação do ouro. Comissão do funcionário é calculada sobre o spread.
        </p>

        <div className="space-y-3">
          <Input label="% Mínimo da Cotação" type="number" min={0} max={100} value={config.compra_metal_min_pct} onChange={(e) => setConfig((c) => ({ ...c, compra_metal_min_pct: Number(e.target.value) }))} />
          <div>
            <Input label="% Máximo da Cotação" type="number" min={0} max={100} value={config.compra_metal_max_pct} onChange={(e) => setConfig((c) => ({ ...c, compra_metal_max_pct: Number(e.target.value) }))} />
            <div className="mt-2 bg-[#1A3C34]/10 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full bg-[#1A3C34]" style={{ width: `${Math.min(100, config.compra_metal_max_pct - config.compra_metal_min_pct)}%` }} />
            </div>
            <p className="text-[10px] text-[#1A3C34]/40 mt-1">Faixa: {config.compra_metal_min_pct}% – {config.compra_metal_max_pct}%</p>
          </div>
          <Input label="% Comissão sobre Spread" type="number" min={0} max={100} value={config.compra_metal_comm_pct} onChange={(e) => setConfig((c) => ({ ...c, compra_metal_comm_pct: Number(e.target.value) }))} />
        </div>
      </div>

      {/* Recebimento de Metal */}
      <div className="bg-white rounded-2xl border border-[#C59B6D]/20 p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#1A3C34]">Recebimento de Metal (Cliente)</h3>
        <p className="text-xs text-[#1A3C34]/60">
          Cliente entrega metal como parte do pagamento de uma joia. Percentual define o crédito concedido por grama.
        </p>

        <div className="space-y-3">
          <Input label="% Mínimo da Cotação" type="number" min={0} max={100} value={config.receb_metal_min_pct} onChange={(e) => setConfig((c) => ({ ...c, receb_metal_min_pct: Number(e.target.value) }))} />
          <div>
            <Input label="% Máximo da Cotação" type="number" min={0} max={100} value={config.receb_metal_max_pct} onChange={(e) => setConfig((c) => ({ ...c, receb_metal_max_pct: Number(e.target.value) }))} />
            <div className="mt-2 bg-[#1A3C34]/10 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full bg-[#1A3C34]" style={{ width: `${Math.min(100, config.receb_metal_max_pct - config.receb_metal_min_pct)}%` }} />
            </div>
            <p className="text-[10px] text-[#1A3C34]/40 mt-1">Faixa: {config.receb_metal_min_pct}% – {config.receb_metal_max_pct}%</p>
          </div>
        </div>
      </div>

      {/* REGRA DE NEGÓCIO: Roles que abrem o sistema direto no módulo Metal.
           Apenas roles com acesso ao módulo metal são listadas. */}
      <div className="bg-white rounded-2xl border border-[#C59B6D]/20 p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#1A3C34]">Abrir Metal ao Logar</h3>
        <p className="text-xs text-[#1A3C34]/60">
          Usuários com estas roles serão redirecionados para o módulo Metal ao acessar o sistema.
          Nenhum selecionado = ninguém é redirecionado.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja", "estoquista_fabrica", "consultora"].map((role) => {
            const checked = config.metal_home_roles.includes(role);
            return (
              <label
                key={role}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs transition-colors ${
                  checked
                    ? "bg-[#1A3C34] border-[#1A3C34] text-[#F2E8D5]"
                    : "bg-[#F2E8D5]/20 border-[#C59B6D]/20 text-[#1A3C34]/70 hover:border-[#C59B6D]/50"
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={() => {
                    setConfig((c) => ({
                      ...c,
                      metal_home_roles: checked
                        ? c.metal_home_roles.filter((r) => r !== role)
                        : [...c.metal_home_roles, role],
                    }));
                  }}
                />
                <span className="capitalize">{role.replace(/_/g, " ")}</span>
              </label>
            );
          })}
        </div>
      </div>

      {erroMsg && (
        <MessageBox tipo="erro" mensagem={erroMsg} onFechar={() => setErroMsg("")} />
      )}

      <Button
        variant="primary"
        loading={saving}
        className="w-full"
        size="md"
        onClick={salvar}
      >
        {saving ? "Salvando..." : saved ? "Salvo!" : erroMsg ? "Tentar Novamente" : "Salvar Configurações"}
      </Button>
    </div>
  );
}
