"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  Save,
  Loader2,
  Plus,
  Trash2,
  Camera,
  Edit2,
  Check,
  AlertCircle,
  Search,
  GitFork,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { formatPeso } from "@/lib/formatters";
import {
  calcularPrecoSync,
  type CurvaConfig,
} from "@/lib/curva-precificacao";
import { enriquecerPedra, totalizarPedras, fmtCt, fmtPt } from "@/lib/pedras-helpers";
import GaleriaProduto from "./GaleriaProduto";
import AplicarTemplateModal from "@/components/produtos/AplicarTemplateModal";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProdutoDetalhe {
  id_produto: number;
  nome: string;
  sku: string;
  tipo_metal: string | null;
  peso_precificado: string | null;
  preco_tiny: string | null;
  preco_sync: string | null;
  preco_curva: number | null;
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
  tipo_item: "joia" | "insumo" | "servico" | null;
  preco_servico: number | null;
  // erp_produtos
  erp_id?: number | null;
  eh_pai?: boolean | null;
  eh_variacao?: boolean | null;
  parent_sku?: string | null;
  qtd_variacoes?: number;
  numeracao?: string | null;
  cor_metal?: string | null;
  observacao_erp?: string | null;
  fornecedor?: string | null;
  largura_aro?: string | null;
  altura_aro?: string | null;
  base?: string | null;
  // Pedra-produto (alissonerp.produto_pedra_extras)
  preco_compra_usd?: string | number | null;
  quantidade_pedra?: number | null;
  peso_ct?: string | number | null;
  // Tiny sync
  id_api_produto?: number | null;
  tiny_sync_status?: string | null;
  tiny_sync_erro?: string | null;
  // Controle de estoque
  controla_estoque?: boolean;
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
  podeEditar?: boolean;
  camposVisiveis?: import("@/lib/produto-visibilidade").CampoVisivel;
}

const _CV_ALL = { foto: true, preco_venda: true, composicao_preco: true, markup: true, peso_aprox: true, ficha_tecnica: true, dados_avancados: true, pedras_catalogo: true, rota_fabricacao: true };

// Pedra do catálogo (categoria='Pedras', ativa, com preço)
interface PedraCatalogo {
  id: number;
  nome: string;
  preco_unitario: number;
  peso_g: number | null;
}

// Pedra selecionada para compor o preço do produto
interface PedraComponenteLocal {
  _key: string;
  pedra_produto_id: number;
  nome: string;
  preco_unitario: number;
  quantidade: number;
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

export default function ProdutoDrawer({ produtoId, onClose, onSaved, podeEditar = true, camposVisiveis = _CV_ALL }: Props) {
  const cv = camposVisiveis;
  const aberto = produtoId !== null;

  const [produto, setProduto] = useState<ProdutoDetalhe | null>(null);
  const [composicao, setComposicao] = useState<BomItem[]>([]);
  const [insumos, setInsumos] = useState<InsumoOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable fields
  const [temPedra, setTemPedra] = useState(false);
  const [observacaoErp, setObservacaoErp] = useState("");
  const [fornecedorEdit, setFornecedorEdit] = useState("");
  const [fornecedoresOpts, setFornecedoresOpts] = useState<string[]>([]);
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
  const [tipoItemEdit, setTipoItemEdit] = useState<"" | "joia" | "insumo" | "servico">("");
  const [precoServicoEdit, setPrecoServicoEdit] = useState("");
  const [saving, setSaving] = useState(false);
  const [syncingTiny, setSyncingTiny] = useState(false);
  const [tinySyncMsg, setTinySyncMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  // Foto agora é gerenciada pelo <GaleriaProduto> (galeria multi-imagem com capa).
  // Modo simplificado é o padrão: mostra só nome/SKU/situação + peso + preço.
  // Clicar "Ver dados avançados" expande metal/categoria/BOM/medidas/variações etc.
  const [showAvancado, setShowAvancado] = useState(false);

  // Cotação do ouro e dólar (para cálculo de preview em runtime)
  const [cotacaoOuro, setCotacaoOuro] = useState<number>(0);
  const [cotacaoDolar, setCotacaoDolar] = useState<number>(0);

  // Pedra-produto
  const [precoCompraUsdEdit, setPrecoCompraUsdEdit] = useState("");
  const [quantidadePedraEdit, setQuantidadePedraEdit] = useState("");
  // Faixas de markup das pedras (para preview em runtime)
  const [markupPedras, setMarkupPedras] = useState<Array<{ tamanho_min: number; tamanho_max: number; markup: number }>>([]);
  // Curva de precificação canônica (mesma fonte da aba /precificacao).
  // Usada para arredondamento + goldCostPercentage no preview de preço.
  const [curvaConfig, setCurvaConfig] = useState<CurvaConfig | null>(null);

  // Reposição automática + Tempo de fabricação + Rota
  const [estoqueMinimoEdit, setEstoqueMinimoEdit] = useState("0");
  const [reposicaoAtiva, setReposicaoAtiva] = useState(false);
  const [tempoFabricacaoDias, setTempoFabricacaoDias] = useState("");
  const [rotaEtapas, setRotaEtapas] = useState<number[]>([]);
  const [mostrarTemplate, setMostrarTemplate] = useState(false);
  const [setoresDisponiveis, setSetoresDisponiveis] = useState<{ id: number; nome: string }[]>([]);
  const [extrasDirty, setExtrasDirty] = useState(false);

  // Ficha técnica (foto)
  const [fichaTecnicaUrl, setFichaTecnicaUrl] = useState<string | null>(null);
  const [fichaTecnicaUploadBase64, setFichaTecnicaUploadBase64] = useState<string | null>(null);
  const fichaTecnicaInputRef = useRef<HTMLInputElement>(null);

  // Pedras-componente (só precificação — NÃO abate estoque)
  const [pedrasComp, setPedrasComp] = useState<PedraComponenteLocal[]>([]);
  const [catalogoPedras, setCatalogoPedras] = useState<PedraCatalogo[]>([]);
  const [pedraSelId, setPedraSelId] = useState("");
  const [pedraSelQtd, setPedraSelQtd] = useState("1");

  // Variações (quando eh_pai)
  const [variacoes, setVariacoes] = useState<Variacao[]>([]);

  const [propagarMsg, setPropagarMsg] = useState<{ ok: boolean; texto: string } | null>(null);

  // REGRA DE NEGÓCIO: no produto pai, qualquer alteração em campos replicáveis
  // deve perguntar se replica para filhos ANTES de salvar.
  // Impacto: sem essa confirmação prévia, o usuário pode alterar dezenas de
  // variações sem perceber, ou deixar dados divergentes entre pai e filhos.
  const CAMPOS_REPLICAVEIS_PAI = new Set([
    "situacao",
    "tipo_metal",
    "categoria_geral",
    "categoria_precificacao",
    "tem_pedra_preciosa",
    "fator",
    "observacao_erp",
    "fornecedor",
    "largura_aro",
    "altura_aro",
    "base",
  ]);

  // BOM editing
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<BomItem | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Controle de estoque
  const { modulos_escrita } = useAuth();
  const userPermissaoControlarEstoque = podeEditar && modulos_escrita.includes("controlar_estoque");
  const [confirmDesligarEstoque, setConfirmDesligarEstoque] = useState(false);

  // Load product details
  const loadProduto = useCallback(async () => {
    if (!produtoId) return;
    setLoading(true);
    setError(null);
    // Fornecedores para autocomplete (não bloqueia o load principal)
    fetch("/api/fornecedores").then(async (r) => {
      if (!r.ok) return;
      const j = await r.json() as { fornecedores: Array<{ nome: string }> };
      setFornecedoresOpts((j.fornecedores ?? []).map((f) => f.nome).filter(Boolean));
    }).catch(() => { /* ignore */ });
    // Curva de precificação (config) — não bloqueia o load principal
    fetch("/api/precificacao/curva/config").then(async (r) => {
      if (!r.ok) return;
      const j = await r.json() as { config: CurvaConfig };
      setCurvaConfig(j.config);
    }).catch(() => { /* ignore */ });
    // Setores cadastrados (para rota de fabricação)
    fetch("/api/setores").then(async (r) => {
      if (!r.ok) return;
      const arr = await r.json() as Array<{ id: number; nome: string; ativo: boolean }>;
      setSetoresDisponiveis((arr ?? []).filter((s) => s.ativo).map((s) => ({ id: s.id, nome: s.nome })));
    }).catch(() => { /* ignore */ });
    // Reposição automática + tempo de fabricação do produto
    fetch(`/api/produtos/${produtoId}/reposicao`).then(async (r) => {
      if (!r.ok) return;
      const j = await r.json() as { config: { estoque_minimo: number; ativo: boolean; tempo_fabricacao_dias: number | null } | null };
      if (j.config) {
        setEstoqueMinimoEdit(String(j.config.estoque_minimo));
        setReposicaoAtiva(j.config.ativo);
        setTempoFabricacaoDias(j.config.tempo_fabricacao_dias != null ? String(j.config.tempo_fabricacao_dias) : "");
      } else {
        setEstoqueMinimoEdit("0");
        setReposicaoAtiva(false);
        setTempoFabricacaoDias("");
      }
    }).catch(() => { /* ignore */ });
    // Rota de fabricação do produto
    fetch(`/api/produtos/${produtoId}/rota`).then(async (r) => {
      if (!r.ok) return;
      const j = await r.json() as { etapas: Array<{ ordem: number; setor_id: number }> };
      setRotaEtapas((j.etapas ?? []).sort((a, b) => a.ordem - b.ordem).map((e) => e.setor_id));
    }).catch(() => { /* ignore */ });
    // Ficha técnica (foto) — reset upload pendente ao carregar produto
    setFichaTecnicaUploadBase64(null);
    fetch(`/api/produtos/${produtoId}/ficha-tecnica`).then(async (r) => {
      if (!r.ok) return;
      const j = await r.json() as { ficha: { url: string } | null };
      setFichaTecnicaUrl(j.ficha?.url ?? null);
    }).catch(() => { /* ignore */ });
    try {
      const [res, pedrasCatRes, pedrasCompRes] = await Promise.all([
        fetch(`/api/produtos/${produtoId}`),
        fetch("/api/produtos/pedras-catalogo"),
        fetch(`/api/produtos/${produtoId}/pedras-componente`),
      ]);
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Erro ao carregar produto");
      }
      // Catálogo de pedras disponíveis
      if (pedrasCatRes.ok) {
        const d = await pedrasCatRes.json() as PedraCatalogo[];
        setCatalogoPedras(Array.isArray(d) ? d : []);
      }
      // Pedras já vinculadas ao produto (precificação)
      if (pedrasCompRes.ok) {
        const d = await pedrasCompRes.json() as Array<{ id: number; pedra_produto_id: number; nome: string; quantidade: number; preco_unitario: number }>;
        if (Array.isArray(d)) {
          setPedrasComp(d.map((p) => ({
            _key: `existing-${p.id}`,
            pedra_produto_id: p.pedra_produto_id,
            nome: p.nome,
            preco_unitario: p.preco_unitario,
            quantidade: p.quantidade,
          })));
        }
      } else {
        setPedrasComp([]);
      }
      const data = await res.json() as { produto: ProdutoDetalhe; composicao: BomItem[]; variacoes: Variacao[]; cotacao_ouro?: number; cotacao_dolar?: number; markup_pedras?: Array<{ tamanho_min: string | number; tamanho_max: string | number; markup: string | number }> };
      setProduto(data.produto);
      setComposicao(data.composicao);
      setVariacoes(data.variacoes ?? []);
      setCotacaoOuro(Number(data.cotacao_ouro ?? 0));
      setCotacaoDolar(Number(data.cotacao_dolar ?? 0));
      setPrecoCompraUsdEdit(data.produto.preco_compra_usd != null ? String(data.produto.preco_compra_usd) : "");
      setQuantidadePedraEdit(data.produto.quantidade_pedra != null ? String(data.produto.quantidade_pedra) : "");
      setMarkupPedras((data.markup_pedras ?? []).map(f => ({
        tamanho_min: Number(f.tamanho_min),
        tamanho_max: Number(f.tamanho_max),
        markup:      Number(f.markup),
      })));
      setTemPedra(data.produto.tem_pedra_preciosa);
      setObservacaoErp(data.produto.observacao_erp ?? "");
      setFornecedorEdit(data.produto.fornecedor ?? "");
      setLarguraAro(data.produto.largura_aro ?? "");
      setAlturaAro(data.produto.altura_aro ?? "");
      setBaseVal(data.produto.base ?? "");
      setNomeEdit(data.produto.nome ?? "");
      setTipoMetalEdit(data.produto.tipo_metal ?? "");
      setCategoriaEdit(data.produto.categoria_geral ?? "");
      setSituacaoEdit(data.produto.situacao ?? "A");
      // Converte valores numéricos para string (DB retorna number em alguns tipos)
      const toStr = (v: unknown): string => (v == null ? "" : String(v));
      setPesoEdit(toStr(data.produto.peso_precificado));
      setMarkupEdit(toStr(data.produto.markup));
      setFatorEdit(toStr(data.produto.fator));
      setCatPrecEdit(toStr(data.produto.categoria));
      setPrecoTinyEdit(toStr(data.produto.preco_tiny));
      setTipoItemEdit(data.produto.tipo_item ?? "");
      setPrecoServicoEdit(data.produto.preco_servico != null ? String(data.produto.preco_servico) : "");
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
      setPropagarMsg(null);
      setError(null);
      setPedrasComp([]);
      setCatalogoPedras([]);
      setPedraSelId("");
      setPedraSelQtd("1");
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

  async function persistirReposicaoERota(produtoId: number): Promise<boolean> {
    let ok = true;
    // Reposição + tempo de fabricação
    try {
      const minimoNum = parseInt(estoqueMinimoEdit || "0", 10);
      const tempoNum = tempoFabricacaoDias.trim() ? parseInt(tempoFabricacaoDias, 10) : null;
      const r = await fetch(`/api/produtos/${produtoId}/reposicao`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estoque_minimo: minimoNum, ativo: reposicaoAtiva, tempo_fabricacao_dias: tempoNum }),
      });
      if (!r.ok) ok = false;
    } catch { ok = false; }
    // Rota
    try {
      const r = await fetch(`/api/produtos/${produtoId}/rota`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etapas: rotaEtapas.map((sid) => ({ setor_id: sid })) }),
      });
      if (!r.ok) ok = false;
    } catch { ok = false; }
    // Ficha técnica (só envia se houver upload novo pendente)
    if (fichaTecnicaUploadBase64) {
      try {
        const r = await fetch(`/api/produtos/${produtoId}/ficha-tecnica`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foto_base64: fichaTecnicaUploadBase64 }),
        });
        if (r.ok) {
          const j = await r.json() as { ficha: { url: string } };
          setFichaTecnicaUrl(j.ficha?.url ?? null);
          setFichaTecnicaUploadBase64(null);
        } else {
          ok = false;
        }
      } catch { ok = false; }
    }
    return ok;
  }

  async function handleSave() {
    if (!produto) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const body: Record<string, unknown> = {};
      // tem_pedra_preciosa: auto-detectado do Apontamento Padrão (composição).
      // Só atualiza se a composição estiver populada (>=1 item) — inferência
      // confiável. Composição vazia → preserva flag antiga (produtos legados).
      if (composicao.length > 0) {
        const temPedraAuto = composicao.some((c) => c.tipo === "pedra");
        if (temPedraAuto !== produto.tem_pedra_preciosa) body.tem_pedra_preciosa = temPedraAuto;
      }
      const obs = observacaoErp.trim() || null;
      const obsOriginal = produto.observacao_erp?.trim() || null;
      if (obs !== obsOriginal) body.observacao_erp = obs;
      const fornAtual = fornecedorEdit.trim() || null;
      const fornOriginal = (produto.fornecedor ?? "").trim() || null;
      if (fornAtual !== fornOriginal) body.fornecedor = fornAtual;
      const larg = larguraAro ? parseFloat(larguraAro) : null;
      const alt  = alturaAro  ? parseFloat(alturaAro)  : null;
      const bas  = baseVal    ? parseFloat(baseVal)     : null;
      if (larg !== (produto.largura_aro ? parseFloat(produto.largura_aro) : null)) body.largura_aro = larg;
      if (alt  !== (produto.altura_aro  ? parseFloat(produto.altura_aro)  : null)) body.altura_aro  = alt;
      if (bas  !== (produto.base        ? parseFloat(produto.base)        : null)) body.base        = bas;

      if (nomeEdit.trim() !== (produto.nome ?? "").trim()) body.nome = nomeEdit.trim();
      if ((tipoMetalEdit || "") !== (produto.tipo_metal ?? "")) body.tipo_metal = tipoMetalEdit || null;
      if ((categoriaEdit || "") !== (produto.categoria_geral ?? "")) {
        body.categoria_geral = categoriaEdit || null;
        // Se produto é Alisson e categoria mudou, perguntar se quer aplicar
        // a rota padrão da nova categoria. Resposta SIM → backend sobrescreve
        // produto_rota com etapas do template default.
        const FORN_ALISSON = ["Fabricação Própria", "ARAS Indústria (Fábrica Alisson)"];
        const fornAtual = fornecedorEdit.trim() || produto.fornecedor || "";
        if (FORN_ALISSON.includes(fornAtual) && (categoriaEdit || "").trim()) {
          if (confirm(`Categoria mudou para "${categoriaEdit}". Aplicar a rota padrão dessa categoria? Isso vai sobrescrever a rota atual do produto.`)) {
            body.aplicar_rota_padrao = true;
          }
        }
      }
      if (situacaoEdit !== (produto.situacao ?? "A")) body.situacao = situacaoEdit;

      // Precificação — aceita formato brasileiro:
      //   "4.500"     → 4500  (ponto como milhar)
      //   "4.500,50"  → 4500.5
      //   "4500,50"   → 4500.5
      //   "4.5"       → 4.5   (sem 3 dígitos após o ponto = decimal)
      //   "4500"      → 4500
      const parseNum = (v: string | number | null | undefined) => {
        if (v == null) return null;
        if (typeof v === "number") return isNaN(v) ? null : v;
        let t = String(v).trim();
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
      // Markup é somente leitura aqui — só pode ser alterado em /precificação
      if ((fatorEdit || "") !== (produto.fator ?? "")) body.fator = parseNum(fatorEdit);
      if ((catPrecEdit || "") !== (produto.categoria ?? "")) body.categoria_precificacao = catPrecEdit || null;
      // preco_tiny: joias têm o preço CALCULADO pelo ERP (peso × ouro × markup).
      // Pedras: preço calculado no backend a partir de preco_compra_usd × dólar × markup_faixa —
      // não enviamos preco_tiny para pedras; enviamos os dois inputs novos.
      const ehPedra = (produto.categoria_geral ?? produto.categoria ?? "").toLowerCase().startsWith("pedras");
      if (ehPedra) {
        const precoUsdOriginal = produto.preco_compra_usd != null ? String(produto.preco_compra_usd) : "";
        const qtdOriginal       = produto.quantidade_pedra != null ? String(produto.quantidade_pedra) : "";
        if ((precoCompraUsdEdit || "") !== precoUsdOriginal) {
          body.preco_compra_usd = parseNum(precoCompraUsdEdit);
        }
        if ((quantidadePedraEdit || "") !== qtdOriginal) {
          const n = quantidadePedraEdit ? parseInt(quantidadePedraEdit, 10) : null;
          body.quantidade_pedra = (n != null && !isNaN(n)) ? n : null;
        }
      }
      if (tipoItemEdit !== (produto.tipo_item ?? "")) body.tipo_item = tipoItemEdit || null;

      // Preço de serviço: salva se tipo_item for servico, limpa se nao for
      if (tipoItemEdit === "servico") {
        const n = parseFloat(precoServicoEdit.replace(",", "."));
        body.preco_servico = !isNaN(n) && n > 0 ? n : null;
      } else if (produto.preco_servico != null) {
        body.preco_servico = null;
      }

      // REGRA DE NEGÓCIO: decisão de replicação é pré-save e só vale para
      // campos replicáveis do PATCH principal (pai -> filhos).
      // Impacto: evita prompt desnecessário quando usuário alterou apenas dados
      // não replicáveis, mantendo o fluxo rápido e previsível.
      const camposBody = Object.keys(body);
      const temCampoReplicavelAlterado = camposBody.some((k) => CAMPOS_REPLICAVEIS_PAI.has(k));
      const devePerguntarReplicacao = Boolean(
        produto.eh_pai && variacoes.length > 0 && temCampoReplicavelAlterado
      );

      let replicarFilhos = false;
      if (devePerguntarReplicacao) {
        replicarFilhos = confirm(
          `Este produto pai tem ${variacoes.length} variação(ões). Deseja salvar e replicar TUDO nos filhos (campos, produção, rota, pedras e BOM)?`
        );
      }

      // Persiste rota/reposição mesmo quando body do PATCH principal está vazio.
      // (Esses dois endpoints são separados — UPSERT idempotente, sem dirty-check.)
      const extrasOk = await persistirReposicaoERota(produto.id_produto);
      if (extrasOk) setExtrasDirty(false);

      // Se há pedras-componente: salva subtotal em preco_pedras (para a lista mostrar curva+pedras)
      if (!ehPedra) {
        if (pedrasComp.length > 0) {
          const subtotalPedrasSave = pedrasComp.reduce((s, p) => s + p.preco_unitario * p.quantidade, 0);
          body.preco_pedras = Math.round(subtotalPedrasSave * 100) / 100;
          const precoOuroAtual = parseFloat(String(produto.preco_curva ?? "") || produto.preco_sync || produto.preco_tiny || "0") || 0;
          if (precoOuroAtual > 0) {
            body.preco_tiny = Math.round((precoOuroAtual + subtotalPedrasSave) * 100) / 100;
          }
        } else {
          // Sem pedras: zera preco_pedras para limpar valor antigo
          body.preco_pedras = 0;
        }
      }

      // Pedras-componente (só precificação — NÃO abate estoque)
      // Sempre envia, mesmo lista vazia (limpa as pedras se remover todas)
      try {
        await fetch(`/api/produtos/${produto.id_produto}/pedras-componente`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pedras: pedrasComp.map((p) => ({
              pedra_produto_id: p.pedra_produto_id,
              quantidade: p.quantidade,
            })),
          }),
        });
      } catch { /* best-effort — não bloqueia o save principal */ }

      if (Object.keys(body).length === 0) {
        setSaveMsg({ ok: extrasOk, texto: extrasOk ? "Alterações salvas com sucesso." : "Erro ao salvar reposição/rota." });
        setSaving(false);
        return;
      }

      const res = await fetch(`/api/produtos/${produto.id_produto}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // REGRA DE NEGÓCIO: a escolha do usuário no prompt governa a
        // replicação pai->filhos no backend.
        // Impacto: retirar essa flag quebra a previsibilidade do fluxo.
        body: JSON.stringify({ ...body, replicar_filhos: replicarFilhos }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Erro ao salvar");
      }
      const data = await res.json() as { produto: ProdutoDetalhe; tiny_sync?: { ok: boolean; erro?: string } };
      setProduto((prev) => prev ? { ...prev, ...data.produto, tiny_sync_status: data.tiny_sync?.ok ? "ok" : (data.tiny_sync ? "erro" : prev.tiny_sync_status), tiny_sync_erro: data.tiny_sync?.erro ?? prev.tiny_sync_erro } : prev);
      setSaveMsg({ ok: true, texto: "Alterações salvas com sucesso." });
      onSaved?.();
      setTimeout(() => setSaveMsg(null), 3000);
      // REGRA DE NEGÓCIO: no modo "replicar tudo", o usuário espera que todas
      // as configurações operacionais do pai sejam copiadas para filhos, sem
      // confirmação extra de BOM. O BOM é replicado automaticamente aqui.
      // Impacto: se não replicar nesta etapa, pai/filhos ficam divergentes em
      // reposição, rota e composição, causando falhas de produção.
      if (replicarFilhos && produto.eh_pai && variacoes.length > 0) {
        await replicarTudoNosFilhos(produto.id_produto, variacoes.map((v) => v.produto_id));
      }
    } catch (e) {
      setSaveMsg({ ok: false, texto: e instanceof Error ? e.message : "Erro ao salvar" });
    } finally {
      setSaving(false);
    }
  }

  async function replicarTudoNosFilhos(paiId: number, filhoIds: number[]) {
    if (filhoIds.length === 0) return;
    setPropagarMsg(null);
    try {
      const falhas: string[] = [];

      const resBom = await fetch(`/api/produtos/${paiId}/propagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campos: ["bom"] }),
      });
      if (!resBom.ok) {
        const b = await resBom.json().catch(() => ({})) as { error?: string };
        falhas.push(`BOM: ${b.error ?? "erro ao propagar composição"}`);
      }

      const tempoNum = tempoFabricacaoDias.trim() ? parseInt(tempoFabricacaoDias, 10) : null;
      const minimoNum = parseInt(estoqueMinimoEdit || "0", 10);
      const pedrasPayload = {
        pedras: pedrasComp.map((p) => ({
          pedra_produto_id: p.pedra_produto_id,
          quantidade: p.quantidade,
        })),
      };

      for (const fid of filhoIds) {
        const patchFilho: Record<string, unknown> = {
          controla_estoque: produto?.controla_estoque ?? true,
          tipo_item: tipoItemEdit || null,
        };
        if (tipoItemEdit === "servico") {
          const n = parseFloat(precoServicoEdit.replace(",", "."));
          patchFilho.preco_servico = !isNaN(n) && n > 0 ? n : null;
        } else {
          patchFilho.preco_servico = null;
        }

        const [rReposicao, rRota, rPedras, rPatchFilho] = await Promise.all([
          fetch(`/api/produtos/${fid}/reposicao`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              estoque_minimo: Number.isFinite(minimoNum) ? minimoNum : 0,
              ativo: reposicaoAtiva,
              tempo_fabricacao_dias: tempoNum,
            }),
          }),
          fetch(`/api/produtos/${fid}/rota`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ etapas: rotaEtapas.map((setor_id) => ({ setor_id })) }),
          }),
          fetch(`/api/produtos/${fid}/pedras-componente`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pedrasPayload),
          }),
          fetch(`/api/produtos/${fid}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patchFilho),
          }),
        ]);

        if (!rReposicao.ok) falhas.push(`Filho ${fid}: reposição`);
        if (!rRota.ok) falhas.push(`Filho ${fid}: rota`);
        if (!rPedras.ok) falhas.push(`Filho ${fid}: pedras`);
        if (!rPatchFilho.ok) falhas.push(`Filho ${fid}: tipo_item/serviço/controle_estoque`);
      }

      if (falhas.length > 0) {
        setPropagarMsg({ ok: false, texto: `Replicação parcial. Falhas: ${falhas.join(" | ")}` });
      } else {
        setPropagarMsg({ ok: true, texto: `Replicação completa aplicada em ${filhoIds.length} variação(ões).` });
      }
    } catch (e) {
      setPropagarMsg({ ok: false, texto: e instanceof Error ? e.message : "Erro ao replicar tudo" });
    } finally {
      // noop
    }
  }

  async function handleSyncTiny() {
    if (!produto) return;
    setSyncingTiny(true);
    setTinySyncMsg(null);
    try {
      const res = await fetch(`/api/produtos/${produto.id_produto}/tiny-sync`, { method: "POST" });
      if (res.ok) {
        setTinySyncMsg({ ok: true, texto: "Produto sincronizado com Tiny com sucesso." });
        const b = await res.json() as { tinyId?: number };
        setProduto((prev) => prev ? { ...prev, id_api_produto: b.tinyId ?? prev.id_api_produto, tiny_sync_status: "ok", tiny_sync_erro: null } : prev);
      } else {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Erro ao sincronizar com Tiny");
      }
    } catch (e) {
      setTinySyncMsg({ ok: false, texto: e instanceof Error ? e.message : "Erro ao sincronizar" });
    } finally {
      setSyncingTiny(false);
      setTimeout(() => setTinySyncMsg(null), 8000);
    }
  }

  // ── Controla Estoque toggle ──────────────────────────────────────────────
  async function patchControlaEstoque(valor: boolean) {
    if (!produto) return;
    try {
      const res = await fetch(`/api/produtos/${produto.id_produto}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controla_estoque: valor }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(b.error ?? "Erro ao alterar controle de estoque");
      }
      setProduto((prev) => (prev ? { ...prev, controla_estoque: valor } : prev));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro desconhecido");
    }
  }

  function handleToggleControlaEstoque() {
    if (!produto) return;
    const novoValor = !(produto.controla_estoque ?? true);
    if (!novoValor) {
      // Desligando → mostra confirmação
      setConfirmDesligarEstoque(true);
      return;
    }
    // Ligando → aplica direto
    patchControlaEstoque(true);
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
    ((observacaoErp.trim() || null) !== (produto.observacao_erp?.trim() || null) ||
      (fornecedorEdit.trim() || null) !== ((produto.fornecedor ?? "").trim() || null) ||
      (larguraAro || "") !== (produto.largura_aro ?? "") ||
      (alturaAro  || "") !== (produto.altura_aro  ?? "") ||
      (baseVal    || "") !== (produto.base         ?? "") ||
      nomeEdit.trim() !== (produto.nome ?? "").trim() ||
      (tipoMetalEdit || "") !== (produto.tipo_metal ?? "") ||
      (categoriaEdit || "") !== (produto.categoria_geral ?? "") ||
      situacaoEdit !== (produto.situacao ?? "A") ||
      (pesoEdit || "")       !== (produto.peso_precificado ?? "") ||
      // Markup readonly — não dispara dirty
      (fatorEdit || "")      !== (produto.fator ?? "") ||
      (catPrecEdit || "")    !== (produto.categoria ?? "") ||
      // Pedras: dirty se mudou preco_compra_usd ou quantidade (preco_tiny é calculado)
      ((((produto.categoria_geral ?? produto.categoria ?? "").toLowerCase().startsWith("pedras"))
         ? ((precoCompraUsdEdit || "") !== (produto.preco_compra_usd != null ? String(produto.preco_compra_usd) : "") ||
            (quantidadePedraEdit || "") !== (produto.quantidade_pedra != null ? String(produto.quantidade_pedra) : ""))
         : false)) ||
      tipoItemEdit           !== (produto.tipo_item ?? "") ||
      (precoServicoEdit || "") !== (produto.preco_servico != null ? String(produto.preco_servico) : "") ||
      extrasDirty);

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
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="text-base font-semibold text-gray-800 truncate">{produto.nome}</h2>
                  {(() => {
                    const pedrasNaoZirconia = pedrasComp.filter(
                      (p) => !p.nome.toLowerCase().includes("zirconia")
                    );
                    if (pedrasNaoZirconia.length === 0) return null;
                    const total = totalizarPedras(
                      pedrasNaoZirconia.map((p) => enriquecerPedra({ ...p, sku: "" }))
                    );
                    if (total.ctTotal <= 0) return null;
                    return (
                      <span
                        className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold font-mono"
                        style={{ backgroundColor: "#EDE9FE", color: "#5B21B6" }}
                        title={`${fmtCt(total.ctTotal)} · ${fmtPt(total.pontosTotal)}`}
                      >
                        💎 {fmtCt(total.ctTotal)}
                      </span>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-xs text-gray-400 font-mono">{produto.sku}</p>
                  {produto.tiny_sync_status === "pendente" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">Aguardando Tiny</span>
                  )}
                  {produto.tiny_sync_status === "erro" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-medium" title={produto.tiny_sync_erro ?? ""}>Erro Tiny</span>
                  )}
                  {!produto.id_api_produto && !produto.tiny_sync_status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">Sem ID Tiny</span>
                  )}
                  {produto.id_api_produto && !produto.tiny_sync_status && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Sincronizado Tiny</span>
                  )}
                  {podeEditar && (
                    <button
                      onClick={handleSyncTiny}
                      disabled={syncingTiny}
                      className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors disabled:opacity-50 hover:bg-gray-100 text-gray-500 border border-gray-200"
                      title="Sincronizar com Tiny ERP"
                    >
                      <RefreshCw size={10} className={syncingTiny ? "animate-spin" : ""} />
                      {syncingTiny ? "Sincronizando..." : "Sync Tiny"}
                    </button>
                  )}
                </div>
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


          {produto && !loading && (() => {
            // Pedras têm uma ficha própria: mostra só mm, ct, pontos e valor.
            // O restante (composição, medidas de joia, peso em g, markup, curva,
            // variações) não se aplica — o preço vem direto de preco_tiny.
            //
            // NOTA: no payload do endpoint /api/produtos/[id], o campo `categoria`
            // é na verdade `categoria_precificacao` da tabela, e `categoria_geral`
            // é o campo `categoria` (onde fica "Pedras"). Mapeamento histórico.
            const catPedra = (produto.categoria_geral ?? produto.categoria ?? "").toLowerCase();
            const isPedra = catPedra.startsWith("pedras");
            if (isPedra) {
              // ── Parse dados da pedra ────────────────────────────────────
              const parseNumPedra = (v: string | number | null | undefined) => {
                if (v == null) return 0;
                if (typeof v === "number") return isNaN(v) ? 0 : v;
                let t = String(v).trim();
                if (!t) return 0;
                if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
                const n = parseFloat(t);
                return isNaN(n) ? 0 : n;
              };

              // Extrai mm do nome (ex: "Diamante Natural 1.5mm" → 1.5)
              const mmMatch = (produto.nome ?? "").match(/([\d.,]+)\s*mm\b/i);
              const mm = mmMatch ? parseNumPedra(mmMatch[1]) : 0;

              // Peso fiel em ct vem de produto_pedra_extras.peso_ct (peso_precificado
              // é arredondado pelo trigger). Fallback: peso_precificado / 0.2.
              const pesoG = parseNumPedra(produto.peso_precificado);
              const ctFromExtras = produto.peso_ct;
              const ctFromExtrasNum = ctFromExtras != null ? Number(ctFromExtras) : NaN;
              const ct = Number.isFinite(ctFromExtrasNum) && ctFromExtrasNum > 0
                ? ctFromExtrasNum
                : pesoG / 0.2;
              // Pontos: 1 ct = 100 pontos
              const pontos = ct * 100;

              const precoCompraUsdLive = parseNumPedra(precoCompraUsdEdit);
              // Markup baseado no tamanho em ct (1 ct = 0.2 g).
              const faixa = markupPedras.find(f => ct >= f.tamanho_min && ct < f.tamanho_max);
              const markupLive =
                faixa ? faixa.markup
                      : (markupPedras.length > 0
                          ? [...markupPedras].sort((a, b) =>
                              (ct >= a.tamanho_min ? a.tamanho_min : -Infinity) -
                              (ct >= b.tamanho_min ? b.tamanho_min : -Infinity)
                            ).reverse()[0]?.markup ?? 0
                          : 0);
              const precoCalc = precoCompraUsdLive > 0 && cotacaoDolar > 0 && markupLive > 0
                ? precoCompraUsdLive * cotacaoDolar * markupLive
                : parseNumPedra(produto.preco_tiny);
              const precoPedra = precoCalc;

              return (
                <>
                  {/* ── CABEÇALHO DA PEDRA ── */}
                  <section>
                    <p className={sectionTitleCls}>Ficha da Pedra</p>
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
                      <div>
                        <p className={labelCls}>Fornecedor</p>
                        <input
                          type="text"
                          value={fornecedorEdit}
                          onChange={(e) => setFornecedorEdit(e.target.value)}
                          placeholder="—"
                          list="drawer-fornecedores-options-pedra"
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                        />
                        <datalist id="drawer-fornecedores-options-pedra">
                          {fornecedoresOpts.map((f) => <option key={f} value={f} />)}
                        </datalist>
                      </div>
                    </div>
                  </section>

                  {/* ── ESPECIFICAÇÕES DA PEDRA (mm, ct, pontos) ── */}
                  <section>
                    <p className={sectionTitleCls}>Especificações</p>
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center py-3 rounded-lg bg-white border border-gray-100">
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">Tamanho</p>
                          <p className="text-xl font-mono font-bold text-gray-800 mt-1">
                            {mm > 0 ? `${mm.toFixed(1)}` : "—"}
                            <span className="text-xs text-gray-400 ml-1">mm</span>
                          </p>
                        </div>
                        <div className="text-center py-3 rounded-lg bg-white border border-gray-100">
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">Peso</p>
                          <p className="text-xl font-mono font-bold text-gray-800 mt-1">
                            {ct > 0 ? ct.toFixed(2).replace(".", ",") : "—"}
                            <span className="text-xs text-gray-400 ml-1">ct</span>
                          </p>
                        </div>
                        <div className="text-center py-3 rounded-lg bg-white border border-gray-100">
                          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">Pontos</p>
                          <p className="text-xl font-mono font-bold text-gray-800 mt-1">
                            {pontos > 0 ? pontos.toFixed(1).replace(".", ",") : "—"}
                            <span className="text-xs text-gray-400 ml-1">pt</span>
                          </p>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 text-center mt-2">
                        1 ct = 0.2 g · 1 ct = 100 pontos
                      </p>
                    </div>
                  </section>

                  {/* ── ESTOQUE DA PEDRA ── */}
                  <section>
                    <p className={sectionTitleCls}>Estoque</p>
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      <p className={labelCls}>Quantidade em estoque</p>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={quantidadePedraEdit}
                        onChange={(e) => setQuantidadePedraEdit(e.target.value)}
                        placeholder="0"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      />
                    </div>
                  </section>

                  {/* ── VALOR DA PEDRA (calculado pelo markup) ── */}
                  <section>
                    <p className={sectionTitleCls}>Valor</p>
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                      <div>
                        <p className={labelCls}>Preço de Compra (USD)</p>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={precoCompraUsdEdit}
                          onChange={(e) => setPrecoCompraUsdEdit(e.target.value)}
                          placeholder="0,00"
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                        />
                      </div>

                      <div>
                        <p className={labelCls}>Preço de Venda (R$) <span className="text-gray-400 normal-case tracking-normal">(calculado)</span></p>
                        <div
                          className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono font-semibold bg-gray-100 cursor-not-allowed"
                          style={{ color: "#184036" }}
                          title="Travado: calculado por preço USD × dólar × markup por tamanho"
                        >
                          {precoPedra > 0
                            ? `R$ ${precoPedra.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "—"}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {precoCompraUsdLive > 0 && cotacaoDolar > 0 && markupLive > 0 ? (
                            <>USD {precoCompraUsdLive.toFixed(2)} × R$ {cotacaoDolar.toFixed(2)} × {markupLive.toFixed(2)} (markup {ct.toFixed(2).replace(".", ",")}ct)</>
                          ) : (
                            "Preencha preço USD acima. Peso da pedra define a faixa de markup."
                          )}
                        </p>
                      </div>

                      {precoPedra > 0 && pontos > 0 && (
                        <div className="text-[11px] text-gray-500 font-mono pt-2 border-t border-gray-200">
                          R$ {(precoPedra / pontos).toFixed(2)}/pt · R$ {(precoPedra / ct).toFixed(2)}/ct
                        </div>
                      )}
                    </div>
                  </section>
                </>
              );
            }

            // ── Produto comum (joia): renderização padrão ──────────────────
            return (
              <>
              {/* ── DADOS BÁSICOS (EDITÁVEIS) ── */}
              <section>
                <p className={sectionTitleCls}>Dados Básicos</p>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                  {/* Galeria de imagens */}
                  {cv.foto && (
                  <div>
                    <p className={labelCls}>Imagens</p>
                    <GaleriaProduto produtoId={produto.id_produto} podeEditar={podeEditar} />
                  </div>
                  )}
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

                  {/* ── Controla Estoque ── */}
                  {userPermissaoControlarEstoque && (
                    <div className="flex items-center justify-between py-2 border-t border-gray-100 mt-2">
                      <div>
                        <span className="text-sm font-medium text-gray-800">Controla Estoque</span>
                        <p className="text-xs text-gray-500">
                          Desligar: produto some do estoque/inventário. Dados preservados.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleControlaEstoque}
                        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none shrink-0"
                        style={{ backgroundColor: (produto.controla_estoque ?? true) ? C.esmeralda : "#D1D5DB" }}
                        role="switch"
                        aria-checked={produto.controla_estoque ?? true}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                          style={{ transform: (produto.controla_estoque ?? true) ? "translateX(18px)" : "translateX(2px)" }}
                        />
                      </button>
                    </div>
                  )}

                  {showAvancado && (<>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className={labelCls}>Tipo de item</p>
                      <select
                        value={tipoItemEdit}
                        onChange={(e) => setTipoItemEdit(e.target.value as "" | "joia" | "insumo" | "servico")}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      >
                        <option value="">— Sem classificação —</option>
                        <option value="joia">Joia</option>
                        <option value="insumo">Insumo</option>
                        <option value="servico">Serviço</option>
                      </select>
                    </div>
                    <div>
                      <p className={labelCls}>Fornecedor</p>
                      <input
                        type="text"
                        value={fornecedorEdit}
                        onChange={(e) => setFornecedorEdit(e.target.value)}
                        placeholder="—"
                        list="drawer-fornecedores-options"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      />
                      <datalist id="drawer-fornecedores-options">
                        {fornecedoresOpts.map((f) => <option key={f} value={f} />)}
                      </datalist>
                    </div>
                  </div>
                  {tipoItemEdit === "servico" && (
                  <div className="mt-3">
                    <p className={labelCls}>Preço do Serviço (R$)</p>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={precoServicoEdit}
                      onChange={(e) => setPrecoServicoEdit(e.target.value)}
                      placeholder="0,00"
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                    />
                  </div>
                  )}
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
                  </>)}
                </div>
              </section>


              {/* ── BOM (COMPOSIÇÃO) ── (só modo avançado) */}
              {showAvancado && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <p className={sectionTitleCls}>Apontamento Padrão</p>
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
              )}

              {/* ── FICHA TÉCNICA (foto + medidas) ── */}
              {cv.ficha_tecnica && (
              <section>
                <p className={sectionTitleCls}>Ficha Técnica</p>

                {/* Medidas — largura, altura, base (mm). Opcionais. */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div>
                    <p className={labelCls}>Largura (mm)</p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={larguraAro}
                      onChange={(e) => setLarguraAro(e.target.value)}
                      placeholder="—"
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                    />
                  </div>
                  <div>
                    <p className={labelCls}>Altura (mm)</p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={alturaAro}
                      onChange={(e) => setAlturaAro(e.target.value)}
                      placeholder="—"
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                    />
                  </div>
                  <div>
                    <p className={labelCls}>Base (mm)</p>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={baseVal}
                      onChange={(e) => setBaseVal(e.target.value)}
                      placeholder="—"
                      className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                    />
                  </div>
                </div>

                <input
                  ref={fichaTecnicaInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => { setFichaTecnicaUploadBase64(ev.target?.result as string); setExtrasDirty(true); };
                    reader.readAsDataURL(f);
                    e.target.value = "";
                  }}
                />
                {(fichaTecnicaUploadBase64 || fichaTecnicaUrl) ? (
                  <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
                    <img
                      src={fichaTecnicaUploadBase64 ?? fichaTecnicaUrl ?? ""}
                      alt="Ficha técnica"
                      className="w-full h-48 object-contain bg-gray-50"
                    />
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        type="button"
                        onClick={() => fichaTecnicaInputRef.current?.click()}
                        className="p-1.5 rounded-lg bg-white/95 hover:bg-white shadow-md text-gray-700"
                        title="Trocar foto"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (fichaTecnicaUploadBase64) {
                            // Apenas descarta upload pendente (não foi salvo ainda)
                            setFichaTecnicaUploadBase64(null);
                          } else if (produto) {
                            if (!confirm("Remover foto de ficha técnica?")) return;
                            await fetch(`/api/produtos/${produto.id_produto}/ficha-tecnica`, { method: "DELETE" });
                            setFichaTecnicaUrl(null);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-white/95 hover:bg-white shadow-md text-red-500"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fichaTecnicaInputRef.current?.click()}
                    className="w-full border-2 border-dashed rounded-lg py-8 text-center hover:bg-gray-50"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    <Camera className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                    <p className="text-sm text-gray-500">Adicionar foto da ficha técnica</p>
                    <p className="text-[10px] text-gray-400">JPG, PNG, WEBP</p>
                  </button>
                )}
                {fichaTecnicaUploadBase64 && (
                  <p className="text-[10px] mt-1 text-blue-600">
                    Foto será salva ao clicar em &quot;Salvar alterações&quot;.
                  </p>
                )}
              </section>
              )}

              {/* ── PRECIFICAÇÃO (editável) ── sempre visível */}
              <section>
                <p className={sectionTitleCls}>Ficha Técnica &amp; Preço</p>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                  {/* Peso e Markup */}
                  <div className="grid gap-3" style={{ gridTemplateColumns: [cv.peso_aprox, cv.markup].filter(Boolean).length === 2 ? (showAvancado ? "repeat(3,1fr)" : "repeat(2,1fr)") : "1fr" }}>
                  {cv.peso_aprox && (
                    <div>
                      <p className={labelCls}>Peso aproximado (g)</p>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={pesoEdit}
                        onChange={(e) => podeEditar && setPesoEdit(e.target.value)}
                        readOnly={!podeEditar}
                        placeholder="—"
                        className={`w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono focus:outline-none ${!podeEditar ? "bg-gray-100 text-gray-500 cursor-not-allowed" : "text-gray-800 bg-white focus:border-[#184036]"}`}
                      />
                    </div>
                  )}
                    {cv.markup && (
                    <div>
                      <p className={labelCls}>Markup <span className="text-gray-400 normal-case tracking-normal">(somente leitura)</span></p>
                      <input
                        type="text"
                        value={markupEdit || "—"}
                        readOnly
                        disabled
                        title="O markup só pode ser alterado na tela /precificação"
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-500 bg-gray-100 cursor-not-allowed"
                      />
                      <a
                        href="/precificacao"
                        className="text-[10px] text-blue-600 hover:underline mt-0.5 inline-block"
                      >
                        Alterar em /precificação →
                      </a>
                    </div>
                    )}
                    {showAvancado && (
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
                    )}
                  </div>
                  {showAvancado && (
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
                  )}
                  {/* ── PREÇO DE VENDA OFICIAL (calculado pelo ERP) ── */}
                  {cv.preco_venda && (
                  <div className="rounded-lg border-2 p-4" style={{ borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" }}>
                    <p className="text-[10px] uppercase tracking-widest font-bold mb-1" style={{ color: "#065F46" }}>
                      Preço de Venda (oficial do ERP)
                    </p>
                    {(() => {
                      const parseNum = (v: string | number | null | undefined) => {
                        if (v == null) return 0;
                        if (typeof v === "number") return isNaN(v) ? 0 : v;
                        let t = String(v).trim();
                        if (!t) return 0;
                        if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
                        else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
                        const n = parseFloat(t);
                        return isNaN(n) ? 0 : n;
                      };
                      const pesoLive   = parseNum(pesoEdit);
                      const markupLive = parseNum(markupEdit);
                      const fatorLive  = parseNum(fatorEdit) || 1;
                      const podeCalc = pesoLive > 0 && markupLive > 0 && cotacaoOuro > 0 && curvaConfig != null;
                      const subtotalPedrasOficial = pedrasComp.reduce((s, p) => s + p.preco_unitario * p.quantidade, 0);
                      // Curva canônica (mesma fórmula da aba /precificacao):
                      //   preço = peso × (cotacao × fator) × (goldCostPct/100) × markup → arredondado
                      // O `fator` é específico do SKU e multiplica a cotação (default 1 quando ausente).
                      const precoOuroLive = podeCalc
                        ? calcularPrecoSync(
                            pesoLive,
                            cotacaoOuro * fatorLive,
                            markupLive,
                            curvaConfig!.arredondamento,
                            curvaConfig!.goldCostPercentage,
                          )
                        : null;
                      const precoLive = precoOuroLive != null ? precoOuroLive + subtotalPedrasOficial : null;
                      const toStrCmp = (v: unknown) => (v == null ? "" : String(v));
                      const editando =
                        (pesoEdit || "")   !== toStrCmp(produto.peso_precificado) ||
                        (markupEdit || "") !== toStrCmp(produto.markup) ||
                        (fatorEdit || "")  !== toStrCmp(produto.fator);

                      if (editando && precoLive != null) {
                        return (
                          <>
                            <p className="text-2xl font-mono font-bold" style={{ color: "#184036" }}>
                              {formatPreco(String(precoLive))}
                              <sup className="ml-1 text-[10px] font-bold text-blue-600">preview</sup>
                            </p>
                            <p className="text-[11px] text-blue-600 mt-1">Salve para aplicar o novo preço</p>
                          </>
                        );
                      }
                      if (produto.preco_curva != null && produto.preco_curva > 0) {
                        const precoTotalBase = Number(produto.preco_curva) + subtotalPedrasOficial;
                        return (
                          <>
                            <p className="text-2xl font-mono font-bold" style={{ color: "#184036" }}>
                              {formatPreco(String(precoTotalBase || produto.preco_curva))}
                              <sup className="ml-1 text-[10px] font-bold" style={{ color: "#059669" }}>C</sup>
                            </p>
                            <p className="text-[11px] text-gray-500 mt-1">peso × cotação × markup × fator (curva){subtotalPedrasOficial > 0 ? " + pedras" : ""}</p>
                          </>
                        );
                      }
                      return (
                        <>
                          <p className="text-2xl font-mono text-gray-400">—</p>
                          <p className="text-[11px] text-gray-500 mt-1">Preencha peso e markup acima</p>
                        </>
                      );
                    })()}
                  </div>
                  )}

                </div>
              </section>

              {/* ── PEDRAS DO CATÁLOGO (só precificação — NÃO abate estoque) ── */}
              {cv.pedras_catalogo && (
              <section>
                <p className={sectionTitleCls}>Pedras do catálogo <span className="normal-case tracking-normal text-gray-400">(soma ao preço do ouro)</span></p>
                <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                  {/* Seletor */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <p className={labelCls}>Pedra</p>
                      <select
                        value={pedraSelId}
                        onChange={(e) => setPedraSelId(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      >
                        <option value="">— selecione —</option>
                        {catalogoPedras.map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.nome} — {p.preco_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-20">
                      <p className={labelCls}>Qtd</p>
                      <input
                        type="number"
                        min={1}
                        value={pedraSelQtd}
                        onChange={(e) => setPedraSelQtd(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-gray-200 rounded-md text-sm font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const pedra = catalogoPedras.find((p) => p.id === Number(pedraSelId));
                        if (!pedra) return;
                        const qtd = Math.max(1, parseInt(pedraSelQtd) || 1);
                        // Se já existe essa pedra, soma a quantidade
                        const existente = pedrasComp.find((p) => p.pedra_produto_id === pedra.id);
                        if (existente) {
                          setPedrasComp((prev) => prev.map((p) =>
                            p.pedra_produto_id === pedra.id
                              ? { ...p, quantidade: p.quantidade + qtd }
                              : p
                          ));
                        } else {
                          setPedrasComp((prev) => [...prev, {
                            _key: `new-${pedra.id}-${Date.now()}`,
                            pedra_produto_id: pedra.id,
                            nome: pedra.nome,
                            preco_unitario: pedra.preco_unitario,
                            quantidade: qtd,
                          }]);
                        }
                        setPedraSelId("");
                        setPedraSelQtd("1");
                      }}
                      disabled={!pedraSelId}
                      className="px-3 py-1.5 rounded-md text-sm font-semibold text-white disabled:opacity-40"
                      style={{ backgroundColor: "#184036" }}
                    >
                      + Add
                    </button>
                  </div>

                  {/* Lista de pedras adicionadas */}
                  {pedrasComp.length > 0 && (
                    <div className="space-y-1.5">
                      {pedrasComp.map((p) => (
                        <div key={p._key} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200 text-sm">
                          <span className="font-medium text-gray-800 flex-1 truncate">{p.nome}</span>
                          <span className="text-gray-500 font-mono text-xs mx-2">×{p.quantidade}</span>
                          <span className="text-gray-700 font-mono text-xs mr-3">
                            {(p.preco_unitario * p.quantidade).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                          </span>
                          <button
                            type="button"
                            onClick={() => setPedrasComp((prev) => prev.filter((x) => x._key !== p._key))}
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}

                      {/* Breakdown Ouro / Pedras / TOTAL */}
                      {cv.composicao_preco && (() => {
                        const parseNum = (v: string | number | null | undefined) => {
                          if (v == null) return 0;
                          if (typeof v === "number") return isNaN(v) ? 0 : v;
                          let t = String(v).trim();
                          if (!t) return 0;
                          if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
                          const n = parseFloat(t);
                          return isNaN(n) ? 0 : n;
                        };
                        const precoOuro = parseNum(produto?.preco_curva);
                        const subtotalPedras = pedrasComp.reduce((s, p) => s + p.preco_unitario * p.quantidade, 0);
                        const total = precoOuro + subtotalPedras;
                        const qtdTotal = pedrasComp.reduce((s, p) => s + p.quantidade, 0);
                        return (
                          <div className="mt-2 rounded-lg border p-3 space-y-1 text-sm" style={{ borderColor: "#A7F3D0", backgroundColor: "#ECFDF5" }}>
                            <div className="flex justify-between text-gray-600">
                              <span>Ouro</span>
                              <span className="font-mono">{precoOuro > 0 ? precoOuro.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</span>
                            </div>
                            <div className="flex justify-between text-gray-600">
                              <span>Pedras ({qtdTotal} un)</span>
                              <span className="font-mono">{subtotalPedras.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
                            </div>
                            <div className="flex justify-between font-bold border-t border-green-200 pt-1 mt-1" style={{ color: "#065F46" }}>
                              <span>TOTAL</span>
                              <span className="font-mono">{precoOuro > 0 ? total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {pedrasComp.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">Nenhuma pedra vinculada — opcional</p>
                  )}
                </div>
              </section>
              )}

              {/* ── CAMPOS EDITÁVEIS ── (só modo avançado) */}
              {showAvancado && (
              <section>
                <p className={sectionTitleCls}>Dados ERP (editável)</p>
                <div className="space-y-3">
                  {/* tem_pedra_preciosa: detectado automaticamente no save a
                      partir do Apontamento Padrão (composição). Toggle removido. */}

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
              )}

              {/* ── PRODUÇÃO: REPOSIÇÃO + TEMPO DE FABRICAÇÃO ── */}
              <section>
                <p className={sectionTitleCls}>Produção</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Estoque mínimo</label>
                      <input
                        type="number"
                        min={0}
                        value={estoqueMinimoEdit}
                        onChange={(e) => { setEstoqueMinimoEdit(e.target.value); setExtrasDirty(true); }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:border-[#184036]"
                        placeholder="0"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Abaixo disso → OF automática.
                      </p>
                    </div>
                    <div>
                      <label className={labelCls}>Tempo fabricação (dias)</label>
                      <input
                        type="number"
                        min={0}
                        value={tempoFabricacaoDias}
                        onChange={(e) => { setTempoFabricacaoDias(e.target.value); setExtrasDirty(true); }}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:border-[#184036]"
                        placeholder="—"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Prazo padrão pro cliente.
                      </p>
                    </div>
                    <div className="flex flex-col">
                      <label className={labelCls}>Reposição ativa</label>
                      <button
                        type="button"
                        onClick={() => { setReposicaoAtiva((v) => !v); setExtrasDirty(true); }}
                        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none mt-2"
                        style={{ backgroundColor: reposicaoAtiva ? C.esmeralda : "#D1D5DB" }}
                        role="switch"
                        aria-checked={reposicaoAtiva}
                      >
                        <span
                          className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                          style={{ transform: reposicaoAtiva ? "translateX(18px)" : "translateX(2px)" }}
                        />
                      </button>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Liga/desliga OFs auto.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {cv.rota_fabricacao && (
              <section>
                <div className="flex items-center justify-between gap-2">
                  <p className={sectionTitleCls}>Rota de Fabricação</p>
                  <button
                    type="button"
                    onClick={() => setMostrarTemplate(true)}
                    className="text-[11px] font-semibold px-2 py-1 rounded border hover:bg-white"
                    style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                    title="Aplicar template cadastrado em /rotas-padrao"
                  >
                    📋 Aplicar template…
                  </button>
                </div>
                <div
                  className="rounded-lg border-2 p-3"
                  style={{ borderColor: "#A7D7B8", backgroundColor: "#F0F7F4" }}
                >
                  {rotaEtapas.length === 0 ? (
                    <p className="text-[12px] py-2" style={{ color: "#6B7280" }}>
                      Nenhuma etapa cadastrada.
                    </p>
                  ) : (
                    <div className="space-y-1.5 mb-2">
                      {rotaEtapas.map((sid, idx) => {
                        const setor = setoresDisponiveis.find((s) => s.id === sid);
                        return (
                          <div
                            key={`${sid}-${idx}`}
                            className="flex items-center gap-2 bg-white rounded-md px-2 py-1.5 border"
                            style={{ borderColor: C.cremeBorder }}
                          >
                            <span
                              className="text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center"
                              style={{ backgroundColor: C.esmeralda, color: "#F3EADA" }}
                            >
                              {idx + 1}
                            </span>
                            <span className="flex-1 text-sm" style={{ color: "#111827" }}>
                              {setor?.nome ?? `Setor #${sid}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (idx === 0) return;
                                const arr = [...rotaEtapas];
                                [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                setRotaEtapas(arr); setExtrasDirty(true);
                              }}
                              disabled={idx === 0}
                              className="text-[11px] px-1 disabled:opacity-30"
                              title="Subir"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (idx === rotaEtapas.length - 1) return;
                                const arr = [...rotaEtapas];
                                [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                setRotaEtapas(arr); setExtrasDirty(true);
                              }}
                              disabled={idx === rotaEtapas.length - 1}
                              className="text-[11px] px-1 disabled:opacity-30"
                              title="Descer"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              onClick={() => { setRotaEtapas(rotaEtapas.filter((_, i) => i !== idx)); setExtrasDirty(true); }}
                              className="p-1 rounded hover:bg-red-50 text-red-500"
                              title="Remover"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <select
                    onChange={(e) => {
                      const sid = parseInt(e.target.value);
                      if (Number.isInteger(sid) && sid > 0) {
                        setRotaEtapas([...rotaEtapas, sid]); setExtrasDirty(true);
                        e.target.value = "";
                      }
                    }}
                    defaultValue=""
                    className="w-full border rounded-md px-2 py-1.5 text-sm bg-white outline-none"
                    style={{ borderColor: C.cremeBorder, color: "#374151" }}
                  >
                    <option value="" disabled>+ Adicionar etapa…</option>
                    {setoresDisponiveis.length === 0 && (
                      <option value="" disabled>Nenhum setor cadastrado — cadastre em /setores</option>
                    )}
                    {setoresDisponiveis.map((s) => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>

                  {setoresDisponiveis.length === 0 && (
                    <p className="text-[10px] mt-1" style={{ color: "#9A3412" }}>
                      Vá até <a href="/setores" target="_blank" rel="noopener" className="underline font-semibold">/setores</a> pra cadastrar setores.
                    </p>
                  )}
                </div>
              </section>
              )}


              {/* ── VARIAÇÕES (só se for pai) ── (só modo avançado) */}
              {showAvancado && produto.eh_pai && variacoes.length > 0 && (
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

              {/* ── Toggle "Ver dados avançados" ── */}
              {cv.dados_avancados && (
              <section className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowAvancado(v => !v)}
                  className="text-xs font-semibold px-4 py-2 rounded-lg border hover:bg-gray-50 flex items-center gap-1.5"
                  style={{ borderColor: C.cremeBorder, color: "#6b7280" }}
                >
                  {showAvancado ? (
                    <>▴ Ocultar dados avançados</>
                  ) : (
                    <>▾ Ver dados avançados (metal, categoria, BOM, medidas, variações)</>
                  )}
                </button>
              </section>
              )}
              </>
            );
          })()}
        </div>

        {/* Footer — Save */}
        {produto && podeEditar && (
          <div
            className="shrink-0 px-5 py-4 border-t bg-white"
            style={{ borderColor: C.cremeBorder }}
          >
            {/* REGRA DE NEGÓCIO: no modo "replicar tudo", o BOM já é propagado
                automaticamente no próprio save do pai. */}
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
            {tinySyncMsg && (
              <div
                className={`mb-3 flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
                  tinySyncMsg.ok
                    ? "bg-green-50 text-green-700 border-green-100"
                    : "bg-red-50 text-red-600 border-red-100"
                }`}
              >
                <AlertCircle size={12} />
                {tinySyncMsg.texto}
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

      {confirmDesligarEstoque && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setConfirmDesligarEstoque(false)}>
          <div className="bg-white rounded-xl p-6 max-w-sm mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-800 mb-2">Desligar controle de estoque?</h3>
            <p className="text-sm text-gray-600 mb-4">
              Este produto não será mais rastreado no estoque/inventário. Os dados de estoque serão preservados.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDesligarEstoque(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  setConfirmDesligarEstoque(false);
                  patchControlaEstoque(false);
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: "#DC2626" }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {mostrarTemplate && produto && (
        <AplicarTemplateModal
          produtoId={produto.id_produto}
          categoriaProduto={categoriaEdit || null}
          onClose={() => setMostrarTemplate(false)}
          onAplicado={async () => {
            // Após aplicar via API, recarrega etapas locais
            try {
              const r = await fetch(`/api/produtos/${produto.id_produto}/rota`);
              if (r.ok) {
                const d = await r.json() as { etapas?: { setor_id: number }[] };
                setRotaEtapas((d.etapas ?? []).map((e) => Number(e.setor_id)));
              }
            } catch { /* ignore */ }
          }}
        />
      )}
    </>
  );
}
