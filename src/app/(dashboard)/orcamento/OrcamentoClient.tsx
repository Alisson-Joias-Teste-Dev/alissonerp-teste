"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  CircleDot, ChevronDown, Gem, Type, Ruler, Minus, Plus, Save,
  Printer, Download, Loader2, Settings2, RotateCcw, User,
} from "lucide-react";
import * as THREE from "three";
import { ProfileType } from "./types";
import type {
  RingParams, RingSize, PricingCategory, GrooveRule, PricingResult, ConfigOrcamento,
  StoneEntry, StonePrice, StoneType, StoneCut,
} from "./types";
import {
  RING_SIZES, DEFAULT_PARAMS, PROFILE_OPTIONS, METAL_COLORS,
  DEFAULT_PRICING_CATEGORIES, DEFAULT_GROOVE_RULES, DEFAULT_STONE_PRICES,
  STONE_TYPES, STONE_CUTS, STONE_SIZES_MM,
  findGrooveRule, computeWeight, computeStoneCapacity, computePricing,
  computeCalculatedCategories, computeStoneEntryPrice, computeStonesTotalRS,
} from "./constants";

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
}

type OrcamentoTipo = "alianca" | "peca" | null;
type AllianceMode = "unidade" | "par";

// ── Pill helper ──────────────────────────────────────────────────────────────
function Pill({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
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
}: Props) {
  const [orcamentoTipo, setOrcamentoTipo] = useState<OrcamentoTipo>(null);

  // Pedras (compartilhado aliança + peça)
  const [stoneEntries, setStoneEntries] = useState<StoneEntry[]>([]);
  const stonePrices = config?.stone_prices?.length ? config.stone_prices : DEFAULT_STONE_PRICES;
  const [stoneMarkupLocal, setStoneMarkupLocal] = useState(config?.stone_markup ?? 2.5);
  const stoneMarkup = stoneMarkupLocal;
  const stoneTotalRS = useMemo(() => computeStonesTotalRS(stoneEntries), [stoneEntries]);

  let nextStoneId = useRef(1);
  const addStone = () => {
    const entry: StoneEntry = {
      id: nextStoneId.current++, tipo: "diamante", corte: "brilhante",
      tamanho_mm: 2.0, qtd: 1, ct_unitario: 0, ct_total: 0, pt_total: 0,
      preco_unitario_rs: 0, preco_total_rs: 0,
    };
    const calc = computeStoneEntryPrice(entry, stonePrices, stoneMarkup, cotacaoDolar);
    setStoneEntries((prev) => [...prev, { ...entry, ...calc }]);
  };
  const removeStone = (id: number) => setStoneEntries((prev) => prev.filter((e) => e.id !== id));
  const updateStone = (id: number, field: string, value: unknown) => {
    setStoneEntries((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      const updated = { ...e, [field]: value };
      const calc = computeStoneEntryPrice(updated, stonePrices, stoneMarkup, cotacaoDolar);
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

  const [profile, setProfile] = useState<ProfileType>((config?.profile as ProfileType) ?? ProfileType.Anatomica);
  const [ringSize, setRingSize] = useState<RingSize>(RING_SIZES[14]);
  const [params, setParams] = useState<RingParams>({
    ...DEFAULT_PARAMS, goldPrice: cotacaoOuro,
    startMkp: config?.start_mkp ?? 3.5, discountPercent: config?.discount_percent ?? 0,
  });
  const [currentMesh, setCurrentMesh] = useState<THREE.Mesh | null>(null);

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

  const [clientName, setClientName] = useState("");
  const [clienteId, setClienteId] = useState<number | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [clienteResults, setClienteResults] = useState<any[]>([]);
  const [showClienteDropdown, setShowClienteDropdown] = useState(false);
  const [buscaCpf, setBuscaCpf] = useState("");
  const [showCpfSearch, setShowCpfSearch] = useState(false);
  const [showCadastro, setShowCadastro] = useState(false);
  const [cadastroNome, setCadastroNome] = useState("");
  const [cadastroCpf, setCadastroCpf] = useState("");
  const [cadastroTel, setCadastroTel] = useState("");
  const [cadastroEmail, setCadastroEmail] = useState("");
  const clienteDropdownRef = useRef<HTMLDivElement>(null);

  const buscarClientes = useCallback(async (termo: string) => {
    if (termo.length < 2) { setClienteResults([]); return; }
    const res = await fetch(`/api/ordens/contatos?busca=${encodeURIComponent(termo)}`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => []) : [];
    setClienteResults(Array.isArray(data) ? data : []);
    setShowClienteDropdown(true);
  }, []);

  const buscarPorCpf = useCallback(async (cpf: string) => {
    if (cpf.replace(/\D/g, "").length < 6) return;
    const res = await fetch(`/api/ordens/contatos?cpf=${encodeURIComponent(cpf)}`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => []) : [];
    if (Array.isArray(data) && data.length > 0) {
      selecionarCliente(data[0]);
      setShowCpfSearch(false);
    } else {
      setShowCadastro(true);
      setCadastroCpf(cpf.replace(/\D/g, ""));
      setShowCpfSearch(false);
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function selecionarCliente(c: any) {
    setClienteId(c.id_contato);
    setClientName(c.nome);
    setShowClienteDropdown(false);
    setClienteResults([]);
  }

  async function cadastrarCliente() {
    if (!cadastroNome.trim()) return;
    const res = await fetch("/api/contatos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: cadastroNome.trim(), cpf_cnpj: cadastroCpf, telefone: cadastroTel, email: cadastroEmail }),
    });
    if (res.ok) {
      const contato = await res.json();
      selecionarCliente(contato);
      setShowCadastro(false);
      setCadastroNome(""); setCadastroCpf(""); setCadastroTel(""); setCadastroEmail("");
    }
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

  const updateParam = <K extends keyof RingParams>(key: K, value: RingParams[K]) => {
    const setter = activeRing === 1 ? setParams : setParams2;
    setter((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  };

  useEffect(() => {
    const rule = findGrooveRule(params.width, grooveRules);
    setParams((prev) => ({ ...prev, grooveWidth: rule.grooveWidth, grooveDepth: rule.grooveDepth, grooveOffset: rule.grooveOffset }));
  }, [params.width, grooveRules]);

  useEffect(() => {
    if (params.hasStones) {
      const baseCalc = params.stoneSize * 0.72;
      const targetValue = params.stoneDrill ? baseCalc : baseCalc + 0.2;
      const rounded = Math.round(targetValue * 10) / 10;
      if (profile === ProfileType.QuadradoCanal) {
        if (params.canalBorderHeight !== rounded) updateParam("canalBorderHeight", rounded);
      } else if (params.height !== rounded) updateParam("height", rounded);
    }
  }, [params.hasStones, params.stoneSize, params.stoneDrill, profile]);

  const stoneCapacity = useMemo(
    () => params.hasStones ? computeStoneCapacity(params.diameter, params.height, params.canalBorderHeight, params.stoneSize, params.stoneRows, profile) : 0,
    [params.diameter, params.height, params.canalBorderHeight, params.stoneSize, params.stoneRows, params.hasStones, profile]
  );
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

  // Totais do par
  const pricingTotal = allianceMode === "par"
    ? { weight: pricing.weight + pricing2.weight, price: pricing.discountPrice + pricing2.discountPrice + stoneTotalRS + stoneTotalRS2 }
    : { weight: pricing.weight, price: pricing.discountPrice + stoneTotalRS };

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
    setProfile((config?.profile as ProfileType) ?? ProfileType.Anatomica);
    setRingSize(RING_SIZES[14]);
    setParams({ ...DEFAULT_PARAMS, goldPrice: cotacaoOuro, startMkp: config?.start_mkp ?? 3.5, discountPercent: config?.discount_percent ?? 0 });
    setProfile2((config?.profile as ProfileType) ?? ProfileType.Anatomica);
    setRingSize2(RING_SIZES[14]);
    setParams2({ ...DEFAULT_PARAMS, goldPrice: cotacaoOuro, startMkp: config?.start_mkp ?? 3.5, discountPercent: config?.discount_percent ?? 0 });
    setStoneEntries([]); setStoneEntries2([]);
    setActiveRing(1);
    setPecaPeso(5.0);
  };

  function buildFicha(p: RingParams, pf: ProfileType, rs: RingSize, w: number, sc: number) {
    return {
      modelo: PROFILE_OPTIONS.find((o) => o.id === pf)?.label ?? pf,
      aro_numeracao: `Aro ${rs.size}`, largura: p.width, espessura: p.height,
      peso_estimado: w, perfil: pf, diametro: p.diameter,
      densidade_ouro: p.goldDensity, cor_metal: METAL_COLORS.find(m => m.value === p.metalColor)?.label ?? p.metalColor,
      tipo_fonte: p.textEnabled && p.textContent.trim() ? (p.textFontType === 2 ? "Cursiva" : "Forma") : null,
      texto: p.textEnabled && p.textContent.trim() ? p.textContent.trim() : null,
      qtd_pedras: p.hasStones ? sc : null, tamanho_pedra: p.hasStones ? p.stoneSize : null,
      tipo_aplicacao_pedra: p.hasStones ? (p.stoneFull ? "Volta Completa" : p.stoneHalfMoon ? "Meia Alianca" : "Pontual") : null,
      profundidade_concava: p.concaveDepth, friso_lado: p.grooveSide,
      friso_largura: p.grooveWidth, friso_profundidade: p.grooveDepth, friso_offset: p.grooveOffset,
      canal_largura: p.canalWidth, canal_borda_altura: p.canalBorderHeight,
      chanfro_tamanho: p.chamferSize, dome_porcentagem: p.domePercentage,
      pedra_fileiras: p.stoneRows, pedra_drill: p.stoneDrill,
      pedra_meia_lua: p.stoneHalfMoon, pedra_volta_completa: p.stoneFull,
    };
  }

  const handleSaveOrder = async () => {
    if (!clientName.trim() && !clienteId) { setSaveMsg({ text: "Selecione ou cadastre um cliente", type: "error" }); return; }
    setIsSaving(true); setSaveMsg(null);
    try {
      const foto3d = capture3DScreenshot();
      const isPar = allianceMode === "par";
      const nomeModelo = isPar
        ? `Par: ${PROFILE_OPTIONS.find((p) => p.id === profile)?.label ?? profile} + ${PROFILE_OPTIONS.find((p) => p.id === profile2)?.label ?? profile2}`
        : PROFILE_OPTIONS.find((p) => p.id === profile)?.label ?? profile;

      const body: Record<string, unknown> = {
        nome_cliente: clientName.trim(),
        cliente_id: clienteId,
        nome_modelo: nomeModelo,
        peso: pricingTotal.weight,
        valor: pricingTotal.price,
        markup: pricing.mkp,
        desconto_pct: params.discountPercent,
        cotacao_ouro: params.goldPrice,
        tipo: "alianca",
        quantidade: isPar ? 2 : 1,
        foto_3d_base64: foto3d,
        ficha: buildFicha(params, profile, ringSize, pricing.weight, derivedStoneCount),
      };
      if (isPar) {
        const sc2 = computeStoneCapacity(params2.diameter, params2.height, params2.canalBorderHeight, params2.stoneSize, params2.stoneRows, profile2);
        body.ficha2 = buildFicha(params2, profile2, ringSize2, pricing2.weight, sc2);
      }

      const url = editingOrcId ? `/api/orcamento/${editingOrcId}` : "/api/orcamento";
      const method = editingOrcId ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      setSaveMsg({ text: editingOrcId ? "Orçamento atualizado!" : "Orçamento salvo!", type: "success" });
      setEditingOrcId(null); setClientName(""); setClienteId(null);
      fetchOrcamentos();
      setOrcamentoTipo(null);
    } catch { setSaveMsg({ text: "Erro ao salvar", type: "error" }); }
    finally { setIsSaving(false); }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true); setConfigMsg(null);
    try {
      const res = await fetch("/api/orcamento/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_mkp: params.startMkp, discount_percent: params.discountPercent, profile, pricing_categories: pricingCategories, groove_rules: grooveRules, stone_markup: stoneMarkupLocal }),
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
                            if (orc.perfil) setProfile(orc.perfil as ProfileType);
                            // Aro
                            const aroNum = orc.aro_numeracao ? Number(String(orc.aro_numeracao).replace("Aro ", "")) : null;
                            const aroSize = aroNum ? RING_SIZES.find(r => r.size === aroNum) : null;
                            if (aroSize) setRingSize(aroSize);
                            // Cor do metal — banco salva label ("Ouro Amarelo"), converter para hex
                            const metalMatch = METAL_COLORS.find(m => m.label === orc.cor_metal || m.value === orc.cor_metal);
                            const metalHex = metalMatch?.value ?? "#FFD700";
                            const metalDensity = metalMatch?.density ?? 14.69;
                            // Setar todos os params de uma vez
                            setParams(p => ({
                              ...p,
                              diameter: aroSize?.diameter ?? p.diameter,
                              width: orc.largura ? Number(orc.largura) : p.width,
                              height: orc.espessura ? Number(orc.espessura) : p.height,
                              metalColor: metalHex,
                              goldDensity: metalDensity,
                              concaveDepth: orc.profundidade_concava ? Number(orc.profundidade_concava) : p.concaveDepth,
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
                          <span className="text-[10px] text-blue-600 font-semibold">
                            Venda #{o.venda_gerada_id}
                            {o.ordem_gerada_id && <span className="text-green-600 ml-1">· Ordem #{o.ordem_gerada_id}</span>}
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
        {showCpfSearch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCpfSearch(false)}>
            <div className="bg-white rounded-2xl p-6 w-80 space-y-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-bold" style={{ color: C.esmeralda }}>Buscar por CPF</h3>
              <input type="text" value={buscaCpf} onChange={(e) => setBuscaCpf(e.target.value)}
                placeholder="Digite o CPF..." className="w-full border rounded-lg px-3 py-2 text-sm outline-none" style={{ borderColor: C.cremeBorder }} />
              <div className="flex gap-2">
                <button onClick={() => buscarPorCpf(buscaCpf)}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: C.esmeralda }}>Buscar</button>
                <button onClick={() => setShowCpfSearch(false)} className="px-4 py-2 text-sm text-gray-500">Cancelar</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Cadastro novo cliente */}
        {showCadastro && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowCadastro(false)}>
            <div className="bg-white rounded-2xl p-6 w-96 space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-bold" style={{ color: C.esmeralda }}>Cadastrar Novo Cliente</h3>
              <input type="text" value={cadastroNome} onChange={(e) => setCadastroNome(e.target.value)}
                placeholder="Nome completo *" className="w-full border rounded-lg px-3 py-2 text-sm outline-none" style={{ borderColor: C.cremeBorder }} />
              <input type="text" value={cadastroCpf} onChange={(e) => setCadastroCpf(e.target.value)}
                placeholder="CPF" className="w-full border rounded-lg px-3 py-2 text-sm outline-none font-mono" style={{ borderColor: C.cremeBorder }} />
              <input type="text" value={cadastroTel} onChange={(e) => setCadastroTel(e.target.value)}
                placeholder="Telefone" className="w-full border rounded-lg px-3 py-2 text-sm outline-none" style={{ borderColor: C.cremeBorder }} />
              <input type="text" value={cadastroEmail} onChange={(e) => setCadastroEmail(e.target.value)}
                placeholder="Email" className="w-full border rounded-lg px-3 py-2 text-sm outline-none" style={{ borderColor: C.cremeBorder }} />
              <div className="flex gap-2 pt-1">
                <button onClick={cadastrarCliente} disabled={!cadastroNome.trim()}
                  className="flex-1 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ backgroundColor: C.esmeralda }}>Cadastrar</button>
                <button onClick={() => setShowCadastro(false)} className="px-4 py-2 text-sm text-gray-500">Cancelar</button>
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
    const pecaTotal = pecaPricing.discountPrice + stoneTotalRS;
    return (
      <div className="min-h-screen" style={{ backgroundColor: C.cremeBg }}>
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button onClick={() => setOrcamentoTipo(null)} className="text-xs text-gray-400 hover:text-gray-600">← Voltar</button>
            <h1 className="text-lg font-bold" style={{ color: C.esmeralda }}>Peça Personalizada</h1>
            <div className="w-16" />
          </div>

          {/* Cliente autocomplete */}
          <div className="bg-white rounded-xl border p-4 relative" style={{ borderColor: clienteId ? "#059669" : C.cremeBorder }}>
            <div className="flex items-center gap-2">
              <User size={14} className={clienteId ? "text-green-600" : "text-gray-400"} />
              <input type="text" value={clientName}
                onChange={(e) => { setClientName(e.target.value); setClienteId(null); buscarClientes(e.target.value); }}
                onFocus={() => { if (clienteResults.length > 0) setShowClienteDropdown(true); }}
                placeholder="Buscar cliente..." className="flex-1 text-sm outline-none" />
              {clienteId && <span className="text-[9px] text-green-600 font-semibold">Vinculado</span>}
              {!clienteId && clientName.length >= 2 && clienteResults.length === 0 && (
                <button onClick={() => setShowCpfSearch(true)} className="text-[9px] text-blue-600 font-semibold hover:underline">Buscar CPF</button>
              )}
            </div>
            {showClienteDropdown && clienteResults.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-2 bg-white rounded-xl border shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: C.cremeBorder }}>
                {clienteResults.map((c) => (
                  <button key={c.id_contato} onClick={() => selecionarCliente(c)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                    <span className="font-medium">{c.nome}</span>
                    {c.cpf_cnpj && <span className="ml-2 text-[10px] text-gray-400">{c.cpf_cnpj}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

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
          </div>

          {/* Pedras */}
          <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Pedras Preciosas</h3>
              <button onClick={addStone} className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                style={{ backgroundColor: "rgba(212,175,55,0.1)", color: C.gold }}>
                <Plus size={12} className="inline mr-1" />Adicionar
              </button>
            </div>
            {stoneEntries.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Sem pedras — clique em Adicionar</p>
            ) : (
              <div className="space-y-3">
                {stoneEntries.map((se) => (
                  <div key={se.id} className="rounded-lg border p-3 space-y-2" style={{ borderColor: C.cremeBorder }}>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[9px] text-gray-400 block">Tipo</label>
                        <select value={se.tipo} onChange={(e) => updateStone(se.id, "tipo", e.target.value)}
                          className="w-full text-xs border rounded px-2 py-1.5" style={{ borderColor: C.cremeBorder }}>
                          {STONE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-400 block">Corte</label>
                        <select value={se.corte} onChange={(e) => updateStone(se.id, "corte", e.target.value)}
                          className="w-full text-xs border rounded px-2 py-1.5" style={{ borderColor: C.cremeBorder }}>
                          {STONE_CUTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-400 block">Tamanho (mm)</label>
                        <select value={se.tamanho_mm} onChange={(e) => updateStone(se.id, "tamanho_mm", parseFloat(e.target.value))}
                          className="w-full text-xs border rounded px-2 py-1.5 font-mono" style={{ borderColor: C.cremeBorder }}>
                          {STONE_SIZES_MM.map((mm) => <option key={mm} value={mm}>{mm}mm</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-400 block">Quantidade</label>
                        <input type="number" min={1} value={se.qtd}
                          onChange={(e) => updateStone(se.id, "qtd", parseInt(e.target.value) || 1)}
                          className="w-full text-xs border rounded px-2 py-1.5 font-mono" style={{ borderColor: C.cremeBorder }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <div className="flex gap-3 text-gray-500">
                        <span>{se.ct_unitario.toFixed(3)}ct/un</span>
                        <span>{se.ct_total.toFixed(3)}ct total</span>
                        <span>{se.pt_total.toFixed(4)}g</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-gray-500">R$ {se.preco_unitario_rs.toFixed(2)}/un</span>
                        <span className="font-bold" style={{ color: C.gold }}>R$ {se.preco_total_rs.toFixed(2)}</span>
                        <button onClick={() => removeStone(se.id)} className="text-red-400 hover:text-red-600">
                          <Minus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Resultado */}
          <div className="bg-white rounded-xl border p-5" style={{ borderColor: C.cremeBorder }}>
            <div className="flex items-center justify-between gap-4">
              <Pill label="Peso" value={`${pecaPeso.toFixed(1)}g`} />
              <Pill label="Cat." value={pecaPricing.category} />
              <Pill label="Mkp" value={`${pecaPricing.mkp.toFixed(2)}x`} />
              <Pill label="Ouro" value={`R$${pecaPricing.discountPrice.toFixed(0)}`} />
              {stoneTotalRS > 0 && <Pill label="Pedras" value={`R$${stoneTotalRS.toFixed(0)}`} />}
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-wider" style={{ color: C.gold }}>Preco Final</p>
                <p className="text-2xl font-black" style={{ color: C.esmeralda }}>
                  R$ {pecaTotal.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
                </p>
              </div>
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
                  peso: pecaPeso, valor: pecaTotal, markup: pecaPricing.mkp,
                  desconto_pct: params.discountPercent, cotacao_ouro: cotacaoOuro,
                  cotacao_dolar: cotacaoDolar, valor_ouro: pecaPricing.discountPrice,
                  valor_pedras: stoneTotalRS,
                  ficha: { peso_estimado: pecaPeso, cor_metal: pecaMetalColor, densidade_ouro: pecaGoldDensity, pedras_detalhadas: stoneEntries },
                };
                const res = await fetch("/api/orcamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                if (!res.ok) throw new Error();
                setSaveMsg({ text: "Orçamento salvo!", type: "success" }); setClientName(""); setStoneEntries([]);
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
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Markup pedras (multiplicador)</label>
              <input type="number" min={1} step={0.1} value={stoneMarkup}
                onChange={e => {
                  const v = parseFloat(e.target.value) || 1;
                  // Atualizar stone_markup no config local (será salvo junto)
                  setStoneMarkupLocal(v);
                }}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none" style={{ borderColor: C.cremeBorder }} />
              <p className="text-[10px] text-gray-400 mt-1">Ex: 2.5 = custo pedra × 2.5</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Desconto padrão (%)</label>
              <input type="number" min={0} max={50} step={1} value={params.discountPercent}
                onChange={e => setParams(p => ({ ...p, discountPercent: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none" style={{ borderColor: C.cremeBorder }} />
              <p className="text-[10px] text-gray-400 mt-1">Desconto padrão aplicado no orçamento</p>
            </div>
          </div>
        </div>
        {/* Faixas */}
        <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-bold text-gray-800">Faixas de preco</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b" style={{ borderColor: C.cremeBorder }}>
              <th className="text-left py-2 text-xs text-gray-500">Nome</th>
              <th className="text-left py-2 text-xs text-gray-500">Peso max</th>
              <th className="text-left py-2 text-xs text-gray-500">Variacao</th>
              <th className="w-8"></th>
            </tr></thead>
            <tbody>{pricingCategories.map((cat, i) => (
              <tr key={cat.id} className="border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                <td className="py-2 pr-2"><input type="text" value={cat.name} onChange={(e) => { const u = [...pricingCategories]; u[i] = { ...u[i], name: e.target.value }; setPricingCategories(u); }} className="w-full px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                <td className="py-2 pr-2"><input type="number" value={cat.maxWeight} step={0.5} onChange={(e) => { const u = [...pricingCategories]; u[i] = { ...u[i], maxWeight: parseFloat(e.target.value) || 0 }; setPricingCategories(u); }} className="w-24 px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                <td className="py-2 pr-2"><input type="number" value={cat.variation} step={0.1} onChange={(e) => { const u = [...pricingCategories]; u[i] = { ...u[i], variation: parseFloat(e.target.value) || 0 }; setPricingCategories(u); }} className="w-20 px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                <td><button onClick={() => setPricingCategories(pricingCategories.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-xs">X</button></td>
              </tr>
            ))}</tbody>
          </table>
          <button onClick={() => setPricingCategories([...pricingCategories, { id: Date.now(), name: "Nova", maxWeight: 10, variation: 0.5, color: "text-slate-600" }])} className="text-xs font-semibold px-3 py-1.5 rounded-lg border" style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>+ Faixa</button>
        </div>
        {/* Regras friso */}
        <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-bold text-gray-800">Regras de friso</h3>
          <table className="w-full text-sm">
            <thead><tr className="border-b" style={{ borderColor: C.cremeBorder }}>
              <th className="text-left py-2 text-xs text-gray-500">Larg. anel</th>
              <th className="text-left py-2 text-xs text-gray-500">Larg. friso</th>
              <th className="text-left py-2 text-xs text-gray-500">Prof.</th>
              <th className="text-left py-2 text-xs text-gray-500">Offset</th>
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
        <div className="flex items-center gap-3">
          <button onClick={handleSaveConfig} disabled={isSavingConfig} className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-lg text-white disabled:opacity-50" style={{ background: C.esmeralda }}>
            {isSavingConfig ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
          </button>
          <button onClick={() => { setPricingCategories(DEFAULT_PRICING_CATEGORIES); setGrooveRules(DEFAULT_GROOVE_RULES); }} className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border" style={{ borderColor: C.cremeBorder, color: "#6b7280" }}>
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
            {!clienteId && clientName.length >= 2 && clienteResults.length === 0 && (
              <button onClick={() => setShowCpfSearch(true)} className="text-[9px] text-blue-600 font-semibold shrink-0 hover:underline">CPF?</button>
            )}
          </div>
          {showClienteDropdown && clienteResults.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white rounded-xl border shadow-lg max-h-48 overflow-y-auto" style={{ borderColor: C.cremeBorder }}>
              {clienteResults.map((c) => (
                <button key={c.id_contato} onClick={() => selecionarCliente(c)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                  <span className="font-medium">{c.nome}</span>
                  {c.cpf_cnpj && <span className="ml-2 text-[10px] text-gray-400">{c.cpf_cnpj}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Botoes */}
        <div className="flex items-center gap-1.5">
          <button onClick={handleSaveOrder} disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold rounded-lg text-white disabled:opacity-50 transition-colors"
            style={{ backgroundColor: C.esmeralda }}>
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
        <div style={{ width: "320px", minWidth: "320px", overflowY: "auto", scrollbarWidth: "thin" }} className="space-y-2 pr-1">

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

          {/* Perfil */}
          <Card title="Perfil">
            <div className="grid grid-cols-3 gap-1.5">
              {PROFILE_OPTIONS.map((p) => (
                <button key={p.id} onClick={() => (activeRing === 1 ? setProfile : setProfile2)(p.id)}
                  className="py-2 text-[10px] font-semibold rounded-lg border transition-all text-center"
                  style={(activeRing === 1 ? profile : profile2) === p.id
                    ? { backgroundColor: C.esmeralda, color: "#fff", borderColor: C.esmeralda }
                    : { backgroundColor: "#fff", color: "#6b7280", borderColor: C.cremeBorder }
                  }>{p.label}</button>
              ))}
            </div>
          </Card>

          {/* Aro + Dimensoes */}
          <Card title="Medidas">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-gray-500 w-[90px] shrink-0">Aro</span>
                <div className="relative flex-1">
                  <select value={(activeRing === 1 ? ringSize : ringSize2).size}
                    onChange={(e) => { const s = RING_SIZES.find((r) => r.size === Number(e.target.value)); if (s) (activeRing === 1 ? handleSizeChange : handleSizeChange2)(s); }}
                    className="w-full appearance-none pl-3 pr-7 py-1.5 text-[11px] rounded-lg border bg-white text-gray-700 outline-none"
                    style={{ borderColor: C.cremeBorder }}>
                    {RING_SIZES.map((s) => <option key={s.size} value={s.size}>Aro {s.size} — {s.diameter.toFixed(2)}mm</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <Slider label="Largura" value={activeParams.width} min={1} max={15} step={0.5} unit="mm" onChange={(v) => updateParam("width", v)} />
              <Slider label="Espessura" value={activeParams.height} min={0.5} max={4} step={0.1} unit="mm" onChange={(v) => updateParam("height", v)} />
              {activeProfile === ProfileType.Concava && <Slider label="Prof. concava" value={activeParams.concaveDepth} min={0.1} max={1.5} step={0.1} unit="mm" onChange={(v) => updateParam("concaveDepth", v)} />}
              {(profile === ProfileType.Boleada || profile === ProfileType.BoleadaDouble || profile === ProfileType.Anatomica) && <Slider label="Curvatura" value={activeParams.domePercentage} min={0} max={100} step={5} unit="%" onChange={(v) => updateParam("domePercentage", v)} />}
              {activeProfile === ProfileType.Chanfrada && <Slider label="Chanfro" value={activeParams.chamferSize} min={0.1} max={2} step={0.1} unit="mm" onChange={(v) => updateParam("chamferSize", v)} />}
              {activeProfile === ProfileType.QuadradoCanal && <>
                <Slider label="Larg. canal" value={activeParams.canalWidth} min={1} max={10} step={0.5} unit="mm" onChange={(v) => updateParam("canalWidth", v)} />
                <Slider label="Alt. borda" value={activeParams.canalBorderHeight} min={0.3} max={3} step={0.1} unit="mm" onChange={(v) => updateParam("canalBorderHeight", v)} />
              </>}
            </div>
          </Card>

          {/* Metal */}
          <Card title="Metal">
            <div className="flex gap-1.5">
              {METAL_COLORS.map((mc) => (
                <button key={mc.value} onClick={() => { updateParam("metalColor", mc.value); updateParam("goldDensity", mc.density); }}
                  className="flex-1 py-2 text-[10px] font-semibold rounded-lg border transition-all text-center"
                  style={activeParams.metalColor === mc.value
                    ? { backgroundColor: mc.value, color: mc.value === "#E8E8E8" ? "#333" : "#fff", borderColor: C.esmeralda, boxShadow: `0 0 0 2px ${C.esmeralda}` }
                    : { backgroundColor: "#fff", color: "#6b7280", borderColor: C.cremeBorder }
                  }>{mc.label}</button>
              ))}
            </div>
          </Card>

          {/* Pedras */}
          <Card title="Pedras">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={activeParams.hasStones} onChange={(e) => updateParam("hasStones", e.target.checked)} style={{ accentColor: C.esmeralda }} className="rounded" />
              <span className="text-[11px] text-gray-600">Incluir pedras</span>
            </label>
            {activeParams.hasStones && (
              <div className="space-y-2 mt-2">
                <Slider label="Tamanho" value={activeParams.stoneSize} min={0.8} max={3} step={0.1} unit="mm" onChange={(v) => updateParam("stoneSize", v)} />
                <div className="flex gap-1.5">
                  {(["Pontual", "Meia Alianca", "Volta Completa"] as const).map((tipo, i) => {
                    const active = i === 2 ? activeParams.stoneFull : i === 1 ? activeParams.stoneHalfMoon : !activeParams.stoneFull && !activeParams.stoneHalfMoon;
                    return (
                      <button key={tipo} onClick={() => {
                        if (i === 2) { updateParam("stoneFull", true); updateParam("stoneHalfMoon", false); }
                        else if (i === 1) { updateParam("stoneFull", false); updateParam("stoneHalfMoon", true); }
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
                  <span className="text-[10px] text-gray-500">Cravacao por broca</span>
                </label>
                <p className="text-[10px] text-gray-400">{derivedStoneCount} pedra(s) de {activeParams.stoneSize}mm</p>
              </div>
            )}
          </Card>

          {/* Gravação */}
          <Card title="Gravacao">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={activeParams.textEnabled} onChange={(e) => updateParam("textEnabled", e.target.checked)} style={{ accentColor: C.esmeralda }} className="rounded" />
              <span className="text-[11px] text-gray-600">Gravar texto</span>
            </label>
            {activeParams.textEnabled && (
              <div className="space-y-2 mt-2">
                <input type="text" maxLength={30} value={activeParams.textContent} onChange={(e) => updateParam("textContent", e.target.value)} placeholder="Texto a gravar..."
                  className="w-full px-3 py-1.5 text-[11px] rounded-lg border outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
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
              </div>
            )}
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
                  <Pill label="Peso 1" value={`${pricing.weight.toFixed(1)}g`} />
                  <Pill label="Peso 2" value={`${pricing2.weight.toFixed(1)}g`} />
                  <Pill label="Total" value={`${pricingTotal.weight.toFixed(1)}g`} />
                </>
              ) : (
                <Pill label="Peso" value={`${pricing.weight.toFixed(1)}g`} />
              )}
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
                  R$ {pricingTotal.price.toLocaleString("pt-BR")}
                </p>
                {allianceMode === "par" && (
                  <p className="text-[9px] text-gray-400">
                    A1: R$ {pricing.discountPrice.toLocaleString("pt-BR")} | A2: R$ {pricing2.discountPrice.toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Card wrapper ─────────────────────────────────────────────────────────────
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-4 space-y-3" style={{ borderColor: C.cremeBorder }}>
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</h3>
      {children}
    </div>
  );
}

// Pill moved to top of file
