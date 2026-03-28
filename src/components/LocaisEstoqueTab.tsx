"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Check, X, Loader2 } from "lucide-react";

const P = {
  bg:       "#f9fafb",
  card:     "#ffffff",
  border:   "#e5e7eb",
  creme:    "#111827",
  sage:     "#6b7280",
  muted:    "#9ca3af",
  verde:    "#16a34a",
  vermelho: "#dc2626",
};

interface Local {
  id: number;
  nome: string;
  ativo: boolean;
}

interface Props {
  canEdit: boolean; // admin or desenvolvedor
}

export default function LocaisEstoqueTab({ canEdit }: Props) {
  const [locais, setLocais] = useState<Local[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNome, setEditNome] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function loadLocais() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/locais-estoque");
      if (!res.ok) throw new Error("Erro ao carregar locais");
      const data = await res.json();
      setLocais(Array.isArray(data) ? data : []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLocais(); }, []);

  async function handleCreate() {
    if (!novoNome.trim()) { setCreateError("Nome é obrigatório."); return; }
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/locais-estoque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: novoNome.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Erro ao criar");
      }
      setNovoNome("");
      setShowCreate(false);
      await loadLocais();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : "Erro ao criar");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveEdit(id: number) {
    if (!editNome.trim()) { setSaveError("Nome é obrigatório."); return; }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/locais-estoque/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: editNome.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Erro ao salvar");
      }
      setEditingId(null);
      await loadLocais();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAtivo(local: Local) {
    if (local.id === 1) return; // Fábrica: cannot deactivate
    setSaving(true);
    try {
      await fetch(`/api/locais-estoque/${local.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !local.ativo }),
      });
      await loadLocais();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold" style={{ color: P.creme }}>Locais de Estoque</p>
          <p className="text-xs mt-0.5" style={{ color: P.muted }}>
            Fábrica e Loja (e outros locais personalizados)
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowCreate(!showCreate); setNovoNome(""); setCreateError(""); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: P.verde, color: "#fff" }}
          >
            <Plus size={13} /> Novo Local
          </button>
        )}
      </div>

      {/* Create form */}
      {showCreate && canEdit && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ border: `1px solid ${P.border}`, backgroundColor: P.bg }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: P.sage }}>Novo Local</p>
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Ex: Vitrine Loja"
            className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
            style={{ borderColor: P.border }}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
            autoFocus
          />
          {createError && (
            <p className="text-xs" style={{ color: P.vermelho }}>{createError}</p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50"
              style={{ backgroundColor: P.verde, color: "#fff" }}
            >
              {creating ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {creating ? "Criando..." : "Criar"}
            </button>
            <button
              onClick={() => { setShowCreate(false); setNovoNome(""); setCreateError(""); }}
              className="px-3 py-1.5 rounded-lg text-xs"
              style={{ color: P.sage }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: P.vermelho + "22", color: P.vermelho }}>
          {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm" style={{ color: P.muted }}>
          <Loader2 size={14} className="animate-spin" /> Carregando...
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: `1px solid ${P.border}` }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: P.bg }}>
                {["ID", "Nome", "Ativo", "Ações"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: P.muted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locais.map((l, i) => (
                <tr
                  key={l.id}
                  className="border-t"
                  style={{
                    borderColor: P.border,
                    backgroundColor: i % 2 === 0 ? P.card : P.bg,
                  }}
                >
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: P.muted }}>{l.id}</td>
                  <td className="px-4 py-2.5">
                    {editingId === l.id ? (
                      <input
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        className="px-2 py-1 rounded border text-sm outline-none"
                        style={{ borderColor: P.border }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(l.id); }}
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm font-medium" style={{ color: P.creme }}>
                        {l.nome}
                        {l.id === 1 && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#DBEAFE", color: "#1D4ED8" }}>
                            Sistema
                          </span>
                        )}
                      </span>
                    )}
                    {editingId === l.id && saveError && (
                      <p className="text-[10px] mt-0.5" style={{ color: P.vermelho }}>{saveError}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={
                        l.ativo
                          ? { backgroundColor: "#D1FAE5", color: "#065F46" }
                          : { backgroundColor: "#FEE2E2", color: "#991B1B" }
                      }
                    >
                      {l.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        {editingId === l.id ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(l.id)}
                              disabled={saving}
                              className="p-1 rounded hover:bg-green-50 transition-colors"
                              title="Salvar"
                            >
                              {saving ? <Loader2 size={13} className="animate-spin" style={{ color: P.verde }} /> : <Check size={13} style={{ color: P.verde }} />}
                            </button>
                            <button
                              onClick={() => { setEditingId(null); setSaveError(""); }}
                              className="p-1 rounded hover:bg-gray-100 transition-colors"
                              title="Cancelar"
                            >
                              <X size={13} style={{ color: P.muted }} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => { setEditingId(l.id); setEditNome(l.nome); setSaveError(""); }}
                              className="p-1 rounded hover:bg-gray-100 transition-colors"
                              title="Editar nome"
                            >
                              <Pencil size={13} style={{ color: P.sage }} />
                            </button>
                            {l.id !== 1 && (
                              <button
                                onClick={() => handleToggleAtivo(l)}
                                className="text-[11px] px-2 py-0.5 rounded border transition-colors"
                                style={{
                                  borderColor: l.ativo ? P.vermelho + "55" : P.verde + "55",
                                  color: l.ativo ? P.vermelho : P.verde,
                                }}
                                title={l.ativo ? "Desativar" : "Ativar"}
                              >
                                {l.ativo ? "Desativar" : "Ativar"}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {locais.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm" style={{ color: P.muted }}>
                    Nenhum local cadastrado
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
