"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronDown, Loader2,
  SlidersHorizontal, X,
} from "lucide-react";
import NovaOrdemButton from "@/components/ordens/NovaOrdemButton";
import { MobileCard } from "@/components/ui/MobileCard";
import Paginacao from "@/components/ui/Paginacao";
import { formatDateBR } from "@/lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrdemBadge = { id: number; numero_ordem: string | null };

type FunilData = {
  pcp:             { total: number; ordens: OrdemBadge[] };
  protocolo_ida:   { total: number; ordens: OrdemBadge[] };
  protocolo_volta: { total: number; ordens: OrdemBadge[] };
  auditoria:       { total: number; ordens: OrdemBadge[] };
  conferencia:     { total: number; ordens: OrdemBadge[] };
  entregues:       { total: number; ordens: OrdemBadge[] };
};

type CardKey = keyof FunilData;

interface Filtros {
  busca: string;
  status: string;      // 'aguardando' | 'em_andamento' | 'concluido' | 'a_vencer' | 'vencidas' | ''
  dataInicio: string;
  dataFim: string;
}

interface Contagens {
  todos: number;
  aguardando: number;
  em_andamento: number;
  concluido: number;
  a_vencer: number;
  vencidas: number;
  vencidas_producao: number;
  vencidas_processo: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateInput(d: Date): string { return d.toISOString().slice(0, 10); }
function hoje():         string { return toDateInput(new Date()); }
function menosNDias(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); return toDateInput(d);
}
function fmtDate(s: string): string {
  return new Date(s + "T12:00:00").toLocaleDateString("pt-BR");
}
function isEntregaVencida(dataEntrega: unknown, status: string): boolean {
  if (!dataEntrega) return false;
  const str = typeof dataEntrega === "string" ? dataEntrega.slice(0, 10) : new Date(dataEntrega as string).toISOString().slice(0, 10);
  const hojeStr = new Date().toISOString().slice(0, 10);
  return str < hojeStr && status !== "Concluído" && status !== "Concluido";
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  "Aguardando":   { bg: "#FEF3C7", color: "#92400E" },
  "Em Andamento": { bg: "#DBEAFE", color: "#1E40AF" },
  "Concluído":    { bg: "#D1FAE5", color: "#065F46" },
  "Concluido":    { bg: "#D1FAE5", color: "#065F46" },
};

function Badge({ label, map }: { label: string; map: Record<string, { bg: string; color: string }> }) {
  const s = map[label] ?? { bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {label || "—"}
    </span>
  );
}

// ─── Funil card config ────────────────────────────────────────────────────────

const FUNIL_CARDS: { key: CardKey; label: string; color: string }[] = [
  { key: "pcp",             label: "PCP",             color: "#2563EB" },
  { key: "protocolo_ida",   label: "Protocolo Ida",   color: "#D97706" },
  { key: "protocolo_volta", label: "Protocolo Volta", color: "#7C3AED" },
  { key: "auditoria",       label: "Auditoria",       color: "#B45309" },
  { key: "conferencia",     label: "Conferência",     color: "#059669" },
  { key: "entregues",       label: "Entregues",       color: "#184036" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrdensClient({
  ordens,
  tiposPermitidos = [],
  currentPage = 1,
  totalPages = 1,
  totalOrdens = 0,
  contagens,
  filtros: filtrosInit,
}: {
  ordens: any[];
  tiposPermitidos?: string[];
  currentPage?: number;
  totalPages?: number;
  totalOrdens?: number;
  contagens?: Contagens;
  filtros?: Filtros;
}) {
  const router = useRouter();
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);

  // Valores atuais dos filtros (vindos do server via props)
  const filtros: Filtros = filtrosInit ?? { busca: "", status: "", dataInicio: "", dataFim: "" };

  // ── Busca local com debounce ─────────────────────────────────────────────────
  const [buscaLocal, setBuscaLocal] = useState(filtros.busca);

  // Sincroniza quando a prop muda (nova navegação)
  useEffect(() => {
    setBuscaLocal(filtros.busca);
  }, [filtros.busca]);

  // Debounce: navega 500ms após parar de digitar (só se mudou)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (buscaLocal !== filtros.busca) {
        navigate({ busca: buscaLocal });
      }
    }, 500);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaLocal]);

  // ── Navegação server-side com filtros na URL ──────────────────────────────────
  function navigate(overrides: Partial<Filtros>) {
    const next = { ...filtros, ...overrides };
    const params = new URLSearchParams();
    if (next.busca)      params.set("busca",        next.busca);
    if (next.status)     params.set("status",        next.status);
    if (next.dataInicio) params.set("data_inicio",   next.dataInicio);
    if (next.dataFim)    params.set("data_fim",      next.dataFim);
    params.set("page", "1");
    router.push(`/ordens?${params.toString()}`);
  }

  // Extra params para a paginação preservar os filtros ativos
  const extraParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filtros.busca)      p.set("busca",      filtros.busca);
    if (filtros.status)     p.set("status",     filtros.status);
    if (filtros.dataInicio) p.set("data_inicio", filtros.dataInicio);
    if (filtros.dataFim)    p.set("data_fim",    filtros.dataFim);
    return p.toString();
  }, [filtros]);

  const temFiltroData = !!(filtros.dataInicio || filtros.dataFim);

  // ── Funil state ───────────────────────────────────────────────────────────────
  const [funilData, setFunilData]   = useState<FunilData | null>(null);
  const [funilLoading, setFunilLoading] = useState(false);
  const [funilError, setFunilError] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<CardKey | null>(null);

  // ── Funil fetch (sem filtro de data — total geral) ───────────────────────────
  async function fetchFunil() {
    setFunilLoading(true);
    setFunilError(null);
    try {
      const res = await fetch(`/api/ordens/rastreio`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.error ?? `HTTP ${res.status}`);
      }
      setFunilData(await res.json());
    } catch (err: any) {
      setFunilError(err?.message ?? "Erro ao carregar funil");
    } finally {
      setFunilLoading(false);
    }
  }

  useEffect(() => {
    fetchFunil();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleCard(key: CardKey) {
    setExpandedCard((prev) => (prev === key ? null : key));
  }

  const expandedOrdens = expandedCard && funilData ? funilData[expandedCard].ordens : [];

  // ── Contagens dos botões de status (do server) ────────────────────────────────
  const counts: Contagens = contagens ?? {
    todos: ordens.length, aguardando: 0, em_andamento: 0,
    concluido: 0, a_vencer: 0, vencidas: 0,
    vencidas_producao: 0, vencidas_processo: 0,
  };

  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto">
      <style>{`
        @keyframes pulse-soft {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-start justify-between mb-4 md:mb-6">
        <div>
          <h2
            className="text-xl md:text-2xl font-semibold"
            style={{ fontFamily: "var(--font-playfair)", color: "#184036" }}
          >
            Ordens
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
            {totalOrdens} ordens — página {currentPage} de {totalPages}
          </p>
        </div>
        <NovaOrdemButton tiposPermitidos={tiposPermitidos} />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FUNIL DE PRODUÇÃO
      ══════════════════════════════════════════════════════════════════════ */}

      {/* Cards funil */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-2">
        {FUNIL_CARDS.map((card) => {
          const isExpanded = expandedCard === card.key;
          const total = funilData ? funilData[card.key].total : null;
          return (
            <button key={card.key} onClick={() => toggleCard(card.key)}
              className="rounded-xl border p-4 text-left transition-all hover:shadow-md"
              style={{ borderColor: isExpanded ? card.color : "#E8DCC8", backgroundColor: isExpanded ? `${card.color}10` : "#fff" }}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1 truncate" style={{ color: card.color }}>{card.label}</p>
              {funilLoading
                ? <div className="h-7 w-10 rounded animate-pulse" style={{ backgroundColor: "#E8DCC8" }} />
                : <p className="text-2xl font-bold leading-none" style={{ color: card.color }}>{total ?? "—"}</p>
              }
              <ChevronDown size={14} className={`mt-2 transition-transform ${isExpanded ? "rotate-180" : ""}`} style={{ color: card.color }} />
            </button>
          );
        })}
      </div>

      {/* Expanded card detail */}
      {expandedCard && funilData && (
        <div className="rounded-xl border p-4 mb-5 animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ borderColor: FUNIL_CARDS.find((c) => c.key === expandedCard)?.color ?? "#E8DCC8", backgroundColor: "#FAFAF7" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: FUNIL_CARDS.find((c) => c.key === expandedCard)?.color }}>
            {FUNIL_CARDS.find((c) => c.key === expandedCard)?.label} — {expandedOrdens.length} ordem{expandedOrdens.length !== 1 ? "s" : ""}
          </p>
          {expandedOrdens.length === 0
            ? <p className="text-xs" style={{ color: "#6B7280" }}>Nenhuma ordem encontrada neste período.</p>
            : (
              <div className="flex flex-wrap gap-2">
                {expandedOrdens.map((o) => (
                  <Link key={o.id} href={`/ordens/${o.id}`}
                    className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:opacity-80"
                    style={{ borderColor: FUNIL_CARDS.find((c) => c.key === expandedCard)?.color ?? "#E8DCC8", color: FUNIL_CARDS.find((c) => c.key === expandedCard)?.color ?? "#184036", backgroundColor: "#fff" }}>
                    {o.numero_ordem ?? `#${o.id}`}
                  </Link>
                ))}
              </div>
            )}
        </div>
      )}

      {funilError && (
        <div className="rounded-lg border px-4 py-3 mb-5 text-sm"
          style={{ borderColor: "#FCA5A5", backgroundColor: "#FEF2F2", color: "#B91C1C" }}>
          Erro ao carregar funil: {funilError}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          FILTROS DA TABELA (server-side via URL)
      ══════════════════════════════════════════════════════════════════════ */}

      {/* Filtro de data de criação — afeta a tabela, NÃO o funil */}
      <div
        className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-xl border"
        style={{ borderColor: "#E8DCC8", backgroundColor: "#FAFAF7" }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider mr-1 shrink-0" style={{ color: "#6B7280" }}>
          Criadas em
        </span>
        {([
          { key: "today", label: "Hoje",         ini: hoje(),          fi: hoje() },
          { key: "7d",    label: "7 dias",        ini: menosNDias(7),   fi: hoje() },
          { key: "30d",   label: "30 dias",       ini: menosNDias(30),  fi: hoje() },
        ] as const).map(({ key, label, ini, fi }) => {
          const isActive = filtros.dataInicio === ini && filtros.dataFim === fi;
          return (
            <button key={key}
              onClick={() => navigate({ dataInicio: ini, dataFim: fi })}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: isActive ? "#18403620" : "transparent",
                border: `1px solid ${isActive ? "#184036" : "#E8DCC8"}`,
                color: isActive ? "#184036" : "#6B7280",
              }}>
              {label}
            </button>
          );
        })}

        {/* Date pickers */}
        <div className="flex items-center gap-1.5">
          <input type="date" value={filtros.dataInicio}
            onChange={(e) => navigate({ dataInicio: e.target.value })}
            className="border rounded-lg px-2 py-1 text-xs outline-none"
            style={{ borderColor: "#E8DCC8", color: filtros.dataInicio ? "#1A1A1A" : "#9CA3AF", backgroundColor: "#fff" }} />
          <span className="text-xs" style={{ color: "#9CA3AF" }}>até</span>
          <input type="date" value={filtros.dataFim}
            onChange={(e) => navigate({ dataFim: e.target.value })}
            className="border rounded-lg px-2 py-1 text-xs outline-none"
            style={{ borderColor: "#E8DCC8", color: filtros.dataFim ? "#1A1A1A" : "#9CA3AF", backgroundColor: "#fff" }} />
        </div>

        {/* Limpar data */}
        {temFiltroData && (
          <button
            onClick={() => navigate({ dataInicio: "", dataFim: "" })}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ border: "1px solid #FCA5A5", color: "#DC2626", backgroundColor: "#FEF2F2" }}
            title="Limpar filtro de data"
          >
            <X size={11} /> Limpar
          </button>
        )}

        {/* Info do filtro ativo */}
        {temFiltroData && filtros.dataInicio && filtros.dataFim && (
          <span className="text-[11px] ml-auto hidden md:inline" style={{ color: "#9CA3AF" }}>
            {fmtDate(filtros.dataInicio)} – {fmtDate(filtros.dataFim)}
          </span>
        )}
      </div>

      {/* Mobile: busca + toggle filtros */}
      <div className="flex gap-2 mb-2 md:hidden">
        <input
          type="text"
          placeholder="Buscar ordem, cliente..."
          value={buscaLocal}
          onChange={(e) => setBuscaLocal(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1 outline-none focus:ring-2"
          style={{ borderColor: "#E8DCC8", color: "#1A1A1A", backgroundColor: "#fff" }}
        />
        <button
          onClick={() => setFiltrosAbertos((v) => !v)}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border"
          style={{
            borderColor: "#E8DCC8",
            backgroundColor: filtrosAbertos ? "#184036" : "#F3EADA",
            color: filtrosAbertos ? "#F3EADA" : "#184036",
          }}
        >
          <SlidersHorizontal size={14} />
          Filtros
        </button>
      </div>

      {/* Mobile: filtros colapsáveis de status */}
      {filtrosAbertos && (
        <div className="flex flex-wrap gap-2 mb-3 md:hidden">
          {[
            { key: "",            label: "Todos",       count: counts.todos },
            { key: "aguardando",  label: "Aguardando",  count: counts.aguardando },
            { key: "em_andamento",label: "Em Andamento",count: counts.em_andamento },
            { key: "concluido",   label: "Concluído",   count: counts.concluido },
          ].map(({ key, label, count }) => (
            <button key={key}
              onClick={() => navigate({ status: key })}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
              style={{
                backgroundColor: filtros.status === key ? "#184036" : "#F3EADA",
                color: filtros.status === key ? "#F3EADA" : "#184036",
              }}>
              {label} <span className="opacity-70">({count})</span>
            </button>
          ))}
          <button onClick={() => navigate({ status: "a_vencer" })}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
            style={{
              ...(filtros.status === "a_vencer"
                ? { backgroundColor: "#92400E", color: "#FEF3C7", borderColor: "#92400E" }
                : counts.a_vencer > 0
                ? { backgroundColor: "#FEF3C7", color: "#92400E", borderColor: "#FCD34D" }
                : { backgroundColor: "#F3EADA", color: "#9CA3AF", borderColor: "transparent" }),
            }}>
            A Vencer <span className="opacity-70">({counts.a_vencer})</span>
          </button>
          <button onClick={() => navigate({ status: filtros.status === "vencidas_producao" ? "" : "vencidas_producao" })}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
            style={{
              ...(filtros.status === "vencidas_producao"
                ? { backgroundColor: "#7F1D1D", color: "#FEE2E2", borderColor: "#7F1D1D" }
                : counts.vencidas_producao > 0
                ? { backgroundColor: "#FEE2E2", color: "#7F1D1D", borderColor: "#EF4444" }
                : { backgroundColor: "#F3EADA", color: "#9CA3AF", borderColor: "transparent" }),
            }}>
            🔴 Em produção <span className="opacity-70">({counts.vencidas_producao})</span>
          </button>
          <button onClick={() => navigate({ status: filtros.status === "vencidas_processo" ? "" : "vencidas_processo" })}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
            style={{
              ...(filtros.status === "vencidas_processo"
                ? { backgroundColor: "#7C2D12", color: "#FFEDD5", borderColor: "#7C2D12" }
                : counts.vencidas_processo > 0
                ? { backgroundColor: "#FFEDD5", color: "#7C2D12", borderColor: "#FB923C" }
                : { backgroundColor: "#F3EADA", color: "#9CA3AF", borderColor: "transparent" }),
            }}>
            🟠 No processo <span className="opacity-70">({counts.vencidas_processo})</span>
          </button>
        </div>
      )}

      {/* Desktop: busca + status sempre visíveis */}
      <div className="hidden md:flex flex-wrap items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Buscar por ordem, cliente ou vendedor..."
          value={buscaLocal}
          onChange={(e) => setBuscaLocal(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] outline-none focus:ring-2"
          style={{ borderColor: "#E8DCC8", color: "#1A1A1A", backgroundColor: "#fff" }}
        />
        {[
          { key: "",            label: "Todos",       count: counts.todos },
          { key: "aguardando",  label: "Aguardando",  count: counts.aguardando },
          { key: "em_andamento",label: "Em Andamento",count: counts.em_andamento },
          { key: "concluido",   label: "Concluído",   count: counts.concluido },
        ].map(({ key, label, count }) => (
          <button key={key}
            onClick={() => navigate({ status: key })}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              backgroundColor: filtros.status === key ? "#184036" : "#F3EADA",
              color: filtros.status === key ? "#F3EADA" : "#184036",
            }}>
            {label} <span className="opacity-70">({count})</span>
          </button>
        ))}
        <button onClick={() => navigate({ status: "a_vencer" })}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
          style={{
            ...(filtros.status === "a_vencer"
              ? { backgroundColor: "#92400E", color: "#FEF3C7", borderColor: "#92400E" }
              : counts.a_vencer > 0
              ? { backgroundColor: "#FEF3C7", color: "#92400E", borderColor: "#FCD34D" }
              : { backgroundColor: "#F3EADA", color: "#9CA3AF", borderColor: "transparent" }),
            ...(counts.a_vencer > 0 && filtros.status !== "a_vencer"
              ? { animation: "pulse-soft 2s ease-in-out infinite" }
              : undefined),
          }}>
          A Vencer <span className="opacity-70">({counts.a_vencer})</span>
        </button>
        {/* Separador */}
        <span className="text-gray-300 select-none hidden md:inline">|</span>

        {/* Pill: Vencidas em produção (vermelho urgente) */}
        <button onClick={() => navigate({ status: filtros.status === "vencidas_producao" ? "" : "vencidas_producao" })}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
          style={{
            ...(filtros.status === "vencidas_producao"
              ? { backgroundColor: "#7F1D1D", color: "#FEE2E2", borderColor: "#7F1D1D" }
              : counts.vencidas_producao > 0
              ? { backgroundColor: "#FEE2E2", color: "#7F1D1D", borderColor: "#EF4444" }
              : { backgroundColor: "#F3EADA", color: "#9CA3AF", borderColor: "transparent" }),
            ...(counts.vencidas_producao > 0 && filtros.status !== "vencidas_producao"
              ? { animation: "pulse-soft 2s ease-in-out infinite" }
              : undefined),
          }}
          title="Ordens vencidas ainda em produção (PCP ativo)">
          🔴 Em produção <span className="opacity-70">({counts.vencidas_producao})</span>
        </button>

        {/* Pill: Vencidas no processo (laranja atenção) */}
        <button onClick={() => navigate({ status: filtros.status === "vencidas_processo" ? "" : "vencidas_processo" })}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border"
          style={{
            ...(filtros.status === "vencidas_processo"
              ? { backgroundColor: "#7C2D12", color: "#FFEDD5", borderColor: "#7C2D12" }
              : counts.vencidas_processo > 0
              ? { backgroundColor: "#FFEDD5", color: "#7C2D12", borderColor: "#FB923C" }
              : { backgroundColor: "#F3EADA", color: "#9CA3AF", borderColor: "transparent" }),
          }}
          title="Todas as ordens vencidas não concluídas">
          🟠 No processo <span className="opacity-70">({counts.vencidas_processo})</span>
        </button>
      </div>

      {/* Lista mobile */}
      <div className="block md:hidden space-y-3 mb-3">
        {ordens.map((o) => (
          <MobileCard
            key={o.id}
            titulo={o.numero_ordem ?? `#${o.id}`}
            subtitulo={o.cliente_nome ?? ""}
            badges={[{
              label: o.status ?? "—",
              cor: o.status === "Concluído" || o.status === "Concluido"
                ? "bg-green-100 text-green-700"
                : o.status === "Em Andamento"
                ? "bg-blue-100 text-blue-700"
                : "bg-yellow-100 text-yellow-700",
            }]}
            campos={[
              { label: "Tipo",    valor: o.tipo_ordem ?? "—" },
              { label: "Entrega", valor: o.data_entrega ? formatDateBR(o.data_entrega) : "—" },
              { label: "Vendedor",valor: o.vendedor_nome ?? "—" },
              { label: "Pedido",  valor: o.numero_pedido ? `#${o.numero_pedido}` : "—" },
            ]}
            onClick={() => router.push(`/ordens/${o.id}`)}
          />
        ))}
        {ordens.length === 0 && (
          <p className="text-center py-8 text-sm" style={{ color: "#6B7280" }}>
            Nenhuma ordem encontrada
          </p>
        )}
      </div>

      {/* Tabela desktop */}
      <div className="hidden md:block bg-white rounded-xl border overflow-hidden" style={{ borderColor: "#E8DCC8" }}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "#184036" }}>
                {["ID", "Pedido PDV", "Nº Ordem", "Status", "Tipo", "Vendedor", "Cliente", "Setor", "Entrega", "Criado"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: "#80A795" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ordens.map((o, i) => (
                <tr key={o.id} onClick={() => router.push(`/ordens/${o.id}`)}
                  className="border-b transition-colors cursor-pointer hover:bg-opacity-80"
                  style={{ borderColor: "#F3EADA", backgroundColor: i % 2 === 0 ? "#fff" : "#FAFAF7" }}>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "#6B7280" }}>{o.id}</td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold" style={{ color: o.numero_pedido ? "#184036" : "#D1D5DB" }}>
                    {o.numero_pedido && o.venda_id ? (
                      <Link
                        href={`/vendas/${o.venda_id}`}
                        onClick={e => e.stopPropagation()}
                        className="hover:underline"
                      >
                        #{o.numero_pedido}
                      </Link>
                    ) : o.numero_pedido ? `#${o.numero_pedido}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: "#184036" }}>
                    {o.numero_ordem ?? `#${o.id}`}
                  </td>
                  <td className="px-4 py-2.5"><Badge label={o.status ?? "—"} map={STATUS_COLORS} /></td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>{o.tipo_ordem ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>{o.vendedor_nome ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-medium" style={{ color: "#184036" }}>{o.cliente_nome ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>{o.setor_nome ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-mono">
                    {o.data_entrega ? (
                      isEntregaVencida(o.data_entrega, o.status) ? (
                        <span className="flex items-center gap-1.5">
                          <span style={{ color: "#DC2626", fontWeight: 600 }}>
                            {formatDateBR(o.data_entrega)}
                          </span>
                          <span className="px-1 py-0.5 rounded text-[9px] font-bold" style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}>
                            VENCIDA
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: "#6B7280" }}>{formatDateBR(o.data_entrega)}</span>
                      )
                    ) : (
                      <span style={{ color: "#6B7280" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "#6B7280" }}>
                    {o.date_created ? new Date(o.date_created).toLocaleDateString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
              {ordens.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm" style={{ color: "#6B7280" }}>
                    Nenhuma ordem encontrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Paginacao
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalOrdens}
        pageSize={20}
        baseUrl="/ordens"
        extraParams={extraParams}
      />
    </div>
  );
}
