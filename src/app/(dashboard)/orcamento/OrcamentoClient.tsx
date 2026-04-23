"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  CircleDot, ChevronDown, Gem, Type, Ruler, Minus, Plus, Save,
  Printer, Download, Loader2, Settings2, RotateCcw, User, X, Check,
} from "lucide-react";
import * as THREE from "three";
import { ProfileType } from "./types";
import { maskCpfCnpj } from "@/lib/formatters";
import { calcularPrecoSync, getPricingFactors, type CurvaConfig, type CurvaCategoriaInput } from "@/lib/curva-precificacao";
import type {
  RingParams, RingSize, PricingCategory, GrooveRule, PricingResult, ConfigOrcamento,
  StoneEntry, StonePrice, StoneType, StoneCut,
} from "./types";
import {
  RING_SIZES, DEFAULT_PARAMS, PROFILE_OPTIONS, METAL_COLORS,
  DEFAULT_PRICING_CATEGORIES, DEFAULT_GROOVE_RULES, DEFAULT_STONE_PRICES,
  STONE_TYPES, STONE_CUTS, STONE_SIZES_MM, STONE_CT_TABLE, GROOVE_TYPE_OPTIONS,
  findGrooveRule, computeWeight, computeStoneCapacity, computePricing,
  computeCalculatedCategories, computeStoneEntryPrice, computeStonesTotalRS,
} from "./constants";
import {
  CALIBRACAO_DEFAULTS, computeMinThickness, computeMinWidth,
  computeMaxStoneRows, validateRingDesign, ringParamsToInput,
  type ValidationError,
} from "./validations";

const AliancaViewport = dynamic(() => import("./AliancaViewport"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center rounded-2xl" style={{ background: "#f1f5f9", border: "1px solid #E8DCC8" }}>
      <Loader2 size={28} className="animate-spin text-gray-300" />
    </div>
  ),
});

const C = {
  esmeralda: "#184036",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
  gold: "#D4AF37",
};

interface Props {
  cotacaoOuro: number;
  cotacaoDolar: number;
  config: ConfigOrcamento | null;
  canManageConfig: boolean;
  userName: string;
  userId: string;
  vendedorId: number | null;
  maxDesconto: number;
  curvaConfig: CurvaConfig | null;
  curvaCategorias: CurvaCategoriaInput[];
}

type OrcamentoTipo = "alianca" | "peca" | null;
type AllianceMode = "unidade" | "par";

// ── Pill helper ──────────────────────────────────────────────────────────────
function Pill({ label, value, onDoubleClick, title }: {
  label: string;
  value: string;
  onDoubleClick?: () => void;
  title?: string;
}) {
  return (
    <div
      className="text-center select-none"
      onDoubleClick={onDoubleClick}
      title={title}
      style={{ cursor: onDoubleClick ? "pointer" : "default" }}
    >
      <p className="text-[9px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm font-bold" style={{ color: "#184036" }}>{value}</p>
    </div>
  );
}

// ── Slider compacto ─────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 w-[90px] shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: C.esmeralda }} />
      <span className="text-[11px] font-bold w-14 text-right" style={{ color: C.esmeralda }}>
        {value.toFixed(step < 1 ? (step < 0.1 ? 2 : 1) : 0)}{unit ?? ""}
      </span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function OrcamentoClient({
  cotacaoOuro, cotacaoDolar, config, canManageConfig, userName, userId, vendedorId, maxDesconto,
  curvaConfig, curvaCategorias,
}: Props) {
  const router = useRouter();
  const [orcamentoTipo, setOrcamentoTipo] = useState<OrcamentoTipo>(null);

  // Pedras (compartilhado aliança + peça)
  const [stoneEntries, setStoneEntries] = useState<StoneEntry[]>([]);
  // Preços de pedras editáveis na tela de config (USD/ct por tipo).
  // Mescla defaults com valores persistidos em config_orcamento.stone_prices
  // pra garantir que todos os tipos (incluindo zircônia nova) apareçam no editor.
  // Blindagem: stone_prices pode vir como string (JSONB escalar legado) ou
  // como array/objeto quebrado — filtramos entries invalidas.
  const [stonePricesLocal, setStonePricesLocal] = useState<StonePrice[]>(() => {
    let persisted: StonePrice[] = [];
    const raw = config?.stone_prices as unknown;
    if (Array.isArray(raw)) {
      persisted = raw.filter((p): p is StonePrice => !!p && typeof p === "object" && "tipo" in p && "preco_usd_ct" in p);
    } else if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          persisted = parsed.filter((p): p is StonePrice => !!p && typeof p === "object" && "tipo" in p && "preco_usd_ct" in p);
        }
      } catch { /* ignora, cai nos defaults */ }
    }
    return DEFAULT_STONE_PRICES.map((def) => {
      const found = persisted.find((p) => p.tipo === def.tipo);
      return found ?? def;
    });
  });
  const stonePrices = stonePricesLocal;
  const [stoneMarkupLocal, setStoneMarkupLocal] = useState(config?.stone_markup ?? 10);
  const stoneMarkup = stoneMarkupLocal; // fallback global para computeStoneEntryPrice
  const stoneTotalRS = useMemo(() => computeStonesTotalRS(stoneEntries), [stoneEntries]);

  const nextStoneId = useRef(1);
  const addStone = () => {
    const entry: StoneEntry = {
      id: nextStoneId.current++, tipo: "diamante", corte: "brilhante",
      tamanho_mm: 2.0, qtd: 1, ct_unitario: 0, ct_total: 0, pt_total: 0,
      preco_unitario_rs: 0, preco_total_rs: 0,
    };
    const calc = computeStoneEntryPrice(entry, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups);
    setStoneEntries((prev) => [...prev, { ...entry, ...calc }]);
  };
  const removeStone = (id: number) => setStoneEntries((prev) => prev.filter((e) => e.id !== id));
  const updateStone = (id: number, field: string, value: unknown) => {
    setStoneEntries((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: value };
      const calc = computeStoneEntryPrice(updated, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups);
      return { ...updated, ...calc };
    }));
  };

  // Helpers pra mexer no ring ativo (usado no modo aliança, respeita par)
  // Default = zirconia (nao cobra). Usuario declara explicitamente as preciosas.
  const addAllianceStone = (ringIdx: 1 | 2, stoneSize: number) => {
    const entry: StoneEntry = {
      id: nextStoneId.current++, tipo: "zirconia", corte: "brilhante",
      tamanho_mm: stoneSize, qtd: 1, ct_unitario: 0, ct_total: 0, pt_total: 0,
      preco_unitario_rs: 0, preco_total_rs: 0,
    };
    const calc = computeStoneEntryPrice(entry, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups);
    const setter = ringIdx === 1 ? setStoneEntries : setStoneEntries2;
    setter((prev) => [...prev, { ...entry, ...calc }]);
  };
  const removeAllianceStone = (ringIdx: 1 | 2, id: number) => {
    const setter = ringIdx === 1 ? setStoneEntries : setStoneEntries2;
    setter((prev) => prev.filter((e) => e.id !== id));
  };
  const updateAllianceStone = (ringIdx: 1 | 2, id: number, field: string, value: unknown) => {
    const setter = ringIdx === 1 ? setStoneEntries : setStoneEntries2;
    setter((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: value };
      const calc = computeStoneEntryPrice(updated, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups);
      return { ...updated, ...calc };
    }));
  };

  // Lista de orçamentos
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orcamentos, setOrcamentos] = useState<any[]>([]);
  const [loadingOrc, setLoadingOrc] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");
  const [buscaOrc, setBuscaOrc] = useState("");
  const [showNovoMenu, setShowNovoMenu] = useState(false);
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectMotivo, setRejectMotivo] = useState("");
  const [editingOrcId, setEditingOrcId] = useState<number | null>(null);
  const fetchOrcamentos = useCallback(async () => {
    setLoadingOrc(true);
    const res = await fetch("/api/orcamento?limit=100").catch(() => null);
    const data = res?.ok ? await res.json().catch(() => ({})) : {};
    setOrcamentos(data.orcamentos ?? []);
    setLoadingOrc(false);
  }, []);
  useEffect(() => { fetchOrcamentos(); }, [fetchOrcamentos]);

  // Peça personalizada
  const [pecaPeso, setPecaPeso] = useState(5.0);
  const [pecaMetalColor, setPecaMetalColor] = useState("#FFD700");
  const [pecaGoldDensity, setPecaGoldDensity] = useState(14.69);
  const [pecaFotoRef, setPecaFotoRef] = useState<string | null>(null);
  const [pecaDescontoPct, setPecaDescontoPct] = useState(0);

  // Pedras para peça personalizada (vem de public.produtos categoria pedras)
  interface PedraProduto {
    id: number; sku: string | null; nome: string; preco: number;
    tipo_de_pedra: string | null; categoria: string | null;
    peso_precificado: number | null;
  }
  interface PecaPedraItem { _key: string; produto: PedraProduto; qtd: number; }
  const [pecaPedras, setPecaPedras] = useState<PecaPedraItem[]>([]);
  const [pedrasBusca, setPedrasBusca] = useState("");
  const [pedrasResults, setPedrasResults] = useState<PedraProduto[]>([]);
  const [pedrasLoading, setPedrasLoading] = useState(false);
  const [pedrasShowDropdown, setPedrasShowDropdown] = useState(false);
  const pedrasTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pecaPedrasTotalRS = useMemo(
    () => pecaPedras.reduce((s, p) => s + p.produto.preco * p.qtd, 0),
    [pecaPedras]
  );
  function searchPedras(v: string) {
    if (pedrasTimer.current) clearTimeout(pedrasTimer.current);
    setPedrasBusca(v);
    if (v.length < 2) { setPedrasResults([]); setPedrasShowDropdown(false); return; }
    pedrasTimer.current = setTimeout(async () => {
      setPedrasLoading(true);
      try {
        const r = await fetch(`/api/orcamento/produtos-pedras?q=${encodeURIComponent(v)}`);
        const data = await r.json();
        setPedrasResults(Array.isArray(data) ? data : []);
        setPedrasShowDropdown(true);
      } finally { setPedrasLoading(false); }
    }, 350);
  }

  const [profile, setProfile] = useState<ProfileType>((config?.profile as ProfileType) ?? ProfileType.Anatomica);
  const [ringSize, setRingSize] = useState<RingSize>(RING_SIZES[14]);
  const [params, setParams] = useState<RingParams>({
    ...DEFAULT_PARAMS, goldPrice: cotacaoOuro,
    startMkp: config?.start_mkp ?? 3.5, discountPercent: config?.discount_percent ?? 0,
  });
  const [currentMesh, setCurrentMesh] = useState<THREE.Mesh | null>(null);

  // Toggle: double-click no pill de peso alterna entre arredondado (0,5g steps)
  // e peso real sem arredondamento (3 casas decimais).
  const [showRawWeight, setShowRawWeight] = useState(false);
  const toggleRawWeight = () => setShowRawWeight((v) => !v);

  // ── Par de alianças ───────────────────────────────────────────────────────
  const [allianceMode, setAllianceMode] = useState<AllianceMode>("unidade");
  const [activeRing, setActiveRing] = useState<1 | 2>(1);
  const [profile2, setProfile2] = useState<ProfileType>((config?.profile as ProfileType) ?? ProfileType.Anatomica);
  const [ringSize2, setRingSize2] = useState<RingSize>(RING_SIZES[14]);
  const [params2, setParams2] = useState<RingParams>({
    ...DEFAULT_PARAMS, goldPrice: cotacaoOuro,
    startMkp: config?.start_mkp ?? 3.5, discountPercent: config?.discount_percent ?? 0,
  });
  const [currentMesh2, setCurrentMesh2] = useState<THREE.Mesh | null>(null);
  const [stoneEntries2, setStoneEntries2] = useState<StoneEntry[]>([]);
  const stoneTotalRS2 = useMemo(() => computeStonesTotalRS(stoneEntries2), [stoneEntries2]);

  // Helpers para par — retorna params/setters do anel ativo
  const activeProfile = activeRing === 1 ? profile : profile2;
  const setActiveProfile = activeRing === 1 ? setProfile : setProfile2;
  const activeParams = activeRing === 1 ? params : params2;
  const setActiveParams = activeRing === 1 ? setParams : setParams2;
  const activeRingSize = activeRing === 1 ? ringSize : ringSize2;
  const setActiveRingSize = activeRing === 1 ? setRingSize : setRingSize2;
  const activeStoneEntries = activeRing === 1 ? stoneEntries : stoneEntries2;
  const setActiveStoneEntries = activeRing === 1 ? setStoneEntries : setStoneEntries2;

  // Quando muda tamanho da pedra na aliança, sincroniza entries existentes
  useEffect(() => {
    if (!params.hasStones || stoneEntries.length === 0) return;
    setStoneEntries((prev) => prev.map((e) => {
      if (e.tamanho_mm === params.stoneSize) return e;
      const updated = { ...e, tamanho_mm: params.stoneSize };
      const calc = computeStoneEntryPrice(updated, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups);
      return { ...updated, ...calc };
    }));
  }, [params.stoneSize, params.hasStones]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quando muda preco das pedras (USD/ct) ou markup, recalcula entries existentes
  useEffect(() => {
    setStoneEntries((prev) => prev.map((e) => {
      const calc = computeStoneEntryPrice(e, stonePricesLocal, stoneMarkup, cotacaoDolar, allStoneMarkups);
      return { ...e, ...calc };
    }));
    setStoneEntries2((prev) => prev.map((e) => {
      const calc = computeStoneEntryPrice(e, stonePricesLocal, stoneMarkup, cotacaoDolar, allStoneMarkups);
      return { ...e, ...calc };
    }));
  }, [stonePricesLocal, stoneMarkup, cotacaoDolar]);
  useEffect(() => {
    if (!params2.hasStones || stoneEntries2.length === 0) return;
    setStoneEntries2((prev) => prev.map((e) => {
      if (e.tamanho_mm === params2.stoneSize) return e;
      const updated = { ...e, tamanho_mm: params2.stoneSize };
      const calc = computeStoneEntryPrice(updated, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups);
      return { ...updated, ...calc };
    }));
  }, [params2.stoneSize, params2.hasStones]); // eslint-disable-line react-hooks/exhaustive-deps

  const [clientName, setClientName] = useState("");
  const [clienteId, setClienteId] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [clienteResults, setClienteResults] = useState<any[]>([]);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [clienteSemResultados, setClienteSemResultados] = useState(false);
  const [showNovoClienteForm, setShowNovoClienteForm] = useState(false);
  const [novoClienteForm, setNovoClienteForm] = useState({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });
  const [savingCliente, setSavingCliente] = useState(false);
  const [clienteErr, setClienteErr] = useState("");
  const [cpfExistente, setCpfExistente] = useState<string | null>(null);
  const clienteDropdownRef = useRef<HTMLDivElement>(null);
  const cpfTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscarClientes = useCallback(async (termo: string) => {
    if (termo.length < 2) { setClienteResults([]); setClienteSemResultados(false); return; }
    const res = await fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(termo)}`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => []) : [];
    const lista = Array.isArray(data) ? data : [];
    setClienteResults(lista);
    setShowClienteDropdown(lista.length > 0);
    setClienteSemResultados(lista.length === 0);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function selecionarCliente(c: any) {
    setClienteId(c.id_contato ?? c.id);
    setClientName(c.nome);
    setShowClienteDropdown(false);
    setClienteResults([]);
    setClienteSemResultados(false);
  }

  async function buscaCEP(cep: string) {
    const limpo = cep.replace(/\D/g, "");
    if (limpo.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const data = await res.json();
      if (data.erro) return;
      setNovoClienteForm(prev => ({ ...prev, endereco: data.logradouro ?? "", bairro: data.bairro ?? "", municipio: data.localidade ?? "", uf: data.uf ?? "" }));
    } catch { /* silent */ }
  }

  function checkCpfDuplicado(cpf: string) {
    setCpfExistente(null);
    const limpo = cpf.replace(/\D/g, "");
    if (limpo.length < 11) return;
    if (cpfTimer.current) clearTimeout(cpfTimer.current);
    cpfTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/vendas/clientes/busca?q=${encodeURIComponent(limpo)}`);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await res.json() as any[];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const found = data.find((c: any) => c.cpf_cnpj?.replace(/\D/g, "") === limpo);
        setCpfExistente(found ? found.nome : null);
      } catch { /* silent */ }
    }, 400);
  }

  async function handleCriarCliente() {
    if (!novoClienteForm.nome.trim()) { setClienteErr("Nome é obrigatório"); return; }
    if (cpfExistente) { setClienteErr(`CPF/CNPJ já cadastrado para: ${cpfExistente}`); return; }
    setSavingCliente(true); setClienteErr("");
    try {
      const res = await fetch("/api/contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novoClienteForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      selecionarCliente(data);
      setShowNovoClienteForm(false);
      setNovoClienteForm({ nome: "", cpf_cnpj: "", email: "", telefone: "", celular: "", cep: "", endereco: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "" });
    } catch (e) { setClienteErr(e instanceof Error ? e.message : "Erro ao criar cliente"); }
    finally { setSavingCliente(false); }
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (clienteDropdownRef.current && !clienteDropdownRef.current.contains(e.target as Node)) {
        setShowClienteDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  const [showGrooveAdvanced, setShowGrooveAdvanced] = useState(false);
  const [textosExtras, setTextosExtras] = useState<string[]>([]);
  const [textosExtras2, setTextosExtras2] = useState<string[]>([]);
  const [simPedra, setSimPedra] = useState(0);
  const [mkpInicial, setMkpInicial] = useState(10);
  const [mkpFinal, setMkpFinal] = useState(4);
  const [mkpDecremento, setMkpDecremento] = useState(() => {
    const steps = STONE_CT_TABLE.length - 1;
    return steps > 0 ? Math.round((10 - 4) / steps * 10) / 10 : 0;
  });
  // Markups por pedra por tamanho — carregado da config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [allStoneMarkups, setAllStoneMarkups] = useState<Record<string, Record<string, number>>>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (config as any)?.stone_markups_table;
    return (raw && typeof raw === "object") ? raw : {};
  });
  const [rowMarkups, setRowMarkups] = useState<Record<number, number>>(() => {
    const tipo = stonePricesLocal[0]?.tipo;
    const saved = allStoneMarkups[tipo ?? ""];
    if (saved) return Object.fromEntries(Object.entries(saved).map(([k, v]) => [Number(k), v]));
    return {};
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [tab, setTab] = useState<"design" | "config">("design");
  const [pricingCategories, setPricingCategories] = useState<PricingCategory[]>(
    config?.pricing_categories?.length ? config.pricing_categories : DEFAULT_PRICING_CATEGORIES
  );
  const [grooveRules, setGrooveRules] = useState<GrooveRule[]>(
    config?.groove_rules?.length ? config.groove_rules : DEFAULT_GROOVE_RULES
  );
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState<string | null>(null);
  // Preço da gravação (R$)
  const [precoGravacao, setPrecoGravacao] = useState<number>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (config as any)?.preco_gravacao;
    return raw ? Number(raw) : 100;
  });
  // Padrões do risco (carregados da config ou defaults)
  const [riscoWidth, setRiscoWidth] = useState<number>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (config as any)?.risco_width;
    return raw ? Number(raw) : 0.1;
  });
  const [riscoDepth, setRiscoDepth] = useState<number>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (config as any)?.risco_depth;
    return raw ? Number(raw) : 0.2;
  });

  const updateParam = <K extends keyof RingParams>(key: K, value: RingParams[K]) => {
    const setter = activeRing === 1 ? setParams : setParams2;
    setter((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  };

  // Salva últimos parâmetros do modelo no localStorage sempre que mudam
  useEffect(() => {
    try {
      localStorage.setItem("orcamento_modelo_defaults", JSON.stringify({
        profile, ringSize: ringSize.size,
        width: params.width, height: params.height,
        metalColor: params.metalColor, goldDensity: params.goldDensity,
        concaveDepth: params.concaveDepth, domePercentage: params.domePercentage,
        chamferSize: params.chamferSize, canalWidth: params.canalWidth,
        canalBorderHeight: params.canalBorderHeight,
      }));
    } catch { /* localStorage indisponivel */ }
  }, [profile, ringSize.size, params.width, params.height, params.metalColor, params.goldDensity,
      params.concaveDepth, params.domePercentage, params.chamferSize, params.canalWidth, params.canalBorderHeight]);

  // Auto-carrega config quando largura muda (friso usa grooveRules, risco usa defaults)
  useEffect(() => {
    if (!params.hasGroove) return;
    if (params.grooveKind === "risco") {
      setParams((prev) => ({ ...prev, grooveWidth: riscoWidth, grooveDepth: riscoDepth }));
    } else {
      const rule = findGrooveRule(params.width, grooveRules);
      setParams((prev) => ({ ...prev, grooveWidth: rule.grooveWidth, grooveDepth: rule.grooveDepth, grooveOffset: rule.grooveOffset }));
    }
  }, [params.width, params.hasGroove, params.grooveKind, grooveRules, riscoWidth, riscoDepth]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calibracao vinda do config (com fallback para defaults conservadores)
  // Calibracao pode vir como objeto ou como string (caso legado do bug JSONB
  // escalar). Se for string, parseia; se for invalido, cai nos defaults.
  const calibracao = useMemo(() => {
    const raw = config?.calibracao;
    if (!raw) return CALIBRACAO_DEFAULTS;
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" && parsed.espessura_min ? parsed : CALIBRACAO_DEFAULTS;
      } catch {
        return CALIBRACAO_DEFAULTS;
      }
    }
    return raw.espessura_min ? raw : CALIBRACAO_DEFAULTS;
  }, [config?.calibracao]);

  // Auto-ajusta espessura, largura e fileiras em um único batch (anel 1)
  // Evita cascata de re-renders
  useEffect(() => {
    if (!params.hasStones) return;
    const updates: Partial<RingParams> = {};
    const minT = computeMinThickness(params.stoneSize, calibracao, params.stoneDrill);
    const minW = computeMinWidth(params.stoneSize, profile, calibracao);
    if (profile === ProfileType.QuadradoCanal) {
      if (params.canalBorderHeight < minT) updates.canalBorderHeight = minT;
      if (params.canalWidth < minW) updates.canalWidth = minW;
      const maxRows = computeMaxStoneRows(params.canalWidth, params.stoneSize, calibracao);
      if (params.stoneRows > maxRows) updates.stoneRows = maxRows;
    } else {
      if (params.height < minT) updates.height = minT;
      if (params.width < minW) updates.width = minW;
    }
    if (Object.keys(updates).length > 0) {
      setParams((prev) => ({ ...prev, ...updates }));
    }
  }, [params.hasStones, params.stoneSize, params.stoneDrill, profile, calibracao]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-ajusta anel 2 (par)
  useEffect(() => {
    if (!params2.hasStones) return;
    const updates: Partial<RingParams> = {};
    const minT = computeMinThickness(params2.stoneSize, calibracao, params2.stoneDrill);
    const minW = computeMinWidth(params2.stoneSize, profile2, calibracao);
    if (profile2 === ProfileType.QuadradoCanal) {
      if (params2.canalBorderHeight < minT) updates.canalBorderHeight = minT;
      if (params2.canalWidth < minW) updates.canalWidth = minW;
      const maxRows = computeMaxStoneRows(params2.canalWidth, params2.stoneSize, calibracao);
      if (params2.stoneRows > maxRows) updates.stoneRows = maxRows;
    } else {
      if (params2.height < minT) updates.height = minT;
      if (params2.width < minW) updates.width = minW;
    }
    if (Object.keys(updates).length > 0) {
      setParams2((prev) => ({ ...prev, ...updates }));
    }
  }, [params2.hasStones, params2.stoneSize, params2.stoneDrill, profile2, calibracao]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fileiras anel 2 já ajustadas no batch acima

  const stoneCapacity = useMemo(
    () => params.hasStones ? computeStoneCapacity(params.diameter, params.height, params.canalBorderHeight, params.stoneSize, params.stoneRows, profile) : 0,
    [params.diameter, params.height, params.canalBorderHeight, params.stoneSize, params.stoneRows, params.hasStones, profile]
  );
  const stoneCapacity2 = useMemo(
    () => params2.hasStones ? computeStoneCapacity(params2.diameter, params2.height, params2.canalBorderHeight, params2.stoneSize, params2.stoneRows, profile2) : 0,
    [params2.diameter, params2.height, params2.canalBorderHeight, params2.stoneSize, params2.stoneRows, params2.hasStones, profile2]
  );

  // ── Travas de validação (min espessura, min largura, max fileiras) ─────
  const minThickness = useMemo(
    () => params.hasStones ? computeMinThickness(params.stoneSize, calibracao, params.stoneDrill) : 0,
    [params.stoneSize, params.hasStones, params.stoneDrill, calibracao]
  );
  const minWidth = useMemo(
    () => params.hasStones ? computeMinWidth(params.stoneSize, profile, calibracao) : 0,
    [params.stoneSize, params.hasStones, profile, calibracao]
  );
  const maxStoneRows = useMemo(
    () => (params.hasStones && profile === ProfileType.QuadradoCanal)
      ? computeMaxStoneRows(params.canalWidth, params.stoneSize, calibracao)
      : 1,
    [params.canalWidth, params.stoneSize, params.hasStones, profile, calibracao]
  );

  const minThickness2 = useMemo(
    () => params2.hasStones ? computeMinThickness(params2.stoneSize, calibracao, params2.stoneDrill) : 0,
    [params2.stoneSize, params2.hasStones, params2.stoneDrill, calibracao]
  );
  const minWidth2 = useMemo(
    () => params2.hasStones ? computeMinWidth(params2.stoneSize, profile2, calibracao) : 0,
    [params2.stoneSize, params2.hasStones, profile2, calibracao]
  );
  const maxStoneRows2 = useMemo(
    () => (params2.hasStones && profile2 === ProfileType.QuadradoCanal)
      ? computeMaxStoneRows(params2.canalWidth, params2.stoneSize, calibracao)
      : 1,
    [params2.canalWidth, params2.stoneSize, params2.hasStones, profile2, calibracao]
  );

  // Total de pedras adicionadas via lista (diamantes + zircônias + etc)
  const stoneEntriesTotal = useMemo(
    () => stoneEntries.reduce((sum, e) => sum + (e.qtd ?? 0), 0),
    [stoneEntries]
  );
  const stoneEntriesTotal2 = useMemo(
    () => stoneEntries2.reduce((sum, e) => sum + (e.qtd ?? 0), 0),
    [stoneEntries2]
  );

  // Erros de validação ativos (bloqueiam salvar)
  const validationErrors: ValidationError[] = useMemo(() => {
    const errs = validateRingDesign(ringParamsToInput(params, profile), stoneEntries, stoneCapacity, calibracao);
    if (allianceMode === "par") {
      const errs2 = validateRingDesign(ringParamsToInput(params2, profile2), stoneEntries2, stoneCapacity2, calibracao);
      return [...errs, ...errs2];
    }
    return errs;
  }, [params, profile, stoneEntries, stoneCapacity, params2, profile2, stoneEntries2, stoneCapacity2, allianceMode, calibracao]);
  const derivedStoneCount = useMemo(() => {
    if (!params.hasStones) return 0;
    if (params.stoneFull) return stoneCapacity;
    if (params.stoneHalfMoon) return Math.floor(stoneCapacity / 2);
    return params.stoneCount;
  }, [params.hasStones, params.stoneFull, params.stoneHalfMoon, stoneCapacity, params.stoneCount]);

  useEffect(() => {
    if (params.hasStones) {
      if (params.stoneFull && params.stoneCount !== stoneCapacity) updateParam("stoneCount", stoneCapacity);
      else if (params.stoneHalfMoon) {
        const h = Math.floor(stoneCapacity / 2);
        if (params.stoneCount !== h) updateParam("stoneCount", h);
      }
    }
  }, [params.stoneHalfMoon, params.stoneFull, stoneCapacity, params.hasStones]);

  const weightEst = useMemo(() => computeWeight(params, profile), [params, profile]);
  const pricing: PricingResult = useMemo(
    () => computePricing(weightEst.weight, params.goldPrice, params.startMkp, params.discountPercent, pricingCategories),
    [weightEst.weight, params.goldPrice, params.startMkp, params.discountPercent, pricingCategories]
  );
  const cameraDistance = useMemo(() => {
    const radius = params.diameter / 2 + params.height + params.width * 0.6;
    return radius * 8;
  }, [params.diameter, params.height, params.width]);
  const { calc: calcCategories } = computeCalculatedCategories(params.startMkp, pricingCategories, weightEst.weight);

  // Pricing aliança 2 (par)
  const weightEst2 = useMemo(() => computeWeight(params2, profile2), [params2, profile2]);
  const pricing2: PricingResult = useMemo(
    () => computePricing(weightEst2.weight, params2.goldPrice, params2.startMkp, params2.discountPercent, pricingCategories),
    [weightEst2.weight, params2.goldPrice, params2.startMkp, params2.discountPercent, pricingCategories]
  );
  const cameraDistance2 = useMemo(() => {
    const radius = params2.diameter / 2 + params2.height + params2.width * 0.6;
    return radius * 8;
  }, [params2.diameter, params2.height, params2.width]);

  // Gravação: primeiro nome incluso, adicionais cobram R$ precoGravacao cada
  const gravacaoExtras = params.textEnabled ? textosExtras.filter(t => t.trim()).length : 0;
  const gravacaoCost = gravacaoExtras * precoGravacao;
  const gravacaoExtras2 = params2.textEnabled ? textosExtras2.filter(t => t.trim()).length : 0;
  const gravacaoCost2 = allianceMode === "par" ? gravacaoExtras2 * precoGravacao : 0;

  // Pedras: só cobra se hasStones ativo
  const pedrasCost = params.hasStones ? stoneTotalRS : 0;
  const pedrasCost2 = params2.hasStones ? stoneTotalRS2 : 0;

  // Totais do par
  const pricingTotal = allianceMode === "par"
    ? { weight: pricing.weight + pricing2.weight, price: pricing.discountPrice + pricing2.discountPrice + pedrasCost + pedrasCost2 + gravacaoCost + gravacaoCost2 }
    : { weight: pricing.weight, price: pricing.discountPrice + pedrasCost + gravacaoCost };

  const handleSizeChange = (s: RingSize) => { setRingSize(s); updateParam("diameter", s.diameter); };
  const handleSizeChange2 = (s: RingSize) => { setRingSize2(s); setParams2(p => ({ ...p, diameter: s.diameter })); };

  // Captura screenshot do Canvas 3D
  const capture3DScreenshot = useCallback((): string | null => {
    try {
      const canvas = document.querySelector('canvas[data-engine]') as HTMLCanvasElement | null;
      if (!canvas) return null;
      return canvas.toDataURL("image/jpeg", 0.85);
    } catch { return null; }
  }, []);

  const resetEditor = () => {
    setEditingOrcId(null);
    setClientName(""); setClienteId(null);
    setStoneEntries([]); setStoneEntries2([]);
    setActiveRing(1);
    setPecaPeso(5.0);
    setTextosExtras([]); setTextosExtras2([]);

    // Restaura últimos parâmetros do modelo usados (localStorage)
    const baseParams = { ...DEFAULT_PARAMS, goldPrice: cotacaoOuro, startMkp: config?.start_mkp ?? 3.5, discountPercent: config?.discount_percent ?? 0 };
    let savedProfile = (config?.profile as ProfileType) ?? ProfileType.Anatomica;
    let savedRingSize = RING_SIZES[14];
    let restoredParams = baseParams;

    try {
      const saved = localStorage.getItem("orcamento_modelo_defaults");
      if (saved) {
        const d = JSON.parse(saved);
        if (d.profile && Object.values(ProfileType).includes(d.profile)) savedProfile = d.profile;
        const sz = RING_SIZES.find(r => r.size === d.ringSize);
        if (sz) savedRingSize = sz;
        restoredParams = {
          ...baseParams,
          diameter: savedRingSize.diameter,
          width: d.width ?? baseParams.width,
          height: d.height ?? baseParams.height,
          metalColor: d.metalColor ?? baseParams.metalColor,
          goldDensity: d.goldDensity ?? baseParams.goldDensity,
          concaveDepth: d.concaveDepth ?? baseParams.concaveDepth,
          domePercentage: d.domePercentage ?? baseParams.domePercentage,
          chamferSize: d.chamferSize ?? baseParams.chamferSize,
          canalWidth: d.canalWidth ?? baseParams.canalWidth,
          canalBorderHeight: d.canalBorderHeight ?? baseParams.canalBorderHeight,
        };
      }
    } catch { /* localStorage indisponivel */ }

    setProfile(savedProfile);
    setRingSize(savedRingSize);
    setParams(restoredParams);
    setProfile2(savedProfile);
    setRingSize2(savedRingSize);
    setParams2(restoredParams);
  };

  function buildFicha(p: RingParams, pf: ProfileType, rs: RingSize, w: number, sc: number, entries: StoneEntry[]) {
    return {
      modelo: PROFILE_OPTIONS.find((o) => o.id === pf)?.label ?? pf,
      aro_numeracao: `Aro ${rs.size}`, largura: p.width, espessura: p.height,
      peso_estimado: w, perfil: pf, diametro: p.diameter,
      densidade_ouro: p.goldDensity, cor_metal: METAL_COLORS.find(m => m.value === p.metalColor)?.label ?? p.metalColor,
      tipo_fonte: p.textEnabled && p.textContent.trim() ? (p.textFontType === 2 ? "Cursiva" : "Forma") : null,
      texto: p.textEnabled && p.textContent.trim() ? p.textContent.trim() : null,
      qtd_pedras: p.hasStones ? sc : null, tamanho_pedra: p.hasStones ? p.stoneSize : null,
      tipo_aplicacao_pedra: p.hasStones ? (p.stoneFull ? "Volta Completa" : p.stoneHalfMoon ? "Meia Alianca" : "Pontual") : null,
      profundidade_concava: p.concaveDepth,
      has_friso: p.hasGroove, friso_kind: p.hasGroove ? p.grooveKind : null,
      friso_tipo: p.hasGroove ? p.grooveType : null,
      friso_lado: p.grooveSide, friso_largura: p.grooveWidth,
      friso_profundidade: p.grooveDepth, friso_offset: p.grooveOffset,
      canal_largura: p.canalWidth, canal_borda_altura: p.canalBorderHeight,
      chanfro_tamanho: p.chamferSize, dome_porcentagem: p.domePercentage,
      pedra_fileiras: p.stoneRows, pedra_drill: p.stoneDrill,
      pedra_meia_lua: p.stoneHalfMoon, pedra_volta_completa: p.stoneFull,
      pedras_detalhadas: p.hasStones ? entries : [],
    };
  }

  const handleSaveOrder = async () => {
    if (!clientName.trim() && !clienteId) { setSaveMsg({ text: "Selecione ou cadastre um cliente", type: "error" }); return; }

    // Trava de validação: bloqueia salvar se houver erros físicos na peça
    if (validationErrors.length > 0) {
      setSaveMsg({ text: validationErrors[0].message, type: "error" });
      return;
    }

    // Validação: pedras obrigatórias quando "Incluir pedras" marcado
    const validarPedras = (p: typeof params, entries: typeof stoneEntries, cap: number, label: string) => {
      if (!p.hasStones) return null;
      if (entries.length === 0) return `${label}: selecione ao menos um tipo de pedra no detalhamento.`;
      const isPontual = !p.stoneFull && !p.stoneHalfMoon;
      if (isPontual) {
        const totalEntries = entries.reduce((s, e) => s + (e.qtd ?? 0), 0);
        const dCount = p.stoneFull ? cap : p.stoneHalfMoon ? Math.floor(cap / 2) : p.stoneCount;
        if (totalEntries !== dCount) return `${label}: a soma das pedras no detalhamento (${totalEntries}) deve ser igual à quantidade definida (${dCount}).`;
      }
      return null;
    };
    const errPedras1 = validarPedras(params, stoneEntries, stoneCapacity, allianceMode === "par" ? "Anel 1" : "Pedras");
    if (errPedras1) { setSaveMsg({ text: errPedras1, type: "error" }); return; }
    if (allianceMode === "par") {
      const errPedras2 = validarPedras(params2, stoneEntries2, stoneCapacity2, "Anel 2");
      if (errPedras2) { setSaveMsg({ text: errPedras2, type: "error" }); return; }
    }

    // Validação: texto obrigatório quando "Gravar texto" marcado
    if (params.textEnabled && !params.textContent.trim()) {
      setSaveMsg({ text: "Gravação: preencha o texto principal antes de salvar.", type: "error" }); return;
    }
    if (allianceMode === "par" && params2.textEnabled && !params2.textContent.trim()) {
      setSaveMsg({ text: "Gravação (Anel 2): preencha o texto principal antes de salvar.", type: "error" }); return;
    }

    setIsSaving(true); setSaveMsg(null);
    try {
      const foto3d = capture3DScreenshot();
      const isPar = allianceMode === "par";
      const grooveLabel = (p: RingParams) => p.hasGroove ? ` + Friso ${GROOVE_TYPE_OPTIONS.find(g => g.value === p.grooveType)?.label ?? ""}` : "";
      const nomeModelo = isPar
        ? `Par: ${PROFILE_OPTIONS.find((p) => p.id === profile)?.label ?? profile}${grooveLabel(params)} + ${PROFILE_OPTIONS.find((p) => p.id === profile2)?.label ?? profile2}${grooveLabel(params2)}`
        : `${PROFILE_OPTIONS.find((p) => p.id === profile)?.label ?? profile}${grooveLabel(params)}`;

      // Valor total = ouro (ambas) + pedras preciosas (ambas)
      const valorTotal = isPar
        ? pricing.discountPrice + pricing2.discountPrice + pedrasCost + pedrasCost2 + gravacaoCost + gravacaoCost2
        : pricing.discountPrice + pedrasCost + gravacaoCost;

      const body: Record<string, unknown> = {
        nome_cliente: clientName.trim(),
        cliente_id: clienteId,
        nome_modelo: nomeModelo,
        peso: pricingTotal.weight,
        valor: valorTotal,
        markup: pricing.mkp,
        desconto_pct: params.discountPercent,
        cotacao_ouro: params.goldPrice,
        cotacao_dolar: cotacaoDolar,
        valor_ouro: isPar ? pricing.discountPrice + pricing2.discountPrice : pricing.discountPrice,
        valor_pedras: isPar ? pedrasCost + pedrasCost2 : pedrasCost,
        tipo: "alianca",
        quantidade: isPar ? 2 : 1,
        foto_3d_base64: foto3d,
        ficha: buildFicha(params, profile, ringSize, pricing.weight, derivedStoneCount, stoneEntries),
      };
      if (isPar) {
        const sc2 = computeStoneCapacity(params2.diameter, params2.height, params2.canalBorderHeight, params2.stoneSize, params2.stoneRows, profile2);
        const derivedCount2 = params2.hasStones ? (params2.stoneFull ? sc2 : params2.stoneHalfMoon ? Math.floor(sc2 / 2) : params2.stoneCount) : 0;
        body.ficha2 = buildFicha(params2, profile2, ringSize2, pricing2.weight, derivedCount2, stoneEntries2);
      }

      const url = editingOrcId ? `/api/orcamento/${editingOrcId}` : "/api/orcamento";
      const method = editingOrcId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as { ok?: boolean; orcamento?: { id: number; numero_orcamento?: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      router.push(`/orcamento`);
    } catch (e) { setSaveMsg({ text: e instanceof Error ? e.message : "Erro ao salvar", type: "error" }); }
    finally { setIsSaving(false); }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true); setConfigMsg(null);
    try {
      const res = await fetch("/api/orcamento/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_mkp: params.startMkp,
          discount_percent: params.discountPercent,
          profile,
          pricing_categories: pricingCategories,
          groove_rules: grooveRules,
          stone_markup: stoneMarkupLocal,
          stone_prices: stonePricesLocal,
          risco_width: riscoWidth,
          risco_depth: riscoDepth,
          preco_gravacao: precoGravacao,
        }),
      });
      if (!res.ok) throw new Error();
      setConfigMsg("Salvo!");
    } catch { setConfigMsg("Erro"); }
    finally { setIsSavingConfig(false); }
  };

  const exportSTL = useCallback(async () => {
    if (!currentMesh) return;
    const { STLExporter } = await import("three/examples/jsm/exporters/STLExporter.js");
    const exporter = new STLExporter();
    const dataView = exporter.parse(currentMesh, { binary: true });
    const arrayBuffer = dataView instanceof DataView ? dataView.buffer : new TextEncoder().encode(String(dataView)).buffer;
    const blob = new Blob([arrayBuffer], { type: "application/vnd.ms-pki.stl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "alianca.stl"; a.click();
    URL.revokeObjectURL(url);
  }, [currentMesh]);

  // Pricing peça personalizada
  const pecaPricing = useMemo(
    () => computePricing(pecaPeso, cotacaoOuro, params.startMkp, params.discountPercent, pricingCategories),
    [pecaPeso, cotacaoOuro, params.startMkp, params.discountPercent, pricingCategories]
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // TELA DE SELEÇÃO DE TIPO
  // ═══════════════════════════════════════════════════════════════════════════
  if (orcamentoTipo === null) {
    const totalOrc = orcamentos.length;
    const aprovados = orcamentos.filter((o) => o.status === "aprovado");
    const rejeitados = orcamentos.filter((o) => o.status === "rejeitado");
    const valorAprovado = aprovados.reduce((s, o) => s + Number(o.valor ?? 0), 0);
    const filtered = filtroStatus === "todos" ? orcamentos : orcamentos.filter((o) => o.status === filtroStatus);
    const searched = buscaOrc ? filtered.filter((o) =>
      o.numero_orcamento?.toLowerCase().includes(buscaOrc.toLowerCase()) ||
      o.nome_cliente?.toLowerCase().includes(buscaOrc.toLowerCase())
    ) : filtered;

    const statusBadge = (status: string) => {
      const map: Record<string, { bg: string; color: string }> = {
        rascunho: { bg: "#F3F4F6", color: "#6B7280" }, enviado: { bg: "#DBEAFE", color: "#1D4ED8" },
        aprovado: { bg: "#D1FAE5", color: "#065F46" }, rejeitado: { bg: "#FEE2E2", color: "#991B1B" },
        convertido: { bg: "#E0E7FF", color: "#4338CA" },
      };
      const s = map[status] ?? map.rascunho;
      return <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: s.bg, color: s.color }}>{status}</span>;
    };

    return (
      <div className="px-3 md:px-6 py-4 md:py-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: C.esmeralda }}>Orçamentos</h1>
            <p className="text-xs text-gray-400">{totalOrc} orçamentos</p>
          </div>
          <div className="flex items-center gap-2">
            {canManageConfig && (
              <button onClick={() => { setOrcamentoTipo("alianca"); setTab("config"); }}
                className="px-3 py-2 rounded-lg border text-xs font-medium text-gray-500 hover:bg-gray-50" style={{ borderColor: C.cremeBorder }}>
                <Settings2 size={13} className="inline mr-1" />Config
              </button>
            )}
            <div className="relative">
              <button onClick={() => setShowNovoMenu(!showNovoMenu)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: C.esmeralda }}>
                <Plus size={15} />Novo Orçamento
                <ChevronDown size={13} />
              </button>
              {showNovoMenu && (
                <div className="absolute right-0 mt-1 bg-white rounded-xl border shadow-lg py-1 z-20 w-56" style={{ borderColor: C.cremeBorder }}>
                  <button onClick={() => { resetEditor(); setAllianceMode("unidade"); setOrcamentoTipo("alianca"); setShowNovoMenu(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm">
                    <CircleDot size={14} className="inline mr-2" style={{ color: C.gold }} />Aliança Unidade
                  </button>
                  <button onClick={() => { resetEditor(); setAllianceMode("par"); setOrcamentoTipo("alianca"); setShowNovoMenu(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm">
                    <CircleDot size={14} className="inline mr-2" style={{ color: C.gold }} />Par de Alianças
                  </button>
                  <button onClick={() => { setOrcamentoTipo("peca"); setShowNovoMenu(false); }}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm">
                    <Gem size={14} className="inline mr-2" style={{ color: "#A855F7" }} />Peça Personalizada
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
          {[
            { label: "Total", value: String(totalOrc), color: C.esmeralda },
            { label: "Aprovados", value: String(aprovados.length), color: "#059669" },
            { label: "Rejeitados", value: String(rejeitados.length), color: "#DC2626" },
            { label: "Valor Aprovado", value: `R$ ${valorAprovado.toLocaleString("pt-BR")}`, color: C.gold },
            { label: "Valor Rejeitado", value: `R$ ${rejeitados.reduce((s, o) => s + Number(o.valor ?? 0), 0).toLocaleString("pt-BR")}`, color: "#DC2626" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border px-4 py-3" style={{ borderColor: C.cremeBorder }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{s.label}</p>
              <p className="text-2xl font-black mt-1" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Busca + Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input type="text" placeholder="Buscar por número ou cliente..."
            value={buscaOrc} onChange={(e) => setBuscaOrc(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm outline-none flex-1 min-w-[200px]"
            style={{ borderColor: C.cremeBorder }} />
          <div className="flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: C.creme }}>
            {[
              { key: "todos", label: `Todos (${totalOrc})` },
              { key: "rascunho", label: `Rascunho (${orcamentos.filter(o => o.status === "rascunho").length})` },
              { key: "enviado", label: `Enviado (${orcamentos.filter(o => o.status === "enviado").length})` },
              { key: "aprovado", label: `Aprovado (${aprovados.length})` },
              { key: "convertido", label: `Convertido (${orcamentos.filter(o => o.status === "convertido").length})` },
              { key: "rejeitado", label: `Rejeitado (${rejeitados.length})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setFiltroStatus(key)}
                className="px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors"
                style={{
                  backgroundColor: filtroStatus === key ? C.esmeralda : "transparent",
                  color: filtroStatus === key ? "#F3EADA" : "#6B7280",
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabela */}
        {loadingOrc ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-gray-300" /></div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder }}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ backgroundColor: C.esmeralda }}>
                    {["Numero", "Status", "Tipo", "Cliente", "Peso", "Valor", "Data", "Ações"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#80A795" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {searched.length === 0 ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum orçamento encontrado</td></tr>
                  ) : searched.map((o, i) => (
                    <tr key={o.id} className="border-b cursor-pointer hover:bg-amber-50/30 transition-colors"
                      style={{ borderColor: C.creme, backgroundColor: i % 2 === 0 ? "#fff" : C.cremeBg }}
                      onClick={async () => {
                        // Carregar orçamento para edição
                        try {
                          setEditingOrcId(o.id);
                          const res = await fetch(`/api/orcamento/${o.id}`);
                          if (!res.ok) { setEditingOrcId(null); return; }
                          const data = await res.json();
                          const orc = data.orcamento;
                          if (!orc) return;
                          // Preencher dados do editor
                          setClientName(orc.cliente_nome_contato || orc.nome_cliente || "");
                          setClienteId(orc.cliente_id || null);
                          if (orc.tipo === "alianca") {
                            setOrcamentoTipo("alianca");
                            setAllianceMode(orc.quantidade === 2 ? "par" : "unidade");
                            // Mapear perfis legados FrisoUnico/FrisoLateral
                            if (orc.perfil === "FrisoUnico") {
                              setProfile(ProfileType.Simples);
                            } else if (orc.perfil === "FrisoLateral") {
                              setProfile(ProfileType.Simples);
                            } else if (orc.perfil) {
                              setProfile(orc.perfil as ProfileType);
                            }
                            // Aro
                            const aroNum = orc.aro_numeracao ? Number(String(orc.aro_numeracao).replace("Aro ", "")) : null;
                            const aroSize = aroNum ? RING_SIZES.find(r => r.size === aroNum) : null;
                            if (aroSize) setRingSize(aroSize);
                            // Cor do metal — banco salva label ("Ouro Amarelo"), converter para hex
                            const metalMatch = METAL_COLORS.find(m => m.label === orc.cor_metal || m.value === orc.cor_metal);
                            const metalHex = metalMatch?.value ?? "#FFD700";
                            const metalDensity = metalMatch?.density ?? 14.69;
                            // Setar todos os params de uma vez
                            // Groove — carregar do DB ou inferir de perfis legados
                            const hasGrooveLoaded = orc.perfil === "FrisoUnico" || orc.perfil === "FrisoLateral" || !!orc.has_friso;
                            const grooveKindLoaded = (orc.friso_kind || "friso") as "friso" | "risco";
                            const grooveTypeLoaded = orc.perfil === "FrisoLateral" ? "duplo" as const
                              : orc.perfil === "FrisoUnico" ? "lateral" as const
                              : (orc.friso_tipo || "lateral") as "lateral" | "centro" | "duplo";
                            setParams(p => ({
                              ...p,
                              diameter: aroSize?.diameter ?? p.diameter,
                              width: orc.largura ? Number(orc.largura) : p.width,
                              height: orc.espessura ? Number(orc.espessura) : p.height,
                              metalColor: metalHex,
                              goldDensity: metalDensity,
                              concaveDepth: orc.profundidade_concava ? Number(orc.profundidade_concava) : p.concaveDepth,
                              hasGroove: hasGrooveLoaded,
                              grooveKind: grooveKindLoaded,
                              grooveType: grooveTypeLoaded,
                              grooveWidth: orc.friso_largura ? Number(orc.friso_largura) : p.grooveWidth,
                              grooveDepth: orc.friso_profundidade ? Number(orc.friso_profundidade) : p.grooveDepth,
                              grooveOffset: orc.friso_offset ? Number(orc.friso_offset) : p.grooveOffset,
                              canalWidth: orc.canal_largura ? Number(orc.canal_largura) : p.canalWidth,
                              canalBorderHeight: orc.canal_borda_altura ? Number(orc.canal_borda_altura) : p.canalBorderHeight,
                              chamferSize: orc.chanfro_tamanho ? Number(orc.chanfro_tamanho) : p.chamferSize,
                              domePercentage: orc.dome_porcentagem != null ? Number(orc.dome_porcentagem) : p.domePercentage,
                              hasStones: !!orc.qtd_pedras,
                              stoneSize: orc.tamanho_pedra ? Number(orc.tamanho_pedra) : p.stoneSize,
                              stoneCount: orc.qtd_pedras ? Number(orc.qtd_pedras) : p.stoneCount,
                              stoneDrill: !!orc.pedra_drill,
                              stoneHalfMoon: !!orc.pedra_meia_lua,
                              stoneFull: !!orc.pedra_volta_completa,
                              stoneRows: orc.pedra_fileiras ? Number(orc.pedra_fileiras) : p.stoneRows,
                              textEnabled: !!orc.texto,
                              textContent: orc.texto || "",
                              textFontType: orc.tipo_fonte === "Cursiva" ? 2 : 1,
                            }));
                          } else {
                            setOrcamentoTipo("peca");
                            if (orc.peso) setPecaPeso(Number(orc.peso));
                          }
                          setTab("design");
                        } catch { /* silent */ }
                      }}>
                      <td className="px-4 py-2.5 text-sm font-semibold" style={{ color: C.esmeralda }}>{o.numero_orcamento}</td>
                      <td className="px-4 py-2.5">{statusBadge(o.status)}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                          style={{
                            backgroundColor: o.tipo === "alianca" ? "rgba(212,175,55,0.1)" : "rgba(168,85,247,0.1)",
                            color: o.tipo === "alianca" ? C.gold : "#A855F7",
                          }}>
                          {o.tipo === "alianca" ? "Alianca" : "Peca"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{o.nome_cliente}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-gray-500">{o.peso ? `${Number(o.peso).toFixed(1)}g` : "—"}</td>
                      <td className="px-4 py-2.5 text-sm font-bold" style={{ color: C.esmeralda }}>R$ {Number(o.valor ?? 0).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-2.5">
                        {o.status === "rascunho" || o.status === "enviado" ? (
                          <div className="flex gap-1">
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Aprovar ${o.numero_orcamento}? Será criada uma venda pré-preenchida no PDV.`)) return;
                              const res = await fetch(`/api/orcamento/${o.id}`, {
                                method: "PATCH", headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "aprovado" }),
                              });
                              const data = await res.json().catch(() => ({})) as { error?: string; numero_venda?: string; venda_id?: number };
                              if (!res.ok) { alert(data.error ?? "Erro ao aprovar"); return; }
                              alert(`Orçamento aprovado! Venda #${data.numero_venda} criada como rascunho. Abra a venda para preencher pagamento e aprovar.`);
                              fetchOrcamentos();
                            }}
                              className="text-[10px] px-2 py-1 rounded font-semibold bg-green-50 text-green-700 hover:bg-green-100">
                              Aprovar
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setRejectId(o.id); setRejectMotivo(""); }}
                              className="text-[10px] px-2 py-1 rounded font-semibold bg-red-50 text-red-700 hover:bg-red-100">
                              Rejeitar
                            </button>
                          </div>
                        ) : o.status === "convertido" && o.venda_gerada_id ? (
                          <span className="text-[10px] font-semibold flex flex-wrap gap-x-1 items-center">
                            <a href={`/vendas/${o.venda_gerada_id}`} className="text-blue-600 hover:underline">
                              Venda #{o.venda_numero_pedido ?? o.venda_gerada_id}
                            </a>
                            {o.ordem_gerada_id && (
                              <a href={`/ordens/${o.ordem_gerada_id}`} className="text-green-600 hover:underline">
                                · Ordem #{o.ordem_numero ?? o.ordem_gerada_id}
                              </a>
                            )}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t text-[11px] text-gray-400" style={{ borderColor: C.creme }}>{searched.length} registros</div>
          </div>
        )}

        {/* Modal: Busca CPF */}
        {/* Modal: Novo Cliente — igual à venda */}
        {showNovoClienteForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowNovoClienteForm(false); setClienteErr(""); setCpfExistente(null); }}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: "#374151" }}>Novo Cliente</p>
                <button onClick={() => { setShowNovoClienteForm(false); setClienteErr(""); setCpfExistente(null); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Nome <span className="text-red-500">*</span></label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" placeholder="Nome completo" value={novoClienteForm.nome} onChange={e => setNovoClienteForm(p => ({ ...p, nome: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>CPF/CNPJ</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none font-mono" placeholder="000.000.000-00" value={novoClienteForm.cpf_cnpj} onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cpf_cnpj: v })); checkCpfDuplicado(v); }} style={{ borderColor: cpfExistente ? "#EF4444" : C.cremeBorder }} />
                  {cpfExistente && <p className="text-xs text-red-500 mt-1">Já cadastrado: {cpfExistente} <button className="underline ml-1" onClick={() => setShowNovoClienteForm(false)}>Buscar</button></p>}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Email</label>
                  <input type="email" className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.email} onChange={e => setNovoClienteForm(p => ({ ...p, email: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Telefone</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.telefone} onChange={e => setNovoClienteForm(p => ({ ...p, telefone: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Celular</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.celular} onChange={e => setNovoClienteForm(p => ({ ...p, celular: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                </div>
              </div>
              <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
                <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>CEP</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none font-mono" placeholder="00000-000" value={novoClienteForm.cep} onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v); }} style={{ borderColor: C.cremeBorder }} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Logradouro</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.endereco} onChange={e => setNovoClienteForm(p => ({ ...p, endereco: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Número</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.numero} onChange={e => setNovoClienteForm(p => ({ ...p, numero: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Complemento</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.complemento} onChange={e => setNovoClienteForm(p => ({ ...p, complemento: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Bairro</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.bairro} onChange={e => setNovoClienteForm(p => ({ ...p, bairro: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Município</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.municipio} onChange={e => setNovoClienteForm(p => ({ ...p, municipio: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>UF</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" maxLength={2} value={novoClienteForm.uf} onChange={e => setNovoClienteForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} style={{ borderColor: C.cremeBorder }} />
                  </div>
                </div>
              </div>
              {clienteErr && <p className="text-sm text-red-600">{clienteErr}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setShowNovoClienteForm(false); setClienteErr(""); setCpfExistente(null); }} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                <button onClick={handleCriarCliente} disabled={savingCliente} className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: C.esmeralda }}>
                  {savingCliente ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar Cliente
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal rejeição */}
        {rejectId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setRejectId(null)}>
            <div className="bg-white rounded-xl border shadow-xl w-full max-w-sm mx-4 p-5" style={{ borderColor: C.cremeBorder }} onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-semibold mb-3" style={{ color: "#1A1A1A" }}>Rejeitar Orçamento</h3>
              <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Motivo da rejeição</label>
              <textarea rows={3} value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)}
                placeholder="Informe o motivo..."
                className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none resize-none mb-3"
                style={{ borderColor: C.cremeBorder, color: "#374151" }} autoFocus />
              <div className="flex justify-end gap-2">
                <button onClick={() => setRejectId(null)} className="px-4 py-2 rounded-lg text-sm font-medium border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
                <button onClick={async () => {
                  await fetch(`/api/orcamento/${rejectId}`, {
                    method: "PATCH", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "rejeitado", motivo_rejeicao: rejectMotivo }),
                  });
                  setRejectId(null); setRejectMotivo("");
                  fetchOrcamentos();
                }} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: "#EF4444" }}>Rejeitar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODO: PEÇA PERSONALIZADA
  // ═══════════════════════════════════════════════════════════════════════════
  if (orcamentoTipo === "peca") {
    // Valor do ouro + desconto máximo vêm da Curva Dinâmica de Precificação (/precificacao)
    const pecaFactors = curvaConfig && curvaCategorias.length > 0
      ? getPricingFactors(pecaPeso, curvaConfig, curvaCategorias)
      : null;
    const pecaValorOuro = pecaFactors && curvaConfig
      ? calcularPrecoSync(pecaPeso, cotacaoOuro, pecaFactors.mkp, curvaConfig.arredondamento)
      : 0;
    const pecaMaxDesconto = pecaFactors?.maxDiscount ?? 0;
    const pecaSubtotal = pecaValorOuro + pecaPedrasTotalRS;
    const pecaDescontoValor = pecaSubtotal * (pecaDescontoPct / 100);
    const pecaTotal = pecaSubtotal - pecaDescontoValor;
    return (
      <div className="min-h-screen" style={{ backgroundColor: C.cremeBg }}>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button onClick={() => setOrcamentoTipo(null)} className="text-xs text-gray-400 hover:text-gray-600">← Voltar</button>
            <h1 className="text-lg font-bold" style={{ color: C.esmeralda }}>Peça Personalizada</h1>
            <div className="w-16" />
          </div>

          {/* Cliente — mesmo visual da nova venda */}
          {clienteId ? (
            <div className="flex items-center justify-between rounded-xl border px-4 py-3 bg-white" style={{ borderColor: "#059669" }}>
              <div className="flex items-center gap-2">
                <User size={14} className="text-green-600" />
                <p className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{clientName}</p>
              </div>
              <button onClick={() => { setClienteId(null); setClientName(""); setClienteResults([]); setClienteSemResultados(false); }}
                className="text-gray-400 hover:text-gray-600 ml-2">
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-white rounded-xl border p-4 relative" style={{ borderColor: C.cremeBorder }}>
                <div className="flex items-center gap-2">
                  <User size={14} className="text-gray-400" />
                  <input type="text" value={clientName}
                    onChange={(e) => { setClientName(e.target.value); setClienteId(null); buscarClientes(e.target.value); }}
                    onFocus={() => { if (clienteResults.length > 0) setShowClienteDropdown(true); }}
                    onBlur={() => setTimeout(() => setShowClienteDropdown(false), 150)}
                    placeholder="Buscar cliente pelo nome ou CPF..." className="flex-1 text-sm outline-none" />
                </div>
                {showClienteDropdown && clienteResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-2 bg-white rounded-xl border shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: C.cremeBorder }}>
                    {clienteResults.map((c) => (
                      <button key={c.id} onMouseDown={() => selecionarCliente(c)}
                        className="w-full text-left px-3 py-2.5 hover:bg-stone-50 text-sm border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                        <p className="font-medium" style={{ color: "#1A1A1A" }}>{c.nome}</p>
                        <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                          {c.cpf_cnpj ? maskCpfCnpj(c.cpf_cnpj) : (c.telefone ?? c.celular ?? "—")}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!clienteId && clienteSemResultados && (
                <button
                  onClick={() => { const d = clientName.replace(/\D/g, ""); setNovoClienteForm(p => ({ ...p, cpf_cnpj: d.length >= 11 ? d : "", nome: d.length < 11 ? clientName : "" })); setShowNovoClienteForm(true); setClienteErr(""); }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border hover:bg-stone-50 transition-colors"
                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                >
                  <Plus size={14} /> Cadastrar novo cliente
                </button>
              )}
            </div>
          )}

          {/* Peso + Metal */}
          <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Peso e Metal</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400 block mb-1">Peso (g)</label>
                <input
                  type="number" step="0.5" min="0.5" max="500"
                  value={pecaPeso} onChange={(e) => setPecaPeso(parseFloat(e.target.value) || 0.5)}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
              <div className="flex gap-2">
                {METAL_COLORS.map((mc) => (
                  <button key={mc.value}
                    onClick={() => { setPecaMetalColor(mc.value); setPecaGoldDensity(mc.density); }}
                    className="w-10 h-10 rounded-full border-2 transition-all"
                    style={{
                      backgroundColor: mc.value,
                      borderColor: pecaMetalColor === mc.value ? C.esmeralda : "transparent",
                      boxShadow: pecaMetalColor === mc.value ? "0 0 0 2px " + C.esmeralda : undefined,
                    }}
                    title={mc.label}
                  />
                ))}
              </div>
            </div>

            {/* Valor do ouro — calculado pela Curva Dinâmica de Precificação (/precificacao) */}
            {(() => {
              let valorOuro = 0;
              if (curvaConfig && curvaCategorias.length > 0) {
                const factors = getPricingFactors(pecaPeso, curvaConfig, curvaCategorias);
                valorOuro = calcularPrecoSync(pecaPeso, cotacaoOuro, factors.mkp, curvaConfig.arredondamento);
              }
              return (
                <div className="rounded-lg px-3 py-2.5 text-xs flex items-center justify-between"
                  style={{ backgroundColor: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.25)" }}>
                  <span style={{ color: "#6B7280" }}>Valor do ouro</span>
                  <strong className="text-sm font-bold tabular-nums" style={{ color: C.esmeralda }}>
                    {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorOuro)}
                  </strong>
                </div>
              );
            })()}

            {/* Foto de referência */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1.5">Foto de referência / exemplo</label>
              {pecaFotoRef ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pecaFotoRef} alt="Referência" className="w-32 h-32 object-cover rounded-lg border" style={{ borderColor: C.cremeBorder }} />
                  <button
                    onClick={() => setPecaFotoRef(null)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px] font-bold"
                  >×</button>
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer w-fit px-3 py-2 rounded-lg border text-xs font-medium transition-colors hover:bg-stone-50"
                  style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  Adicionar foto
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setPecaFotoRef(ev.target?.result as string);
                    reader.readAsDataURL(file);
                  }} />
                </label>
              )}
            </div>
          </div>

          {/* Pedras — busca por produtos da categoria Pedras */}
          <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Pedras Preciosas</h3>
              {pecaPedras.length > 0 && (
                <span className="text-xs font-semibold tabular-nums" style={{ color: C.gold }}>
                  Total: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(pecaPedrasTotalRS)}
                </span>
              )}
            </div>

            {/* Autocomplete de busca */}
            <div className="relative">
              <div className="flex items-center gap-2 border rounded-lg px-3 py-2" style={{ borderColor: C.cremeBorder }}>
                {pedrasLoading ? <Loader2 size={13} className="animate-spin text-gray-400" /> : <Gem size={13} className="text-gray-400" />}
                <input
                  type="text" value={pedrasBusca}
                  onChange={(e) => searchPedras(e.target.value)}
                  onFocus={() => pedrasResults.length > 0 && setPedrasShowDropdown(true)}
                  onBlur={() => setTimeout(() => setPedrasShowDropdown(false), 150)}
                  placeholder="Buscar pedra (nome, SKU ou tipo)..."
                  className="flex-1 text-sm outline-none"
                />
              </div>
              {pedrasShowDropdown && pedrasResults.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border shadow-lg max-h-56 overflow-y-auto" style={{ borderColor: C.cremeBorder }}>
                  {pedrasResults.map((p) => (
                    <button key={p.id}
                      onMouseDown={() => {
                        setPecaPedras((prev) => [...prev, { _key: Math.random().toString(36).slice(2), produto: p, qtd: 1 }]);
                        setPedrasBusca(""); setPedrasResults([]); setPedrasShowDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 text-sm border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate" style={{ color: "#1A1A1A" }}>{p.nome}</p>
                          <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                            {p.sku ?? "—"}{p.tipo_de_pedra ? ` · ${p.tipo_de_pedra}` : ""}
                          </p>
                        </div>
                        <span className="text-xs font-semibold tabular-nums ml-2" style={{ color: C.esmeralda }}>
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(p.preco)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {pedrasShowDropdown && pedrasResults.length === 0 && pedrasBusca.length >= 2 && !pedrasLoading && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-xl border p-3 text-xs text-center text-gray-400" style={{ borderColor: C.cremeBorder }}>
                  Nenhuma pedra encontrada
                </div>
              )}
            </div>

            {/* Lista de pedras selecionadas */}
            {pecaPedras.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Busque e selecione as pedras acima</p>
            ) : (
              <div className="space-y-2">
                {pecaPedras.map((pp) => (
                  <div key={pp._key} className="flex items-center gap-3 rounded-lg border p-3" style={{ borderColor: C.cremeBorder }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "#1A1A1A" }}>{pp.produto.nome}</p>
                      <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                        {pp.produto.sku ?? "—"} · R$ {pp.produto.preco.toFixed(2).replace(".", ",")}/un
                      </p>
                    </div>
                    <input type="number" min={1} value={pp.qtd}
                      onChange={(e) => {
                        const q = Math.max(1, parseInt(e.target.value) || 1);
                        setPecaPedras((prev) => prev.map((x) => x._key === pp._key ? { ...x, qtd: q } : x));
                      }}
                      className="w-16 border rounded px-2 py-1 text-sm text-center font-mono" style={{ borderColor: C.cremeBorder }}
                    />
                    <span className="text-sm font-bold tabular-nums w-24 text-right" style={{ color: C.gold }}>
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(pp.produto.preco * pp.qtd)}
                    </span>
                    <button onClick={() => setPecaPedras((prev) => prev.filter((x) => x._key !== pp._key))}
                      className="text-red-400 hover:text-red-600">
                      <Minus size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total — Ouro + Pedras com desconto */}
          <div className="bg-white rounded-xl border p-5 space-y-3" style={{ borderColor: C.cremeBorder }}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Total</h3>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "#6B7280" }}>Ouro</span>
              <span className="font-mono tabular-nums" style={{ color: "#374151" }}>
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(pecaValorOuro)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span style={{ color: "#6B7280" }}>Pedras</span>
              <span className="font-mono tabular-nums" style={{ color: "#374151" }}>
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(pecaPedrasTotalRS)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
              <span style={{ color: "#6B7280" }}>Subtotal</span>
              <span className="font-mono tabular-nums font-semibold" style={{ color: C.esmeralda }}>
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(pecaSubtotal)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2" style={{ color: "#6B7280" }}>
                Desconto
                <span className="text-[10px]" style={{ color: "#9CA3AF" }}>
                  (máx {pecaMaxDesconto.toFixed(0)}%)
                </span>
              </label>
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={pecaMaxDesconto} step={0.5}
                  value={pecaDescontoPct}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(pecaMaxDesconto, parseFloat(e.target.value) || 0));
                    setPecaDescontoPct(v);
                  }}
                  className="w-20 border rounded px-2 py-1 text-sm text-right font-mono outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
                <span className="text-xs" style={{ color: "#9CA3AF" }}>%</span>
                <span className="font-mono tabular-nums text-sm w-24 text-right" style={{ color: "#DC2626" }}>
                  −{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(pecaDescontoValor)}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t-2" style={{ borderColor: C.esmeralda }}>
              <span className="text-sm font-bold uppercase tracking-wider" style={{ color: C.esmeralda }}>Total</span>
              <span className="text-2xl font-black tabular-nums" style={{ color: C.esmeralda }}>
                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(pecaTotal)}
              </span>
            </div>
          </div>

          {/* Salvar */}
          <div className="flex items-center justify-end gap-3">
            {saveMsg && (
              <span className={`text-xs ${saveMsg.type === "success" ? "text-green-600" : "text-red-500"}`}>{saveMsg.text}</span>
            )}
            <button onClick={async () => {
              if (!clientName.trim()) { setSaveMsg({ text: "Preencha o nome do cliente", type: "error" }); return; }
              setIsSaving(true); setSaveMsg(null);
              try {
                const body = {
                  nome_cliente: clientName.trim(), cliente_id: clienteId, tipo: "peca",
                  peso: pecaPeso, valor: pecaTotal, markup: pecaFactors?.mkp ?? 0,
                  desconto_pct: pecaDescontoPct, cotacao_ouro: cotacaoOuro,
                  cotacao_dolar: cotacaoDolar, valor_ouro: pecaValorOuro,
                  valor_pedras: pecaPedrasTotalRS,
                  ficha: {
                    peso_estimado: pecaPeso,
                    cor_metal: pecaMetalColor,
                    densidade_ouro: pecaGoldDensity,
                    foto_referencia: pecaFotoRef,
                    pedras_detalhadas: pecaPedras.map((p) => ({
                      produto_id: p.produto.id,
                      sku: p.produto.sku,
                      nome: p.produto.nome,
                      tipo_de_pedra: p.produto.tipo_de_pedra,
                      preco_unitario: p.produto.preco,
                      qtd: p.qtd,
                      total: p.produto.preco * p.qtd,
                    })),
                  },
                };
                const res = await fetch("/api/orcamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                if (!res.ok) throw new Error();
                setSaveMsg({ text: "Orçamento salvo!", type: "success" });
                setClientName(""); setClienteId(null);
                setPecaPedras([]); setPecaDescontoPct(0); setPecaFotoRef(null);
              } catch { setSaveMsg({ text: "Erro ao salvar", type: "error" }); }
              finally { setIsSaving(false); }
            }}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: C.esmeralda }}>
              {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TAB CONFIG (aliança)
  // ═══════════════════════════════════════════════════════════════════════════
  if (tab === "config" && canManageConfig) {
    return (
      <div className="p-6 space-y-5 max-w-3xl mx-auto" style={{ backgroundColor: C.cremeBg, minHeight: "100vh" }}>
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-800">Configurações do Orçamento</h1>
          <button onClick={() => setTab("design")} className="text-xs font-semibold px-4 py-2 rounded-lg text-white" style={{ background: C.esmeralda }}>Voltar ao Design</button>
        </div>
        {/* Markup e Desconto */}
        <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-bold text-gray-800">Markup e Desconto</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Markup base (multiplicador)</label>
              <input type="number" min={1} step={0.1} value={params.startMkp}
                onChange={e => setParams(p => ({ ...p, startMkp: parseFloat(e.target.value) || 1 }))}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none" style={{ borderColor: C.cremeBorder }} />
              <p className="text-[10px] text-gray-400 mt-1">Ex: 3.5 = preço do ouro × 3.5</p>
            </div>
            {/* Markup pedras removido — precificação feita pelo simulador por pedra */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Desconto padrão (%)</label>
              <input type="number" min={0} max={50} step={1} value={params.discountPercent}
                onChange={e => setParams(p => ({ ...p, discountPercent: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none" style={{ borderColor: C.cremeBorder }} />
              <p className="text-[10px] text-gray-400 mt-1">Desconto padrão aplicado no orçamento</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Curvatura padrão (%)</label>
              <input type="number" min={0} max={100} step={5} value={params.domePercentage}
                onChange={e => setParams(p => ({ ...p, domePercentage: parseInt(e.target.value) || 100 }))}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none" style={{ borderColor: C.cremeBorder }} />
              <p className="text-[10px] text-gray-400 mt-1">Curvatura dos perfis Anatomica, Boleada e Boleada Dupla</p>
            </div>
          </div>
        </div>
        {/* Faixas */}
        {(() => {
          const catCalc = computeCalculatedCategories(params.startMkp, pricingCategories, 0).calc;
          return (
        <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-bold text-gray-800">Faixas de preco do ouro</h3>
          <p className="text-[10px] text-gray-400">Markup base: <strong>{params.startMkp}×</strong> · Ouro: <strong>R$ {cotacaoOuro.toFixed(2)}/g</strong></p>
          <table className="w-full text-sm">
            <thead><tr className="border-b" style={{ borderColor: C.cremeBorder }}>
              <th className="text-left py-2 text-xs text-gray-500">Nome</th>
              <th className="text-left py-2 text-xs text-gray-500">Peso max</th>
              <th className="text-left py-2 text-xs text-gray-500">Variacao</th>
              <th className="text-right py-2 text-xs text-gray-500">Mkp</th>
              <th className="text-right py-2 text-xs text-gray-500">R$/g</th>
              <th className="w-8"></th>
            </tr></thead>
            <tbody>{pricingCategories.map((cat, i) => {
              const mkpFaixa = catCalc[i]?.targetMkp ?? params.startMkp;
              const valorGrama = cotacaoOuro * mkpFaixa;
              return (
              <tr key={cat.id} className="border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                <td className="py-2 pr-2"><input type="text" value={cat.name} onChange={(e) => { const u = [...pricingCategories]; u[i] = { ...u[i], name: e.target.value }; setPricingCategories(u); }} className="w-full px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                <td className="py-2 pr-2"><input type="number" value={cat.maxWeight} step={0.5} onChange={(e) => { const u = [...pricingCategories]; u[i] = { ...u[i], maxWeight: parseFloat(e.target.value) || 0 }; setPricingCategories(u); }} className="w-24 px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                <td className="py-2 pr-2"><input type="number" value={cat.variation} step={0.1} onChange={(e) => { const u = [...pricingCategories]; u[i] = { ...u[i], variation: parseFloat(e.target.value) || 0 }; setPricingCategories(u); }} className="w-20 px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                <td className="py-2 pr-2 text-right font-mono text-[11px] font-bold" style={{ color: C.esmeralda }}>{mkpFaixa.toFixed(1)}×</td>
                <td className="py-2 pr-2 text-right font-mono text-[11px] font-bold" style={{ color: C.esmeralda }}>R$ {valorGrama.toFixed(2).replace(".", ",")}</td>
                <td><button onClick={() => setPricingCategories(pricingCategories.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">X</button></td>
              </tr>
              );
            })}</tbody>
          </table>
          <button onClick={() => setPricingCategories([...pricingCategories, { id: Date.now(), name: "Nova", maxWeight: 10, variation: 0.5, color: "text-slate-600" }])} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>+ Faixa</button>
        </div>
          );
        })()}
        {/* Regras friso */}
        <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-bold text-gray-800">Regras de friso</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b" style={{ borderColor: C.cremeBorder }}>
              <th className="text-left py-2 text-xs text-gray-500">Larg. anel</th>
              <th className="text-left py-2 text-xs text-gray-500">Larg. friso</th>
              <th className="text-left py-2 text-xs text-gray-500">Prof.</th>
              <th className="text-left py-2 text-xs text-gray-500">Dist. borda</th>
              <th className="w-8"></th>
            </tr></thead>
            <tbody>{grooveRules.map((rule, i) => (
              <tr key={rule.id} className="border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                {(["ringWidth", "grooveWidth", "grooveDepth", "grooveOffset"] as const).map((f) => (
                  <td key={f} className="py-2 pr-2"><input type="number" value={rule[f]} step={0.1} onChange={(e) => { const u = [...grooveRules]; u[i] = { ...u[i], [f]: parseFloat(e.target.value) || 0 }; setGrooveRules(u); }} className="w-20 px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                ))}
                <td><button onClick={() => setGrooveRules(grooveRules.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">X</button></td>
              </tr>
            ))}</tbody>
          </table>
          <button onClick={() => setGrooveRules([...grooveRules, { id: Date.now(), ringWidth: 6, grooveWidth: 1, grooveDepth: 0.3, grooveOffset: 1 }])} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>+ Regra</button>
        </div>
        {/* Padrão Risco */}
        <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-bold text-gray-800">Padrao do Risco</h3>
          <p className="text-[11px] text-gray-500">Valores padrao aplicados ao selecionar &quot;Risco&quot; no editor de alianca.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Largura (mm)</label>
              <input type="number" min={0.01} step={0.01} value={riscoWidth}
                onChange={e => setRiscoWidth(parseFloat(e.target.value) || 0.1)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none font-mono" style={{ borderColor: C.cremeBorder }} />
              <p className="text-[10px] text-gray-400 mt-1">Padrao: 0.10mm (linha fina)</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Profundidade (mm)</label>
              <input type="number" min={0.05} step={0.05} value={riscoDepth}
                onChange={e => setRiscoDepth(parseFloat(e.target.value) || 0.2)}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none font-mono" style={{ borderColor: C.cremeBorder }} />
              <p className="text-[10px] text-gray-400 mt-1">Padrao: 0.20mm</p>
            </div>
          </div>
        </div>
        {/* Gravação */}
        <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-bold text-gray-800">Gravacao (nome/data)</h3>
          <p className="text-[11px] text-gray-500">Valor cobrado por alianca que tiver gravacao interna (nome ou data).</p>
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-500 mb-1">Preco gravacao (R$)</label>
            <input type="number" min={0} step={10} value={precoGravacao}
              onChange={e => setPrecoGravacao(parseFloat(e.target.value) || 0)}
              className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none font-mono" style={{ borderColor: C.cremeBorder }} />
            <p className="text-[10px] text-gray-400 mt-1">Padrao: R$ 100,00</p>
          </div>
        </div>
        {/* Simulador e Editor de Precos de Pedras */}
        {(() => {
          const sp = stonePricesLocal[simPedra];
          const isZirc = sp?.tipo === "zirconia";
          const STONE_CT: Array<{ mm: number; ct: number }> = STONE_CT_TABLE;
          const fmtCusto = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const fmtVenda = (v: number) => `R$ ${Math.ceil(v).toLocaleString("pt-BR")}`;

          return (
          <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">Simulador e Editor de Pedras</h3>
              <button onClick={() => setStonePricesLocal([...DEFAULT_STONE_PRICES])}
                className="text-[10px] font-semibold px-2 py-1 rounded border" style={{ borderColor: C.cremeBorder, color: "#6b7280" }}>
                <RotateCcw size={10} className="inline mr-1" /> Padrao
              </button>
            </div>

            {/* Linha de controles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Pedra</label>
                <select value={simPedra} onChange={(e) => {
                    const idx = Number(e.target.value);
                    setSimPedra(idx);
                    // Carregar markups salvos dessa pedra
                    const tipo = stonePricesLocal[idx]?.tipo;
                    const saved = allStoneMarkups[tipo ?? ""];
                    if (saved) {
                      setRowMarkups(Object.fromEntries(Object.entries(saved).map(([k, v]) => [Number(k), v])));
                    } else {
                      setRowMarkups({});
                    }
                  }}
                  className="w-full px-2 py-2 text-sm rounded-lg border outline-none bg-white" style={{ borderColor: C.cremeBorder }}>
                  {stonePricesLocal.map((s, i) => (
                    <option key={s.tipo} value={i}>{STONE_TYPES.find(t => t.value === s.tipo)?.label ?? s.tipo}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">{isZirc ? "Preco (R$/un)" : "Custo ($)"}</label>
                <input type="number" min={0} step={isZirc ? 1 : 10}
                  value={isZirc ? (sp.preco_rs_un ?? 0) : sp.preco_usd_ct}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0;
                    const updated = [...stonePricesLocal];
                    if (isZirc) updated[simPedra] = { ...updated[simPedra], preco_rs_un: v };
                    else updated[simPedra] = { ...updated[simPedra], preco_usd_ct: v };
                    setStonePricesLocal(updated);
                  }}
                  className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono" style={{ borderColor: C.cremeBorder }} />
              </div>
              {!isZirc && (<>
                <div>
                  <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Dolar (R$)</label>
                  <input type="number" disabled value={cotacaoDolar.toFixed(2)}
                    className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono bg-gray-50 text-gray-400" style={{ borderColor: C.cremeBorder }} />
                </div>
              <div>
                <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Mkp 1mm</label>
                <input type="number" min={1} step={0.1} value={mkpInicial}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 1) {
                      setMkpInicial(v);
                      const final = Math.max(1, v - mkpDecremento * (STONE_CT_TABLE.length - 1));
                      setMkpFinal(Math.round(final * 10) / 10);
                      const newMkps: Record<number, number> = {};
                      STONE_CT_TABLE.forEach((_, idx) => { newMkps[idx] = Math.round(Math.max(1, v - idx * mkpDecremento) * 10) / 10; });
                      setRowMarkups(newMkps);
                    }
                  }}
                  className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono" style={{ borderColor: C.cremeBorder }} />
              </div>
              <div>
                <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Decremento</label>
                <input type="number" min={0} step={0.1} value={mkpDecremento}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 0) {
                      setMkpDecremento(v);
                      // Decrementa a partir do inicial, clampado entre final e inicial
                      // Inicial e final NÃO mudam
                      const newMkps: Record<number, number> = {};
                      const lastIdx = STONE_CT_TABLE.length - 1;
                      STONE_CT_TABLE.forEach((_, idx) => {
                        if (idx === 0) { newMkps[idx] = mkpInicial; return; }
                        if (idx === lastIdx) { newMkps[idx] = mkpFinal; return; }
                        const val = Math.max(mkpFinal, Math.min(mkpInicial, mkpInicial - idx * v));
                        newMkps[idx] = Math.round(val * 10) / 10;
                      });
                      setRowMarkups(newMkps);
                    }
                  }}
                  className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono" style={{ borderColor: C.cremeBorder }} />
              </div>
              <div>
                <label className="text-[9px] text-gray-400 block mb-1 font-bold uppercase">Mkp 2.5mm</label>
                <input type="number" min={1} step={0.1} value={mkpFinal}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (!isNaN(v) && v >= 1) {
                      setMkpFinal(v);
                      const steps = STONE_CT_TABLE.length - 1;
                      const dec = steps > 0 ? Math.round((mkpInicial - v) / steps * 10) / 10 : 0;
                      setMkpDecremento(dec);
                      const newMkps: Record<number, number> = {};
                      STONE_CT_TABLE.forEach((_, idx) => { newMkps[idx] = Math.round(Math.max(1, mkpInicial - idx * dec) * 10) / 10; });
                      setRowMarkups(newMkps);
                    }
                  }}
                  className="w-full px-2 py-2 text-sm rounded-lg border outline-none font-mono" style={{ borderColor: C.cremeBorder }} />
              </div>
              </>)}
            </div>

            {/* Zircônia: preço fixo, sem tabela */}
            {isZirc && (
              <div className="border rounded-lg p-4 space-y-2" style={{ borderColor: C.cremeBorder, backgroundColor: C.cremeBg }}>
                <p className="text-[11px] text-gray-500">Zirconia tem preco unico por unidade, independente do tamanho.</p>
                <div className="flex items-center gap-3">
                  <label className="text-[10px] text-gray-500 font-semibold">Preco por unidade (R$):</label>
                  <input type="number" min={0} step={1} value={sp.preco_rs_un ?? 0}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      const updated = [...stonePricesLocal];
                      updated[simPedra] = { ...updated[simPedra], preco_rs_un: v };
                      setStonePricesLocal(updated);
                    }}
                    className="w-28 px-2 py-1.5 text-sm rounded-lg border outline-none font-mono" style={{ borderColor: C.cremeBorder }} />
                  <span className="text-[11px] font-bold" style={{ color: C.esmeralda }}>R$ {(sp.preco_rs_un ?? 0).toFixed(0)}/un</span>
                </div>
              </div>
            )}

            {/* Tabela de prévia por tamanho (não zircônia) */}
            {!isZirc && (
            <div className="border rounded-lg overflow-hidden" style={{ borderColor: C.cremeBorder }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: C.cremeBg }}>
                <h4 className="text-[10px] font-bold uppercase text-gray-500">Previa por tamanho</h4>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: C.cremeBorder, backgroundColor: "#FAFAF7" }}>
                      <th className="text-left px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Tam</th>
                      <th className="text-left px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Peso</th>
                      <th className="text-right px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Custo (R$)</th>
                      <th className="text-right px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Markup</th>
                      <th className="text-right px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Venda (R$)</th>
                      <th className="text-right px-3 py-1.5 text-[10px] text-gray-500 font-semibold">Lucro (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {STONE_CT.map((row, rowIdx) => {
                      const steps = STONE_CT_TABLE.length - 1;
                      const autoDecr = steps > 0 ? (mkpInicial - mkpFinal) / steps : 0;
                      const rowMkp = rowMarkups[rowIdx] ?? Math.round((mkpInicial - rowIdx * autoDecr) * 10) / 10;
                      const custoRS = row.ct * sp.preco_usd_ct * cotacaoDolar;
                      const vendaRS = custoRS * rowMkp;
                      const lucro = custoRS > 0 ? ((vendaRS - custoRS) / vendaRS * 100) : 0;
                      return (
                        <tr key={row.mm} className="border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                          <td className="px-3 py-1.5 font-mono font-bold text-[11px]">{row.mm}mm</td>
                          <td className="px-3 py-1.5 text-[11px] text-gray-500">{row.ct.toFixed(3)} ct</td>
                          <td className="px-3 py-1.5 text-right font-mono text-[11px] text-gray-500">{fmtCusto(custoRS)}</td>
                          <td className="px-1 py-0.5 text-right">
                            <input type="number" min={1} step={0.1} value={rowMkp}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v) && v >= 1) {
                                  setRowMarkups(prev => {
                                    const next = { ...prev, [rowIdx]: Math.round(v * 10) / 10 };
                                    // Pedra menor nunca mais barata: mkp anterior >= atual
                                    for (let i = rowIdx - 1; i >= 0; i--) {
                                      const autoVal = Math.round((mkpInicial - i * autoDecr) * 10) / 10;
                                      const cur = next[i] ?? autoVal;
                                      if (cur < v) next[i] = Math.round(v * 10) / 10;
                                      else break;
                                    }
                                    // Pedra maior nunca mais cara: mkp seguinte <= atual
                                    for (let i = rowIdx + 1; i < STONE_CT_TABLE.length; i++) {
                                      const autoVal = Math.round((mkpInicial - i * autoDecr) * 10) / 10;
                                      const cur = next[i] ?? autoVal;
                                      if (cur > v) next[i] = Math.round(v * 10) / 10;
                                      else break;
                                    }
                                    return next;
                                  });
                                }
                              }}
                              className="w-14 px-1 py-0.5 text-[11px] font-mono border rounded text-right outline-none"
                              style={{ borderColor: C.cremeBorder, color: C.esmeralda }} />
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-[11px] font-bold" style={{ color: C.esmeralda }}>{fmtVenda(vendaRS)}</td>
                          <td className="px-3 py-1.5 text-right font-mono text-[11px]" style={{ color: lucro >= 50 ? "#059669" : "#DC2626" }}>{lucro.toFixed(0)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {/* Salvar tabela desta pedra */}
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  const tipo = sp?.tipo;
                  if (!tipo) return;
                  const updated = { ...allStoneMarkups, [tipo]: { ...rowMarkups } };
                  setAllStoneMarkups(updated);
                  try {
                    const res = await fetch("/api/orcamento/config", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ stone_markups_table: updated, stone_prices: stonePricesLocal }),
                    });
                    if (!res.ok) throw new Error();
                    setConfigMsg(`Tabela ${STONE_TYPES.find(t => t.value === tipo)?.label ?? tipo} salva!`);
                    setTimeout(() => setConfigMsg(null), 3000);
                  } catch {
                    setConfigMsg("Erro ao salvar tabela");
                  }
                }}
                className="flex-1 py-2 text-xs font-bold rounded-lg text-white transition-colors"
                style={{ backgroundColor: C.esmeralda }}
              >
                Salvar Tabela — {STONE_TYPES.find(t => t.value === sp?.tipo)?.label ?? ""}
              </button>
              {configMsg && <span className="text-xs font-semibold text-emerald-600">{configMsg}</span>}
            </div>
          </div>
          );
        })()}

        {/* Tabelas salvas por pedra (expansíveis) */}
        {Object.keys(allStoneMarkups).length > 0 && (
          <div className="bg-white rounded-xl border p-5 space-y-2" style={{ borderColor: C.cremeBorder }}>
            <h3 className="text-sm font-bold text-gray-800">Tabelas Salvas</h3>
            <p className="text-[10px] text-gray-400">Clique para expandir e ver os markups salvos de cada pedra.</p>
            {STONE_TYPES.map((st) => {
              const saved = allStoneMarkups[st.value];
              if (!saved || Object.keys(saved).length === 0 || st.value === "zirconia") return null;
              const spRow = stonePricesLocal.find(s => s.tipo === st.value);
              return (
                <details key={st.value} className="border rounded-lg" style={{ borderColor: C.cremeBorder }}>
                  <summary className="px-3 py-2 cursor-pointer text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                    <span>{st.label}</span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      ${spRow?.preco_usd_ct ?? 0}/ct · {Object.keys(saved).length} tamanhos
                    </span>
                  </summary>
                  <div className="px-3 pb-2">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b" style={{ borderColor: C.cremeBorder }}>
                          <th className="text-left py-1 text-gray-400">Tam</th>
                          <th className="text-right py-1 text-gray-400">Mkp</th>
                          <th className="text-right py-1 text-gray-400">Custo</th>
                          <th className="text-right py-1 text-gray-400">Venda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {STONE_CT_TABLE.map((row, idx) => {
                          const mkp = saved[String(idx)];
                          if (mkp == null) return null;
                          const custo = row.ct * (spRow?.preco_usd_ct ?? 0) * cotacaoDolar;
                          const venda = custo * mkp;
                          return (
                            <tr key={idx} className="border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                              <td className="py-0.5 font-mono">{row.mm}mm</td>
                              <td className="py-0.5 text-right font-mono" style={{ color: C.esmeralda }}>{mkp.toFixed(1)}</td>
                              <td className="py-0.5 text-right font-mono text-gray-400">R$ {custo.toFixed(2).replace(".", ",")}</td>
                              <td className="py-0.5 text-right font-mono font-bold" style={{ color: C.esmeralda }}>R$ {Math.ceil(venda)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button onClick={handleSaveConfig} disabled={isSavingConfig} className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-lg text-white disabled:opacity-50" style={{ background: C.esmeralda }}>
            {isSavingConfig ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
          </button>
          <button onClick={() => { setPricingCategories(DEFAULT_PRICING_CATEGORIES); setGrooveRules(DEFAULT_GROOVE_RULES); setStonePricesLocal([...DEFAULT_STONE_PRICES]); }} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border" style={{ borderColor: C.cremeBorder, color: "#6b7280" }}>
            <RotateCcw size={12} /> Resetar
          </button>
          {configMsg && <span className="text-xs font-semibold text-emerald-600">{configMsg}</span>}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESIGN — layout principal
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 md:p-5 space-y-4" style={{ backgroundColor: C.cremeBg, minHeight: "100vh" }}>

      {/* ── Topo: Cliente + titulo + acoes ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button onClick={() => setOrcamentoTipo(null)} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">← Voltar</button>
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: C.esmeralda }}>
            <CircleDot size={16} color="#fff" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-800 leading-tight">
              {allianceMode === "par" ? "Par de Alianças" : "Orçamento de Alianças"}
            </h1>
            <p className="text-[11px] text-gray-400">Ouro: R$ {params.goldPrice.toFixed(2)}/g</p>
          </div>
        </div>
        {/* Cliente autocomplete */}
        <div className="relative min-w-[260px]" ref={clienteDropdownRef}>
          <div className="flex items-center gap-2 bg-white rounded-xl border px-3 py-2" style={{ borderColor: clienteId ? "#059669" : C.cremeBorder }}>
            <User size={14} className={clienteId ? "text-green-600" : "text-gray-400"} />
            <input type="text" value={clientName}
              onChange={(e) => { setClientName(e.target.value); setClienteId(null); buscarClientes(e.target.value); }}
              onFocus={() => { if (clienteResults.length > 0) setShowClienteDropdown(true); }}
              placeholder="Buscar cliente..."
              className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder:text-gray-300" />
            {clienteId && <span className="text-[9px] text-green-600 font-semibold shrink-0">Vinculado</span>}
            {!clienteId && clienteSemResultados && (
              <button onClick={() => { const d = clientName.replace(/\D/g, ""); setNovoClienteForm(p => ({ ...p, cpf_cnpj: d.length >= 11 ? d : "", nome: d.length < 11 ? clientName : "" })); setShowNovoClienteForm(true); setClienteErr(""); }} className="text-[9px] text-blue-600 font-semibold shrink-0 hover:underline">+ Cadastrar</button>
            )}
          </div>
          {showClienteDropdown && clienteResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: C.cremeBorder }}>
              {clienteResults.map((c) => (
                <button key={c.id} onClick={() => selecionarCliente(c)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                  <p className="font-medium">{c.nome}</p>
                  <p className="text-[10px] text-gray-400">{c.cpf_cnpj ? maskCpfCnpj(c.cpf_cnpj) : (c.telefone ?? c.celular ?? "—")}</p>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Botoes */}
        <div className="flex items-center gap-1.5">
          {validationErrors.length > 0 && (
            <span className="text-[10px] font-semibold text-red-500 mr-2 max-w-[320px] truncate" title={validationErrors.map(e => e.message).join(" · ")}>
              ⚠ {validationErrors[0].message}
            </span>
          )}
          <button
            onClick={handleSaveOrder}
            disabled={isSaving || validationErrors.length > 0}
            title={validationErrors.length > 0 ? validationErrors[0].message : "Salvar orcamento"}
            className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold rounded-lg text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: C.esmeralda }}
          >
            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
          </button>
          <button onClick={() => window.print()} className="p-2 rounded-lg border" style={{ borderColor: C.cremeBorder }} title="Imprimir">
            <Printer size={14} className="text-gray-500" />
          </button>
          <button onClick={exportSTL} disabled={!currentMesh} className="p-2 rounded-lg border disabled:opacity-30" style={{ borderColor: C.cremeBorder }} title="Exportar STL">
            <Download size={14} className="text-gray-500" />
          </button>
          {canManageConfig && (
            <button onClick={() => setTab("config")} className="p-2 rounded-lg border" style={{ borderColor: C.cremeBorder }} title="Configurações">
              <Settings2 size={14} className="text-gray-500" />
            </button>
          )}
        </div>
        {saveMsg && <span className={`text-[11px] font-bold ${saveMsg.type === "success" ? "text-emerald-600" : "text-red-500"}`}>{saveMsg.text}</span>}
      </div>

      {/* ── Flex: Controles (esquerda) | 3D (direita) ─────────────────── */}
      <div style={{ display: "flex", gap: "12px", height: "calc(100vh - 130px)", overflow: "hidden" }}>

        {/* ── Painel de controles (ESQUERDA — 320px fixo, scroll) ─────── */}
        <div style={{ width: "300px", minWidth: "300px", overflowY: "hidden" }} className="space-y-1">

          {/* Tabs Aliança 1 / Aliança 2 (quando par) */}
          {allianceMode === "par" && (
            <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
              {([1, 2] as const).map(n => (
                <button key={n} onClick={() => setActiveRing(n)}
                  className="flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: activeRing === n ? "#fff" : "transparent",
                    color: activeRing === n ? C.esmeralda : "#9CA3AF",
                    boxShadow: activeRing === n ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  }}>
                  Aliança {n}
                </button>
              ))}
            </div>
          )}

          {/* ── Perfil + Medidas + Metal (compacto, sem scroll) ── */}
          <div className="bg-white rounded-lg border px-2 py-1.5 space-y-1" style={{ borderColor: C.cremeBorder }}>
            {/* Perfil — grid 4 colunas */}
            <h3 className="text-[8px] font-bold uppercase tracking-wider text-gray-400">Perfil</h3>
            <div className="grid grid-cols-4 gap-0.5">
              {PROFILE_OPTIONS.map((p) => (
                <button key={p.id} onClick={() => (activeRing === 1 ? setProfile : setProfile2)(p.id)}
                  className="py-0.5 text-[8px] font-semibold rounded border transition-all text-center leading-tight"
                  style={(activeRing === 1 ? profile : profile2) === p.id
                    ? { backgroundColor: C.esmeralda, color: "#fff", borderColor: C.esmeralda }
                    : { backgroundColor: "#fff", color: "#6b7280", borderColor: C.cremeBorder }
                  }>{p.label}</button>
              ))}
            </div>

            {/* Medidas — grid de campos numéricos */}
            <h3 className="text-[8px] font-bold uppercase tracking-wider text-gray-400">Medidas</h3>
            <div className="grid grid-cols-3 gap-1">
              <div>
                <label className="text-[8px] text-gray-400 block">Aro</label>
                <select value={(activeRing === 1 ? ringSize : ringSize2).size}
                  onChange={(e) => { const s = RING_SIZES.find((r) => r.size === Number(e.target.value)); if (s) (activeRing === 1 ? handleSizeChange : handleSizeChange2)(s); }}
                  className="w-full appearance-none px-2 py-1.5 text-[10px] rounded-md border bg-white text-gray-700 outline-none"
                  style={{ borderColor: C.cremeBorder }}>
                  {RING_SIZES.map((s) => <option key={s.size} value={s.size}>{s.size}</option>)}
                </select>
              </div>
              {(() => {
                const mnW = activeParams.hasStones && activeProfile !== ProfileType.QuadradoCanal ? (activeRing === 1 ? minWidth : minWidth2) : 1;
                const mnH = activeParams.hasStones && activeProfile !== ProfileType.QuadradoCanal ? (activeRing === 1 ? minThickness : minThickness2) : 0.5;
                return (<>
              <div>
                <label className="text-[8px] text-gray-400 block">
                  Largura (mm){mnW > 1 && <span className="text-red-400 ml-1">min {mnW.toFixed(1)}</span>}
                </label>
                <input type="number" step={0.5} min={mnW} max={15}
                  value={activeParams.width}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateParam("width", Math.max(v, mnW)); }}
                  onBlur={() => { if (activeParams.width < mnW) updateParam("width", mnW); }}
                  className="w-full px-1.5 py-1 text-[9px] font-mono border rounded outline-none"
                  style={{ borderColor: C.cremeBorder }} />
              </div>
              <div>
                <label className="text-[8px] text-gray-400 block">
                  Espessura (mm){mnH > 0.5 && <span className="text-red-400 ml-1">min {mnH.toFixed(1)}</span>}
                </label>
                <input type="number" step={0.1} min={mnH} max={4}
                  value={activeParams.height}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateParam("height", Math.max(v, mnH)); }}
                  onBlur={() => { if (activeParams.height < mnH) updateParam("height", mnH); }}
                  className="w-full px-1.5 py-1 text-[9px] font-mono border rounded outline-none"
                  style={{ borderColor: C.cremeBorder }} />
              </div>
                </>);
              })()}
              {/* Campos condicionais por perfil */}
              {activeProfile === ProfileType.Concava && (
                <div>
                  <label className="text-[8px] text-gray-400 block">Prof. concava</label>
                  <input type="number" step={0.1} min={0.1} max={1.5}
                    value={activeParams.concaveDepth}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateParam("concaveDepth", v); }}
                    onBlur={() => { if (activeParams.concaveDepth < 0.1) updateParam("concaveDepth", 0.1); }}
                    className="w-full px-1.5 py-1 text-[9px] font-mono border rounded outline-none"
                    style={{ borderColor: C.cremeBorder }} />
                </div>
              )}
              {/* Curvatura fixo 100% — configurável em Configurações */
              false && (
                <div />
              )}
              {activeProfile === ProfileType.Chanfrada && (
                <div>
                  <label className="text-[8px] text-gray-400 block">Chanfro (mm)</label>
                  <input type="number" step={0.1} min={0.1} max={2}
                    value={activeParams.chamferSize}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateParam("chamferSize", v); }}
                    onBlur={() => { if (activeParams.chamferSize < 0.1) updateParam("chamferSize", 0.1); }}
                    className="w-full px-1.5 py-1 text-[9px] font-mono border rounded outline-none"
                    style={{ borderColor: C.cremeBorder }} />
                </div>
              )}
              {activeProfile === ProfileType.QuadradoCanal && (<>
                <div>
                  <label className="text-[8px] text-gray-400 block">Larg. canal</label>
                  <input type="number" step={0.5} min={1} max={10}
                    value={activeParams.canalWidth}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateParam("canalWidth", v); }}
                    onBlur={() => { if (activeParams.canalWidth < 1) updateParam("canalWidth", 1); }}
                    className="w-full px-1.5 py-1 text-[9px] font-mono border rounded outline-none"
                    style={{ borderColor: C.cremeBorder }} />
                </div>
                <div>
                  <label className="text-[8px] text-gray-400 block">
                    Alt. borda{activeParams.hasStones && <span className="text-red-400 ml-1">min {(activeRing === 1 ? minThickness : minThickness2).toFixed(1)}</span>}
                  </label>
                  <input type="number" step={0.1}
                    min={activeParams.hasStones ? (activeRing === 1 ? minThickness : minThickness2) : 0.3}
                    max={3}
                    value={activeParams.canalBorderHeight}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      const mn = activeParams.hasStones ? (activeRing === 1 ? minThickness : minThickness2) : 0.3;
                      if (!isNaN(v)) updateParam("canalBorderHeight", Math.max(v, mn));
                    }}
                    onBlur={() => {
                      const mn = activeParams.hasStones ? (activeRing === 1 ? minThickness : minThickness2) : 0.3;
                      if (activeParams.canalBorderHeight < mn) updateParam("canalBorderHeight", mn);
                    }}
                    className="w-full px-1.5 py-1 text-[9px] font-mono border rounded outline-none"
                    style={{ borderColor: C.cremeBorder }} />
                </div>
              </>)}
            </div>

            {/* Metal — inline */}
            <h3 className="text-[8px] font-bold uppercase tracking-wider text-gray-400">Metal</h3>
            <div className="flex gap-1">
              {METAL_COLORS.map((mc) => (
                <button key={mc.value} onClick={() => { updateParam("metalColor", mc.value); updateParam("goldDensity", mc.density); }}
                  className="flex-1 py-0.5 text-[8px] font-semibold rounded border transition-all text-center"
                  style={activeParams.metalColor === mc.value
                    ? { backgroundColor: mc.value, color: mc.value === "#E8E8E8" ? "#333" : "#fff", borderColor: C.esmeralda, boxShadow: `0 0 0 2px ${C.esmeralda}` }
                    : { backgroundColor: "#fff", color: "#6b7280", borderColor: C.cremeBorder }
                  }>{mc.label}</button>
              ))}
            </div>

            {/* ── Detalhes (Friso / Risco) ── */}
            <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: C.cremeBorder }}>
              <h3 className="text-[8px] font-bold uppercase tracking-wider text-gray-400">Detalhes</h3>
              <button
                onClick={() => {
                  const next = !activeParams.hasGroove;
                  updateParam("hasGroove", next);
                  if (next) {
                    if (activeParams.grooveKind === "risco") {
                      updateParam("grooveWidth", riscoWidth);
                      updateParam("grooveDepth", riscoDepth);
                      const rule = findGrooveRule(activeParams.width, grooveRules);
                      updateParam("grooveOffset", rule.grooveOffset);
                    } else {
                      const rule = findGrooveRule(activeParams.width, grooveRules);
                      updateParam("grooveWidth", rule.grooveWidth);
                      updateParam("grooveDepth", rule.grooveDepth);
                      updateParam("grooveOffset", rule.grooveOffset);
                    }
                  }
                }}
                className="px-2 py-0.5 rounded-full text-[9px] font-semibold transition-colors"
                style={{
                  backgroundColor: activeParams.hasGroove ? C.esmeralda : "#F3F4F6",
                  color: activeParams.hasGroove ? "#fff" : "#6B7280",
                }}
              >
                {activeParams.hasGroove ? "ON" : "OFF"}
              </button>
              {activeParams.hasGroove && (
                <div className="flex gap-1">
                  {([["friso", "Friso"], ["risco", "Risco"]] as const).map(([val, lbl]) => (
                    <button key={val}
                      onClick={() => {
                        updateParam("grooveKind", val);
                        if (val === "risco") {
                          updateParam("grooveWidth", riscoWidth);
                          updateParam("grooveDepth", riscoDepth);
                        } else {
                          const rule = findGrooveRule(activeParams.width, grooveRules);
                          updateParam("grooveWidth", rule.grooveWidth);
                          updateParam("grooveDepth", rule.grooveDepth);
                        }
                      }}
                      className="px-2 py-0.5 text-[9px] font-semibold rounded-md border transition-all text-center"
                      style={activeParams.grooveKind === val
                        ? { backgroundColor: C.esmeralda, color: "#fff", borderColor: C.esmeralda }
                        : { backgroundColor: "#fff", color: "#6b7280", borderColor: C.cremeBorder }
                      }
                    >{lbl}</button>
                  ))}
                </div>
              )}
            </div>
            {activeParams.hasGroove && (
              <div className="space-y-1.5">
                {/* Posição */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-400 w-[50px] shrink-0">Posicao</span>
                  <div className="flex gap-1 flex-1">
                    {GROOVE_TYPE_OPTIONS.map((opt) => (
                      <button key={opt.value}
                        onClick={() => updateParam("grooveType", opt.value)}
                        className="flex-1 py-0.5 text-[9px] font-semibold rounded-md border transition-all text-center"
                        style={activeParams.grooveType === opt.value
                          ? { backgroundColor: C.esmeralda, color: "#fff", borderColor: C.esmeralda }
                          : { backgroundColor: "#fff", color: "#6b7280", borderColor: C.cremeBorder }
                        }
                      >{opt.label}</button>
                    ))}
                  </div>
                </div>
                {/* Lado removido — friso lateral sempre usa offset (dist. borda) */}
                {/* Avançado — campos editáveis (não interferem nos padrões salvos) */}
                <button
                  onClick={() => setShowGrooveAdvanced(v => !v)}
                  className="text-[8px] text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showGrooveAdvanced ? "▾ Avancado" : "▸ Avancado"} <span className="font-mono">{activeParams.grooveWidth.toFixed(2)} × {activeParams.grooveDepth.toFixed(1)}mm</span>
                </button>
                {showGrooveAdvanced && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <div>
                      <label className="text-[8px] text-gray-400 block">Largura</label>
                      <input type="number" step={activeParams.grooveKind === "risco" ? 0.05 : 0.1}
                        min={0.05} max={3.0}
                        value={activeParams.grooveWidth}
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateParam("grooveWidth", v); }}
                        onBlur={() => { if (activeParams.grooveWidth < 0.05) updateParam("grooveWidth", 0.05); }}
                        className="w-full px-1.5 py-1 text-[10px] font-mono border rounded-md outline-none"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                    <div>
                      <label className="text-[8px] text-gray-400 block">Profund.</label>
                      <input type="number" step={0.1} min={0.1} max={1.0}
                        value={activeParams.grooveDepth}
                        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateParam("grooveDepth", v); }}
                        onBlur={() => { if (activeParams.grooveDepth < 0.1) updateParam("grooveDepth", 0.1); }}
                        className="w-full px-1.5 py-1 text-[10px] font-mono border rounded-md outline-none"
                        style={{ borderColor: C.cremeBorder }} />
                    </div>
                    {activeParams.grooveType === "lateral" && (
                      <div>
                        <label className="text-[8px] text-gray-400 block">Dist. borda</label>
                        <input type="number" step={0.1} min={0.2} max={3.0}
                          value={activeParams.grooveOffset}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateParam("grooveOffset", v); }}
                          onBlur={() => { if (activeParams.grooveOffset < 0.2) updateParam("grooveOffset", 0.2); }}
                          className="w-full px-1.5 py-1 text-[10px] font-mono border rounded-md outline-none"
                          style={{ borderColor: C.cremeBorder }} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Pedras */}
          <Card title="Pedras">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={activeParams.hasStones} onChange={(e) => {
                updateParam("hasStones", e.target.checked);
                if (!e.target.checked) {
                  // Limpa entries ao desativar pedras
                  if (activeRing === 1) setStoneEntries([]);
                  else setStoneEntries2([]);
                }
              }} style={{ accentColor: C.esmeralda }} className="rounded" />
              <span className="text-[11px] text-gray-600">Incluir pedras</span>
            </label>
            {activeParams.hasStones && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500 w-[90px] shrink-0">Tamanho</span>
                  <input type="number" step={0.1} min={1} max={2.5}
                    value={activeParams.stoneSize}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) updateParam("stoneSize", v); }}
                    onBlur={() => { if (activeParams.stoneSize < 1) updateParam("stoneSize", 1); }}
                    className="w-20 px-2 py-1 text-[10px] font-mono border rounded-md outline-none"
                    style={{ borderColor: C.cremeBorder }} />
                  <span className="text-[10px] text-gray-400">mm</span>
                </div>
                {activeProfile === ProfileType.QuadradoCanal && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500 w-[90px] shrink-0">Fileiras</span>
                    <select
                      value={activeParams.stoneRows}
                      onChange={(e) => updateParam("stoneRows", Number(e.target.value))}
                      className="flex-1 text-[11px] border rounded-lg px-2 py-1 bg-white"
                      style={{ borderColor: C.cremeBorder }}
                    >
                      {Array.from({ length: activeRing === 1 ? maxStoneRows : maxStoneRows2 }, (_, i) => i + 1).map((n) => (
                        <option key={n} value={n}>{n} fileira{n > 1 ? "s" : ""}</option>
                      ))}
                    </select>
                    <span className="text-[9px] text-gray-400">máx {activeRing === 1 ? maxStoneRows : maxStoneRows2}</span>
                  </div>
                )}
                <div className="flex gap-1.5">
                  {(["Pontual", "Meia Alianca", "Volta Completa"] as const).map((tipo, i) => {
                    const active = i === 2 ? activeParams.stoneFull : i === 1 ? activeParams.stoneHalfMoon : !activeParams.stoneFull && !activeParams.stoneHalfMoon;
                    return (
                      <button key={tipo} onClick={() => {
                        if (i === 2) {
                          updateParam("stoneFull", true); updateParam("stoneHalfMoon", false);
                          // Auto max fileiras ao ativar volta completa
                          if (profile === ProfileType.QuadradoCanal) {
                            const mr = computeMaxStoneRows(activeParams.canalWidth, activeParams.stoneSize, calibracao);
                            updateParam("stoneRows", mr);
                          }
                        }
                        else if (i === 1) {
                          updateParam("stoneFull", false); updateParam("stoneHalfMoon", true);
                          if (profile === ProfileType.QuadradoCanal) {
                            const mr = computeMaxStoneRows(activeParams.canalWidth, activeParams.stoneSize, calibracao);
                            updateParam("stoneRows", mr);
                          }
                        }
                        else { updateParam("stoneFull", false); updateParam("stoneHalfMoon", false); }
                      }}
                        className="flex-1 py-1.5 text-[9px] font-semibold rounded-lg border transition-all text-center"
                        style={active
                          ? { backgroundColor: C.esmeralda, color: "#fff", borderColor: C.esmeralda }
                          : { backgroundColor: "#fff", color: "#6b7280", borderColor: C.cremeBorder }
                        }>{tipo}</button>
                    );
                  })}
                </div>
                {!activeParams.stoneFull && !activeParams.stoneHalfMoon && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">Qtd:</span>
                    <button onClick={() => updateParam("stoneCount", Math.max(1, activeParams.stoneCount - 1))} className="w-6 h-6 rounded-lg border flex items-center justify-center" style={{ borderColor: C.cremeBorder }}><Minus size={10} className="text-gray-500" /></button>
                    <span className="text-sm font-bold w-5 text-center" style={{ color: C.esmeralda }}>{activeParams.stoneCount}</span>
                    <button onClick={() => updateParam("stoneCount", Math.min(stoneCapacity, activeParams.stoneCount + 1))} className="w-6 h-6 rounded-lg border flex items-center justify-center" style={{ borderColor: C.cremeBorder }}><Plus size={10} className="text-gray-500" /></button>
                    <span className="text-[10px] text-gray-400">max {stoneCapacity}</span>
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={activeParams.stoneDrill} onChange={(e) => updateParam("stoneDrill", e.target.checked)} style={{ accentColor: C.esmeralda }} className="rounded" />
                  <span className="text-[10px] text-gray-500">Furo passante</span>
                </label>
                <p className="text-[10px] text-gray-400">{derivedStoneCount} pedra(s) de {activeParams.stoneSize}mm</p>
              </div>
            )}
          </Card>

          {/* Detalhamento de pedras (preciosa vs zirconia) */}
          {activeParams.hasStones && (() => {
            const isPontual = !activeParams.stoneFull && !activeParams.stoneHalfMoon;
            return (
            <Card title="Detalhamento (Preciosa/Zirconia)">
              {isPontual ? (
                <>
                  {/* PONTUAL: múltiplas entries com quantidade manual */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-gray-500">
                      {(activeRing === 1 ? stoneEntriesTotal : stoneEntriesTotal2)} de {derivedStoneCount} pedra(s)
                    </span>
                    <button
                      onClick={() => addAllianceStone(activeRing, activeParams.stoneSize)}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg transition-colors"
                      style={{ backgroundColor: "rgba(212,175,55,0.1)", color: C.gold }}
                    >
                      <Plus size={10} className="inline mr-1" />Adicionar
                    </button>
                  </div>
                  {activeStoneEntries.length === 0 ? (
                    <p className="text-[10px] text-gray-400 text-center py-2">
                      Sem detalhamento — todas serão <strong>zirconia</strong> (nao cobra).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {activeStoneEntries.map((se) => {
                        const typeMeta = STONE_TYPES.find((t) => t.value === se.tipo);
                        return (
                          <div key={se.id} className="rounded-lg border p-2 space-y-1" style={{ borderColor: C.cremeBorder }}>
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <label className="text-[9px] text-gray-400 block">Tipo</label>
                                <select value={se.tipo}
                                  onChange={(e) => updateAllianceStone(activeRing, se.id, "tipo", e.target.value)}
                                  className="w-full text-[10px] border rounded px-1 py-1" style={{ borderColor: C.cremeBorder }}>
                                  {STONE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="text-[9px] text-gray-400 block">Qtd</label>
                                <input type="number" min={1} max={derivedStoneCount} value={se.qtd}
                                  onChange={(e) => updateAllianceStone(activeRing, se.id, "qtd", Math.max(1, parseInt(e.target.value) || 1))}
                                  className="w-full text-[10px] border rounded px-1 py-1 font-mono" style={{ borderColor: C.cremeBorder }} />
                              </div>
                              <div className="flex items-end justify-end">
                                <button onClick={() => removeAllianceStone(activeRing, se.id)} className="text-red-400 hover:text-red-600 p-1"><Minus size={12} /></button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[9px]">
                              <span className={typeMeta?.is_preciosa ? "text-gray-500" : "text-gray-400 italic"}>
                                {typeMeta?.is_preciosa ? "Preciosa" : "Nao cobra (so ouro)"}
                              </span>
                              <span className="font-mono font-bold" style={{ color: C.gold }}>R$ {se.preco_total_rs.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* MEIA ALIANÇA / VOLTA COMPLETA: tipo único, qtd automática */}
                  <p className="text-[10px] text-gray-500 mb-2">
                    {derivedStoneCount} pedra(s) de {activeParams.stoneSize}mm — selecione o tipo:
                  </p>
                  {activeStoneEntries.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-[10px] text-gray-400 text-center py-2">
                        Padrao: <strong>zirconia</strong> (nao cobra). Clique abaixo para definir o tipo.
                      </p>
                      <button
                        onClick={() => {
                          // Adiciona entry com qtd = total derivado automaticamente
                          addAllianceStone(activeRing, activeParams.stoneSize);
                          // Atualiza a qtd para o total
                          setTimeout(() => {
                            const setter = activeRing === 1 ? setStoneEntries : setStoneEntries2;
                            setter((prev) => prev.map((e, i) => i === prev.length - 1
                              ? { ...e, qtd: derivedStoneCount, ...computeStoneEntryPrice({ ...e, qtd: derivedStoneCount }, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups) }
                              : e
                            ));
                          }, 0);
                        }}
                        className="w-full py-1.5 text-[10px] font-semibold rounded-lg border transition-colors text-center"
                        style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                      >
                        Definir tipo de pedra
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {activeStoneEntries.map((se) => {
                        const typeMeta = STONE_TYPES.find((t) => t.value === se.tipo);
                        // Recalcula com qtd = derivedStoneCount
                        const totalPrice = se.preco_unitario_rs * derivedStoneCount;
                        return (
                          <div key={se.id} className="rounded-lg border p-2 space-y-1" style={{ borderColor: C.cremeBorder }}>
                            <div className="flex items-center gap-2">
                              <div className="flex-1">
                                <label className="text-[9px] text-gray-400 block">Tipo</label>
                                <select value={se.tipo}
                                  onChange={(e) => {
                                    updateAllianceStone(activeRing, se.id, "tipo", e.target.value);
                                    // Atualiza qtd para derivedStoneCount
                                    setTimeout(() => updateAllianceStone(activeRing, se.id, "qtd", derivedStoneCount), 0);
                                  }}
                                  className="w-full text-[10px] border rounded px-1 py-1" style={{ borderColor: C.cremeBorder }}>
                                  {STONE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                </select>
                              </div>
                              <div className="text-center">
                                <label className="text-[9px] text-gray-400 block">Qtd</label>
                                <span className="text-[10px] font-mono font-bold" style={{ color: C.esmeralda }}>{derivedStoneCount}</span>
                              </div>
                              <div className="flex items-end">
                                <button onClick={() => removeAllianceStone(activeRing, se.id)} className="text-red-400 hover:text-red-600 p-1"><Minus size={12} /></button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[9px]">
                              <span className={typeMeta?.is_preciosa ? "text-gray-500" : "text-gray-400 italic"}>
                                {typeMeta?.is_preciosa
                                  ? `${derivedStoneCount} × R$ ${se.preco_unitario_rs.toFixed(2)}/un`
                                  : "Nao cobra (so ouro)"}
                              </span>
                              <span className="font-mono font-bold" style={{ color: C.gold }}>
                                R$ {(typeMeta?.is_preciosa ? totalPrice : 0).toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </Card>
            );
          })()}

          {/* Gravação */}
          <Card title="Gravacao">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={activeParams.textEnabled} onChange={(e) => {
                updateParam("textEnabled", e.target.checked);
                if (!e.target.checked) {
                  if (activeRing === 1) setTextosExtras([]);
                  else setTextosExtras2([]);
                }
              }} style={{ accentColor: C.esmeralda }} className="rounded" />
              <span className="text-[11px] text-gray-600">Gravar texto</span>
            </label>
            {activeParams.textEnabled && (() => {
              const extras = activeRing === 1 ? textosExtras : textosExtras2;
              const setExtras = activeRing === 1 ? setTextosExtras : setTextosExtras2;
              return (
              <div className="space-y-2 mt-2">
                {/* Primeiro nome — incluso */}
                <div>
                  <label className="text-[8px] text-gray-400 block">Nome principal <span className="text-emerald-500">(incluso)</span></label>
                  <input type="text" maxLength={20} value={activeParams.textContent}
                    onChange={(e) => {
                      // Sem espaços, só 1ª letra maiúscula, resto minúsculo
                      const raw = e.target.value.replace(/\s/g, "");
                      if (!raw) { updateParam("textContent", ""); return; }
                      const formatted = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
                      updateParam("textContent", formatted);
                    }}
                    placeholder="Nome (sem espaco)"
                    className="w-full px-3 py-1.5 text-[11px] rounded-lg border outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
                </div>
                {/* Textos adicionais — R$ cada */}
                {extras.map((txt, idx) => (
                  <div key={idx}>
                    <label className="text-[8px] text-gray-400 block">
                      {idx === 0 ? "Nome/data adicional" : `Adicional ${idx + 1}`} <span className="text-amber-500">+R$ {precoGravacao.toFixed(0)}</span>
                    </label>
                    <div className="flex gap-1">
                      <input type="text" maxLength={20} value={txt}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\s/g, "");
                          const formatted = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "";
                          const u = [...extras]; u[idx] = formatted; setExtras(u);
                        }}
                        placeholder="Nome ou data (sem espaco)"
                        className="flex-1 px-3 py-1.5 text-[11px] rounded-lg border outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
                      <button onClick={() => setExtras(extras.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 px-2">
                        <Minus size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                <button onClick={() => setExtras([...extras, ""])}
                  className="w-full py-1 text-[9px] font-semibold rounded-lg border transition-colors text-center"
                  style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>
                  + Nome/data adicional (R$ {precoGravacao.toFixed(0)})
                </button>
                {/* Fonte */}
                <div className="flex gap-1.5">
                  {([{ v: 1 as const, l: "Forma" }, { v: 2 as const, l: "Cursiva" }]).map(({ v, l }) => (
                    <button key={v} onClick={() => updateParam("textFontType", v)}
                      className="flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition-all text-center"
                      style={activeParams.textFontType === v
                        ? { backgroundColor: C.esmeralda, color: "#fff", borderColor: C.esmeralda }
                        : { backgroundColor: "#fff", color: "#6b7280", borderColor: C.cremeBorder }
                      }>{l}</button>
                  ))}
                </div>
                {extras.filter(t => t.trim()).length > 0 && (
                  <p className="text-[9px] text-amber-600 font-semibold">
                    +{extras.filter(t => t.trim()).length} adicional(is) = R$ {(extras.filter(t => t.trim()).length * precoGravacao).toFixed(0)}
                  </p>
                )}
              </div>
              );
            })()}
          </Card>

          {/* Precificacao removida — controlada via Configurações */}
        </div>

        {/* ── 3D + Resultado (DIREITA — flex:1, sem scroll) ────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px", minWidth: 0, overflow: "hidden" }}>
          {/* Viewport(s) 3D */}
          <div style={{ flex: 1, display: "flex", gap: "8px" }}>
            <div className="rounded-2xl overflow-hidden border relative" style={{ borderColor: activeRing === 1 && allianceMode === "par" ? C.esmeralda : C.cremeBorder, flex: 1, borderWidth: activeRing === 1 && allianceMode === "par" ? 2 : 1 }}>
              {allianceMode === "par" && (
                <div className="absolute top-2 left-2 z-10 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: C.esmeralda, color: "#fff" }}>Aliança 1</div>
              )}
              <AliancaViewport params={params} profile={profile} cameraDistance={cameraDistance} onMeshReady={setCurrentMesh} />
            </div>
            {allianceMode === "par" && (
              <div className="rounded-2xl overflow-hidden border relative" style={{ borderColor: activeRing === 2 ? C.esmeralda : C.cremeBorder, flex: 1, borderWidth: activeRing === 2 ? 2 : 1 }}>
                <div className="absolute top-2 left-2 z-10 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: C.esmeralda, color: "#fff" }}>Aliança 2</div>
                <AliancaViewport params={params2} profile={profile2} cameraDistance={cameraDistance2} onMeshReady={setCurrentMesh2} />
              </div>
            )}
          </div>
          {/* Resultado compacto */}
          <div className="rounded-xl border px-4 py-2.5 shrink-0" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
            <div className="flex items-center justify-between gap-4">
              {allianceMode === "par" ? (
                <>
                  <Pill
                    label={showRawWeight ? "Peso 1 (real)" : "Peso 1"}
                    value={`${(showRawWeight ? weightEst.weightRaw : pricing.weight).toFixed(showRawWeight ? 3 : 1)}g`}
                    onDoubleClick={toggleRawWeight}
                    title={showRawWeight ? `Arredondado: ${pricing.weight.toFixed(1)}g (clique 2× para voltar)` : `Peso real: ${weightEst.weightRaw.toFixed(3)}g (clique 2× para ver)`}
                  />
                  <Pill
                    label={showRawWeight ? "Peso 2 (real)" : "Peso 2"}
                    value={`${(showRawWeight ? weightEst2.weightRaw : pricing2.weight).toFixed(showRawWeight ? 3 : 1)}g`}
                    onDoubleClick={toggleRawWeight}
                    title={showRawWeight ? `Arredondado: ${pricing2.weight.toFixed(1)}g (clique 2× para voltar)` : `Peso real: ${weightEst2.weightRaw.toFixed(3)}g (clique 2× para ver)`}
                  />
                  <Pill
                    label={showRawWeight ? "Total (real)" : "Total"}
                    value={`${(showRawWeight ? (weightEst.weightRaw + weightEst2.weightRaw) : pricingTotal.weight).toFixed(showRawWeight ? 3 : 1)}g`}
                    onDoubleClick={toggleRawWeight}
                    title={showRawWeight ? `Arredondado: ${pricingTotal.weight.toFixed(1)}g (clique 2× para voltar)` : `Peso real: ${(weightEst.weightRaw + weightEst2.weightRaw).toFixed(3)}g (clique 2× para ver)`}
                  />
                </>
              ) : (
                <Pill
                  label={showRawWeight ? "Peso (real)" : "Peso"}
                  value={`${(showRawWeight ? weightEst.weightRaw : pricing.weight).toFixed(showRawWeight ? 3 : 1)}g`}
                  onDoubleClick={toggleRawWeight}
                  title={showRawWeight ? `Arredondado: ${pricing.weight.toFixed(1)}g (clique 2× para voltar)` : `Peso real: ${weightEst.weightRaw.toFixed(3)}g (clique 2× para ver)`}
                />
              )}
              {/* Pills de ouro e pedras (só quando há pedras preciosas) */}
              {(() => {
                const ouroTotal = allianceMode === "par" ? pricing.discountPrice + pricing2.discountPrice : pricing.discountPrice;
                const pedrasTotal = allianceMode === "par" ? pedrasCost + pedrasCost2 : pedrasCost;
                const gravTotal = allianceMode === "par" ? gravacaoCost + gravacaoCost2 : gravacaoCost;
                const hasExtras = pedrasTotal > 0 || gravTotal > 0;
                if (!hasExtras) return null;
                return (
                  <>
                    <Pill label="Ouro" value={`R$ ${ouroTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                    {pedrasTotal > 0 && <Pill label="Pedras" value={`R$ ${pedrasTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />}
                    {gravTotal > 0 && <Pill label="Gravacao" value={`R$ ${gravTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />}
                  </>
                );
              })()}
              <div className="flex items-center gap-3">
                <div className="text-center">
                  <p className="text-[9px] uppercase tracking-wider text-gray-400">Desconto</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateParam("discountPercent", Math.max(0, (activeRing === 1 ? params : params2).discountPercent - 1))}
                      className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 text-xs">-</button>
                    <span className="text-sm font-bold w-8 text-center" style={{ color: (activeRing === 1 ? params : params2).discountPercent > 0 ? "#DC2626" : C.esmeralda }}>
                      {(activeRing === 1 ? params : params2).discountPercent}%
                    </span>
                    <button onClick={() => {
                      const limit = canManageConfig ? 50 : (maxDesconto || 0);
                      const curr = (activeRing === 1 ? params : params2).discountPercent;
                      updateParam("discountPercent", Math.min(limit, curr + 1));
                    }}
                      className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:bg-gray-100 text-xs">+</button>
                  </div>
                  {!canManageConfig && maxDesconto > 0 && (
                    <p className="text-[8px] text-gray-300">max {maxDesconto}%</p>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] uppercase tracking-wide" style={{ color: C.gold }}>
                  {allianceMode === "par" ? "Preço Total Par" : "Preco Final"}
                </p>
                <p className="text-2xl font-black tracking-tight" style={{ color: C.esmeralda }}>
                  R$ {pricingTotal.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                {allianceMode === "par" && (
                  <p className="text-[9px] text-gray-400">
                    A1: R$ {pricing.discountPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | A2: R$ {pricing2.discountPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Novo Cliente */}
      {showNovoClienteForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setShowNovoClienteForm(false); setClienteErr(""); setCpfExistente(null); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: "#374151" }}>Novo Cliente</p>
              <button onClick={() => { setShowNovoClienteForm(false); setClienteErr(""); setCpfExistente(null); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Nome <span className="text-red-500">*</span></label>
                <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" placeholder="Nome completo" value={novoClienteForm.nome} onChange={e => setNovoClienteForm(p => ({ ...p, nome: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>CPF/CNPJ</label>
                <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none font-mono" placeholder="000.000.000-00" value={novoClienteForm.cpf_cnpj} onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cpf_cnpj: v })); checkCpfDuplicado(v); }} style={{ borderColor: cpfExistente ? "#EF4444" : C.cremeBorder }} />
                {cpfExistente && <p className="text-xs text-red-500 mt-1">Já cadastrado: {cpfExistente} <button className="underline ml-1" onClick={() => setShowNovoClienteForm(false)}>Buscar</button></p>}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Email</label>
                <input type="email" className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.email} onChange={e => setNovoClienteForm(p => ({ ...p, email: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Telefone</label>
                <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.telefone} onChange={e => setNovoClienteForm(p => ({ ...p, telefone: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Celular</label>
                <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.celular} onChange={e => setNovoClienteForm(p => ({ ...p, celular: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
              </div>
            </div>
            <div className="pt-3 border-t" style={{ borderColor: C.cremeBorder }}>
              <p className="text-xs font-semibold mb-2" style={{ color: C.esmeralda }}>Endereço</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>CEP</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none font-mono" placeholder="00000-000" value={novoClienteForm.cep} onChange={e => { const v = e.target.value; setNovoClienteForm(p => ({ ...p, cep: v })); if (v.replace(/\D/g, "").length === 8) buscaCEP(v); }} style={{ borderColor: C.cremeBorder }} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Logradouro</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.endereco} onChange={e => setNovoClienteForm(p => ({ ...p, endereco: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Número</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.numero} onChange={e => setNovoClienteForm(p => ({ ...p, numero: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Complemento</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.complemento} onChange={e => setNovoClienteForm(p => ({ ...p, complemento: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Bairro</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.bairro} onChange={e => setNovoClienteForm(p => ({ ...p, bairro: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>Município</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" value={novoClienteForm.municipio} onChange={e => setNovoClienteForm(p => ({ ...p, municipio: e.target.value }))} style={{ borderColor: C.cremeBorder }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: "#374151" }}>UF</label>
                  <input className="w-full border rounded-lg px-3 py-2.5 text-sm outline-none" maxLength={2} value={novoClienteForm.uf} onChange={e => setNovoClienteForm(p => ({ ...p, uf: e.target.value.toUpperCase() }))} style={{ borderColor: C.cremeBorder }} />
                </div>
              </div>
            </div>
            {clienteErr && <p className="text-sm text-red-600">{clienteErr}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { setShowNovoClienteForm(false); setClienteErr(""); setCpfExistente(null); }} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>Cancelar</button>
              <button onClick={handleCriarCliente} disabled={savingCliente} className="flex items-center gap-1.5 flex-1 justify-center py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: C.esmeralda }}>
                {savingCliente ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar Cliente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border px-2 py-1.5 space-y-1" style={{ borderColor: C.cremeBorder }}>
      <h3 className="text-[8px] font-bold uppercase tracking-wider text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

// Pill moved to top of file
