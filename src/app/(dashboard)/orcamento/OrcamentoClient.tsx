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
}

type OrcamentoTipo = "alianca" | "peca" | null;

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
  cotacaoOuro, cotacaoDolar, config, canManageConfig, userName, userId, vendedorId,
}: Props) {
  const [orcamentoTipo, setOrcamentoTipo] = useState<OrcamentoTipo>(null);

  // Pedras (compartilhado aliança + peça)
  const [stoneEntries, setStoneEntries] = useState<StoneEntry[]>([]);
  const stonePrices = config?.stone_prices?.length ? config.stone_prices : DEFAULT_STONE_PRICES;
  const stoneMarkup = config?.stone_markup ?? 2.5;
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
  const [clientName, setClientName] = useState("");
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
    setParams((prev) => ({ ...prev, [key]: value }));
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

  const handleSizeChange = (s: RingSize) => { setRingSize(s); updateParam("diameter", s.diameter); };

  const handleSaveOrder = async () => {
    if (!clientName.trim()) { setSaveMsg({ text: "Preencha o nome do cliente", type: "error" }); return; }
    setIsSaving(true); setSaveMsg(null);
    try {
      const body = {
        nome_cliente: clientName.trim(),
        nome_modelo: PROFILE_OPTIONS.find((p) => p.id === profile)?.label ?? profile,
        peso: pricing.weight, valor: pricing.discountPrice, markup: pricing.mkp,
        desconto_pct: params.discountPercent, cotacao_ouro: params.goldPrice, tipo: "alianca",
        ficha: {
          modelo: PROFILE_OPTIONS.find((p) => p.id === profile)?.label ?? profile,
          aro_numeracao: `Aro ${ringSize.size}`, largura: params.width, espessura: params.height,
          peso_estimado: pricing.weight, perfil: profile, diametro: params.diameter,
          densidade_ouro: params.goldDensity, cor_metal: params.metalColor,
          tipo_fonte: params.textEnabled && params.textContent.trim() ? (params.textFontType === 2 ? "Cursiva" : "Forma") : null,
          texto: params.textEnabled && params.textContent.trim() ? params.textContent.trim() : null,
          qtd_pedras: params.hasStones ? derivedStoneCount : null, tamanho_pedra: params.hasStones ? params.stoneSize : null,
          tipo_aplicacao_pedra: params.hasStones ? (params.stoneFull ? "Volta Completa" : params.stoneHalfMoon ? "Meia Alianca" : "Pontual") : null,
          profundidade_concava: params.concaveDepth, friso_lado: params.grooveSide,
          friso_largura: params.grooveWidth, friso_profundidade: params.grooveDepth, friso_offset: params.grooveOffset,
          canal_largura: params.canalWidth, canal_borda_altura: params.canalBorderHeight,
          chanfro_tamanho: params.chamferSize, dome_porcentagem: params.domePercentage,
          pedra_fileiras: params.stoneRows, pedra_drill: params.stoneDrill,
          pedra_meia_lua: params.stoneHalfMoon, pedra_volta_completa: params.stoneFull,
        },
      };
      const res = await fetch("/api/orcamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error();
      setSaveMsg({ text: "Orcamento salvo!", type: "success" }); setClientName("");
    } catch { setSaveMsg({ text: "Erro ao salvar", type: "error" }); }
    finally { setIsSaving(false); }
  };

  const handleSaveConfig = async () => {
    setIsSavingConfig(true); setConfigMsg(null);
    try {
      const res = await fetch("/api/orcamento/config", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_mkp: params.startMkp, discount_percent: params.discountPercent, profile, pricing_categories: pricingCategories, groove_rules: grooveRules }),
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
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: C.cremeBg }}>
        <div className="max-w-2xl w-full space-y-6">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold" style={{ color: C.esmeralda }}>Novo Orcamento</h1>
            <p className="text-sm text-gray-500 mt-1">Escolha o tipo de orcamento personalizado</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => setOrcamentoTipo("alianca")}
              className="bg-white rounded-2xl border-2 p-8 text-left transition-all hover:shadow-lg hover:border-[#D4AF37] active:scale-[0.98]"
              style={{ borderColor: C.cremeBorder }}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "rgba(212,175,55,0.1)" }}>
                <CircleDot size={28} style={{ color: C.gold }} />
              </div>
              <h2 className="text-lg font-bold mb-1" style={{ color: C.esmeralda }}>Alianca Personalizada</h2>
              <p className="text-xs text-gray-500">Editor 3D com perfis, medidas, pedras, gravacao e precificacao automatica</p>
            </button>
            <button
              onClick={() => setOrcamentoTipo("peca")}
              className="bg-white rounded-2xl border-2 p-8 text-left transition-all hover:shadow-lg hover:border-[#D4AF37] active:scale-[0.98]"
              style={{ borderColor: C.cremeBorder }}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: "rgba(212,175,55,0.1)" }}>
                <Gem size={28} style={{ color: C.gold }} />
              </div>
              <h2 className="text-lg font-bold mb-1" style={{ color: C.esmeralda }}>Peca Personalizada</h2>
              <p className="text-xs text-gray-500">Anel, brinco, pingente, pulseira — peso manual, pedras opcionais</p>
            </button>
          </div>
          {canManageConfig && (
            <div className="text-center">
              <button onClick={() => { setOrcamentoTipo("alianca"); setTab("config"); }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                <Settings2 size={12} className="inline mr-1" />Configuracoes
              </button>
            </div>
          )}
        </div>
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
            <h1 className="text-lg font-bold" style={{ color: C.esmeralda }}>Peca Personalizada</h1>
            <div className="w-16" />
          </div>

          {/* Cliente */}
          <div className="bg-white rounded-xl border p-4" style={{ borderColor: C.cremeBorder }}>
            <div className="flex items-center gap-2">
              <User size={14} className="text-gray-400" />
              <input
                type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
                placeholder="Nome do cliente" className="flex-1 text-sm outline-none"
              />
            </div>
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
                  nome_cliente: clientName.trim(), tipo: "peca",
                  peso: pecaPeso, valor: pecaTotal, markup: pecaPricing.mkp,
                  desconto_pct: params.discountPercent, cotacao_ouro: cotacaoOuro,
                  cotacao_dolar: cotacaoDolar, valor_ouro: pecaPricing.discountPrice,
                  valor_pedras: stoneTotalRS,
                  ficha: { peso_estimado: pecaPeso, cor_metal: pecaMetalColor, densidade_ouro: pecaGoldDensity, pedras_detalhadas: stoneEntries },
                };
                const res = await fetch("/api/orcamento", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                if (!res.ok) throw new Error();
                setSaveMsg({ text: "Orcamento salvo!", type: "success" }); setClientName(""); setStoneEntries([]);
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
          <h1 className="text-lg font-bold text-gray-800">Configuracoes do Orcamento</h1>
          <button onClick={() => setTab("design")} className="text-xs font-semibold px-4 py-2 rounded-lg text-white" style={{ background: C.esmeralda }}>Voltar ao Design</button>
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
            <h1 className="text-base font-bold text-gray-800 leading-tight">Orcamento de Aliancas</h1>
            <p className="text-[11px] text-gray-400">Ouro: R$ {params.goldPrice.toFixed(2)}/g</p>
          </div>
        </div>
        {/* Nome do cliente */}
        <div className="flex items-center gap-2 bg-white rounded-xl border px-3 py-2 min-w-[220px]" style={{ borderColor: C.cremeBorder }}>
          <User size={14} className="text-gray-400 shrink-0" />
          <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
            placeholder="Nome do cliente"
            className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder:text-gray-300" />
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
            <button onClick={() => setTab("config")} className="p-2 rounded-lg border" style={{ borderColor: C.cremeBorder }} title="Configuracoes">
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

          {/* Perfil */}
          <Card title="Perfil">
            <div className="grid grid-cols-3 gap-1.5">
              {PROFILE_OPTIONS.map((p) => (
                <button key={p.id} onClick={() => setProfile(p.id)}
                  className="py-2 text-[10px] font-semibold rounded-lg border transition-all text-center"
                  style={profile === p.id
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
                  <select value={ringSize.size}
                    onChange={(e) => { const s = RING_SIZES.find((r) => r.size === Number(e.target.value)); if (s) handleSizeChange(s); }}
                    className="w-full appearance-none pl-3 pr-7 py-1.5 text-[11px] rounded-lg border bg-white text-gray-700 outline-none"
                    style={{ borderColor: C.cremeBorder }}>
                    {RING_SIZES.map((s) => <option key={s.size} value={s.size}>Aro {s.size} — {s.diameter.toFixed(2)}mm</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <Slider label="Largura" value={params.width} min={1} max={15} step={0.5} unit="mm" onChange={(v) => updateParam("width", v)} />
              <Slider label="Espessura" value={params.height} min={0.5} max={4} step={0.1} unit="mm" onChange={(v) => updateParam("height", v)} />
              {profile === ProfileType.Concava && <Slider label="Prof. concava" value={params.concaveDepth} min={0.1} max={1.5} step={0.1} unit="mm" onChange={(v) => updateParam("concaveDepth", v)} />}
              {(profile === ProfileType.Boleada || profile === ProfileType.BoleadaDouble || profile === ProfileType.Anatomica) && <Slider label="Curvatura" value={params.domePercentage} min={0} max={100} step={5} unit="%" onChange={(v) => updateParam("domePercentage", v)} />}
              {profile === ProfileType.Chanfrada && <Slider label="Chanfro" value={params.chamferSize} min={0.1} max={2} step={0.1} unit="mm" onChange={(v) => updateParam("chamferSize", v)} />}
              {profile === ProfileType.QuadradoCanal && <>
                <Slider label="Larg. canal" value={params.canalWidth} min={1} max={10} step={0.5} unit="mm" onChange={(v) => updateParam("canalWidth", v)} />
                <Slider label="Alt. borda" value={params.canalBorderHeight} min={0.3} max={3} step={0.1} unit="mm" onChange={(v) => updateParam("canalBorderHeight", v)} />
              </>}
            </div>
          </Card>

          {/* Metal */}
          <Card title="Metal">
            <div className="flex gap-1.5">
              {METAL_COLORS.map((mc) => (
                <button key={mc.value} onClick={() => { updateParam("metalColor", mc.value); updateParam("goldDensity", mc.density); }}
                  className="flex-1 py-2 text-[10px] font-semibold rounded-lg border transition-all text-center"
                  style={params.metalColor === mc.value
                    ? { backgroundColor: mc.value, color: mc.value === "#E8E8E8" ? "#333" : "#fff", borderColor: C.esmeralda, boxShadow: `0 0 0 2px ${C.esmeralda}` }
                    : { backgroundColor: "#fff", color: "#6b7280", borderColor: C.cremeBorder }
                  }>{mc.label}</button>
              ))}
            </div>
          </Card>

          {/* Pedras */}
          <Card title="Pedras">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={params.hasStones} onChange={(e) => updateParam("hasStones", e.target.checked)} style={{ accentColor: C.esmeralda }} className="rounded" />
              <span className="text-[11px] text-gray-600">Incluir pedras</span>
            </label>
            {params.hasStones && (
              <div className="space-y-2 mt-2">
                <Slider label="Tamanho" value={params.stoneSize} min={0.8} max={3} step={0.1} unit="mm" onChange={(v) => updateParam("stoneSize", v)} />
                <div className="flex gap-1.5">
                  {(["Pontual", "Meia Alianca", "Volta Completa"] as const).map((tipo, i) => {
                    const active = i === 2 ? params.stoneFull : i === 1 ? params.stoneHalfMoon : !params.stoneFull && !params.stoneHalfMoon;
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
                {!params.stoneFull && !params.stoneHalfMoon && (
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-500">Qtd:</span>
                    <button onClick={() => updateParam("stoneCount", Math.max(1, params.stoneCount - 1))} className="w-6 h-6 rounded-lg border flex items-center justify-center" style={{ borderColor: C.cremeBorder }}><Minus size={10} className="text-gray-500" /></button>
                    <span className="text-sm font-bold w-5 text-center" style={{ color: C.esmeralda }}>{params.stoneCount}</span>
                    <button onClick={() => updateParam("stoneCount", Math.min(stoneCapacity, params.stoneCount + 1))} className="w-6 h-6 rounded-lg border flex items-center justify-center" style={{ borderColor: C.cremeBorder }}><Plus size={10} className="text-gray-500" /></button>
                    <span className="text-[10px] text-gray-400">max {stoneCapacity}</span>
                  </div>
                )}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={params.stoneDrill} onChange={(e) => updateParam("stoneDrill", e.target.checked)} style={{ accentColor: C.esmeralda }} className="rounded" />
                  <span className="text-[10px] text-gray-500">Cravacao por broca</span>
                </label>
                <p className="text-[10px] text-gray-400">{derivedStoneCount} pedra(s) de {params.stoneSize}mm</p>
              </div>
            )}
          </Card>

          {/* Gravação */}
          <Card title="Gravacao">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={params.textEnabled} onChange={(e) => updateParam("textEnabled", e.target.checked)} style={{ accentColor: C.esmeralda }} className="rounded" />
              <span className="text-[11px] text-gray-600">Gravar texto</span>
            </label>
            {params.textEnabled && (
              <div className="space-y-2 mt-2">
                <input type="text" maxLength={30} value={params.textContent} onChange={(e) => updateParam("textContent", e.target.value)} placeholder="Texto a gravar..."
                  className="w-full px-3 py-1.5 text-[11px] rounded-lg border outline-none bg-white" style={{ borderColor: C.cremeBorder }} />
                <div className="flex gap-1.5">
                  {([{ v: 1 as const, l: "Forma" }, { v: 2 as const, l: "Cursiva" }]).map(({ v, l }) => (
                    <button key={v} onClick={() => updateParam("textFontType", v)}
                      className="flex-1 py-1.5 text-[10px] font-semibold rounded-lg border transition-all text-center"
                      style={params.textFontType === v
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
          {/* Viewport 3D */}
          <div className="rounded-2xl overflow-hidden border relative" style={{ borderColor: C.cremeBorder, flex: 1 }}>
            <AliancaViewport params={params} profile={profile} cameraDistance={cameraDistance} onMeshReady={setCurrentMesh} />
          </div>
          {/* Resultado compacto */}
          <div className="rounded-xl border px-4 py-2.5 shrink-0" style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <Pill label="Peso" value={`${pricing.weight.toFixed(1)}g`} />
                <Pill label="Cat." value={pricing.category} />
                <Pill label="Mkp" value={`${pricing.mkp.toFixed(2)}x`} />
                <Pill label="Custo" value={`R$${pricing.cost.toFixed(0)}`} />
                <span className="text-xs text-gray-300 line-through">R$ {pricing.price.toFixed(0)}</span>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] uppercase tracking-wide" style={{ color: C.esmeralda }}>
                  Preco final {params.discountPercent > 0 && `(-${params.discountPercent}%)`}
                </p>
                <p className="text-2xl font-black tracking-tight" style={{ color: C.esmeralda }}>
                  R$ {pricing.discountPrice.toLocaleString("pt-BR")}
                </p>
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
