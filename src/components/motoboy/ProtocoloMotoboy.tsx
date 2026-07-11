"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { dispararWebhook } from "@/lib/webhooks";
import {
  Camera, CheckCircle2, Clock, Package, ChevronRight,
  Loader2, AlertCircle, ArrowLeft, X, RotateCcw, Plus,
  ArrowUpRight, ArrowDownLeft, RefreshCw,
} from "lucide-react";

// ── Cores ─────────────────────────────────────────────────────────────────────
const C = {
  esmeralda: "#184036",
  creme:     "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg:   "#FAFAF7",
  muted:     "#6B7280",
};

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Protocolo {
  id: number;
  direcao: string;
  etapas: string;
  created_at: string;
  total_ordens?: number;
}

interface OrdemItem {
  ordem_id: number;
  numero_ordem: string | null;
}

interface OrdemDisponivel {
  id: number;
  numero_ordem: string | null;
  status: string | null;
}

interface BaixaSangriaOption {
  id: number;
  gramas: number;
  destino: string;
  status: string;
  realizado_nome: string | null;
  created_at: string;
}

type View = "lista" | "detalhe" | "criar" | "camera";
type Tab  = "ida" | "volta";
type ModoCriacao = "ordens" | "sangria";

// ── Badge de status ───────────────────────────────────────────────────────────
function EtapaBadge({ etapa }: { etapa: string }) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    concluido:    { label: "Concluído",    bg: "#ECFDF5", color: "#059669" },
    em_andamento: { label: "Em Andamento", bg: "#EFF6FF", color: "#2563EB" },
    pendente:     { label: "Pendente",     bg: "#FEF3C7", color: "#92400E" },
  };
  const s   = cfg[etapa] ?? { label: etapa, bg: "#F3F4F6", color: C.muted };
  const Icon = etapa === "concluido" ? CheckCircle2 : Clock;
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      <Icon size={10} />{s.label}
    </span>
  );
}

// ── Câmera nativa ─────────────────────────────────────────────────────────────
function CameraTela({
  onCapture,
  onCancel,
}: {
  onCapture: (file: File, preview: string) => void;
  onCancel:  () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [stream, setStream]   = useState<MediaStream | null>(null);
  const [error, setError]     = useState("");
  const [ready, setReady]     = useState(false);

  useEffect(() => {
    let active = true;
    let captured: MediaStream | null = null;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } } })
      .then((s) => {
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        captured = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() => setError("Câmera não disponível. Verifique as permissões do navegador."));
    return () => {
      active = false;
      captured?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capturar() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => {
        const file = new File([blob], `foto_${Date.now()}.jpg`, { type: "image/jpeg" });
        onCapture(file, dataUrl);
      });
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 p-8">
        <AlertCircle size={48} color="#EF4444" />
        <p className="text-white text-sm text-center">{error}</p>
        <button
          onClick={onCancel}
          className="px-6 py-3 rounded-xl text-sm font-semibold bg-white"
          style={{ color: "#1A1A1A" }}
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        <div
          className="absolute inset-8 rounded-2xl pointer-events-none"
          style={{ border: "2px solid rgba(255,255,255,0.35)" }}
        />
        <p className="absolute top-5 left-0 right-0 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.55)" }}>
          Enquadre as joias
        </p>
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <X size={16} color="white" />
        </button>
      </div>
      <div
        className="flex items-center justify-between px-10 py-6"
        style={{
          backgroundColor: "rgba(0,0,0,0.85)",
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
        }}
      >
        <button onClick={onCancel} style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>
          Cancelar
        </button>
        <button
          onClick={capturar}
          disabled={!ready}
          className="w-16 h-16 rounded-full disabled:opacity-40 active:scale-90 transition-transform"
          style={{ backgroundColor: "white", border: "4px solid rgba(255,255,255,0.3)" }}
          aria-label="Capturar foto"
        />
        <div style={{ width: 60 }} />
      </div>
    </div>
  );
}

// ── Card de protocolo ─────────────────────────────────────────────────────────
function ProtocoloCard({ protocolo: p, onClick }: { protocolo: Protocolo; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl border text-left active:scale-[0.98] transition-transform"
      style={{ borderColor: C.cremeBorder }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="font-semibold text-sm" style={{ color: C.esmeralda }}>
          Protocolo #{p.id}
        </span>
        <EtapaBadge etapa={p.etapas} />
      </div>
      {/* Card body */}
      <div className="flex items-center justify-between px-4 pb-3.5">
        <span className="text-xs" style={{ color: C.muted }}>
          {p.direcao === "ida" ? "📤 Loja → Fábrica" : "📥 Fábrica → Loja"}
        </span>
        <div className="flex items-center gap-3">
          {p.total_ordens != null && (
            <span className="flex items-center gap-1 text-xs" style={{ color: C.muted }}>
              <Package size={11} />
              {p.total_ordens} ordem{p.total_ordens !== 1 ? "s" : ""}
            </span>
          )}
          <ChevronRight size={14} style={{ color: "#D1D5DB" }} />
        </div>
      </div>
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function ProtocoloMotoboy() {
  const supabase = createClient();

  const [userId,       setUserId]       = useState<string>("");
  const [view,         setView]         = useState<View>("lista");
  const [tab,          setTab]          = useState<Tab>("ida");
  const [protocolos,   setProtocolos]   = useState<Protocolo[]>([]);
  const [selected,     setSelected]     = useState<Protocolo | null>(null);
  const [ordens,       setOrdens]       = useState<OrdemItem[]>([]);
  const [loadingLista, setLoadingLista] = useState(true);
  const [loadingOrdens,setLoadingOrdens]= useState(false);

  // ── Estado de criação ────────────────────────────────────────────────────────
  const [direcaoCriar,       setDirecaoCriar]       = useState<"ida" | "volta">("ida");
  const [tipoProtocoloCriar, setTipoProtocoloCriar] = useState<"fabrica" | "service">("fabrica");
  const [modoCriacao,        setModoCriacao]        = useState<ModoCriacao>("ordens");
  const [tiposPermitidos,    setTiposPermitidos]    = useState<string[]>([]);
  const [ordensDisponiveis,  setOrdensDisponiveis]   = useState<OrdemDisponivel[]>([]);
  const [baixasSangria,      setBaixasSangria]      = useState<BaixaSangriaOption[]>([]);
  const [loadingDisponiveis, setLoadingDisponiveis]  = useState(false);
  const [selectedCriar,      setSelectedCriar]       = useState<Set<number>>(new Set());
  const [selectedBaixaId,    setSelectedBaixaId]     = useState<number | null>(null);
  const [fotoFile,            setFotoFile]           = useState<File | null>(null);
  const [fotoPreview,         setFotoPreview]        = useState<string | null>(null);
  const [criando,             setCriando]            = useState(false);
  const [erroCriar,           setErroCriar]          = useState("");
  const [sucessoCriar,        setSucessoCriar]       = useState(false);

  // ── userId no mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/protocolo/permissoes?user_id=${userId}`)
      .then((r) => (r.ok ? r.json() : { tipos_permitidos: [] }))
      .then((d) => {
        const tipos = Array.isArray(d?.tipos_permitidos) ? d.tipos_permitidos : [];
        setTiposPermitidos(tipos);
        if (tipos.includes("fabrica") || tipos.includes("service")) {
          setTipoProtocoloCriar(tipos.includes("fabrica") ? "fabrica" : "service");
        }
      })
      .catch(() => setTiposPermitidos([]));
  }, [userId]);

  // ── Carregar lista ───────────────────────────────────────────────────────────
  const loadLista = useCallback(async () => {
    if (!userId) return;
    setLoadingLista(true);
    const res  = await fetch(`/api/protocolo?user_id=${userId}`);
    const data: Protocolo[] = await res.json().catch(() => []);
    setProtocolos(data);
    setLoadingLista(false);
  }, [userId]);

  useEffect(() => {
    if (userId) loadLista();
  }, [userId, loadLista]);

  // ── Dados derivados ──────────────────────────────────────────────────────────
  const idaRows    = protocolos.filter((p) => p.direcao === "ida");
  const voltaRows  = protocolos.filter((p) => p.direcao === "volta");
  const idaPend    = idaRows.filter((p)   => p.etapas === "pendente").length;
  const voltaPend  = voltaRows.filter((p) => p.etapas === "pendente").length;
  const tabRows    = tab === "ida" ? idaRows : voltaRows;

  // ── Selecionar protocolo ─────────────────────────────────────────────────────
  async function selectProtocolo(p: Protocolo) {
    setSelected(p);
    setView("detalhe");
    setLoadingOrdens(true);
    const res  = await fetch(`/api/protocolo/${p.id}`);
    const data: OrdemItem[] = await res.json().catch(() => []);
    setOrdens(data);
    setLoadingOrdens(false);
  }

  // ── Abrir criação ────────────────────────────────────────────────────────────
  async function abrirCriar() {
    const dir = tab;
    setDirecaoCriar(dir);
    setModoCriacao("ordens");
    setSelectedCriar(new Set());
    setSelectedBaixaId(null);
    setFotoFile(null);
    setFotoPreview(null);
    setErroCriar("");
    setSucessoCriar(false);
    setView("criar");
    await carregarItensCriacao(dir, tipoProtocoloCriar, "ordens");
  }

  /**
   * REGRA DE NEGÓCIO: fluxo do motoboy precisa seguir mesmas regras do protocolo
   * principal (ordens e sangria por destino).
   *
   * O QUE: carrega ordens para modo "ordens" e baixas pendentes para modo
   * "sangria" conforme tipo de protocolo (fabrica/service).
   * POR QUE: manter comportamento único evita divergência operacional entre
   * front exclusivo do motoboy e módulo geral de protocolo.
   * IMPACTO SE REMOVIDO: motoboy cria protocolos sem aderência ao fluxo oficial.
   */
  async function carregarItensCriacao(
    dir: "ida" | "volta",
    tipo: "fabrica" | "service",
    modo: ModoCriacao,
  ) {
    setLoadingDisponiveis(true);
    setOrdensDisponiveis([]);
    setBaixasSangria([]);
    try {
      if (modo === "sangria") {
        const res = await fetch(`/api/financeiro/cofre-ouro/baixas?status=esperando_protocolo&destino=${tipo}`);
        const data: BaixaSangriaOption[] = await res.json().catch(() => []);
        setBaixasSangria(Array.isArray(data) ? data : []);
      } else {
        const res = await fetch(`/api/protocolo/ordens?direcao=${dir}&tipo_protocolo=${tipo}`);
        const data: OrdemDisponivel[] = await res.json().catch(() => []);
        setOrdensDisponiveis(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoadingDisponiveis(false);
    }
  }

  // ── Criar protocolo ──────────────────────────────────────────────────────────
  async function handleCriar() {
    setErroCriar("");
    if (modoCriacao === "sangria") {
      if (!selectedBaixaId) { setErroCriar("Selecione uma baixa de sangria."); return; }
    } else if (selectedCriar.size === 0) {
      setErroCriar("Selecione ao menos uma ordem.");
      return;
    }
    if (!fotoFile)                { setErroCriar("Foto das joias é obrigatória."); return; }
    setCriando(true);
    try {
      const fotoPath = `criacao/${userId}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("protocolo-fotos")
        .upload(fotoPath, fotoFile, { contentType: fotoFile.type || "image/jpeg", upsert: false });
      if (uploadErr) throw new Error(`Upload foto: ${uploadErr.message}`);

      const res = await fetch("/api/protocolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direcao:        direcaoCriar,
          ordem_ids:      modoCriacao === "ordens" ? Array.from(selectedCriar) : undefined,
          baixa_id:       modoCriacao === "sangria" ? selectedBaixaId : undefined,
          motoboy_id:     userId,
          foto_criacao:   fotoPath,
          user_id:        userId,
          tipo_protocolo: tipoProtocoloCriar,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);

      dispararWebhook("notificar-protocolo-criado", { direcao: direcaoCriar });
      setSucessoCriar(true);
      setTimeout(() => { setView("lista"); loadLista(); }, 1400);
    } catch (e: unknown) {
      setErroCriar(e instanceof Error ? e.message : "Erro ao criar protocolo");
    } finally {
      setCriando(false);
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: CÂMERA
  // ════════════════════════════════════════════════════════════════════════════
  if (view === "camera") {
    return (
      <CameraTela
        onCapture={(file, preview) => { setFotoFile(file); setFotoPreview(preview); setView("criar"); }}
        onCancel={() => setView("criar")}
      />
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: CRIAR (full-screen mobile)
  // ════════════════════════════════════════════════════════════════════════════
  if (view === "criar") {
    return (
      <div className="flex flex-col" style={{ minHeight: "100dvh", backgroundColor: "#fff" }}>

        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-4 border-b shrink-0 sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            onClick={() => setView("lista")}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
          >
            <ArrowLeft size={18} style={{ color: C.esmeralda }} />
          </button>
          <div>
            <h2 className="text-base font-semibold" style={{ color: C.esmeralda }}>
              Novo Protocolo
            </h2>
            <p className="text-xs" style={{ color: C.muted }}>
              {direcaoCriar === "ida" ? "📤 Loja → Fábrica" : "📥 Fábrica → Loja"}
            </p>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 pb-32">

          <div className="grid grid-cols-1 gap-2">
            {(["fabrica"] as const)
              .filter((t) => tiposPermitidos.length === 0 || tiposPermitidos.includes(t))
              .map((t) => {
                const ativo = tipoProtocoloCriar === t;
                return (
                  <button
                    key={t}
                    onClick={async () => {
                      setTipoProtocoloCriar(t);
                      setSelectedCriar(new Set());
                      setSelectedBaixaId(null);
                      await carregarItensCriacao(direcaoCriar, t, modoCriacao);
                    }}
                    className="h-10 rounded-lg border text-sm font-semibold"
                    style={{
                      borderColor: ativo ? C.esmeralda : C.cremeBorder,
                      backgroundColor: ativo ? `${C.esmeralda}12` : "#fff",
                      color: ativo ? C.esmeralda : C.muted,
                    }}
                  >
                    {t === "fabrica" ? "🏭 Fábrica" : "🔧 Service"}
                  </button>
                );
              })}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {([
              { key: "ordens", label: "Ordens" },
              { key: "sangria", label: "Sangria" },
            ] as const).map((op) => {
              const ativo = modoCriacao === op.key;
              return (
                <button
                  key={op.key}
                  onClick={async () => {
                    setModoCriacao(op.key);
                    setSelectedCriar(new Set());
                    setSelectedBaixaId(null);
                    await carregarItensCriacao(direcaoCriar, tipoProtocoloCriar, op.key);
                  }}
                  className="h-10 rounded-lg border text-sm font-semibold"
                  style={{
                    borderColor: ativo ? C.esmeralda : C.cremeBorder,
                    backgroundColor: ativo ? `${C.esmeralda}12` : "#fff",
                    color: ativo ? C.esmeralda : C.muted,
                  }}
                >
                  {op.key === "ordens" ? "📦 Ordens" : "🧪 Sangria"}
                </button>
              );
            })}
          </div>

          {/* Ordens disponíveis */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: C.muted }}>
              {modoCriacao === "sangria" ? "Selecionar Baixa" : "Selecionar Ordens"}
              {modoCriacao === "ordens" && selectedCriar.size > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: `${C.esmeralda}18`, color: C.esmeralda }}>
                  {selectedCriar.size} selecionada{selectedCriar.size !== 1 ? "s" : ""}
                </span>
              )}
              {modoCriacao === "sangria" && selectedBaixaId && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ backgroundColor: `${C.esmeralda}18`, color: C.esmeralda }}>
                  1 selecionada
                </span>
              )}
            </p>
            {loadingDisponiveis ? (
              <div className="flex justify-center py-8">
                <Loader2 size={22} className="animate-spin" style={{ color: C.muted }} />
              </div>
            ) : modoCriacao === "sangria" ? (
              baixasSangria.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: C.muted }}>
                  Nenhuma baixa pendente para {tipoProtocoloCriar === "service" ? "Service" : "Fábrica"}
                </p>
              ) : (
                <div className="space-y-2">
                  {baixasSangria.map((b) => {
                    const sel = selectedBaixaId === b.id;
                    return (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBaixaId((prev) => (prev === b.id ? null : b.id))}
                        className="w-full flex items-center gap-3 rounded-xl px-4 py-4 text-left active:scale-[0.98] transition-all"
                        style={{
                          backgroundColor: sel ? `${C.esmeralda}0d` : C.cremeBg,
                          border: `1.5px solid ${sel ? C.esmeralda + "50" : C.cremeBorder}`,
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold" style={{ color: C.esmeralda }}>
                            Baixa Ouro #{b.id} · {Number(b.gramas).toFixed(3)}g
                          </p>
                          <p className="text-xs" style={{ color: C.muted }}>
                            {b.realizado_nome ?? "—"} · {new Date(b.created_at).toLocaleDateString("pt-BR")}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )
            ) : ordensDisponiveis.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: C.muted }}>
                Nenhuma ordem disponível para protocolo {direcaoCriar}
              </p>
            ) : (
              <div className="space-y-2">
                {ordensDisponiveis.map((o) => {
                  const sel = selectedCriar.has(o.id);
                  return (
                    <button
                      key={o.id}
                      onClick={() =>
                        setSelectedCriar((prev) => {
                          const next = new Set(prev);
                          sel ? next.delete(o.id) : next.add(o.id);
                          return next;
                        })
                      }
                      className="w-full flex items-center gap-3 rounded-xl px-4 py-4 text-left active:scale-[0.98] transition-all"
                      style={{
                        backgroundColor: sel ? `${C.esmeralda}0d` : C.cremeBg,
                        border: `1.5px solid ${sel ? C.esmeralda + "50" : C.cremeBorder}`,
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2"
                        style={{
                          backgroundColor: sel ? C.esmeralda : "#fff",
                          borderColor:     sel ? C.esmeralda : "#D1D5DB",
                        }}
                      >
                        {sel && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 3.5L4 6.5L9 1" stroke="#F3EADA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-medium flex-1" style={{ color: C.esmeralda }}>
                        {o.numero_ordem ?? `Ordem #${o.id}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Foto obrigatória */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: C.muted }}>
              Foto das Joias{" "}
              <span style={{ color: "#DC2626" }}>*</span>
            </p>
            {fotoPreview ? (
              <div className="relative rounded-xl overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoPreview} alt="Foto das joias" className="w-full max-h-52 object-cover rounded-xl" />
                <button
                  onClick={() => { setFotoFile(null); setFotoPreview(null); }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                >
                  <RotateCcw size={14} color="white" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setView("camera")}
                className="w-full flex flex-col items-center justify-center gap-2.5 rounded-xl active:scale-[0.98] transition-transform"
                style={{
                  height: 120,
                  backgroundColor: C.cremeBg,
                  border: `2px dashed ${C.cremeBorder}`,
                }}
              >
                <Camera size={28} style={{ color: C.muted }} />
                <span className="text-sm" style={{ color: C.muted }}>Tirar foto das joias</span>
              </button>
            )}
          </div>

          {/* Feedback */}
          {erroCriar && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
              style={{ backgroundColor: "#FEF2F2", color: "#DC2626" }}>
              <AlertCircle size={15} className="shrink-0" />{erroCriar}
            </div>
          )}
          {sucessoCriar && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}>
              <CheckCircle2 size={15} className="shrink-0" />Protocolo criado com sucesso!
            </div>
          )}
        </div>

        {/* Botão fixo no fundo */}
        <div
          className="fixed bottom-0 left-0 right-0 px-4 pt-3 pb-6 shrink-0"
          style={{ backgroundColor: "rgba(255,255,255,0.97)", borderTop: `1px solid ${C.cremeBorder}` }}
        >
          <button
            onClick={handleCriar}
            disabled={criando || (modoCriacao === "ordens" ? selectedCriar.size === 0 : !selectedBaixaId) || !fotoFile || sucessoCriar}
            className="w-full h-14 rounded-xl flex items-center justify-center gap-2.5 text-base font-semibold shadow-lg active:scale-[0.98] transition-all disabled:opacity-40"
            style={{ backgroundColor: C.esmeralda, color: C.creme }}
          >
            {criando
              ? <><Loader2 size={20} className="animate-spin" /> Criando...</>
              : <>
                  <Plus size={20} />
                  Criar Protocolo ({modoCriacao === "ordens" ? selectedCriar.size : selectedBaixaId ? 1 : 0})
                </>
            }
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: DETALHE
  // ════════════════════════════════════════════════════════════════════════════
  if (view === "detalhe" && selected) {
    return (
      <div className="flex flex-col" style={{ minHeight: "100dvh", backgroundColor: "#fff" }}>

        {/* Header */}
        <div
          className="flex items-center gap-3 px-4 py-4 border-b shrink-0 sticky top-0 bg-white z-10"
          style={{ borderColor: C.cremeBorder }}
        >
          <button
            onClick={() => { setView("lista"); setSelected(null); }}
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
          >
            <ArrowLeft size={18} style={{ color: C.esmeralda }} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold" style={{ color: C.esmeralda }}>
              Protocolo #{selected.id}
            </h2>
            <p className="text-xs" style={{ color: C.muted }}>
              {selected.direcao === "ida" ? "📤 Loja → Fábrica" : "📥 Fábrica → Loja"}
            </p>
          </div>
          <EtapaBadge etapa={selected.etapas} />
        </div>

        {/* Lista de ordens */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
            Ordens ({ordens.length})
          </p>
          {loadingOrdens ? (
            <div className="flex justify-center py-10">
              <Loader2 size={24} className="animate-spin" style={{ color: C.muted }} />
            </div>
          ) : ordens.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: C.muted }}>
              Sem ordens vinculadas
            </p>
          ) : (
            ordens.map((o) => (
              <div
                key={o.ordem_id}
                className="flex items-center gap-3 rounded-xl px-4 py-3.5"
                style={{ backgroundColor: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}
              >
                <Package size={16} style={{ color: C.muted }} />
                <span className="text-sm font-semibold flex-1" style={{ color: C.esmeralda }}>
                  {o.numero_ordem ?? `#${o.ordem_id}`}
                </span>
                <CheckCircle2 size={15} style={{ color: "#059669" }} />
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // VIEW: LISTA (principal)
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col" style={{ minHeight: "100dvh", backgroundColor: C.cremeBg }}>

      {/* ── Cards resumo ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-5 pb-3">
        {/* Ida */}
        <div
          className="rounded-xl bg-white px-4 py-3 border"
          style={{ borderColor: C.cremeBorder }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowUpRight size={13} style={{ color: C.esmeralda }} />
            <span className="text-xs font-semibold" style={{ color: C.esmeralda }}>Ida</span>
          </div>
          <p className="text-2xl font-bold leading-none" style={{ color: "#1A1A1A" }}>
            {idaRows.length}
          </p>
          <p className="text-[11px] mt-1" style={{ color: C.muted }}>
            {idaPend} pendente{idaPend !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Volta */}
        <div
          className="rounded-xl bg-white px-4 py-3 border"
          style={{ borderColor: C.cremeBorder }}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <ArrowDownLeft size={13} style={{ color: "#7C3AED" }} />
            <span className="text-xs font-semibold" style={{ color: "#7C3AED" }}>Volta</span>
          </div>
          <p className="text-2xl font-bold leading-none" style={{ color: "#1A1A1A" }}>
            {voltaRows.length}
          </p>
          <p className="text-[11px] mt-1" style={{ color: C.muted }}>
            {voltaPend} pendente{voltaPend !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {/* ── Tabs Ida / Volta ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pb-3">
        {(["ida", "volta"] as const).map((t) => {
          const isActive = tab === t;
          const count    = t === "ida" ? idaRows.length : voltaRows.length;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl text-base font-semibold transition-all h-12"
              style={{
                backgroundColor: isActive ? C.esmeralda : "#fff",
                color:           isActive ? C.creme    : C.muted,
                border:          `1.5px solid ${isActive ? C.esmeralda : C.cremeBorder}`,
              }}
            >
              {t === "ida" ? "📤" : "📥"}
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {count > 0 && (
                <span
                  className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: isActive ? "rgba(255,255,255,0.2)" : `${C.esmeralda}15`,
                    color:           isActive ? C.creme : C.esmeralda,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* Refresh */}
        <button
          onClick={() => loadLista()}
          disabled={loadingLista}
          className="w-12 h-12 rounded-xl flex items-center justify-center border disabled:opacity-40 transition-opacity"
          style={{ backgroundColor: "#fff", borderColor: C.cremeBorder }}
          title="Atualizar"
        >
          {loadingLista
            ? <Loader2 size={16} className="animate-spin" style={{ color: C.muted }} />
            : <RefreshCw size={16} style={{ color: C.muted }} />
          }
        </button>
      </div>

      {/* ── Lista de protocolos ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-3">
        {loadingLista && tabRows.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 size={28} className="animate-spin" style={{ color: C.muted }} />
          </div>
        ) : tabRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Package size={40} style={{ color: "#D1D5DB" }} />
            <p className="text-sm" style={{ color: C.muted }}>Nenhum protocolo encontrado</p>
            <p className="text-xs text-center" style={{ color: "#D1D5DB" }}>
              Crie um protocolo com o botão abaixo
            </p>
          </div>
        ) : (
          tabRows.map((p) => (
            <ProtocoloCard key={p.id} protocolo={p} onClick={() => selectProtocolo(p)} />
          ))
        )}
      </div>

      {/* ── Botão CTA fixo no fundo ──────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-3 z-30"
        style={{
          backgroundColor: "rgba(250,250,247,0.97)",
          borderTop: `1px solid ${C.cremeBorder}`,
        }}
      >
        <button
          onClick={() => abrirCriar()}
          className="w-full h-14 rounded-xl flex items-center justify-center gap-2.5 text-base font-semibold shadow-lg active:scale-[0.98] transition-all"
          style={{ backgroundColor: C.esmeralda, color: C.creme }}
        >
          <Camera size={20} />
          Criar Protocolo {tab === "ida" ? "Ida" : "Volta"}
        </button>
      </div>
    </div>
  );
}
