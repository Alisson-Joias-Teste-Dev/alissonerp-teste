"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Wrench,
  Clock,
  XCircle,
  Scale,
  Layers,
  TrendingDown,
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { formatPeso } from "@/lib/formatters";

// ─── Paleta (igual ao DashboardClient) ────────────────────────────────────────
const P = {
  esmeralda:     "#184036",
  esmeraldaMid:  "#1C3D32",
  esmeraldaLight:"#0F2922",
  sage:          "#80A795",
  dourado:       "#DB9864",
  creme:         "#F3EADA",
  cremeMuted:    "#4A7568",
  verde:         "#4A9F73",
  vermelho:      "#E05C5C",
  laranja:       "#DB9864",
};

// ─── Types ───────────────────────────────────────────────────────────────────
interface Ordens {
  concluidas: number;
  em_producao: number;
  aguardando: number;
  canceladas: number;
}

interface SaldoPoteRow {
  insumo_id: number;
  insumo_nome: string;
  saldo_g: number;
}

interface OuroProducaoRow {
  deposito_id: number;
  deposito_nome: string;
  setor_nome: string | null;
  ouro_g: number;
}

interface QuebraOperadorRow {
  deposito_id: number;
  deposito_nome: string;
  setor_nome: string | null;
  registros: number;
  recebido: number;
  entregue: number;
  quebra: number;
  percentual: number;
}

interface Financeiro {
  saldo_anterior: number;
  entradas: number;
  saidas: number;
  saldo_atual: number;
}

interface DashboardData {
  periodo: { inicio: string; fim: string };
  ordens: Ordens;
  saldo_pote: SaldoPoteRow[];
  ouro_producao: OuroProducaoRow[];
  quebra_operadores: QuebraOperadorRow[];
  financeiro: Financeiro;
}

interface MovRow {
  id: number;
  data_hora: string;
  entrada: number | null;
  saida: number | null;
  marcador: string | null;
  obs: string | null;
  insumo_nome: string;
  deposito_nome: string;
}

interface MovData {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  rows: MovRow[];
}

// ─── Period helpers ───────────────────────────────────────────────────────────
function toYMD(d: Date) {
  return d.toISOString().split("T")[0];
}

function hoje() { return toYMD(new Date()); }

function menosNDias(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toYMD(d);
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const c = color ?? P.dourado;
  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.esmeraldaMid}` }}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: c + "22" }}
        >
          <Icon size={15} strokeWidth={1.75} style={{ color: c }} />
        </div>
        <span className="text-[10px] uppercase tracking-widest" style={{ color: P.cremeMuted }}>
          {label}
        </span>
      </div>
      <p className="text-2xl font-semibold font-mono tabular-nums" style={{ color: c }}>
        {value}
      </p>
      {sub && (
        <p className="text-[10px] mt-1" style={{ color: P.cremeMuted }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Section heading ──────────────────────────────────────────────────────────
function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase tracking-widest mb-3"
      style={{ color: P.cremeMuted }}
    >
      {children}
    </p>
  );
}

// ─── Panel wrapper ────────────────────────────────────────────────────────────
function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-5 ${className ?? ""}`}
      style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.esmeraldaMid}` }}
    >
      {children}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function DashboardFabricaPage() {
  // ── Period state ──
  const [preset, setPreset] = useState<"today" | "7d" | "30d" | "custom">("30d");
  const [inicio, setInicio] = useState(menosNDias(30));
  const [fim, setFim]       = useState(hoje());

  // ── Data state ──
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // ── Movimentações state ──
  const [movData,    setMovData]    = useState<MovData | null>(null);
  const [movLoading, setMovLoading] = useState(true);
  const [movPage,    setMovPage]    = useState(1);

  // ── Fetch main dashboard ──
  const fetchDashboard = useCallback(async (ini: string, fi: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/fabrica?inicio=${ini}&fim=${fi}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      console.log("DASHBOARD RESPONSE:", json);
      console.log("ORDENS:", json.ordens);
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch movimentacoes ──
  const fetchMovimentacoes = useCallback(async (ini: string, fi: string, page: number) => {
    setMovLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/fabrica/movimentacoes?inicio=${ini}&fim=${fi}&page=${page}&pageSize=15`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setMovData(json);
    } catch {
      setMovData(null);
    } finally {
      setMovLoading(false);
    }
  }, []);

  // ── Apply preset ──
  function applyPreset(p: typeof preset) {
    setPreset(p);
    let ini = inicio;
    let fi  = fim;
    if (p === "today")  { ini = hoje();          fi = hoje(); }
    if (p === "7d")     { ini = menosNDias(7);   fi = hoje(); }
    if (p === "30d")    { ini = menosNDias(30);  fi = hoje(); }
    setInicio(ini);
    setFim(fi);
    setMovPage(1);
    fetchDashboard(ini, fi);
    fetchMovimentacoes(ini, fi, 1);
  }

  function applyCustom() {
    setPreset("custom");
    setMovPage(1);
    fetchDashboard(inicio, fim);
    fetchMovimentacoes(inicio, fim, 1);
  }

  // ── Initial load ──
  useEffect(() => {
    fetchDashboard(inicio, fim);
    fetchMovimentacoes(inicio, fim, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mov page change ──
  useEffect(() => {
    if (movPage > 1 || movData !== null) {
      fetchMovimentacoes(inicio, fim, movPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movPage]);

  // ── Computed ──
  const ordens: Ordens = data?.ordens ?? { concluidas: 0, em_producao: 0, aguardando: 0, canceladas: 0 };
  const financeiro: Financeiro = data?.financeiro ?? { saldo_anterior: 0, entradas: 0, saidas: 0, saldo_atual: 0 };
  const saldoPote = data?.saldo_pote ?? [];
  const ouroProducao = data?.ouro_producao ?? [];
  const quebraOps = data?.quebra_operadores ?? [];
  const totalSaldoPote = saldoPote.reduce((s, r) => s + Number(r.saldo_g), 0);
  const totalOuroProducao = ouroProducao.reduce((s, r) => s + Number(r.ouro_g), 0);

  const PRESETS: { key: typeof preset; label: string }[] = [
    { key: "today", label: "Hoje" },
    { key: "7d",    label: "7 dias" },
    { key: "30d",   label: "30 dias" },
    { key: "custom",label: "Personalizado" },
  ];

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-xl font-semibold tracking-wide"
            style={{ fontFamily: "var(--font-playfair)", color: P.creme }}
          >
            Dashboard Fábrica
          </h1>
          <p className="text-xs mt-0.5" style={{ color: P.sage }}>
            Produção · Ouro · Quebra — tempo real
          </p>
        </div>

        {/* Período */}
        <div className="flex items-center gap-2 flex-wrap">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => key !== "custom" ? applyPreset(key) : setPreset("custom")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: preset === key ? P.dourado + "33" : "transparent",
                border: `1px solid ${preset === key ? P.dourado : P.esmeraldaMid}`,
                color: preset === key ? P.dourado : P.cremeMuted,
              }}
            >
              {label}
            </button>
          ))}

          {/* Custom date range */}
          {preset === "custom" && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={inicio}
                onChange={e => setInicio(e.target.value)}
                className="rounded-lg px-2 py-1 text-xs"
                style={{
                  backgroundColor: P.esmeraldaLight,
                  border: `1px solid ${P.esmeraldaMid}`,
                  color: P.creme,
                }}
              />
              <span className="text-xs" style={{ color: P.cremeMuted }}>até</span>
              <input
                type="date"
                value={fim}
                onChange={e => setFim(e.target.value)}
                className="rounded-lg px-2 py-1 text-xs"
                style={{
                  backgroundColor: P.esmeraldaLight,
                  border: `1px solid ${P.esmeraldaMid}`,
                  color: P.creme,
                }}
              />
              <button
                onClick={applyCustom}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{ backgroundColor: P.dourado + "33", border: `1px solid ${P.dourado}`, color: P.dourado }}
              >
                Aplicar
              </button>
            </div>
          )}

          <button
            onClick={() => {
              fetchDashboard(inicio, fim);
              fetchMovimentacoes(inicio, fim, movPage);
            }}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ border: `1px solid ${P.esmeraldaMid}`, color: P.cremeMuted }}
            title="Atualizar"
          >
            <RefreshCw size={13} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: "#3B1515", border: "1px solid #E05C5C", color: P.vermelho }}>
          {error}
        </div>
      )}

      {/* ── Financeiro Ouro ──────────────────────────────────────────────────── */}
      <div>
        <SectionHeading>Ouro — Financeiro do Período (Almoxarifado)</SectionHeading>

        {/* 5 cards na mesma linha: 4 de período + Saldo Atual (tempo real) no canto direito */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { icon: Wallet,         label: "Saldo Anterior",  value: `${formatPeso(financeiro.saldo_anterior)}g`,                                               color: P.sage     },
            { icon: ArrowDownCircle,label: "Entradas",         value: `${formatPeso(financeiro.entradas)}g`,                                                     color: P.verde    },
            { icon: ArrowUpCircle,  label: "Saídas",           value: `${formatPeso(financeiro.saidas)}g`,                                                       color: P.vermelho },
            { icon: TrendingUp,     label: "Saldo do Período", value: `${formatPeso(financeiro.saldo_anterior + financeiro.entradas - financeiro.saidas)}g`,     color: P.sage     },
          ].map(({ icon: Icon, label, value, color }) => (
            <div
              key={label}
              className="rounded-xl px-4 py-3 flex items-center gap-3"
              style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.esmeraldaMid}` }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: color + "22" }}
              >
                <Icon size={16} strokeWidth={1.75} style={{ color }} />
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-widest" style={{ color: P.cremeMuted }}>
                  {label}
                </p>
                <p className="text-sm font-semibold font-mono tabular-nums" style={{ color }}>
                  {loading ? "—" : value}
                </p>
              </div>
            </div>
          ))}

          {/* Saldo Atual — tempo real, canto direito, mesmo tamanho */}
          <div
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{ backgroundColor: P.esmeraldaLight, border: `1px solid ${P.dourado}55` }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: P.dourado + "22" }}
            >
              <TrendingUp size={16} strokeWidth={1.75} style={{ color: P.dourado }} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[9px] uppercase tracking-widest" style={{ color: P.cremeMuted }}>
                  Saldo Atual
                </p>
                <span
                  className="text-[8px] font-medium px-1 py-px rounded"
                  style={{ backgroundColor: P.dourado + "22", color: P.dourado + "bb" }}
                >
                  ⚡ tempo real
                </span>
              </div>
              <p className="text-sm font-semibold font-mono tabular-nums" style={{ color: P.dourado }}>
                {loading ? "—" : `${formatPeso(financeiro.saldo_atual)}g`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── KPI Cards produção ────────────────────────────────────────────── */}
      <div>
        <SectionHeading>Ordens de Produção</SectionHeading>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={CheckCircle2}
            label="Concluídas"
            value={loading ? "—" : ordens.concluidas}
            sub="no período"
            color={P.verde}
          />
          <KpiCard
            icon={Wrench}
            label="Em Produção"
            value={loading ? "—" : ordens.em_producao}
            sub="em andamento + aguardando"
            color={P.dourado}
          />
          <KpiCard
            icon={Clock}
            label="Aguardando"
            value={loading ? "—" : ordens.aguardando}
            sub="novas ordens + pendência"
            color={P.sage}
          />
          <KpiCard
            icon={XCircle}
            label="Canceladas"
            value={loading ? "—" : ordens.canceladas}
            sub="no período"
            color={P.vermelho}
          />
        </div>
      </div>

      {/* ── Ouro: Saldo Pote + Em Produção ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Saldo do Pote — tempo real */}
        <Panel>
          <SectionHeading>Saldo Total no Pote (Almoxarifado · Tempo Real)</SectionHeading>
          {loading ? (
            <p className="text-sm py-6 text-center" style={{ color: P.cremeMuted }}>Carregando...</p>
          ) : saldoPote.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: P.cremeMuted }}>Sem saldo no pote</p>
          ) : (
            <>
              <div
                className="flex items-center justify-between rounded-lg px-4 py-3 mb-3"
                style={{ backgroundColor: P.esmeralda + "88", border: `1px solid ${P.dourado}33` }}
              >
                <div className="flex items-center gap-2">
                  <Scale size={16} strokeWidth={1.75} style={{ color: P.dourado }} />
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: P.dourado }}>
                    Total Ouro
                  </span>
                </div>
                <span className="text-xl font-semibold font-mono tabular-nums" style={{ color: P.dourado }}>
                  {formatPeso(totalSaldoPote)}g
                </span>
              </div>
              <div className="space-y-2">
                {saldoPote.map((row) => (
                  <div
                    key={row.insumo_id}
                    className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ backgroundColor: "#0c1f1a" }}
                  >
                    <span className="text-xs" style={{ color: P.sage }}>{row.insumo_nome}</span>
                    <span className="text-sm font-semibold font-mono tabular-nums" style={{ color: P.creme }}>
                      {formatPeso(row.saldo_g)}g
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* Ouro em Produção por Operador — tempo real */}
        <Panel>
          <SectionHeading>Ouro em Produção por Operador (Tempo Real)</SectionHeading>
          {loading ? (
            <p className="text-sm py-6 text-center" style={{ color: P.cremeMuted }}>Carregando...</p>
          ) : ouroProducao.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: P.cremeMuted }}>Nenhum ouro em produção</p>
          ) : (
            <>
              <div
                className="flex items-center justify-between rounded-lg px-4 py-3 mb-3"
                style={{ backgroundColor: P.esmeralda + "88", border: `1px solid ${P.verde}33` }}
              >
                <div className="flex items-center gap-2">
                  <Layers size={16} strokeWidth={1.75} style={{ color: P.verde }} />
                  <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: P.verde }}>
                    Total em Produção
                  </span>
                </div>
                <span className="text-xl font-semibold font-mono tabular-nums" style={{ color: P.verde }}>
                  {formatPeso(totalOuroProducao)}g
                </span>
              </div>
              <div className="space-y-2">
                {ouroProducao.map((row) => (
                  <div
                    key={`${row.deposito_id}-${row.setor_nome ?? "geral"}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ backgroundColor: "#0c1f1a" }}
                  >
                    <div>
                      <span className="text-xs font-medium" style={{ color: P.sage }}>
                        {row.deposito_nome}
                      </span>
                      {row.setor_nome && (
                        <span className="text-[10px] ml-1.5" style={{ color: P.cremeMuted }}>
                          · {row.setor_nome}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold font-mono tabular-nums" style={{ color: P.creme }}>
                      {formatPeso(row.ouro_g)}g
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      {/* ── Quebra por Operador ───────────────────────────────────────────────── */}
      <Panel>
        <SectionHeading>Quebra por Operador — no Período</SectionHeading>
        {loading ? (
          <p className="text-sm py-6 text-center" style={{ color: P.cremeMuted }}>Carregando...</p>
        ) : quebraOps.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: P.cremeMuted }}>
            Sem registros de quebra no período
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid ${P.esmeraldaMid}` }}>
                  {["Operador", "Setor", "Registros", "Recebido (g)", "Entregue (g)", "Quebra (g)", "Quebra %"].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                      style={{ color: P.cremeMuted }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quebraOps.map((row, i) => {
                  const isAlerta = row.percentual > 5;
                  return (
                    <tr
                      key={`${row.deposito_id}-${i}`}
                      className="transition-colors"
                      style={{
                        backgroundColor: isAlerta ? "#3B1515" : (i % 2 === 0 ? "transparent" : "#0c1f1a"),
                        borderBottom: `1px solid ${P.esmeraldaMid}`,
                      }}
                    >
                      <td className="px-3 py-2 font-medium" style={{ color: isAlerta ? P.vermelho : P.creme }}>
                        <div className="flex items-center gap-1.5">
                          {isAlerta && <AlertTriangle size={11} strokeWidth={2} style={{ color: P.vermelho }} />}
                          {row.deposito_nome}
                        </div>
                      </td>
                      <td className="px-3 py-2" style={{ color: P.sage }}>
                        {row.setor_nome ?? "—"}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums" style={{ color: P.sage }}>
                        {row.registros}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums" style={{ color: P.sage }}>
                        {formatPeso(row.recebido)}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums" style={{ color: P.sage }}>
                        {formatPeso(row.entregue)}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums" style={{ color: isAlerta ? P.vermelho : P.sage }}>
                        {formatPeso(row.quebra)}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums" style={{ color: isAlerta ? P.vermelho : P.sage }}>
                        <span
                          className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{
                            backgroundColor: isAlerta ? P.vermelho + "22" : P.sage + "22",
                            color: isAlerta ? P.vermelho : P.sage,
                          }}
                        >
                          {row.percentual.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {quebraOps.some(r => r.percentual > 5) && (
              <div
                className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                style={{ backgroundColor: "#3B1515", border: `1px solid ${P.vermelho}44`, color: P.vermelho }}
              >
                <AlertTriangle size={13} strokeWidth={2} />
                Operadores com quebra acima de 5% precisam de atenção
              </div>
            )}
          </div>
        )}
      </Panel>

      {/* ── Movimentações de Estoque ──────────────────────────────────────────── */}
      <Panel>
        <div className="flex items-center justify-between mb-3">
          <SectionHeading>Movimentações de Estoque — Ouro no Período</SectionHeading>
          {movData && (
            <span className="text-[10px]" style={{ color: P.cremeMuted }}>
              {movData.total} registros
            </span>
          )}
        </div>

        {movLoading ? (
          <p className="text-sm py-6 text-center" style={{ color: P.cremeMuted }}>Carregando...</p>
        ) : !movData || movData.rows.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: P.cremeMuted }}>
            Sem movimentações no período
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${P.esmeraldaMid}` }}>
                    {["Data/Hora", "Depósito", "Insumo", "Entrada (g)", "Saída (g)", "Marcador", "Observação"].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2 text-left font-semibold uppercase tracking-wider"
                        style={{ color: P.cremeMuted }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {movData.rows.map((row, i) => (
                    <tr
                      key={row.id}
                      style={{
                        backgroundColor: i % 2 === 0 ? "transparent" : "#0c1f1a",
                        borderBottom: `1px solid ${P.esmeraldaMid}`,
                      }}
                    >
                      <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: P.cremeMuted }}>
                        {fmtDate(row.data_hora)}
                      </td>
                      <td className="px-3 py-2" style={{ color: P.sage }}>
                        {row.deposito_nome}
                      </td>
                      <td className="px-3 py-2" style={{ color: P.sage }}>
                        {row.insumo_nome}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums" style={{ color: P.verde }}>
                        {row.entrada ? `+${formatPeso(row.entrada)}` : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums" style={{ color: P.vermelho }}>
                        {row.saida ? `-${formatPeso(row.saida)}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {row.marcador ? (
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium"
                            style={{ backgroundColor: P.esmeralda + "88", color: P.dourado }}
                          >
                            {row.marcador}
                          </span>
                        ) : (
                          <span style={{ color: P.cremeMuted }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate" style={{ color: P.cremeMuted }}>
                        {row.obs ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            {movData.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-[11px]" style={{ color: P.cremeMuted }}>
                  Página {movData.page} de {movData.totalPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    disabled={movData.page <= 1}
                    onClick={() => setMovPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg transition-opacity disabled:opacity-30"
                    style={{ border: `1px solid ${P.esmeraldaMid}`, color: P.cremeMuted }}
                  >
                    <ChevronLeft size={14} strokeWidth={1.75} />
                  </button>
                  <button
                    disabled={movData.page >= movData.totalPages}
                    onClick={() => setMovPage(p => Math.min(movData.totalPages, p + 1))}
                    className="p-1.5 rounded-lg transition-opacity disabled:opacity-30"
                    style={{ border: `1px solid ${P.esmeraldaMid}`, color: P.cremeMuted }}
                  >
                    <ChevronRight size={14} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Panel>

      {/* ── Legenda quebra ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 pb-2">
        {[
          { icon: TrendingDown, label: "Quebra = ouro recebido − ouro entregue", color: P.cremeMuted },
          { icon: AlertTriangle, label: "Alerta > 5% — verificar operador", color: P.vermelho },
        ].map(({ icon: Icon, label, color }) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color }}>
            <Icon size={11} strokeWidth={2} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
