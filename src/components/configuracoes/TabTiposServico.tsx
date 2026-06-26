"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button, Spinner } from "@/components/ui";
import { useErrorStore } from "@/stores/errorStore";
import FormularioTipoServico from "./tipos_servico/FormularioTipoServico";
import ListaTiposServico from "./tipos_servico/ListaTiposServico";

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

interface TipoServico {
  id: number;
  nome: string;
  ativo: boolean;
  created_at: string;
}

export default function TabTiposServico() {
  const [tipos, setTipos]             = useState<TipoServico[]>([]);
  const [loading, setLoading]         = useState(true);
  const [erro, setErro]               = useState("");

  // Estado form novo
  const [showForm, setShowForm]       = useState(false);

  // Inline edit state
  const [editandoId, setEditandoId]   = useState<number | null>(null);
  const [editNome, setEditNome]       = useState("");
  const [salvandoId, setSalvandoId]   = useState<number | null>(null);
  const [savedId, setSavedId]         = useState<number | null>(null);

  async function carregar() {
    setLoading(true);
    setErro("");
    const res = await fetch("/api/tipos-servico?todos=true").catch((e) => {
      useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao carregar tipos de serviço", { level: "warning" });
      return null;
    });
    if (!res?.ok) { setErro("Erro ao carregar tipos"); setLoading(false); return; }
    const data = await res.json();
    setTipos(data.tipos ?? []);
    setLoading(false);
  }

  useEffect(() => { carregar(); }, []);

  async function handleEditar(id: number, nome: string) {
    const nomeTrimmed = nome.trim();
    if (!nomeTrimmed) return;
    setSalvandoId(id);
    await fetch("/api/tipos-servico", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, nome: nomeTrimmed }),
    }).catch((e) => useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao editar tipo de serviço", { level: "critical" }));
    setSalvandoId(null);
    setEditandoId(null);
    setSavedId(id);
    setTimeout(() => setSavedId(null), 2000);
    carregar();
  }

  async function handleToggleAtivo(t: TipoServico) {
    setSalvandoId(t.id);
    await fetch("/api/tipos-servico", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, ativo: !t.ativo }),
    }).catch((e) => useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao alterar tipo de serviço", { level: "critical" }));
    setSalvandoId(null);
    carregar();
  }

  if (loading) return (
    <div className="flex items-center gap-2 py-8" style={{ color: P.muted }}>
      <Spinner size={14} /> Carregando...
    </div>
  );

  return (
    <div className="space-y-5 max-w-xl">
      {/* Header + botão novo */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: P.creme }}>Tipos de Serviço</h3>
          <p className="text-xs mt-0.5" style={{ color: P.muted }}>
            Tipos usados em ordens de Serviço Interno. Múltipla seleção por ordem.
          </p>
        </div>
        {!showForm && (
          <Button variant="primary" size="sm" onClick={() => { setShowForm(true); }}>
            <Plus size={13} /> Novo Tipo
          </Button>
        )}
      </div>

      {/* Form novo */}
      {showForm && (
        <FormularioTipoServico
          onSalvar={() => { setShowForm(false); carregar(); }}
          onCancelar={() => setShowForm(false)}
        />
      )}

      {/* Tabela com inline edit */}
      <ListaTiposServico
        tipos={tipos}
        erro={erro}
        editandoId={editandoId}
        setEditandoId={setEditandoId}
        editNome={editNome}
        setEditNome={setEditNome}
        salvandoId={salvandoId}
        savedId={savedId}
        onEditar={handleEditar}
        onToggleAtivo={handleToggleAtivo}
      />

      <p className="text-[10px]" style={{ color: P.muted }}>
        Tipos inativos não aparecem no modal de criação de ordens, mas são mantidos no histórico.
      </p>
    </div>
  );
}
