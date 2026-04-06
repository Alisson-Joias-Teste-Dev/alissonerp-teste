"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw, Target, ChevronLeft, ChevronRight, Plus, Edit2, Check, X } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

interface MetaRow {
  vendedor_id: number;
  vendedor_nome: string;
  qtd_vendas: number;
  total_venda: number;
  total_pago: number;
  total_comissao: number;
  meta_valor: number | null;
  meta_quantidade: number | null;
  pct_meta: number | null;
}

interface Props { role: string; vendedorId: number | null; podeGerenciar: boolean; }

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, pct);
  const color = pct >= 100 ? "#059669" : pct >= 70 ? C.esmeralda : pct >= 40 ? "#D97706" : "#EF4444";
  return (
    <div className="w-full rounded-full h-2" style={{ backgroundColor: "#F3F4F6" }}>
      <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${clamped}%`, backgroundColor: color }} />
    </div>
  );
}

export default function MetasClient({ vendedorId, podeGerenciar }: Props) {
  const now = new Date();
  const [mes,     setMes]     = useState(now.getMonth() + 1);
  const [ano,     setAno]     = useState(now.getFullYear());
  const [rows,    setRows]    = useState<MetaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  const [editingId,  setEditingId]  = useState<number | null>(null);
  const [editValor,  setEditValor]  = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/vendas/ranking?mes=${mes}&ano=${ano}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(await res.json() as MetaRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally { setLoading(false); }
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  function prevMes() { if (mes === 1) { setMes(12); setAno(a => a - 1); } else setMes(m => m - 1); }
  function nextMes() {
    const isCurrentOrFuture = ano > now.getFullYear() || (ano === now.getFullYear() && mes >= now.getMonth() + 1);
    if (isCurrentOrFuture) return;
    if (mes === 12) { setMes(1); setAno(a => a + 1); } else setMes(m => m + 1);
  }

  async function saveMeta(targetVendedorId: number) {
    const valor = parseFloat(editValor.replace(",", "."));
    if (!valor || valor <= 0) return;
    setSavingMeta(true);
    try {
      const res = await fetch("/api/vendas/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendedor_id: targetVendedorId, mes, ano, meta_valor: valor }),
      });
      if (!res.ok) { const d = await res.json() as { error?: string }; throw new Error(d.error ?? `HTTP ${res.status}`); }
      setEditingId(null);
      await load();
    } catch (e) { alert(e instanceof Error ? e.message : "Erro ao salvar meta"); }
    finally { setSavingMeta(false); }
  }

  const totalMeta     = rows.reduce((s, r) => s + (r.meta_valor ?? 0), 0);
  const totalRealizado = rows.reduce((s, r) => s + r.total_venda, 0);
  const pctGeral      = totalMeta > 0 ? Math.round((totalRealizado / totalMeta) * 100) : null;
  const isCurrentMonth = mes === now.getMonth() + 1 && ano === now.getFullYear();

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Metas
          </h2>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Metas mensais das consultoras</p>
        </div>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40" style={{ color: "#6B7280" }}>
          <RefreshCw size={16} />
        </button>
        {podeGerenciar && (
          <Link href="/vendas/metas/registrar"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}>
            <Plus size={13} /> Nova Meta
          </Link>
        )}
      </div>

      {/* Seletor de mês */}
      <div className="flex items-center justify-between rounded-xl border mb-5 px-4 py-2.5"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
        <button onClick={prevMes} className="p-1 rounded hover:bg-gray-200 transition-colors">
          <ChevronLeft size={16} style={{ color: "#6B7280" }} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>{MESES[mes - 1]} {ano}</p>
          {isCurrentMonth && <p className="text-[11px]" style={{ color: "#9CA3AF" }}>mês atual</p>}
        </div>
        <button onClick={nextMes} disabled={isCurrentMonth} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30">
          <ChevronRight size={16} style={{ color: "#6B7280" }} />
        </button>
      </div>

      {/* Resumo geral */}
      {(totalMeta > 0 || totalRealizado > 0) && (
        <div className="rounded-xl border p-4 mb-5" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target size={14} style={{ color: C.esmeralda }} />
              <p className="text-xs font-semibold" style={{ color: C.esmeralda }}>Progresso Geral</p>
            </div>
            {pctGeral !== null && (
              <span className="text-sm font-bold tabular-nums" style={{ color: pctGeral >= 100 ? "#059669" : C.esmeralda }}>
                {pctGeral}%
              </span>
            )}
          </div>
          <ProgressBar pct={pctGeral ?? 0} />
          <div className="flex justify-between mt-2 text-[11px]" style={{ color: "#9CA3AF" }}>
            <span>Realizado: {fmt(totalRealizado)}</span>
            <span>Meta total: {fmt(totalMeta)}</span>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} />
        </div>
      ) : error ? (
        <p className="text-center text-sm text-red-600 py-8">{error}</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const isEditing = editingId === row.vendedor_id;
            const isMe = row.vendedor_id === vendedorId;
            return (
              <div key={row.vendedor_id} className="rounded-xl border p-4"
                style={{ borderColor: isMe ? C.esmeralda : C.cremeBorder, backgroundColor: isMe ? C.esmeraldaLt : "#fff" }}>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "#1A1A1A" }}>
                      {row.vendedor_nome}
                      {isMe && <span className="ml-1 text-[11px] font-normal" style={{ color: C.esmeralda }}>(você)</span>}
                    </p>
                    <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                      {row.qtd_vendas} venda{row.qtd_vendas !== 1 ? "s" : ""} · {fmt(row.total_venda)} faturado
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {row.meta_valor != null ? (
                      <p className="text-xs" style={{ color: "#6B7280" }}>Meta: {fmt(row.meta_valor)}</p>
                    ) : (
                      <p className="text-xs" style={{ color: "#9CA3AF" }}>Sem meta</p>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input type="text" autoFocus value={editValor} onChange={e => setEditValor(e.target.value)}
                      placeholder="Ex: 25000" className="flex-1 border rounded-lg px-2 py-1.5 text-sm outline-none"
                      style={{ borderColor: C.cremeBorder }}
                      onKeyDown={e => { if (e.key === "Enter") saveMeta(row.vendedor_id); if (e.key === "Escape") setEditingId(null); }} />
                    <button onClick={() => saveMeta(row.vendedor_id)} disabled={savingMeta}
                      className="p-1.5 rounded-lg disabled:opacity-50" style={{ backgroundColor: C.esmeralda, color: C.creme }}>
                      {savingMeta ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400">
                      <X size={13} />
                    </button>
                  </div>
                ) : row.meta_valor != null ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span style={{ color: "#6B7280" }}>{Math.round(Math.min(100, row.pct_meta ?? 0))}% da meta</span>
                      {podeGerenciar && (
                        <button onClick={() => { setEditingId(row.vendedor_id); setEditValor(String(row.meta_valor)); }}
                          className="text-gray-300 hover:text-gray-500">
                          <Edit2 size={11} />
                        </button>
                      )}
                    </div>
                    <ProgressBar pct={row.pct_meta ?? 0} />
                  </div>
                ) : podeGerenciar ? (
                  <button onClick={() => { setEditingId(row.vendedor_id); setEditValor(""); }}
                    className="flex items-center gap-1 text-xs hover:opacity-80" style={{ color: "#9CA3AF" }}>
                    <Target size={11} /> Definir meta
                  </button>
                ) : (
                  <p className="text-xs" style={{ color: "#9CA3AF" }}>Meta não definida</p>
                )}
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="rounded-xl border p-8 text-center" style={{ borderColor: C.cremeBorder }}>
              <Target size={32} style={{ color: "#D1D5DB" }} className="mx-auto mb-2" />
              <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhuma vendedora encontrada</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
