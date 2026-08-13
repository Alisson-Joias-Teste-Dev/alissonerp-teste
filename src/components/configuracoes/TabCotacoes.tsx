"use client";

import { useState, useEffect } from "react";
import { RefreshCw, Eye, EyeOff, Save } from "lucide-react";
import { Button, Toggle, MessageBox, Input } from "@/components/ui";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

export default function TabCotacoes() {
  const [loading, setLoading] = useState(true);
  const [cotacoes, setCotacoes] = useState({ ouro: 0, dollar: 0, euro: 0, prata: 0 });
  const [autoAtivo, setAutoAtivo] = useState(false);
  const [ultimoUpdate, setUltimoUpdate] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  async function carregarDados() {
    setLoading(true);
    try {
      const res = await fetch("/api/configuracoes/cotacoes");
      if (!res.ok) throw new Error("Erro ao carregar");
      const data = await res.json();
      setCotacoes(data.cotacoes);
      setAutoAtivo(data.config.auto_ativo);
      setUltimoUpdate(data.config.ultimo_update);
      setKeyConfigured(data.config.api_key_configured ?? false);
    } catch {
      setMsg({ tipo: "erro", texto: "Erro ao carregar cotações" });
    }
    setLoading(false);
  }

  useEffect(() => { carregarDados(); }, []);

  async function toggleAuto() {
    const novo = !autoAtivo;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/configuracoes/cotacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auto_ativo: novo }),
    });
    setSaving(false);
    if (res.ok) {
      setAutoAtivo(novo);
      setMsg({ tipo: "ok", texto: `Automático ${novo ? "ativado" : "desativado"}` });
    } else {
      setMsg({ tipo: "erro", texto: "Erro ao salvar" });
    }
    setTimeout(() => setMsg(null), 3000);
  }

  async function salvarApiKey() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/configuracoes/cotacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey.trim() }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg({ tipo: "ok", texto: "API key salva com sucesso" });
    } else {
      setMsg({ tipo: "erro", texto: "Erro ao salvar API key" });
    }
    setTimeout(() => setMsg(null), 3000);
  }

  async function atualizarAgora() {
    setAtualizando(true);
    setMsg(null);
    try {
      const res = await fetch("/api/configuracoes/cotacoes", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setCotacoes(data.cotacoes);
        setUltimoUpdate(data.atualizado_em);
        setMsg({ tipo: "ok", texto: "Cotações atualizadas com sucesso" });
      } else {
        setMsg({ tipo: "erro", texto: data.error ?? "Erro ao atualizar" });
      }
    } catch {
      setMsg({ tipo: "erro", texto: "Falha na requisição" });
    }
    setAtualizando(false);
    setTimeout(() => setMsg(null), 5000);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-sm text-gray-400">
        <RefreshCw size={14} className="animate-spin" /> Carregando cotações...
      </div>
    );
  }

  const cards = [
    { label: "Ouro (R$/g)", value: cotacoes.ouro.toFixed(2) },
    { label: "Dólar (R$)",  value: cotacoes.dollar.toFixed(4) },
    { label: "Euro (R$)",   value: cotacoes.euro.toFixed(4) },
    { label: "Prata (R$/g)", value: cotacoes.prata.toFixed(2) },
  ];

  return (
    <div className="space-y-6">
      {/* Cards de cotação */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(({ label, value }) => (
          <div key={label} className="rounded-xl p-4 border border-gray-200 bg-white">
            <p className="text-[10px] uppercase tracking-widest mb-1 text-gray-400">{label}</p>
            <p className="text-lg font-semibold tabular-nums text-amber-600">{value}</p>
          </div>
        ))}
      </div>

      {/* Último update */}
      <p className="text-xs text-gray-400">
        Último update: {ultimoUpdate ? fmtDate(ultimoUpdate) : "Nunca"}
      </p>

      {/* Toggle automático */}
      <div className="flex items-center justify-between rounded-xl p-4 border border-gray-200 bg-white">
        <div>
          <p className="text-sm font-semibold text-gray-900">Atualização Automática</p>
          <p className="text-xs mt-0.5 text-gray-400">Atualiza cotações automaticamente via n8n</p>
        </div>
        <div className="flex items-center gap-2">
          <Toggle ativo={autoAtivo} onChange={toggleAuto} />
          <span className={`text-xs font-medium ${autoAtivo ? "text-green-600" : "text-gray-400"}`}>
            {autoAtivo ? "Ativo" : "Inativo"}
          </span>
        </div>
      </div>

      {/* API Key */}
      <div className="rounded-xl p-4 border border-gray-200 bg-white space-y-3">
        <p className="text-sm font-semibold text-gray-900">API Key (Open Exchange Rates)</p>
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Cole sua API key aqui"
          />
          <button
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        {keyConfigured && !apiKey && (
          <p className="text-xs text-green-600">✓ Key já configurada anteriormente</p>
        )}
        <Button variant="primary" size="sm" loading={saving} disabled={!apiKey.trim()} onClick={salvarApiKey}>
          <Save size={13} /> Salvar Key
        </Button>
      </div>

      {/* Botão atualizar agora */}
      <Button variant="primary" size="md" loading={atualizando} onClick={atualizarAgora}>
        <RefreshCw size={15} /> Atualizar Agora
      </Button>

      {msg && (
        <MessageBox tipo={msg.tipo} mensagem={msg.texto} onFechar={() => setMsg(null)} />
      )}
    </div>
  );
}
