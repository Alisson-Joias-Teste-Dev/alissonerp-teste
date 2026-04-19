"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowLeft, RefreshCw, Plus, Loader2, ChevronLeft, ChevronRight,
  TrendingUp, TrendingDown, Trophy, Award, Gem,
} from "lucide-react";

const C = {
  esmeralda:   "#184036",
  esmeraldaLt: "#18403612",
  creme:       "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:     "#FAFAF7",
};

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const TIER_COLORS = {
  prata:    { bg: "#F3F4F6", border: "#9CA3AF", text: "#6B7280", icon: Award },
  ouro:     { bg: "#FEF9C3", border: "#D97706", text: "#92400E", icon: Trophy },
  diamante: { bg: "#DBEAFE", border: "#3B82F6", text: "#1E40AF", icon: Gem },
};

type Tier = "prata" | "ouro" | "diamante";

interface RankingRow {
  vendedor_id: number;
  vendedor_nome: string;
  qtd_vendas: number;
  total_venda: number;
  total_pago: number;
  total_comissao: number;
  total_venda_hoje: number;
  qtd_vendas_hoje: number;
  meta_prata: number | null;
  meta_ouro: number | null;
  meta_diamante: number | null;
  horario_inicio: string;
  horas_por_dia: number;
  dias_nao_trabalhados: number[];
}

interface Props { role: string; vendedorId: number | null; podeGerenciar: boolean; }

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function calcExpected(
  row: RankingRow, tier: Tier, mes: number, ano: number,
) {
  const metaValue = row[`meta_${tier}`];
  if (!metaValue || metaValue <= 0) return { hourly: 0, daily: 0, monthly: 0, diasTrabalhados: 0, diasUteisPassados: 0 };

  const daysInMonth = new Date(ano, mes, 0).getDate();
  const diasNao = new Set(row.dias_nao_trabalhados ?? []);
  const diasTrabalhados = daysInMonth - diasNao.size;
  if (diasTrabalhados <= 0) return { hourly: 0, daily: 0, monthly: 0, diasTrabalhados: 0, diasUteisPassados: 0 };

  const metaDiaria  = metaValue / diasTrabalhados;
  const metaHoraria = metaDiaria / (row.horas_por_dia || 8);

  const now = new Date();
  const [startH, startM] = (row.horario_inicio || "09:00").split(":").map(Number);
  const startMin = startH * 60 + (startM || 0);
  const nowMin   = now.getHours() * 60 + now.getMinutes();
  const elapsed  = Math.min(Math.max(0, nowMin - startMin), (row.horas_por_dia || 8) * 60);
  const horasPassadas = elapsed / 60;

  const today = now.getDate();
  let diasUteisPassados = 0;
  for (let d = 1; d <= today; d++) {
    if (!diasNao.has(d)) diasUteisPassados++;
  }

  return {
    hourly:  metaHoraria * horasPassadas,
    daily:   metaDiaria,
    monthly: metaDiaria * diasUteisPassados,
    diasTrabalhados,
    diasUteisPassados,
  };
}

function getTierAtual(row: RankingRow): Tier | null {
  if (row.meta_diamante && row.total_venda >= row.meta_diamante) return "diamante";
  if (row.meta_ouro && row.total_venda >= row.meta_ouro) return "ouro";
  if (row.meta_prata && row.total_venda >= row.meta_prata) return "prata";
  return null;
}

type SortField = "nome" | "alcancado" | "esperado" | "diferenca" | "pct" | "qtd" | "ticket";
type SortDir = "asc" | "desc";

export default function MetasClient({ role, vendedorId, podeGerenciar }: Props) {
  const now = new Date();
  const [mes,    setMes]    = useState(now.getMonth() + 1);
  const [ano,    setAno]    = useState(now.getFullYear());
  const [rows,   setRows]   = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,  setError]  = useState("");
  const [selectedTier, setSelectedTier] = useState<Tier>("prata");

  // Suppress unused variable warnings
  void role; void vendedorId;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/vendas/ranking?mes=${mes}&ano=${ano}`);
      if (!res.ok) throw new Error("Erro ao carregar dados");
      setRows(await res.json() as RankingRow[]);
    } catch (e) { setError(e instanceof Error ? e.message : "Erro"); }
    finally { setLoading(false); }
  }, [mes, ano]);

  useEffect(() => { load(); }, [load]);

  function prevMes() { if (mes === 1) { setMes(12); setAno(a => a - 1); } else setMes(m => m - 1); }
  function nextMes() {
    const isCurrentOrFuture = ano > now.getFullYear() || (ano === now.getFullYear() && mes >= now.getMonth() + 1);
    if (isCurrentOrFuture) return;
    if (mes === 12) { setMes(1); setAno(a => a + 1); } else setMes(m => m + 1);
  }
  const isCurrentMonth = ano === now.getFullYear() && mes === now.getMonth() + 1;

  const totais = useMemo(() => ({
    prata:    rows.reduce((s, r) => s + (r.meta_prata ?? 0), 0),
    ouro:     rows.reduce((s, r) => s + (r.meta_ouro ?? 0), 0),
    diamante: rows.reduce((s, r) => s + (r.meta_diamante ?? 0), 0),
  }), [rows]);

  const rowsComMeta = useMemo(() => rows.filter(r => r.meta_prata && r.meta_prata > 0), [rows]);

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/vendas" className="p-2 rounded-lg hover:bg-gray-100" style={{ color: "#6B7280" }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
              Análise de Performance
            </h2>
            <p className="text-xs" style={{ color: "#9CA3AF" }}>
              Acompanhe o desempenho de vendas em tempo real e compare com as metas estabelecidas.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-40" style={{ color: "#6B7280" }}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          </button>
          {podeGerenciar && (
            <Link href="/vendas/metas/registrar"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}>
              <Plus size={15} /> Nova Meta
            </Link>
          )}
        </div>
      </div>

      {/* Mês */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={prevMes} className="p-1 rounded hover:bg-gray-100"><ChevronLeft size={18} style={{ color: "#6B7280" }} /></button>
        <span className="text-sm font-semibold min-w-[140px] text-center" style={{ color: C.esmeralda }}>
          {MESES[mes - 1]} {ano} {isCurrentMonth && <span className="text-[10px] font-normal ml-1" style={{ color: "#9CA3AF" }}>(mês atual)</span>}
        </span>
        <button onClick={nextMes} disabled={isCurrentMonth} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
          <ChevronRight size={18} style={{ color: "#6B7280" }} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin" style={{ color: C.esmeralda }} /></div>
      ) : error ? (
        <p className="text-center text-sm text-red-600 py-8">{error}</p>
      ) : (
        <>
          {/* ── Visão Geral ── */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-5 rounded-full" style={{ backgroundColor: C.esmeralda }} />
              <h3 className="text-sm font-bold" style={{ color: "#374151" }}>Visão Geral das Metas</h3>
            </div>
            <p className="text-xs mb-3" style={{ color: "#9CA3AF" }}>Selecione uma meta para visualizar a performance detalhada.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["prata", "ouro", "diamante"] as Tier[]).map(tier => {
                const tc = TIER_COLORS[tier];
                const Icon = tc.icon;
                const sel = selectedTier === tier;
                return (
                  <button key={tier} onClick={() => setSelectedTier(tier)}
                    className="rounded-xl border p-4 text-left transition-all"
                    style={{
                      borderColor: sel ? tc.border : C.cremeBorder,
                      backgroundColor: sel ? tc.bg : "#fff",
                      boxShadow: sel ? `0 0 0 2px ${tc.border}40` : "none",
                    }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium" style={{ color: tc.text }}>Meta de faturamento {tier}</span>
                      <Icon size={18} style={{ color: tc.border }} />
                    </div>
                    <p className="text-xl font-bold tabular-nums" style={{ color: "#1A1A1A" }}>{fmt(totais[tier])}</p>
                    <p className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>Valor total acumulado no período</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Performance Horária ── */}
          <PerfTable
            titulo="Performance Horária (Hoje)"
            descricao={`Acompanhamento em tempo real do progresso de vendas comparado com a meta ${selectedTier} acumulada até o momento atual.`}
            rows={rowsComMeta} tier={selectedTier} mes={mes} ano={ano}
            getAlcancado={r => r.total_venda_hoje}
            getQtdVendas={r => r.qtd_vendas_hoje}
            getEsperado={r => calcExpected(r, selectedTier, mes, ano).hourly}
          />

          {/* ── Performance Diária ── */}
          <PerfTable
            titulo="Performance Diária (Hoje)"
            descricao={`Comparativo das vendas realizadas hoje contra a meta ${selectedTier} total estabelecida para o dia.`}
            rows={rowsComMeta} tier={selectedTier} mes={mes} ano={ano}
            getAlcancado={r => r.total_venda_hoje}
            getQtdVendas={r => r.qtd_vendas_hoje}
            getEsperado={r => calcExpected(r, selectedTier, mes, ano).daily}
          />

          {/* ── Performance Mensal Proporcional (até hoje) ── */}
          <PerfTable
            titulo="Performance Mensal Acumulada"
            descricao={`Análise do desempenho acumulado desde o início do mês até hoje, comparado com a meta ${selectedTier} proporcional ao período.`}
            rows={rowsComMeta} tier={selectedTier} mes={mes} ano={ano}
            getAlcancado={r => r.total_venda}
            getQtdVendas={r => r.qtd_vendas}
            getEsperado={r => calcExpected(r, selectedTier, mes, ano).monthly}
            sortDefault="alcancado"
          />

          {/* ── Meta Total do Mês ── */}
          <PerfTable
            titulo="Ranking de Performance"
            descricao={`Comparativo do alcançado vs meta ${selectedTier} total do mês.`}
            rows={rowsComMeta} tier={selectedTier} mes={mes} ano={ano}
            getAlcancado={r => r.total_venda}
            getQtdVendas={r => r.qtd_vendas}
            getEsperado={r => r[`meta_${selectedTier}`] ?? 0}
            sortDefault="alcancado"
          />
        </>
      )}
    </div>
  );
}

// ─── Tabela de performance reutilizável ──────────────────────────────────────
function PerfTable({
  titulo, descricao, rows, tier, mes, ano,
  getAlcancado, getQtdVendas, getEsperado, sortDefault = "alcancado",
  getProjecao,
}: {
  titulo: string; descricao: string;
  rows: RankingRow[]; tier: Tier; mes: number; ano: number;
  getAlcancado: (r: RankingRow) => number;
  getQtdVendas: (r: RankingRow) => number;
  getEsperado: (r: RankingRow) => number;
  sortDefault?: SortField;
  getProjecao?: (r: RankingRow) => number | null;
}) {
  const [sf, setSf] = useState<SortField>(sortDefault);
  const [sd, setSd] = useState<SortDir>("desc");
  const toggle = (f: SortField) => { if (sf === f) setSd(d => d === "asc" ? "desc" : "asc"); else { setSf(f); setSd("desc"); } };

  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  // Suppress unused vars
  void mes; void ano;

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      let va: number, vb: number;
      switch (sf) {
        case "nome": return sd === "asc" ? a.vendedor_nome.localeCompare(b.vendedor_nome) : b.vendedor_nome.localeCompare(a.vendedor_nome);
        case "alcancado": va = getAlcancado(a); vb = getAlcancado(b); break;
        case "esperado":  va = getEsperado(a);  vb = getEsperado(b);  break;
        case "diferenca": va = getAlcancado(a) - getEsperado(a); vb = getAlcancado(b) - getEsperado(b); break;
        case "pct": { const ea = getEsperado(a), eb = getEsperado(b); va = ea > 0 ? getAlcancado(a)/ea : 0; vb = eb > 0 ? getAlcancado(b)/eb : 0; break; }
        case "qtd": va = getQtdVendas(a); vb = getQtdVendas(b); break;
        case "ticket": { const qa = getQtdVendas(a), qb = getQtdVendas(b); va = qa > 0 ? getAlcancado(a)/qa : 0; vb = qb > 0 ? getAlcancado(b)/qb : 0; break; }
        default: va = 0; vb = 0;
      }
      return sd === "asc" ? va - vb : vb - va;
    });
  }, [rows, sf, sd, getAlcancado, getEsperado, getQtdVendas]);

  const SH = ({ f, l }: { f: SortField; l: string }) => (
    <th className="px-3 py-2.5 text-xs font-semibold cursor-pointer select-none whitespace-nowrap text-right first:text-left"
      style={{ color: "#6B7280" }} onClick={() => toggle(f)}>
      {l} <span className="opacity-40">↕</span>
    </th>
  );

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
      <div className="px-4 py-3 bg-white">
        <h3 className="text-sm font-bold" style={{ color: "#374151" }}>{titulo}</h3>
        <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>{descricao}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: C.cremeBg }}>
            <tr>
              <SH f="nome" l="Consultora" />
              <SH f="alcancado" l="Alcançado" />
              <SH f="esperado" l={`Esperado (${tierLabel})`} />
              <SH f="diferenca" l="Diferença" />
              <SH f="pct" l="% da Meta" />
              {getProjecao && <th className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-right" style={{ color: "#6B7280" }}>Projeção</th>}
              <SH f="qtd" l="Qtd. Vendas" />
              <SH f="ticket" l="Ticket Médio" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr><td colSpan={getProjecao ? 8 : 7} className="px-4 py-8 text-center" style={{ color: "#9CA3AF" }}>Nenhuma meta cadastrada</td></tr>
            ) : sorted.map(row => {
              const alc = getAlcancado(row);
              const esp = getEsperado(row);
              const dif = alc - esp;
              const proj = getProjecao ? getProjecao(row) : null;
              const pct = esp > 0 ? (alc / esp) * 100 : 0;
              const qtd = getQtdVendas(row);
              const tkt = qtd > 0 ? alc / qtd : 0;
              const ta  = getTierAtual(row);
              return (
                <tr key={row.vendedor_id} className="border-t" style={{ borderColor: C.cremeBorder }}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: C.esmeraldaLt, color: C.esmeralda }}>
                        {row.vendedor_nome.split(" ").map(n => n[0]).slice(0, 2).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{row.vendedor_nome}</p>
                        {ta && <p className="text-[10px]" style={{ color: TIER_COLORS[ta].text }}>Meta atual: {ta.charAt(0).toUpperCase() + ta.slice(1)}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium" style={{ color: C.esmeralda }}>{fmt(alc)}</td>
                  <td className="px-3 py-3 text-right tabular-nums" style={{ color: "#374151" }}>{fmt(esp)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    <span className="inline-flex items-center gap-0.5" style={{ color: dif >= 0 ? "#059669" : "#EF4444" }}>
                      {dif >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {dif >= 0 ? "" : "-"}{fmt(Math.abs(dif))}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-semibold"
                    style={{ color: pct >= 100 ? "#059669" : pct >= 70 ? C.esmeralda : pct >= 40 ? "#D97706" : "#EF4444" }}>
                    {pct.toFixed(1)}%
                  </td>
                  {getProjecao && (
                    <td className="px-3 py-3 text-right tabular-nums text-xs">
                      {proj != null ? (
                        <div>
                          <span className="font-medium" style={{ color: proj >= esp ? "#059669" : "#EF4444" }}>
                            {fmt(proj)}
                          </span>
                          <p className="text-[10px] mt-0.5" style={{ color: proj >= esp ? "#059669" : "#EF4444" }}>
                            {proj >= esp ? "✓ Vai bater" : "✗ Não bate"}
                          </p>
                        </div>
                      ) : <span style={{ color: "#9CA3AF" }}>—</span>}
                    </td>
                  )}
                  <td className="px-3 py-3 text-center tabular-nums" style={{ color: "#374151" }}>{qtd}</td>
                  <td className="px-3 py-3 text-right tabular-nums" style={{ color: "#374151" }}>{fmt(tkt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
