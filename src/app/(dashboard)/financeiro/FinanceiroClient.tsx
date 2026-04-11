"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileUp,
  Landmark,
  Plus,
  X,
  Loader2,
  Link2,
  Save,
} from "lucide-react";
import { dispararWebhook } from "@/lib/webhooks";

// ─── types ───────────────────────────────────────────────────────────────────

interface ContaPagar {
  id: number;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_pagamento: string | null;
  situacao: string;
  categoria: string | null;
  obs: string | null;
}

interface ContaReceber {
  id: number;
  descricao: string;
  valor: number;
  data_vencimento: string | null;
  data_recebimento: string | null;
  situacao: string;
  categoria: string | null;
  obs: string | null;
}

interface Extrato {
  id: number;
  banco: string | null;
  arquivo_nome: string | null;
  processado: boolean;
  total_lancamentos: number;
  data_inicio: string | null;
  data_fim: string | null;
  created_at: string;
}

interface Lancamento {
  id: number;
  fitid: string | null;
  tipo: string | null;
  valor: number;
  data_transacao: string | null;
  descricao: string | null;
  memo: string | null;
  conciliado: boolean;
  extrato_id: number | null;
  banco: string | null;
}

interface Props {
  pagar: ContaPagar[];
  receber: ContaReceber[];
  extratos: Extrato[];
  lancamentos: Lancamento[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC" });
};

const isVencido = (d: string | null, situacao: string) => {
  if (situacao !== "pendente" || !d) return false;
  const venc = d.slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);
  return venc < hoje;
};

const SITUACAO: Record<string, { label: string; color: string; icon: any }> = {
  pendente:   { label: "Pendente",   color: "#DB9864", icon: Clock },
  pago:       { label: "Pago",       color: "#4A9F73", icon: CheckCircle },
  recebido:   { label: "Recebido",   color: "#4A9F73", icon: CheckCircle },
  cancelado:  { label: "Cancelado",  color: "#E05C5C", icon: AlertTriangle },
  vencido:    { label: "Vencido",    color: "#E05C5C", icon: AlertTriangle },
};

// ─── ContaRow ────────────────────────────────────────────────────────────────

function ContaRow({
  descricao,
  valor,
  vencimento,
  liquidacao,
  situacao,
  categoria,
  vencido,
  onAction,
  actionLabel,
  actionLoading,
}: {
  descricao: string;
  valor: number;
  vencimento: string | null;
  liquidacao: string | null;
  situacao: string;
  categoria: string | null;
  vencido: boolean;
  onAction?: () => void;
  actionLabel?: string;
  actionLoading?: boolean;
}) {
  const st = vencido ? SITUACAO["vencido"] : (SITUACAO[situacao] ?? { label: situacao, color: "#4A7568", icon: Clock });
  const Icon = st.icon;
  return (
    <tr style={{ borderBottom: "1px solid #0F2922" }} className="hover:bg-[#0F2922]/40 transition-colors">
      <td className="px-4 py-3 max-w-[220px]">
        <p className="text-sm truncate" style={{ color: "#F3EADA" }}>{descricao}</p>
        {categoria && (
          <p className="text-[10px]" style={{ color: "#4A7568" }}>{categoria}</p>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap" style={{ color: "#DB9864" }}>
        {fmt(Number(valor))}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: vencido ? "#E05C5C" : "#80A795" }}>
        {fmtDate(vencimento)}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "#4A7568" }}>
        {fmtDate(liquidacao)}
      </td>
      <td className="px-4 py-3">
        <span
          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
          style={{ backgroundColor: st.color + "22", color: st.color }}
        >
          <Icon size={10} />
          {st.label}
        </span>
      </td>
      {onAction && situacao === "pendente" && (
        <td className="px-4 py-3">
          <button
            onClick={onAction}
            disabled={actionLoading}
            className="text-[10px] px-2.5 py-1 rounded-lg font-medium disabled:opacity-30 transition-opacity flex items-center gap-1 whitespace-nowrap"
            style={{ backgroundColor: "#4A9F7322", color: "#4A9F73" }}
          >
            {actionLoading ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
            {actionLabel}
          </button>
        </td>
      )}
      {onAction && situacao !== "pendente" && (
        <td className="px-4 py-3" />
      )}
    </tr>
  );
}

// ─── TabPagar ────────────────────────────────────────────────────────────────

function TabPagar({ pagar }: { pagar: ContaPagar[] }) {
  const [filtro, setFiltro] = useState("todos");
  const [lista, setLista] = useState(pagar);
  const [showForm, setShowForm] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [form, setForm] = useState({ descricao: "", valor: "", data_vencimento: "", categoria: "", obs: "" });

  const totalPendente = lista
    .filter((p) => p.situacao === "pendente")
    .reduce((s, p) => s + Number(p.valor), 0);
  const totalVencido = lista
    .filter((p) => isVencido(p.data_vencimento, p.situacao))
    .reduce((s, p) => s + Number(p.valor), 0);

  const filtradas = useMemo(() => {
    if (filtro === "vencido") return lista.filter((p) => isVencido(p.data_vencimento, p.situacao));
    if (filtro === "todos") return lista;
    return lista.filter((p) => p.situacao === filtro);
  }, [lista, filtro]);

  async function handleNovaConta() {
    if (!form.descricao.trim() || !form.valor) return;
    setFormSaving(true);
    const res = await fetch("/api/financeiro/contas-pagar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento || undefined,
        categoria: form.categoria || undefined,
        obs: form.obs || undefined,
      }),
    });
    setFormSaving(false);
    if (res.ok) {
      const nova = await res.json();
      setLista((prev) => [{
        id: nova.id,
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento || null,
        data_pagamento: null,
        situacao: "pendente",
        categoria: form.categoria || null,
        obs: form.obs || null,
      }, ...prev]);
      setForm({ descricao: "", valor: "", data_vencimento: "", categoria: "", obs: "" });
      setShowForm(false);
    } else {
      const data = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      alert(data.error || "Erro ao criar conta a pagar");
    }
  }

  async function marcarPago(id: number) {
    setActionId(id);
    const res = await fetch(`/api/financeiro/contas-pagar/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situacao: "pago", data_pagamento: new Date().toISOString().slice(0, 10) }),
    });
    if (res.ok) {
      setLista((prev) => prev.map((p) => p.id === id ? { ...p, situacao: "pago", data_pagamento: new Date().toISOString().slice(0, 10) } : p));
    } else {
      const data = await res.json().catch(() => ({ error: "Erro" }));
      alert(data.error || "Erro ao marcar como pago");
    }
    setActionId(null);
  }

  return (
    <div className="space-y-4">
      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Contas", value: lista.length },
          { label: "Pendente", value: fmt(totalPendente), color: "#DB9864" },
          { label: "Vencido", value: fmt(totalVencido), color: "#E05C5C" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-3" style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#4A7568" }}>{label}</p>
            <p className="text-lg font-semibold" style={{ color: color ?? "#F3EADA" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Nova Conta button + form */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          style={{ backgroundColor: "#4A9F73", color: "#fff" }}
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? "Cancelar" : "Nova Conta a Pagar"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Descrição *</label>
              <input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Valor *</label>
              <input type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Vencimento</label>
              <input type="date" value={form.data_vencimento} onChange={(e) => setForm((f) => ({ ...f, data_vencimento: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Categoria</label>
              <input value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Observações</label>
            <input value={form.obs} onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
          </div>
          <button
            onClick={handleNovaConta}
            disabled={formSaving || !form.descricao.trim() || !form.valor}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: "#4A9F73", color: "#fff" }}
          >
            {formSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Salvar
          </button>
        </div>
      )}

      {/* Filtro status */}
      <div className="flex gap-2 flex-wrap">
        {["todos", "pendente", "pago", "cancelado", "vencido"].map((s) => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className="text-[11px] px-3 py-1 rounded-full capitalize transition-colors"
            style={{
              backgroundColor: filtro === s ? "#1C3D32" : "transparent",
              border: "1px solid",
              borderColor: filtro === s ? "#4A9F73" : "#1C3D32",
              color: filtro === s ? "#F3EADA" : "#4A7568",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1C3D32" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0F2922", borderBottom: "1px solid #1C3D32" }}>
                {["Descrição", "Valor", "Vencimento", "Pagamento", "Situação", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: "#4A7568" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "#4A7568" }}>Nenhuma conta encontrada</td></tr>
              ) : (
                filtradas.map((p) => (
                  <ContaRow
                    key={p.id}
                    descricao={p.descricao}
                    valor={p.valor}
                    vencimento={p.data_vencimento}
                    liquidacao={p.data_pagamento}
                    situacao={p.situacao}
                    categoria={p.categoria}
                    vencido={!!isVencido(p.data_vencimento, p.situacao)}
                    onAction={() => marcarPago(p.id)}
                    actionLabel="Marcar como Pago"
                    actionLoading={actionId === p.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── TabReceber ──────────────────────────────────────────────────────────────

function TabReceber({ receber }: { receber: ContaReceber[] }) {
  const [filtro, setFiltro] = useState("todos");
  const [lista, setLista] = useState(receber);
  const [showForm, setShowForm] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [form, setForm] = useState({ descricao: "", valor: "", data_vencimento: "", categoria: "", obs: "" });

  // Backend usa 'pago' como status de CR quitada (via trigger 113 e
  // fn_cr_marcar_pago_mp). A UI antiga usava 'recebido' como sinônimo,
  // então tratamos ambos como equivalentes pra compatibilidade.
  const isRecebido = (s: string) => s === "pago" || s === "recebido";

  const totalPendente = lista
    .filter((r) => r.situacao === "pendente")
    .reduce((s, r) => s + Number(r.valor), 0);
  const totalRecebido = lista
    .filter((r) => isRecebido(r.situacao))
    .reduce((s, r) => s + Number(r.valor), 0);

  const filtradas = useMemo(() => {
    if (filtro === "vencido") return lista.filter((r) => isVencido(r.data_vencimento, r.situacao));
    if (filtro === "todos") return lista;
    if (filtro === "recebido") return lista.filter((r) => isRecebido(r.situacao));
    return lista.filter((r) => r.situacao === filtro);
  }, [lista, filtro]);

  async function handleNovaConta() {
    if (!form.descricao.trim() || !form.valor) return;
    setFormSaving(true);
    const res = await fetch("/api/financeiro/contas-receber", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento || undefined,
        categoria: form.categoria || undefined,
        obs: form.obs || undefined,
      }),
    });
    setFormSaving(false);
    if (res.ok) {
      const nova = await res.json();
      setLista((prev) => [{
        id: nova.id,
        descricao: form.descricao.trim(),
        valor: Number(form.valor),
        data_vencimento: form.data_vencimento || null,
        data_recebimento: null,
        situacao: "pendente",
        categoria: form.categoria || null,
        obs: form.obs || null,
      }, ...prev]);
      setForm({ descricao: "", valor: "", data_vencimento: "", categoria: "", obs: "" });
      setShowForm(false);
    } else {
      const data = await res.json().catch(() => ({ error: "Erro ao salvar" }));
      alert(data.error || "Erro ao criar conta a receber");
    }
  }

  async function marcarRecebido(id: number) {
    setActionId(id);
    // Usa 'pago' porque é o valor que o backend (trigger 113 e
    // fn_cr_marcar_pago_mp) grava. Antes era 'recebido' mas criava
    // inconsistência com CRs pagas automaticamente pelo webhook MP.
    const res = await fetch(`/api/financeiro/contas-receber/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situacao: "pago", data_recebimento: new Date().toISOString().slice(0, 10) }),
    });
    if (res.ok) {
      setLista((prev) => prev.map((r) => r.id === id ? { ...r, situacao: "pago", data_recebimento: new Date().toISOString().slice(0, 10) } : r));
    } else {
      const data = await res.json().catch(() => ({ error: "Erro" }));
      alert(data.error || "Erro ao marcar como recebido");
    }
    setActionId(null);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Contas", value: lista.length },
          { label: "A Receber", value: fmt(totalPendente), color: "#DB9864" },
          { label: "Recebido", value: fmt(totalRecebido), color: "#4A9F73" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg p-3" style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#4A7568" }}>{label}</p>
            <p className="text-lg font-semibold" style={{ color: color ?? "#F3EADA" }}>{value}</p>
          </div>
        ))}
      </div>

      {/* Nova Conta button + form */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
          style={{ backgroundColor: "#4A9F73", color: "#fff" }}
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? "Cancelar" : "Nova Conta a Receber"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Descrição *</label>
              <input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Valor *</label>
              <input type="number" step="0.01" min="0.01" value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Vencimento</label>
              <input type="date" value={form.data_vencimento} onChange={(e) => setForm((f) => ({ ...f, data_vencimento: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Categoria</label>
              <input value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest block mb-1" style={{ color: "#4A7568" }}>Observações</label>
            <input value={form.obs} onChange={(e) => setForm((f) => ({ ...f, obs: e.target.value }))} className="w-full rounded-lg bg-transparent px-3 py-2 text-sm outline-none" style={{ border: "1px solid #1C3D32", color: "#F3EADA" }} />
          </div>
          <button
            onClick={handleNovaConta}
            disabled={formSaving || !form.descricao.trim() || !form.valor}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: "#4A9F73", color: "#fff" }}
          >
            {formSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Salvar
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {["todos", "pendente", "recebido", "cancelado", "vencido"].map((s) => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className="text-[11px] px-3 py-1 rounded-full capitalize transition-colors"
            style={{
              backgroundColor: filtro === s ? "#1C3D32" : "transparent",
              border: "1px solid",
              borderColor: filtro === s ? "#4A9F73" : "#1C3D32",
              color: filtro === s ? "#F3EADA" : "#4A7568",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1C3D32" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#0F2922", borderBottom: "1px solid #1C3D32" }}>
                {["Descrição", "Valor", "Vencimento", "Recebimento", "Situação", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: "#4A7568" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "#4A7568" }}>Nenhuma conta encontrada</td></tr>
              ) : (
                filtradas.map((r) => (
                  <ContaRow
                    key={r.id}
                    descricao={r.descricao}
                    valor={r.valor}
                    vencimento={r.data_vencimento}
                    liquidacao={r.data_recebimento}
                    situacao={r.situacao}
                    categoria={r.categoria}
                    vencido={!!isVencido(r.data_vencimento, r.situacao)}
                    onAction={() => marcarRecebido(r.id)}
                    actionLabel="Marcar como Recebido"
                    actionLoading={actionId === r.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── TabConciliacao ──────────────────────────────────────────────────────────

function TabConciliacao({ extratos: extratosInit, lancamentos: lancamentosInit }: { extratos: Extrato[]; lancamentos: Lancamento[] }) {
  const [extratosList, setExtratosList] = useState(extratosInit);
  const [lancamentosList, setLancamentosList] = useState(lancamentosInit);
  const [extratoSel, setExtratoSel] = useState<number | null>(extratosInit[0]?.id ?? null);
  const [reprocessando, setReprocessando] = useState<number | null>(null);

  // OFX Upload state
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ inseridos: number; duplicados: number } | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Conciliação sugestões
  const [sugestoes, setSugestoes] = useState<Array<{
    lancamento: { id: number; valor: number; descricao: string | null; data_transacao: string | null; tipo: string };
    tipo_match: string;
    matches: Array<{ id: number; valor: number; descricao: string | null; fornecedor_nome?: string; cliente_nome?: string }>;
  }>>([]);
  const [loadingSugestoes, setLoadingSugestoes] = useState(false);
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);

  const carregarSugestoes = useCallback(async () => {
    setLoadingSugestoes(true);
    try {
      const res = await fetch("/api/financeiro/conciliar");
      if (res.ok) {
        const data = await res.json();
        setSugestoes(data.sugestoes ?? []);
      }
    } catch (e) { console.error("Erro ao carregar sugestões:", e); }
    setLoadingSugestoes(false);
  }, []);

  useEffect(() => { carregarSugestoes(); }, [carregarSugestoes]);

  async function handleUploadOFX(file: File) {
    if (!file.name.toLowerCase().endsWith(".ofx")) {
      setUploadError("Apenas arquivos .ofx são aceitos");
      return;
    }
    setUploading(true);
    setUploadResult(null);
    setUploadError("");
    const fd = new FormData();
    fd.append("arquivo", file);
    try {
      const res = await fetch("/api/financeiro/upload-ofx", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok) {
        setUploadResult({ inseridos: data.inseridos, duplicados: data.duplicados });
        // Refresh: re-fetch extratos + lancamentos
        const [eRes, lRes] = await Promise.all([
          fetch("/api/financeiro/extratos"),
          fetch("/api/financeiro/lancamentos"),
        ]);
        if (eRes.ok) { const e = await eRes.json(); setExtratosList(e); }
        if (lRes.ok) { const l = await lRes.json(); setLancamentosList(l); }
        carregarSugestoes();
      } else {
        setUploadError(data.error ?? "Erro ao processar OFX");
      }
    } catch {
      setUploadError("Falha no upload");
    }
    setUploading(false);
    setTimeout(() => { setUploadResult(null); setUploadError(""); }, 6000);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUploadOFX(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUploadOFX(file);
    e.target.value = "";
  }

  async function confirmarConciliacao(lancamentoId: number, match: { id: number }, tipoMatch: string) {
    setConfirmandoId(lancamentoId);
    const body: Record<string, number> = { lancamento_id: lancamentoId };
    if (tipoMatch === "conta_pagar") body.conta_pagar_id = match.id;
    else body.conta_receber_id = match.id;
    try {
      const res = await fetch("/api/financeiro/conciliar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setSugestoes((prev) => prev.filter((s) => s.lancamento.id !== lancamentoId));
        setLancamentosList((prev) => prev.map((l) => l.id === lancamentoId ? { ...l, conciliado: true } : l));
      }
    } catch { /* silenciar */ }
    setConfirmandoId(null);
  }

  async function handleReprocessar(extratoId: number) {
    setReprocessando(extratoId);
    await dispararWebhook("processar-ofx", { extrato_id: extratoId });
    setReprocessando(null);
  }

  const lancamentos = lancamentosList;
  const extratos = extratosList;

  const lançamentosFiltrados = useMemo(
    () => (extratoSel ? lancamentos.filter((l) => l.extrato_id === extratoSel) : lancamentos),
    [lancamentos, extratoSel]
  );

  const totalC = lançamentosFiltrados.filter((l) => l.tipo === "C").reduce((s, l) => s + Number(l.valor), 0);
  const totalD = lançamentosFiltrados.filter((l) => l.tipo === "D").reduce((s, l) => s + Number(l.valor), 0);
  const conciliados = lançamentosFiltrados.filter((l) => l.conciliado).length;

  return (
    <div className="space-y-4">
      {/* Upload OFX */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#4A7568" }}>
          Importar Extrato OFX
        </p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-xl p-6 text-center cursor-pointer transition-colors"
          style={{
            backgroundColor: dragging ? "#1C3D3280" : "#0F2922",
            border: `2px dashed ${dragging ? "#4A9F73" : "#1C3D32"}`,
          }}
        >
          <input ref={fileInputRef} type="file" accept=".ofx" onChange={handleFileSelect} className="hidden" />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" style={{ color: "#4A9F73" }} />
              <p className="text-sm" style={{ color: "#80A795" }}>Processando arquivo...</p>
            </div>
          ) : (
            <>
              <FileUp size={24} className="mx-auto mb-2" style={{ color: "#4A7568" }} />
              <p className="text-sm" style={{ color: "#80A795" }}>
                Arraste um arquivo .ofx ou clique para selecionar
              </p>
            </>
          )}
        </div>
        {uploadResult && (
          <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: "#4A9F7322", color: "#4A9F73" }}>
            <CheckCircle size={13} /> {uploadResult.inseridos} inseridos, {uploadResult.duplicados} duplicados
          </div>
        )}
        {uploadError && (
          <div className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: "#E05C5C22", color: "#E05C5C" }}>
            <AlertTriangle size={13} /> {uploadError}
          </div>
        )}
      </div>

      {/* Sugestões de conciliação */}
      {sugestoes.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#4A7568" }}>
            Sugestões de Conciliação ({sugestoes.length})
          </p>
          <div className="space-y-2">
            {sugestoes.map((s) => (
              <div key={s.lancamento.id} className="rounded-xl p-3" style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-bold"
                        style={{
                          backgroundColor: s.lancamento.tipo === "C" ? "#4A9F7322" : "#E05C5C22",
                          color: s.lancamento.tipo === "C" ? "#4A9F73" : "#E05C5C",
                        }}
                      >
                        {s.lancamento.tipo === "C" ? "Entrada" : "Saida"}
                      </span>
                      <span className="text-xs font-medium tabular-nums" style={{ color: "#DB9864" }}>
                        {fmt(s.lancamento.valor)}
                      </span>
                      <span className="text-[10px]" style={{ color: "#4A7568" }}>
                        {fmtDate(s.lancamento.data_transacao)}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ color: "#F3EADA" }}>
                      {s.lancamento.descricao ?? "Sem descrição"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Link2 size={12} style={{ color: "#4A7568" }} />
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  {s.matches.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ backgroundColor: "#081B15" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] truncate" style={{ color: "#80A795" }}>
                          {m.descricao ?? (s.tipo_match === "conta_pagar" ? (m as Record<string, unknown>).fornecedor_nome as string : (m as Record<string, unknown>).cliente_nome as string) ?? "—"}
                        </p>
                        <p className="text-[10px] tabular-nums" style={{ color: "#4A7568" }}>{fmt(m.valor)}</p>
                      </div>
                      <button
                        onClick={() => confirmarConciliacao(s.lancamento.id, m, s.tipo_match)}
                        disabled={confirmandoId === s.lancamento.id}
                        className="text-[10px] px-2.5 py-1 rounded-lg font-medium disabled:opacity-30 transition-opacity flex items-center gap-1 whitespace-nowrap"
                        style={{ backgroundColor: "#4A9F7322", color: "#4A9F73" }}
                      >
                        {confirmandoId === s.lancamento.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle size={10} />}
                        Confirmar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loadingSugestoes && (
        <div className="flex items-center gap-2 text-xs" style={{ color: "#4A7568" }}>
          <Loader2 size={12} className="animate-spin" /> Carregando sugestões...
        </div>
      )}

      {/* Extratos */}
      <div>
        <p className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "#4A7568" }}>
          Extratos OFX importados
        </p>
        {extratos.length === 0 ? (
          <div
            className="rounded-xl p-6 text-center"
            style={{ backgroundColor: "#0F2922", border: "1px dashed #1C3D32" }}
          >
            <FileUp size={24} className="mx-auto mb-2" style={{ color: "#4A7568" }} />
            <p className="text-sm" style={{ color: "#4A7568" }}>
              Nenhum extrato importado. Arraste um arquivo .ofx acima ou aguarde o n8n.
            </p>
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {extratos.map((e) => (
              <button
                key={e.id}
                onClick={() => setExtratoSel(e.id)}
                className="rounded-lg px-3 py-2 text-left transition-colors"
                style={{
                  backgroundColor: extratoSel === e.id ? "#1C3D32" : "#0F2922",
                  border: `1px solid ${extratoSel === e.id ? "#4A9F73" : "#1C3D32"}`,
                }}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Landmark size={11} style={{ color: "#80A795" }} />
                  <span className="text-xs font-medium" style={{ color: "#F3EADA" }}>
                    {e.banco ?? "Banco"} — #{e.id}
                  </span>
                  {e.processado && (
                    <CheckCircle size={10} style={{ color: "#4A9F73" }} />
                  )}
                </div>
                <p className="text-[10px]" style={{ color: "#4A7568" }}>
                  {e.total_lancamentos} lançamentos · {fmtDate(e.data_inicio)}
                  {e.data_fim ? ` – ${fmtDate(e.data_fim)}` : ""}
                </p>
                <button
                  onClick={(ev) => { ev.stopPropagation(); handleReprocessar(e.id); }}
                  disabled={reprocessando === e.id}
                  className="mt-1.5 text-[10px] flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
                  style={{ color: "#80A795" }}
                >
                  <RefreshCw size={9} className={reprocessando === e.id ? "animate-spin" : ""} />
                  {reprocessando === e.id ? "Enviando..." : "Reprocessar"}
                </button>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mini stats extrato selecionado */}
      {extratoSel && lançamentosFiltrados.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Lançamentos", value: lançamentosFiltrados.length },
            { label: "Entradas (C)", value: fmt(totalC), color: "#4A9F73" },
            { label: "Saídas (D)", value: fmt(totalD), color: "#E05C5C" },
            { label: "Conciliados", value: conciliados, color: conciliados > 0 ? "#4A9F73" : "#4A7568" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-3" style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}>
              <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "#4A7568" }}>{label}</p>
              <p className="text-base font-semibold" style={{ color: color ?? "#F3EADA" }}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabela lançamentos */}
      {lançamentosFiltrados.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #1C3D32" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: "#0F2922", borderBottom: "1px solid #1C3D32" }}>
                  {["Data", "Tipo", "Valor", "Descrição", "FITID", "Conciliado"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[10px] uppercase tracking-widest font-medium" style={{ color: "#4A7568" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lançamentosFiltrados.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid #0F2922" }} className="hover:bg-[#0F2922]/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-sm" style={{ color: "#80A795" }}>
                      {fmtDate(l.data_transacao)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-[10px] px-2 py-0.5 rounded font-bold"
                        style={{
                          backgroundColor: l.tipo === "C" ? "#4A9F7322" : "#E05C5C22",
                          color: l.tipo === "C" ? "#4A9F73" : "#E05C5C",
                        }}
                      >
                        {l.tipo === "C" ? "↑ Entrada" : "↓ Saída"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium whitespace-nowrap" style={{ color: l.tipo === "C" ? "#4A9F73" : "#E05C5C" }}>
                      {fmt(Number(l.valor))}
                    </td>
                    <td className="px-4 py-3 max-w-[200px] truncate text-sm" style={{ color: "#F3EADA" }}>
                      {l.descricao ?? l.memo ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px]" style={{ color: "#4A7568" }}>
                      {l.fitid ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {l.conciliado ? (
                        <CheckCircle size={14} style={{ color: "#4A9F73" }} className="mx-auto" />
                      ) : (
                        <RefreshCw size={12} style={{ color: "#4A7568" }} className="mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = "pagar" | "receber" | "conciliacao";

export default function FinanceiroClient({ pagar, receber, extratos, lancamentos }: Props) {
  const [tab, setTab] = useState<Tab>("pagar");

  const totalPagar = pagar.filter((p) => p.situacao === "pendente").reduce((s, p) => s + Number(p.valor), 0);
  const totalReceber = receber.filter((r) => r.situacao === "pendente").reduce((s, r) => s + Number(r.valor), 0);

  const tabs: { key: Tab; label: string; icon: any; badge?: string }[] = [
    { key: "pagar",       label: "Contas a Pagar",   icon: ArrowUpCircle,   badge: pagar.filter((p) => p.situacao === "pendente").length > 0 ? String(pagar.filter((p) => p.situacao === "pendente").length) : undefined },
    { key: "receber",     label: "Contas a Receber", icon: ArrowDownCircle, badge: receber.filter((r) => r.situacao === "pendente").length > 0 ? String(receber.filter((r) => r.situacao === "pendente").length) : undefined },
    { key: "conciliacao", label: "Conciliação OFX",  icon: RefreshCw },
  ];

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1
            className="text-xl font-semibold tracking-wide"
            style={{ fontFamily: "var(--font-playfair)", color: "#F3EADA" }}
          >
            Financeiro
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "#80A795" }}>
            Contas a Pagar / Receber · Conciliação Bancária
          </p>
        </div>
        {/* Saldo líquido */}
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest" style={{ color: "#4A7568" }}>Saldo Líquido Pendente</p>
          <p
            className="text-xl font-semibold tabular-nums"
            style={{ color: totalReceber - totalPagar >= 0 ? "#4A9F73" : "#E05C5C" }}
          >
            {fmt(totalReceber - totalPagar)}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 rounded-xl p-1"
        style={{ backgroundColor: "#0F2922", border: "1px solid #1C3D32" }}
      >
        {tabs.map(({ key, label, icon: Icon, badge }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-colors"
            style={{
              backgroundColor: tab === key ? "#1C3D32" : "transparent",
              color: tab === key ? "#F3EADA" : "#4A7568",
            }}
          >
            <Icon size={14} strokeWidth={1.75} />
            <span className="hidden sm:inline">{label}</span>
            {badge && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                style={{ backgroundColor: "#DB986422", color: "#DB9864" }}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "pagar" && <TabPagar pagar={pagar} />}
      {tab === "receber" && <TabReceber receber={receber} />}
      {tab === "conciliacao" && <TabConciliacao extratos={extratos} lancamentos={lancamentos} />}
    </div>
  );
}
