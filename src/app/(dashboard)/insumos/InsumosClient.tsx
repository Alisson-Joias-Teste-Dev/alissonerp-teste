"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, FlaskConical, Search, X, Loader2, AlertCircle, ChevronDown, Package } from "lucide-react";
import { formatPeso, formatPesoCt, gramasToCt } from "@/lib/formatters";
import InsumoEditDrawer from "@/components/insumos/InsumoEditDrawer";
import { normalizeImageUrl } from "@/lib/storage-url";

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaldoPoteRow {
  categoria_id: number;
  categoria_nome: string;
  saldo_total: number;
  unidade: string;
  total_insumos: number;
}

interface InsumoRow {
  insumo_id: number;
  insumo_nome: string;
  sku: string | null;
  unidade: string;
  estoque_minimo: number;
  estoque_maximo: number;
  custo_compra: number;
  ativo: boolean;
  categoria_id: number;
  categoria_nome: string;
  saldo_real: number;
  // novos campos opcionais que podem vir da view
  foto?: string | null;
  fornecedor_id?: number | null;
  peso_pedra?: number | null;
  observacao?: string | null;
  created_at?: string | null;
  saldo_ct?: number | null;
  quantidade?: number | null;
}

interface CategoriaRow {
  categoria_id: number;
  categoria_nome: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined, decimals = 2) {
  if (n == null) return "—";
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCusto(n: number | null | undefined) {
  if (n == null || n === 0) return "—";
  return `R$ ${fmtNum(n, 2)}`;
}

function saldoColor(saldo: number, min: number) {
  if (saldo <= 0) return "#DC2626";
  if (min > 0 && saldo < min) return "#D97706";
  return "#059669";
}

// Converte InsumoRow para o formato esperado pelo InsumoEditDrawer
function insumoRowToDrawer(i: InsumoRow) {
  return {
    id: i.insumo_id,
    nome: i.insumo_nome,
    sku: i.sku,
    categoria_id: i.categoria_id,
    unidade: i.unidade,
    estoque_minimo: i.estoque_minimo,
    estoque_maximo: i.estoque_maximo,
    custo_compra: i.custo_compra,
    ativo: i.ativo,
    saldo_real: i.saldo_real,
    foto: i.foto,
    fornecedor_id: i.fornecedor_id,
    peso_pedra: i.peso_pedra,
    observacao: i.observacao,
    created_at: i.created_at,
  };
}

// ─── NovoInsumoModal ──────────────────────────────────────────────────────────

interface ModalProps {
  categorias: CategoriaRow[];
  onSuccess: () => void;
  onClose: () => void;
}

const UNIDADES = ["g", "UN", "ml", "pç", "kg", "cm", "m"];

function NovoInsumoModal({ categorias, onSuccess, onClose }: ModalProps) {
  const [nome, setNome] = useState("");
  const [sku, setSku] = useState("");
  const [categoriaId, setCategoriaId] = useState<number | "">(categorias[0]?.categoria_id ?? "");
  const [unidade, setUnidade] = useState("g");
  const [estoqueMin, setEstoqueMin] = useState("");
  const [estoqueMax, setEstoqueMax] = useState("");
  const [custo, setCusto] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !categoriaId) { setError("Nome e categoria são obrigatórios."); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/insumos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          sku: sku.trim() || undefined,
          categoria_id: Number(categoriaId),
          unidade,
          estoque_minimo: estoqueMin ? Number(estoqueMin) : 0,
          estoque_maximo: estoqueMax ? Number(estoqueMax) : 0,
          custo_compra: custo ? Number(custo) : 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro ao criar insumo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-md md:mx-4 md:max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>Novo Insumo</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100">
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-4">
            {/* Nome */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                Nome <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Ouro 18k Amarelo"
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none focus:ring-1"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>

            {/* Categoria + Unidade */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                  Categoria <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <div className="relative">
                  <select
                    value={categoriaId}
                    onChange={(e) => setCategoriaId(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none appearance-none"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    <option value="">Selecionar</option>
                    {categorias.map((c) => (
                      <option key={c.categoria_id} value={c.categoria_id}>{c.categoria_nome}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>
                  Unidade
                </label>
                <div className="relative">
                  <select
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm border outline-none appearance-none"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#9CA3AF" }} />
                </div>
              </div>
            </div>

            {/* SKU */}
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>SKU</label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ex: AJ-001"
                className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                style={{ borderColor: C.cremeBorder }}
              />
            </div>

            {/* Estoque Min/Max + Custo */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>Est. Mín</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={estoqueMin}
                  onChange={(e) => setEstoqueMin(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>Est. Máx</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={estoqueMax}
                  onChange={(e) => setEstoqueMax(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#9CA3AF" }}>Custo (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={custo}
                  onChange={(e) => setCusto(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm border outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]" style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
                <AlertCircle size={14} className="shrink-0" />{error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t" style={{ borderColor: C.cremeBorder }}>
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px]" style={{ color: "#6B7280" }}>Cancelar</button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda, color: C.creme }}
            >
              {loading ? <><Loader2 size={14} className="animate-spin" />Salvando...</> : "Criar Insumo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Sort types ───────────────────────────────────────────────────────────────

type SortField = 'insumo_nome' | 'sku' | 'categoria_nome' | 'unidade' | 'saldo_real' | 'estoque_minimo' | 'custo_compra' | 'ativo';
type SortDir = 'asc' | 'desc';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function InsumosClient() {
  const [pote, setPote] = useState<SaldoPoteRow[]>([]);
  const [insumos, setInsumos] = useState<InsumoRow[]>([]);
  const [categorias, setCategorias] = useState<CategoriaRow[]>([]);
  const [catFiltro, setCatFiltro] = useState<number | null>(null);
  const [busca, setBusca] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>('insumo_nome');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // drawerInsumo: undefined = fechado | null = novo | InsumoRow = editar
  const [drawerInsumo, setDrawerInsumo] = useState<InsumoRow | null | undefined>(undefined);

  const fetchAll = useCallback(async () => {
    setLoadingData(true);
    try {
      const [poteRes, insumosRes, catRes] = await Promise.all([
        fetch("/api/insumos/pote").then((r) => r.json()),
        fetch("/api/insumos").then((r) => r.json()),
        fetch("/api/insumos/categorias").then((r) => r.json()),
      ]);
      setPote(Array.isArray(poteRes) ? poteRes : []);
      setInsumos(Array.isArray(insumosRes) ? insumosRes : []);
      setCategorias(Array.isArray(catRes) ? catRes : []);
    } catch {
      // silently keep old data
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleDesativar(id: number, nome: string) {
    if (!confirm(`Desativar "${nome}"?`)) return;
    await fetch(`/api/insumos/${id}`, { method: "DELETE" });
    fetchAll();
  }

  // Filtro
  const insumosFiltrados = insumos.filter((i) => {
    if (!i.ativo) return false;
    if (catFiltro !== null && i.categoria_id !== catFiltro) return false;
    if (busca) {
      const q = busca.toLowerCase();
      return i.insumo_nome.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  // Converter categorias para formato do drawer
  const categoriasDrawer = categorias.map((c) => ({
    id: c.categoria_id,
    nome: c.categoria_nome,
  }));

  // Ordenação
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedData = [...insumosFiltrados].sort((a, b) => {
    let valA: unknown = a[sortField as keyof typeof a];
    let valB: unknown = b[sortField as keyof typeof b];

    if (valA == null) valA = '';
    if (valB == null) valB = '';

    if (['saldo_real', 'estoque_minimo', 'custo_compra'].includes(sortField)) {
      const numA = parseFloat(String(valA)) || 0;
      const numB = parseFloat(String(valB)) || 0;
      return sortDir === 'asc' ? numA - numB : numB - numA;
    }

    const strA = String(valA).toLowerCase();
    const strB = String(valB).toLowerCase();
    return sortDir === 'asc'
      ? strA.localeCompare(strB, 'pt-BR')
      : strB.localeCompare(strA, 'pt-BR');
  });

  const SortableHeader = ({ label, field }: { label: string; field: SortField }) => {
    const isActive = sortField === field;
    return (
      <th
        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider cursor-pointer hover:text-gray-700 hover:bg-gray-50 select-none transition-colors"
        style={{ color: isActive ? "#374151" : "#9CA3AF" }}
        onClick={() => handleSort(field)}
      >
        <div className="flex items-center gap-1">
          {label}
          <span className={`text-[10px] ${isActive ? 'text-gray-700' : 'text-gray-300'}`}>
            {isActive ? (sortDir === 'asc' ? '▲' : '▼') : '▲▼'}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="px-3 md:px-6 py-4 md:py-8">
      {/* Header */}
      <div className="mb-4 md:mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
            Insumos
          </h2>
          <p className="text-sm mt-1" style={{ color: "#6B7280" }}>Saldo do Pote · Matérias-primas</p>
        </div>
        <button
          onClick={() => setDrawerInsumo(null)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          <Plus size={15} /> Novo Insumo
        </button>
      </div>

      {/* Saldo do Pote — cards */}
      {pote.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {pote.map((p) => (
            <div
              key={p.categoria_id}
              className="rounded-xl p-4 border cursor-pointer transition-all"
              style={{
                borderColor: catFiltro === p.categoria_id ? C.esmeralda : C.cremeBorder,
                backgroundColor: catFiltro === p.categoria_id ? "#F0F7F4" : "white",
              }}
              onClick={() => setCatFiltro(catFiltro === p.categoria_id ? null : p.categoria_id)}
            >
              <div className="flex items-center gap-2 mb-2">
                <FlaskConical size={14} style={{ color: catFiltro === p.categoria_id ? C.esmeralda : "#9CA3AF" }} />
                <span className="text-[11px] font-semibold uppercase tracking-wider truncate" style={{ color: "#9CA3AF" }}>
                  {p.categoria_nome}
                </span>
              </div>
              <p className="text-xl font-bold font-mono" style={{ color: C.esmeralda }}>
                {fmtNum(p.saldo_total, 2)}
                <span className="text-xs font-medium ml-1" style={{ color: "#80A795" }}>{p.unidade}</span>
              </p>
              <p className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>{p.total_insumos} insumo(s)</p>
            </div>
          ))}
        </div>
      )}

      {/* Barra de filtro + busca */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar insumo ou SKU..."
            className="w-full pl-8 pr-3 py-2 rounded-lg text-sm border outline-none"
            style={{ borderColor: C.cremeBorder }}
          />
        </div>
        {catFiltro !== null && (
          <button
            onClick={() => setCatFiltro(null)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12px] font-medium"
            style={{ backgroundColor: "#EEF2FF", color: "#4338CA" }}
          >
            {categorias.find((c) => c.categoria_id === catFiltro)?.categoria_nome ?? "Filtro"}
            <X size={12} />
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: C.cremeBg, borderBottom: `1px solid ${C.cremeBorder}` }}>
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}></th>
              <SortableHeader label="Insumo" field="insumo_nome" />
              <SortableHeader label="SKU" field="sku" />
              <SortableHeader label="Categoria" field="categoria_nome" />
              <SortableHeader label="Und." field="unidade" />
              <SortableHeader label="Saldo Real" field="saldo_real" />
              <SortableHeader label="Est. Mín" field="estoque_minimo" />
              <SortableHeader label="Custo" field="custo_compra" />
              <SortableHeader label="Status" field="ativo" />
              <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}></th>
            </tr>
          </thead>
          <tbody>
            {loadingData && (
              <tr>
                <td colSpan={10} className="text-center py-12">
                  <Loader2 size={18} className="animate-spin inline" style={{ color: "#9CA3AF" }} />
                </td>
              </tr>
            )}
            {!loadingData && insumosFiltrados.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-12 text-sm" style={{ color: "#9CA3AF" }}>
                  {busca || catFiltro !== null ? "Nenhum resultado" : "Nenhum insumo cadastrado"}
                </td>
              </tr>
            )}
            {!loadingData && sortedData.map((insumo, i) => {
              const color = saldoColor(insumo.saldo_real, insumo.estoque_minimo);
              return (
                <tr
                  key={insumo.insumo_id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  style={{ borderTop: i > 0 ? `1px solid ${C.cremeBorder}` : undefined }}
                  onClick={() => setDrawerInsumo(insumo)}
                >
                  {/* Thumbnail foto */}
                  <td className="px-3 py-2.5 w-10">
                    <div
                      className="w-8 h-8 rounded-lg border overflow-hidden flex items-center justify-center shrink-0"
                      style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}
                    >
                      {insumo.foto ? (
                        <img
                          src={normalizeImageUrl(insumo.foto)}
                          alt={insumo.insumo_nome}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Package size={14} style={{ color: "#D1D5DB" }} />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: "#111827" }}>{insumo.insumo_nome}</td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#9CA3AF" }}>{insumo.sku ?? "—"}</td>
                  <td className="px-4 py-3 text-[12px]" style={{ color: "#6B7280" }}>{insumo.categoria_nome}</td>
                  <td className="px-4 py-3 text-center text-[12px]" style={{ color: "#6B7280" }}>
                    {insumo.categoria_id === 2 ? 'ct' : (insumo.unidade || 'g')}
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-[13px]" style={{ color }}>
                    {insumo.categoria_id === 2
                      ? <>
                          <span className="font-medium text-emerald-700">{formatPesoCt(insumo.saldo_ct != null ? insumo.saldo_ct : gramasToCt(parseFloat(String(insumo.saldo_real)) || 0))}</span>
                          {insumo.quantidade != null && (
                            <span className="block text-[10px] font-normal" style={{ color: "#6B7280" }}>
                              {Number(insumo.quantidade).toLocaleString("pt-BR")} pedras · {parseFloat(String(insumo.saldo_real)).toFixed(3)}g
                            </span>
                          )}
                        </>
                      : <>{formatPeso(insumo.saldo_real)} <span className="text-[10px] font-normal" style={{ color: "#9CA3AF" }}>g</span></>
                    }
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#6B7280" }}>
                    {insumo.categoria_id === 2
                      ? (insumo.estoque_minimo && parseFloat(String(insumo.estoque_minimo)) > 0
                          ? `${gramasToCt(parseFloat(String(insumo.estoque_minimo))).toFixed(4)} ct`
                          : '—')
                      : (insumo.estoque_minimo && parseFloat(String(insumo.estoque_minimo)) > 0
                          ? <>{parseFloat(String(insumo.estoque_minimo)).toFixed(2)} <span className="text-gray-400 text-xs">g</span></>
                          : '—')
                    }
                  </td>
                  <td className="px-4 py-3 font-mono text-[12px]" style={{ color: "#6B7280" }}>{fmtCusto(insumo.custo_compra)}</td>
                  {/* Badge ativo */}
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                      style={{
                        backgroundColor: insumo.ativo ? "#DCFCE7" : "#FEE2E2",
                        color: insumo.ativo ? "#15803D" : "#DC2626",
                      }}
                    >
                      {insumo.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleDesativar(insumo.insumo_id, insumo.insumo_nome)}
                      className="text-[11px] px-2.5 py-1 rounded hover:opacity-80"
                      style={{ color: "#9CA3AF" }}
                    >
                      Desativar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal legado (mantido para compatibilidade) */}
      {modalOpen && (
        <NovoInsumoModal
          categorias={categorias}
          onClose={() => setModalOpen(false)}
          onSuccess={() => { setModalOpen(false); fetchAll(); }}
        />
      )}

      {/* Drawer de edição/criação */}
      {drawerInsumo !== undefined && (
        <InsumoEditDrawer
          insumo={drawerInsumo !== null ? insumoRowToDrawer(drawerInsumo) : null}
          categorias={categoriasDrawer}
          onClose={() => setDrawerInsumo(undefined)}
          onSaved={() => {
            setDrawerInsumo(undefined);
            fetchAll();
          }}
        />
      )}
    </div>
  );
}
