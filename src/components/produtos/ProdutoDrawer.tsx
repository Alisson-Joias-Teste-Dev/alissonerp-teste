"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Save,
  Loader2,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Search,
  GitFork,
  ChevronRight,
} from "lucide-react";
import { formatPeso } from "@/lib/formatters";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProdutoDetalhe {
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
  descricao: string | null;
  referencia: string | null;
  categoria: string | null;
  categoria_geral: string | null;
  sub_categoria: string | null;
  markup: string | null;
  fator: string | null;
  tipo_item: "joia" | "insumo" | null;
  // erp_produtos
  erp_id?: number | null;
  eh_pai?: boolean | null;
  eh_variacao?: boolean | null;
  parent_sku?: string | null;
  qtd_variacoes?: number;
  numeracao?: string | null;
  cor_metal?: string | null;
  observacao_erp?: string | null;
  largura_aro?: string | null;
  altura_aro?: string | null;
  base?: string | null;
}

interface Variacao {
  erp_id: number;
  produto_id: number;
  sku: string;
  nome: string;
  sufixo_variacao: string | null;
  numeracao: string | null;
  peso_precificado: string | null;
  preco_sync: string | null;
  situacao: string | null;
}

interface BomItem {
  id: number;
  insumo_id: number;
  insumo_nome: string | null;
  insumo_unidade: string | null;
  tipo: "metal" | "pedra" | "outro";
  quantidade: string | null;
  tamanho: string | null;
  unidade_tamanho: string | null;
  preco_compra_usd: string | null;
  obrigatorio: boolean;
  observacao: string | null;
}

interface InsumoOption {
  id: number;
  descricao: string;
  unidade: string;
  categoria_id: number;
  peso_pedra?: number | null;
  ultimo_preco_compra_usd?: string | number | null;
  data_ultimo_preco?: string | null;
}

interface Props {
  produtoId: number | null;
  onClose: () => void;
  onSaved?: () => void;
}

// ─── Design constants ─────────────────────────────────────────────────────────

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  bg: "#FAFAF7",
};

const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036] transition-colors";
const labelCls =
  "block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1";
const sectionTitleCls =
  "text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2";

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatPreco(val: string | null | undefined): string {
  if (!val) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function DeltaBadge({ pct }: { pct: string | null | undefined }) {
  if (!pct) return <span className="text-gray-400 font-mono text-sm">—</span>;
  const n = parseFloat(pct);
  if (isNaN(n)) return <span className="text-gray-400 font-mono text-sm">—</span>;
  if (Math.abs(n) < 0.01)
    return <span className="text-gray-400 font-mono text-sm">= 0%</span>;
  const sign = n > 0 ? "+" : "";
  const cls = n > 0 ? "text-red-600" : "text-green-600";
  return (
    <span className={`font-mono text-sm font-semibold ${cls}`}>
      {sign}{n.toFixed(2)}%
    </span>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    metal: { bg: "#FEF3C7", color: "#92400E", label: "Metal" },
    pedra: { bg: "#EDE9FE", color: "#5B21B6", label: "Pedra" },
    outro: { bg: "#F3F4F6", color: "#4B5563", label: "Outro" },
  };
  const s = map[tipo] ?? map.outro;
  return (
    <span
      className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ─── BOM Add/Edit row form ────────────────────────────────────────────────────

interface BomRowFormProps {
  produtoId: number;
  item?: BomItem | null;
  insumos: InsumoOption[];
  onSaved: () => void;
  onCancel: () => void;
}

function BomRowForm({ produtoId, item, insumos, onSaved, onCancel }: BomRowFormProps) {
  const [insumoId, setInsumoId] = useState(item ? String(item.insumo_id) : "");
  const [tipo, setTipo] = useState<"metal" | "pedra" | "outro">(item?.tipo ?? "outro");
  const [quantidade, setQuantidade] = useState(item?.quantidade ?? "");
  const [tamanho, setTamanho] = useState(item?.tamanho ?? "");
  const [observacao, setObservacao] = useState(item?.observacao ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Combobox state
  const [busca, setBusca] = useState("");
  const [comboOpen, setComboOpen] = useState(false);

  // Unidade por categoria (cat 1 = Metal/Ouro → g, cat 2 = Pedras → un)
  function getUnidade(cat_id: number, unidade: string | null): string {
    if (cat_id === 1) return "g";
    if (cat_id === 2) return "un";
    return unidade || "un";
  }

  // Insumos filtrados por tipo + busca, sem nomes vazios
  const insumosFiltrados = insumos.filter((i) => {
    if (!i.descricao?.trim()) return false;
    if (tipo === "metal" && i.categoria_id !== 1) return false;
    if (tipo === "pedra" && i.categoria_id !== 2) return false;
    if (tipo === "outro" && (i.categoria_id === 1 || i.categoria_id === 2)) return false;
    if (busca) {
      const q = busca.toLowerCase();
      if (!i.descricao.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Selecionar insumo no combobox
  function selectInsumo(insumo: InsumoOption) {
    setInsumoId(String(insumo.id));
    setBusca(`${insumo.descricao} (${getUnidade(insumo.categoria_id, insumo.unidade)})`);
    setComboOpen(false);
  }

  // Mudar tipo — resetar insumo se não pertence à nova categoria
  function handleTipoChange(newTipo: "metal" | "pedra" | "outro") {
    setTipo(newTipo);
    if (insumoId) {
      const insumo = insumos.find((i) => String(i.id) === insumoId);
      if (insumo) {
        const valido =
          (newTipo === "metal" && insumo.categoria_id === 1) ||
          (newTipo === "pedra" && insumo.categoria_id === 2) ||
          (newTipo === "outro" && insumo.categoria_id !== 1 && insumo.categoria_id !== 2);
        if (!valido) {
          setInsumoId("");
          setBusca("");
        }
      }
    }
  }

  async function handleSave() {
    if (!insumoId || !quantidade) {
      setErr("Insumo e quantidade são obrigatórios");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      if (item) {
        // PATCH existing
        const res = await fetch(
          `/api/produtos/${produtoId}/composicao/${item.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              quantidade: parseFloat(quantidade),
              tamanho: tamanho ? parseFloat(tamanho) : null,
              observacao: observacao || null,
            }),
          }
        );
        if (!res.ok) {
          const b = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(b.error ?? "Erro ao atualizar item");
        }
      } else {
        // POST new
        const res = await fetch(`/api/produtos/${produtoId}/composicao`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            insumo_id: parseInt(insumoId),
            tipo,
            quantidade: parseFloat(quantidade),
            tamanho: tamanho ? parseFloat(tamanho) : null,
            observacao: observacao || null,
          }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(b.error ?? "Erro ao adicionar item");
        }
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setSaving(false);
    }
  }

  const selectCls =
    "w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-[#184036] transition-colors";

  return (
    <div className="border border-[#184036]/20 rounded-lg p-3 bg-[#FAFAF7] space-y-3">
      {err && (
        <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 rounded px-2 py-1.5">
          <AlertCircle size={12} />
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {/* Insumo — combobox com busca e filtro por tipo */}
        <div>
          <label className={labelCls}>Insumo</label>
          {item ? (
            <div className="px-3 py-2 border border-gray-100 rounded-lg text-sm text-gray-500 bg-gray-50">
              {item.insumo_nome ?? "—"}
            </div>
          ) : (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setComboOpen(true);
                  if (!e.target.value) setInsumoId("");
                }}
                onFocus={() => setComboOpen(true)}
                onBlur={() => setTimeout(() => setComboOpen(false), 150)}
                placeholder="Buscar insumo..."
                className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm text-gray-700 bg-white focus:outline-none focus:border-[#184036] transition-colors"
              />
              {comboOpen && insumosFiltrados.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 max-h-48 overflow-y-auto">
                  {insumosFiltrados.slice(0, 50).map((i) => (
                    <button
                      key={i.id}
                      type="button"
                      onMouseDown={() => selectInsumo(i)}
                      className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors first:rounded-t-lg last:rounded-b-lg"
                    >
                      <span className="font-medium">{i.descricao}</span>
                      <span className="text-gray-400 ml-1">({getUnidade(i.categoria_id, i.unidade)})</span>
                    </button>
                  ))}
                  {insumosFiltrados.length > 50 && (
                    <p className="px-3 py-1.5 text-xs text-gray-400 border-t">
                      +{insumosFiltrados.length - 50} resultados — refine a busca
                    </p>
                  )}
                </div>
              )}
              {comboOpen && busca.length > 1 && insumosFiltrados.length === 0 && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-0.5 px-3 py-2 text-sm text-gray-400">
                  Nenhum insumo encontrado
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tipo */}
        <div>
          <label className={labelCls}>Tipo</label>
          {item ? (
            <div className="px-3 py-2 border border-gray-100 rounded-lg text-sm text-gray-500 bg-gray-50 capitalize">
              {item.tipo}
            </div>
          ) : (
            <select
              value={tipo}
              onChange={(e) => handleTipoChange(e.target.value as "metal" | "pedra" | "outro")}
              className={selectCls}
            >
              <option value="metal">Metal</option>
              <option value="pedra">Pedra</option>
              <option value="outro">Outro</option>
            </select>
          )}
        </div>
      </div>

      {/* ── Campos METAL ─────────────────────────────────────────── */}
      {(tipo === "metal" || item?.tipo === "metal") && (
        <div>
          <label className={labelCls}>Peso (g)</label>
          <input type="number" step="any" min="0" value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className={inputCls} placeholder="0.000" />
        </div>
      )}

      {/* ── Campos PEDRA ─────────────────────────────────────────── */}
      {(tipo === "pedra" || item?.tipo === "pedra") && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Quantidade (un)</label>
              <input type="number" step="1" min="0" value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                className={inputCls} placeholder="0" />
            </div>
            <div>
              <label className={labelCls}>Tamanho (ct)</label>
              <input type="number" step="any" min="0" value={tamanho}
                onChange={(e) => setTamanho(e.target.value)}
                className={inputCls} placeholder="Ex: 0.05" />
            </div>
          </div>
        </>
      )}

      {/* ── Campos OUTRO ─────────────────────────────────────────── */}
      {(tipo === "outro" || item?.tipo === "outro") && (
        <div>
          <label className={labelCls}>Peso (g)</label>
          <input type="number" step="0.01" min="0" value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className={inputCls} placeholder="0.00" />
        </div>
      )}

      {/* ── Observação (todos) ───────────────────────────────────── */}
      <div>
        <label className={labelCls}>Observação</label>
        <input type="text" value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className={inputCls} placeholder="Opcional" />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors disabled:opacity-60"
          style={{ backgroundColor: C.esmeralda }}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {item ? "Atualizar" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export default function ProdutoDrawer({ produtoId, onClose, onSaved }: Props) {
  const aberto = produtoId !== null;

  const [produto, setProduto] = useState<ProdutoDetalhe | null>(null);
  const [composicao, setComposicao] = useState<BomItem[]>([]);
  const [insumos, setInsumos] = useState<InsumoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [temPedra, setTemPedra] = useState(false);
  const [observacaoErp, setObservacaoErp] = useState("");
  const [larguraAro, setLarguraAro] = useState("");
  const [alturaAro, setAlturaAro] = useState("");
  const [baseVal, setBaseVal] = useState("");
  const [nomeEdit, setNomeEdit] = useState("");
  const [tipoMetalEdit, setTipoMetalEdit] = useState("");
  const [categoriaEdit, setCategoriaEdit] = useState("");
  const [situacaoEdit, setSituacaoEdit] = useState("A");
  const [pesoEdit, setPesoEdit] = useState("");
  const [markupEdit, setMarkupEdit] = useState("");
  const [fatorEdit, setFatorEdit] = useState("");
  const [catPrecEdit, setCatPrecEdit] = useState("");
  const [precoTinyEdit, setPrecoTinyEdit] = useState("");
  const [tipoItemEdit, setTipoItemEdit] = useState<"" | "joia" | "insumo">("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  // Variações (quando eh_pai)
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);

  // Propagação modal
  const [showPropagar, setShowPropagar] = useState(false);
  const [propagando, setPropagando] = useState(false);
  const [propagarMsg, setPropagarMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  // BOM editing
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<BomItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Load product details
  const loadProduto = useCallback(async () => {
    if (!produtoId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/produtos/${produtoId}`);
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Erro ao carregar produto");
      }
      const data = await res.json() as { produto: ProdutoDetalhe; composicao: BomItem[]; variacoes: Variacao[] };
      setProduto(data.produto);
      setComposicao(data.composicao);
      setVariacoes(data.variacoes ?? []);
      setTemPedra(data.produto.tem_pedra_preciosa);
      setObservacaoErp(data.produto.observacao_erp ?? "");
      setLarguraAro(data.produto.largura_aro ?? "");
      setAlturaAro(data.produto.altura_aro ?? "");
      setBaseVal(data.produto.base ?? "");
      setNomeEdit(data.produto.nome ?? "");
      setTipoMetalEdit(data.produto.tipo_metal ?? "");
      setCategoriaEdit(data.produto.categoria_geral ?? "");
      setSituacaoEdit(data.produto.situacao ?? "A");
      setPesoEdit(data.produto.peso_precificado ?? "");
      setMarkupEdit(data.produto.markup ?? "");
      setFatorEdit(data.produto.fator ?? "");
      setCatPrecEdit(data.produto.categoria ?? "");
      setPrecoTinyEdit(data.produto.preco_tiny ?? "");
      setTipoItemEdit(data.produto.tipo_item ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [produtoId]);

  // Load insumos list for BOM form
  useEffect(() => {
    if (!aberto) return;
    async function loadInsumos() {
      try {
        const res = await fetch("/api/produtos/insumos");
        if (!res.ok) return;
        const data = await res.json() as { insumos: InsumoOption[] };
        setInsumos(data.insumos ?? []);
      } catch {
        // non-critical
      }
    }
    loadInsumos();
  }, [aberto]);

  useEffect(() => {
    if (produtoId) {
      loadProduto();
      setShowAddForm(false);
      setEditingItem(null);
    } else {
      setProduto(null);
      setComposicao([]);
      setVariacoes([]);
      setShowPropagar(false);
      setPropagarMsg(null);
      setError(null);
    }
  }, [produtoId, loadProduto]);

  // ESC to close
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (aberto) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [aberto, onClose]);

  async function handleSave() {
    if (!produto) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: Record<string, unknown> = {};
      if (temPedra !== produto.tem_pedra_preciosa) body.tem_pedra_preciosa = temPedra;
      const obs = observacaoErp.trim() || null;
      const obsOriginal = produto.observacao_erp?.trim() || null;
      if (obs !== obsOriginal) body.observacao_erp = obs;
      const larg = larguraAro ? parseFloat(larguraAro) : null;
      const alt  = alturaAro  ? parseFloat(alturaAro)  : null;
      const bas  = baseVal    ? parseFloat(baseVal)     : null;
      if (larg !== (produto.largura_aro ? parseFloat(produto.largura_aro) : null)) body.largura_aro = larg;
      if (alt  !== (produto.altura_aro  ? parseFloat(produto.altura_aro)  : null)) body.altura_aro  = alt;
      if (bas  !== (produto.base        ? parseFloat(produto.base)        : null)) body.base        = bas;

      if (nomeEdit.trim() !== (produto.nome ?? "").trim()) body.nome = nomeEdit.trim();
      if ((tipoMetalEdit || "") !== (produto.tipo_metal ?? "")) body.tipo_metal = tipoMetalEdit || null;
      if ((categoriaEdit || "") !== (produto.categoria_geral ?? "")) body.categoria_geral = categoriaEdit || null;
      if (situacaoEdit !== (produto.situacao ?? "A")) body.situacao = situacaoEdit;

      // Precificação — aceita formato brasileiro:
      //   "4.500"     → 4500  (ponto como milhar)
      //   "4.500,50"  → 4500.5
      //   "4500,50"   → 4500.5
      //   "4.5"       → 4.5   (sem 3 dígitos após o ponto = decimal)
      //   "4500"      → 4500
      const parseNum = (v: string) => {
        let t = v.trim();
        if (!t) return null;
        if (t.includes(",")) {
          // Vírgula = decimal BR. Remover todos os pontos (milhar) e trocar vírgula por ponto.
          t = t.replace(/\./g, "").replace(",", ".");
        } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
          // Só pontos com grupos de 3 dígitos (ex: 4.500 ou 1.234.567) = milhar BR.
          t = t.replace(/\./g, "");
        }
        const n = parseFloat(t);
        return isNaN(n) ? null : n;
      };
      if ((pesoEdit || "") !== (produto.peso_precificado ?? "")) body.peso_precificado = parseNum(pesoEdit);
      if ((markupEdit || "") !== (produto.markup ?? "")) body.markup = parseNum(markupEdit);
      if ((fatorEdit || "") !== (produto.fator ?? "")) body.fator = parseNum(fatorEdit);
      if ((catPrecEdit || "") !== (produto.categoria ?? "")) body.categoria_precificacao = catPrecEdit || null;
      if ((precoTinyEdit || "") !== (produto.preco_tiny ?? "")) body.preco_tiny = parseNum(precoTinyEdit);
      if (tipoItemEdit !== (produto.tipo_item ?? "")) body.tipo_item = tipoItemEdit || null;

      if (Object.keys(body).length === 0) {
        setSaveMsg({ ok: true, texto: "Nenhuma alteração para salvar." });
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/produtos/${produto.id_produto}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Erro ao salvar");
      }
      const data = await res.json() as { produto: ProdutoDetalhe };
      setProduto((prev) => prev ? { ...prev, ...data.produto } : prev);
      setSaveMsg({ ok: true, texto: "Alterações salvas com sucesso." });
      onSaved?.();
      setTimeout(() => setSaveMsg(null), 3000);
      // Oferecer propagação para variações se for pai
      if (produto.eh_pai && variacoes.length > 0 && Object.keys(body).length > 0) {
        setShowPropagar(true);
      }
    } catch (e) {
      setSaveMsg({ ok: false, texto: e instanceof Error ? e.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  async function handlePropagar(campos: string[]) {
    if (!produto) return;
    setPropagando(true);
    setPropagarMsg(null);
    try {
      const res = await fetch(`/api/produtos/${produto.id_produto}/propagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campos }),
      });
      const b = await res.json() as { propagado?: number; error?: string };
      if (!res.ok) throw new Error(b.error ?? "Erro ao propagar");
      setPropagarMsg({ ok: true, texto: `Propagado para ${b.propagado ?? variacoes.length} variação(ões).` });
      setShowPropagar(false);
      setTimeout(() => setPropagarMsg(null), 4000);
    } catch (e) {
      setPropagarMsg({ ok: false, texto: e instanceof Error ? e.message : "Erro ao propagar" });
    } finally {
      setPropagando(false);
    }
  }

  async function handleDeleteBomItem(itemId: number) {
    if (!produto) return;
    setDeletingId(itemId);
    try {
      const res = await fetch(
        `/api/produtos/${produto.id_produto}/composicao/${itemId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Erro ao remover item");
      }
      setComposicao((prev) => prev.filter((i) => i.id !== itemId));
      // Reload to get updated preco_pedras
      loadProduto();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao remover item");
    } finally {
      setDeletingId(null);
    }
  }

  function handleBomSaved() {
    setShowAddForm(false);
    setEditingItem(null);
    loadProduto();
  }

  const hasChanges =
    produto !== null &&
    (temPedra !== produto.tem_pedra_preciosa ||
      (observacaoErp.trim() || null) !== (produto.observacao_erp?.trim() || null) ||
      (larguraAro || "") !== (produto.largura_aro ?? "") ||
      (alturaAro  || "") !== (produto.altura_aro  ?? "") ||
      (baseVal    || "") !== (produto.base         ?? "") ||
      nomeEdit.trim() !== (produto.nome ?? "").trim() ||
      (tipoMetalEdit || "") !== (produto.tipo_metal ?? "") ||
      (categoriaEdit || "") !== (produto.categoria_geral ?? "") ||
      situacaoEdit !== (produto.situacao ?? "A") ||
      (pesoEdit || "")       !== (produto.peso_precificado ?? "") ||
      (markupEdit || "")     !== (produto.markup ?? "") ||
      (fatorEdit || "")      !== (produto.fator ?? "") ||
      (catPrecEdit || "")    !== (produto.categoria ?? "") ||
      (precoTinyEdit || "")  !== (produto.preco_tiny ?? "") ||
      tipoItemEdit           !== (produto.tipo_item ?? ""));

  return (
    <>
      {/* Overlay */}
      {aberto && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-y-0 right-0 w-full md:w-[480px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${
          aberto ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="min-w-0">
            {produto ? (
              <>
                <h2 className="text-base font-semibold text-gray-800 truncate">{produto.nome}</h2>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{produto.sku}</p>
              </>
            ) : (
              <h2 className="text-base font-semibold text-gray-800">Produto</h2>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors ml-2 shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6 pb-28">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-gray-300" />
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2.5 border border-red-100">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {produto && !loading && (
            <>
              {/* ── DADOS BÁSICOS (EDITÁVEIS) ── */}
              <section>
                <p className={sectionTitleCls}>Dados Básicos</p>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                  <div>
                    <p className={labelCls}>Nome</p>
                    <input
                      type="text"
                      value={nomeEdit}
                      onChange={(e) => setNomeEdit(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={labelCls}>SKU</p>
                      <p className="text-sm font-mono text-gray-700 py-1.5">{produto.sku || "—"}</p>
                    </div>
                    <div>
                      <p className={labelCls}>Situação</p>
                      <select
                        value={situacaoEdit}
                        onChange={(e) => setSituacaoEdit(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      >
                        <option value="A">Ativo</option>
                        <option value="I">Inativo</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={labelCls}>Metal</p>
                      <select
                        value={tipoMetalEdit}
                        onChange={(e) => setTipoMetalEdit(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      >
                        <option value="">— Sem metal definido —</option>
                        <option value="Ouro Amarelo 18k">Ouro Amarelo 18k</option>
                        <option value="Ouro Branco 18k">Ouro Branco 18k</option>
                        <option value="Ouro Rose 18k">Ouro Rose 18k</option>
                        <option value="Prata">Prata</option>
                        {/* Mantém o valor atual caso seja algo fora da lista (legado) */}
                        {tipoMetalEdit &&
                          !["", "Ouro Amarelo 18k", "Ouro Branco 18k", "Ouro Rose 18k", "Prata"].includes(tipoMetalEdit) && (
                            <option value={tipoMetalEdit}>{tipoMetalEdit} (legado)</option>
                          )}
                      </select>
                    </div>
                    <div>
                      <p className={labelCls}>Categoria</p>
                      <input
                        type="text"
                        value={categoriaEdit}
                        onChange={(e) => setCategoriaEdit(e.target.value)}
                        placeholder="ex: Anel, Pulseira -> Feminino"
                        list="drawer-categoria-options"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      />
                      <datalist id="drawer-categoria-options">
                        <option value="Anel" />
                        <option value="Anel -> Feminino" />
                        <option value="Anel -> Masculino" />
                        <option value="Anel -> Infantil" />
                        <option value="Anel -> Formatura" />
                        <option value="Alianças" />
                        <option value="Pulseira" />
                        <option value="Pulseira -> Feminino" />
                        <option value="Pulseira -> Masculino" />
                        <option value="Pulseira -> Baby" />
                        <option value="Pingente" />
                        <option value="Pingente -> Feminino" />
                        <option value="Pingente -> Masculino" />
                        <option value="Pingente -> Religioso" />
                        <option value="Corrente" />
                        <option value="Corrente -> Adulto" />
                        <option value="Corrente -> Infantil" />
                        <option value="Brinco" />
                        <option value="Bracelete" />
                        <option value="Bracelete -> Feminino" />
                        <option value="Bracelete -> Masculino" />
                        <option value="Escapulário" />
                        <option value="Piercing" />
                        <option value="Tornozeleira" />
                        <option value="Fecho" />
                        <option value="Insumos" />
                        <option value="Insumos -> Copa" />
                        <option value="Insumos -> Estojo" />
                        <option value="Insumos -> Embalagens" />
                        <option value="Mostruário Loja" />
                        <option value="Pedras" />
                        <option value="Serviços" />
                      </datalist>
                    </div>
                  </div>
                  <div>
                    <p className={labelCls}>Tipo de item</p>
                    <select
                      value={tipoItemEdit}
                      onChange={(e) => setTipoItemEdit(e.target.value as "" | "joia" | "insumo")}
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                    >
                      <option value="">— Sem classificação —</option>
                      <option value="joia">Joia</option>
                      <option value="insumo">Insumo</option>
                    </select>
                  </div>
                  {produto.referencia && (
                    <div>
                      <p className={labelCls}>Referência</p>
                      <p className="text-sm text-gray-700">{produto.referencia}</p>
                    </div>
                  )}
                  {produto.categoria && (
                    <div>
                      <p className={labelCls}>Categoria de precificação</p>
                      <p className="text-sm text-gray-700">{produto.categoria}</p>
                    </div>
                  )}
                </div>
              </section>

              {/* ── BOM (COMPOSIÇÃO) ── */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className={sectionTitleCls}>Composição (BOM)</p>
                  {!showAddForm && !editingItem && (
                    <button
                      onClick={() => setShowAddForm(true)}
                      className="flex items-center gap-1 text-xs font-medium transition-colors hover:opacity-80"
                      style={{ color: C.esmeralda }}
                    >
                      <Plus size={13} />
                      Adicionar
                    </button>
                  )}
                </div>

                {/* Add form */}
                {showAddForm && (
                  <div className="mb-3">
                    <BomRowForm
                      produtoId={produto.id_produto}
                      insumos={insumos}
                      onSaved={handleBomSaved}
                      onCancel={() => setShowAddForm(false)}
                    />
                  </div>
                )}

                {/* BOM list */}
                {composicao.length === 0 && !showAddForm ? (
                  <div className="text-center py-6 text-gray-400 text-sm border border-dashed border-gray-200 rounded-xl">
                    Nenhum item na composição.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {composicao.map((item) => (
                      <div key={item.id}>
                        {editingItem?.id === item.id ? (
                          <BomRowForm
                            produtoId={produto.id_produto}
                            item={editingItem}
                            insumos={insumos}
                            onSaved={handleBomSaved}
                            onCancel={() => setEditingItem(null)}
                          />
                        ) : (
                          <div
                            className="flex items-start gap-3 p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <TipoBadge tipo={item.tipo} />
                                <span className="text-sm font-medium text-gray-800 truncate">
                                  {item.insumo_nome ?? `Insumo #${item.insumo_id}`}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                                {item.tipo === "metal" ? (
                                  <>
                                    {item.quantidade && (
                                      <span>
                                        <span className="text-gray-400">Peso:</span>{" "}
                                        <span className="font-mono">{parseFloat(item.quantidade).toFixed(3)} g</span>
                                      </span>
                                    )}
                                  </>
                                ) : item.tipo === "pedra" ? (
                                  <>
                                    {item.quantidade && (
                                      <span>
                                        <span className="text-gray-400">Qtd:</span>{" "}
                                        <span className="font-mono">{parseFloat(item.quantidade).toFixed(0)} un</span>
                                      </span>
                                    )}
                                    {item.tamanho && (
                                      <span>
                                        <span className="text-gray-400">Tam:</span>{" "}
                                        <span className="font-mono">{item.tamanho} ct</span>
                                      </span>
                                    )}
                                  </>
                                ) : (
                                  item.quantidade && (
                                    <span>
                                      <span className="text-gray-400">Peso:</span>{" "}
                                      <span className="font-mono">{parseFloat(item.quantidade).toFixed(2)} g</span>
                                    </span>
                                  )
                                )}
                                {!item.obrigatorio && (
                                  <span className="text-amber-600 font-medium">Opcional</span>
                                )}
                              </div>
                              {item.observacao && (
                                <p className="text-xs text-gray-400 mt-1 italic">{item.observacao}</p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => { setEditingItem(item); setShowAddForm(false); }}
                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                title="Editar"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                onClick={() => handleDeleteBomItem(item.id)}
                                disabled={deletingId === item.id}
                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                                title="Remover"
                              >
                                {deletingId === item.id ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Trash2 size={12} />
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* ── MEDIDAS (ficha técnica) ── */}
              <section>
                <p className={sectionTitleCls}>Medidas</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={labelCls}>Largura aro (mm)</label>
                    <input
                      type="number" step="any" min="0"
                      value={larguraAro}
                      onChange={(e) => setLarguraAro(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036] transition-colors"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Altura aro (mm)</label>
                    <input
                      type="number" step="any" min="0"
                      value={alturaAro}
                      onChange={(e) => setAlturaAro(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036] transition-colors"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>Base (mm)</label>
                    <input
                      type="number" step="any" min="0"
                      value={baseVal}
                      onChange={(e) => setBaseVal(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036] transition-colors"
                      placeholder="—"
                    />
                  </div>
                </div>
              </section>

              {/* ── PRECIFICAÇÃO (editável) ── */}
              <section>
                <p className={sectionTitleCls}>Precificação</p>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className={labelCls}>Peso precificado (g)</p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pesoEdit}
                        onChange={(e) => setPesoEdit(e.target.value)}
                        placeholder="—"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      />
                    </div>
                    <div>
                      <p className={labelCls}>Markup</p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={markupEdit}
                        onChange={(e) => setMarkupEdit(e.target.value)}
                        placeholder="—"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      />
                    </div>
                    <div>
                      <p className={labelCls}>Fator</p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fatorEdit}
                        onChange={(e) => setFatorEdit(e.target.value)}
                        placeholder="1"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      />
                    </div>
                  </div>
                  <div>
                    <p className={labelCls}>Categoria de precificação</p>
                    <input
                      type="text"
                      value={catPrecEdit}
                      onChange={(e) => setCatPrecEdit(e.target.value)}
                      placeholder="—"
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={labelCls}>Preço Tiny (R$)</p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={precoTinyEdit}
                        onChange={(e) => setPrecoTinyEdit(e.target.value)}
                        placeholder="—"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      />
                    </div>
                    <div>
                      <p className={labelCls}>Preço Sync (ouro)</p>
                      <p className="text-sm font-mono font-semibold text-gray-800 py-1.5">
                        {formatPreco(produto.preco_sync)}
                      </p>
                      <p className="text-[10px] text-gray-400">calculado automaticamente</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className={labelCls}>Preço Pedras</p>
                      <p className="text-sm font-mono text-gray-700 py-1.5">
                        {produto.tem_pedra_preciosa ? formatPreco(produto.preco_pedras) : "—"}
                      </p>
                    </div>
                    <div>
                      <p className={labelCls}>Preço Total Sync</p>
                      <p className="text-sm font-mono font-semibold text-gray-800 py-1.5">
                        {formatPreco(produto.preco_total_sync)}
                      </p>
                    </div>
                    <div>
                      <p className={labelCls}>Δ% (Tiny vs Sync)</p>
                      <div className="py-1.5">
                        <DeltaBadge pct={produto.diferenca_percentual} />
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── CAMPOS EDITÁVEIS ── */}
              <section>
                <p className={sectionTitleCls}>Dados ERP (editável)</p>
                <div className="space-y-3">
                  {/* tem_pedra_preciosa toggle */}
                  <div className="flex items-center justify-between py-2 px-3 border border-gray-200 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Tem pedra preciosa</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Afeta cálculo de preço das pedras
                      </p>
                    </div>
                    <button
                      onClick={() => setTemPedra((v) => !v)}
                      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
                      style={{ backgroundColor: temPedra ? C.esmeralda : "#D1D5DB" }}
                      role="switch"
                      aria-checked={temPedra}
                    >
                      <span
                        className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                        style={{ transform: temPedra ? "translateX(18px)" : "translateX(2px)" }}
                      />
                    </button>
                  </div>

                  {/* observacao_erp */}
                  <div>
                    <label className={labelCls}>Observação ERP</label>
                    <textarea
                      value={observacaoErp}
                      onChange={(e) => setObservacaoErp(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036] transition-colors resize-none"
                      placeholder="Anotações internas sobre este produto..."
                    />
                  </div>
                </div>
              </section>

              {/* ── VARIAÇÕES (só se for pai) ── */}
              {produto.eh_pai && variacoes.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-2">
                    <GitFork size={13} className="text-gray-400" />
                    <p className={sectionTitleCls}>Variações ({variacoes.length})</p>
                  </div>
                  <div className="space-y-1">
                    {variacoes.map((v) => (
                      <div
                        key={v.erp_id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg border border-gray-100 hover:border-gray-200 cursor-pointer transition-colors"
                        onClick={() => {/* abrir drawer da variação */}}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-xs text-gray-500">{v.sku}</span>
                          {v.numeracao && (
                            <span className="text-[10px] text-blue-500 font-mono">nº{v.numeracao}</span>
                          )}
                          <span className="text-xs text-gray-600 truncate">{v.nome}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {v.peso_precificado && (
                            <span className="font-mono text-[10px] text-gray-400">{formatPeso(v.peso_precificado)}g</span>
                          )}
                          <ChevronRight size={12} className="text-gray-300" />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ── FICHA TÉCNICA (readonly placeholder) ── */}
              <section>
                <p className={sectionTitleCls}>Ficha Técnica</p>
                <div className="border border-dashed border-gray-200 rounded-xl px-4 py-6 text-center">
                  <p className="text-xs text-gray-400">
                    Ficha técnica disponível na tela de Ordens.
                  </p>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer — Save */}
        {produto && (
          <div
            className="shrink-0 px-5 py-4 border-t bg-white"
            style={{ borderColor: C.cremeBorder }}
          >
            {/* Propagação — aparece após salvar um pai */}
            {showPropagar && (
              <div className="mb-3 p-3 rounded-lg border border-blue-100 bg-blue-50">
                <p className="text-xs font-medium text-blue-800 mb-2">
                  Propagar para as {variacoes.length} variações?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handlePropagar(["medidas"])}
                    disabled={propagando}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-60"
                    style={{ backgroundColor: C.esmeralda }}
                  >
                    {propagando ? <Loader2 size={11} className="animate-spin" /> : <GitFork size={11} />}
                    Medidas
                  </button>
                  <button
                    onClick={() => handlePropagar(["bom"])}
                    disabled={propagando}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-white transition-colors disabled:opacity-60"
                    style={{ backgroundColor: "#4B5563" }}
                  >
                    {propagando ? <Loader2 size={11} className="animate-spin" /> : <GitFork size={11} />}
                    BOM
                  </button>
                  <button
                    onClick={() => handlePropagar(["medidas", "bom"])}
                    disabled={propagando}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60 border border-blue-300 text-blue-700 bg-white hover:bg-blue-50"
                  >
                    Ambos
                  </button>
                  <button
                    onClick={() => setShowPropagar(false)}
                    className="px-2.5 py-1.5 rounded-md text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Só no pai
                  </button>
                </div>
              </div>
            )}
            {propagarMsg && (
              <div
                className={`mb-3 flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
                  propagarMsg.ok
                    ? "bg-green-50 text-green-700 border-green-100"
                    : "bg-red-50 text-red-600 border-red-100"
                }`}
              >
                <AlertCircle size={12} />
                {propagarMsg.texto}
              </div>
            )}
            {saveMsg && (
              <div
                className={`mb-3 flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
                  saveMsg.ok
                    ? "bg-green-50 text-green-700 border-green-100"
                    : "bg-red-50 text-red-600 border-red-100"
                }`}
              >
                <AlertCircle size={12} />
                {saveMsg.texto}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: C.esmeralda }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
