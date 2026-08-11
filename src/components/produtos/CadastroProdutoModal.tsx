"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X, ChevronRight, ChevronLeft, Plus, Trash2, Search,
  AlertCircle, Loader2, Check, Camera,
} from "lucide-react";
import {
  getPricingFactors,
  calcularPrecoSync,
  type CurvaConfig,
  type CurvaCategoriaInput,
} from "@/lib/curva-precificacao";
import { createClient } from "@/lib/supabase/client";
import AplicarTemplateModal from "@/components/produtos/AplicarTemplateModal";

// Roles que veem o bloco de Precificação automática (preview de markup/preço).
// Demais usuários (admin, gerentes, etc.) NÃO vêem esse cálculo.
const ROLES_VE_PRECIFICACAO = new Set(["desenvolvedor", "diretor", "admin"]);

// Roles que podem cadastrar produto com campos vazios (bypass das validações
// obrigatórias). Útil pra Alisson cadastrar rascunho rápido — fábrica/loja
// continua exigindo 100% preenchido.
const ROLES_BYPASS_VALIDACAO = new Set(["desenvolvedor", "diretor", "admin"]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsumoOpt {
  id: number;
  descricao: string;
  unidade: string;
  categoria_id: number;
  peso_pedra?: number | null;
}

interface BomItemLocal {
  _key: string;
  insumo_id: number;
  insumo_nome: string;
  tipo: "metal" | "pedra" | "outro";
  quantidade: number;
  tamanho: number | null;
  observacao: string | null;
}

// Pedra cadastrada no catálogo (categoria='Pedras') — usada como
// componente pra somar ao preço do produto novo.
interface PedraCatalogo {
  id: number;
  nome: string;
  preco_unitario: number;
  peso_g: number | null;
}

// Pedra-componente selecionada no cadastro do produto.
interface PedraComponenteLocal {
  _key: string;
  pedra_produto_id: number;
  nome: string;
  preco_unitario: number;
  quantidade: number;
}

type RegraIncremental = {
  tipo: "incremental";
  base_numeracao: number;
  incremento_por_numero: number;
};
type RegraTabela = {
  tipo: "tabela";
  valores: Record<string, number>;
};
type RegraPeso = RegraIncremental | RegraTabela;

// ─── Constants ────────────────────────────────────────────────────────────────

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

const TIPO_METAL_OPTS = ["Ouro Amarelo 18k", "Ouro Branco 18k", "Ouro Rosé 18k", "Prata"];
const COR_METAL_OPTS = ["Amarelo", "Branco", "Rosé"];

// ─── Helper de normalização de entrada numérica ───────────────────────────────

function parseNumericInput(value: string | number): number {
  if (typeof value === "number") return value;
  let t = value.toString().trim();
  if (!t) return 0;
  if (t.includes(",")) {
    // Vírgula = decimal BR → remove pontos (milhar), troca vírgula por ponto
    t = t.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    // Só pontos com grupos de 3 dígitos = separador de milhar BR
    t = t.replace(/\./g, "");
  }
  return parseFloat(t) || 0;
}

// Precificação canônica: ver src/lib/curva-precificacao.ts (única fonte do sistema)

// ── Detecção automática de categoria pelo nome do produto ────────────────────
const CAT_KEYWORDS: Record<string, string[]> = {
  "Anel":        ["anel", "aneis"],
  "Pulseira":    ["pulseira", "pulseiras"],
  "Pingente":    ["pingente", "pingentes"],
  "Corrente":    ["corrente", "correntes", "cordao"],
  "Brinco":      ["brinco", "brincos", "argola", "argolas", "tarracha", "tarrachas"],
  "Alianças":    ["alianca", "aliancas"],
  "Bracelete":   ["bracelete", "braceletes"],
  "Escapulário": ["escapulario", "escapularios"],
  "Piercing":    ["piercing", "piercings"],
  "Colar":       ["colar", "colares", "gargantilha", "choker", "riviera"],
  "Pedras":      ["pedra", "pedras"],
};
const CAT_STOPWORDS = new Set(["par", "pares", "de", "da", "do", "a", "o", "um", "uma", "ref"]);

function normalizarNome(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

function detectarCategoriaPorNome(nome: string): string | null {
  const norm = normalizarNome(nome);
  const words = norm.split(/\s+/).filter(Boolean);
  const significante = words.find((w) => !CAT_STOPWORDS.has(w));
  if (!significante) return null;
  for (const [cat, kws] of Object.entries(CAT_KEYWORDS)) {
    if (kws.some((k) => significante === k)) return cat;
  }
  return null;
}

/**
 * Detecta categoria completa "Pai -> Sub" a partir do nome.
 * Ex: "Anel Feminino Diamante"     → "Anel -> Feminino"
 *     "Pingente Religioso N Sra"   → "Pingente -> Religioso"
 *     "Corrente Infantil Baby"     → "Corrente -> Infantil"
 */
const SUBCATEGORIAS: Record<string, string> = {
  feminino: "Feminino",
  feminina: "Feminino",
  masculino: "Masculino",
  masculina: "Masculino",
  infantil: "Infantil",
  baby: "Baby",
  religioso: "Religioso",
  religiosa: "Religioso",
  formatura: "Formatura",
  adulto: "Adulto",
};

function detectarCategoriaCompleta(nome: string): string | null {
  const pai = detectarCategoriaPorNome(nome);
  if (!pai) return null;
  const norm = normalizarNome(nome);
  const words = norm.split(/\s+/);
  for (const w of words) {
    if (SUBCATEGORIAS[w]) return `${pai} -> ${SUBCATEGORIAS[w]}`;
  }
  return pai;
}

/**
 * Detecta tipo de metal pelo nome. Default: Ouro Amarelo 18k.
 */
function detectarTipoMetalPorNome(nome: string): string {
  const n = normalizarNome(nome);
  if (/\bprata\b/.test(n)) return "Prata";
  if (/\bouro\s+branco\b|\bouro\s+br\b|\bbranco\b/.test(n)) return "Ouro Branco 18k";
  if (/\bouro\s+rose\b|\brose\b/.test(n)) return "Ouro Rose 18k";
  return "Ouro Amarelo 18k";
}

/**
 * Detecta se o produto TEM pedra preciosa pelo nome.
 */
const KEYWORDS_PEDRA = [
  "diamante", "diamantes", "brilhante", "brilhantes",
  "moissanit", "moissanite", "moissanites",
  "safira", "safiras", "esmeralda", "esmeraldas",
  "rubi", "rubis", "ametista", "ametistas",
  "topazio", "topázio", "topazios",
  "zirconia", "zirconias",
  "aguamarinha", "agua-marinha", "aguas-marinhas",
  "espinelio", "espinélio", "peridoto",
];
function detectarTemPedraPorNome(nome: string): boolean {
  const n = normalizarNome(nome);
  return KEYWORDS_PEDRA.some((k) => n.includes(normalizarNome(k)));
}

/**
 * Numerações padrão por categoria/subcategoria completa.
 * Para anéis e alianças: grade completa de 1 a 35 (cobre todos os tamanhos).
 */
const NUMERACOES_1_A_35 = Array.from({ length: 35 }, (_, i) => i + 1);

function getNumeracoesPadrao(categoriaCompleta: string | null): number[] {
  if (!categoriaCompleta) return NUMERACOES_1_A_35;
  const c = categoriaCompleta.toLowerCase();
  if (c.includes("anel")) return NUMERACOES_1_A_35;
  if (c.includes("alianca") || c.includes("aliança")) return NUMERACOES_1_A_35;
  return NUMERACOES_1_A_35;
}

/**
 * Base de numeração (peso referência) padrão.
 */
function getBaseNumeracaoPadrao(categoriaCompleta: string | null): number {
  if (!categoriaCompleta) return 16;
  const c = categoriaCompleta.toLowerCase();
  if (c.includes("anel") && c.includes("masculino")) return 22;
  if (c.includes("anel") && c.includes("feminino"))  return 15;
  if (c.includes("alianca") || c.includes("aliança")) return 18;
  return 16;
}

/**
 * Define se o produto TIPICAMENTE tem variações pela categoria.
 *   Anel / Aliança → SIM (tamanhos 14, 16, 18...)
 *   Demais (pingente, brinco, colar, pulseira, etc.) → NÃO (peça única)
 */
function temVariacoesPorCategoria(categoriaCompleta: string | null): boolean {
  if (!categoriaCompleta) return false; // sem categoria detectada → assume peça única
  const c = categoriaCompleta.toLowerCase();
  return c.includes("anel") || c.includes("alianca") || c.includes("aliança");
}

const NUMERACOES = NUMERACOES_1_A_35; // 1-35 (completo)
const COMPRIMENTOS_DEFAULT = [38, 40, 42, 45, 50, 55, 60];

function gerarCombinacoes(
  eixos: string[],
  valores: Record<string, unknown[]>
): Record<string, unknown>[] {
  if (eixos.length === 0) return [{}];
  const [first, ...rest] = eixos;
  const vFirst = (valores[first] ?? []) as unknown[];
  const combRest = gerarCombinacoes(rest, valores);
  const out: Record<string, unknown>[] = [];
  for (const v of vFirst) {
    for (const c of combRest) out.push({ ...c, [first]: v });
  }
  return out;
}

function calcPesoVariacao(
  pesoBase: number,
  numeracao: number | undefined,
  regra: RegraPeso | null
): number {
  if (!regra || numeracao == null) return pesoBase;
  if (regra.tipo === "incremental") {
    const diff = numeracao - regra.base_numeracao;
    return Math.max(pesoBase + diff * regra.incremento_por_numero, 0.01);
  }
  return regra.valores[String(numeracao)] ?? pesoBase;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = ["Dados Básicos", "Apontamento", "Ficha Técnica", "Variações"];
  return (
    <div className="flex items-center gap-0">
      {labels.slice(0, total).map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={n} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
                style={{
                  backgroundColor: done ? C.sage : active ? C.esmeralda : "#E5E7EB",
                  color: done || active ? "#fff" : "#9CA3AF",
                }}
              >
                {done ? <Check size={13} /> : n}
              </div>
              <span
                className="text-[9px] font-medium mt-0.5 whitespace-nowrap"
                style={{ color: active ? C.esmeralda : "#9CA3AF" }}
              >
                {label}
              </span>
            </div>
            {i < total - 1 && (
              <div
                className="w-12 h-px mx-1 mb-3"
                style={{ backgroundColor: done ? C.sage : "#E5E7EB" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── BOM form local (não salva, só adiciona ao estado) ─────────────────────────

function BomFormLocal({
  insumos,
  onAdd,
  onCancel,
}: {
  insumos: InsumoOpt[];
  onAdd: (item: BomItemLocal) => void;
  onCancel: () => void;
}) {
  const [insumoId, setInsumoId] = useState("");
  const [tipo, setTipo] = useState<"metal" | "pedra" | "outro">("outro");
  const [quantidade, setQuantidade] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [observacao, setObservacao] = useState("");
  const [busca, setBusca] = useState("");
  const [comboOpen, setComboOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtrados = insumos.filter((i) => {
    if (!i.descricao?.trim()) return false;
    if (tipo === "metal" && i.categoria_id !== 1) return false;
    if (tipo === "pedra" && i.categoria_id !== 2) return false;
    if (tipo === "outro" && (i.categoria_id === 1 || i.categoria_id === 2)) return false;
    if (busca) return i.descricao.toLowerCase().includes(busca.toLowerCase());
    return true;
  });

  function selectInsumo(ins: InsumoOpt) {
    setInsumoId(String(ins.id));
    setBusca(ins.descricao);
    setComboOpen(false);
  }

  function handleTipoChange(t: "metal" | "pedra" | "outro") {
    setTipo(t);
    const ins = insumos.find((i) => String(i.id) === insumoId);
    if (ins) {
      const valid =
        (t === "metal" && ins.categoria_id === 1) ||
        (t === "pedra" && ins.categoria_id === 2) ||
        (t === "outro" && ins.categoria_id !== 1 && ins.categoria_id !== 2);
      if (!valid) { setInsumoId(""); setBusca(""); }
    }
  }

  function handleAdd() {
    if (!insumoId) { setErr("Selecione o insumo"); return; }
    if (!quantidade) { setErr("Informe a quantidade"); return; }
    const ins = insumos.find((i) => String(i.id) === insumoId)!;
    onAdd({
      _key: `${Date.now()}-${insumoId}`,
      insumo_id: Number(insumoId),
      insumo_nome: ins.descricao,
      tipo,
      quantidade: parseFloat(quantidade),
      tamanho: tamanho ? parseFloat(tamanho) : null,
      observacao: observacao.trim() || null,
    });
  }

  const selectCls =
    "w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm bg-white focus:outline-none focus:border-[#184036] transition-colors";
  const tipoBtns: Array<{ v: "metal" | "pedra" | "outro"; label: string }> = [
    { v: "metal", label: "Metal" },
    { v: "pedra", label: "Pedra" },
    { v: "outro", label: "Outro" },
  ];

  return (
    <div className="border border-[#184036]/20 rounded-lg p-3 bg-[#FAFAF7] space-y-2.5">
      {err && (
        <div className="flex items-center gap-1.5 text-red-600 text-xs bg-red-50 rounded px-2 py-1.5">
          <AlertCircle size={12} /> {err}
        </div>
      )}

      {/* Tipo */}
      <div>
        <label className={labelCls}>Tipo</label>
        <div className="flex gap-1.5">
          {tipoBtns.map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => handleTipoChange(v)}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: tipo === v ? C.esmeralda : "#F3F4F6",
                color: tipo === v ? "#fff" : "#4B5563",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Insumo */}
      <div>
        <label className={labelCls}>Insumo</label>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            className="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-2 text-sm bg-white focus:outline-none focus:border-[#184036] transition-colors"
            placeholder="Buscar insumo..."
            value={busca}
            onChange={(e) => { setBusca(e.target.value); setComboOpen(true); setInsumoId(""); }}
            onFocus={() => setComboOpen(true)}
          />
          {comboOpen && filtrados.length > 0 && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filtrados.slice(0, 50).map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                  onClick={() => selectInsumo(i)}
                >
                  <span className="font-medium text-gray-800">{i.descricao}</span>
                  <span className="text-gray-400 text-xs ml-1">({i.unidade})</span>
                </button>
              ))}
              {filtrados.length > 50 && (
                <div className="px-3 py-1.5 text-xs text-gray-400 bg-gray-50">
                  +{filtrados.length - 50} — refine a busca
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Quantidade / Tamanho */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>
            {tipo === "pedra" ? "Qtd (un)" : "Peso (g)"}
          </label>
          <input
            type="number"
            min="0"
            step={tipo === "pedra" ? "1" : "0.01"}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className={selectCls}
            placeholder={tipo === "pedra" ? "6" : "2.50"}
          />
        </div>
        {tipo === "pedra" && (
          <div>
            <label className={labelCls}>Tamanho (ct)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={tamanho}
              onChange={(e) => setTamanho(e.target.value)}
              className={selectCls}
              placeholder="0.10"
            />
          </div>
        )}
      </div>

      {/* Observação */}
      <div>
        <label className={labelCls}>Observação</label>
        <input
          type="text"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          className={selectCls}
          placeholder="Opcional"
        />
      </div>

      {/* Botões */}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={handleAdd}
          className="flex-1 py-1.5 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: C.esmeralda }}
        >
          Adicionar
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (produtoId: number, sku: string) => void;
}

export default function CadastroProdutoModal({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1); // preservado para compat (validações só)
  // Seções expansíveis (substituem o stepper antigo)
  const [expandComp, setExpandComp]     = useState(false);
  const [expandMed,  setExpandMed]      = useState(false);
  const [expandVar,  setExpandVar]      = useState(false);
  const [saving, setSaving] = useState(false);
  const [globalErr, setGlobalErr] = useState<string | null>(null);

  // Setup data
  const [nextSku, setNextSku] = useState("");
  const [nextSkuAJ, setNextSkuAJ] = useState("");
  const [curvaCategorias, setCurvaCategorias] = useState<CurvaCategoriaInput[]>([]);
  const [curvaConfig, setCurvaConfig] = useState<CurvaConfig | null>(null);
  const [cotacao, setCotacao] = useState({ ouro: 860, dollar: 5.24 });
  // Setores cadastrados (para rota de fabricação)
  const [setoresDisponiveis, setSetoresDisponiveis] = useState<{ id: number; nome: string }[]>([]);
  // Role do usuário logado (controla visibilidade do bloco de precificação)
  const [userRole, setUserRole] = useState<string | null>(null);
  const [insumos, setInsumos] = useState<InsumoOpt[]>([]);
  const [loadingSetup, setLoadingSetup] = useState(false);

  // Step 1: Dados básicos
  const [nome, setNome] = useState("");
  const [temVariacoes, setTemVariacoes] = useState(true);
  const [sku, setSku] = useState("");
  const [tipoMetal, setTipoMetal] = useState("Ouro Amarelo 18k");
  const [corMetal, setCorMetal] = useState("Amarelo");
  const [peso, setPeso] = useState("");
  const [markup, setMarkup] = useState("");
  const [fator] = useState("1");
  const [categoria, setCategoria] = useState("");
  const [categoriaGeral, setCategoriaGeral] = useState(""); // Anel, Pulseira, etc. — detectada pelo nome
  const [temPedra, setTemPedra] = useState(false);
  const [fornecedor, setFornecedor] = useState("");
  const [fornecedoresSugeridos, setFornecedoresSugeridos] = useState<string[]>([]);
  const [foto, setFoto] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);
  // Estoque inicial + reposição automática + rota de fabricação
  const [estoqueInicial, setEstoqueInicial] = useState("0");
  const [estoqueMinimo, setEstoqueMinimo] = useState("0");
  const [tempoFabricacaoDias, setTempoFabricacaoDias] = useState("");
  const [rotaEtapas, setRotaEtapas] = useState<number[]>([]); // setor_ids na ordem desejada
  const [mostrarTemplate, setMostrarTemplate] = useState(false);

  // Step 2: BOM
  const [bom, setBom] = useState<BomItemLocal[]>([]);
  const [showBomForm, setShowBomForm] = useState(false);

  // Pedras-componente (para precificação automática: catálogo de pedras × qtd)
  const [pedrasComp, setPedrasComp] = useState<PedraComponenteLocal[]>([]);
  const [catalogoPedras, setCatalogoPedras] = useState<PedraCatalogo[]>([]);
  const [pedraSelId, setPedraSelId] = useState<string>("");
  const [pedraSelQtd, setPedraSelQtd] = useState<string>("1");

  // Step 3: Ficha Técnica (substituiu Medidas — campos legados mantidos só por compat)
  const [larguraAro, setLarguraAro] = useState("");
  const [alturaAro, setAlturaAro] = useState("");
  const [base, setBase] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [fotoFichaTecnica, setFotoFichaTecnica] = useState<string | null>(null);
  const fichaTecnicaInputRef = useRef<HTMLInputElement>(null);

  // Step 4: Variações
  // gerarVariacoes é alias de temVariacoes (sincronizados)
  const gerarVariacoes = temVariacoes;
  const setGerarVariacoes = setTemVariacoes;
  const [eixoNumeracao, setEixoNumeracao] = useState(false);
  const [eixoCorMetal, setEixoCorMetal] = useState(false);
  const [eixoComprimento, setEixoComprimento] = useState(false);
  const [numeracoesSel, setNumeracoesSel] = useState<number[]>(NUMERACOES_1_A_35);
  // Quantidade inicial em estoque por numeração (default vazio = 0)
  const [quantidadesVar, setQuantidadesVar] = useState<Record<string, string>>({});
  const [coresSel, setCoresSel] = useState<string[]>(["Amarelo"]);
  const [comprimentosSel, setComprimentosSel] = useState<number[]>([40, 45, 50]);
  const [comprimentoCustom, setComprimentoCustom] = useState("");
  const [tipoRegra, setTipoRegra] = useState<"incremental" | "tabela">("incremental");
  const [baseNumeracao, setBaseNumeracao] = useState(16);
  const [incremento, setIncremento] = useState(0.1);
  const [tabelaPeso, setTabelaPeso] = useState<Record<string, string>>({});

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setStep(1);
    setGlobalErr(null);
    setNome(""); setTemVariacoes(true); setTipoMetal("Ouro Amarelo 18k"); setCorMetal("Amarelo");
    setPeso(""); setMarkup(""); setCategoria(""); setTemPedra(false); setFornecedor("");
    setBom([]); setShowBomForm(false);
    setLarguraAro(""); setAlturaAro(""); setBase(""); setFotoFichaTecnica(null);
    setEixoNumeracao(false); setEixoCorMetal(false); setEixoComprimento(false);
    setNumeracoesSel(NUMERACOES_1_A_35); setCoresSel(["Amarelo"]);
    setComprimentosSel([40, 45, 50]); setTipoRegra("incremental");
    setBaseNumeracao(16); setIncremento(0.1); setTabelaPeso({}); setQuantidadesVar({});
    setEstoqueInicial("0"); setEstoqueMinimo("0"); setTempoFabricacaoDias(""); setRotaEtapas([]);
    setPedrasComp([]); setPedraSelId(""); setPedraSelQtd("1");
    loadSetup();
  }, [open]);

  const loadSetup = useCallback(async () => {
    setLoadingSetup(true);
    try {
      const [setupRes, insumoRes, fornRes, curvaConfigRes, curvaCategoriasRes, setoresRes, pedrasCatRes] = await Promise.all([
        fetch("/api/produtos/setup"),
        fetch("/api/produtos/insumos"),
        fetch("/api/fornecedores"),
        fetch("/api/precificacao/curva/config"),
        fetch("/api/precificacao/curva/categorias"),
        fetch("/api/setores"),
        fetch("/api/produtos/pedras-catalogo"),
      ]);
      if (pedrasCatRes.ok) {
        const d = await pedrasCatRes.json() as PedraCatalogo[];
        setCatalogoPedras(Array.isArray(d) ? d : []);
      }
      if (setupRes.ok) {
        const d = await setupRes.json() as { nextSku: string; nextSkuAJ: string; cotacao: { ouro: number; dollar: number } };
        setNextSku(d.nextSku);
        setNextSkuAJ(d.nextSkuAJ ?? "AJ1001");
        setSku(d.nextSku); // default: com variações → numérico
        setCotacao(d.cotacao);
      }
      if (insumoRes.ok) {
        const d = await insumoRes.json() as { insumos: InsumoOpt[] };
        setInsumos(d.insumos ?? []);
      }
      if (fornRes.ok) {
        const d = await fornRes.json() as { fornecedores: Array<{ nome: string }> };
        setFornecedoresSugeridos((d.fornecedores ?? []).map((f) => f.nome).filter(Boolean));
      }
      if (curvaConfigRes.ok) {
        const d = await curvaConfigRes.json() as { config: CurvaConfig };
        setCurvaConfig(d.config);
      }
      if (curvaCategoriasRes.ok) {
        const d = await curvaCategoriasRes.json() as { categorias: CurvaCategoriaInput[] };
        setCurvaCategorias((d.categorias ?? []).filter((c) => c.ativo));
      }
      if (setoresRes.ok) {
        const d = await setoresRes.json() as Array<{ id: number; nome: string; ativo: boolean }>;
        setSetoresDisponiveis((d ?? []).filter((s) => s.ativo).map((s) => ({ id: s.id, nome: s.nome })));
      }
      // Role do usuário logado (controla visibilidade do bloco de precificação)
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const role = (user?.user_metadata?.role as string | undefined) ?? null;
        setUserRole(role);
      } catch { /* non-critical */ }
    } catch { /* non-critical */ }
    finally { setLoadingSetup(false); }
  }, []);

  // ── SKU automático ao trocar temVariacoes ─────────────────────────────────
  useEffect(() => {
    setSku(temVariacoes ? nextSku : nextSkuAJ);
  }, [temVariacoes, nextSku, nextSkuAJ]);

  // ── Auto-calcular markup/categoria quando peso muda ───────────────────────
  // Usa curva canônica (mkp interpolado), igual à aba /precificacao.
  useEffect(() => {
    const p = parseNumericInput(peso);
    if (!p || p <= 0 || !curvaConfig || curvaCategorias.length === 0) return;
    const f = getPricingFactors(p, curvaConfig, curvaCategorias);
    setMarkup(f.mkp.toFixed(4));
    setCategoria(f.categoriaNome);
  }, [peso, curvaConfig, curvaCategorias]);

  // ── Auto-detectar categoria + subcategoria + tipo_metal + tem_pedra ───────
  // Trigger: mudança no nome. Sempre sobrescreve valores anteriores para manter
  // sincronia (ex: usuário digita "Anel Feminino" → troca para "Anel Masculino"
  // → os valores são atualizados).
  useEffect(() => {
    if (!nome.trim()) return;
    // 1. Categoria completa (pai + subcategoria)
    const catCompleta = detectarCategoriaCompleta(nome);
    if (catCompleta) setCategoriaGeral(catCompleta);
    // 2. Tipo de metal pelo nome (sobrescreve default)
    const metal = detectarTipoMetalPorNome(nome);
    setTipoMetal(metal);
    // Cor do metal sincroniza com tipo_metal (usado no eixo Cor)
    if (metal === "Ouro Branco 18k") setCorMetal("Branco");
    else if (metal === "Ouro Rose 18k") setCorMetal("Rosé");
    else if (metal === "Prata") setCorMetal("Prata");
    else setCorMetal("Amarelo");
    // 3. Detectar tem pedra preciosa
    if (detectarTemPedraPorNome(nome)) setTemPedra(true);
    // 4. Numerações e base de numeração padrão
    const nums = getNumeracoesPadrao(catCompleta);
    setNumeracoesSel(nums);
    setBaseNumeracao(getBaseNumeracaoPadrao(catCompleta));
    // 5. Anéis e Alianças → ativam variações por tamanho automaticamente
    const temVarAuto = temVariacoesPorCategoria(catCompleta);
    setTemVariacoes(temVarAuto);
    setEixoNumeracao(temVarAuto);
    setExpandVar(temVarAuto); // abre seção de variações na ficha técnica
  }, [nome]);

  // ── Preview de precificação automática ────────────────────────────────────
  // Usa curva canônica (mesma fórmula da aba /precificacao):
  //   preço = peso × cotacao × (goldCostPct/100) × markup → arredondado conforme curva_config
  // No cadastro inicial, fator = 1 (não multiplica cotacao).
  const pesoNum = parseNumericInput(peso);
  const podePrecificar = pesoNum > 0 && curvaConfig != null && curvaCategorias.length > 0;
  const factorsAuto = podePrecificar
    ? getPricingFactors(pesoNum, curvaConfig!, curvaCategorias)
    : null;
  const precoEstimadoAuto = factorsAuto && curvaConfig
    ? calcularPrecoSync(pesoNum, cotacao.ouro, factorsAuto.mkp, curvaConfig.arredondamento, curvaConfig.goldCostPercentage)
    : null;
  // Faixa textual da categoria atual (para exibir no preview), construída a partir
  // da categoria anterior (ordenada por maxWeight) → maxWeight da atual.
  const faixaAtual = (() => {
    if (!factorsAuto || curvaCategorias.length === 0) return null;
    const ordenadas = [...curvaCategorias].sort((a, b) => a.maxWeight - b.maxWeight);
    const idx = ordenadas.findIndex((c) => c.id === factorsAuto.categoriaId);
    if (idx < 0) return null;
    const minW = idx === 0 ? 0.1 : ordenadas[idx - 1].maxWeight;
    const maxW = ordenadas[idx].maxWeight;
    return `${minW}g – ${maxW}g`;
  })();

  // ── Variações: combinações e preview ──────────────────────────────────────

  const eixos = [
    ...(eixoNumeracao ? ["numeracao"] : []),
    ...(eixoCorMetal  ? ["cor_metal"]  : []),
    ...(eixoComprimento ? ["comprimento"] : []),
  ];
  const valores: Record<string, unknown[]> = {
    numeracao: numeracoesSel,
    cor_metal: coresSel,
    comprimento: comprimentosSel,
  };
  const combos = temVariacoes && eixos.length > 0 ? gerarCombinacoes(eixos, valores) : [];

  const regra: RegraPeso | null = eixoNumeracao
    ? tipoRegra === "incremental"
      ? { tipo: "incremental", base_numeracao: baseNumeracao, incremento_por_numero: incremento }
      : { tipo: "tabela", valores: Object.fromEntries(Object.entries(tabelaPeso).map(([k, v]) => [k, parseFloat(v) || 0])) }
    : null;

  function precoEst(pesoVar: number): string {
    if (!curvaConfig || curvaCategorias.length === 0 || pesoVar <= 0) return "—";
    // Para cada variação, recalcula markup pela curva (peso da variação),
    // pois o markup interpola dentro da faixa.
    const f = getPricingFactors(pesoVar, curvaConfig, curvaCategorias);
    const p = calcularPrecoSync(pesoVar, cotacao.ouro, f.mkp, curvaConfig.arredondamento, curvaConfig.goldCostPercentage);
    return p.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // ── Validações por step ────────────────────────────────────────────────────

  // Validações do Step 1 (Dados Básicos) — usado pelo nextStep
  // Roles elevados (Alisson) podem cadastrar com campos vazios — bypass total
  // exceto SKU e Nome (mínimo absoluto pra não quebrar PK/UX).
  const bypassValidacao = userRole != null && ROLES_BYPASS_VALIDACAO.has(userRole);

  function validateStep1(): string | null {
    if (!nome.trim()) return "Nome do produto é obrigatório";
    if (!sku.trim()) return "SKU é obrigatório";
    if (bypassValidacao) return null;
    if (!tipoMetal.trim()) return "Tipo de metal é obrigatório";
    if (!categoriaGeral.trim()) return "Categoria é obrigatória — verifique o nome do produto (não foi possível detectar automaticamente)";
    if (!peso || parseNumericInput(peso) <= 0) return "Peso base deve ser maior que 0";
    if (!curvaConfig || curvaCategorias.length === 0) return "Curva de precificação não carregada — recarregue a página";
    const estIniNum = parseInt(estoqueInicial || "", 10);
    if (!Number.isInteger(estIniNum) || estIniNum < 0) return "Estoque inicial é obrigatório (número ≥ 0)";
    const estMinNum = parseInt(estoqueMinimo || "", 10);
    if (!Number.isInteger(estMinNum) || estMinNum < 0) return "Estoque mínimo é obrigatório (número ≥ 0)";
    const tempoNum = parseInt(tempoFabricacaoDias || "", 10);
    if (!Number.isInteger(tempoNum) || tempoNum <= 0) return "Tempo de fabricação é obrigatório (dias > 0)";
    if (rotaEtapas.length === 0) return "Rota de fabricação é obrigatória — adicione pelo menos 1 etapa";
    if (!fornecedor.trim()) return "Fornecedor é obrigatório";
    if (!foto) return "Foto do produto é obrigatória";
    return null;
  }

  // Validação completa — bloqueia o salvar se qualquer seção estiver incompleta.
  // O modal usa accordions (não steps reais), então quando o erro está num
  // accordion fechado, abrimos ele junto com a mensagem.
  function validateAll(): { erro: string | null; abrir?: "apontamento" | "ficha" } {
    const e1 = validateStep1();
    if (e1) return { erro: e1 };
    if (bypassValidacao) return { erro: null };
    if (bom.length === 0) {
      return {
        erro: "Apontamento Padrão é obrigatório — adicione pelo menos 1 item (ouro/pedra/outro). Abri a seção pra você.",
        abrir: "apontamento",
      };
    }
    if (!fotoFichaTecnica) {
      return {
        erro: "Ficha Técnica é obrigatória — anexe a foto técnica do produto. Abri a seção pra você.",
        abrir: "ficha",
      };
    }
    return { erro: null };
  }

  function nextStep() {
    if (step === 1) {
      const err = validateStep1();
      if (err) { setGlobalErr(err); return; }
    }
    setGlobalErr(null);
    setStep((s) => Math.min(s + 1, 4));
  }

  function prevStep() {
    setGlobalErr(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const { erro, abrir } = validateAll();
    if (erro) {
      setGlobalErr(erro);
      // Abre o accordion correspondente pro user ver o campo faltando
      if (abrir === "apontamento") setExpandComp(true);
      if (abrir === "ficha") setExpandMed(true);
      // Rola pro topo do conteúdo (onde o globalErr fica destacado abaixo)
      const scroller = document.querySelector<HTMLElement>(".cadastro-produto-scroller");
      scroller?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSaving(true);
    setGlobalErr(null);
    try {
      // tem_pedra_preciosa: detectado automaticamente — true se BOM tem item tipo='pedra'
      // OU se já foi inferido pelo nome do produto (lógica antiga preservada).
      const temPedraAuto = temPedra || bom.some((b) => b.tipo === "pedra");

      const body: Record<string, unknown> = {
        nome: nome.trim(),
        sku: sku.trim(),
        tipo_metal: tipoMetal || null,
        // Cor do metal removida do modal — já está implícita no tipo_metal ("Ouro Amarelo 18k")
        peso_precificado: parseNumericInput(peso),
        markup: parseFloat(markup),
        fator: 1,
        categoria_precificacao: categoria || null,
        categoria_geral: categoriaGeral || null,
        tem_pedra_preciosa: temPedraAuto,
        fornecedor: fornecedor.trim() || null,
        localizacao: localizacao.trim() || null,
        foto_base64: foto,
        medidas: {
          largura_aro: larguraAro ? parseFloat(larguraAro) : null,
          altura_aro:  alturaAro  ? parseFloat(alturaAro)  : null,
          base:        base       ? parseFloat(base)       : null,
        },
        composicao: bom.map((b) => ({
          insumo_id: b.insumo_id,
          tipo: b.tipo,
          quantidade: b.quantidade,
          tamanho: b.tamanho,
          observacao: b.observacao,
        })),
      };

      if (temVariacoes && combos.length > 0) {
        body.variacoes = {
          eixos,
          valores,
          regra_peso: regra,
        };
        // Quantidades iniciais de estoque por numeração (só valores > 0)
        const quantidades: Record<string, number> = {};
        for (const [num, val] of Object.entries(quantidadesVar)) {
          const n = parseInt(val || "0", 10);
          if (n > 0) quantidades[num] = n;
        }
        if (Object.keys(quantidades).length > 0) {
          body.quantidades = quantidades;
        }
      }

      const res = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json() as { ok?: boolean; produto?: { id_produto: number; sku: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar produto");

      const produtoId = data.produto!.id_produto;

      // ── Reposição automática + tempo de fabricação ───────────────────────
      const estoqueMinimoNum = parseInt(estoqueMinimo || "0", 10);
      const tempoFabNum = tempoFabricacaoDias.trim() ? parseInt(tempoFabricacaoDias, 10) : null;
      if (estoqueMinimoNum > 0 || (tempoFabNum != null && tempoFabNum > 0)) {
        try {
          await fetch(`/api/produtos/${produtoId}/reposicao`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              estoque_minimo: estoqueMinimoNum,
              ativo: true,
              tempo_fabricacao_dias: tempoFabNum,
            }),
          });
        } catch (err) { console.warn("Falha ao salvar config de produção:", err); }
      }

      // ── Rota de Fabricação ────────────────────────────────────────────────
      if (rotaEtapas.length > 0) {
        try {
          await fetch(`/api/produtos/${produtoId}/rota`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ etapas: rotaEtapas.map((setor_id) => ({ setor_id })) }),
          });
        } catch (err) { console.warn("Falha ao salvar rota:", err); }
      }

      // ── Ficha técnica (foto) ──────────────────────────────────────────────
      if (fotoFichaTecnica) {
        try {
          await fetch(`/api/produtos/${produtoId}/ficha-tecnica`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ foto_base64: fotoFichaTecnica }),
          });
        } catch (err) { console.warn("Falha ao salvar ficha técnica:", err); }
      }

      // ── Pedras-componente (catálogo somando ao preço) ─────────────────────
      // Best-effort: se falhar, produto já foi criado com sucesso. Vendedora
      // pode reaplicar via tela de edição.
      if (pedrasComp.length > 0) {
        try {
          await fetch(`/api/produtos/${produtoId}/pedras-componente`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pedras: pedrasComp.map((p) => ({
                pedra_produto_id: p.pedra_produto_id,
                quantidade: p.quantidade,
              })),
            }),
          });
        } catch (err) { console.warn("Falha ao salvar pedras-componente:", err); }
      }

      // ── Estoque inicial: registra entrada em movimentações ───────────────
      const estoqueInicialNum = parseInt(estoqueInicial || "0", 10);
      if (estoqueInicialNum > 0) {
        try {
          await fetch("/api/estoque-comercial/movimentos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              produto_id: produtoId,
              tipo: "entrada",
              quantidade: estoqueInicialNum,
              motivo: "estoque_inicial_cadastro",
              observacao: "Estoque inicial registrado no cadastro do produto",
            }),
          });
        } catch (err) { console.warn("Falha ao registrar estoque inicial:", err); }
      }

      onCreated(produtoId, data.produto!.sku);
    } catch (e) {
      setGlobalErr(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative bg-white w-full max-h-[92vh] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col md:w-[680px] md:max-h-[90vh]"
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <h2 className="text-base font-semibold text-gray-800">Novo Produto</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* (Stepper removido — tela única com ficha técnica colapsável) */}

        {/* Body */}
        <div className="cadastro-produto-scroller flex-1 overflow-y-auto px-6 py-5" style={{ backgroundColor: C.bg }}>
          {/* Banner de erro no TOPO (visível ao scrollar pro topo após Salvar) */}
          {globalErr && (
            <div className="mb-4 flex items-start gap-2 text-red-700 text-sm bg-red-50 rounded-lg px-3 py-2.5 border border-red-200">
              <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
              <span>{globalErr}</span>
            </div>
          )}

          {loadingSetup ? (
            <div className="flex items-center justify-center py-12 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <>
              {/* ── DADOS BÁSICOS (sempre visível) ──────────────────────── */}
              {(
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Nome do Produto *</label>
                    <input
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className={inputCls}
                      placeholder="Ex: Anel Safira Esmeralda"
                      autoFocus
                    />
                  </div>

                  {/* SKU automático — produto com variações é detectado pela categoria
                      (Anel/Aliança → sim; demais → peça única). Usuário pode ajustar
                      depois na Etapa 4 (Variações) se precisar. */}
                  <div>
                    <p className="text-[11px] text-gray-400">
                      SKU:{" "}
                      <span className="font-mono font-semibold text-gray-600">{sku || "—"}</span>
                      {" "}(automático)
                      {temVariacoes && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          variações por tamanho
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Tipo de Metal</label>
                      <select
                        value={tipoMetal}
                        onChange={(e) => setTipoMetal(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">— selecione —</option>
                        {TIPO_METAL_OPTS.map((v) => <option key={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Categoria (auto)</label>
                      <input
                        type="text"
                        value={categoriaGeral}
                        onChange={(e) => setCategoriaGeral(e.target.value)}
                        placeholder="— detectada pelo nome —"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Peso Base (g) *</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={peso}
                      onChange={(e) => setPeso(e.target.value)}
                      className={inputCls}
                      placeholder="2.50"
                    />
                  </div>

                  {/* Preview de precificação automática (curva canônica /precificacao).
                      Só visível para roles `desenvolvedor` e `diretor` — demais
                      usuários (admin, gerentes, vendedores) não vêem o cálculo. */}
                  {pesoNum > 0 && userRole && ROLES_VE_PRECIFICACAO.has(userRole) && (
                    <div
                      className="rounded-lg px-4 py-3 text-xs space-y-0.5"
                      style={{ backgroundColor: factorsAuto ? "#F0FDF4" : "#FFF7ED", color: factorsAuto ? "#166534" : "#9A3412" }}
                    >
                      <p className="font-semibold mb-1">Precificação (automática)</p>
                      {factorsAuto && curvaConfig ? (
                        <>
                          <p>Categoria: <span className="font-medium">{factorsAuto.categoriaNome}{faixaAtual ? ` (${faixaAtual})` : ""}</span></p>
                          <p>Markup: <span className="font-medium">{factorsAuto.mkp.toFixed(3)}×</span> · Fator: <span className="font-medium">1.0</span></p>
                          {precoEstimadoAuto != null && (() => {
                            // Soma das pedras-componente. Vazio → mantém UX antiga
                            // ("Preço estimado: X"). Com pedras → quebra Ouro/Pedras/TOTAL.
                            const subtotalPedras = pedrasComp.reduce(
                              (s, p) => s + p.preco_unitario * p.quantidade,
                              0,
                            );
                            const qtdPedras = pedrasComp.reduce((s, p) => s + p.quantidade, 0);
                            const total = precoEstimadoAuto + subtotalPedras;
                            const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                            if (subtotalPedras === 0) {
                              return (
                                <p className="mt-1 font-semibold text-sm">
                                  Preço estimado: {fmtBRL(precoEstimadoAuto)}
                                </p>
                              );
                            }
                            return (
                              <>
                                <p className="mt-1">Ouro: <span className="font-medium">{fmtBRL(precoEstimadoAuto)}</span></p>
                                <p>Pedras ({qtdPedras} un): <span className="font-medium">{fmtBRL(subtotalPedras)}</span></p>
                                <p className="mt-1 font-bold text-base border-t pt-1" style={{ borderColor: "#A7F3D0" }}>
                                  TOTAL: {fmtBRL(total)}
                                </p>
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <p>Curva de precificação não carregada</p>
                      )}
                    </div>
                  )}

                  {/* ── PEDRAS DO CATÁLOGO (somam ao preço final) ──────────────── */}
                  {pesoNum > 0 && userRole && ROLES_VE_PRECIFICACAO.has(userRole) && (
                    <div className="rounded-lg border bg-white px-4 py-3" style={{ borderColor: C.cremeBorder }}>
                      <p className="text-xs font-semibold text-gray-700 mb-2">
                        Pedras do catálogo
                        <span className="ml-1 text-[10px] text-gray-400 font-normal">
                          {pedrasComp.length > 0 ? `${pedrasComp.length} tipo(s)` : "opcional — soma ao preço final"}
                        </span>
                      </p>

                      {/* Lista das pedras já adicionadas */}
                      {pedrasComp.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          {pedrasComp.map((p) => (
                            <div
                              key={p._key}
                              className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border"
                              style={{ borderColor: C.cremeBorder }}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-sm font-medium text-gray-800 truncate">{p.nome}</span>
                                <span className="text-xs text-gray-500 font-mono shrink-0">
                                  {p.quantidade}un × {p.preco_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </span>
                                <span className="text-xs font-semibold text-gray-700 shrink-0">
                                  = {(p.quantidade * p.preco_unitario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPedrasComp((arr) => arr.filter((x) => x._key !== p._key))}
                                className="text-gray-400 hover:text-red-500 transition-colors shrink-0 ml-2"
                                aria-label="Remover pedra"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Formulário de adição: select pedra + qtd */}
                      <div className="flex items-end gap-2">
                        <div className="flex-1 min-w-0">
                          <label className={labelCls}>Pedra do catálogo</label>
                          <select
                            value={pedraSelId}
                            onChange={(e) => setPedraSelId(e.target.value)}
                            className={inputCls}
                          >
                            <option value="">— Selecione —</option>
                            {catalogoPedras.map((p) => (
                              <option key={p.id} value={String(p.id)}>
                                {p.nome} — {p.preco_unitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="w-20">
                          <label className={labelCls}>Qtd</label>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={pedraSelQtd}
                            onChange={(e) => setPedraSelQtd(e.target.value)}
                            className={inputCls}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const pedra = catalogoPedras.find((p) => p.id === Number(pedraSelId));
                            const qtd = Math.max(1, Math.floor(Number(pedraSelQtd) || 0));
                            if (!pedra || qtd < 1) return;
                            setPedrasComp((arr) => [
                              ...arr,
                              {
                                _key: `pc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                                pedra_produto_id: pedra.id,
                                nome: pedra.nome,
                                preco_unitario: pedra.preco_unitario,
                                quantidade: qtd,
                              },
                            ]);
                            setPedraSelId("");
                            setPedraSelQtd("1");
                          }}
                          disabled={!pedraSelId || Number(pedraSelQtd) < 1}
                          className="px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                          style={{ backgroundColor: C.esmeralda }}
                        >
                          + Adicionar
                        </button>
                      </div>
                      {catalogoPedras.length === 0 && (
                        <p className="text-[10px] text-gray-400 mt-2">
                          Nenhuma pedra com preço cadastrada no catálogo. Cadastre em <strong>Precificação → Pedras</strong>.
                        </p>
                      )}
                    </div>
                  )}

                  {/* "Tem pedra preciosa" removido — detectado automaticamente
                      no submit a partir do BOM (apontamento padrão). */}

                  {/* Estoque inicial + mínimo + tempo de fabricação */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>Estoque inicial</label>
                      <input
                        type="number"
                        min={0}
                        value={estoqueInicial}
                        onChange={(e) => setEstoqueInicial(e.target.value)}
                        className={inputCls + " tabular-nums"}
                        placeholder="0"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Já em estoque ao cadastrar.
                      </p>
                    </div>
                    <div>
                      <label className={labelCls}>Estoque mínimo</label>
                      <input
                        type="number"
                        min={0}
                        value={estoqueMinimo}
                        onChange={(e) => setEstoqueMinimo(e.target.value)}
                        className={inputCls + " tabular-nums"}
                        placeholder="0"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Abaixo disso → OF automática.
                      </p>
                    </div>
                    <div>
                      <label className={labelCls}>Tempo de fabricação (dias)</label>
                      <input
                        type="number"
                        min={0}
                        value={tempoFabricacaoDias}
                        onChange={(e) => setTempoFabricacaoDias(e.target.value)}
                        className={inputCls + " tabular-nums"}
                        placeholder="—"
                      />
                      <p className="text-[10px] text-gray-500 mt-1">
                        Prazo padrão pro cliente.
                      </p>
                    </div>
                  </div>

                  {/* Rota de Fabricação */}
                  <div className="rounded-lg border-2 p-3" style={{ borderColor: "#A7D7B8", backgroundColor: "#F0F7F4" }}>
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.esmeralda }}>
                        Rota de Fabricação
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMostrarTemplate(true)}
                          className="text-[11px] font-semibold px-2 py-1 rounded border hover:bg-white"
                          style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                          title="Aplicar um template de rota cadastrado em /rotas-padrao"
                        >
                          📋 Aplicar template…
                        </button>
                        <span className="text-[10px]" style={{ color: "#6B7280" }}>
                          {rotaEtapas.length} etapa(s)
                        </span>
                      </div>
                    </div>

                    {rotaEtapas.length === 0 ? (
                      <p className="text-[12px] py-2" style={{ color: "#6B7280" }}>
                        Nenhuma etapa. Adicione setores para definir a sequência de fabricação.
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
                                style={{ backgroundColor: C.esmeralda, color: C.creme }}
                              >
                                {idx + 1}
                              </span>
                              <span className="flex-1 text-sm" style={{ color: "#111827" }}>
                                {setor?.nome ?? `Setor #${sid}`}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const idx0 = idx; if (idx0 === 0) return;
                                  const arr = [...rotaEtapas];
                                  [arr[idx0 - 1], arr[idx0]] = [arr[idx0], arr[idx0 - 1]];
                                  setRotaEtapas(arr);
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
                                  const idx0 = idx; if (idx0 === rotaEtapas.length - 1) return;
                                  const arr = [...rotaEtapas];
                                  [arr[idx0], arr[idx0 + 1]] = [arr[idx0 + 1], arr[idx0]];
                                  setRotaEtapas(arr);
                                }}
                                disabled={idx === rotaEtapas.length - 1}
                                className="text-[11px] px-1 disabled:opacity-30"
                                title="Descer"
                              >
                                ▼
                              </button>
                              <button
                                type="button"
                                onClick={() => setRotaEtapas(rotaEtapas.filter((_, i) => i !== idx))}
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

                    <div className="flex gap-2">
                      <select
                        onChange={(e) => {
                          const sid = parseInt(e.target.value);
                          if (Number.isInteger(sid) && sid > 0) {
                            setRotaEtapas([...rotaEtapas, sid]);
                            e.target.value = "";
                          }
                        }}
                        defaultValue=""
                        className="flex-1 border rounded-md px-2 py-1.5 text-sm bg-white outline-none"
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
                    </div>
                    {setoresDisponiveis.length === 0 && (
                      <p className="text-[10px] mt-1" style={{ color: "#9A3412" }}>
                        Vá até <a href="/setores" target="_blank" rel="noopener" className="underline font-semibold">/setores</a> pra cadastrar.
                      </p>
                    )}
                  </div>

                  {/* Fornecedor — autocomplete via datalist */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
                      Fornecedor
                    </label>
                    <input
                      type="text"
                      value={fornecedor}
                      onChange={(e) => setFornecedor(e.target.value)}
                      list="cadastro-fornecedores-options"
                      placeholder="Nome do fornecedor (opcional)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white focus:outline-none focus:border-[#184036] transition-colors"
                    />
                    <datalist id="cadastro-fornecedores-options">
                      {fornecedoresSugeridos.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </div>

                  {/* Localização física — prateleira/gaveta. Opcional: normalmente só é
                      definida depois, quando a peça chega no estoque. */}
                  <div>
                    <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
                      Localização
                    </label>
                    <input
                      type="text"
                      value={localizacao}
                      onChange={(e) => setLocalizacao(e.target.value)}
                      placeholder="ex: LJ-ET04 (opcional)"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 bg-white font-mono focus:outline-none focus:border-[#184036] transition-colors"
                    />
                  </div>

                  {/* Foto do produto — obrigatória */}
                  <div>
                    <label className={labelCls}>Foto do Produto *</label>
                    <input
                      ref={fotoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => setFoto(ev.target?.result as string);
                        reader.readAsDataURL(f);
                        e.target.value = "";
                      }}
                    />
                    {foto ? (
                      <div className="relative rounded-lg overflow-hidden border border-gray-200">
                        <img src={foto} alt="Preview" className="w-full h-40 object-cover" />
                        <button
                          type="button"
                          onClick={() => setFoto(null)}
                          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center bg-white rounded-full shadow border border-gray-200 hover:bg-gray-50"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fotoInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-gray-200 rounded-lg px-4 py-6 flex flex-col items-center gap-1.5 text-gray-400 hover:border-[#184036] hover:text-[#184036] transition-colors"
                      >
                        <Camera size={20} />
                        <span className="text-xs font-medium">Clique para adicionar foto</span>
                        <span className="text-[10px]">JPG, PNG, WEBP</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ── COMPOSIÇÃO (accordion) ──────────────────────────────── */}
              <div className="mt-6 rounded-lg border bg-white" style={{ borderColor: C.cremeBorder }}>
                <button type="button" onClick={() => setExpandComp(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-lg">
                  <span>Apontamento Padrão <span className="ml-1 text-[10px] text-gray-400">{bom.length > 0 ? `${bom.length} item(s)` : "ouro + pedras (opcional)"}</span></span>
                  {expandComp ? <ChevronLeft size={14} className="rotate-90" /> : <ChevronRight size={14} />}
                </button>
              </div>
              {expandComp && (
                <div className="space-y-3 mt-2 p-4 bg-white rounded-lg border" style={{ borderColor: C.cremeBorder }}>
                  <p className="text-xs text-gray-500">
                    Adicione os insumos do produto. O metal deve ter o peso base da peça modelo.
                    Para variações, o peso do metal será ajustado por numeração automaticamente.
                  </p>

                  {/* Lista do BOM */}
                  {bom.length > 0 && (
                    <div className="space-y-1.5">
                      {bom.map((item) => (
                        <div
                          key={item._key}
                          className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border"
                          style={{ borderColor: C.cremeBorder }}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              style={{
                                backgroundColor:
                                  item.tipo === "metal" ? "#FEF3C7" :
                                  item.tipo === "pedra" ? "#EDE9FE" : "#F3F4F6",
                                color:
                                  item.tipo === "metal" ? "#92400E" :
                                  item.tipo === "pedra" ? "#5B21B6" : "#4B5563",
                              }}
                            >
                              {item.tipo}
                            </span>
                            <span className="text-sm font-medium text-gray-800">{item.insumo_nome}</span>
                            <span className="text-xs text-gray-500 font-mono">
                              {item.tipo === "pedra"
                                ? `${item.quantidade} un${item.tamanho ? ` · ${item.tamanho}ct` : ""}`
                                : `${item.quantidade}g`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setBom((b) => b.filter((x) => x._key !== item._key))}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Formulário de adição */}
                  {showBomForm ? (
                    <BomFormLocal
                      insumos={insumos}
                      onAdd={(item) => { setBom((b) => [...b, item]); setShowBomForm(false); }}
                      onCancel={() => setShowBomForm(false)}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowBomForm(true)}
                      className="w-full py-2 rounded-lg border-2 border-dashed text-sm text-gray-500 hover:text-gray-700 hover:border-gray-400 transition-colors flex items-center justify-center gap-1.5"
                      style={{ borderColor: C.cremeBorder }}
                    >
                      <Plus size={14} /> Adicionar Insumo
                    </button>
                  )}

                  {/* Preview custo */}
                  {bom.length > 0 && (
                    <div
                      className="rounded-lg px-4 py-3 text-xs"
                      style={{ backgroundColor: "#EFF6FF", color: "#1E40AF" }}
                    >
                      <p className="font-semibold mb-1">Preview Custo</p>
                      {bom.filter((i) => i.tipo === "metal").map((i) => (
                        <p key={i._key}>
                          Ouro: {i.quantidade}g × R${cotacao.ouro.toFixed(2)}/g × {fator || 1} = R$
                          {(i.quantidade * cotacao.ouro * parseFloat(fator || "1")).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── FICHA TÉCNICA (accordion) — upload de foto ──────────── */}
              <div className="mt-3 rounded-lg border bg-white" style={{ borderColor: C.cremeBorder }}>
                <button type="button" onClick={() => setExpandMed(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-lg">
                  <span>Ficha Técnica <span className="ml-1 text-[10px] text-gray-400">{fotoFichaTecnica ? "foto carregada" : "foto opcional"}</span></span>
                  {expandMed ? <ChevronLeft size={14} className="rotate-90" /> : <ChevronRight size={14} />}
                </button>
              </div>
              {expandMed && (
                <div className="space-y-3 mt-2 p-4 bg-white rounded-lg border" style={{ borderColor: C.cremeBorder }}>
                  <p className="text-xs text-gray-500">
                    Foto técnica do produto + medidas (largura, altura, base). Tudo opcional — preenche o que tiver.
                  </p>

                  {/* Medidas — largura, altura, base (mm) */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
                        Largura (mm)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={larguraAro}
                        onChange={(e) => setLarguraAro(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-md border text-sm outline-none"
                        style={{ borderColor: C.cremeBorder }}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
                        Altura (mm)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={alturaAro}
                        onChange={(e) => setAlturaAro(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-md border text-sm outline-none"
                        style={{ borderColor: C.cremeBorder }}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-1">
                        Base (mm)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={base}
                        onChange={(e) => setBase(e.target.value)}
                        className="w-full px-2 py-1.5 rounded-md border text-sm outline-none"
                        style={{ borderColor: C.cremeBorder }}
                        placeholder="0,00"
                      />
                    </div>
                  </div>

                  {/* Foto da ficha técnica */}
                  <input
                    ref={fichaTecnicaInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => setFotoFichaTecnica(ev.target?.result as string);
                      reader.readAsDataURL(f);
                      e.target.value = "";
                    }}
                  />
                  {fotoFichaTecnica ? (
                    <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: C.cremeBorder }}>
                      <img src={fotoFichaTecnica} alt="Ficha técnica" className="w-full h-48 object-contain bg-gray-50" />
                      <button
                        type="button"
                        onClick={() => setFotoFichaTecnica(null)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/95 hover:bg-white shadow-md text-red-500"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fichaTecnicaInputRef.current?.click()}
                      className="w-full border-2 border-dashed rounded-lg py-8 text-center hover:bg-gray-50"
                      style={{ borderColor: C.cremeBorder }}
                    >
                      <Camera className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                      <p className="text-sm text-gray-500">Clique para adicionar foto da ficha técnica</p>
                      <p className="text-[10px] text-gray-400">JPG, PNG, WEBP</p>
                    </button>
                  )}
                </div>
              )}


              {/* ── VARIAÇÕES (tabela com quantidade de estoque inicial) ─── */}
              {temVariacoes && combos.length > 0 && (
                <div className="mt-3 rounded-xl border bg-white overflow-hidden" style={{ borderColor: C.cremeBorder }}>
                  <div className="px-4 py-2.5 bg-gray-50 border-b flex items-center justify-between" style={{ borderColor: C.cremeBorder }}>
                    <span className="text-sm font-semibold text-gray-700">
                      Variações por tamanho <span className="text-[11px] text-gray-400 font-normal">({combos.length} tamanhos)</span>
                    </span>
                    <span className="text-[11px] text-gray-500">
                      Total: {Object.values(quantidadesVar).reduce((acc, q) => acc + (parseInt(q) || 0), 0)} un.
                    </span>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                          <th className="text-left px-3 py-2 w-20">Tamanho</th>
                          <th className="text-right px-3 py-2 w-32">Qtd em Estoque</th>
                        </tr>
                      </thead>
                      <tbody>
                        {combos.map((combo, i) => {
                          const num = String(combo.numeracao ?? (i + 1));
                          return (
                            <tr key={i} className="border-t hover:bg-gray-50" style={{ borderColor: C.cremeBorder }}>
                              <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{num}</td>
                              <td className="px-3 py-1.5 text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={quantidadesVar[num] ?? ""}
                                  onChange={(e) => setQuantidadesVar((prev) => ({ ...prev, [num]: e.target.value }))}
                                  placeholder="0"
                                  className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-right font-mono text-gray-800 bg-white focus:outline-none focus:border-[#184036]"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </>
          )}

          {/* Erro global agora aparece no TOPO do scroller (ver banner acima) */}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 border-t bg-white flex items-center justify-between"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <ChevronLeft size={15} />
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || (gerarVariacoes && eixos.length === 0 && combos.length === 0)}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
            style={{ backgroundColor: C.esmeralda }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? "Criando..." : gerarVariacoes && combos.length > 0
              ? `Salvar Produto + ${combos.length} variações`
              : "Salvar Produto"}
          </button>
        </div>
      </div>

      {mostrarTemplate && (
        <AplicarTemplateModal
          produtoId={null /* produto novo — pré-popula localmente */}
          categoriaProduto={categoria || null}
          onClose={() => setMostrarTemplate(false)}
          onSelecionar={(_id, setorIds) => setRotaEtapas(setorIds)}
        />
      )}
    </div>
  );
}
