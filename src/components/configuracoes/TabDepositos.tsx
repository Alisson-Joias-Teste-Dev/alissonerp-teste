"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Button, MessageBox } from "@/components/ui";
import FormularioDeposito from "./depositos/FormularioDeposito";
import ListaDepositos from "./depositos/ListaDepositos";

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

interface DepositoItem { id: number; nome: string; tipo: string; ativo: boolean }
interface SetorItem    { id: number; nome: string; deposito_id: number | null; ativo: boolean }

export default function TabDepositos() {
  const [depositos, setDepositos]     = useState<DepositoItem[]>([]);
  const [setores, setSetores]         = useState<SetorItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  // Formulário depósito
  const [showDepForm, setShowDepForm] = useState(false);
  const [editingDep, setEditingDep]   = useState<DepositoItem | null>(null);
  const [savingDep, setSavingDep]     = useState(false);

  // Formulário setor
  const [showSetorForm, setShowSetorForm] = useState<number | null>(null);
  const [editingSetor, setEditingSetor]   = useState<SetorItem | null>(null);
  const [savingSetor, setSavingSetor]     = useState(false);

  async function loadAll() {
    setLoading(true);
    const [deps, sets] = await Promise.all([
      fetch("/api/depositos").then(r => r.json()),
      fetch("/api/setores").then(r => r.json()),
    ]);
    setDepositos(Array.isArray(deps) ? deps : []);
    setSetores(Array.isArray(sets) ? sets : []);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  // ── Depósito CRUD ──
  async function salvarDeposito(nome: string) {
    if (!nome.trim()) return;
    setSavingDep(true); setError("");
    try {
      if (editingDep) {
        const res = await fetch(`/api/depositos/${editingDep.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      } else {
        const res = await fetch("/api/depositos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, tipo: "producao" }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      }
      setShowDepForm(false); setEditingDep(null);
      await loadAll();
    } catch (e) { setError((e as Error).message); }
    setSavingDep(false);
  }

  async function toggleDeposito(dep: DepositoItem) {
    if (dep.id === 1) return;
    const res = await fetch(`/api/depositos/${dep.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !dep.ativo }),
    });
    if (res.ok) await loadAll();
  }

  // ── Setor CRUD ──
  async function salvarSetor(depositoId: number, nome: string) {
    if (!nome.trim()) return;
    setSavingSetor(true); setError("");
    try {
      if (editingSetor) {
        const res = await fetch(`/api/setores/${editingSetor.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      } else {
        const res = await fetch("/api/setores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nome, deposito_id: depositoId }),
        });
        if (!res.ok) { const b = await res.json(); throw new Error(b.error); }
      }
      setShowSetorForm(null); setEditingSetor(null);
      await loadAll();
    } catch (e) { setError((e as Error).message); }
    setSavingSetor(false);
  }

  async function toggleSetor(s: SetorItem) {
    const res = await fetch(`/api/setores/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !s.ativo }),
    });
    if (res.ok) await loadAll();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: P.creme }}>
          Depósitos / Operadores
        </h2>
        <Button variant="outline" size="sm" onClick={() => { setShowDepForm(true); setEditingDep(null); setError(""); }}>
          <Plus size={13} /> Novo Depósito
        </Button>
      </div>

      {error && (
        <MessageBox tipo="erro" mensagem={error} onFechar={() => setError("")} />
      )}

      {/* Formulário novo/editar depósito */}
      {showDepForm && (
        <FormularioDeposito
          editingDep={editingDep}
          saving={savingDep}
          erro={error}
          onSalvar={salvarDeposito}
          onCancelar={() => { setShowDepForm(false); setEditingDep(null); }}
        />
      )}

      {/* Lista de depósitos com setores */}
      <ListaDepositos
        depositos={depositos}
        setores={setores}
        loading={loading}
        onToggleDeposito={toggleDeposito}
        onEditDeposito={(dep) => { setEditingDep(dep); setShowDepForm(true); setError(""); }}
        onToggleSetor={toggleSetor}
        showSetorForm={showSetorForm}
        setShowSetorForm={setShowSetorForm}
        editingSetor={editingSetor}
        setEditingSetor={setEditingSetor}
        savingSetor={savingSetor}
        onSalvarSetor={salvarSetor}
      />
    </div>
  );
}
