"use client";

import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Button, Spinner, Input } from "@/components/ui";

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

export default function TabCreditoLoja() {
  const [saldo, setSaldo] = useState<number | null>(null);
  const [limite, setLimite] = useState<number | null>(null);
  const [movimentos, setMovimentos] = useState<Array<{
    id: number; tipo: string; valor: number; saldo_antes: number; saldo_depois: number;
    descricao: string | null; usuario_nome: string | null; numero_venda: string | null; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [ajusteValor, setAjusteValor] = useState("");
  const [ajusteDesc, setAjusteDesc] = useState("");
  const [novoLimite, setNovoLimite] = useState("");
  const [saving, setSaving] = useState(false);

  const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  async function loadData() {
    setLoading(true);
    try {
      const [sRes, mRes] = await Promise.all([
        fetch("/api/saldo-credito").then(r => r.json()),
        fetch("/api/saldo-credito/movimentos?limit=30").then(r => r.json()),
      ]);
      setSaldo(sRes.saldo_atual);
      setLimite(sRes.limite);
      setNovoLimite(String(sRes.limite));
      setMovimentos(mRes.movimentos ?? []);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, []);

  async function handleAjuste() {
    const valor = parseFloat(ajusteValor.replace(",", "."));
    if (!valor || !ajusteDesc.trim()) return alert("Valor e descrição obrigatórios");
    setSaving(true);
    try {
      const res = await fetch("/api/saldo-credito", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor, descricao: ajusteDesc.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setAjusteValor(""); setAjusteDesc("");
      await loadData();
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
    finally { setSaving(false); }
  }

  async function handleLimite() {
    const lim = parseFloat(novoLimite.replace(",", "."));
    if (isNaN(lim) || lim < 0) return alert("Limite inválido");
    setSaving(true);
    try {
      const res = await fetch("/api/saldo-credito", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limite: lim }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      await loadData();
    } catch (e) { alert(e instanceof Error ? e.message : "Erro"); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size={16} /></div>;

  const pctUsado = limite && limite > 0 ? ((limite - (saldo ?? 0)) / limite) * 100 : 0;
  const corBarra = pctUsado > 80 ? "#EF4444" : pctUsado > 50 ? "#D97706" : "#059669";

  return (
    <div className="space-y-6">
      {/* Cards resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border p-5" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: P.sage }}>Saldo Disponível</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "#059669" }}>{fmt(saldo ?? 0)}</p>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: P.sage }}>Limite Configurado</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: P.creme }}>{fmt(limite ?? 0)}</p>
        </div>
        <div className="rounded-xl border p-5" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <p className="text-xs uppercase tracking-widest mb-1" style={{ color: P.sage }}>Utilização</p>
          <div className="flex items-end gap-2">
            <p className="text-2xl font-bold tabular-nums" style={{ color: corBarra }}>{pctUsado.toFixed(0)}%</p>
          </div>
          <div className="mt-2 h-2 rounded-full" style={{ backgroundColor: P.border }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(pctUsado, 100)}%`, backgroundColor: corBarra }} />
          </div>
        </div>
      </div>

      {/* Ajuste manual + alterar limite */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border p-4" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <p className="text-sm font-semibold mb-3" style={{ color: P.creme }}>Ajustar Saldo</p>
          <div className="space-y-2">
            <Input type="text" value={ajusteValor} onChange={e => setAjusteValor(e.target.value)}
              placeholder="Valor (positivo = crédito, negativo = débito)" />
            <Input type="text" value={ajusteDesc} onChange={e => setAjusteDesc(e.target.value)}
              placeholder="Descrição do ajuste" />
            <Button variant="primary" size="sm" loading={saving} onClick={handleAjuste}>
              <Save size={14} /> Aplicar Ajuste
            </Button>
          </div>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: P.border, backgroundColor: P.card }}>
          <p className="text-sm font-semibold mb-3" style={{ color: P.creme }}>Alterar Limite</p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input type="text" value={novoLimite} onChange={e => setNovoLimite(e.target.value)} />
            </div>
            <Button variant="primary" size="sm" loading={saving} onClick={handleLimite}>
              <Save size={14} /> Salvar
            </Button>
          </div>
        </div>
      </div>

      {/* Tabela de movimentos */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: P.border }}>
        <div className="px-4 py-3" style={{ backgroundColor: P.card }}>
          <p className="text-sm font-semibold" style={{ color: P.creme }}>Movimentações Recentes</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: P.bg }}>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Data</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Tipo</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Venda</th>
                <th className="text-right px-4 py-2 font-medium" style={{ color: P.sage }}>Valor</th>
                <th className="text-right px-4 py-2 font-medium" style={{ color: P.sage }}>Saldo</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Descrição</th>
                <th className="text-left px-4 py-2 font-medium" style={{ color: P.sage }}>Usuário</th>
              </tr>
            </thead>
            <tbody>
              {movimentos.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: P.sage }}>Nenhuma movimentação registrada</td></tr>
              )}
              {movimentos.map(m => (
                <tr key={m.id} className="border-t" style={{ borderColor: P.border }}>
                  <td className="px-4 py-2 tabular-nums" style={{ color: P.sage }}>
                    {new Date(m.created_at).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: m.tipo === "credito" ? "#D1FAE5" : m.tipo === "debito" ? "#FEE2E2" : "#DBEAFE",
                        color: m.tipo === "credito" ? "#065F46" : m.tipo === "debito" ? "#991B1B" : "#1E40AF",
                      }}>
                      {m.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-2" style={{ color: P.creme }}>{m.numero_venda ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium"
                    style={{ color: m.tipo === "credito" ? "#059669" : m.tipo === "debito" ? "#EF4444" : "#3B82F6" }}>
                    {m.tipo === "debito" ? "-" : "+"}{fmt(m.valor)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums" style={{ color: P.sage }}>{fmt(m.saldo_depois)}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: P.sage }}>{m.descricao ?? "—"}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: P.sage }}>{m.usuario_nome ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
