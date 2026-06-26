"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import FormularioFrete from "./fretes/FormularioFrete";
import TabelaFretes from "./fretes/TabelaFretes";

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

interface FreteBairro {
  id: number;
  bairro: string;
  municipio: string | null;
  valor: number;
  ativo: boolean;
}

export default function TabFretes() {
  const [fretes, setFretes] = useState<FreteBairro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [salvandoId, setSalvandoId] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [erroId, setErroId] = useState<number | null>(null);
  const [editValores, setEditValores] = useState<Record<number, string>>({});
  const [showForm, setShowForm] = useState(false);

  async function carregar() {
    setLoading(true);
    try {
      const res = await fetch("/api/configuracoes/fretes-bairro");
      const data = await res.json();
      setFretes(Array.isArray(data) ? data : (data.fretes ?? []));
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function handleSalvar(frete: FreteBairro) {
    const valorStr = editValores[frete.id] ?? String(frete.valor);
    const valor = parseFloat(valorStr.replace(",", "."));
    if (isNaN(valor) || valor < 0) return;
    setSalvandoId(frete.id); setErroId(null);
    try {
      const res = await fetch(`/api/configuracoes/fretes-bairro/${frete.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor }),
      });
      if (!res.ok) throw new Error("Erro");
      setFretes(prev => prev.map(f => f.id === frete.id ? { ...f, valor } : f));
      setEditValores(prev => { const next = { ...prev }; delete next[frete.id]; return next; });
      setSavedId(frete.id);
      setTimeout(() => setSavedId(null), 2000);
    } catch {
      setErroId(frete.id);
    } finally {
      setSalvandoId(null);
    }
  }

  async function handleToggleAtivo(frete: FreteBairro) {
    setSalvandoId(frete.id);
    try {
      const res = await fetch(`/api/configuracoes/fretes-bairro/${frete.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !frete.ativo }),
      });
      if (!res.ok) throw new Error("Erro");
      setFretes(prev => prev.map(f => f.id === frete.id ? { ...f, ativo: !f.ativo } : f));
    } catch { /* silencioso */ }
    finally { setSalvandoId(null); }
  }

  async function handleCriarFrete() {
    await carregar();
    setShowForm(false);
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-10 justify-center text-sm" style={{ color: P.muted }}>
      <Spinner size={14} /> Carregando fretes...
    </div>
  );

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h3 className="text-sm font-semibold" style={{ color: P.creme }}>Fretes por Bairro</h3>
        <p className="text-xs mt-0.5" style={{ color: P.muted }}>
          Configure o valor de frete para cada bairro. Bairros inativos não aparecem no cálculo automático.
        </p>
      </div>

      {/* Botão novo / formulário inline */}
      {!showForm ? (
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>
          <Plus size={13} /> Adicionar bairro
        </Button>
      ) : (
        <FormularioFrete onSalvar={handleCriarFrete} onCancelar={() => setShowForm(false)} />
      )}

      {/* Tabela com filtro */}
      <TabelaFretes
        fretes={fretes}
        filtro={filtro}
        onFiltroChange={setFiltro}
        editValores={editValores}
        onEditValorChange={(id, valor) => setEditValores(prev => ({ ...prev, [id]: valor }))}
        onSalvar={handleSalvar}
        onToggleAtivo={handleToggleAtivo}
        salvandoId={salvandoId}
        savedId={savedId}
        erroId={erroId}
      />
    </div>
  );
}
