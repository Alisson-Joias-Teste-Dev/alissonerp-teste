"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Pencil,
  X,
} from "lucide-react";
import { Button, Spinner, Input } from "@/components/ui";

// ─── Paleta (tema claro) ─────────────────────────────────────────────────────
const P = {
  bg:       "#f9fafb",  // gray-50
  card:     "#ffffff",  // white
  border:   "#e5e7eb",  // gray-200
  creme:    "#111827",  // gray-900 — texto principal
  sage:     "#6b7280",  // gray-500 — texto secundário
  muted:    "#9ca3af",  // gray-400 — texto mutado
  dourado:  "#d97706",  // amber-600
  verde:    "#16a34a",  // green-600
  vermelho: "#dc2626",  // red-600
};

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TeorOuro {
  id: number;
  insumo_id: number;
  nome: string;
  teor: number;
  ativo: boolean;
  sku: string;
  updated_at: string;
}

export interface LigaTipo {
  id: number;
  tipo_18k_insumo_id: number;
  tipo_18k_nome: string;
  liga_insumo_id: number;
  liga_nome: string;
  teor_default: number;
  ativo: boolean;
  saldo_liga: number;
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function TabTeores({ teores: initial, ligaTipos: initialLiga }: { teores: TeorOuro[]; ligaTipos: LigaTipo[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [teores, setTeores] = useState<TeorOuro[]>(initial);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editTeor, setEditTeor] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [erros, setErros] = useState<Record<number, string>>({});

  const [ligaTipos, setLigaTipos] = useState<LigaTipo[]>(initialLiga);
  const [editandoLigaId, setEditandoLigaId] = useState<number | null>(null);
  const [editLigaTeor, setEditLigaTeor] = useState<string>("");
  const [savingLiga, setSavingLiga] = useState(false);
  const [savedLigaId, setSavedLigaId] = useState<number | null>(null);
  const [errosLiga, setErrosLiga] = useState<Record<number, string>>({});

  async function handleSave(t: TeorOuro) {
    const novoTeor = parseFloat(editTeor) / 100;
    if (isNaN(novoTeor) || novoTeor <= 0 || novoTeor > 1) {
      setErros(prev => ({ ...prev, [t.id]: "Teor deve ser entre 0.01 e 100%" }));
      return;
    }
    setSaving(true);
    setErros(prev => { const n = { ...prev }; delete n[t.id]; return n; });
    const res = await fetch(`/api/purificacao/teores/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teor: novoTeor, user_role: "admin" }),
    });
    setSaving(false);
    if (!res.ok) {
      const d = await res.json();
      setErros(prev => ({ ...prev, [t.id]: d.error ?? "Erro ao salvar" }));
      return;
    }
    setTeores(prev => prev.map(x => x.id === t.id ? { ...x, teor: novoTeor } : x));
    setEditandoId(null);
    setSavedId(t.id);
    setTimeout(() => setSavedId(null), 2000);
    startTransition(() => router.refresh());
  }

  async function handleSaveLiga(lt: LigaTipo) {
    const novoTeor = parseFloat(editLigaTeor) / 100;
    if (isNaN(novoTeor) || novoTeor <= 0 || novoTeor > 1) {
      setErrosLiga(prev => ({ ...prev, [lt.id]: "Teor deve ser entre 0.01 e 100%" }));
      return;
    }
    setSavingLiga(true);
    setErrosLiga(prev => { const n = { ...prev }; delete n[lt.id]; return n; });
    const res = await fetch(`/api/purificacao/liga-tipos/${lt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teor_default: novoTeor, user_role: "admin" }),
    });
    setSavingLiga(false);
    if (!res.ok) {
      const d = await res.json();
      setErrosLiga(prev => ({ ...prev, [lt.id]: d.error ?? "Erro ao salvar" }));
      return;
    }
    setLigaTipos(prev => prev.map(x => x.id === lt.id ? { ...x, teor_default: novoTeor } : x));
    setEditandoLigaId(null);
    setSavedLigaId(lt.id);
    setTimeout(() => setSavedLigaId(null), 2000);
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Seção A — Teores de Purificação */}
      <div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: P.creme }}>Teores de Purificação</h3>
        <p className="text-xs mb-3" style={{ color: P.muted }}>
          Teor de ouro puro por liga. Usado no cálculo da purificação (24k esperado).
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                {["Tipo de Ouro", "SKU", "Teor (%)", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teores.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${P.bg}` }}>
                  <td className="px-4 py-3 font-medium text-sm" style={{ color: P.creme }}>{t.nome}</td>
                  <td className="px-4 py-3 text-xs font-mono" style={{ color: P.muted }}>{t.sku}</td>
                  <td className="px-4 py-3">
                    {editandoId === t.id ? (
                      <div>
                        <Input
                          type="number"
                          value={editTeor}
                          min={1}
                          max={100}
                          step={0.01}
                          onChange={e => setEditTeor(e.target.value)}
                          className="w-24"
                          autoFocus
                        />
                        {erros[t.id] && <div className="text-[11px] mt-1" style={{ color: P.vermelho }}>{erros[t.id]}</div>}
                      </div>
                    ) : (
                      <span className="font-semibold" style={{ color: P.dourado }}>
                        {savedId === t.id ? "✓ " : ""}{(t.teor * 100).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span style={{ color: t.ativo ? P.verde : P.muted, fontSize: 12 }}>
                      {t.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editandoId === t.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="primary" size="sm" loading={saving} onClick={() => handleSave(t)}>
                          <Save size={12} /> Salvar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditandoId(null)}>
                          <X size={12} /> Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => { setEditandoId(t.id); setEditTeor(String((t.teor * 100).toFixed(2))); }}>
                        <Pencil size={12} /> Editar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Seção B — Mapeamento Liga */}
      <div>
        <h3 className="text-sm font-semibold mb-1" style={{ color: P.creme }}>Mapeamento Liga</h3>
        <p className="text-xs mb-3" style={{ color: P.muted }}>
          Qual liga italiana usar para cada tipo de Ouro 18k na fundição, e o teor padrão de cada combinação.
        </p>
        <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${P.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                {["Tipo 18k", "Liga", "Teor Padrão (%)", "Saldo Liga", "Status", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: P.muted }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ligaTipos.map(lt => (
                <tr key={lt.id} style={{ borderBottom: `1px solid ${P.bg}` }}>
                  <td className="px-4 py-3 font-medium text-sm" style={{ color: P.creme }}>{lt.tipo_18k_nome}</td>
                  <td className="px-4 py-3 text-sm" style={{ color: P.muted }}>{lt.liga_nome}</td>
                  <td className="px-4 py-3">
                    {editandoLigaId === lt.id ? (
                      <div>
                        <Input
                          type="number"
                          value={editLigaTeor}
                          min={1}
                          max={100}
                          step={0.01}
                          onChange={e => setEditLigaTeor(e.target.value)}
                          className="w-24"
                          autoFocus
                        />
                        {errosLiga[lt.id] && <div className="text-[11px] mt-1" style={{ color: P.vermelho }}>{errosLiga[lt.id]}</div>}
                      </div>
                    ) : (
                      <span className="font-semibold" style={{ color: P.dourado }}>
                        {savedLigaId === lt.id ? "✓ " : ""}{(Number(lt.teor_default) * 100).toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: P.muted }}>{Number(lt.saldo_liga).toFixed(2)}g</td>
                  <td className="px-4 py-3">
                    <span style={{ color: lt.ativo ? P.verde : P.muted, fontSize: 12 }}>
                      {lt.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editandoLigaId === lt.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="primary" size="sm" loading={savingLiga} onClick={() => handleSaveLiga(lt)}>
                          <Save size={12} /> Salvar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setEditandoLigaId(null)}>
                          <X size={12} /> Cancelar
                        </Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => { setEditandoLigaId(lt.id); setEditLigaTeor(String((Number(lt.teor_default) * 100).toFixed(2))); }}>
                        <Pencil size={12} /> Editar
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
