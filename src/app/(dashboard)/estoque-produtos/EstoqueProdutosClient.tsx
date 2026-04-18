"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Search,
  DollarSign,
  Package,
  Tag,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Loader2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { formatMoeda } from "@/lib/formatters";

// ─── Paleta (identidade da empresa) ─────────────────────────────────────────
const P = {
  esmeralda: "#184036",
  esmeraldaDark: "#0F2922",
  esmeraldaMid: "#143830",
  esmeraldaLight: "#4D7D6A",
  creme: "#F3EADA",
  cremeBg: "#FAFAF7",
  cremeBorder: "#E8DCC8",
  dourado: "#DB9864",
  douradoLight: "#FEDDB4",
  cremeMuted: "#D4C9B0",
  sage: "#80A795",
  vermelho: "#C24848",
};

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface Item {
  id_produto: string;
  sku: string;
  nome: string | null;
  saldo: number;
  preco_tiny: string | null;
  valor_total: string;
  data_ultima_compra: string | null;
}

interface Kpis {
  total_valor: number;
  total_skus: number;
  total_pecas: number;
  skus_sem_preco: number;
}

interface ApiResponse {
  kpis: Kpis;
  itens: Item[];
  page: number;
  limit: number;
  totalPages: number;
  order: string;
  dir: "asc" | "desc";
}

type OrderField = "sku" | "nome" | "saldo" | "preco_tiny" | "valor_total" | "data_ultima_compra";

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDateBR(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// ─── KPI Card ───────────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  accent = P.dourado,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ backgroundColor: P.esmeraldaDark, border: `1px solid ${P.esmeraldaMid}` }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: accent + "22" }}
        >
          <Icon size={17} strokeWidth={1.75} style={{ color: accent }} />
        </div>
        <span
          className="text-[11px] uppercase tracking-[0.12em]"
          style={{ color: P.cremeMuted }}
        >
          {label}
        </span>
      </div>
      <p
        className="text-3xl font-semibold tabular-nums"
        style={{ color: accent, fontFamily: "var(--font-jetbrains), ui-monospace, monospace" }}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[11px] mt-2" style={{ color: P.cremeMuted }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Header da coluna com ordenação ─────────────────────────────────────────
function ColHeader({
  label,
  field,
  currentField,
  currentDir,
  onToggle,
  align = "left",
}: {
  label: string;
  field: OrderField;
  currentField: string;
  currentDir: "asc" | "desc";
  onToggle: (f: OrderField) => void;
  align?: "left" | "right";
}) {
  const active = field === currentField;
  const Icon = active ? (currentDir === "asc" ? ChevronUp : ChevronDown) : null;
  return (
    <th
      onClick={() => onToggle(field)}
      className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:bg-[#EDE0CA] transition ${
        align === "right" ? "text-right" : "text-left"
      }`}
      style={{ color: P.esmeralda }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {Icon && <Icon size={13} />}
      </span>
    </th>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function EstoqueProdutosClient() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [order, setOrder] = useState<OrderField>("valor_total");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [ultimaSync, setUltimaSync] = useState<Date | null>(null);

  // Debounce da busca
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const qs = new URLSearchParams({
        busca,
        order,
        dir,
        page: String(page),
        limit: "50",
      });
      const r = await fetch(`/api/estoque-produtos?${qs.toString()}`, { cache: "no-store" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `Erro ${r.status}`);
      }
      const j: ApiResponse = await r.json();
      setData(j);
      setUltimaSync(new Date());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar estoque");
    } finally {
      setLoading(false);
    }
  }, [busca, order, dir, page]);

  // Fetch ao mudar order/dir/page (sem debounce)
  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, dir, page]);

  // Busca com debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      fetchData();
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const toggleOrder = useCallback(
    (f: OrderField) => {
      if (order === f) {
        setDir(dir === "asc" ? "desc" : "asc");
      } else {
        setOrder(f);
        setDir(f === "sku" || f === "nome" ? "asc" : "desc");
      }
      setPage(1);
    },
    [order, dir]
  );

  const kpis = data?.kpis;
  const itens = data?.itens ?? [];
  const totalPages = data?.totalPages ?? 1;

  const formattedSync = useMemo(
    () =>
      ultimaSync
        ? ultimaSync.toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        : "—",
    [ultimaSync]
  );

  return (
    <div className="min-h-screen pb-12" style={{ backgroundColor: P.cremeBg }}>
      {/* ═══ Header ═══ */}
      <header
        className="px-6 md:px-10 py-6 md:py-8"
        style={{
          background: `linear-gradient(135deg, ${P.esmeralda} 0%, ${P.esmeraldaDark} 100%)`,
          borderBottom: `3px solid ${P.dourado}`,
        }}
      >
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className="w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: P.esmeraldaMid, border: `2px solid ${P.dourado}` }}
            >
              <Image
                src="/logo.leaobranco.png"
                alt="Alisson Joalheria"
                width={36}
                height={36}
                className="object-contain"
              />
            </div>
            <div>
              <h1
                className="text-2xl md:text-3xl font-semibold leading-tight"
                style={{ color: P.creme, fontFamily: "var(--font-playfair), Georgia, serif" }}
              >
                Estoque de Produtos
              </h1>
              <p className="text-xs md:text-sm mt-0.5" style={{ color: P.cremeMuted }}>
                Visão financeira · valor de venda a preço Tiny
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition disabled:opacity-50"
            style={{
              backgroundColor: P.esmeraldaMid,
              color: P.creme,
              border: `1px solid ${P.esmeraldaLight}`,
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </header>

      {/* ═══ KPIs ═══ */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 -mt-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard
            icon={DollarSign}
            label="Valor total em estoque"
            value={kpis ? formatMoeda(kpis.total_valor) : "—"}
            sub={
              kpis && kpis.skus_sem_preco > 0
                ? `${kpis.skus_sem_preco} SKU${kpis.skus_sem_preco > 1 ? "s" : ""} sem preço não somado${
                    kpis.skus_sem_preco > 1 ? "s" : ""
                  }`
                : "Preço de venda Tiny × saldo"
            }
            accent={P.dourado}
          />
          <KpiCard
            icon={Tag}
            label="SKUs com saldo"
            value={kpis ? kpis.total_skus.toLocaleString("pt-BR") : "—"}
            sub="Produtos distintos em estoque"
            accent={P.douradoLight}
          />
          <KpiCard
            icon={Package}
            label="Peças em estoque"
            value={kpis ? kpis.total_pecas.toLocaleString("pt-BR") : "—"}
            sub="Quantidade total de unidades"
            accent={P.sage}
          />
        </div>
      </section>

      {/* ═══ Busca ═══ */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-8">
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ backgroundColor: "#FFFFFF", border: `1px solid ${P.cremeBorder}` }}
        >
          <Search size={18} style={{ color: P.esmeraldaLight }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por SKU ou nome do produto…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: P.esmeralda }}
          />
          {busca && (
            <button
              onClick={() => setBusca("")}
              className="text-xs px-2 py-1 rounded hover:bg-gray-100"
              style={{ color: P.sage }}
            >
              Limpar
            </button>
          )}
        </div>
      </section>

      {/* ═══ Tabela ═══ */}
      <section className="max-w-[1400px] mx-auto px-6 md:px-10 mt-5">
        <div
          className="rounded-xl overflow-hidden"
          style={{ backgroundColor: "#FFFFFF", border: `1px solid ${P.cremeBorder}` }}
        >
          {erro && (
            <div
              className="px-4 py-3 flex items-center gap-2 text-sm"
              style={{ backgroundColor: "#FEF2F2", color: P.vermelho }}
            >
              <AlertCircle size={16} />
              {erro}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: P.creme, borderBottom: `1px solid ${P.cremeBorder}` }}>
                <tr>
                  <ColHeader label="SKU" field="sku" currentField={order} currentDir={dir} onToggle={toggleOrder} />
                  <ColHeader label="Produto" field="nome" currentField={order} currentDir={dir} onToggle={toggleOrder} />
                  <ColHeader label="Saldo" field="saldo" currentField={order} currentDir={dir} onToggle={toggleOrder} align="right" />
                  <ColHeader label="Preço Tiny" field="preco_tiny" currentField={order} currentDir={dir} onToggle={toggleOrder} align="right" />
                  <ColHeader label="Valor Total" field="valor_total" currentField={order} currentDir={dir} onToggle={toggleOrder} align="right" />
                  <ColHeader label="Última Compra" field="data_ultima_compra" currentField={order} currentDir={dir} onToggle={toggleOrder} align="right" />
                </tr>
              </thead>
              <tbody>
                {loading && itens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <Loader2 size={24} className="animate-spin mx-auto" style={{ color: P.sage }} />
                      <p className="text-xs mt-2" style={{ color: P.sage }}>
                        Carregando…
                      </p>
                    </td>
                  </tr>
                )}

                {!loading && itens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-16 text-center text-sm" style={{ color: P.sage }}>
                      Nenhum produto com saldo encontrado.
                    </td>
                  </tr>
                )}

                {itens.map((it) => {
                  const semPreco = !it.preco_tiny || Number(it.preco_tiny) === 0;
                  const semData = !it.data_ultima_compra;
                  return (
                    <tr
                      key={it.id_produto}
                      className="border-b last:border-b-0 hover:bg-[#FAFAF7] transition"
                      style={{ borderColor: P.cremeBorder }}
                    >
                      <td className="px-4 py-3 font-mono tabular-nums text-xs" style={{ color: P.esmeralda }}>
                        {it.sku}
                      </td>
                      <td className="px-4 py-3" style={{ color: P.esmeralda }}>
                        {it.nome?.trim() || <span style={{ color: P.sage }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums" style={{ color: P.esmeralda }}>
                        {Number(it.saldo).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">
                        {semPreco ? (
                          <span style={{ color: P.vermelho }} title="Sem preço cadastrado no Tiny">
                            sem preço
                          </span>
                        ) : (
                          <span style={{ color: P.esmeralda }}>{formatMoeda(it.preco_tiny)}</span>
                        )}
                      </td>
                      <td
                        className="px-4 py-3 text-right font-mono tabular-nums font-semibold"
                        style={{ color: semPreco ? P.sage : P.esmeralda }}
                      >
                        {formatMoeda(it.valor_total)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">
                        {semData ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded"
                            style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
                          >
                            <Calendar size={10} />
                            sem data
                          </span>
                        ) : (
                          <span style={{ color: P.esmeralda }}>{formatDateBR(it.data_ultima_compra)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Paginação + status */}
        <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <p style={{ color: P.sage }}>
            Página {data?.page ?? 1} de {totalPages} · Última sincronização: {formattedSync}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
              style={{ backgroundColor: "#FFFFFF", border: `1px solid ${P.cremeBorder}`, color: P.esmeralda }}
            >
              <ChevronLeft size={14} />
              Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition disabled:opacity-40"
              style={{ backgroundColor: "#FFFFFF", border: `1px solid ${P.cremeBorder}`, color: P.esmeralda }}
            >
              Próxima
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
