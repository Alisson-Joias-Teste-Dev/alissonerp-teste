"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Loader2, RefreshCw } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrdemBadge = { id: number; numero_ordem: string | null };

type FunilData = {
  pcp:            { total: number; ordens: OrdemBadge[] };
  protocolo_ida:  { total: number; ordens: OrdemBadge[] };
  protocolo_volta:{ total: number; ordens: OrdemBadge[] };
  auditoria:      { total: number; ordens: OrdemBadge[] };
  conferencia:    { total: number; ordens: OrdemBadge[] };
  entregues:      { total: number; ordens: OrdemBadge[] };
};

type CardKey = keyof FunilData;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateInput(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hoje(): string { return toDateInput(new Date()); }

function menosNDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateInput(d);
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

const FUNIL_CARDS: {
  key: CardKey;
  label: string;
  color: string;
}[] = [
  { key: "pcp",            label: "PCP",            color: "#2563EB" },
  { key: "protocolo_ida",  label: "Protocolo Ida",  color: "#D97706" },
  { key: "protocolo_volta",label: "Protocolo Volta", color: "#7C3AED" },
  { key: "auditoria",      label: "Auditoria",      color: "#B45309" },
  { key: "conferencia",    label: "Conferência",    color: "#059669" },
  { key: "entregues",      label: "Entregues",      color: "#184036" },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrdensClient({ ordens }: { ordens: any[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");

  // ── Funil state ─────────────────────────────────────────────────────────────
  type Preset = "today" | "7d" | "30d" | "custom";
  const [preset, setPreset] = useState<Preset>("30d");
  const [inicio, setInicio] = useState(() => menosNDias(30));
  const [fim, setFim] = useState(() => hoje());
  const [funilData, setFunilData] = useState<FunilData | null>(null);
  const [funilLoading, setFunilLoading] = useState(false);
  const [funilError, setFunilError] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<CardKey | null>(null);

  async function fetchFunil(ini: string, f: string) {
    setFunilLoading(true);
    setFunilError(null);
    try {
      const res = await fetch(
        `/api/ordens/rastreio?inicio=${encodeURIComponent(ini)}&fim=${encodeURIComponent(f)}`
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.error ?? `HTTP ${res.status}`);
      }
      const data: FunilData = await res.json();
      setFunilData(data);
    } catch (err: any) {
      setFunilError(err?.message ?? "Erro ao carregar funil");
    } finally {
      setFunilLoading(false);
    }
  }

  // Fetch on mount with defaults
  useEffect(() => {
    fetchFunil(inicio, fim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(p: Preset) {
    let ini = inicio;
    let fi  = fim;
    if (p === "today") { ini = hoje();         fi = hoje(); }
    if (p === "7d")    { ini = menosNDias(7);  fi = hoje(); }
    if (p === "30d")   { ini = menosNDias(30); fi = hoje(); }
    setPreset(p);
    setInicio(ini);
    setFim(fi);
    setExpandedCard(null);
    fetchFunil(ini, fi);
  }

  function applyCustom() {
    setPreset("custom");
    setExpandedCard(null);
    fetchFunil(inicio, fim);
  }

  function toggleCard(key: CardKey) {
    setExpandedCard((prev) => (prev === key ? null : key));
  }

  // ── Table filter ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return ordens.filter((o) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        o.numero_ordem?.toLowerCase().includes(q) ||
        o.numero_pedido?.includes(q) ||
        o.cliente_nome?.toLowerCase().includes(q) ||
        o.vendedor_nome?.toLowerCase().includes(q);
      const matchStatus =
        filterStatus === "todos" || o.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [ordens, search, filterStatus]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: ordens.length };
    for (const o of ordens) {
      c[o.status] = (c[o.status] ?? 0) + 1;
    }
    return c;
  }, [ordens]);

  // ── Expanded ordens for active card ──────────────────────────────────────────
  const expandedOrdens =
    expandedCard && funilData ? funilData[expandedCard].ordens : [];

  return (
    <div className="px-6 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-playfair)", color: "#184036" }}
        >
          Ordens
        </h2>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          {ordens.length} ordens — alissonerp.vw_ordens_completa
        </p>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          FUNIL DE PRODUÇÃO
      ══════════════════════════════════════════════════════════════════════ */}

      {/* Period filter bar */}
      <div
        className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-xl border"
        style={{ borderColor: "#E8DCC8", backgroundColor: "#FAFAF7" }}
      >
        <span className="text-xs font-semibold uppercase tracking-wider mr-1" style={{ color: "#6B7280" }}>
          Funil de Produção
        </span>

        {(["today", "7d", "30d", "custom"] as const).map((key) => {
          const label = { today: "Hoje", "7d": "7 dias", "30d": "30 dias", custom: "Personalizado" }[key];
          const isActive = preset === key;
          return (
            <button
              key={key}
              onClick={() => key !== "custom" ? applyPreset(key) : setPreset("custom")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{
                backgroundColor: isActive ? "#18403620" : "transparent",
                border: `1px solid ${isActive ? "#184036" : "#E8DCC8"}`,
                color: isActive ? "#184036" : "#6B7280",
              }}
            >
              {label}
            </button>
          );
        })}

        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: "#E8DCC8", color: "#1A1A1A", backgroundColor: "#fff" }}
            />
            <span className="text-xs" style={{ color: "#9CA3AF" }}>até</span>
            <input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="border rounded-lg px-2 py-1 text-xs outline-none"
              style={{ borderColor: "#E8DCC8", color: "#1A1A1A", backgroundColor: "#fff" }}
            />
            <button
              onClick={applyCustom}
              disabled={funilLoading}
              className="px-3 py-1 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#184036", color: "#F3EADA" }}
            >
              Aplicar
            </button>
          </div>
        )}

        <button
          onClick={() => fetchFunil(inicio, fim)}
          disabled={funilLoading}
          className="ml-auto p-1.5 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ border: "1px solid #E8DCC8", color: "#9CA3AF" }}
          title="Atualizar"
        >
          {funilLoading
            ? <Loader2 size={13} className="animate-spin" />
            : <RefreshCw size={13} strokeWidth={1.75} />
          }
        </button>
      </div>

      {/* Cards row */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-2">
        {FUNIL_CARDS.map((card) => {
          const isExpanded = expandedCard === card.key;
          const total = funilData ? funilData[card.key].total : null;

          return (
            <button
              key={card.key}
              onClick={() => toggleCard(card.key)}
              className="rounded-xl border p-4 text-left transition-all hover:shadow-md"
              style={{
                borderColor: isExpanded ? card.color : "#E8DCC8",
                backgroundColor: isExpanded ? `${card.color}10` : "#fff",
              }}
            >
              <p
                className="text-[10px] uppercase tracking-wider font-semibold mb-1 truncate"
                style={{ color: card.color }}
              >
                {card.label}
              </p>

              {funilLoading ? (
                <div
                  className="h-7 w-10 rounded animate-pulse"
                  style={{ backgroundColor: "#E8DCC8" }}
                />
              ) : (
                <p
                  className="text-2xl font-bold leading-none"
                  style={{ color: card.color }}
                >
                  {total ?? "—"}
                </p>
              )}

              <ChevronDown
                size={14}
                className={`mt-2 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                style={{ color: card.color }}
              />
            </button>
          );
        })}
      </div>

      {/* Expanded card detail */}
      {expandedCard && funilData && (
        <div
          className="rounded-xl border p-4 mb-5 animate-in fade-in slide-in-from-top-1 duration-150"
          style={{
            borderColor:
              FUNIL_CARDS.find((c) => c.key === expandedCard)?.color ?? "#E8DCC8",
            backgroundColor: "#FAFAF7",
          }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{
              color: FUNIL_CARDS.find((c) => c.key === expandedCard)?.color,
            }}
          >
            {FUNIL_CARDS.find((c) => c.key === expandedCard)?.label} —{" "}
            {expandedOrdens.length} ordem{expandedOrdens.length !== 1 ? "s" : ""}
          </p>

          {expandedOrdens.length === 0 ? (
            <p className="text-xs" style={{ color: "#6B7280" }}>
              Nenhuma ordem encontrada neste período.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {expandedOrdens.map((o) => (
                <Link
                  key={o.id}
                  href={`/ordens/${o.id}`}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors hover:opacity-80"
                  style={{
                    borderColor:
                      FUNIL_CARDS.find((c) => c.key === expandedCard)?.color ??
                      "#E8DCC8",
                    color:
                      FUNIL_CARDS.find((c) => c.key === expandedCard)?.color ??
                      "#184036",
                    backgroundColor: "#fff",
                  }}
                >
                  {o.numero_ordem ?? `#${o.id}`}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {funilError && (
        <div
          className="rounded-lg border px-4 py-3 mb-5 text-sm"
          style={{
            borderColor: "#FCA5A5",
            backgroundColor: "#FEF2F2",
            color: "#B91C1C",
          }}
        >
          Erro ao carregar funil: {funilError}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          FILTROS DA TABELA (original — unchanged)
      ══════════════════════════════════════════════════════════════════════ */}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="text"
          placeholder="Buscar por ordem, cliente ou vendedor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[200px] outline-none focus:ring-2"
          style={{
            borderColor: "#E8DCC8",
            color: "#1A1A1A",
            backgroundColor: "#fff",
          }}
        />
        {["todos", "Aguardando", "Em Andamento", "Concluído"].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              backgroundColor: filterStatus === s ? "#184036" : "#F3EADA",
              color: filterStatus === s ? "#F3EADA" : "#184036",
            }}
          >
            {s === "todos" ? "Todos" : s}{" "}
            <span className="opacity-70">({counts[s] ?? 0})</span>
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div
        className="bg-white rounded-xl border overflow-hidden"
        style={{ borderColor: "#E8DCC8" }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: "#184036" }}>
                {["ID", "Pedido PDV", "Nº Ordem", "Status", "Tipo", "Vendedor", "Cliente", "Setor", "Entrega", "Criado"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: "#80A795" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/ordens/${o.id}`)}
                  className="border-b transition-colors cursor-pointer hover:bg-opacity-80"
                  style={{
                    borderColor: "#F3EADA",
                    backgroundColor: i % 2 === 0 ? "#fff" : "#FAFAF7",
                  }}
                >
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: "#6B7280" }}>
                    {o.id}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold" style={{ color: o.numero_pedido ? "#184036" : "#D1D5DB" }}>
                    {o.numero_pedido ? `#${o.numero_pedido}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: "#184036" }}>
                    {o.numero_ordem ?? `#${o.id}`}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge label={o.status ?? "—"} map={STATUS_COLORS} />
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                    {o.tipo_ordem ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                    {o.vendedor_nome ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium" style={{ color: "#184036" }}>
                    {o.cliente_nome ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: "#6B7280" }}>
                    {o.setor_nome ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "#6B7280" }}>
                    {o.data_entrega
                      ? new Date(o.data_entrega).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-mono" style={{ color: "#6B7280" }}>
                    {o.date_created
                      ? new Date(o.date_created).toLocaleDateString("pt-BR")
                      : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
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

      <p className="text-[11px] mt-3" style={{ color: "#6B7280" }}>
        Exibindo {filtered.length} de {ordens.length} ordens
      </p>
    </div>
  );
}
