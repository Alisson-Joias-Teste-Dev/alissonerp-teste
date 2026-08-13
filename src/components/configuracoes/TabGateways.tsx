"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Save,
  Pencil,
  Trash2,
  CreditCard,
} from "lucide-react";
import { Button, Spinner, Toggle, StatusBadge, Badge, MessageBox } from "@/components/ui";

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

interface Gateway {
  id: number;
  nome: string;
  tipo: "pix" | "cartao" | "dinheiro" | "ouro" | "outro";
  ativo: boolean;
  cor: string;
  obs: string | null;
  created_at: string;
}

const TIPO_LABELS: Record<Gateway["tipo"], string> = {
  pix: "PIX", cartao: "Cartão", dinheiro: "Dinheiro", ouro: "Ouro", outro: "Outro",
};

const TIPO_CORES: Record<Gateway["tipo"], string> = {
  pix: "#1D4ED8", cartao: "#7C3AED", dinheiro: "#059669", ouro: "#D97706", outro: "#6B7280",
};

const TIPO_BADGE_COLOR: Record<Gateway["tipo"], "brand" | "success" | "error" | "warning" | "info" | "neutral" | "dourado"> = {
  pix: "info", cartao: "brand", dinheiro: "success", ouro: "dourado", outro: "neutral",
};

export default function TabGateways() {
  const [gateways, setGateways] = useState<Gateway[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ nome: "", tipo: "outro" as Gateway["tipo"], cor: "#6B7280", obs: "" });
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/configuracoes/gateways")
      .then(r => r.json())
      .then(data => { setGateways(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function startAdd() {
    setEditingId(null);
    setForm({ nome: "", tipo: "outro", cor: "#6B7280", obs: "" });
    setErro(null);
    setShowForm(true);
  }

  function startEdit(g: Gateway) {
    setEditingId(g.id);
    setForm({ nome: g.nome, tipo: g.tipo, cor: g.cor, obs: g.obs ?? "" });
    setErro(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.nome.trim()) { setErro("Nome obrigatório"); return; }
    setSaving(true);
    setErro(null);
    try {
      const url = editingId ? `/api/configuracoes/gateways/${editingId}` : "/api/configuracoes/gateways";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: form.nome.trim(), tipo: form.tipo, cor: form.cor, obs: form.obs.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setErro(data.error || "Erro ao salvar"); setSaving(false); return; }
      if (editingId) {
        setGateways(prev => prev.map(g => g.id === editingId ? data : g));
      } else {
        setGateways(prev => [...prev, data]);
      }
      setShowForm(false);
      setEditingId(null);
    } catch { setErro("Erro de rede"); }
    setSaving(false);
  }

  async function handleToggle(g: Gateway) {
    setTogglingId(g.id);
    const res = await fetch(`/api/configuracoes/gateways/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ativo: !g.ativo }),
    });
    if (res.ok) {
      const data = await res.json();
      setGateways(prev => prev.map(x => x.id === g.id ? data : x));
    }
    setTogglingId(null);
  }

  async function handleDelete(g: Gateway) {
    if (!confirm(`Excluir/desativar gateway "${g.nome}"?`)) return;
    setDeletingId(g.id);
    const res = await fetch(`/api/configuracoes/gateways/${g.id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.deleted) {
      setGateways(prev => prev.filter(x => x.id !== g.id));
    } else if (data.deactivated) {
      setGateways(prev => prev.map(x => x.id === g.id ? { ...x, ativo: false } : x));
    }
    setDeletingId(null);
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: P.creme }}>Gateways de Pagamento</h2>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>Configure as contas/gateways que recebem os pagamentos do caixa</p>
        </div>
        <Button variant="primary" size="sm" onClick={startAdd}>
          <Plus size={14} /> Novo Gateway
        </Button>
      </div>

      {/* Form novo/editar */}
      {showForm && (
        <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <h3 className="text-sm font-semibold" style={{ color: P.creme }}>
            {editingId ? "Editar Gateway" : "Novo Gateway"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: P.sage }}>Nome *</label>
              <input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Mercado Pago, Stone, Nubank..."
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: P.border, color: P.creme }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: P.sage }}>Tipo</label>
              <select
                value={form.tipo}
                onChange={e => {
                  const t = e.target.value as Gateway["tipo"];
                  setForm(f => ({ ...f, tipo: t, cor: TIPO_CORES[t] }));
                }}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: P.border, color: P.creme, backgroundColor: P.card }}
              >
                <option value="pix">PIX</option>
                <option value="cartao">Cartão</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="ouro">Ouro</option>
                <option value="outro">Outro (múltiplos)</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: P.sage }}>Cor</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.cor} onChange={e => setForm(f => ({ ...f, cor: e.target.value }))}
                  className="w-10 h-9 rounded-lg border cursor-pointer" style={{ borderColor: P.border }} />
                <span className="text-xs font-mono" style={{ color: P.sage }}>{form.cor}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: P.sage }}>Observação</label>
              <input
                value={form.obs}
                onChange={e => setForm(f => ({ ...f, obs: e.target.value }))}
                placeholder="Ex: conta PJ Bradesco"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={{ borderColor: P.border, color: P.creme }}
              />
            </div>
          </div>
          {erro && (
            <MessageBox tipo="erro" mensagem={erro} onFechar={() => setErro(null)} />
          )}
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => { setShowForm(false); setEditingId(null); setErro(null); }}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
              <Save size={13} /> {editingId ? "Salvar Alterações" : "Criar Gateway"}
            </Button>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Spinner size={18} />
        </div>
      ) : gateways.length === 0 ? (
        <div className="rounded-xl border p-8 text-center" style={{ borderColor: P.border }}>
          <CreditCard size={28} className="mx-auto mb-2" style={{ color: P.muted }} />
          <p className="text-sm" style={{ color: P.sage }}>Nenhum gateway cadastrado.</p>
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: P.border }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: P.bg, borderBottom: `1px solid ${P.border}` }}>
                {["Gateway", "Tipo", "Status", "Observação", ""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: P.sage }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gateways.map(g => (
                <tr key={g.id} className="border-t hover:bg-gray-50 transition-colors" style={{ borderColor: P.border }}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: g.cor }} />
                      <span className="font-medium" style={{ color: P.creme }}>{g.nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={TIPO_BADGE_COLOR[g.tipo]}>
                      {TIPO_LABELS[g.tipo]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Toggle ativo={g.ativo} onChange={() => handleToggle(g)} disabled={togglingId === g.id} />
                      <StatusBadge ativo={g.ativo} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs max-w-[200px] truncate" style={{ color: P.sage }}>{g.obs ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(g)} title="Editar">
                        <Pencil size={13} />
                      </Button>
                      <Button variant="danger" size="sm" loading={deletingId === g.id} onClick={() => handleDelete(g)} title="Excluir">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px]" style={{ color: P.muted }}>
        Gateways em uso por pagamentos serão desativados (não excluídos) ao remover.
      </p>
    </div>
  );
}
