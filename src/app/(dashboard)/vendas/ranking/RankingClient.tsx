"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Trophy, Target, TrendingUp, RefreshCw, ChevronLeft, ChevronRight, Edit2, Check, X } from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

interface RankingRow {
  vendedor_id:     number;
  vendedor_nome:   string;
  qtd_vendas:      number;
  total_venda:     number;
  total_meta:      number;
  total_pago:      number;
  total_comissao:  number;
  meta_valor:      number | null;
  meta_quantidade: number | null;
  pct_meta:        number | null;
}

interface Props {
  role:               string;
  vendedorId:         number | null;
  podeGerenciarMetas: boolean;
}

// ─── Barra de progresso ───────────────────────────────────────────────────────
function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, pct);
  const color = pct >= 100 ? "#059669" : pct >= 70 ? C.esmeralda : pct >= 40 ? "#D97706" : "#EF4444";
  return (
    <div className="w-full rounded-full h-2" style={{ backgroundColor: "#F3F4F6" }}>
      <div
        className="h-2 rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ─── Pódio (top 3) ────────────────────────────────────────────────────────────
function Podium({ top3 }: { top3: RankingRow[] }) {
  const order = [1, 0, 2]; // 2°, 1°, 3° — visual podium
  const heights = ["h-16", "h-24", "h-10"];
  const medals = ["🥈", "🥇", "🥉"];
  const bgColors = ["#E5E7EB", C.esmeralda, "#D97706"];
  const textColors = ["#374151", C.creme, "#fff"];

  return (
    <div className="flex items-end justify-center gap-2 mb-6 pt-2">
      {order.map((idx, pos) => {
        const row = top3[idx];
        if (!row) return <div key={pos} className="w-24" />;
        return (
          <div key={row.vendedor_id} className="flex flex-col items-center gap-1 w-24">
            <span className="text-lg">{medals[pos]}</span>
            <p className="text-xs font-semibold text-center leading-tight" style={{ color: "#1A1A1A" }}>
              {row.vendedor_nome.split(" ")[0]}
            </p>
            <p className="text-xs tabular-nums font-bold" style={{ color: C.esmeralda }}>
              {fmt(row.total_meta)}
            </p>
            <div
              className={`w-full ${heights[pos]} rounded-t-lg flex items-center justify-center`}
              style={{ backgroundColor: bgColors[pos] }}
            >
              <span className="text-xs font-bold" style={{ color: textColors[pos] }}>
                {idx + 1}°
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RankingClient({ vendedorId, podeGerenciarMetas }: Props) {
  const now = new Date();
  const [mes,     setMes]     = useState(now.getMonth() + 1);
  const [ano,     setAno]     = useState(now.getFullYear());
  const [rows,    setRows]    = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  // Meta edit state
  const [editingId,  setEditingId]  = useState<number | null>(null);
  const [editValor,  setEditValor]  = useState("");
  const [savingMeta, setSavingMeta] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/vendas/ranking?mes=${mes}&ano=${ano}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(await res.json() as RankingRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar");
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  function prevMes() {
    if (mes === 1) { setMes(12); setAno(a => a - 1); }
    else setMes(m => m - 1);
  }
  function nextMes() {
    const isCurrentOrFuture = ano > now.getFullYear() || (ano === now.getFullYear() && mes >= now.getMonth() + 1);
    if (isCurrentOrFuture) return;
    if (mes === 12) { setMes(1); setAno(a => a + 1); }
    else setMes(m => m + 1);
  }

  async function saveMeta(vendedorIdTarget: number) {
    const valor = parseFloat(editValor.replace(",", "."));
    if (!valor || valor <= 0) return;
    setSavingMeta(true);
    try {
      const res = await fetch("/api/vendas/metas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendedor_id: vendedorIdTarget, mes, ano, meta_valor: valor }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? `HTTP ${res.status}`);
      }
      setEditingId(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao salvar meta");
    } finally {
      setSavingMeta(false);
    }
  }

  // Totais do período — usa total_meta (líquido de vale-troca)
  const totalPeriodo  = rows.reduce((s, r) => s + r.total_meta, 0);
  const totalRecebido = rows.reduce((s, r) => s + r.total_pago,  0);
  const totalVendas   = rows.reduce((s, r) => s + r.qtd_vendas,  0);
  const top3          = rows.slice(0, 3);
  const isCurrentMonth = mes === now.getMonth() + 1 && ano === now.getFullYear();

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/vendas"
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          style={{ color: "#6B7280" }}
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h2
            className="text-xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
          >
            Ranking & Metas
          </h2>
          <p className="text-xs" style={{ color: "#9CA3AF" }}>Performance das vendedoras</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="ml-auto p-2 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40"
          style={{ color: "#6B7280" }}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Seletor de mês */}
      <div
        className="flex items-center justify-between rounded-xl border mb-4 px-4 py-2.5"
        style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
      >
        <button onClick={prevMes} className="p-1 rounded hover:bg-gray-200 transition-colors">
          <ChevronLeft size={16} style={{ color: "#6B7280" }} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>
            {MESES[mes - 1]} {ano}
          </p>
          {isCurrentMonth && (
            <p className="text-[11px]" style={{ color: "#9CA3AF" }}>mês atual</p>
          )}
        </div>
        <button
          onClick={nextMes}
          disabled={isCurrentMonth}
          className="p-1 rounded hover:bg-gray-200 transition-colors disabled:opacity-30"
        >
          <ChevronRight size={16} style={{ color: "#6B7280" }} />
        </button>
      </div>

      {/* Stats do período */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { icon: TrendingUp, label: "Faturado",  value: fmt(totalPeriodo) },
          { icon: Target,     label: "Recebido",  value: fmt(totalRecebido) },
          { icon: Trophy,     label: "Vendas",    value: String(totalVendas) },
        ].map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="rounded-xl border p-3 text-center"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
          >
            <Icon size={14} style={{ color: C.esmeralda }} className="mx-auto mb-1" />
            <p className="text-[11px] uppercase tracking-wide" style={{ color: "#9CA3AF" }}>{label}</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: C.esmeralda }}>{value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} />
        </div>
      ) : error ? (
        <p className="text-center text-sm text-red-600 py-8">{error}</p>
      ) : rows.length === 0 ? (
        <div
          className="rounded-xl border p-8 text-center"
          style={{ borderColor: C.cremeBorder }}
        >
          <Trophy size={32} style={{ color: "#D1D5DB" }} className="mx-auto mb-2" />
          <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhuma venda no período</p>
        </div>
      ) : (
        <>
          {/* Pódio top 3 */}
          {top3.length >= 2 && <Podium top3={top3} />}

          {/* Lista completa */}
          <div className="space-y-3">
            {rows.map((row, idx) => {
              const isEditing = editingId === row.vendedor_id;
              const isMe      = row.vendedor_id === vendedorId;

              return (
                <div
                  key={row.vendedor_id}
                  className="rounded-xl border p-4"
                  style={{
                    borderColor: isMe ? C.esmeralda : C.cremeBorder,
                    backgroundColor: isMe ? C.esmeraldaLt : "#fff",
                  }}
                >
                  {/* Linha superior */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{
                          backgroundColor: idx === 0 ? C.esmeralda : idx === 1 ? "#9CA3AF" : idx === 2 ? "#D97706" : C.cremeBg,
                          color: idx < 3 ? "#fff" : "#6B7280",
                        }}
                      >
                        {idx + 1}
                      </span>
                      <p className="text-sm font-semibold truncate" style={{ color: "#1A1A1A" }}>
                        {row.vendedor_nome}
                        {isMe && <span className="ml-1 text-[11px] font-normal" style={{ color: C.esmeralda }}>você</span>}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold tabular-nums" style={{ color: C.esmeralda }}>
                        {fmt(row.total_meta)}
                      </p>
                      <p className="text-[11px]" style={{ color: "#9CA3AF" }}>
                        {row.qtd_vendas} venda{row.qtd_vendas !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  {/* Meta */}
                  {isEditing ? (
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        autoFocus
                        value={editValor}
                        onChange={e => setEditValor(e.target.value)}
                        placeholder="0,00"
                        className="flex-1 border rounded-lg px-2 py-1 text-sm outline-none"
                        style={{ borderColor: C.cremeBorder }}
                        onKeyDown={e => {
                          if (e.key === "Enter") saveMeta(row.vendedor_id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button
                        onClick={() => saveMeta(row.vendedor_id)}
                        disabled={savingMeta}
                        className="p-1.5 rounded-lg disabled:opacity-50"
                        style={{ backgroundColor: C.esmeralda, color: C.creme }}
                      >
                        {savingMeta ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-400"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ) : row.meta_valor != null ? (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span style={{ color: "#6B7280" }}>
                          Meta: {fmt(row.meta_valor)}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className="font-semibold"
                            style={{ color: (row.pct_meta ?? 0) >= 100 ? "#059669" : C.esmeralda }}
                          >
                            {(row.pct_meta ?? 0).toFixed(0)}%
                          </span>
                          {podeGerenciarMetas && (
                            <button
                              onClick={() => { setEditingId(row.vendedor_id); setEditValor(String(row.meta_valor)); }}
                              className="text-gray-300 hover:text-gray-500 transition-colors"
                            >
                              <Edit2 size={11} />
                            </button>
                          )}
                        </div>
                      </div>
                      <ProgressBar pct={row.pct_meta ?? 0} />
                    </div>
                  ) : podeGerenciarMetas ? (
                    <button
                      onClick={() => { setEditingId(row.vendedor_id); setEditValor(""); }}
                      className="mt-2 text-[11px] flex items-center gap-1 hover:opacity-80 transition-opacity"
                      style={{ color: "#9CA3AF" }}
                    >
                      <Target size={11} /> Definir meta
                    </button>
                  ) : null}

                  {/* Comissão (só para full access) */}
                  {podeGerenciarMetas && row.total_comissao > 0 && (
                    <p className="mt-1 text-[11px]" style={{ color: "#9CA3AF" }}>
                      Comissão: {fmt(row.total_comissao)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
