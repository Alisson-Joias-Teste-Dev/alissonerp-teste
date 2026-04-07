"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, RefreshCw, Camera, CheckCircle, CheckCircle2, ArrowLeftRight,
  Package, AlertCircle, ChevronLeft, X, Plus, Trash2,
  Gem, Scale,
} from "lucide-react";
import ServiceCamera from "@/components/service/ServiceCamera";
import { useGlobalError } from "@/stores/errorStore";
import { S } from "@/components/layout/ServiceLayout";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ProtocoloPendente {
  id: number;
  created_at: string;
  foto_criacao: string | null;
  ordens: OrdemServico[];
}

interface OrdemServico {
  ordem_id: number;
  numero_ordem: string | null;
  tipo_ordem: string;
  peso_peca_servico: number | null;
  foto_peca_servico: string | null;
  detalhes_ordem: string | null;
  cliente_nome: string | null;
}

interface ServicoMeu {
  id: number;
  ordem_id: number;
  pcp_id: number | null;
  operador_id: number;
  tentativa: number;
  peso_entrada: number;
  peso_saida: number | null;
  status: string;
  foto_recebimento: string | null;
  foto_conclusao: string | null;
  recebido_em: string | null;
  created_at: string;
  numero_ordem: string | null;
  tipo_ordem: string;
  detalhes_ordem: string | null;
  foto_peca_servico: string | null;
  peso_peca_servico: number | null;
  cliente_nome: string | null;
  motivo_reprovacao_anterior: string | null;
  foto_reprovacao_anterior: string | null;
  transferencia_service_id: number | null;
  deposito_origem_nome: string | null;
}

interface InsumoOpcao {
  id: number;
  insumo_nome: string;
  unidade: string;
}

interface PedraSelecionada {
  insumo_id: number;
  nome: string;
  qtd: number;
  peso_unitario: number;
  peso_total: number;
  origem: "estoque" | "cliente";
}

interface Deposito {
  id: number;
  nome: string;
  qtd_servicos?: number;
}

interface ServicoConcluido {
  id: number;
  ordem_id: number;
  tentativa: number;
  peso_entrada: number;
  peso_saida: number | null;
  usou_solda: boolean | null;
  consumo_solda: number | null;
  colocou_pedra: boolean | null;
  concluido_em: string | null;
  numero_ordem: string | null;
  tipo_ordem: string;
  detalhes_ordem: string | null;
  foto_peca_servico: string | null;
}

interface PedraDetalhe {
  insumo_id: number;
  nome?: string;
  qtd: number;
  peso_unitario: number;
  peso_total: number;
  origem: string;
}

interface ValidacaoIA {
  peso_digitado: number;
  peso_balanca: number | null;
  confianca: string;
  match: boolean;
  mensagem: string;
}

interface ServicoDetalhe extends ServicoConcluido {
  peso_fio_antes: number | null;
  peso_fio_depois: number | null;
  pedras_colocadas: PedraDetalhe[];
  foto_recebimento: string | null;
  foto_conclusao: string | null;
  foto_fio_solda: string | null;
  recebido_em: string | null;
  cliente_nome: string | null;
  operador_nome: string | null;
}

type View     = "meus" | "receber" | "concluidos" | "concluir" | "devolver" | "transferir" | "transferir-fabrica" | "camera";
type CameraCtx = "receber" | "peca" | "fio";
type Periodo   = "hoje" | "semana" | "mes";

// ── Helpers visuais ───────────────────────────────────────────────────────────
function TipoBadge({ tipo }: { tipo: string }) {
  const isGarantia = tipo === "garantia";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
      style={
        isGarantia
          ? { backgroundColor: "rgba(55,138,221,0.15)", color: "#85B7EB" }
          : { backgroundColor: "rgba(212,175,55,0.15)", color: S.gold }
      }
    >
      {isGarantia ? "Garantia" : "Serviço"}
    </span>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}`, ...style }}
    >
      {children}
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "green", className = "" }: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "green" | "blue" | "outline-blue" | "gold" | "ghost";
  className?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    green:       { backgroundColor: S.btnGreen,  color: "#fff"   },
    blue:        { backgroundColor: S.btnBlue,   color: "#fff"   },
    "outline-blue": { backgroundColor: "rgba(55,138,221,0.12)", border: "1px solid rgba(55,138,221,0.35)", color: "#85B7EB" },
    gold:        { backgroundColor: S.gold,      color: "#1a1a1a" },
    ghost:       { backgroundColor: "rgba(255,255,255,0.06)", color: S.textMuted },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center gap-2 rounded-xl font-semibold text-sm transition-all active:scale-[0.97] disabled:opacity-35 ${className}`}
      style={styles[variant]}
    >
      {children}
    </button>
  );
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div
      className="fixed bottom-8 left-4 right-4 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3.5 shadow-2xl"
      style={{ backgroundColor: ok ? "#1D9E75" : "#DC2626", color: "#fff" }}
    >
      {ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      <span className="text-sm font-medium">{msg}</span>
    </div>
  );
}

// ── SaldoBar fixa no bottom ───────────────────────────────────────────────────
function SaldoBar({ saldo }: { saldo: number | null }) {
  if (saldo === null) return null;
  const pct = Math.min(100, Math.max(0, (saldo / 10) * 100)); // referência: 10g = 100%
  const isOk  = pct > 30;
  const isLow = pct <= 15;
  const gradient = isOk
    ? "linear-gradient(90deg, #1D9E75, #5DCAA5)"
    : "linear-gradient(90deg, #D85A30, #EF9F27)";

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-30 px-4 pt-2.5"
      style={{
        backgroundColor: "rgba(24,64,54,0.97)",
        borderTop: `1px solid ${S.border}`,
        paddingBottom: "calc(10px + env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: S.textFaint }}>
          Saldo aditivo
        </span>
        <span
          className="text-[12px] font-semibold"
          style={{ color: isLow ? "#EF9F27" : S.textMuted }}
        >
          {saldo.toFixed(3)}g
          {isLow && <span className="ml-1.5 text-[9px] font-bold text-amber-400">⚠ BAIXO</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: gradient }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function ServiceApp() {
  const supabase = createClient();
  const { pushError } = useGlobalError();

  // ── Views e estado de navegação ───────────────────────────────────────────
  const [view,       setView]       = useState<View>("meus");
  const [cameraCtx,  setCameraCtx]  = useState<CameraCtx>("receber");
  const prevView = useRef<View>("meus");
  const [modoFinalizar, setModoFinalizar] = useState<"concluir" | "devolver">("concluir");

  // ── Dados ─────────────────────────────────────────────────────────────────
  const [pendentes,    setPendentes]    = useState<ProtocoloPendente[]>([]);
  const [meus,         setMeus]         = useState<ServicoMeu[]>([]);
  const [concluidos,   setConcluidos]   = useState<ServicoConcluido[]>([]);
  const [saldoSolda,   setSaldoSolda]   = useState<number | null>(null);
  const [depositos,    setDepositos]    = useState<Deposito[]>([]);
  const [insumoPedras, setInsumoPedras] = useState<InsumoOpcao[]>([]);
  const [periodo,      setPeriodo]      = useState<Periodo>("mes");
  const [servicoDetalhe, setServicoDetalhe] = useState<ServicoDetalhe | null>(null);
  const [loadingDetalhe, setLoadingDetalhe] = useState(false);
  const [zoomFoto,       setZoomFoto]       = useState<string | null>(null);

  // Drawer: detalhe da ordem (para operador ver info da ordem)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ordemDetalhe, setOrdemDetalhe] = useState<Record<string, any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ordemItens, setOrdemItens]     = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ordemTipos, setOrdemTipos]     = useState<any[]>([]);
  const [loadingOrdem, setLoadingOrdem] = useState(false);

  // ── Carregamentos ─────────────────────────────────────────────────────────
  const [loadingPend,  setLoadingPend]  = useState(false);
  const [loadingMeus,  setLoadingMeus]  = useState(false);
  const [loadingConc,  setLoadingConc]  = useState(false);
  const [loadingDep,   setLoadingDep]   = useState(false);
  const [processando,  setProcessando]  = useState(false);

  // ── Toast (com cleanup para evitar memory leak) ────────────────────────────
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, ok = true) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, ok });
    toastTimerRef.current = setTimeout(() => { setToast(null); toastTimerRef.current = null; }, 3000);
  }
  useEffect(() => { return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }; }, []);

  // ── Receber: protocolo selecionado + foto ─────────────────────────────────
  const [protocoloReceber, setProtocoloReceber] = useState<ProtocoloPendente | null>(null);
  const [fotoReceber,      setFotoReceber]      = useState<string | null>(null);
  const [previewReceber,   setPreviewReceber]   = useState<string | null>(null);

  // ── Concluir: serviço ativo + multi-step ─────────────────────────────────
  const [servicoConcluindo, setServicoConcluindo] = useState<ServicoMeu | null>(null);
  const [step,               setStep]             = useState(1);
  const [usouSolda,          setUsouSolda]        = useState<boolean | null>(null);
  const [pesoSaida,          setPesoSaida]        = useState("");
  const [fotoPecaB64,        setFotoPecaB64]      = useState<string | null>(null);
  const [fotoPecaPreview,    setFotoPecaPreview]  = useState<string | null>(null);
  const [pesoFioDepois,      setPesoFioDepois]    = useState("");
  const [fotoFioB64,         setFotoFioB64]       = useState<string | null>(null);
  const [fotoFioPreview,     setFotoFioPreview]   = useState<string | null>(null);
  const [colouPedra,         setColouPedra]       = useState<boolean | null>(null);
  const [pedras,             setPedras]           = useState<PedraSelecionada[]>([]);
  const [buscarPedra,        setBuscarPedra]      = useState("");
  const [validacaoPeca,      setValidacaoPeca]    = useState<ValidacaoIA | null>(null);
  const [validandoPeca,      setValidandoPeca]    = useState(false);
  const [validacaoFio,       setValidacaoFio]     = useState<ValidacaoIA | null>(null);
  const [validandoFio,       setValidandoFio]     = useState(false);
  const [pedrasDropdown,     setPedrasDropdown]   = useState(false);

  // ── Transferir (entre operadores service) ─────────────────────────────────
  const [servicoTransf,  setServicoTransf]   = useState<ServicoMeu | null>(null);
  const [destDepositoId, setDestDepositoId]  = useState<number | null>(null);

  // ── Transferir p/ Fábrica ────────────────────────────────────────────────
  const [depositosFabrica, setDepositosFabrica] = useState<Deposito[]>([]);
  const [transportadores, setTransportadores]   = useState<{id: string; nome: string}[]>([]);
  const [destFabricaId, setDestFabricaId]       = useState<number | null>(null);
  const [transportadorId, setTransportadorId]   = useState<string>("");
  const [loadingFabrica, setLoadingFabrica]     = useState(false);

  // ── Carregar dados ────────────────────────────────────────────────────────
  const fetchPendentes = useCallback(async () => {
    setLoadingPend(true);
    const res  = await fetch("/api/service/pendentes").catch(() => null);
    const data = res?.ok ? await res.json().catch(() => ({})) : {};
    setPendentes(data.protocolos ?? []);
    setLoadingPend(false);
  }, []);

  const fetchMeus = useCallback(async () => {
    setLoadingMeus(true);
    const res  = await fetch("/api/service/meus").catch(() => null);
    const data = res?.ok ? await res.json().catch(() => ({})) : {};
    setMeus(data.servicos ?? []);
    setLoadingMeus(false);
  }, []);

  const fetchSaldo = useCallback(async () => {
    const res  = await fetch("/api/service/aditivo-saldo").catch(() => null);
    const data = res?.ok ? await res.json().catch(() => null) : null;
    if (data?.saldo != null) setSaldoSolda(data.saldo);
  }, []);

  const fetchDepositos = useCallback(async () => {
    setLoadingDep(true);
    const res  = await fetch("/api/service/operadores").catch(() => null);
    const data = res?.ok ? await res.json().catch(() => []) : [];
    setDepositos(Array.isArray(data) ? data : []);
    setLoadingDep(false);
  }, []);

  const abrirDetalhe = useCallback(async (id: number) => {
    setLoadingDetalhe(true);
    setServicoDetalhe(null);
    const res  = await fetch(`/api/service/${id}`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => ({})) : {};
    if (data.servico) setServicoDetalhe(data.servico as ServicoDetalhe);
    setLoadingDetalhe(false);
  }, []);

  const abrirOrdemDetalhe = useCallback(async (servicoId: number) => {
    setLoadingOrdem(true);
    setOrdemDetalhe(null);
    setOrdemItens([]);
    setOrdemTipos([]);
    const res  = await fetch(`/api/service/${servicoId}`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => ({})) : {};
    if (data.servico) {
      setOrdemDetalhe(data.servico);
      setOrdemItens(data.itens ?? []);
      setOrdemTipos(data.tipos_servico ?? []);
    }
    setLoadingOrdem(false);
  }, []);

  const fetchConcluidos = useCallback(async (per: Periodo = "mes") => {
    setLoadingConc(true);
    const hoje = new Date();
    const fim  = hoje.toISOString().split("T")[0];
    let inicio: string;
    if (per === "hoje") {
      inicio = fim;
    } else if (per === "semana") {
      const d = new Date(hoje); d.setDate(d.getDate() - 7);
      inicio = d.toISOString().split("T")[0];
    } else {
      const d = new Date(hoje); d.setDate(d.getDate() - 30);
      inicio = d.toISOString().split("T")[0];
    }
    const res  = await fetch(`/api/service/concluidos?inicio=${inicio}&fim=${fim}`).catch(() => null);
    const data = res?.ok ? await res.json().catch(() => ({})) : {};
    setConcluidos(data.servicos ?? []);
    setLoadingConc(false);
  }, []);

  const fetchInsumoPedras = useCallback(async () => {
    if (insumoPedras.length > 0) return;
    const res  = await fetch("/api/insumos?categoria_id=2").catch(() => null);
    const data = res?.ok ? await res.json().catch(() => []) : [];
    setInsumoPedras(Array.isArray(data) ? data : []);
  }, [insumoPedras.length]);

  // ── Mount + realtime ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchMeus();
    fetchSaldo();
    fetchPendentes();
  }, [fetchMeus, fetchSaldo, fetchPendentes]);

  useEffect(() => {
    const channel = supabase
      .channel("service-changes")
      .on("postgres_changes", { event: "*", schema: "alissonerp", table: "servicos" }, () => {
        fetchMeus();
        fetchSaldo();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "alissonerp", table: "protocolos" }, () => {
        fetchPendentes();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, fetchMeus, fetchSaldo, fetchPendentes]);

  // ── Consumo de aditivo calculado (live) ─────────────────────────────────────
  const consumoSoldaCalc = (() => {
    if (!usouSolda || saldoSolda === null || !pesoFioDepois) return null;
    const depois = parseFloat(pesoFioDepois);
    if (isNaN(depois)) return null;
    return parseFloat((saldoSolda - depois).toFixed(4));
  })();

  // ── Abrir câmera ──────────────────────────────────────────────────────────
  function abrirCamera(ctx: CameraCtx, fromView: View) {
    prevView.current = fromView;
    setCameraCtx(ctx);
    setView("camera");
  }

  // ── Handlers câmera ───────────────────────────────────────────────────────
  function onCaptureCamera(base64: string, preview: string) {
    if (cameraCtx === "receber") {
      setFotoReceber(base64);
      setPreviewReceber(preview);
    } else if (cameraCtx === "peca") {
      setFotoPecaB64(base64);
      setFotoPecaPreview(preview);
      chamarValidarPesoIA(base64, pesoSaida, setValidandoPeca, setValidacaoPeca);
    } else if (cameraCtx === "fio") {
      setFotoFioB64(base64);
      setFotoFioPreview(preview);
      chamarValidarPesoIA(base64, pesoFioDepois, setValidandoFio, setValidacaoFio);
    }
    setView(prevView.current);
  }

  // ── AÇÃO: Receber protocolo ───────────────────────────────────────────────
  async function handleReceber() {
    if (!protocoloReceber || !fotoReceber) return;
    setProcessando(true);
    let res: Response | null = null;
    try {
      res = await fetch("/api/service/receber", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ protocolo_id: protocoloReceber.id, foto_base64: fotoReceber }),
      });
    } catch {
      setProcessando(false);
      const msg = "Sem conexão com o servidor. Verifique sua internet.";
      showToast(msg, false);
      pushError("Falha ao receber peça", msg);
      return;
    }
    const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
    setProcessando(false);
    if (!res.ok) {
      const msg = data?.error ?? "Erro ao receber peça";
      showToast(msg, false);
      pushError("Falha ao receber peça", msg);
      return;
    }
    showToast("Peça recebida com sucesso!");
    setProtocoloReceber(null);
    setFotoReceber(null);
    setPreviewReceber(null);
    fetchPendentes();
    fetchMeus();
    setView("meus");
  }

  // ── AÇÃO: Confirmar conclusão ─────────────────────────────────────────────
  async function handleConcluir() {
    if (!servicoConcluindo) return;
    if (!fotoPecaB64) { showToast("Foto da peça obrigatória", false); return; }
    if (!pesoSaida)   { showToast("Informe o peso de saída", false); return; }
    setProcessando(true);

    const body: Record<string, unknown> = {
      peso_saida:       parseFloat(pesoSaida),
      foto_peca_base64: fotoPecaB64,
      usou_solda:       usouSolda ?? false,
      colocou_pedra:    colouPedra ?? false,
      pedras_colocadas: pedras,
    };
    if (usouSolda && fotoFioB64 && pesoFioDepois) {
      body.foto_fio_base64 = fotoFioB64;
      body.peso_fio_depois = parseFloat(pesoFioDepois);
    }

    let res: Response | null = null;
    try {
      res = await fetch(`/api/service/${servicoConcluindo.id}/concluir`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
    } catch {
      setProcessando(false);
      const msg = "Sem conexão com o servidor. Verifique sua internet.";
      showToast(msg, false);
      pushError("Falha ao concluir serviço", msg);
      return;
    }
    const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
    setProcessando(false);
    if (!res.ok) {
      const msg = data?.error ?? "Erro ao concluir serviço";
      showToast(msg, false);
      pushError("Falha ao concluir serviço", msg);
      return;
    }
    showToast("Serviço concluído!");
    resetConcluir();
    fetchMeus();
    fetchSaldo();
    setView("meus");
  }

  function resetConcluir() {
    setServicoConcluindo(null);
    setStep(1);
    setUsouSolda(null);
    setPesoSaida("");
    setFotoPecaB64(null);
    setFotoPecaPreview(null);
    setPesoFioDepois("");
    setFotoFioB64(null);
    setFotoFioPreview(null);
    setColouPedra(null);
    setPedras([]);
    setValidacaoPeca(null);
    setValidandoPeca(false);
    setValidacaoFio(null);
    setValidandoFio(false);
  }

  function iniciarConcluir(svc: ServicoMeu) {
    resetConcluir();
    setModoFinalizar("concluir");
    setServicoConcluindo(svc);
    fetchInsumoPedras();
    setView("concluir");
  }

  function iniciarDevolver(svc: ServicoMeu) {
    resetConcluir();
    setModoFinalizar("devolver");
    setServicoConcluindo(svc);
    setView("devolver");
  }

  // ── AÇÃO: Confirmar devolução ─────────────────────────────────────────────
  async function handleDevolver() {
    if (!servicoConcluindo) return;
    if (!fotoPecaB64) { showToast("Foto da peça obrigatória", false); return; }
    if (!pesoSaida)   { showToast("Informe o peso de saída", false); return; }
    setProcessando(true);

    const body: Record<string, unknown> = {
      peso_saida:       parseFloat(pesoSaida),
      foto_peca_base64: fotoPecaB64,
      usou_solda:       usouSolda ?? false,
    };
    if (usouSolda && fotoFioB64 && pesoFioDepois) {
      body.foto_fio_base64 = fotoFioB64;
      body.peso_fio_depois = parseFloat(pesoFioDepois);
    }

    let res: Response | null = null;
    try {
      res = await fetch(`/api/service/${servicoConcluindo.id}/devolver`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
    } catch {
      setProcessando(false);
      const msg = "Sem conexão com o servidor. Verifique sua internet.";
      showToast(msg, false);
      pushError("Falha ao devolver peça", msg);
      return;
    }
    const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
    setProcessando(false);
    if (!res.ok) {
      const msg = data?.error ?? "Erro ao devolver peça";
      showToast(msg, false);
      pushError("Falha ao devolver peça", msg);
      return;
    }
    showToast("Peca devolvida. Protocolo volta criado.");
    resetConcluir();
    fetchMeus();
    fetchSaldo();
    setView("meus");
  }

  // ── AÇÃO: Transferir ─────────────────────────────────────────────────────
  async function handleTransferir() {
    if (!servicoTransf || !destDepositoId) return;
    setProcessando(true);
    let res: Response | null = null;
    try {
      res = await fetch(`/api/service/${servicoTransf.id}/transferir`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ deposito_destino_id: destDepositoId }),
      });
    } catch {
      setProcessando(false);
      const msg = "Sem conexão com o servidor. Verifique sua internet.";
      showToast(msg, false);
      pushError("Falha ao transferir serviço", msg);
      return;
    }
    const data = res.ok ? await res.json().catch(() => ({})) : await res.json().catch(() => ({}));
    setProcessando(false);
    if (!res.ok) {
      const msg = data?.error ?? "Erro ao transferir serviço";
      showToast(msg, false);
      pushError("Falha ao transferir serviço", msg);
      return;
    }
    showToast("Transferido com sucesso!");
    setServicoTransf(null);
    setDestDepositoId(null);
    fetchMeus();
    setView("meus");
  }

  function abrirTransferir(svc: ServicoMeu) {
    setServicoTransf(svc);
    setDestDepositoId(null);
    fetchDepositos();
    setView("transferir");
  }

  function abrirTransferirFabrica(svc: ServicoMeu) {
    setServicoTransf(svc);
    setTransportadorId("");
    setLoadingFabrica(true);
    fetch("/api/usuarios/transportadores", { cache: "no-store" })
      .then(r => r.json())
      .then(data => { setTransportadores(Array.isArray(data) ? data : []); setLoadingFabrica(false); })
      .catch(() => setLoadingFabrica(false));
    setView("transferir-fabrica");
  }

  async function handleTransferirFabrica() {
    if (!servicoTransf) return;
    setProcessando(true);
    try {
      const res = await fetch(`/api/service/${servicoTransf.id}/transferir-fabrica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deposito_destino_id: 1, // Sempre Pote/Almoxarifado Central
          motoboy_id: transportadorId || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        pushError(d.error ?? "Erro ao transferir para fábrica");
        setProcessando(false);
        return;
      }
    } catch {
      pushError("Erro de conexão");
      setProcessando(false);
      return;
    }
    setProcessando(false);
    showToast("Transferido para fábrica!");
    setServicoTransf(null);
    setDestFabricaId(null);
    setTransportadorId("");
    fetchMeus();
    setView("meus");
  }

  // ── Filtro dropdown pedras ────────────────────────────────────────────────
  const pedrasFiltradas = insumoPedras.filter(i =>
    i.insumo_nome?.toLowerCase().includes(buscarPedra.toLowerCase())
  ).slice(0, 8);

  function adicionarPedra(insumo: InsumoOpcao) {
    setPedras(prev => [...prev, { insumo_id: insumo.id, nome: insumo.insumo_nome, qtd: 1, peso_unitario: 0, peso_total: 0, origem: "estoque" }]);
    setBuscarPedra("");
    setPedrasDropdown(false);
  }

  function updatePedra(idx: number, field: keyof PedraSelecionada, value: unknown) {
    setPedras(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const updated = { ...p, [field]: value };
      updated.peso_total = parseFloat((updated.qtd * updated.peso_unitario).toFixed(4));
      return updated;
    }));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: CÂMERA
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "camera") {
    const titulos: Record<CameraCtx, string> = {
      receber: "Foto de Recebimento",
      peca:    "Foto da Peça na Balança",
      fio:     "Foto do Aditivo na Balança",
    };
    const dicas: Record<CameraCtx, string> = {
      receber: "Fotografe a peça ao receber",
      peca:    "Enquadre o display e a peça",
      fio:     "Enquadre o display da balança",
    };
    return (
      <ServiceCamera
        titulo={titulos[cameraCtx]}
        dica={dicas[cameraCtx]}
        onCapture={onCaptureCamera}
        onCancel={() => setView(prevView.current)}
      />
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: RECEBER (protocolo selecionado)
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "receber" && protocoloReceber) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden" style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>
        {/* Sub-header */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
          <button
            onClick={() => { setProtocoloReceber(null); setFotoReceber(null); setPreviewReceber(null); setView("meus"); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: S.cardBg }}
          >
            <ChevronLeft size={18} color={S.text} />
          </button>
          <div>
            <p className="text-sm font-semibold" style={{ color: S.text }}>Protocolo #{protocoloReceber.id}</p>
            <p className="text-[10px]" style={{ color: S.textMuted }}>{protocoloReceber.ordens.length} ordem(s)</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {/* Ordens */}
          {protocoloReceber.ordens.map(o => (
            <Card key={o.ordem_id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm" style={{ color: S.text }}>{o.numero_ordem ?? `#${o.ordem_id}`}</span>
                    <TipoBadge tipo={o.tipo_ordem} />
                  </div>
                  {o.detalhes_ordem && (
                    <p className="text-xs line-clamp-2" style={{ color: S.textMuted }}>{o.detalhes_ordem}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    {o.peso_peca_servico != null && (
                      <span className="text-[11px] flex items-center gap-1" style={{ color: S.textMuted }}>
                        <Scale size={11} />{o.peso_peca_servico}g
                      </span>
                    )}
                    {o.cliente_nome && (
                      <span className="text-[11px]" style={{ color: S.textFaint }}>{o.cliente_nome}</span>
                    )}
                  </div>
                </div>
                {o.foto_peca_servico && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.foto_peca_servico} alt="peça" className="w-16 h-16 rounded-xl object-cover shrink-0" />
                )}
              </div>
            </Card>
          ))}

          {/* Foto recebimento */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>
              Foto de Recebimento <span style={{ color: "#EF4444" }}>*</span>
            </p>
            {previewReceber ? (
              <div className="relative rounded-2xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewReceber} alt="recebimento" className="w-full h-48 object-cover" />
                <button
                  onClick={() => { setFotoReceber(null); setPreviewReceber(null); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
                >
                  <RotateCcwIcon />
                </button>
              </div>
            ) : (
              <button
                onClick={() => abrirCamera("receber", "receber")}
                className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl transition-colors active:scale-[0.98]"
                style={{ height: 120, backgroundColor: S.cardBg, border: `2px dashed rgba(212,175,55,0.3)` }}
              >
                <Camera size={26} color={S.gold} />
                <span className="text-sm" style={{ color: S.textMuted }}>Tirar foto da peça</span>
              </button>
            )}
          </div>
        </div>

        {/* Botão confirmar */}
        <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 z-20"
          style={{ backgroundColor: "rgba(24,64,54,0.97)", borderTop: `1px solid ${S.border}`, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <Btn
            variant="green"
            onClick={handleReceber}
            disabled={!fotoReceber || processando}
            className="w-full h-14 text-base"
          >
            {processando ? <><Loader2 size={18} className="animate-spin" />Processando...</> : <><CheckCircle2 size={18} />Confirmar Recebimento</>}
          </Btn>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: DEVOLVER (retorna peça ao pote da fábrica)
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "devolver" && servicoConcluindo) {
    const svc = servicoConcluindo;
    const podeConfirmarDev = !!fotoPecaB64 && !!pesoSaida &&
      (usouSolda === false || (usouSolda === true && !!fotoFioB64 && !!pesoFioDepois)) &&
      (!validandoPeca) && (validacaoPeca?.match !== false) &&
      (!validandoFio) && (usouSolda !== true || validacaoFio?.match !== false);

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
          <button onClick={() => { resetConcluir(); setView("meus"); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: S.cardBg }}>
            <ChevronLeft size={18} color={S.text} />
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: S.text }}>Devolver peca</p>
            <p className="text-[10px]" style={{ color: S.textMuted }}>{svc.numero_ordem} · Ouro vai pro pote</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4" style={{ paddingBottom: "calc(90px + env(safe-area-inset-bottom))" }}>
          {/* Peso saída */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>
              Peso de saída (g) <span style={{ color: "#EF4444" }}>*</span>
            </p>
            <input
              type="number" step="0.01" min="0.01" placeholder="0.00"
              value={pesoSaida}
              onChange={e => { setPesoSaida(e.target.value); setValidacaoPeca(null); }}
              className="w-full rounded-2xl px-4 py-3.5 text-lg font-semibold focus:outline-none"
              style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}`, color: S.text }}
            />
          </div>

          {/* Foto peça */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>
              Foto da peca na balanca <span style={{ color: "#EF4444" }}>*</span>
            </p>
            {fotoPecaPreview ? (
              <div className="relative rounded-2xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoPecaPreview} alt="peca" className="w-full h-48 object-cover" />
                <button onClick={() => { setFotoPecaB64(null); setFotoPecaPreview(null); setValidacaoPeca(null); }}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                  <X size={14} color="#fff" />
                </button>
                {validandoPeca && <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}><Loader2 size={24} className="animate-spin text-white" /></div>}
              </div>
            ) : (
              <button onClick={() => abrirCamera("peca", "devolver")}
                className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl transition-colors active:scale-[0.98]"
                style={{ height: 120, backgroundColor: S.cardBg, border: `2px dashed rgba(212,175,55,0.3)` }}>
                <Camera size={26} color={S.gold} />
                <span className="text-sm" style={{ color: S.textMuted }}>Foto da peca</span>
              </button>
            )}
            {validacaoPeca && !validacaoPeca.match && (
              <p className="text-[11px] mt-1.5 px-2" style={{ color: "#EF4444" }}>{validacaoPeca.mensagem}</p>
            )}
            {validacaoPeca?.match && (
              <p className="text-[11px] mt-1.5 px-2 flex items-center gap-1" style={{ color: "#1D9E75" }}>
                <CheckCircle size={11} /> Peso confirmado: {validacaoPeca.peso_balanca?.toFixed(3)}g
              </p>
            )}
          </div>

          {/* Usou aditivo */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Usou aditivo?</p>
            <div className="flex gap-2">
              {([false, true] as const).map(v => (
                <button key={String(v)} onClick={() => setUsouSolda(v)}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold transition-all"
                  style={{ backgroundColor: usouSolda === v ? (v ? S.btnBlue : S.btnGreen) : S.cardBg, color: usouSolda === v ? "#fff" : S.textMuted, border: `1px solid ${S.border}` }}>
                  {v ? "Sim" : "Nao"}
                </button>
              ))}
            </div>
          </div>

          {/* Aditivo */}
          {usouSolda === true && (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>
                  Peso aditivo depois (g) <span style={{ color: "#EF4444" }}>*</span>
                </p>
                <input type="number" step="0.001" min="0" placeholder="0.000" value={pesoFioDepois}
                  onChange={e => { setPesoFioDepois(e.target.value); setValidacaoFio(null); }}
                  className="w-full rounded-2xl px-4 py-3 text-base font-semibold focus:outline-none"
                  style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}`, color: S.text }} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>
                  Foto aditivo <span style={{ color: "#EF4444" }}>*</span>
                </p>
                {fotoFioPreview ? (
                  <div className="relative rounded-2xl overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoFioPreview} alt="fio" className="w-full h-32 object-cover" />
                    <button onClick={() => { setFotoFioB64(null); setFotoFioPreview(null); setValidacaoFio(null); }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                      <X size={12} color="#fff" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => abrirCamera("fio", "devolver")}
                    className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl"
                    style={{ height: 90, backgroundColor: S.cardBg, border: `2px dashed rgba(212,175,55,0.3)` }}>
                    <Camera size={20} color={S.gold} />
                    <span className="text-xs" style={{ color: S.textMuted }}>Foto do fio</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 z-20"
          style={{ backgroundColor: "rgba(24,64,54,0.97)", borderTop: `1px solid ${S.border}`, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <Btn variant="gold" onClick={handleDevolver} disabled={!podeConfirmarDev || processando} className="w-full h-14 text-base">
            {processando ? <><Loader2 size={18} className="animate-spin" />Processando...</> : <><CheckCircle size={18} />Confirmar Devolucao</>}
          </Btn>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: CONCLUIR (multi-step)
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "concluir" && servicoConcluindo) {
    const svc = servicoConcluindo;

    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Sub-header */}
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
          <button
            onClick={() => { resetConcluir(); setView("meus"); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: S.cardBg }}
          >
            <ChevronLeft size={18} color={S.text} />
          </button>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: S.text }}>Concluir serviço</p>
            <p className="text-[10px]" style={{ color: S.textMuted }}>{svc.numero_ordem} · Passo {step}/5</p>
          </div>
          {/* Barra de progresso */}
          <div className="flex gap-1">
            {[1,2,3,4,5].map(s => (
              <div key={s} className="h-1.5 w-6 rounded-full transition-colors"
                style={{ backgroundColor: s <= step ? S.gold : "rgba(255,255,255,0.1)" }} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 pb-28">

          {/* STEP 1: Usou aditivo? */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <div className="text-center py-3">
                <p className="text-lg font-semibold" style={{ color: S.text }}>Usou aditivo neste serviço?</p>
                <p className="text-xs mt-1" style={{ color: S.textMuted }}>{svc.numero_ordem}</p>
              </div>
              <button
                onClick={() => setUsouSolda(true)}
                className="w-full h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.97] border-2"
                style={{
                  backgroundColor: usouSolda === true ? "rgba(29,158,117,0.18)" : S.cardBg,
                  borderColor:     usouSolda === true ? "#1D9E75" : "transparent",
                }}
              >
                <Gem size={22} color={usouSolda === true ? "#1D9E75" : S.textMuted} />
                <span className="font-semibold text-base" style={{ color: usouSolda === true ? "#1D9E75" : S.text }}>SIM — Usei aditivo</span>
              </button>
              <button
                onClick={() => setUsouSolda(false)}
                className="w-full h-20 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all active:scale-[0.97] border-2"
                style={{
                  backgroundColor: usouSolda === false ? S.cardHover : S.cardBg,
                  borderColor:     usouSolda === false ? "rgba(255,255,255,0.3)" : "transparent",
                }}
              >
                <X size={22} color={S.textMuted} />
                <span className="font-semibold text-base" style={{ color: S.text }}>NÃO — Sem aditivo</span>
              </button>
              <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 z-20"
                style={{ backgroundColor: "rgba(24,64,54,0.97)", borderTop: `1px solid ${S.border}`, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                <Btn variant="green" onClick={() => setStep(2)} disabled={usouSolda === null} className="w-full h-14 text-base">
                  Confirmar
                </Btn>
              </div>
            </div>
          )}

          {/* STEP 2: Peso da peça + foto */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-base font-semibold mb-1" style={{ color: S.text }}>Peso da peça pronta</p>
                {svc.peso_entrada != null && (
                  <p className="text-[11px] mb-3" style={{ color: S.textMuted }}>
                    Peso entrada: <span style={{ color: S.gold }}>{svc.peso_entrada}g</span>
                  </p>
                )}
                <input
                  type="number"
                  step="0.001"
                  placeholder="0.000"
                  value={pesoSaida}
                  onChange={e => { setPesoSaida(e.target.value); setValidacaoPeca(null); }}
                  className="w-full rounded-xl px-4 py-3.5 text-xl font-semibold text-center outline-none"
                  style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}`, color: S.text }}
                  inputMode="decimal"
                />
                <p className="text-[10px] mt-1 text-center" style={{ color: S.textFaint }}>gramas (g)</p>
              </div>

              {/* Foto da peça */}
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>
                  Foto na balança <span style={{ color: "#EF4444" }}>*</span>
                </p>
                {fotoPecaPreview ? (
                  <div className="relative rounded-2xl overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoPecaPreview} alt="peça" className="w-full h-44 object-cover" />
                    <button onClick={() => { setFotoPecaB64(null); setFotoPecaPreview(null); setValidacaoPeca(null); }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                      <RotateCcwIcon />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => abrirCamera("peca", "concluir")}
                    className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl active:scale-[0.98]"
                    style={{ height: 100, backgroundColor: S.cardBg, border: `2px dashed rgba(212,175,55,0.3)` }}>
                    <Camera size={24} color={S.gold} />
                    <span className="text-sm" style={{ color: S.textMuted }}>Foto na balança</span>
                  </button>
                )}
              </div>

              {/* Feedback IA — foto da peça */}
              {validandoPeca && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ backgroundColor: "rgba(212,175,55,0.08)", border: `1px solid rgba(212,175,55,0.2)` }}>
                  <Loader2 size={14} className="animate-spin shrink-0" style={{ color: S.gold }} />
                  <span style={{ color: S.gold }}>Validando peso com IA...</span>
                </div>
              )}
              {!validandoPeca && validacaoPeca && (
                <div className="px-3 py-2.5 rounded-xl text-sm" style={validacaoPeca.match ? { backgroundColor: "rgba(29,158,117,0.12)", border: "1px solid rgba(29,158,117,0.3)" } : { backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <div className="flex items-center gap-2 font-semibold mb-0.5" style={{ color: validacaoPeca.match ? "#1D9E75" : "#EF4444" }}>
                    {validacaoPeca.match ? <CheckCircle size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                    {validacaoPeca.mensagem}
                  </div>
                  <span className="text-[11px]" style={{ color: validacaoPeca.match ? "rgba(29,158,117,0.7)" : "rgba(239,68,68,0.7)" }}>
                    Confiança: {validacaoPeca.confianca}
                  </span>
                </div>
              )}
              {!validandoPeca && !validacaoPeca && fotoPecaB64 && !!pesoSaida && parseFloat(pesoSaida) > 0 && (
                <button
                  onClick={() => chamarValidarPesoIA(fotoPecaB64, pesoSaida, setValidandoPeca, setValidacaoPeca)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                  style={{ border: `1px solid ${S.border}`, color: S.gold }}
                >
                  <RefreshCw size={13} /> Validar peso com IA
                </button>
              )}

              <StepNav step={step} setStep={setStep} canAdvance={!!pesoSaida && parseFloat(pesoSaida) > 0 && !!fotoPecaB64 && validacaoPeca?.match === true} loading={validandoPeca} />
            </div>
          )}

          {/* STEP 3: Aditivo */}
          {step === 3 && (
            <div className="space-y-4">
              {!usouSolda ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <CheckCircle2 size={40} color="#1D9E75" />
                  <p className="text-sm" style={{ color: S.textMuted }}>Sem aditivo — pular para pedras</p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-base font-semibold mb-1" style={{ color: S.text }}>Peso do aditivo após serviço</p>
                    {saldoSolda != null && (
                      <p className="text-[11px] mb-3" style={{ color: S.textMuted }}>
                        Saldo atual: <span style={{ color: S.gold }}>{saldoSolda.toFixed(3)}g</span>
                      </p>
                    )}
                    <input
                      type="number" step="0.001" placeholder="0.000"
                      value={pesoFioDepois}
                      onChange={e => { setPesoFioDepois(e.target.value); setValidacaoFio(null); }}
                      className="w-full rounded-xl px-4 py-3.5 text-xl font-semibold text-center outline-none"
                      style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}`, color: S.text }}
                      inputMode="decimal"
                    />
                    {consumoSoldaCalc != null && consumoSoldaCalc >= 0 && (
                      <div className="flex items-center justify-center gap-2 mt-3 px-4 py-2.5 rounded-xl"
                        style={{ backgroundColor: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.2)" }}>
                        <Scale size={14} color={S.gold} />
                        <span className="text-sm font-semibold" style={{ color: S.gold }}>
                          Consumo: {consumoSoldaCalc.toFixed(3)}g
                        </span>
                      </div>
                    )}
                  </div>
                  {/* Foto aditivo */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>
                      Foto aditivo na balança <span style={{ color: "#EF4444" }}>*</span>
                    </p>
                    {fotoFioPreview ? (
                      <div className="relative rounded-2xl overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={fotoFioPreview} alt="fio" className="w-full h-40 object-cover" />
                        <button onClick={() => { setFotoFioB64(null); setFotoFioPreview(null); setValidacaoFio(null); }}
                          className="absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}>
                          <RotateCcwIcon />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => abrirCamera("fio", "concluir")}
                        className="w-full flex flex-col items-center justify-center gap-2 rounded-2xl active:scale-[0.98]"
                        style={{ height: 100, backgroundColor: S.cardBg, border: `2px dashed rgba(212,175,55,0.3)` }}>
                        <Camera size={24} color={S.gold} />
                        <span className="text-sm" style={{ color: S.textMuted }}>Foto aditivo na balança</span>
                      </button>
                    )}
                  </div>
                </>
              )}
              {/* Feedback IA — aditivo */}
              {usouSolda && (
                <>
                  {validandoFio && (
                    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ backgroundColor: "rgba(212,175,55,0.08)", border: `1px solid rgba(212,175,55,0.2)` }}>
                      <Loader2 size={14} className="animate-spin shrink-0" style={{ color: S.gold }} />
                      <span style={{ color: S.gold }}>Validando peso com IA...</span>
                    </div>
                  )}
                  {!validandoFio && validacaoFio && (
                    <div className="px-3 py-2.5 rounded-xl text-sm" style={validacaoFio.match ? { backgroundColor: "rgba(29,158,117,0.12)", border: "1px solid rgba(29,158,117,0.3)" } : { backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
                      <div className="flex items-center gap-2 font-semibold mb-0.5" style={{ color: validacaoFio.match ? "#1D9E75" : "#EF4444" }}>
                        {validacaoFio.match ? <CheckCircle size={14} className="shrink-0" /> : <AlertCircle size={14} className="shrink-0" />}
                        {validacaoFio.mensagem}
                      </div>
                      <span className="text-[11px]" style={{ color: validacaoFio.match ? "rgba(29,158,117,0.7)" : "rgba(239,68,68,0.7)" }}>
                        Confiança: {validacaoFio.confianca}
                      </span>
                    </div>
                  )}
                  {!validandoFio && !validacaoFio && fotoFioB64 && !!pesoFioDepois && parseFloat(pesoFioDepois) >= 0 && (
                    <button
                      onClick={() => chamarValidarPesoIA(fotoFioB64, pesoFioDepois, setValidandoFio, setValidacaoFio)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
                      style={{ border: `1px solid ${S.border}`, color: S.gold }}
                    >
                      <RefreshCw size={13} /> Validar peso com IA
                    </button>
                  )}
                </>
              )}

              <StepNav
                step={step} setStep={setStep}
                canAdvance={!usouSolda || (!!pesoFioDepois && parseFloat(pesoFioDepois) >= 0 && !!fotoFioB64 && (consumoSoldaCalc ?? -1) >= 0 && validacaoFio?.match === true)}
                loading={validandoFio}
              />
            </div>
          )}

          {/* STEP 4: Pedras */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-base font-semibold" style={{ color: S.text }}>Colocou pedra neste serviço?</p>
              <div className="flex gap-3">
                {([true, false] as const).map(v => (
                  <button key={String(v)} onClick={() => setColouPedra(v)}
                    className="flex-1 h-14 rounded-xl font-semibold text-sm transition-all border-2 active:scale-[0.97]"
                    style={{
                      backgroundColor: colouPedra === v ? (v ? "rgba(29,158,117,0.18)" : S.cardHover) : S.cardBg,
                      borderColor:     colouPedra === v ? (v ? "#1D9E75" : "rgba(255,255,255,0.25)") : "transparent",
                      color:           colouPedra === v ? (v ? "#1D9E75" : S.text) : S.textMuted,
                    }}>
                    {v ? "Sim" : "Não"}
                  </button>
                ))}
              </div>

              {colouPedra === true && (
                <div className="space-y-3 mt-2">
                  {/* Autocomplete pedras */}
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Buscar pedra..."
                      value={buscarPedra}
                      onChange={e => { setBuscarPedra(e.target.value); setPedrasDropdown(true); }}
                      onFocus={() => setPedrasDropdown(true)}
                      className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                      style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}`, color: S.text }}
                    />
                    {pedrasDropdown && pedrasFiltradas.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-20 rounded-xl mt-1 overflow-hidden"
                        style={{ backgroundColor: "#1a4a3c", border: `1px solid ${S.border}` }}>
                        {pedrasFiltradas.map(i => (
                          <button key={i.id} onClick={() => adicionarPedra(i)}
                            className="w-full px-4 py-3 text-left text-sm border-b last:border-0 active:bg-white/10"
                            style={{ borderColor: S.border, color: S.text }}>
                            {i.insumo_nome}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pedras selecionadas */}
                  {pedras.map((p, idx) => (
                    <Card key={idx}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium" style={{ color: S.text }}>{p.nome}</span>
                        <button onClick={() => setPedras(prev => prev.filter((_, i) => i !== idx))}>
                          <Trash2 size={14} color="#EF4444" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p style={{ color: S.textFaint }} className="mb-1">Qtd</p>
                          <input type="number" min="1" value={p.qtd}
                            onChange={e => updatePedra(idx, "qtd", parseInt(e.target.value) || 1)}
                            className="w-full rounded-lg px-2 py-1.5 text-sm outline-none"
                            style={{ backgroundColor: "rgba(255,255,255,0.08)", color: S.text }} />
                        </div>
                        <div>
                          <p style={{ color: S.textFaint }} className="mb-1">Peso unit. (g)</p>
                          <input type="number" step="0.001" min="0" value={p.peso_unitario || ""}
                            placeholder="0.000"
                            onChange={e => updatePedra(idx, "peso_unitario", parseFloat(e.target.value) || 0)}
                            className="w-full rounded-lg px-2 py-1.5 text-sm outline-none"
                            style={{ backgroundColor: "rgba(255,255,255,0.08)", color: S.text }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex gap-2">
                          {(["estoque", "cliente"] as const).map(orig => (
                            <button key={orig} onClick={() => updatePedra(idx, "origem", orig)}
                              className="px-2.5 py-1 rounded-lg text-[10px] font-semibold border"
                              style={{
                                backgroundColor: p.origem === orig ? "rgba(212,175,55,0.15)" : "transparent",
                                borderColor: p.origem === orig ? S.gold : "rgba(255,255,255,0.1)",
                                color: p.origem === orig ? S.gold : S.textFaint,
                              }}>
                              {orig === "estoque" ? "Estoque" : "Cliente"}
                            </button>
                          ))}
                        </div>
                        <span className="text-[11px]" style={{ color: S.textMuted }}>
                          Total: {p.peso_total.toFixed(3)}g
                        </span>
                      </div>
                    </Card>
                  ))}
                  <Btn variant="ghost" onClick={() => setPedrasDropdown(true)} className="w-full h-10 text-xs">
                    <Plus size={14} />Adicionar pedra
                  </Btn>
                </div>
              )}

              <StepNav step={step} setStep={setStep} canAdvance={colouPedra !== null} />
            </div>
          )}

          {/* STEP 5: Resumo + confirmar */}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-base font-semibold" style={{ color: S.text }}>Resumo</p>
              <Card>
                <ResumoLinha label="Ordem" value={svc.numero_ordem ?? "-"} />
                <ResumoLinha label="Peso entrada" value={`${svc.peso_entrada}g`} />
                <ResumoLinha label="Peso saída" value={`${pesoSaida}g`} highlight />
                <ResumoLinha label="Variação" value={(() => {
                  const delta = parseFloat(pesoSaida) - (svc.peso_entrada ?? 0);
                  return `${delta >= 0 ? "+" : ""}${delta.toFixed(3)}g`;
                })()} />
                <ResumoLinha label="Aditivo" value={usouSolda && consumoSoldaCalc != null ? `${consumoSoldaCalc.toFixed(3)}g consumido` : "Não usou"} />
                <ResumoLinha label="Pedras" value={pedras.length > 0 ? `${pedras.length} item(s)` : "Nenhuma"} />
              </Card>

              {pedras.length > 0 && (
                <Card>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Pedras colocadas</p>
                  {pedras.map((p, i) => (
                    <div key={i} className="flex justify-between text-xs py-1" style={{ color: S.textMuted }}>
                      <span>{p.nome} × {p.qtd}</span>
                      <span>{p.peso_total.toFixed(3)}g · {p.origem}</span>
                    </div>
                  ))}
                </Card>
              )}

              <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 z-20"
                style={{ backgroundColor: "rgba(24,64,54,0.97)", borderTop: `1px solid ${S.border}`, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                <Btn variant="green" onClick={handleConcluir} disabled={processando} className="w-full h-14 text-base">
                  {processando ? <><Loader2 size={18} className="animate-spin" />Enviando...</> : <><CheckCircle2 size={18} />Confirmar Conclusão</>}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: TRANSFERIR P/ FÁBRICA
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "transferir-fabrica" && servicoTransf) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
          <button onClick={() => { setServicoTransf(null); setView("meus"); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: S.cardBg }}>
            <ChevronLeft size={18} color={S.text} />
          </button>
          <div>
            <p className="text-sm font-semibold" style={{ color: S.text }}>Enviar p/ Fábrica</p>
            <p className="text-[10px]" style={{ color: S.textMuted }}>{servicoTransf.numero_ordem}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
          {/* Info destino fixo */}
          <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}` }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: S.textMuted }}>Destino</p>
            <p className="text-sm font-medium" style={{ color: S.text }}>Almoxarifado Central (Fábrica)</p>
          </div>

          {/* Transportador */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>
              Quem vai levar?
            </p>
            {transportadores.length === 0 ? (
              <p className="text-[11px]" style={{ color: S.textFaint }}>Nenhum transportador habilitado.</p>
            ) : (
              <div className="space-y-2">
                {transportadores.map(t => (
                  <button key={t.id} onClick={() => setTransportadorId(t.id)}
                    className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 transition-all active:scale-[0.98] border-2"
                    style={{
                      backgroundColor: transportadorId === t.id ? "rgba(55,138,221,0.1)" : S.cardBg,
                      borderColor:     transportadorId === t.id ? "#378ADD" : "transparent",
                    }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0"
                      style={{ backgroundColor: "rgba(55,138,221,0.15)", color: "#85B7EB" }}>
                      {t.nome.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium flex-1 text-left" style={{ color: S.text }}>{t.nome}</span>
                    {transportadorId === t.id && <CheckCircle2 size={16} color="#378ADD" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 z-20"
          style={{ backgroundColor: "rgba(24,64,54,0.97)", borderTop: `1px solid ${S.border}`, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <Btn variant="blue" onClick={handleTransferirFabrica}
            disabled={processando}
            className="w-full h-14 text-base">
            {processando ? <><Loader2 size={18} className="animate-spin" />Transferindo...</> : <><ArrowLeftRight size={18} />Enviar p/ Fábrica</>}
          </Btn>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW: TRANSFERIR
  // ══════════════════════════════════════════════════════════════════════════
  if (view === "transferir" && servicoTransf) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
          <button onClick={() => { setServicoTransf(null); setView("meus"); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: S.cardBg }}>
            <ChevronLeft size={18} color={S.text} />
          </button>
          <div>
            <p className="text-sm font-semibold" style={{ color: S.text }}>Transferir serviço</p>
            <p className="text-[10px]" style={{ color: S.textMuted }}>{servicoTransf.numero_ordem}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 pb-28">
          <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: S.textMuted }}>
            Selecionar operador de destino
          </p>
          {loadingDep ? (
            <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin" style={{ color: S.textMuted }} /></div>
          ) : depositos.filter(d => d.id !== servicoTransf.operador_id).map(d => (
            <button key={d.id} onClick={() => setDestDepositoId(d.id)}
              className="w-full flex items-center gap-3 rounded-2xl px-4 py-4 transition-all active:scale-[0.98] border-2"
              style={{
                backgroundColor: destDepositoId === d.id ? "rgba(55,138,221,0.1)" : S.cardBg,
                borderColor:     destDepositoId === d.id ? "#378ADD" : "transparent",
              }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                style={{ backgroundColor: "rgba(212,175,55,0.15)", color: S.gold }}>
                {d.nome.slice(0, 2).toUpperCase()}
              </div>
              <span className="text-sm font-medium flex-1 text-left" style={{ color: S.text }}>{d.nome}</span>
              {destDepositoId === d.id && <CheckCircle2 size={18} color="#378ADD" />}
            </button>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 px-4 pt-3 z-20"
          style={{ backgroundColor: "rgba(24,64,54,0.97)", borderTop: `1px solid ${S.border}`, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
          <Btn variant="blue" onClick={handleTransferir} disabled={!destDepositoId || processando} className="w-full h-14 text-base">
            {processando ? <><Loader2 size={18} className="animate-spin" />Transferindo...</> : <><ArrowLeftRight size={18} />Transferir</>}
          </Btn>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VIEW PRINCIPAL: MEUS SERVIÇOS (default)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom))" }}>

      {/* Tabs MEUS / RECEBER / CONCLUÍDOS */}
      <div className="flex gap-1.5 px-4 py-3 shrink-0">
        {([
          { v: "meus",      label: "Meus",     count: meus.length },
          { v: "receber",   label: "Receber",  count: pendentes.length },
          { v: "concluidos",label: "Histórico", count: 0 },
        ] as const).map(({ v, label, count }) => {
          const active = view === v;
          return (
            <button key={v} onClick={() => {
              if (v === "receber")   fetchPendentes();
              if (v === "concluidos") fetchConcluidos(periodo);
              setView(v);
            }}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl h-11 text-xs font-semibold transition-all border"
              style={{
                backgroundColor: active ? S.cardHover : "transparent",
                borderColor:     active ? S.gold : "transparent",
                color:           active ? S.gold : S.textMuted,
              }}>
              {label}
              {count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                  style={{ backgroundColor: "rgba(212,175,55,0.15)", color: S.gold }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <button onClick={() => {
          fetchMeus(); fetchPendentes(); fetchSaldo();
          if (view === "concluidos") fetchConcluidos(periodo);
        }}
          disabled={loadingMeus || loadingPend || loadingConc}
          className="w-11 h-11 rounded-xl flex items-center justify-center border disabled:opacity-40"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <RefreshCw size={14} color={S.textMuted} className={(loadingMeus || loadingPend || loadingConc) ? "animate-spin" : ""} />
        </button>
      </div>

      {/* ── LISTA: RECEBER ──────────────────────────────────────────────────── */}
      {view === "receber" && (
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
          {loadingPend ? (
            <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin" style={{ color: S.textMuted }} /></div>
          ) : pendentes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Package size={40} color="rgba(255,255,255,0.15)" />
              <p className="text-sm" style={{ color: S.textMuted }}>Nenhum protocolo aguardando</p>
            </div>
          ) : pendentes.map(p => (
            <Card key={p.id}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold" style={{ color: S.textMuted }}>Protocolo #{p.id}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(55,138,221,0.15)", color: "#85B7EB" }}>
                  {p.ordens.length} ordem(s)
                </span>
              </div>
              {p.ordens.slice(0, 2).map(o => (
                <div key={o.ordem_id} className="flex items-center gap-2 mb-1.5">
                  <TipoBadge tipo={o.tipo_ordem} />
                  <span className="text-sm font-medium" style={{ color: S.text }}>{o.numero_ordem ?? `#${o.ordem_id}`}</span>
                  {o.peso_peca_servico != null && (
                    <span className="text-[10px] ml-auto" style={{ color: S.textFaint }}>{o.peso_peca_servico}g</span>
                  )}
                </div>
              ))}
              {p.ordens.length > 2 && (
                <p className="text-[10px] mt-1" style={{ color: S.textFaint }}>+{p.ordens.length - 2} mais</p>
              )}
              <div className="mt-3">
                <Btn variant="blue" onClick={() => { setProtocoloReceber(p); setView("receber"); }}
                  className="w-full h-12">
                  <Camera size={16} />Receber peça
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── LISTA: CONCLUÍDOS ───────────────────────────────────────────────── */}
      {view === "concluidos" && (
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {/* Pills de período */}
          <div className="flex gap-2 pt-3 pb-1 sticky top-0 z-10" style={{ backgroundColor: "rgba(16,45,38,0.97)" }}>
            {(["hoje", "semana", "mes"] as const).map(p => (
              <button key={p}
                onClick={() => { setPeriodo(p); fetchConcluidos(p); }}
                className="flex-1 h-9 rounded-xl text-xs font-semibold transition-all border"
                style={{
                  backgroundColor: periodo === p ? "rgba(212,175,55,0.15)" : "transparent",
                  borderColor:     periodo === p ? S.gold : "rgba(255,255,255,0.08)",
                  color:           periodo === p ? S.gold : S.textMuted,
                }}>
                {p === "hoje" ? "Hoje" : p === "semana" ? "7 dias" : "30 dias"}
              </button>
            ))}
          </div>

          {loadingConc ? (
            <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin" style={{ color: S.textMuted }} /></div>
          ) : concluidos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle2 size={40} color="rgba(255,255,255,0.15)" />
              <p className="text-sm" style={{ color: S.textMuted }}>Nenhum serviço concluído no período</p>
            </div>
          ) : concluidos.map(svc => (
            <div key={svc.id}
              onClick={() => abrirDetalhe(svc.id)}
              className="rounded-2xl px-4 py-3 active:scale-[0.98] transition-transform cursor-pointer"
              style={{ backgroundColor: "rgba(255,255,255,0.04)", border: `1px solid ${S.border}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm" style={{ color: S.text }}>{svc.numero_ordem ?? `#${svc.ordem_id}`}</span>
                    <TipoBadge tipo={svc.tipo_ordem} />
                    {svc.tentativa > 1 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(55,138,221,0.2)", color: "#85B7EB" }}>
                        {svc.tentativa}ª tentativa
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="text-[11px] flex items-center gap-1" style={{ color: S.textFaint }}>
                      <Scale size={10} />{svc.peso_entrada}g → {svc.peso_saida ?? "–"}g
                    </span>
                    {svc.usou_solda && svc.consumo_solda != null && (
                      <span className="text-[11px]" style={{ color: S.textFaint }}>
                        Aditivo: {svc.consumo_solda.toFixed(3)}g
                      </span>
                    )}
                  </div>
                </div>
                {svc.concluido_em && (
                  <span className="text-[10px] shrink-0" style={{ color: S.textFaint }}>
                    {new Date(svc.concluido_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── LISTA: MEUS SERVIÇOS ────────────────────────────────────────────── */}
      {view === "meus" && (
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
          {loadingMeus ? (
            <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin" style={{ color: S.textMuted }} /></div>
          ) : meus.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle2 size={40} color="rgba(255,255,255,0.15)" />
              <p className="text-sm" style={{ color: S.textMuted }}>Nenhum serviço em andamento</p>
              <p className="text-xs text-center" style={{ color: S.textFaint }}>
                Vá em &quot;Receber peça&quot; para iniciar
              </p>
            </div>
          ) : meus.map(svc => (
            <Card key={svc.id}
              style={svc.tentativa > 1 ? { backgroundColor: "rgba(251,146,60,0.06)", borderColor: "rgba(251,146,60,0.3)" } : undefined}>
              <div className="flex items-start gap-3">
                {svc.foto_recebimento ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={svc.foto_recebimento} alt="peça" className="w-14 h-14 rounded-xl object-cover shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
                    <Package size={20} color={S.textFaint} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-sm" style={{ color: S.text }}>{svc.numero_ordem ?? `#${svc.ordem_id}`}</span>
                    <TipoBadge tipo={svc.tipo_ordem} />
                    {svc.tentativa > 1 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: "rgba(251,146,60,0.25)", color: "#EA580C" }}>
                        Retorno · {svc.tentativa}ª tentativa
                      </span>
                    )}
                  </div>
                  {/* Motivo da reprovação anterior */}
                  {svc.tentativa > 1 && svc.motivo_reprovacao_anterior && (
                    <div className="mt-1 rounded-lg px-2 py-1.5" style={{ backgroundColor: "rgba(251,146,60,0.12)", border: "1px solid rgba(251,146,60,0.3)" }}>
                      <p className="text-[10px] font-semibold" style={{ color: "#C2410C" }}>Reprovado por:</p>
                      <p className="text-[10px] line-clamp-2" style={{ color: "#EA580C" }}>{svc.motivo_reprovacao_anterior}</p>
                    </div>
                  )}
                  {svc.detalhes_ordem && (
                    <p className="text-[11px] line-clamp-1 mt-0.5" style={{ color: S.textMuted }}>{svc.detalhes_ordem}</p>
                  )}
                  {/* Badge de transferência da fábrica */}
                  {svc.transferencia_service_id && (
                    <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-semibold mt-1" style={{ backgroundColor: "rgba(168,85,247,0.15)", color: "#C084FC" }}>
                      Da fabrica{svc.deposito_origem_nome ? ` (${svc.deposito_origem_nome})` : ""}
                    </span>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] flex items-center gap-1" style={{ color: S.textFaint }}>
                      <Scale size={10} />{svc.peso_entrada}g entrada
                    </span>
                    {svc.cliente_nome && (
                      <span className="text-[10px]" style={{ color: S.textFaint }}>{svc.cliente_nome}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-2 mt-3">
                <Btn variant="green" onClick={() => iniciarConcluir(svc)} className="flex-1 h-11">
                  <CheckCircle2 size={15} />Concluido
                </Btn>
                <Btn variant="outline-blue" onClick={() => abrirTransferir(svc)} className="flex-1 h-11">
                  <ArrowLeftRight size={15} />Transferir
                </Btn>
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => abrirOrdemDetalhe(svc.id)}
                  className="flex-1 py-2 rounded-xl text-[11px] font-semibold transition-colors"
                  style={{ backgroundColor: "rgba(255,255,255,0.05)", color: S.textMuted, border: `1px solid ${S.border}` }}
                >
                  Ver ordem
                </button>
                <button
                  onClick={() => abrirTransferirFabrica(svc)}
                  className="flex-1 py-2 rounded-xl text-[11px] font-semibold transition-colors"
                  style={{ backgroundColor: "rgba(168,85,247,0.08)", color: "#C084FC", border: "1px solid rgba(168,85,247,0.3)" }}
                >
                  Enviar p/ Fábrica
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Saldo aditivo fixo */}
      <SaldoBar saldo={saldoSolda} />

      {/* Toast */}
      {toast && <Toast msg={toast.msg} ok={toast.ok} />}

      {/* ── DRAWER: Detalhe serviço concluído ──────────────────────────────── */}
      {(servicoDetalhe || loadingDetalhe) && (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: "#0d2419" }}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
            <button
              onClick={() => setServicoDetalhe(null)}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: S.cardBg }}
            >
              <ChevronLeft size={18} color={S.text} />
            </button>
            {servicoDetalhe ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-semibold text-sm truncate" style={{ color: S.text }}>
                  {servicoDetalhe.numero_ordem ?? `#${servicoDetalhe.id}`}
                </span>
                <TipoBadge tipo={servicoDetalhe.tipo_ordem} />
                {servicoDetalhe.tentativa > 1 && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ backgroundColor: "rgba(55,138,221,0.2)", color: "#85B7EB" }}>
                    {servicoDetalhe.tentativa}ª tent.
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm" style={{ color: S.textMuted }}>Carregando...</span>
            )}
          </div>

          {loadingDetalhe && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin" style={{ color: S.textMuted }} />
            </div>
          )}

          {servicoDetalhe && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>

              {/* Cliente + operador */}
              <div className="rounded-2xl px-4 py-3 space-y-1.5" style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}` }}>
                {servicoDetalhe.cliente_nome && (
                  <DetalheRow label="Cliente" value={servicoDetalhe.cliente_nome} />
                )}
                {servicoDetalhe.detalhes_ordem && (
                  <DetalheRow label="Detalhe" value={servicoDetalhe.detalhes_ordem} />
                )}
                {servicoDetalhe.operador_nome && (
                  <DetalheRow label="Operador" value={servicoDetalhe.operador_nome} />
                )}
              </div>

              {/* Pesos */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}` }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Pesos</p>
                <div className="flex items-center gap-3">
                  <div className="text-center flex-1">
                    <p className="text-[10px]" style={{ color: S.textFaint }}>Entrada</p>
                    <p className="text-lg font-bold" style={{ color: S.text }}>{servicoDetalhe.peso_entrada}g</p>
                  </div>
                  <span style={{ color: S.textFaint }}>→</span>
                  <div className="text-center flex-1">
                    <p className="text-[10px]" style={{ color: S.textFaint }}>Saída</p>
                    <p className="text-lg font-bold" style={{ color: S.gold }}>{servicoDetalhe.peso_saida ?? "–"}g</p>
                  </div>
                  {servicoDetalhe.peso_saida != null && (
                    <>
                      <span style={{ color: S.textFaint }}>→</span>
                      <div className="text-center flex-1">
                        <p className="text-[10px]" style={{ color: S.textFaint }}>Variação</p>
                        {(() => {
                          const delta = servicoDetalhe.peso_saida! - servicoDetalhe.peso_entrada;
                          const cor = delta < -0.005 ? "#EF4444" : delta > 0.005 ? "#1D9E75" : S.textMuted;
                          return <p className="text-base font-bold" style={{ color: cor }}>{delta >= 0 ? "+" : ""}{delta.toFixed(3)}g</p>;
                        })()}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Aditivo */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}` }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Aditivo</p>
                {servicoDetalhe.usou_solda ? (
                  <div className="space-y-1">
                    <DetalheRow label="Usou aditivo" value="Sim" valueColor="#1D9E75" />
                    {servicoDetalhe.consumo_solda != null && (
                      <DetalheRow label="Consumo" value={`${servicoDetalhe.consumo_solda.toFixed(3)}g`} valueColor={S.gold} />
                    )}
                    {servicoDetalhe.peso_fio_antes != null && (
                      <DetalheRow label="Aditivo antes" value={`${servicoDetalhe.peso_fio_antes}g`} />
                    )}
                    {servicoDetalhe.peso_fio_depois != null && (
                      <DetalheRow label="Aditivo depois" value={`${servicoDetalhe.peso_fio_depois}g`} />
                    )}
                  </div>
                ) : (
                  <DetalheRow label="Usou aditivo" value="Não" />
                )}
              </div>

              {/* Pedras */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}` }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Pedras</p>
                {servicoDetalhe.colocou_pedra && servicoDetalhe.pedras_colocadas?.length > 0 ? (
                  <div className="space-y-2">
                    {servicoDetalhe.pedras_colocadas.map((p, i) => (
                      <div key={i} className="flex justify-between text-xs py-1.5 border-b last:border-0" style={{ borderColor: S.border }}>
                        <span style={{ color: S.text }}>{p.nome ?? `Insumo #${p.insumo_id}`} × {p.qtd}</span>
                        <span style={{ color: S.textMuted }}>{p.peso_total.toFixed(3)}g · {p.origem}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <DetalheRow label="Colocou pedra" value="Não" />
                )}
              </div>

              {/* Tempo */}
              <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}` }}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Tempo</p>
                {servicoDetalhe.recebido_em && (
                  <DetalheRow label="Recebido" value={fmtDataHora(servicoDetalhe.recebido_em)} />
                )}
                {servicoDetalhe.concluido_em && (
                  <DetalheRow label="Concluído" value={fmtDataHora(servicoDetalhe.concluido_em)} />
                )}
                {servicoDetalhe.recebido_em && servicoDetalhe.concluido_em && (
                  <DetalheRow label="Duração" value={calcDuracao(servicoDetalhe.recebido_em, servicoDetalhe.concluido_em)} valueColor={S.gold} />
                )}
              </div>

              {/* Fotos */}
              {[
                { label: "Peça (loja)",     url: servicoDetalhe.foto_peca_servico },
                { label: "Recebimento",     url: servicoDetalhe.foto_recebimento },
                { label: "Conclusão",       url: servicoDetalhe.foto_conclusao },
                { label: "Aditivo na balança",  url: servicoDetalhe.foto_fio_solda },
              ].filter(f => !!f.url).map(f => (
                <div key={f.label}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>{f.label}</p>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.url!}
                    alt={f.label}
                    onClick={() => setZoomFoto(f.url!)}
                    className="w-full rounded-2xl object-cover cursor-pointer active:scale-[0.99] transition-transform"
                    style={{ maxHeight: 260 }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── DRAWER: Detalhe da ordem ───────────────────────────────────────── */}
      {(ordemDetalhe || loadingOrdem) && (
        <div className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: "#0d2419" }}>
          <div className="flex items-center gap-3 px-4 py-3 shrink-0" style={{ borderBottom: `1px solid ${S.border}` }}>
            <button
              onClick={() => { setOrdemDetalhe(null); setOrdemItens([]); setOrdemTipos([]); }}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: S.cardBg }}
            >
              <ChevronLeft size={18} color={S.text} />
            </button>
            {ordemDetalhe ? (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="font-semibold text-sm truncate" style={{ color: S.text }}>
                  {ordemDetalhe.numero_ordem ?? `Ordem #${ordemDetalhe.ordem_id}`}
                </span>
                <TipoBadge tipo={ordemDetalhe.tipo_ordem} />
              </div>
            ) : (
              <span className="text-sm" style={{ color: S.textMuted }}>Carregando...</span>
            )}
          </div>

          {loadingOrdem && (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={28} className="animate-spin" style={{ color: S.textMuted }} />
            </div>
          )}

          {ordemDetalhe && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>

              {/* Info básica */}
              <div className="rounded-2xl px-4 py-3 space-y-1.5" style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}` }}>
                {ordemDetalhe.cliente_nome && (
                  <DetalheRow label="Cliente" value={ordemDetalhe.cliente_nome} />
                )}
                <DetalheRow label="Tipo" value={ordemDetalhe.tipo_ordem} />
                {ordemDetalhe.data_entrega && (
                  <DetalheRow label="Data entrega" value={new Date(ordemDetalhe.data_entrega).toLocaleDateString("pt-BR")} valueColor={S.gold} />
                )}
                {ordemDetalhe.peso_peca_servico != null && (
                  <DetalheRow label="Peso peça" value={`${ordemDetalhe.peso_peca_servico}g`} />
                )}
                {ordemDetalhe.detalhes_ordem && (
                  <DetalheRow label="Detalhes" value={ordemDetalhe.detalhes_ordem} />
                )}
              </div>

              {/* Tipos de serviço */}
              {ordemTipos.length > 0 && (
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}` }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Tipos de Serviço</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ordemTipos.map((t: { id: number; nome: string }) => (
                      <span key={t.id} className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                        style={{ backgroundColor: "rgba(219,152,100,0.15)", color: S.gold }}>
                        {t.nome}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Itens da ordem */}
              {ordemItens.length > 0 && (
                <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: S.cardBg, border: `1px solid ${S.border}` }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Itens</p>
                  <div className="space-y-2">
                    {ordemItens.map((item: { id: number; nome_produto?: string; sku?: string; quantidade?: number; peso_estimado?: number; observacao?: string }) => (
                      <div key={item.id} className="py-1.5 border-b last:border-0" style={{ borderColor: S.border }}>
                        <p className="text-xs font-medium" style={{ color: S.text }}>
                          {item.nome_produto ?? "Item"}
                          {item.sku && <span className="ml-1 font-mono text-[10px]" style={{ color: S.textFaint }}>({item.sku})</span>}
                        </p>
                        {item.quantidade && item.quantidade > 1 && (
                          <p className="text-[10px]" style={{ color: S.textMuted }}>Qtd: {item.quantidade}</p>
                        )}
                        {item.peso_estimado != null && Number(item.peso_estimado) > 0 && (
                          <p className="text-[10px]" style={{ color: S.textMuted }}>Peso est.: {Number(item.peso_estimado).toFixed(2)}g</p>
                        )}
                        {item.observacao && (
                          <p className="text-[10px] mt-0.5" style={{ color: S.textFaint }}>{item.observacao}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fotos e vídeo */}
              {ordemDetalhe.foto_peca_servico && typeof ordemDetalhe.foto_peca_servico === "string" && (() => {
                const STORAGE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/object/public/ordem-fotos/";
                const fotoUrl = ordemDetalhe.foto_peca_servico.startsWith("http")
                  ? ordemDetalhe.foto_peca_servico
                  : STORAGE_BASE + ordemDetalhe.foto_peca_servico;
                return (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Foto da peça (loja)</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fotoUrl}
                      alt="Peça"
                      onClick={() => setZoomFoto(fotoUrl)}
                      className="w-full rounded-2xl object-cover cursor-pointer active:scale-[0.99] transition-transform"
                      style={{ maxHeight: 260 }}
                    />
                  </div>
                );
              })()}

              {ordemDetalhe.video_observacao && typeof ordemDetalhe.video_observacao === "string" && (() => {
                const VIDEO_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + "/storage/v1/object/public/ordem-videos/";
                const videoUrl = ordemDetalhe.video_observacao.startsWith("http")
                  ? ordemDetalhe.video_observacao
                  : VIDEO_BASE + ordemDetalhe.video_observacao;
                return (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: S.textMuted }}>Vídeo de observação</p>
                    <video src={videoUrl} controls playsInline className="w-full rounded-2xl" style={{ maxHeight: 300 }} />
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── ZOOM FOTO ──────────────────────────────────────────────────────────── */}
      {zoomFoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black"
          onClick={() => setZoomFoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomFoto} alt="zoom" className="max-w-full max-h-full object-contain" />
          <button
            onClick={() => setZoomFoto(null)}
            className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          >
            <X size={16} color="white" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes auxiliares ────────────────────────────────────────────────
function StepNav({ step, setStep, canAdvance, loading }: { step: number; setStep: (n: number) => void; canAdvance: boolean; loading?: boolean }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 flex gap-3 px-4 pt-3 z-20"
      style={{ backgroundColor: "rgba(24,64,54,0.97)", borderTop: `1px solid ${S.border}`, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
      {step > 1 && (
        <Btn variant="ghost" onClick={() => setStep(step - 1)} className="h-14 px-5">
          <ChevronLeft size={18} />
        </Btn>
      )}
      <Btn variant="green" onClick={() => setStep(step + 1)} disabled={!canAdvance || loading} className="flex-1 h-14 text-base">
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Validando peso...
          </span>
        ) : step < 5 ? "Próximo" : "Ver resumo"}
      </Btn>
    </div>
  );
}

function ResumoLinha({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between py-2 border-b last:border-0" style={{ borderColor: S.border }}>
      <span className="text-xs" style={{ color: S.textMuted }}>{label}</span>
      <span className="text-xs font-semibold" style={{ color: highlight ? S.gold : S.text }}>{value}</span>
    </div>
  );
}

function RotateCcwIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-3.51" />
    </svg>
  );
}

// ── Helpers validação IA ──────────────────────────────────────────────────────
function base64ToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function chamarValidarPesoIA(
  b64: string,
  peso: string,
  setValidando: (v: boolean) => void,
  setValidacao: (v: ValidacaoIA | null) => void
) {
  const num = parseFloat(peso);
  if (!b64 || isNaN(num) || num <= 0) return;

  setValidando(true);
  setValidacao(null);

  const blob = base64ToBlob(b64);
  const fd = new FormData();
  fd.append("file", blob, "foto.jpg");
  fd.append("peso", String(num));

  const res = await fetch("/api/pcp/validar-peso", { method: "POST", body: fd }).catch(() => null);
  const result: ValidacaoIA | null = res?.ok
    ? await res.json().catch(() => null)
    : null;

  setValidacao(result ?? {
    peso_digitado: num,
    peso_balanca: null,
    confianca: "nenhuma",
    match: false,
    mensagem: "Erro ao contactar IA — tente novamente.",
  });
  setValidando(false);
}

function DetalheRow({ label, value, valueColor }: { label: string; value?: string | null; valueColor?: string }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between items-start py-2 border-b last:border-0" style={{ borderColor: S.border }}>
      <span className="text-xs shrink-0 mr-3" style={{ color: S.textMuted }}>{label}</span>
      <span className="text-xs font-semibold text-right" style={{ color: valueColor ?? S.text }}>{value}</span>
    </div>
  );
}

function fmtDataHora(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const h   = String(d.getHours()).padStart(2, "0");
  const m   = String(d.getMinutes()).padStart(2, "0");
  return `${dia}/${mes} ${h}:${m}`;
}

function calcDuracao(inicio?: string | null, fim?: string | null): string {
  if (!inicio || !fim) return "—";
  const diffMs  = new Date(fim).getTime() - new Date(inicio).getTime();
  if (diffMs <= 0) return "—";
  const totalMin = Math.floor(diffMs / 60000);
  const h        = Math.floor(totalMin / 60);
  const min      = totalMin % 60;
  if (h === 0) return `${min}min`;
  return min === 0 ? `${h}h` : `${h}h ${min}min`;
}
