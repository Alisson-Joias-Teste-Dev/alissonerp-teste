"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  X, Loader2, CheckCircle, AlertCircle, TrendingDown,
  Camera, RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPeso, gramasToCt, formatPesoCt } from "@/lib/formatters";

const C = {
  esmeralda: "#184036",
  sage: "#80A795",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
};

interface SaidaOrdemModalProps {
  isOpen: boolean;
  onClose: () => void;
  pcpId: number;
  ordemId: number;
  depositoId: number;
  pesoMetalExterno?: number; // peso_metal_externo da ordem (referência)
  onSuccess?: () => void;
}

interface PCPDados {
  metal_liquido: number;   // Σ tipos 1+2 − tipo 5, calculado ao vivo do resumo
  dist_ouro_real: number;
  metal_externo: number;
  deposito_nome: string | null;
}

interface PedraPCP {
  insumo_id: number;
  insumo_nome: string;
  sku: string | null;
  peso_pedra: number;
  qtd_disponivel: number;
  saldo_ct?: number | null;
}

interface OutroInsumo {
  insumo_id: number;
  insumo_nome: string;
  categoria_id: number;
  categoria_nome: string;
  peso_total: number;
}

interface ValidacaoIA {
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  match: boolean;
  mensagem: string;
}

interface ApontamentoPadrao {
  produto_id: number;
  sku: string | null;
  nome: string | null;
  peso_total: number;
  peso_pedras: number;
  peso_ouro_esperado: number;
}

// Tolerância: diferença em gramas a partir da qual o banner é exibido.
// Valor escolhido para ser visualmente significativo em joalheria (peças finas).
const TOLERANCIA_DIFERENCA_OURO = 0.05;

function quebraColor(pct: number): string {
  if (pct <= 3) return "#059669";
  if (pct <= 8) return "#D97706";
  return "#DC2626";
}

export default function SaidaOrdemModal({
  isOpen,
  onClose,
  pcpId,
  ordemId,
  depositoId,
  pesoMetalExterno,
  onSuccess,
}: SaidaOrdemModalProps) {
  // ── Dados do PCP ──
  const [dados, setDados] = useState<PCPDados | null>(null);
  const [pedras, setPedras] = useState<PedraPCP[]>([]);
  const [loadingDados, setLoadingDados] = useState(false);

  // ── Formulário ──
  const [pesoBruto, setPesoBruto]         = useState("");
  const [outrosPesos, setOutrosPesos]     = useState("");  // campo livre (quando sem insumos)
  const [outros, setOutros]               = useState<OutroInsumo[]>([]);
  const [pesoOutros, setPesoOutros]       = useState<Record<number, string>>({}); // insumo_id → g
  const [qtdPedras, setQtdPedras]         = useState<Record<number, string>>({}); // insumo_id → qtd (legacy)
  const [pesoGPedras, setPesoGPedras]     = useState<Record<number, string>>({}); // insumo_id → gramas
  // Metal externo: pré-preenchido com o peso da ordem, editável pelo operador
  const [metalExterno, setMetalExterno]   = useState(String(pesoMetalExterno ?? 0));

  // ── Foto + IA ──
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [validacaoIA, setValidacaoIA] = useState<ValidacaoIA | null>(null);
  const [validando, setValidando] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Estado ──
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // ── Apontamento padrão (do produto) — para mostrar diferença vs peso real ──
  const [apontamentoPadrao, setApontamentoPadrao] = useState<ApontamentoPadrao | null>(null);

  const supabase = createClient();

  // ── Carregar dados ao abrir ──
  useEffect(() => {
    if (!isOpen) return;
    setDados(null);
    setPedras([]);
    setApontamentoPadrao(null);
    setLoadingDados(true);

    // Apontamento padrão (não bloqueante — banner é informativo)
    fetch(`/api/pcp/${pcpId}/apontamento-padrao`).then(async (r) => {
      if (!r.ok) return;
      const j = await r.json() as { padrao: ApontamentoPadrao | null };
      setApontamentoPadrao(j.padrao);
    }).catch(() => { /* ignore */ });

    Promise.all([
      fetch(`/api/pcp/${pcpId}`).then((r) => r.json()),
      fetch(`/api/pcp/${pcpId}/resumo`).then((r) => r.json()),
      fetch(`/api/pcp/${pcpId}/pedras-disponiveis`).then((r) => r.json()),
      fetch(`/api/pcp/${pcpId}/outros-disponiveis`).then((r) => r.json()),
    ]).then(([det, res, ped, out]) => {
      if (det && !det.error) {
        const metalLiquido = Number(res?.totais?.metal_liquido ?? 0);
        setDados({
          metal_liquido:  metalLiquido,
          metal_externo:  Number(det.metal_externo ?? 0),
          dist_ouro_real: Number(det.dist_ouro_real ?? 0),
          deposito_nome:  det.deposito_nome ?? null,
        });
      }
      if (Array.isArray(ped)) {
        setPedras(ped);
        const initPedras: Record<number, string> = {};
        const initPesoG: Record<number, string> = {};
        for (const p of ped) {
          initPedras[p.insumo_id] = String(p.qtd_disponivel);
          // Pre-fill with all available pedras weight in grams
          const saldoCtNum = p.saldo_ct != null ? Number(p.saldo_ct) : p.qtd_disponivel * p.peso_pedra;
          initPesoG[p.insumo_id] = (saldoCtNum * 0.2).toFixed(4);
        }
        setQtdPedras(initPedras);
        setPesoGPedras(initPesoG);
      }
      if (Array.isArray(out) && out.length > 0) {
        setOutros(out);
        const initOutros: Record<number, string> = {};
        for (const o of out) initOutros[o.insumo_id] = Number(o.peso_total).toFixed(3);
        setPesoOutros(initOutros);
      }
      setLoadingDados(false);
    });
  }, [isOpen, pcpId]);

  // ── Resetar validação quando peso muda ──
  useEffect(() => {
    if (validacaoIA !== null) setValidacaoIA(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pesoBruto]);

  // ── Cálculos derivados ──
  const pesoBrutoNum = parseFloat(pesoBruto);

  // Quando há insumos "outros" apontados → somar pesos dos inputs
  // Quando não há → usar campo livre
  const temOutrosInsumos = outros.length > 0;
  const outrosPesosNum = temOutrosInsumos
    ? outros.reduce((acc, o) => acc + (parseFloat(pesoOutros[o.insumo_id] ?? "0") || 0), 0)
    : (parseFloat(outrosPesos.replace(",", ".")) || 0);

  const pesoPedrasTotal = useMemo(() => {
    return pedras.reduce((acc, p) => {
      // Use gram-based input if available, fall back to unit-based legacy
      const gStr = pesoGPedras[p.insumo_id];
      if (gStr !== undefined) {
        return acc + (parseFloat(gStr) || 0);
      }
      const q = parseInt(qtdPedras[p.insumo_id] ?? "0") || 0;
      return acc + q * p.peso_pedra;
    }, 0);
  }, [pedras, qtdPedras, pesoGPedras]);

  const metalExternoNum = Number(metalExterno.replace(",", ".")) || 0;

  // peso_ouro_real = peso_bruto − pedras (ouro físico na peça, inclui metal_externo)
  const pesoOuroReal = useMemo(() => {
    if (isNaN(pesoBrutoNum) || pesoBrutoNum <= 0) return null;
    return pesoBrutoNum - pesoPedrasTotal;
  }, [pesoBrutoNum, pesoPedrasTotal]);

  // pmc = peso_ouro_real − outros − metal_externo
  const pmcPreview = useMemo(() => {
    if (pesoOuroReal === null) return null;
    return pesoOuroReal - outrosPesosNum - metalExternoNum;
  }, [pesoOuroReal, outrosPesosNum, metalExternoNum]);

  // Total Metal = mesma fórmula do card: metal_liquido (resumo ao vivo) + dist_ouro_real
  const totalMetal = dados
    ? Math.round((dados.metal_liquido + dados.dist_ouro_real) * 1000) / 1000
    : 0;

  const preview = useMemo(() => {
    if (!dados || pesoOuroReal === null) return null;
    const semOuro   = totalMetal === 0;
    const resultado = semOuro ? 0 : totalMetal - pesoOuroReal;
    const pct       = semOuro ? 0 : (resultado / totalMetal) * 100;
    return {
      semOuro,
      resultado: Math.round(resultado * 1000) / 1000,
      pct:       Math.round(pct * 100) / 100,
    };
  }, [dados, pesoOuroReal, totalMetal]);

  // ── Foto e IA ──
  const validarComIA = useCallback(async (file: File, valor: number) => {
    setValidando(true);
    setValidacaoIA(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("peso", String(valor));
    const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd });
    const result: ValidacaoIA = await res.json();
    setValidacaoIA(result);
    setValidando(false);
  }, []);

  const handleFoto = useCallback(
    async (file: File) => {
      setFotoFile(file);
      setFotoPreview(URL.createObjectURL(file));
      setValidacaoIA(null);
      const num = parseFloat(pesoBruto);
      if (!isNaN(num) && num > 0) await validarComIA(file, num);
    },
    [pesoBruto, validarComIA],
  );

  const handleRevalidar = useCallback(() => {
    if (!fotoFile) return;
    const num = parseFloat(pesoBruto);
    if (!isNaN(num) && num > 0) validarComIA(fotoFile, num);
  }, [fotoFile, pesoBruto, validarComIA]);

  // ── Reset ──
  function resetForm() {
    setPesoBruto("");
    setOutrosPesos("");
    setOutros([]);
    setPesoOutros({});
    setQtdPedras({});
    setPesoGPedras({});
    setMetalExterno(String(pesoMetalExterno ?? 0));
    setFotoFile(null);
    setFotoPreview(null);
    setValidacaoIA(null);
    setValidando(false);
    setError("");
    setSuccess(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  // ── Submit ──
  async function handleSubmit() {
    setError("");

    if (!dados) { setError("Dados do PCP não carregados."); return; }
    if (isNaN(pesoBrutoNum) || pesoBrutoNum <= 0) {
      setError("Informe o peso bruto (maior que zero).");
      return;
    }
    if (!fotoFile) { setError("Foto da balança é obrigatória."); return; }
    if (!validacaoIA?.match) {
      setError("O peso precisa ser confirmado pela IA antes de salvar.");
      return;
    }
    if (pesoOuroReal !== null && pesoOuroReal < 0) {
      setError("Peso das pedras excede o peso bruto. Revise as quantidades.");
      return;
    }

    setLoading(true);

    // Upload foto para Storage
    let fotoPath: string | null = null;
    const ext = fotoFile.name.split(".").pop() ?? "jpg";
    const path = `saida-pcp/${Date.now()}-pcp${pcpId}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("apontamento-fotos")
      .upload(path, fotoFile, { contentType: fotoFile.type });

    if (uploadError) {
      setError("Erro ao enviar foto: " + uploadError.message);
      setLoading(false);
      return;
    }
    fotoPath = path;

    // Montar lista de pedras utilizadas (ct-based)
    const pedras_utilizadas = pedras
      .map((p) => {
        const gStr = pesoGPedras[p.insumo_id];
        const pesoG = gStr !== undefined ? (parseFloat(gStr) || 0) : 0;
        const peso_ct_utilizado = gramasToCt(pesoG);
        return {
          insumo_id: p.insumo_id,
          peso_ct_utilizado,
          // backward compat
          qtd_utilizada: parseInt(qtdPedras[p.insumo_id] ?? "0") || 0,
        };
      })
      .filter((p) => p.peso_ct_utilizado > 0);

    // Chamar API de saída
    const res = await fetch("/api/pcp/saida", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pcp_id:           pcpId,
        peso_bruto:       pesoBrutoNum,
        pedras_utilizadas,
        peso_outros:      outrosPesosNum,
        metal_externo:    metalExternoNum,
        foto_balanca:     fotoPath,
        user_id:          null,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Erro ao registrar saída.");
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      resetForm();
      onSuccess?.();
      onClose();
    }, 1800);
  }

  if (!isOpen) return null;

  const pctColor   = preview
    ? (preview.semOuro ? "#059669" : preview.resultado < 0 ? "#059669" : quebraColor(Math.abs(preview.pct)))
    : "#9CA3AF";
  const fotoOk     = validacaoIA?.match === true;
  const podeSalvar = !loading && !success && !isNaN(pesoBrutoNum) && pesoBrutoNum > 0 && fotoOk;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-2xl md:rounded-2xl shadow-2xl md:max-w-lg md:mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <div>
            <h3 className="text-lg font-semibold" style={{ color: "#111827" }}>
              Saída do PCP
            </h3>
            <p className="text-[12px] mt-0.5" style={{ color: "#9CA3AF" }}>
              PCP #{pcpId} · Ordem #{ordemId}
              {dados?.deposito_nome ? ` · ${dados.deposito_nome}` : ""}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-gray-100"
          >
            <X size={17} style={{ color: "#9CA3AF" }} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-4">
          {loadingDados ? (
            <div className="flex items-center justify-center py-8" style={{ color: C.sage }}>
              <Loader2 size={18} className="animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <>
              {/* ── Total Metal com o operador (read-only) ── */}
              {dados && (
                <div
                  className="rounded-lg px-4 py-3"
                  style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#9CA3AF" }}>
                    Ouro com o Operador
                  </p>
                  <p className="font-mono font-bold text-2xl" style={{ color: C.esmeralda }}>
                    {formatPeso(totalMetal)}g
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>
                    lote: {formatPeso(dados.dist_ouro_real)}g
                    {dados.metal_liquido !== 0
                      ? ` · PCP: ${formatPeso(dados.metal_liquido)}g`
                      : ""}
                  </p>
                </div>
              )}

              {/* ── Peso Bruto + foto ── */}
              <div>
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: "#6B7280" }}
                >
                  Peso Bruto da Peça (gramas) <span style={{ color: "#EF4444" }}>*</span>
                </label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={pesoBruto}
                  onChange={(e) => { setPesoBruto(e.target.value); setError(""); }}
                  placeholder="0.000"
                  className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none"
                  style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                  autoFocus
                />
              </div>

              {/* ── Foto da Balança + IA ── */}
              <div className="space-y-3">
                <label
                  className="block text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "#6B7280" }}
                >
                  Foto da Balança <span style={{ color: "#EF4444" }}>*</span>
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFoto(file);
                    e.target.value = "";
                  }}
                />

                {!fotoPreview ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed transition-colors"
                    style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}
                  >
                    <Camera size={28} style={{ color: C.sage }} />
                    <span className="text-[13px]">Tirar foto da balança</span>
                    <span className="text-[11px]">Câmera ou galeria</span>
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="relative rounded-xl overflow-hidden" style={{ height: 160 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fotoPreview} alt="Foto balança" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
                        style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
                      >
                        <RefreshCw size={11} /> Trocar foto
                      </button>
                    </div>

                    {validando && (
                      <div
                        className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                        style={{ backgroundColor: "#EFF6FF", color: "#2563EB" }}
                      >
                        <Loader2 size={14} className="animate-spin shrink-0" />
                        Analisando peso na balança...
                      </div>
                    )}

                    {!validando && validacaoIA && (
                      <div
                        className="px-3 py-2.5 rounded-lg text-[13px]"
                        style={
                          validacaoIA.match
                            ? { backgroundColor: "#ECFDF5", color: "#065F46" }
                            : { backgroundColor: "#FEF2F2", color: "#991B1B" }
                        }
                      >
                        <div className="flex items-center gap-2 font-semibold mb-0.5">
                          {validacaoIA.match ? (
                            <><CheckCircle size={14} className="shrink-0" />{validacaoIA.mensagem}</>
                          ) : (
                            <><AlertCircle size={14} className="shrink-0" />{validacaoIA.mensagem}</>
                          )}
                        </div>
                        <span className="text-[11px] opacity-70">Confiança: {validacaoIA.confianca}</span>
                      </div>
                    )}

                    {!validando && !validacaoIA && fotoFile && (
                      <button
                        type="button"
                        onClick={handleRevalidar}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[13px] font-semibold border transition-colors"
                        style={{ borderColor: C.cremeBorder, color: C.esmeralda }}
                      >
                        <RefreshCw size={13} /> Validar com IA
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Pedras disponíveis ── */}
              {pedras.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
                    Pedras utilizadas na peça
                  </p>
                  <div className="space-y-2">
                    {pedras.map((p) => {
                      const saldoCtVal = p.saldo_ct != null
                        ? Number(p.saldo_ct)
                        : gramasToCt(p.qtd_disponivel * p.peso_pedra);
                      const gInput = pesoGPedras[p.insumo_id] ?? "";
                      const ctInput = gInput && parseFloat(gInput) > 0
                        ? gramasToCt(parseFloat(gInput))
                        : null;
                      return (
                        <div
                          key={p.insumo_id}
                          className="rounded-lg px-3 py-2.5"
                          style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium truncate" style={{ color: "#111827" }}>
                                {p.insumo_nome}
                                {p.sku ? (
                                  <span className="ml-1 text-[10px]" style={{ color: "#9CA3AF" }}>({p.sku})</span>
                                ) : null}
                              </p>
                              <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                                Disp: {formatPesoCt(saldoCtVal)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={gInput}
                                onChange={(e) => {
                                  setPesoGPedras((prev) => ({ ...prev, [p.insumo_id]: e.target.value }));
                                  setError("");
                                }}
                                className="w-24 px-2 py-1.5 rounded-md border text-sm font-mono text-right focus:outline-none"
                                style={{ borderColor: C.cremeBorder }}
                                placeholder="0.00"
                              />
                              <span className="text-[11px] w-4 shrink-0" style={{ color: "#9CA3AF" }}>g</span>
                            </div>
                          </div>
                          {ctInput !== null && ctInput > 0 && (
                            <p className="text-[10px] mt-1 text-right font-medium" style={{ color: "#7C3AED" }}>
                              = {ctInput.toFixed(4)} ct
                            </p>
                          )}
                        </div>
                      );
                    })}

                    {/* Total pedras */}
                    {pesoPedrasTotal > 0 && (
                      <div className="flex justify-between text-[12px] px-1">
                        <span style={{ color: "#6B7280" }}>Total pedras</span>
                        <span className="font-mono font-semibold" style={{ color: "#7C3AED" }}>
                          {gramasToCt(pesoPedrasTotal).toFixed(4)} ct · {formatPeso(pesoPedrasTotal)}g
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Outros pesos ── */}
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
                  Outros Pesos{" "}
                  <span className="normal-case font-normal" style={{ color: "#9CA3AF" }}>
                    silicone, solda, acabamento…
                  </span>
                </p>

                {temOutrosInsumos ? (
                  // Insumos apontados neste PCP — mesma UI das pedras
                  <div className="space-y-2">
                    {outros.map((o) => (
                      <div
                        key={o.insumo_id}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                        style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium truncate" style={{ color: "#111827" }}>
                            {o.insumo_nome}
                          </p>
                          <p className="text-[10px]" style={{ color: "#9CA3AF" }}>
                            {o.categoria_nome} · apontado: {formatPeso(o.peso_total)}g
                          </p>
                        </div>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={pesoOutros[o.insumo_id] ?? "0"}
                          onChange={(e) => {
                            setPesoOutros((prev) => ({ ...prev, [o.insumo_id]: e.target.value }));
                            setError("");
                          }}
                          className="w-24 px-2 py-1.5 rounded-md border text-sm font-mono text-right focus:outline-none"
                          style={{ borderColor: C.cremeBorder }}
                        />
                        <span className="text-[11px] w-4" style={{ color: "#9CA3AF" }}>g</span>
                      </div>
                    ))}

                    {outrosPesosNum > 0 && (
                      <div className="flex justify-between text-[12px] px-1">
                        <span style={{ color: "#6B7280" }}>Total outros</span>
                        <span className="font-mono font-semibold" style={{ color: "#6B7280" }}>
                          {formatPeso(outrosPesosNum)}g
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  // Nenhum insumo apontado → campo livre
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={outrosPesos}
                    onChange={(e) => { setOutrosPesos(e.target.value); setError(""); }}
                    placeholder="0.000"
                    className="w-full px-3 py-2.5 rounded-lg border text-sm font-mono focus:outline-none"
                    style={{ borderColor: C.cremeBorder, backgroundColor: "#fff" }}
                  />
                )}
              </div>

              {/* ── Metal Externo (só exibe se a ordem tem metal do cliente) ── */}
              {(pesoMetalExterno ?? 0) > 0 && (
                <div
                  className="rounded-lg p-4 space-y-3"
                  style={{ backgroundColor: "#FFFBEB", border: "1px solid #FDE68A" }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#92400E" }}>
                      ⚠️ Metal do Cliente
                    </span>
                  </div>
                  <p className="text-[12px]" style={{ color: "#78350F" }}>
                    Esta ordem possui metal externo (ouro do cliente). Confirme o peso abaixo — será descontado do PMC mas NÃO da movimentação de estoque.
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold mb-1" style={{ color: "#92400E" }}>
                        Peso registrado na ordem
                      </p>
                      <p className="font-mono text-[13px]" style={{ color: "#92400E" }}>
                        {Number(pesoMetalExterno).toFixed(3)}g
                      </p>
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] font-semibold mb-1" style={{ color: "#92400E" }}>
                        Peso confirmado <span style={{ color: "#EF4444" }}>*</span>
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={metalExterno}
                          onChange={(e) => { setMetalExterno(e.target.value); setError(""); }}
                          className="w-full px-2 py-1.5 rounded-md border text-sm font-mono text-right focus:outline-none"
                          style={{ borderColor: "#FDE68A", backgroundColor: "#FFFEF5" }}
                        />
                        <span className="text-[11px]" style={{ color: "#92400E" }}>g</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Preview Resultado ── */}
              <div
                className="rounded-lg border overflow-hidden"
                style={{ borderColor: preview ? pctColor + "40" : C.cremeBorder }}
              >
                <div
                  className="flex items-center gap-2 px-4 py-2"
                  style={{
                    backgroundColor: preview ? pctColor + "12" : C.cremeBg,
                    borderBottom: `1px solid ${preview ? pctColor + "30" : C.cremeBorder}`,
                  }}
                >
                  <TrendingDown size={13} style={{ color: preview ? pctColor : "#9CA3AF" }} />
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: preview ? pctColor : "#9CA3AF" }}
                  >
                    Cálculo Automático
                  </span>
                </div>
                {preview ? (
                  <div className="px-4 py-3 space-y-1.5 text-[13px]">
                    {/* Bloco 1: peso_ouro_real = bruto − pedras */}
                    <div className="flex justify-between">
                      <span style={{ color: "#374151" }}>Peso bruto</span>
                      <span className="font-mono" style={{ color: C.esmeralda }}>{formatPeso(pesoBrutoNum)}g</span>
                    </div>
                    {pesoPedrasTotal > 0 && (
                      <div className="flex justify-between">
                        <span style={{ color: "#374151" }}>− Pedras</span>
                        <span className="font-mono" style={{ color: "#6B7280" }}>−{formatPeso(pesoPedrasTotal)}g</span>
                      </div>
                    )}
                    <div
                      className="flex justify-between font-semibold pt-1.5"
                      style={{ borderTop: `1px solid ${C.cremeBorder}` }}
                    >
                      <span style={{ color: "#374151" }}>Ouro real na peça</span>
                      <span className="font-mono" style={{ color: C.esmeralda }}>{formatPeso(pesoOuroReal!)}g</span>
                    </div>

                    {/* Banner de diferença vs apontamento padrão (só quando excede tolerância) */}
                    {(() => {
                      if (!apontamentoPadrao || pesoOuroReal == null) return null;
                      const esperado = apontamentoPadrao.peso_ouro_esperado;
                      const diff = pesoOuroReal - esperado;
                      if (Math.abs(diff) <= TOLERANCIA_DIFERENCA_OURO) return null;
                      const aMais = diff > 0;
                      return (
                        <div
                          className="mt-2 rounded-lg p-3 text-xs space-y-1"
                          style={{
                            backgroundColor: aMais ? "#FEF3C7" : "#FEE2E2",
                            border: `1px solid ${aMais ? "#F59E0B" : "#EF4444"}`,
                          }}
                        >
                          <p className="font-bold" style={{ color: aMais ? "#92400E" : "#991B1B" }}>
                            ⚠ Diferença em relação ao padrão {apontamentoPadrao.sku ? `(${apontamentoPadrao.sku})` : ""}
                          </p>
                          <div className="flex justify-between" style={{ color: "#374151" }}>
                            <span>Esperado (ouro)</span>
                            <span className="font-mono">{formatPeso(esperado)}g</span>
                          </div>
                          <div className="flex justify-between" style={{ color: "#374151" }}>
                            <span>Real apontado</span>
                            <span className="font-mono">{formatPeso(pesoOuroReal!)}g</span>
                          </div>
                          <div
                            className="flex justify-between font-bold pt-1"
                            style={{ borderTop: `1px solid ${aMais ? "#FBBF24" : "#FCA5A5"}`, color: aMais ? "#92400E" : "#991B1B" }}
                          >
                            <span>Diferença ({aMais ? "a mais" : "a menos"})</span>
                            <span className="font-mono">{aMais ? "+" : ""}{formatPeso(diff)}g</span>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Bloco 2: pmc = ouro_real − outros − metal_externo */}
                    {(outrosPesosNum > 0 || metalExternoNum > 0) && (
                      <>
                        {outrosPesosNum > 0 && (
                          <div className="flex justify-between">
                            <span style={{ color: "#374151" }}>− Outros</span>
                            <span className="font-mono" style={{ color: "#6B7280" }}>−{formatPeso(outrosPesosNum)}g</span>
                          </div>
                        )}
                        {metalExternoNum > 0 && (
                          <div className="flex justify-between">
                            <span style={{ color: "#374151" }}>− Metal externo</span>
                            <span className="font-mono" style={{ color: "#92400E" }}>−{formatPeso(metalExternoNum)}g</span>
                          </div>
                        )}
                        <div
                          className="flex justify-between font-semibold pt-1.5"
                          style={{ borderTop: `1px solid ${C.cremeBorder}` }}
                        >
                          <span style={{ color: "#374151" }}>PMC</span>
                          <span className="font-mono" style={{ color: C.esmeralda }}>{formatPeso(pmcPreview!)}g</span>
                        </div>
                      </>
                    )}
                    {/* Bloco 3: totalMetal − ouroReal = quebra (ou aviso sem ouro) */}
                    {preview.semOuro ? (
                      <div
                        className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] mt-1"
                        style={{ backgroundColor: "#F0FDF4", color: "#166534", border: "1px solid #BBF7D0" }}
                      >
                        <CheckCircle size={13} className="shrink-0" />
                        Sem ouro apontado — sem quebra
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between mt-1">
                          <span style={{ color: "#374151" }}>Ouro c/ operador</span>
                          <span className="font-mono" style={{ color: C.esmeralda }}>{formatPeso(totalMetal)}g</span>
                        </div>
                        <div className="flex justify-between">
                          <span style={{ color: "#374151" }}>− Ouro real</span>
                          <span className="font-mono" style={{ color: "#6B7280" }}>−{formatPeso(pesoOuroReal!)}g</span>
                        </div>
                        <div
                          className="flex justify-between font-bold text-[14px] pt-1.5"
                          style={{ borderTop: `1px solid ${C.cremeBorder}` }}
                        >
                          <span style={{ color: pctColor }}>
                            {preview.resultado > 0 ? "QUEBRA" : preview.resultado < 0 ? "SALDO" : "ZERADO"}
                          </span>
                          <span className="font-mono" style={{ color: pctColor }}>
                            {preview.resultado > 0 ? "+" : ""}{formatPeso(preview.resultado)}g
                            <span className="text-[11px] font-normal ml-1.5">
                              ({Math.abs(preview.pct).toFixed(2)}%)
                            </span>
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-center text-[12px] py-4" style={{ color: "#9CA3AF" }}>
                    Informe o peso para calcular
                  </p>
                )}
              </div>

              {/* ── Warning ── */}
              <div
                className="rounded-lg px-3 py-2.5 text-[12px]"
                style={{ backgroundColor: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}
              >
                Ao confirmar, o PCP #{pcpId} será concluído e uma auditoria financeira será criada automaticamente.
              </div>

              {/* ── Erro ── */}
              {error && (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                  style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}
                >
                  <AlertCircle size={14} className="shrink-0" />
                  {error}
                </div>
              )}

              {/* ── Sucesso ── */}
              {success && (
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-[13px]"
                  style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
                >
                  <CheckCircle size={14} className="shrink-0" />
                  Saída registrada! PCP concluído e auditoria fábrica criada.
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t sticky bottom-0 bg-white"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            onClick={handleClose}
            className="px-4 py-2 rounded-lg text-[13px] transition-colors"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!podeSalvar}
            title={!fotoOk ? "Confirme o peso com a IA antes de salvar" : undefined}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Registrando...
              </>
            ) : (
              "Registrar Saída Final"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
