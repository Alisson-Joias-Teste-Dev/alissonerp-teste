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
import ModalPersonalizacao from "@/components/produtos/ModalPersonalizacao";
import CadastrarPecaAvulsaModal from "@/components/produtos/CadastrarPecaAvulsaModal";
import BadgePromo from "@/components/ui/BadgePromo";
import BulkEditModal from "@/components/produtos/BulkEditModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Produto {
  id_produto: number;
  nome: string;
  sku: string;
  tipo_metal: string | null;
  peso_precificado: string | null;
  peso_ct: string | number | null;
  preco_tiny: string | null;
  preco_sync: string | null;
  preco_curva: number | null;
  preco_por_letra: string | number | null;
  preco_filhos_min: number | null;
  preco_pedras: string | null;
  preco_total_sync: string | null;
  diferenca_percentual: string | null;
  tem_pedra_preciosa: boolean;
  pedras_ct_total: number | null;
  pedras_qtd_total: number | null;
  pedras_nome_principal: string | null;
  situacao: string | null;
  categoria: string | null;
  foto_produto: string | null;
  saldo_estoque: number | null;
  pendencias: string[] | null;
  tipo_item: "joia" | "insumo" | null;
  // erp_produtos
  erp_id: number | null;
  eh_pai: boolean | null;
  eh_variacao: boolean | null;
  parent_sku: string | null;
  sufixo_variacao: string | null;
  numeracao: string | null;
  qtd_variacoes: number;
  // Promocao vigente (migration 248)
  preco_vigente?: string | number | null;
  em_promocao?: boolean | null;
  nome_campanha?: string | null;
  promo_data_fim?: string | null;
  // Controle de estoque
  controla_estoque?: boolean;
}

interface CategoriaPai {
  pai: string;
  total: number;
  filhos: { nome: string; total: number }[];
}

type OrderField = "nome" | "sku" | "preco_sync" | "peso_precificado" | "id_produto" | "tipo_metal" | "situacao" | "qtd_estoque";
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

import { type CampoVisivel, TODOS_VISIVEIS } from "@/lib/produto-visibilidade";

export default function ProdutosClient({ podeEditar = true, role = "", camposVisiveis = TODOS_VISIVEIS }: { podeEditar?: boolean; role?: string; camposVisiveis?: CampoVisivel }) {
  // Filters
  const [busca, setBusca] = useState("");
  const [tipoMetal, setTipoMetal] = useState("");
  const [temPedra, setTemPedra] = useState("");
  const [situacao, setSituacao] = useState("A");
  const [apenasComEstoque, setApenasComEstoque] = useState(true);
  const [categoriaPai, setCategoriaPai] = useState("");
  const [subcategoria, setSubcategoria]   = useState("");
  const [pendencia, setPendencia] = useState("");
  const [esconderInsumos, setEsconderInsumos] = useState(true);
  const [tipoItem, setTipoItem]   = useState("");
  const [comVariacoes, setComVariacoes] = useState<string>("");

  // Categorias hierárquicas (do recorte ativo+saldo>=1)
  const [categorias, setCategorias] = useState<CategoriaPai[]>([]);
  const [pendContagem, setPendContagem] = useState<{
    qualquer: number; sem_categoria: number; sem_metal: number;
    sem_peso: number; sem_preco: number;
  }>({ qualquer: 0, sem_categoria: 0, sem_metal: 0, sem_peso: 0, sem_preco: 0 });

  // Tick forçado para recarregar contadores (metais/categorias/pendências) após salvar
  const [refreshTick, setRefreshTick] = useState(0);
  const bumpRefresh = () => setRefreshTick((t) => t + 1);
  // Metais distintos (contagem só de ativos)
  const [metais, setMetais] = useState<{ tipo_metal: string | null; total: number }[]>([]);

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
  const [showPersonalizado, setShowPersonalizado] = useState(false);
  const [showPecaAvulsa, setShowPecaAvulsa] = useState(false);

  // Seleção em massa
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [showBulkEdit, setShowBulkEdit]   = useState(false);

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

  // Monta query string apenas com filtros contextuais (exceto o foco do select)
  function paramsContexto(extraExclude: string[] = []): string {
    const p = new URLSearchParams();
    if (debouncedBusca) p.set("busca", debouncedBusca);
    if (tipoMetal && !extraExclude.includes("tipo_metal")) p.set("tipo_metal", tipoMetal);
    if (temPedra) p.set("tem_pedra", temPedra);
    if (situacao) p.set("situacao", situacao);
    if (categoriaPai && !extraExclude.includes("categoria")) p.set("categoria", categoriaPai);
    if (subcategoria && !extraExclude.includes("categoria")) p.set("subcategoria", subcategoria);
    if (apenasComEstoque) p.set("apenas_com_estoque", "true");
    if (esconderInsumos) p.set("esconder_insumos", "true");
    if (pendencia && !extraExclude.includes("pendencia")) p.set("pendencia", pendencia);
    if (comVariacoes) p.set("com_variacoes", comVariacoes);
    return p.toString();
  }

  // Recarrega contadores (metais, categorias, pendências) sempre que filtros mudam
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const qsMetais   = paramsContexto(["tipo_metal"]);
        const qsCats     = paramsContexto(["categoria"]);
        const qsPend     = paramsContexto(["pendencia"]);
        const [r1, r2, r3] = await Promise.all([
          fetch(`/api/produtos/categorias?${qsCats}`),
          fetch(`/api/produtos/metais?${qsMetais}`),
          fetch(`/api/produtos/pendencias-contagem?${qsPend}`),
        ]);
        if (r1.ok) {
          const data = await r1.json() as { categorias: CategoriaPai[] };
          if (!cancelado) setCategorias(data.categorias ?? []);
        }
        if (r2.ok) {
          const data = await r2.json() as { metais: { tipo_metal: string | null; total: number }[] };
          if (!cancelado) setMetais(data.metais ?? []);
        }
        if (r3.ok) {
          const data = await r3.json() as typeof pendContagem;
          if (!cancelado) setPendContagem(data);
        }
      } catch {
        // não-crítico
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedBusca, tipoMetal, temPedra, situacao, categoriaPai, subcategoria, apenasComEstoque, esconderInsumos, pendencia, comVariacoes, refreshTick]);

  // Reseta subcategoria quando trocar a pai
  useEffect(() => { setSubcategoria(""); }, [categoriaPai]);

  function toggleSelecao(id: number, e?: React.MouseEvent) {
    e?.stopPropagation();
    setSelecionados((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }
  function limparSelecao() { setSelecionados(new Set()); }

  const subcategoriasDisponiveis =
    categorias.find((c) => c.pai === categoriaPai)?.filhos ?? [];

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
      if (tipoMetal)         params.set("tipo_metal", tipoMetal);
      if (temPedra)          params.set("tem_pedra", temPedra);
      if (categoriaPai)      params.set("categoria", categoriaPai);
      if (subcategoria)      params.set("subcategoria", subcategoria);
      if (apenasComEstoque)  params.set("apenas_com_estoque", "true");
      if (pendencia)         params.set("pendencia", pendencia);
      if (esconderInsumos)   params.set("esconder_insumos", "true");
      if (tipoItem)          params.set("tipo_item", tipoItem);
      if (comVariacoes)      params.set("com_variacoes", comVariacoes);

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
  }, [debouncedBusca, situacao, page, limit, order, dir, tipoMetal, temPedra, categoriaPai, subcategoria, apenasComEstoque, pendencia, tipoItem, esconderInsumos, comVariacoes]);

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
          <div className="flex items-center gap-2">
            {/* Botão "💎 Pedras" removido — gerenciamento agora vive em
                /precificacao > Markup Pedras (mesmo modal renderizado inline). */}
            <button
              onClick={() => setShowPersonalizado(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border hover:bg-amber-50"
              style={{ borderColor: "#D4A843", color: "#184036" }}
              title="Cadastrar regras de personalização (nome gravado, preço por letra)"
            >
              🏷️ + Personalizado
            </button>
            <button
              onClick={() => setShowPecaAvulsa(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors border hover:bg-purple-50"
              style={{ borderColor: "#7C3AED", color: "#184036" }}
              title="Cadastrar pedra avulsa (peso + custo USD + markup)"
            >
              ✨ + Pedra Avulsa
            </button>
            <button
              onClick={() => setShowCadastro(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors hover:opacity-90"
              style={{ backgroundColor: "#184036" }}
            >
              + Novo Produto
            </button>
          </div>
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
            {metais.map((m) => (
              <option
                key={m.tipo_metal ?? "__sem__"}
                value={m.tipo_metal ?? "__sem__"}
              >
                {m.tipo_metal ?? "Sem metal definido"} ({m.total})
              </option>
            ))}
          </select>
          <select value={temPedra} onChange={(e) => handleFilterChange(() => setTemPedra(e.target.value))} className={selectCls}>
            <option value="">Com e sem pedra</option>
            <option value="true">Com pedra preciosa</option>
            <option value="false">Sem pedra preciosa</option>
          </select>
          <select value={comVariacoes} onChange={(e) => handleFilterChange(() => setComVariacoes(e.target.value))} className={selectCls}>
            <option value="">Com e sem variações</option>
            <option value="true">Somente com variações</option>
            <option value="false">Somente sem variações</option>
          </select>
          <select value={situacao} onChange={(e) => handleFilterChange(() => setSituacao(e.target.value))} className={selectCls}>
            <option value="A">Somente ativos</option>
            <option value="I">Somente inativos</option>
            <option value="">Todos</option>
          </select>

          <select
            value={categoriaPai}
            onChange={(e) => handleFilterChange(() => setCategoriaPai(e.target.value))}
            className={selectCls}
            title="Categoria (pai)"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.pai} value={c.pai}>
                {c.pai} ({c.total})
              </option>
            ))}
          </select>

          {subcategoriasDisponiveis.length > 0 && (
            <select
              value={subcategoria}
              onChange={(e) => handleFilterChange(() => setSubcategoria(e.target.value))}
              className={selectCls}
              title="Subcategoria"
            >
              <option value="">Todas subcategorias</option>
              {subcategoriasDisponiveis.map((f) => (
                <option key={f.nome} value={f.nome}>
                  {f.nome} ({f.total})
                </option>
              ))}
            </select>
          )}

          <select
            value={tipoItem}
            onChange={(e) => handleFilterChange(() => setTipoItem(e.target.value))}
            className={selectCls}
            title="Tipo do item (joia ou insumo)"
          >
            <option value="">Joias + Insumos</option>
            <option value="joia">Só joias</option>
            <option value="insumo">Só insumos</option>
            <option value="__sem__">Sem classificação</option>
          </select>

          <select
            value={pendencia}
            onChange={(e) => handleFilterChange(() => setPendencia(e.target.value))}
            className={selectCls}
            title="Produtos com campos faltando"
          >
            <option value="">Sem filtro de pendência</option>
            <option value="qualquer">Qualquer pendência ({pendContagem.qualquer})</option>
            <option value="sem_categoria">Sem categoria ({pendContagem.sem_categoria})</option>
            <option value="sem_metal">Sem metal ({pendContagem.sem_metal})</option>
            <option value="sem_peso">Sem peso ({pendContagem.sem_peso})</option>
            <option value="sem_preco">Sem preço ({pendContagem.sem_preco})</option>
          </select>

          <label
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white cursor-pointer select-none hover:border-gray-300 transition-colors"
            title="Mostrar somente produtos com saldo ≥ 1 em estoque"
          >
            <input
              type="checkbox"
              checked={apenasComEstoque}
              onChange={(e) => handleFilterChange(() => setApenasComEstoque(e.target.checked))}
              className="accent-[#184036]"
            />
            Somente com estoque
          </label>

          <label
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-700 bg-white cursor-pointer select-none hover:border-gray-300 transition-colors"
            title="Esconder produtos com SKU IS*/MO*, categoria Insumos, Matérias Primas e Mostruário"
          >
            <input
              type="checkbox"
              checked={esconderInsumos}
              onChange={(e) => handleFilterChange(() => setEsconderInsumos(e.target.checked))}
              className="accent-[#184036]"
            />
            Esconder insumos e mostruário
          </label>
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
                {/* select col */}
                <th className="w-8 px-2">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((r) => selecionados.has(Number(r.id_produto)))}
                    ref={(el) => {
                      if (!el) return;
                      const some = rows.some((r) => selecionados.has(Number(r.id_produto)));
                      const all  = rows.length > 0 && rows.every((r) => selecionados.has(Number(r.id_produto)));
                      el.indeterminate = some && !all;
                    }}
                    onChange={(e) => {
                      setSelecionados((prev) => {
                        const s = new Set(prev);
                        if (e.target.checked) rows.forEach((r) => s.add(Number(r.id_produto)));
                        else rows.forEach((r) => s.delete(Number(r.id_produto)));
                        return s;
                      });
                    }}
                    className="accent-[#184036]"
                    title="Selecionar/desmarcar todos desta página"
                  />
                </th>
                {/* expand col */}
                <th className="w-8" />
                <SortHeader field="sku"                  label="SKU"         current={order} dir={dir} onSort={handleSort} />
                <SortHeader field="nome"                 label="Nome"        current={order} dir={dir} onSort={handleSort} />
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#9CA3AF" }}>Pedras</th>
                <SortHeader field="tipo_metal"           label="Metal"       current={order} dir={dir} onSort={handleSort} />
                <SortHeader field="peso_precificado"     label="Peso"        current={order} dir={dir} onSort={handleSort} />
                <SortHeader field="situacao"             label="Situação"    current={order} dir={dir} onSort={handleSort} />
                <SortHeader field="qtd_estoque"          label="Estoque"     current={order} dir={dir} onSort={handleSort} />
                <SortHeader field="preco_sync"           label="Preço Venda" current={order} dir={dir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-gray-400 text-sm">
                    Carregando...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-12 text-center text-gray-400 text-sm">
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
                        backgroundColor: selecionados.has(Number(p.id_produto))
                          ? "#E8F0EC"
                          : isChild ? "#F8FAF8" : undefined,
                      }}
                      onClick={() => setSelectedId(p.id_produto)}
                      onMouseEnter={(e) => {
                        if (selecionados.has(Number(p.id_produto))) return;
                        (e.currentTarget as HTMLElement).style.backgroundColor = isChild ? "#F0F5F0" : "#F9FAFB";
                      }}
                      onMouseLeave={(e) => {
                        if (selecionados.has(Number(p.id_produto))) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = "#E8F0EC";
                          return;
                        }
                        (e.currentTarget as HTMLElement).style.backgroundColor = isChild ? "#F8FAF8" : "";
                      }}
                    >
                      {/* Select checkbox */}
                      <td className="px-2 py-2.5 w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selecionados.has(Number(p.id_produto))}
                          onChange={(e) => toggleSelecao(Number(p.id_produto), e as unknown as React.MouseEvent)}
                          className="accent-[#184036]"
                        />
                      </td>
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
                          {p.pedras_ct_total != null && Number(p.pedras_ct_total) > 0 ? (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono"
                              style={{ backgroundColor: "#EDE9FE", color: "#5B21B6" }}
                              title={`${Number(p.pedras_ct_total).toFixed(3).replace(".", ",")} ct · ${(Number(p.pedras_ct_total) * 100).toFixed(1).replace(".", ",")} pt`}
                            >
                              💎 {Number(p.pedras_ct_total).toFixed(3).replace(".", ",")}ct
                            </span>
                          ) : p.tem_pedra_preciosa ? (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ backgroundColor: "#EDE9FE", color: "#5B21B6" }}
                              title="Tem pedra preciosa"
                            >
                              💎
                            </span>
                          ) : null}
                          {isPai && <VariacoesBadge n={p.qtd_variacoes} />}
                          {isChild && p.numeracao && (
                            <span className="text-[10px] text-blue-500 font-mono">nº{p.numeracao}</span>
                          )}
                          {podeEditar && (p.pendencias?.length ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
                              title={p.pendencias!.map((t) => t.replace("_", " ")).join(", ")}
                            >
                              ⚠ {p.pendencias!.length}
                            </span>
                          )}
                          {p.tipo_item === "insumo" && (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{ backgroundColor: "#DBEAFE", color: "#1E40AF" }}
                              title="Insumo"
                            >
                              INSUMO
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Coluna Pedras */}
                      <td className="px-3 py-2.5">
                        {Number(p.pedras_ct_total ?? 0) > 0 && p.pedras_nome_principal ? (
                          <span className="text-[11px] font-medium" style={{ color: "#184036" }}>
                            {p.pedras_qtd_total}× {p.pedras_nome_principal}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {(() => {
                        // Pedras: colunas Metal e Preço Sync ficam em branco; Peso em ct + pontos;
                        // a coluna "Preço Sync" passa a exibir preco_tiny (preço de venda cadastrado).
                        const isPedra = (p.categoria ?? "").toLowerCase().startsWith("pedras");
                        const pesoG = parseFloat(p.peso_precificado ?? "0") || 0;
                        // Para pedras, peso_ct é a fonte de verdade (peso_precificado é
                        // arredondado pelo trigger arredondar_peso_para_cima). Fallback: pesoG/0.2.
                        const ctFromExtras = p.peso_ct != null ? Number(p.peso_ct) : NaN;
                        const ct = isPedra && Number.isFinite(ctFromExtras) && ctFromExtras > 0
                          ? ctFromExtras
                          : pesoG / 0.2;
                        const pontos = ct * 100;

                        return (
                          <>
                            {/* Metal */}
                            <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                              {isPedra ? <span className="text-gray-300">—</span> : (p.tipo_metal || "—")}
                            </td>

                            {/* Peso — em ct + pontos para pedras, em g para joias */}
                            <td className="px-3 py-2.5 font-mono text-xs text-gray-600 whitespace-nowrap">
                              {isPedra
                                ? (ct > 0
                                    ? <span>{ct.toFixed(2).replace(".", ",")} ct <span className="text-gray-400">· {pontos.toFixed(1).replace(".", ",")} pt</span></span>
                                    : "—")
                                : `${formatPeso(p.peso_precificado)}g`}
                            </td>

                            {/* Situação */}
                            <td className="px-3 py-2.5">
                              <SituacaoBadge situacao={p.situacao} />
                            </td>

                            {/* Estoque */}
                            <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                              {p.controla_estoque === false ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ backgroundColor: "#E5E7EB", color: "#4B5563" }}>
                                  Não controla estoque
                                </span>
                              ) : (p.saldo_estoque ?? 0) > 0 ? (
                                <span className="text-emerald-700 font-semibold">{p.saldo_estoque}</span>
                              ) : (
                                <span className="text-gray-300">0</span>
                              )}
                            </td>

                            {/* Preço Venda — calculado exclusivamente pela curva dinâmica.
                                Promo: preco_vigente sobrescreve quando em_promocao=true */}
                            <td className="px-3 py-2.5 font-mono text-xs whitespace-nowrap">
                              {(() => {
                                // preco_curva já vem da view com ouro + pedras — não somar novamente
                                const precoLista = p.preco_curva != null
                                  ? String(Number(p.preco_curva))
                                  : null;
                                const emPromo = !!p.em_promocao;
                                const precoPromo = p.preco_vigente != null ? String(p.preco_vigente) : null;
                                if (emPromo && precoPromo != null && parseFloat(precoPromo) > 0 && precoLista != null) {
                                  return (
                                    <span className="inline-flex items-center gap-1.5">
                                      <s className="text-gray-400 font-normal">{formatPreco(precoLista)}</s>
                                      <span className="font-bold" style={{ color: "#047857" }}>{formatPreco(precoPromo)}</span>
                                      <BadgePromo campanha={p.nome_campanha} />
                                    </span>
                                  );
                                }
                                if (precoLista != null && parseFloat(precoLista) > 0) {
                                  return (
                                    <span className="font-semibold" style={{ color: "#184036" }}>
                                      {formatPreco(precoLista)}
                                    </span>
                                  );
                                } else if (p.preco_filhos_min != null && p.preco_filhos_min > 0) {
                                  return (
                                    <span className="text-gray-700" title="Preço mínimo das variações (produto pai)">
                                      {formatPreco(String(p.preco_filhos_min))}
                                      <sup className="ml-0.5 text-[8px] font-bold">V</sup>
                                    </span>
                                  );
                                }
                                // Personalizado (PZ): preço é por letra, fecha na venda.
                                // Sem isto a coluna fica vazia e parece cadastro incompleto.
                                const porLetra = p.preco_por_letra != null ? Number(p.preco_por_letra) : null;
                                if (porLetra != null && porLetra > 0) {
                                  return (
                                    <span className="text-gray-700" title="Produto personalizado — o total fecha na venda, conforme a quantidade de letras">
                                      {formatPreco(String(porLetra))}
                                      <span className="ml-1 text-[10px] font-normal text-gray-500">por letra</span>
                                    </span>
                                  );
                                }
                                return <span className="text-gray-400">—</span>;
                              })()}
                            </td>
                          </>
                        );
                      })()}
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

      {/* Barra de ações de seleção (fixa no rodapé quando há seleção) */}
      {selecionados.size > 0 && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-full shadow-lg border"
          style={{ backgroundColor: C.esmeralda, borderColor: C.esmeralda }}
        >
          <span className="text-sm text-white font-medium">
            {selecionados.size} selecionado(s)
          </span>
          <button
            onClick={() => setShowBulkEdit(true)}
            className="px-3 py-1 rounded-md bg-white text-[#184036] text-xs font-semibold hover:bg-gray-100 transition-colors"
          >
            Editar em massa
          </button>
          <button
            onClick={limparSelecao}
            className="px-3 py-1 rounded-md bg-transparent border border-white/30 text-white text-xs hover:bg-white/10 transition-colors"
          >
            Limpar
          </button>
        </div>
      )}

      {/* Modal edição em massa */}
      <BulkEditModal
        open={showBulkEdit}
        ids={Array.from(selecionados)}
        onClose={() => setShowBulkEdit(false)}
        onSaved={(n) => {
          setShowBulkEdit(false);
          limparSelecao();
          fetchProdutos();
          bumpRefresh();
          alert(`${n} produto(s) atualizado(s) com sucesso.`);
        }}
      />

      {/* Drawer */}
      <ProdutoDrawer
        produtoId={selectedId}
        onClose={() => setSelectedId(null)}
        onSaved={() => { fetchProdutos(); bumpRefresh(); }}
        podeEditar={podeEditar}
        camposVisiveis={camposVisiveis}
      />

      {/* Modal de Cadastro */}
      <CadastroProdutoModal
        open={showCadastro}
        onClose={() => setShowCadastro(false)}
        onCreated={(produtoId, _sku) => {
          setShowCadastro(false);
          fetchProdutos();
          bumpRefresh();
          setSelectedId(produtoId);
        }}
      />

      {showPersonalizado && (
        <ModalPersonalizacao onClose={() => setShowPersonalizado(false)} />
      )}

      {showPecaAvulsa && (
        <CadastrarPecaAvulsaModal
          onClose={() => setShowPecaAvulsa(false)}
          onSuccess={() => { fetchProdutos(); bumpRefresh(); }}
        />
      )}
    </div>
  );
}
