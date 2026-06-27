"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Save,
  X,
  Pencil,
  CheckCircle,
} from "lucide-react";
import { Button, Toggle, StatusBadge, MessageBox, Input } from "@/components/ui";

// ─── Paleta (tema claro — alinhado com aba Usuários) ─────────────────────────
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

interface FaixaComissao { id: number; desconto_pct: number; comissao_pct: number; ativo: boolean; }

// ─── Tab Comissões ────────────────────────────────────────────────────────────
export default function TabComissoes() {
  const [faixas,    setFaixas]    = useState<FaixaComissao[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editId,    setEditId]    = useState<number | null>(null);
  const [editVal,   setEditVal]   = useState("");
  const [saving,    setSaving]    = useState(false);
  const [addMode,   setAddMode]   = useState(false);
  const [newDesc,   setNewDesc]   = useState("");
  const [newCom,    setNewCom]    = useState("");
  const [saveErr,   setSaveErr]   = useState("");

  useEffect(() => {
    fetch("/api/vendas/faixas-comissao?todas=1")
      .then(r => r.json())
      .then((d: FaixaComissao[]) => setFaixas(d))
      .finally(() => setLoading(false));
  }, []);

  async function salvarEdicao(faixa: FaixaComissao) {
    const v = parseFloat(editVal.replace(",", "."));
    if (isNaN(v) || v < 0) return;
    setSaving(true);
    await fetch("/api/vendas/faixas-comissao", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: faixa.id, comissao_pct: v }),
    });
    setFaixas(prev => prev.map(f => f.id === faixa.id ? { ...f, comissao_pct: v } : f));
    setEditId(null);
    setSaving(false);
  }

  async function toggleAtivo(faixa: FaixaComissao) {
    await fetch("/api/vendas/faixas-comissao", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: faixa.id, comissao_pct: faixa.comissao_pct, ativo: !faixa.ativo }),
    });
    setFaixas(prev => prev.map(f => f.id === faixa.id ? { ...f, ativo: !f.ativo } : f));
  }

  async function adicionarFaixa() {
    const d = parseFloat(newDesc.replace(",", "."));
    const c = parseFloat(newCom.replace(",", "."));
    if (isNaN(d) || isNaN(c)) { setSaveErr("Valores inválidos"); return; }
    setSaving(true); setSaveErr("");
    const res = await fetch("/api/vendas/faixas-comissao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ desconto_pct: d, comissao_pct: c }),
    });
    const row = await res.json() as FaixaComissao;
    setFaixas(prev => {
      const sem = prev.filter(f => f.desconto_pct !== row.desconto_pct);
      return [...sem, { ...row, desconto_pct: Number(row.desconto_pct), comissao_pct: Number(row.comissao_pct) }]
        .sort((a, b) => a.desconto_pct - b.desconto_pct);
    });
    setNewDesc(""); setNewCom(""); setAddMode(false); setSaving(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold" style={{ color: P.creme }}>Tabela de Comissões</h2>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>
            Comissão da vendedora por faixa de desconto concedido ao cliente
          </p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setAddMode(v => !v)}>
          <Plus size={13} /> Nova faixa
        </Button>
      </div>

      {addMode && (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: P.border }}>
          <p className="text-xs font-semibold" style={{ color: P.creme }}>Nova faixa</p>
          <div className="flex gap-3 items-end flex-wrap">
            <Input label="Desconto (%)" type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="ex: 5" className="w-28" />
            <Input label="Comissão (%)" type="text" value={newCom} onChange={e => setNewCom(e.target.value)}
              placeholder="ex: 3.42" className="w-28" />
            <Button variant="primary" size="sm" loading={saving} onClick={adicionarFaixa}>
              <Save size={13} /> Salvar
            </Button>
            <Button variant="secondary" size="sm" onClick={() => { setAddMode(false); setSaveErr(""); }}>
              <X size={13} /> Cancelar
            </Button>
          </div>
          {saveErr && <MessageBox tipo="erro" mensagem={saveErr} onFechar={() => setSaveErr("")} />}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-center py-8" style={{ color: P.sage }}>Carregando...</div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: P.border }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: P.bg }}>
              <tr>
                {["Desconto concedido", "Comissão da vendedora", "Ativo", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: P.sage }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {faixas.map(f => (
                <tr key={f.id} className="border-t" style={{ borderColor: P.border, opacity: f.ativo ? 1 : 0.45 }}>
                  <td className="px-4 py-2.5 tabular-nums font-medium" style={{ color: P.creme }}>
                    {f.desconto_pct.toFixed(2)}%
                  </td>
                  <td className="px-4 py-2.5">
                    {editId === f.id ? (
                      <div className="flex items-center gap-2">
                        <Input autoFocus type="text" value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") salvarEdicao(f); if (e.key === "Escape") setEditId(null); }}
                          className="w-24" />
                        <span className="text-xs" style={{ color: P.sage }}>%</span>
                        <Button variant="ghost" size="sm" loading={saving} onClick={() => salvarEdicao(f)}>
                          <CheckCircle size={14} />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditId(null)}>
                          <X size={14} />
                        </Button>
                      </div>
                    ) : (
                      <span className="tabular-nums font-semibold" style={{ color: P.verde }}>
                        {f.comissao_pct.toFixed(2)}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Toggle ativo={f.ativo} onChange={() => toggleAtivo(f)} />
                      <StatusBadge ativo={f.ativo} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button variant="ghost" size="sm" onClick={() => { setEditId(f.id); setEditVal(f.comissao_pct.toFixed(2)); }}>
                      <Pencil size={13} />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs" style={{ color: P.muted }}>
        O limite máximo de desconto por vendedora é configurado na aba <strong>Usuários</strong>.
      </p>
    </div>
  );
}
