"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ChevronRight as ChevronExpand,
  Loader2,
} from "lucide-react";
import { formatPeso } from "@/lib/formatters";
import ProdutoDrawer from "@/components/produtos/ProdutoDrawer";
import CadastroProdutoModal from "@/components/produtos/CadastroProdutoModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Produto {
  id_produto: number;
  nome: string;
  sku: string;
  tipo_metal: string | null;
  peso_precificado: string | null;
  preco_tiny: string | null;
  preco_sync: string | null;
  preco_pedras: string | null;
  preco_total_sync: string | null;
  diferenca_percentual: string | null;
  tem_pedra_preciosa: boolean;
  situacao: string | null;
  foto_produto: string | null;
  // erp_produtos
  erp_id: number | null;
  eh_pai: boolean | null;
  eh_variacao: boolean | null;
  parent_sku: string | null;
  sufixo_variacao: string | null;
  numeracao: string | null;
  qtd_variacoes: number;
}

type OrderField = "nome" | "sku" | "preco_sync" | "diferenca_percentual" | "preco_tiny" | "peso_precificado" | "id_produto";
type OrderDir = "asc" | "desc";

// ─── Design constants ─────────────────────────────────────────────────────────

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg: "#FAFAF7",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPreco(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function DeltaBadge({ pct }: { pct: string | null | undefined }) {
  if (!pct) return <span className="text-gray-400 font-mono text-xs">—</span>;
  const n = parseFloat(pct);
  if (isNaN(n)) return <span className="text-gray-400 font-mono text-xs">—</span>;
  if (Math.abs(n) < 0.01) return <span className="text-gray-400 font-mono text-xs">= 0%</span>;
  const sign = n > 0 ? "+" : "";
  const cls = n > 0 ? "text-red-600" : "text-green-600";
  return <span className={`font-mono text-xs font-medium ${cls}`}>{sign}{n.toFixed(1)}%</span>;
}

function SituacaoBadge({ situacao }: { situacao: string | null }) {
  if (situacao === "A") {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium" style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}>
        Ativo
      </span>
    );
  }
  if (situacao === "I") {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium" style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}>
        Inativo
      </span>
    );
  }
  return <span className="text-gray-400 text-xs">{situacao ?? "—"}</span>;
}

function VariacoesBadge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
      style={{ backgroundColor: "#E0F2FE", color: "#0369A1" }}
    >
      {n} var
    </span>
  );
}

// ─── SortHeader ───────────────────────────────────────────────────────────────

function SortHeader({
  field, label, current, dir, onSort,
}: {
  field: OrderField; label: string; current: OrderField; dir: OrderDir;
  onSort: (f: OrderField) => void;
}) {
  const active = current === field;
  return (
    <th
      className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap"
      style={{ color: active ? C.esmeralda : "#9CA3AF" }}
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active
          ? dir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />
          : <ChevronUp size={11} className="opacity-30" />}
      </span>
    </th>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProdutosClient() {
  // Filters
  const [busca, setBusca] = useState("");
  const [tipoMetal, setTipoMetal] = useState("");
  const [temPedra, setTemPedra] = useState("");
  const [situacao, setSituacao] = useState("A");

  // Sorting
  const [order, setOrder] = useState<OrderField>("nome");
  const [dir, setDir] = useState<OrderDir>("asc");

  // Pagination
  const [page, setPage] = useState(1);
  const limit = 50;

  // Data
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Expand / collapse state
  const [expandedSkus, setExpandedSkus] = useState<Set<string>>(new Set());
  const [childrenCache, setChildrenCache] = useState<Record<string, Produto[]>>({});
  const [loadingChildren, setLoadingChildren] = useState<Set<string>>(new Set());

  // Drawer
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Cadastro modal
  const [showCadastro, setShowCadastro] = useState(false);

  // Debounce busca
  const buscaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedBusca, setDebouncedBusca] = useState("");

  useEffect(() => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    buscaTimer.current = setTimeout(() => {
      setDebouncedBusca(busca);
      setPage(1);
    }, 300);
    return () => { if (buscaTimer.current) clearTimeout(buscaTimer.current); };
  }, [busca]);

  const fetchProdutos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        busca: debouncedBusca,
        situacao,
        page: String(page),
        limit: String(limit),
        order,
        dir,
        agrupar: "true",
      });
      if (tipoMetal) params.set("tipo_metal", tipoMetal);
      if (temPedra)  params.set("tem_pedra", temPedra);

      const res = await fetch(`/api/produtos?${params.toString()}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Erro ao buscar produtos");
      }
      const data = await res.json() as { produtos: Produto[]; total: number; totalPages: number };
      setProdutos(data.produtos);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      // Reset expansions when list changes
      setExpandedSkus(new Set());
      setChildrenCache({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [debouncedBusca, situacao, page, limit, order, dir, tipoMetal, temPedra]);

  useEffect(() => { fetchProdutos(); }, [fetchProdutos]);

  // ── Expand / collapse ──────────────────────────────────────────────────────

  async function toggleExpand(p: Produto, e: React.MouseEvent) {
    e.stopPropagation();
    if (!p.sku) return;

    if (expandedSkus.has(p.sku)) {
      setExpandedSkus((prev) => { const s = new Set(prev); s.delete(p.sku); return s; });
      return;
    }

    // Expand: load children if not cached
    if (!childrenCache[p.sku]) {
      setLoadingChildren((prev) => new Set(prev).add(p.sku));
      try {
        const res = await fetch(`/api/produtos?parent_sku=${encodeURIComponent(p.sku)}&situacao=&limit=200`);
        if (res.ok) {
          const data = await res.json() as { produtos: Produto[] };
          setChildrenCache((prev) => ({ ...prev, [p.sku]: data.produtos }));
        }
      } catch {
        // non-critical
      } finally {
        setLoadingChildren((prev) => { const s = new Set(prev); s.delete(p.sku); return s; });
      }
    }

    setExpandedSkus((prev) => new Set(prev).add(p.sku));
  }

  function handleSort(field: OrderField) {
    if (order === field) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setOrder(field); setDir("asc"); }
    setPage(1);
  }

  function handleFilterChange(fn: () => void) { fn(); setPage(1); }

  // ── Flatten rows (pais + children inline) ─────────────────────────────────

  interface Row extends Produto { _isChild?: boolean }

  const rows: Row[] = produtos.flatMap((p) => {
    const result: Row[] = [p];
    if (expandedSkus.has(p.sku) && childrenCache[p.sku]) {
      childrenCache[p.sku].forEach((c) => result.push({ ...c, _isChild: true }));
    }
    return result;
  });

  const selectCls =
    "border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:border-[#184036] transition-colors min-w-[120px]";

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: C.bg }}>
      {/* Header */}
      <div className="px-3 md:px-6 py-3 md:py-4 border-b bg-white shrink-0" style={{ borderColor: C.cremeBorder }}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold text-gray-800">Produtos</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {loading ? "Carregando..." : error ? "—" : `${total.toLocaleString("pt-BR")} produto(s)`}
            </p>
          </div>
          <button
            onClick={() => setShowCadastro(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "#184036" }}
          >
            + Novo Produto
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nome ou SKU..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white focus:outline-none focus:border-[#184036] transition-colors w-64"
            />
          </div>
          <select value={tipoMetal} onChange={(e) => handleFilterChange(() => setTipoMetal(e.target.value))} className={selectCls}>
            <option value="">Todos os metais</option>
            <option value="Ouro Amarelo 18k">Ouro Amarelo 18k</option>
            <option value="Ouro Branco 18k">Ouro Branco 18k</option>
            <option value="Ouro Rose 18k">Ouro Rose 18k</option>
            <option value="Prata">Prata</option>
          </select>
          <select value={temPedra} onChange={(e) => handleFilterChange(() => setTemPedra(e.target.value))} className={selectCls}>
            <option value="">Com e sem pedra</option>
            <option value="true">Com pedra preciosa</option>
            <option value="false">Sem pedra preciosa</option>
          </select>
          <select value={situacao} onChange={(e) => handleFilterChange(() => setSituacao(e.target.value))} className={selectCls}>
            <option value="A">Somente ativos</option>
            <option value="I">Somente inativos</option>
            <option value="">Todos</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-100">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}>
                {/* expand col */}
                <th className="w-8" />
                <SortHeader field="sku"                  label="SKU"        current={order} dir={dir} onSort={handleSort} />
                <SortHeader field="nome"                 label="Nome"       current={order} dir={dir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Metal</th>
                <SortHeader field="peso_precificado"     label="Peso"       current={order} dir={dir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">Situação</th>
                <SortHeader field="preco_sync"           label="Preço Sync" current={order} dir={dir} onSort={handleSort} />
                <SortHeader field="preco_tiny"           label="Preço Tiny" current={order} dir={dir} onSort={handleSort} />
                <SortHeader field="diferenca_percentual" label="Δ%"         current={order} dir={dir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-gray-400 text-sm">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-12 text-center text-gray-400 text-sm">
                    Nenhum produto encontrado.
                  </td>
                </tr>
              ) : (
                rows.map((p, i) => {
                  const isChild   = p._isChild === true;
                  const isPai     = !isChild && !!p.eh_pai && (p.qtd_variacoes ?? 0) > 0;
                  const isExpanded = isPai && expandedSkus.has(p.sku);
                  const isLoading  = isPai && loadingChildren.has(p.sku);

                  return (
                    <tr
                      key={`${p.id_produto}-${i}`}
                      className="border-b last:border-0 cursor-pointer transition-colors"
                      style={{
                        borderColor: C.cremeBorder,
                        backgroundColor: isChild ? "#F8FAF8" : undefined,
                      }}
                      onClick={() => setSelectedId(p.id_produto)}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = isChild ? "#F0F5F0" : "#F9FAFB"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = isChild ? "#F8FAF8" : ""; }}
                    >
                      {/* Expand button */}
                      <td className="pl-2 pr-0 py-2.5 w-8">
                        {isPai ? (
                          <button
                            onClick={(e) => toggleExpand(p, e)}
                            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
                            title={isExpanded ? "Recolher variações" : "Expandir variações"}
                          >
                            {isLoading
                              ? <Loader2 size={12} className="animate-spin" />
                              : isExpanded
                              ? <ChevronDown size={13} />
                              : <ChevronExpand size={13} />}
                          </button>
                        ) : isChild ? (
                          <span className="ml-3 text-gray-300 text-[10px]">└</span>
                        ) : null}
                      </td>

                      {/* SKU */}
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-xs text-gray-600">{p.sku || "—"}</span>
                      </td>

                      {/* Nome */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`font-medium leading-tight ${isChild ? "text-xs text-gray-600" : "text-sm text-gray-800"}`}>
                            {p.nome}
                          </span>
                          {p.tem_pedra_preciosa && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ backgroundColor: "#EDE9FE", color: "#5B21B6" }}
                              title="Tem pedra preciosa"
                            >
                              💎
                            </span>
                          )}
                          {isPai && <VariacoesBadge n={p.qtd_variacoes} />}
                          {isChild && p.numeracao && (
                            <span className="text-[10px] text-blue-500 font-mono">nº{p.numeracao}</span>
                          )}
                        </div>
                      </td>

                      {/* Metal */}
                      <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                        {p.tipo_metal || "—"}
                      </td>

                      {/* Peso */}
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                        {formatPeso(p.peso_precificado)}g
                      </td>

                      {/* Situação */}
                      <td className="px-3 py-2.5">
                        <SituacaoBadge situacao={p.situacao} />
                      </td>

                      {/* Preço Sync */}
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-800 whitespace-nowrap">
                        {formatPreco(p.preco_sync)}
                      </td>

                      {/* Preço Tiny */}
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500 whitespace-nowrap">
                        {formatPreco(p.preco_tiny)}
                      </td>

                      {/* Δ% */}
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <DeltaBadge pct={p.diferenca_percentual} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-400">
              Página {page} de {totalPages} · {total.toLocaleString("pt-BR")} produtos
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className="w-7 h-7 flex items-center justify-center rounded-md text-xs border transition-colors"
                    style={{
                      backgroundColor: page === pageNum ? C.esmeralda : "white",
                      color: page === pageNum ? C.creme : "#374151",
                      borderColor: page === pageNum ? C.esmeralda : "#E5E7EB",
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="w-7 h-7 flex items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Drawer */}
      <ProdutoDrawer
        produtoId={selectedId}
        onClose={() => setSelectedId(null)}
        onSaved={() => fetchProdutos()}
      />

      {/* Modal de Cadastro */}
      <CadastroProdutoModal
        open={showCadastro}
        onClose={() => setShowCadastro(false)}
        onCreated={(produtoId, _sku) => {
          setShowCadastro(false);
          fetchProdutos();
          setSelectedId(produtoId);
        }}
      />
    </div>
  );
}
