"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useErrorStore } from "@/stores/errorStore";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  CircleDot, ChevronDown, Gem, Type, Ruler, Minus, Plus, Save,
  Printer, Download, Loader2, Settings2, RotateCcw, User, X, Check,
  FileText,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  initialOrcamento?: Record<string, any> | null;
  readOnly?: boolean;
  onShare?: () => void;
  onSaved?: () => void;
  extraActions?: React.ReactNode;
}

type OrcamentoTipo = "alianca" | "peca" | null;
type AllianceMode = "unidade" | "par";

// ── Pill helper ──────────────────────────────────────────────────────────────
function Pill({ label, value, sublabel, onDoubleClick, title }: {
  label: string;
  value: string;
  sublabel?: string;
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
      {sublabel && <p className="text-[9px] mt-0.5" style={{ color: "#6B7280" }}>{sublabel}</p>}
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
  initialOrcamento, readOnly, onShare, onSaved, extraActions,
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
    const res = await fetch("/api/orcamento?limit=100").catch((e) => { useErrorStore.getState().push(e instanceof Error ? e.message : "Erro ao carregar orçamentos", { level: "warning" }); return null; });
    const data = res?.ok ? await res.json().catch(() => ({})) : {};
    setOrcamentos(data.orcamentos ?? []);
    setLoadingOrc(false);
  }, []);
  useEffect(() => { fetchOrcamentos(); }, [fetchOrcamentos]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function aplicarOrcamento(orc: Record<string, any>, orcId: number) {
    setEditingOrcId(orcId);
    setClientName(orc.cliente_nome_contato || orc.nome_cliente || "");
    setClienteId(orc.cliente_id || null);
    if (orc.tipo === "alianca") {
      setOrcamentoTipo("alianca");
      setAllianceMode(orc.quantidade === 2 ? "par" : "unidade");
      // Campos de design ficam na ficha técnica, não no orçamento em si
      const ft = (orc.ficha ?? orc) as Record<string, any>;
      const perfil = ft.perfil as string | null;
      if (perfil === "FrisoUnico" || perfil === "FrisoLateral") setProfile(ProfileType.Simples);
      else if (perfil) setProfile(perfil as ProfileType);
      const aroNum = ft.aro_numeracao ? Number(String(ft.aro_numeracao).replace("Aro ", "")) : null;
      const aroSize = aroNum ? RING_SIZES.find(r => r.size === aroNum) : null;
      if (aroSize) setRingSize(aroSize);
      const metalMatch = METAL_COLORS.find(m => m.label === ft.cor_metal || m.value === ft.cor_metal);
      const metalHex = metalMatch?.value ?? "#FFD700";
      const metalDensity = metalMatch?.density ?? 14.69;
      const hasGrooveLoaded = perfil === "FrisoUnico" || perfil === "FrisoLateral" || !!ft.has_friso;
      const grooveKindLoaded = (ft.friso_kind || "friso") as "friso" | "risco";
      const grooveTypeLoaded = perfil === "FrisoLateral" ? "duplo" as const
        : perfil === "FrisoUnico" ? "lateral" as const
        : (ft.friso_tipo || "lateral") as "lateral" | "centro" | "duplo";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const applyRingParams = (p: any, src: Record<string, any>) => ({
        ...p,
        diameter: aroSize?.diameter ?? p.diameter,
        width: src.largura ? Number(src.largura) : p.width,
        height: src.espessura ? Number(src.espessura) : p.height,
        metalColor: metalHex, goldDensity: metalDensity,
        concaveDepth: src.profundidade_concava ? Number(src.profundidade_concava) : p.concaveDepth,
        hasGroove: hasGrooveLoaded, grooveKind: grooveKindLoaded, grooveType: grooveTypeLoaded,
        grooveWidth: src.friso_largura ? Number(src.friso_largura) : p.grooveWidth,
        grooveDepth: src.friso_profundidade ? Number(src.friso_profundidade) : p.grooveDepth,
        grooveOffset: src.friso_offset ? Number(src.friso_offset) : p.grooveOffset,
        canalWidth: src.canal_largura ? Number(src.canal_largura) : p.canalWidth,
        canalBorderHeight: src.canal_borda_altura ? Number(src.canal_borda_altura) : p.canalBorderHeight,
        chamferSize: src.chanfro_tamanho ? Number(src.chanfro_tamanho) : p.chamferSize,
        domePercentage: src.dome_porcentagem != null ? Number(src.dome_porcentagem) : p.domePercentage,
        hasStones: !!src.qtd_pedras,
        stoneSize: src.tamanho_pedra ? Number(src.tamanho_pedra) : p.stoneSize,
        stoneCount: src.qtd_pedras ? Number(src.qtd_pedras) : p.stoneCount,
        stoneDrill: !!src.pedra_drill, stoneHalfMoon: !!src.pedra_meia_lua, stoneFull: !!src.pedra_volta_completa,
        stoneType: src.tipo_pedra ?? p.stoneType,
        stoneRows: src.pedra_fileiras ? Number(src.pedra_fileiras) : p.stoneRows,
        textEnabled: !!src.texto, textContent: src.texto || "",
        textFontType: src.tipo_fonte === "Cursiva" ? 2 : 1,
      });
      setParams(p => applyRingParams(p, ft));
      if (orc.quantidade === 2 && orc.ficha2) {
        const ft2 = orc.ficha2 as Record<string, any>;
        const perfil2 = ft2.perfil as string | null;
        if (perfil2 === "FrisoUnico" || perfil2 === "FrisoLateral") setProfile2(ProfileType.Simples);
        else if (perfil2) setProfile2(perfil2 as ProfileType);
        const aroNum2 = ft2.aro_numeracao ? Number(String(ft2.aro_numeracao).replace("Aro ", "")) : null;
        const aroSize2 = aroNum2 ? RING_SIZES.find(r => r.size === aroNum2) : null;
        if (aroSize2) setRingSize2(aroSize2);
        const metalMatch2 = METAL_COLORS.find(m => m.label === ft2.cor_metal || m.value === ft2.cor_metal);
        const metalHex2 = metalMatch2?.value ?? "#FFD700";
        const metalDensity2 = metalMatch2?.density ?? 14.69;
        setParams2(p => applyRingParams({ ...p, metalColor: metalHex2, goldDensity: metalDensity2 }, ft2));
      }

      // Restaurar detalhamento de pedras
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toEntries = (pedras: any[]): StoneEntry[] =>
        (pedras ?? []).map((p: any, i: number) => ({
          id: Date.now() + i,
          tipo: p.tipo as StoneType,
          corte: p.corte as StoneCut,
          tamanho_mm: Number(p.tamanho_mm ?? 0),
          qtd: Number(p.qtd ?? 0),
          ct_unitario: Number(p.ct_unitario ?? 0),
          ct_total: Number(p.ct_total ?? 0),
          pt_total: Number(p.pt_total ?? 0),
          preco_unitario_rs: Number(p.preco_unitario_rs ?? 0),
          preco_total_rs: Number(p.preco_total_rs ?? 0),
        }));
      setStoneEntries(toEntries(ft.pedras_detalhadas));
      if (orc.quantidade === 2 && orc.ficha2) setStoneEntries2(toEntries((orc.ficha2 as Record<string, any>).pedras_detalhadas));
    } else {
      setOrcamentoTipo("peca");
      if (orc.peso) setPecaPeso(Number(orc.peso));
    }
    setTab("design");
  }

  // Quando initialOrcamento é passado (rota /orcamento/[id]), carrega direto
  useEffect(() => {
    if (initialOrcamento) aplicarOrcamento(initialOrcamento, initialOrcamento.id as number);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  // Params iniciam com width/height ZERADOS — consultora deve digitar conforme o caso
  // (orçamento novo). Edição de orçamento existente carrega os valores salvos via useEffect.
  const [params, setParams] = useState<RingParams>({
    ...DEFAULT_PARAMS, goldPrice: cotacaoOuro,
    startMkp: config?.start_mkp ?? 3.5, discountPercent: config?.discount_percent ?? 0,
    width: 0, height: 0,
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
    width: 0, height: 0,
  });
  const [currentMesh2, setCurrentMesh2] = useState<THREE.Mesh | null>(null);
  const [stoneEntries2, setStoneEntries2] = useState<StoneEntry[]>([]);

  // Modal de Ficha Técnica
  const [showFichaTecnica, setShowFichaTecnica] = useState(false);

  // Produto-pedra selecionado por anel — preenchido AUTOMATICAMENTE pelo
  // useEffect abaixo a partir de (params.stoneType + params.stoneSize). A
  // consultora só escolhe TIPO e TAMANHO; o sistema busca o produto cadastrado
  // em /produtos (categoria Pedras) cujo nome bate "{tipo} {size}mm".
  const [pedraSelecionada1, setPedraSelecionada1] = useState<PedraProduto | null>(null);
  const [pedraSelecionada2, setPedraSelecionada2] = useState<PedraProduto | null>(null);
  // Status de busca (null = ainda não buscou, "buscando", "ok", "nao_cadastrado")
  type PedraStatus = "ok" | "buscando" | "nao_cadastrado" | "idle";
  const [pedraStatus1, setPedraStatus1] = useState<PedraStatus>("idle");
  const [pedraStatus2, setPedraStatus2] = useState<PedraStatus>("idle");
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

  // (Os 3 useEffects antigos de re-sincronização de stoneEntries quando
  // stoneSize/stoneType/preço mudavam foram removidos — eram redundantes
  // com o auto-sync principal (linhas ~890-923) que já cobre todos esses
  // disparos via `pedraSelecionada` + `derivedStoneCount`. A duplicação
  // causava race condition perdendo `corte` customizado.)

  // Auto-format do textContent ao trocar de perfil (mantido do main).
  // Bordas Elevadas permite espaços/maiúsculas; outros perfis formatam.
  useEffect(() => {
    if (profile !== ProfileType.QuadradoCanal && params.textContent.trim()) {
      const raw = params.textContent.replace(/\s/g, "");
      const formatted = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "";
      if (formatted !== params.textContent) {
        setParams((prev) => ({ ...prev, textContent: formatted }));
      }
    }
  }, [profile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (profile2 !== ProfileType.QuadradoCanal && params2.textContent.trim()) {
      const raw = params2.textContent.replace(/\s/g, "");
      const formatted = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "";
      if (formatted !== params2.textContent) {
        setParams2((prev) => ({ ...prev, textContent: formatted }));
      }
    }
  }, [profile2]); // eslint-disable-line react-hooks/exhaustive-deps

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
  // Markups por pedra por tamanho — carregado da config, usado em makeStoneEntry
  // como fallback quando não tem produto-pedra do catálogo selecionado.
  const [allStoneMarkups] = useState<Record<string, Record<string, number>>>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (config as any)?.stone_markups_table;
    return (raw && typeof raw === "object") ? raw : {};
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
  // ── Promoção do orçamento ──
  // Datas no formato YYYY-MM-DD (input type="date"). Quando hoje ∈ [inicio, fim]
  // E a faixa de preço tem `desconto_promocao > 0`, o R$/g é reduzido.
  const [promocaoInicio, setPromocaoInicio] = useState<string>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (config as any)?.promocao_inicio;
    return raw ? String(raw).slice(0, 10) : "";
  });
  const [promocaoFim, setPromocaoFim] = useState<string>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (config as any)?.promocao_fim;
    return raw ? String(raw).slice(0, 10) : "";
  });
  // Promoção está ATIVA hoje?
  const promocaoAtiva = useMemo(() => {
    if (!promocaoInicio || !promocaoFim) return false;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ini = new Date(promocaoInicio + "T00:00:00");
    const fim = new Date(promocaoFim + "T23:59:59");
    return hoje >= ini && hoje <= fim;
  }, [promocaoInicio, promocaoFim]);
  // Status visual da promo: ativa / programada (futura) / expirada / sem datas
  const promocaoStatus: "ativa" | "programada" | "expirada" | "nenhuma" = useMemo(() => {
    if (!promocaoInicio || !promocaoFim) return "nenhuma";
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const ini = new Date(promocaoInicio + "T00:00:00");
    const fim = new Date(promocaoFim + "T23:59:59");
    if (hoje < ini) return "programada";
    if (hoje > fim) return "expirada";
    return "ativa";
  }, [promocaoInicio, promocaoFim]);
  // Espessura (altura) mínima por modelo de aliança — bloqueia inputs abaixo desse valor.
  // Chaves no JSONB são snake_case; profile (ProfileType) é PascalCase. Mapa abaixo
  // converte entre os dois.
  const PROFILE_TO_KEY: Record<string, string> = {
    Anatomica: "anatomica",
    Boleada: "boleada",
    BoleadaDouble: "boleada_double",
    Chanfrada: "chanfrada",
    Concava: "concava",
    QuadradoCanal: "quadrado_canal",
    Simples: "simples",
  };
  const DEFAULT_ESPESSURA_MIN: Record<string, number> = {
    anatomica: 1.0, boleada: 1.0, boleada_double: 1.0,
    chanfrada: 1.0, concava: 1.0, quadrado_canal: 1.0, simples: 1.0,
  };
  const [espessuraMinimaPorModelo, setEspessuraMinimaPorModelo] = useState<Record<string, number>>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (config as any)?.espessura_minima_por_modelo;
    if (raw && typeof raw === "object") {
      return { ...DEFAULT_ESPESSURA_MIN, ...raw } as Record<string, number>;
    }
    return DEFAULT_ESPESSURA_MIN;
  });
  // Nomes (labels) customizáveis por modelo. Default = labels do PROFILE_OPTIONS.
  // Override: se admin renomeou "Anatomica" → "Anatômica Premium", os botões
  // de seleção de perfil no editor mostram o nome customizado.
  const DEFAULT_NOMES_MODELOS: Record<string, string> = {
    anatomica: "Anatomica",
    boleada: "Boleada",
    boleada_double: "Boleada DF",
    chanfrada: "Chanfrada",
    concava: "Concava",
    quadrado_canal: "Bordas Elevadas",
    simples: "Reta",
  };
  const [nomesModelos, setNomesModelos] = useState<Record<string, string>>(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (config as any)?.nomes_modelos;
    if (raw && typeof raw === "object") {
      return { ...DEFAULT_NOMES_MODELOS, ...raw } as Record<string, string>;
    }
    return DEFAULT_NOMES_MODELOS;
  });
  // Helper: retorna o label customizado de um perfil (ou o default se não tiver)
  const labelDoModelo = (profileTypeValue: string): string => {
    const key = PROFILE_TO_KEY[profileTypeValue] ?? "";
    return nomesModelos[key] ?? PROFILE_OPTIONS.find((p) => p.id === profileTypeValue)?.label ?? profileTypeValue;
  };
  // Estado de salvamento da seção "Espessura mínima por modelo"
  const [savingEspessura, setSavingEspessura] = useState(false);
  const [espessuraMsg, setEspessuraMsg] = useState<string | null>(null);

  async function salvarEspessuraNomes() {
    setSavingEspessura(true); setEspessuraMsg(null);
    try {
      const res = await fetch("/api/orcamento/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          espessura_minima_por_modelo: espessuraMinimaPorModelo,
          nomes_modelos: nomesModelos,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setEspessuraMsg((b as { error?: string }).error ?? `Erro ${res.status}`);
        return;
      }
      setEspessuraMsg("Salvo!");
      setTimeout(() => setEspessuraMsg(null), 2500);
    } catch (e) {
      setEspessuraMsg(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSavingEspessura(false);
    }
  }

  const updateParam = <K extends keyof RingParams>(key: K, value: RingParams[K]) => {
    const setter = activeRing === 1 ? setParams : setParams2;
    setter((prev) => {
      if (prev[key] === value) return prev;
      return { ...prev, [key]: value };
    });
  };

  // ── Inicializa height com a espessura mínima do perfil ATUAL ──
  // Roda 1x ao montar — garante que mesmo sem clicar no botão de perfil, a
  // consultora começa com a espessura mínima configurada já preenchida.
  // O MedidaStepper sincroniza o display ao detectar a mudança em `num`.
  useEffect(() => {
    const espMin1 = espessuraMinimaPorModelo[PROFILE_TO_KEY[profile] ?? ""] ?? 1.0;
    if (params.height < espMin1) {
      setParams((p) => ({ ...p, height: espMin1 }));
    }
    const espMin2 = espessuraMinimaPorModelo[PROFILE_TO_KEY[profile2] ?? ""] ?? 1.0;
    if (params2.height < espMin2) {
      setParams2((p) => ({ ...p, height: espMin2 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [params.width, params.hasGroove, params.grooveKind, grooveRules, riscoWidth, riscoDepth]);  

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

  const derivedStoneCount2 = useMemo(() => {
    if (!params2.hasStones) return 0;
    if (params2.stoneFull) return stoneCapacity2;
    if (params2.stoneHalfMoon) return Math.floor(stoneCapacity2 / 2);
    return params2.stoneCount;
  }, [params2.hasStones, params2.stoneFull, params2.stoneHalfMoon, stoneCapacity2, params2.stoneCount]);

  useEffect(() => {
    if (params.hasStones) {
      if (params.stoneFull && params.stoneCount !== stoneCapacity) updateParam("stoneCount", stoneCapacity);
      else if (params.stoneHalfMoon) {
        const h = Math.floor(stoneCapacity / 2);
        if (params.stoneCount !== h) updateParam("stoneCount", h);
      }
    }
  }, [params.stoneHalfMoon, params.stoneFull, stoneCapacity, params.hasStones]);

  // ── Auto-sincroniza stoneEntries do card "Pedras" ──
  // O usuário define tipo + tamanho + quantidade no card de Pedras, e a gente
  // mantém UMA stoneEntry por anel refletindo isso (com cálculo de preço).
  // Sem precisar de UI separada de "Detalhamento".
  function mapStoneLabelToType(label: string): StoneType {
    const m: Record<string, StoneType> = {
      "Zircônia": "zirconia",
      "Zirconia": "zirconia",
      "Diamante": "diamante",
      "Moissanita": "moissanita",
      "Rubi": "rubi",
      "Esmeralda": "esmeralda",
      "Safira": "safira",
    };
    return m[label] ?? "zirconia";
  }
  // Helper: cria/atualiza UMA stoneEntry com preço vindo do produto-pedra
  // (se selecionado) ou do calc tradicional (fallback).
  function makeStoneEntry(
    id: number, prevCorte: StoneCut | undefined,
    tipo: StoneType, tamanho_mm: number, qtd: number,
    pedraProd: PedraProduto | null,
  ): StoneEntry {
    if (pedraProd) {
      const precoUnit = Number(pedraProd.preco) || 0;
      return {
        id, tipo, corte: prevCorte ?? "brilhante",
        tamanho_mm, qtd,
        preco_unitario_rs: precoUnit,
        preco_total_rs: Math.round(precoUnit * qtd * 100) / 100,
        ct_unitario: 0, ct_total: 0, pt_total: 0,
      };
    }
    const baseEntry: StoneEntry = {
      id, tipo, corte: prevCorte ?? "brilhante",
      tamanho_mm, qtd,
      preco_unitario_rs: 0, preco_total_rs: 0,
      ct_unitario: 0, ct_total: 0, pt_total: 0,
    };
    const calc = computeStoneEntryPrice(baseEntry, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups);
    return { ...baseEntry, ...calc };
  }
  // Anel 1
  useEffect(() => {
    if (!params.hasStones) {
      setStoneEntries((prev) => prev.length > 0 ? [] : prev);
      return;
    }
    const tipo = mapStoneLabelToType(params.stoneType);
    setStoneEntries((prev) => {
      const id = prev[0]?.id ?? nextStoneId.current++;
      const next = makeStoneEntry(id, prev[0]?.corte, tipo, params.stoneSize, derivedStoneCount, pedraSelecionada1);
      if (prev.length === 1 && prev[0].tipo === next.tipo && prev[0].qtd === next.qtd
        && prev[0].tamanho_mm === next.tamanho_mm && prev[0].preco_total_rs === next.preco_total_rs) {
        return prev;
      }
      return [next];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.hasStones, params.stoneType, params.stoneSize, derivedStoneCount, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups, pedraSelecionada1]);
  // Anel 2
  useEffect(() => {
    if (!params2.hasStones) {
      setStoneEntries2((prev) => prev.length > 0 ? [] : prev);
      return;
    }
    const tipo = mapStoneLabelToType(params2.stoneType);
    setStoneEntries2((prev) => {
      const id = prev[0]?.id ?? nextStoneId.current++;
      const next = makeStoneEntry(id, prev[0]?.corte, tipo, params2.stoneSize, derivedStoneCount2, pedraSelecionada2);
      if (prev.length === 1 && prev[0].tipo === next.tipo && prev[0].qtd === next.qtd
        && prev[0].tamanho_mm === next.tamanho_mm && prev[0].preco_total_rs === next.preco_total_rs) {
        return prev;
      }
      return [next];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params2.hasStones, params2.stoneType, params2.stoneSize, derivedStoneCount2, stonePrices, stoneMarkup, cotacaoDolar, allStoneMarkups, pedraSelecionada2]);

  // ── Auto-lookup do produto pedra a partir de (stoneType + stoneSize) ──
  // Estratégia: busca apenas pelo tipo, depois filtra os resultados extraindo
  // o tamanho (X.Xmm) do nome e comparando numericamente. Evita falso match
  // tipo "1.2mm" virar resultado quando você procura "2mm".
  function extrairTamanhoDoNome(nome: string): number | null {
    if (!nome) return null;
    // Match padrões "1.2mm", "1,2mm", "2mm", "2.0 mm"
    const m = nome.match(/([\d]+[.,]?[\d]*)\s*mm/i);
    if (!m) return null;
    const n = parseFloat(m[1].replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  async function buscarPedraNoCatalogo(tipo: string, tamanho: number, signal?: AbortSignal): Promise<PedraProduto | null> {
    if (!tipo) return null;
    try {
      const r = await fetch(`/api/orcamento/produtos-pedras?q=${encodeURIComponent(tipo)}`, { signal });
      if (!r.ok) return null;
      const arr = await r.json() as PedraProduto[];
      if (!Array.isArray(arr) || arr.length === 0) return null;
      // Match numérico exato (tolerância 0.05mm pra cobrir arredondamentos)
      const matched = arr.find((p) => {
        const t = extrairTamanhoDoNome(p.nome ?? "");
        return t !== null && Math.abs(t - tamanho) < 0.05;
      });
      return matched ?? null;
    } catch (e) {
      // AbortError é esperado quando o componente desmonta ou dependências mudam
      if ((e as Error)?.name === "AbortError") return null;
      return null;
    }
  }

  // Anel 1
  useEffect(() => {
    if (!params.hasStones) { setPedraSelecionada1(null); setPedraStatus1("idle"); return; }
    if (!params.stoneType || !params.stoneSize) { setPedraStatus1("idle"); return; }
    // "Outro" não dispara auto-lookup — usuário fica responsável por gerenciar.
    if (params.stoneType === "Outro") { setPedraSelecionada1(null); setPedraStatus1("idle"); return; }
    setPedraStatus1("buscando");
    const ctrl = new AbortController();
    buscarPedraNoCatalogo(params.stoneType, params.stoneSize, ctrl.signal).then((p) => {
      if (ctrl.signal.aborted) return;
      if (p) {
        setPedraSelecionada1(p);
        setPedraStatus1("ok");
      } else {
        setPedraSelecionada1(null);
        setPedraStatus1("nao_cadastrado");
      }
    });
    return () => { ctrl.abort(); };
  }, [params.hasStones, params.stoneType, params.stoneSize]);

  // Anel 2
  useEffect(() => {
    if (!params2.hasStones) { setPedraSelecionada2(null); setPedraStatus2("idle"); return; }
    if (!params2.stoneType || !params2.stoneSize) { setPedraStatus2("idle"); return; }
    if (params2.stoneType === "Outro") { setPedraSelecionada2(null); setPedraStatus2("idle"); return; }
    setPedraStatus2("buscando");
    const ctrl = new AbortController();
    buscarPedraNoCatalogo(params2.stoneType, params2.stoneSize, ctrl.signal).then((p) => {
      if (ctrl.signal.aborted) return;
      if (p) {
        setPedraSelecionada2(p);
        setPedraStatus2("ok");
      } else {
        setPedraSelecionada2(null);
        setPedraStatus2("nao_cadastrado");
      }
    });
    return () => { ctrl.abort(); };
  }, [params2.hasStones, params2.stoneType, params2.stoneSize]);

  const weightEst = useMemo(() => computeWeight(params, profile), [params, profile]);
  // Helper: pega o desconto da promoção da faixa que cobre esse peso (0 se inativa)
  function descPromoParaPeso(weight: number): number {
    if (!promocaoAtiva) return 0;
    const { activeCategory } = computeCalculatedCategories(params.startMkp, pricingCategories, weight);
    return Number(activeCategory?.desconto_promocao ?? 0);
  }
  const pricing: PricingResult = useMemo(
    () => computePricing(weightEst.weight, params.goldPrice, params.startMkp, params.discountPercent, pricingCategories, descPromoParaPeso(weightEst.weight)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weightEst.weight, params.goldPrice, params.startMkp, params.discountPercent, pricingCategories, promocaoAtiva]
  );
  const cameraDistance = useMemo(() => {
    const radius = params.diameter / 2 + params.height + params.width * 0.6;
    return radius * 8;
  }, [params.diameter, params.height, params.width]);
  const { calc: calcCategories } = computeCalculatedCategories(params.startMkp, pricingCategories, weightEst.weight);

  // Pricing aliança 2 (par)
  const weightEst2 = useMemo(() => computeWeight(params2, profile2), [params2, profile2]);
  const pricing2: PricingResult = useMemo(
    () => computePricing(weightEst2.weight, params2.goldPrice, params2.startMkp, params2.discountPercent, pricingCategories, descPromoParaPeso(weightEst2.weight)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weightEst2.weight, params2.goldPrice, params2.startMkp, params2.discountPercent, pricingCategories, promocaoAtiva]
  );
  const cameraDistance2 = useMemo(() => {
    const radius = params2.diameter / 2 + params2.height + params2.width * 0.6;
    return radius * 8;
  }, [params2.diameter, params2.height, params2.width]);

  // Gravação: primeiro nome incluso, adicionais cobram R$ precoGravacao cada.
  // EXCEÇÃO: perfil "Bordas Elevadas" (QuadradoCanal) tem nomes ILIMITADOS
  // sem cobrança adicional — gravacaoCost fica 0 mesmo com vários nomes.
  const gravacaoExtras = params.textEnabled ? textosExtras.filter(t => t.trim()).length : 0;
  const gravacaoCost = profile === ProfileType.QuadradoCanal ? 0 : gravacaoExtras * precoGravacao;
  const gravacaoExtras2 = params2.textEnabled ? textosExtras2.filter(t => t.trim()).length : 0;
  const gravacaoCost2 = allianceMode === "par"
    ? (profile2 === ProfileType.QuadradoCanal ? 0 : gravacaoExtras2 * precoGravacao)
    : 0;

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
      modelo: (() => { const o = PROFILE_OPTIONS.find((o) => o.id === pf); return o?.fichaLabel ?? o?.label ?? pf; })(),
      aro_numeracao: `Aro ${rs.size}`, largura: p.width, espessura: p.height,
      peso_estimado: w, perfil: pf, diametro: p.diameter,
      densidade_ouro: p.goldDensity, cor_metal: METAL_COLORS.find(m => m.value === p.metalColor)?.label ?? p.metalColor,
      tipo_fonte: p.textEnabled && p.textContent.trim() ? (p.textFontType === 2 ? "Cursiva" : "Forma") : null,
      texto: p.textEnabled && p.textContent.trim() ? p.textContent.trim() : null,
      qtd_pedras: p.hasStones ? sc : null, tamanho_pedra: p.hasStones ? p.stoneSize : null,
      tipo_pedra: p.hasStones ? p.stoneType : null,
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
      const savedId = data.orcamento?.id ?? editingOrcId;
      if (onSaved) {
        onSaved();
      } else {
        router.push(savedId ? `/orcamento/detalhe/${savedId}` : `/orcamento`);
      }
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
          espessura_minima_por_modelo: espessuraMinimaPorModelo,
          promocao_inicio: promocaoInicio || null,
          promocao_fim: promocaoFim || null,
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

  // Pricing peça personalizada (também respeita a promoção quando ativa)
  const pecaPricing = useMemo(
    () => computePricing(pecaPeso, cotacaoOuro, params.startMkp, params.discountPercent, pricingCategories, descPromoParaPeso(pecaPeso)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pecaPeso, cotacaoOuro, params.startMkp, params.discountPercent, pricingCategories, promocaoAtiva]
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
                      onClick={() => router.push(`/orcamento/detalhe/${o.id}`)}>
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
      ? calcularPrecoSync(pecaPeso, cotacaoOuro, pecaFactors.mkp, curvaConfig.arredondamento, curvaConfig.goldCostPercentage)
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
                valorOuro = calcularPrecoSync(pecaPeso, cotacaoOuro, factors.mkp, curvaConfig.arredondamento, curvaConfig.goldCostPercentage);
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
            {readOnly ? (
              onShare && (
                <button onClick={onShare} className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: C.esmeralda }}>
                  Compartilhar
                </button>
              )
            ) : (
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
            )}
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

          {/* Bloco de Promoção */}
          <div className="rounded-lg border p-3 space-y-2" style={{
            borderColor: promocaoStatus === "ativa" ? "#10B981" : C.cremeBorder,
            backgroundColor: promocaoStatus === "ativa" ? "#F0FDF4" : "#FAFAF7",
          }}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: C.esmeralda }}>Promoção</span>
                {promocaoStatus === "ativa"     && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#10B981", color: "#fff" }}>🟢 ATIVA</span>}
                {promocaoStatus === "programada" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#0EA5E9", color: "#fff" }}>⏸ PROGRAMADA</span>}
                {promocaoStatus === "expirada"  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#6B7280", color: "#fff" }}>⚫ EXPIRADA</span>}
                {promocaoStatus === "nenhuma"   && <span className="text-[10px] text-gray-400">sem datas</span>}
              </div>
              {(promocaoInicio || promocaoFim) && (
                <button
                  type="button"
                  onClick={() => { setPromocaoInicio(""); setPromocaoFim(""); }}
                  className="text-[10px] text-red-500 hover:text-red-700 font-semibold"
                >
                  Limpar promoção
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">Início</label>
                <input
                  type="date"
                  value={promocaoInicio}
                  onChange={(e) => setPromocaoInicio(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">Fim</label>
                <input
                  type="date"
                  value={promocaoFim}
                  onChange={(e) => setPromocaoFim(e.target.value)}
                  min={promocaoInicio || undefined}
                  className="w-full px-2 py-1.5 text-sm rounded-lg border outline-none"
                  style={{ borderColor: C.cremeBorder }}
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-500">
              Dentro do período, cada faixa aplica seu <strong>Desc. promo (%)</strong> direto no R$/g final.
              Fora do período, preço cheio.
            </p>
          </div>

          <table className="w-full text-sm">
            <thead><tr className="border-b" style={{ borderColor: C.cremeBorder }}>
              <th className="text-left py-2 text-xs text-gray-500">Nome</th>
              <th className="text-left py-2 text-xs text-gray-500">Peso max</th>
              <th className="text-left py-2 text-xs text-gray-500">Variacao</th>
              <th className="text-right py-2 text-xs text-gray-500">Mkp</th>
              <th className="text-right py-2 text-xs text-gray-500">Desc. promo (%)</th>
              <th className="text-right py-2 text-xs text-gray-500">R$/g</th>
              <th className="w-8"></th>
            </tr></thead>
            <tbody>{pricingCategories.map((cat, i) => {
              const mkpFaixa = catCalc[i]?.targetMkp ?? params.startMkp;
              const valorGramaCheio = cotacaoOuro * mkpFaixa;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const descPromo = Number((cat as any).desconto_promocao ?? 0);
              const valorGramaPromo = promocaoAtiva && descPromo > 0
                ? valorGramaCheio * (1 - descPromo / 100)
                : valorGramaCheio;
              const mostraDesconto = promocaoAtiva && descPromo > 0 && valorGramaPromo !== valorGramaCheio;
              return (
              <tr key={cat.id} className="border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                <td className="py-2 pr-2"><input type="text" value={cat.name} onChange={(e) => { const u = [...pricingCategories]; u[i] = { ...u[i], name: e.target.value }; setPricingCategories(u); }} className="w-full px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                <td className="py-2 pr-2"><input type="number" value={cat.maxWeight} step={0.5} onChange={(e) => { const u = [...pricingCategories]; u[i] = { ...u[i], maxWeight: parseFloat(e.target.value) || 0 }; setPricingCategories(u); }} className="w-24 px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                <td className="py-2 pr-2"><input type="number" value={cat.variation} step={0.1} onChange={(e) => { const u = [...pricingCategories]; u[i] = { ...u[i], variation: parseFloat(e.target.value) || 0 }; setPricingCategories(u); }} className="w-20 px-2 py-1 text-sm rounded border outline-none" style={{ borderColor: C.cremeBorder }} /></td>
                <td className="py-2 pr-2 text-right font-mono text-[11px] font-bold" style={{ color: C.esmeralda }}>{mkpFaixa.toFixed(1)}×</td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    value={descPromo || ""}
                    step={1} min={0} max={100}
                    placeholder="0"
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      const u = [...pricingCategories];
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (u[i] as any) = { ...u[i], desconto_promocao: isNaN(v) ? 0 : Math.max(0, Math.min(100, v)) };
                      setPricingCategories(u);
                    }}
                    className="w-20 px-2 py-1 text-sm rounded border outline-none text-right"
                    style={{ borderColor: C.cremeBorder }}
                  />
                </td>
                <td className="py-2 pr-2 text-right">
                  {mostraDesconto ? (
                    <div className="flex flex-col items-end">
                      <span className="text-[11px] font-mono font-bold" style={{ color: "#10B981" }}>R$ {valorGramaPromo.toFixed(2).replace(".", ",")}</span>
                      <span className="text-[9px] font-mono line-through text-gray-400">R$ {valorGramaCheio.toFixed(2).replace(".", ",")}</span>
                    </div>
                  ) : (
                    <span className="font-mono text-[11px] font-bold" style={{ color: C.esmeralda }}>R$ {valorGramaCheio.toFixed(2).replace(".", ",")}</span>
                  )}
                </td>
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
        {/* Espessura mínima por modelo */}
        <div className="bg-white rounded-xl border p-5 space-y-4" style={{ borderColor: C.cremeBorder }}>
          <h3 className="text-sm font-bold text-gray-800">Modelos & Espessura mínima</h3>
          <p className="text-[11px] text-gray-500">
            Renomeie os modelos como aparecem nos botões do editor e defina a altura (mm) mínima permitida pra cada um.
            A consultora não consegue digitar valores abaixo do mínimo configurado.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: C.cremeBorder }}>
                <th className="text-left py-2 text-xs text-gray-500 w-1/2">Nome do modelo</th>
                <th className="text-left py-2 text-xs text-gray-500">Espessura mínima (mm)</th>
              </tr>
            </thead>
            <tbody>
              {PROFILE_OPTIONS.map((opt) => {
                const key = PROFILE_TO_KEY[opt.id] ?? "";
                const valor = espessuraMinimaPorModelo[key] ?? 1.0;
                const nomeAtual = nomesModelos[key] ?? opt.label;
                return (
                  <tr key={opt.id} className="border-b last:border-0" style={{ borderColor: C.cremeBorder }}>
                    <td className="py-2 pr-2">
                      <input
                        type="text"
                        value={nomeAtual}
                        onChange={(e) => {
                          const v = e.target.value;
                          setNomesModelos((prev) => ({ ...prev, [key]: v }));
                        }}
                        maxLength={60}
                        className="w-full px-3 py-2 text-sm rounded border outline-none"
                        style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={valor}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          if (!isFinite(v) || v < 0) return;
                          setEspessuraMinimaPorModelo((prev) => ({ ...prev, [key]: v }));
                        }}
                        className="w-32 px-3 py-2 text-sm rounded border outline-none font-mono"
                        style={{ borderColor: C.cremeBorder }}
                      />
                      <span className="text-[11px] text-gray-500 ml-2">mm</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: C.cremeBorder }}>
            <span className="text-[11px]" style={{ color: espessuraMsg === "Salvo!" ? "#15803D" : "#DC2626" }}>
              {espessuraMsg ?? ""}
            </span>
            <button
              type="button"
              onClick={salvarEspessuraNomes}
              disabled={savingEspessura}
              className="text-xs font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ background: C.esmeralda }}
            >
              {savingEspessura ? "Salvando…" : "Salvar mudanças"}
            </button>
          </div>
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
          {readOnly ? (
            onShare && (
              <button
                onClick={onShare}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold rounded-lg text-white transition-colors"
                style={{ backgroundColor: C.esmeralda }}
              >
                Compartilhar
              </button>
            )
          ) : (
            <button
              onClick={handleSaveOrder}
              disabled={isSaving || validationErrors.length > 0}
              title={validationErrors.length > 0 ? validationErrors[0].message : "Salvar orcamento"}
              className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold rounded-lg text-white disabled:opacity-50 transition-colors"
              style={{ backgroundColor: C.esmeralda }}
            >
              {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
            </button>
          )}
          <button
            onClick={() => setShowFichaTecnica(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-semibold rounded-lg border hover:bg-gray-50"
            style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
            title="Ver ficha técnica da aliança"
          >
            <FileText size={12} /> Ficha técnica
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
          {extraActions}
        </div>
        {saveMsg && <span className={`text-[11px] font-bold ${saveMsg.type === "success" ? "text-emerald-600" : "text-red-500"}`}>{saveMsg.text}</span>}
      </div>

      {/* ── Flex: Controles (esquerda) | 3D (direita) ─────────────────── */}
      <div style={{ display: "flex", gap: "12px", height: "calc(100vh - 130px)", overflow: "hidden" }}>

        {/* ── Painel de controles (ESQUERDA — 360px fixo, scroll) ─────── */}
        <div style={{ width: "360px", minWidth: "360px", overflowY: "hidden" }} className="space-y-1">

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

          {/* ── Perfil + Medidas + Metal ── */}
          <div className="bg-white rounded-lg border px-3 py-3 space-y-3" style={{ borderColor: C.cremeBorder }}>
            {/* Perfil — grid 2 colunas (mais legível, fonte maior) */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Perfil</h3>
              <div className="grid grid-cols-2 gap-1.5">
                {PROFILE_OPTIONS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      // Ao trocar perfil:
                      //   • largura volta a 0 (consultora preenche)
                      //   • espessura JÁ INICIA no MAIOR entre:
                      //       (a) o mínimo configurado do modelo
                      //       (b) o mínimo exigido pela pedra (se hasStones — depende
                      //           do tamanho da pedra e do furo)
                      //   Garante que a regra "diamante exige espessura X" é
                      //   respeitada já na hora de trocar de perfil.
                      // O MedidaStepper sincroniza o display via prop `num`.
                      const setProf = activeRing === 1 ? setProfile : setProfile2;
                      const setPar = activeRing === 1 ? setParams : setParams2;
                      const espMin = espessuraMinimaPorModelo[PROFILE_TO_KEY[p.id] ?? ""] ?? 1.0;
                      const par = activeRing === 1 ? params : params2;
                      const stoneMinT = par.hasStones
                        ? computeMinThickness(par.stoneSize, calibracao, par.stoneDrill)
                        : 0;
                      const effectiveMin = Math.max(espMin, stoneMinT);
                      setProf(p.id);
                      setPar((prev) => ({ ...prev, width: 0, height: effectiveMin }));
                    }}
                    className="py-1.5 px-2 text-[11px] font-semibold rounded-md border transition-all text-center leading-tight"
                    style={(activeRing === 1 ? profile : profile2) === p.id
                      ? { backgroundColor: C.esmeralda, color: "#fff", borderColor: C.esmeralda }
                      : { backgroundColor: "#fff", color: "#374151", borderColor: C.cremeBorder }
                    }
                  >{labelDoModelo(p.id)}</button>
                ))}
              </div>
            </div>

            {/* Medidas — campos maiores, label com unidade */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Medidas</h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-500 font-medium block mb-1">Aro</label>
                  <select value={(activeRing === 1 ? ringSize : ringSize2).size}
                    onChange={(e) => { const s = RING_SIZES.find((r) => r.size === Number(e.target.value)); if (s) (activeRing === 1 ? handleSizeChange : handleSizeChange2)(s); }}
                    className="w-full appearance-none px-2.5 py-2 text-sm rounded-md border bg-white text-gray-700 outline-none focus:border-[#184036]"
                    style={{ borderColor: C.cremeBorder }}>
                    {RING_SIZES.map((s) => <option key={s.size} value={s.size}>{s.size}</option>)}
                  </select>
                </div>
                {(() => {
                  const mnW = activeParams.hasStones && activeProfile !== ProfileType.QuadradoCanal ? (activeRing === 1 ? minWidth : minWidth2) : 1;
                  // Espessura mínima vem da config "Espessura mínima por modelo" (aba Configurações).
                  // Se aliança tem pedras, usa o MAIOR entre o cálculo de pedras e o mínimo configurado.
                  const espMinConfig = espessuraMinimaPorModelo[PROFILE_TO_KEY[activeProfile] ?? ""] ?? 0.5;
                  const mnH = activeParams.hasStones && activeProfile !== ProfileType.QuadradoCanal
                    ? Math.max((activeRing === 1 ? minThickness : minThickness2), espMinConfig)
                    : espMinConfig;
                  return (<>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium block mb-1">Largura (mm)</label>
                  <MedidaStepper
                    num={activeParams.width}
                    setNum={(n) => updateParam("width", n)}
                    min={mnW} max={15} step={0.5}
                    enforceMin={false}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium block mb-1">Espessura (mm)</label>
                  <MedidaStepper
                    num={activeParams.height}
                    setNum={(n) => updateParam("height", n)}
                    min={mnH} max={4} step={0.1}
                    enforceMin={true}
                  />
                </div>
                  </>);
                })()}
              {/* Campos condicionais por perfil */}
              {activeProfile === ProfileType.Concava && (
                <div>
                  <label className="text-[10px] text-gray-500 font-medium block mb-1">Prof. concava</label>
                  <MedidaStepper
                    num={activeParams.concaveDepth}
                    setNum={(n) => updateParam("concaveDepth", n)}
                    min={0.1} max={1.5} step={0.1}
                  />
                </div>
              )}
              {activeProfile === ProfileType.Chanfrada && (
                <div>
                  <label className="text-[10px] text-gray-500 font-medium block mb-1">Chanfro (mm)</label>
                  <MedidaStepper
                    num={activeParams.chamferSize}
                    setNum={(n) => updateParam("chamferSize", n)}
                    min={0.1} max={2} step={0.1}
                  />
                </div>
              )}
              {activeProfile === ProfileType.QuadradoCanal && (<>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium block mb-1">Larg. canal</label>
                  <MedidaStepper
                    num={activeParams.canalWidth}
                    setNum={(n) => updateParam("canalWidth", n)}
                    min={1} max={10} step={0.5}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 font-medium block mb-1">Alt. borda</label>
                  <MedidaStepper
                    num={activeParams.canalBorderHeight}
                    setNum={(n) => updateParam("canalBorderHeight", n)}
                    min={activeParams.hasStones ? (activeRing === 1 ? minThickness : minThickness2) : 0.3}
                    max={3}
                    step={0.1}
                  />
                </div>
              </>)}
              </div>
            </div>

            {/* Metal — botões maiores */}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Metal</h3>
              <div className="grid grid-cols-3 gap-1.5">
                {METAL_COLORS.map((mc) => (
                  <button key={mc.value} onClick={() => { updateParam("metalColor", mc.value); updateParam("goldDensity", mc.density); }}
                    className="py-1.5 px-2 text-[11px] font-semibold rounded-md border transition-all text-center"
                    style={activeParams.metalColor === mc.value
                      ? { backgroundColor: mc.value, color: mc.value === "#E8E8E8" ? "#333" : "#fff", borderColor: C.esmeralda, boxShadow: `0 0 0 2px ${C.esmeralda}` }
                      : { backgroundColor: "#fff", color: "#374151", borderColor: C.cremeBorder }
                    }>{mc.label}</button>
                ))}
              </div>
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
                <div>
                  <label className="text-[10px] text-gray-500 font-medium block mb-1">Tamanho (mm)</label>
                  <MedidaStepper
                    num={activeParams.stoneSize}
                    setNum={(n) => updateParam("stoneSize", n)}
                    min={1} max={2.5} step={0.1}
                  />
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
                          // Usa activeProfile pra respeitar qual anel está sendo editado (1 ou 2)
                          if (activeProfile === ProfileType.QuadradoCanal) {
                            const mr = computeMaxStoneRows(activeParams.canalWidth, activeParams.stoneSize, calibracao);
                            updateParam("stoneRows", mr);
                          }
                        }
                        else if (i === 1) {
                          updateParam("stoneFull", false); updateParam("stoneHalfMoon", true);
                          // Usa activeProfile pra respeitar qual anel está sendo editado (1 ou 2)
                          if (activeProfile === ProfileType.QuadradoCanal) {
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
                <div>
                  <span className="text-[11px] text-gray-500 block mb-1">Tipo de pedra:</span>
                  <div className="grid grid-cols-3 gap-1">
                    {["Diamante", "Zirconia", "Rubi", "Esmeralda", "Safira", "Outro"].map((tipo) => {
                      // Normaliza acentos+case pra comparar "Zircônia" (legado) com "Zirconia" (atual)
                      const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
                      const isSelected = norm(activeParams.stoneType) === norm(tipo);
                      return (
                      <button
                        key={tipo}
                        type="button"
                        onClick={() => updateParam("stoneType", tipo)}
                        className="py-1.5 px-1 text-[10px] font-semibold rounded-md border transition-all"
                        style={isSelected
                          ? { backgroundColor: C.esmeralda, color: "#fff", borderColor: C.esmeralda }
                          : { backgroundColor: "#fff", color: "#374151", borderColor: C.cremeBorder }
                        }
                      >{tipo}</button>);
                    })}
                  </div>
                  {/* Status do auto-lookup */}
                  {(() => {
                    const status = activeRing === 1 ? pedraStatus1 : pedraStatus2;
                    const sel = activeRing === 1 ? pedraSelecionada1 : pedraSelecionada2;
                    if (activeParams.stoneType === "Outro") {
                      return (
                        <p className="text-[10px] mt-1.5" style={{ color: "#6B7280" }}>
                          Tipo &quot;Outro&quot; — pedra não calculada automaticamente.
                          Cadastre em <a href="/produtos" target="_blank" rel="noopener" className="underline">/produtos</a> e use um dos tipos acima.
                        </p>
                      );
                    }
                    if (status === "buscando") {
                      return <p className="text-[10px] text-gray-400 mt-1.5">Buscando…</p>;
                    }
                    if (status === "ok" && sel) {
                      return (
                        <p className="text-[10px] mt-1.5" style={{ color: "#15803D" }}>
                          ✓ <strong>{sel.nome}</strong> — R$ {Number(sel.preco).toFixed(2).replace(".", ",")}/un
                        </p>
                      );
                    }
                    if (status === "nao_cadastrado") {
                      return (
                        <p className="text-[10px] mt-1.5" style={{ color: "#B45309" }}>
                          ⚠ Pedra <strong>{activeParams.stoneType} {activeParams.stoneSize}mm</strong> não cadastrada.
                          {" "}<a href="/produtos" target="_blank" rel="noopener" className="underline">Cadastrar</a>.
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={activeParams.stoneDrill} onChange={(e) => updateParam("stoneDrill", e.target.checked)} style={{ accentColor: C.esmeralda }} className="rounded" />
                  <span className="text-[10px] text-gray-500">Furo passante</span>
                </label>
                <p className="text-[10px] text-gray-400">{derivedStoneCount} pedra(s) de {activeParams.stoneSize}mm</p>
              </div>
            )}
          </Card>

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
                  <input type="text" maxLength={activeProfile === ProfileType.QuadradoCanal ? 50 : 20} value={activeParams.textContent}
                    onChange={(e) => {
                      if (activeProfile === ProfileType.QuadradoCanal) {
                        updateParam("textContent", e.target.value);
                      } else {
                        const raw = e.target.value.replace(/\s/g, "");
                        if (!raw) { updateParam("textContent", ""); return; }
                        const formatted = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
                        updateParam("textContent", formatted);
                      }
                    }}
                    placeholder={activeProfile === ProfileType.QuadradoCanal ? "Nome a gravar" : "Nome (sem espaco)"}
                    className="w-full px-3 py-1.5 text-[11px] rounded-lg border outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
                </div>
                {/* Textos adicionais — R$ cada (exceto Bordas Elevadas: ilimitado e grátis) */}
                {(() => {
                  const isBordas = activeProfile === ProfileType.QuadradoCanal;
                  return <>
                {extras.map((txt, idx) => (
                  <div key={idx}>
                    <label className="text-[8px] text-gray-400 block">
                      {idx === 0 ? "Nome/data adicional" : `Adicional ${idx + 1}`}{" "}
                      {isBordas
                        ? <span className="text-emerald-600">incluso</span>
                        : <span className="text-amber-500">+R$ {precoGravacao.toFixed(0)}</span>}
                    </label>
                    <div className="flex gap-1">
                      <input type="text" maxLength={activeProfile === ProfileType.QuadradoCanal ? 50 : 20} value={txt}
                        onChange={(e) => {
                          if (activeProfile === ProfileType.QuadradoCanal) {
                            const u = [...extras]; u[idx] = e.target.value; setExtras(u);
                          } else {
                            const raw = e.target.value.replace(/\s/g, "");
                            const formatted = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "";
                            const u = [...extras]; u[idx] = formatted; setExtras(u);
                          }
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
                  + Nome/data adicional {isBordas ? "(incluso)" : `(R$ ${precoGravacao.toFixed(0)})`}
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
                  isBordas ? (
                    <p className="text-[9px] text-emerald-600 font-semibold">
                      ✓ {extras.filter(t => t.trim()).length} adicional(is) — gravação ilimitada incluída (Bordas Elevadas)
                    </p>
                  ) : (
                    <p className="text-[9px] text-amber-600 font-semibold">
                      +{extras.filter(t => t.trim()).length} adicional(is) = R$ {(extras.filter(t => t.trim()).length * precoGravacao).toFixed(0)}
                    </p>
                  )
                )}
                </>;
                })()}
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
                // Calcula unitário das pedras: R$ total / soma de qtds (de ambos os anéis se par)
                const totalQtd =
                  stoneEntries.reduce((acc, s) => acc + (s.qtd ?? 0), 0)
                  + (allianceMode === "par" ? stoneEntries2.reduce((acc, s) => acc + (s.qtd ?? 0), 0) : 0);
                const unit = totalQtd > 0 ? pedrasTotal / totalQtd : 0;
                const sublabel = totalQtd > 0
                  ? `R$ ${unit.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/un × ${totalQtd}`
                  : undefined;
                return (
                  <>
                    <Pill label="Ouro" value={`R$ ${ouroTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                    {pedrasTotal > 0 && (
                      <Pill
                        label="Pedras"
                        value={`R$ ${pedrasTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                        sublabel={sublabel}
                      />
                    )}
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

      {/* ── Modal Ficha Técnica ── */}
      {showFichaTecnica && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowFichaTecnica(false)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: C.cremeBorder }}>
              <h3 className="text-base font-bold" style={{ color: C.esmeralda }}>
                Ficha Técnica {allianceMode === "par" ? "do par" : "da aliança"}
              </h3>
              <button onClick={() => setShowFichaTecnica(false)} className="p-1.5 rounded hover:bg-gray-100">
                <X size={16} style={{ color: "#6B7280" }} />
              </button>
            </div>
            <div className="p-5 space-y-4 text-sm">
              {/* Anel 1 */}
              <FichaAlianca
                titulo={allianceMode === "par" ? "Aliança 1" : "Especificações"}
                profile={profile}
                ringSize={ringSize}
                params={params}
                weight={weightEst.weight}
                stoneEntries={stoneEntries}
                labelDoModelo={labelDoModelo}
                metalLabel={METAL_COLORS.find((m) => m.value === params.metalColor)?.label ?? "—"}
              />
              {allianceMode === "par" && (
                <FichaAlianca
                  titulo="Aliança 2"
                  profile={profile2}
                  ringSize={ringSize2}
                  params={params2}
                  weight={weightEst2.weight}
                  stoneEntries={stoneEntries2}
                  labelDoModelo={labelDoModelo}
                  metalLabel={METAL_COLORS.find((m) => m.value === params2.metalColor)?.label ?? "—"}
                />
              )}
              {/* Peso total (sem preço — só dados técnicos) */}
              {allianceMode === "par" && (
                <div className="rounded-lg border p-3 space-y-1" style={{ borderColor: C.cremeBorder, backgroundColor: "#F0F7F4" }}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.esmeralda }}>
                      Peso total do par
                    </span>
                    <span className="font-mono font-bold" style={{ color: C.esmeralda }}>
                      {pricingTotal.weight.toFixed(2)} g
                    </span>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end px-5 py-3 border-t" style={{ borderColor: C.cremeBorder }}>
              <button
                onClick={() => setShowFichaTecnica(false)}
                className="px-4 py-1.5 rounded-lg text-[13px] font-semibold text-white"
                style={{ backgroundColor: C.esmeralda }}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-componente: Ficha Técnica de uma aliança ─────────────────────────────
function FichaAlianca({
  titulo, profile, ringSize, params, weight, stoneEntries,
  labelDoModelo, metalLabel,
}: {
  titulo: string;
  profile: ProfileType;
  ringSize: RingSize;
  params: RingParams;
  weight: number;
  stoneEntries: StoneEntry[];
  labelDoModelo: (p: string) => string;
  metalLabel: string;
}) {
  const totalPedras = stoneEntries.reduce((acc, s) => acc + (s.qtd ?? 0), 0);
  return (
    <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: C.cremeBorder }}>
      <h4 className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.esmeralda }}>{titulo}</h4>
      <Linha k="Modelo" v={labelDoModelo(profile)} />
      <Linha k="Aro" v={`${ringSize.size} (Ø ${ringSize.diameter.toFixed(2)}mm)`} />
      <Linha k="Largura" v={`${params.width.toFixed(2)} mm`} />
      <Linha k="Espessura" v={`${params.height.toFixed(2)} mm`} />
      {profile === ProfileType.Concava && <Linha k="Prof. côncava" v={`${params.concaveDepth.toFixed(2)} mm`} />}
      {profile === ProfileType.Chanfrada && <Linha k="Chanfro" v={`${params.chamferSize.toFixed(2)} mm`} />}
      {profile === ProfileType.QuadradoCanal && (<>
        <Linha k="Larg. canal" v={`${params.canalWidth.toFixed(2)} mm`} />
        <Linha k="Alt. borda" v={`${params.canalBorderHeight.toFixed(2)} mm`} />
      </>)}
      <Linha k="Metal" v={metalLabel} />
      {params.hasGroove && (
        <Linha k="Friso" v={`${params.grooveKind === "risco" ? "Risco" : "Friso"} ${params.grooveType} · ${params.grooveWidth.toFixed(2)}×${params.grooveDepth.toFixed(2)}mm`} />
      )}
      {totalPedras > 0 && (() => {
        const tipoPedra = stoneEntries[0]?.tipo ?? "";
        const tamanho = stoneEntries[0]?.tamanho_mm;
        return (
          <Linha k="Pedras" v={`${totalPedras} un · ${tipoPedra}${tamanho ? ` · ${tamanho}mm` : ""}`} />
        );
      })()}
      {params.hasStones && profile === ProfileType.QuadradoCanal && params.stoneRows > 0 && (
        <Linha k="Fileiras" v={`${params.stoneRows}`} />
      )}
      {params.hasStones && (
        <Linha k="Furo passante" v={params.stoneDrill ? "Sim" : "Não"} />
      )}
      {params.textEnabled && params.textContent && (
        <Linha k="Gravação" v={`"${params.textContent}"`} />
      )}
      <div className="border-t pt-1.5 mt-1.5" style={{ borderColor: C.cremeBorder }}>
        <Linha k="Peso estimado" v={`${weight.toFixed(2)} g`} bold />
      </div>
    </div>
  );
}

function Linha({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between text-xs">
      <span className="text-gray-500">{k}</span>
      <span className={`font-mono ${bold ? "font-bold" : ""}`} style={{ color: bold ? C.esmeralda : "#374151" }}>{v}</span>
    </div>
  );
}


// ── MedidaStepper ───────────────────────────────────────────────────────────
// Componente padrão de input numérico com − [valor] + integrados num único
// campo bordado. Usa string state interno pra permitir digitar "0.5" sem
// React rejeitar o ponto. enforceMin=true bloqueia o − no mínimo.
function MedidaStepper({
  num, setNum,
  min, max, step,
  enforceMin = true, floor = 0,
}: {
  num: number;
  setNum: (n: number) => void;
  min: number;
  max: number;
  step: number;
  /** Se true: − fica disabled em num<=min, e blur abaixo do min sobe pro min. Default true. */
  enforceMin?: boolean;
  /** Limite inferior do − quando enforceMin=false. Default 0. */
  floor?: number;
}) {
  const [str, setStr] = React.useState(String(num));
  const focusedRef = React.useRef(false);

  // Sincroniza string com num externo quando não está sendo editado
  React.useEffect(() => {
    if (!focusedRef.current) setStr(String(num));
  }, [num]);

  const round1 = (n: number) => Math.round(n * 100) / 100;
  const lowerBound = enforceMin ? min : floor;
  const decDisabled = num <= lowerBound;
  const incDisabled = num >= max;

  const dec = () => {
    const next = round1(Math.max(lowerBound, num - step));
    setNum(next); setStr(String(next));
  };
  const inc = () => {
    const next = round1(Math.min(max, num + step));
    setNum(next); setStr(String(next));
  };

  return (
    <div className="flex items-stretch border rounded-md bg-white overflow-hidden" style={{ borderColor: C.cremeBorder }}>
      <button type="button" onClick={dec} disabled={decDisabled}
        className="px-2 text-xs font-bold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{ color: C.esmeralda, borderRight: `1px solid ${C.cremeBorder}` }}
        title={decDisabled ? "Mínimo atingido" : `Diminuir ${step}`}
      >−</button>
      <input type="text" inputMode="decimal"
        value={str}
        onFocus={(e) => {
          focusedRef.current = true;
          if (str === "0") setStr("");
          else e.target.select();
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(",", ".");
          if (raw !== "" && !/^\d*\.?\d*$/.test(raw)) return;
          setStr(raw);
          const v = parseFloat(raw);
          setNum(isNaN(v) ? 0 : v);
        }}
        onBlur={() => {
          focusedRef.current = false;
          if (str === "" || str === ".") {
            setStr(String(lowerBound));
            setNum(lowerBound);
            return;
          }
          if (enforceMin && num > 0 && num < min) {
            setNum(min); setStr(String(min));
          } else if (num > max) {
            setNum(max); setStr(String(max));
          }
        }}
        className="flex-1 min-w-0 px-1 py-1.5 text-sm font-mono text-center outline-none bg-transparent"
      />
      <button type="button" onClick={inc} disabled={incDisabled}
        className="px-2 text-xs font-bold hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        style={{ color: C.esmeralda, borderLeft: `1px solid ${C.cremeBorder}` }}
        title={incDisabled ? "Máximo atingido" : `Aumentar ${step}`}
      >+</button>
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
