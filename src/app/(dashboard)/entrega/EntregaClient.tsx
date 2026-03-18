"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  Search,
  Loader2,
  PackageCheck,
} from "lucide-react";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EntregaRow {
  id: number;
  etapas: string;
  ordem_id: number;
  created_at: string;
  updated_at: string | null;
  numero_ordem: string | null;
  tipo_ordem: string | null;
  peso_metal_negociado: number | null;
  data_entrega: string | null;
  vendedor_id: number | null;
  cliente_nome: string | null;
  vendedora_nome: string | null;
}

interface Props {
  entregas: EntregaRow[];
}

type TabFilter = "pendente" | "concluido" | "todos";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function fmtNum(n: number | null | undefined, dec = 3) {
  if (n == null) return "—";
  return Number(n).toFixed(dec) + " g";
}

function fmtTipoOrdem(t: string | null) {
  if (!t) return "—";
  const map: Record<string, string> = {
    fabricacao: "Fabricação",
    servico_venda: "Serv. Venda",
    servico_loja: "Serv. Loja",
    servico_interno: "Serv. Interno",
    reposicao_loja: "Rep. Loja",
    reposicao_venda: "Rep. Venda",
    garantia: "Garantia",
    compra_fornecedor: "Compra",
  };
  return map[t] ?? t;
}

function EtapasBadge({ etapas }: { etapas: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string; Icon: typeof Clock }> = {
    pendente:  { label: "Pendente",  bg: "#FEF3C7", color: "#92400E", Icon: Clock },
    concluido: { label: "Concluída", bg: "#ECFDF5", color: "#059669", Icon: CheckCircle2 },
  };
  const s = cfg[etapas] ?? { label: etapas, bg: "#F3F4F6", color: "#6B7280", Icon: Clock };
  const Icon = s.Icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <Icon size={10} />
      {s.label}
    </span>
  );
}

function StatCard({
  label, value, color,
}: { label: string; value: number; color: string }) {
  return (
    <div
      className="rounded-xl p-4 border"
      style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
    >
      <p className="text-[11px] uppercase tracking-wider font-medium" style={{ color: "#9CA3AF" }}>
        {label}
      </p>
      <p className="text-2xl font-bold mt-1" style={{ color }}>{value}</p>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function EntregaClient({ entregas }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<TabFilter>("pendente");
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [localEtapas, setLocalEtapas] = useState<Record<number, string>>({});

  const refresh = useCallback(
    () => startTransition(() => router.refresh()),
    [router]
  );

  function getEtapas(row: EntregaRow): string {
    return localEtapas[row.id] ?? row.etapas;
  }

  const pendentes = entregas.filter((e) => getEtapas(e) === "pendente").length;
  const concluidas = entregas.filter((e) => getEtapas(e) === "concluido").length;

  const filtered = entregas.filter((e) => {
    const etapa = getEtapas(e);
    if (tab === "pendente" && etapa !== "pendente") return false;
    if (tab === "concluido" && etapa !== "concluido") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (e.numero_ordem ?? "").toLowerCase().includes(q) ||
        (e.cliente_nome ?? "").toLowerCase().includes(q) ||
        (e.vendedora_nome ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function handleConcluir(entregaId: number) {
    setLoadingId(entregaId);
    try {
      // Optimistic update
      setLocalEtapas((prev) => ({ ...prev, [entregaId]: "concluido" }));
      const res = await fetch(`/api/entrega/${entregaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapas: "concluido" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Revert on error
        setLocalEtapas((prev) => {
          const next = { ...prev };
          delete next[entregaId];
          return next;
        });
        alert(data?.error ?? `Erro ${res.status}`);
        return;
      }
      refresh();
    } finally {
      setLoadingId(null);
    }
  }

  const tabCfg: { value: TabFilter; label: string; count?: number }[] = [
    { value: "pendente",  label: "Pendentes",  count: pendentes },
    { value: "concluido", label: "Concluídas", count: concluidas },
    { value: "todos",     label: "Todas" },
  ];

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <div className="mb-6">
        <h2
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
        >
          Entrega
        </h2>
        <p className="text-sm mt-1" style={{ color: "#6B7280" }}>
          Preparações de entrega — conclusão das ordens para o cliente
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Pendentes" value={pendentes} color={pendentes > 0 ? "#92400E" : C.esmeralda} />
        <StatCard label="Concluídas" value={concluidas} color="#059669" />
        <StatCard label="Total" value={entregas.length} color={C.esmeralda} />
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ backgroundColor: C.creme, border: `1px solid ${C.cremeBorder}` }}
        >
          {tabCfg.map(({ value, label, count }) => {
            const isActive = tab === value;
            return (
              <button
                key={value}
                onClick={() => { setTab(value); setSearch(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                style={{
                  backgroundColor: isActive ? C.esmeralda : "transparent",
                  color: isActive ? C.creme : "#6B7280",
                }}
              >
                {label}
                {count != null && count > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[11px] font-bold"
                    style={{
                      backgroundColor: isActive ? "#ffffff30" : "#92400E20",
                      color: isActive ? "#fff" : "#92400E",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input
            type="text"
            placeholder="Buscar por ordem, cliente, vendedora..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm focus:outline-none"
            style={{ borderColor: C.cremeBorder }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.cremeBg, borderBottom: "1px solid #E8DCC8" }}>
              {["Ordem", "Cliente", "Vendedora", "Tipo", "Peso", "Criado em", "Conclusão", "Status", "Ações"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "#9CA3AF" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>
                  Nenhuma entrega encontrada
                </td>
              </tr>
            )}
            {filtered.map((e, i) => {
              const etapa = getEtapas(e);
              const isPendente = etapa === "pendente";
              const isLoading = loadingId === e.id;
              return (
                <tr key={e.id} style={{ borderTop: i > 0 ? "1px solid #F3EADA" : undefined }}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/ordens/${e.ordem_id}`}
                      className="font-medium hover:underline"
                      style={{ color: "#184036" }}
                      title="Ver detalhes da ordem"
                    >
                      {e.numero_ordem ?? `#${e.ordem_id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>
                    {e.cliente_nome ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>
                    {e.vendedora_nome ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: "#374151" }}>
                    {fmtTipoOrdem(e.tipo_ordem)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#374151" }}>
                    {fmtNum(e.peso_metal_negociado)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>
                    {fmt(e.created_at)}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]" style={{ color: "#9CA3AF" }}>
                    {etapa === "concluido" ? fmt(e.updated_at) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <EtapasBadge etapas={etapa} />
                  </td>
                  <td className="px-4 py-3">
                    {isPendente ? (
                      <button
                        disabled={isLoading}
                        onClick={() => handleConcluir(e.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold disabled:opacity-50"
                        style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
                      >
                        {isLoading ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <PackageCheck size={12} />
                        )}
                        Concluir Entrega
                      </button>
                    ) : (
                      <span className="text-[12px]" style={{ color: "#D1D5DB" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <p className="text-[11px] mt-2 text-right" style={{ color: "#9CA3AF" }}>
          {filtered.length} entrega{filtered.length !== 1 ? "s" : ""} exibida{filtered.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
