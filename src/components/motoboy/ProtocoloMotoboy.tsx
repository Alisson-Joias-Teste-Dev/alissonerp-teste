"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { dispararWebhook } from "@/lib/webhooks";
import {
  Truck, Camera, CheckCircle2, Clock, Package, ChevronRight,
  Loader2, AlertCircle, ArrowLeft, X, RotateCcw, Plus,
} from "lucide-react";

// ── Cores dark theme ──────────────────────────────────────────────────────
const T = {
  creme:   "#F3EADA",
  sage:    "#80A795",
  dourado: "#DB9864",
  card:    "rgba(255,255,255,0.08)",
  border:  "rgba(255,255,255,0.08)",
};

// ── Tipos ─────────────────────────────────────────────────────────────────
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

type View = "lista" | "detalhe" | "criar" | "camera";

// ── Badge ─────────────────────────────────────────────────────────────────
function EtapaBadge({ etapa, direcao }: { etapa: string; direcao: string }) {
  const concluido = etapa === "concluido";
  const ida = direcao === "ida";
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold"
      style={{
        backgroundColor: concluido ? "rgba(16,185,129,0.2)" : "rgba(219,152,100,0.2)",
        color: concluido ? "#6EE7B7" : T.dourado,
      }}
    >
      {concluido ? <CheckCircle2 size={9} /> : <Clock size={9} />}
      {concluido ? "Concluído" : ida ? "→ Ida" : "← Volta"}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// CÂMERA
// ══════════════════════════════════════════════════════════════════════════
function CameraTela({
  onCapture,
  onCancel,
}: {
  onCapture: (file: File, preview: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } } })
      .then((s) => {
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() => setError("Câmera não disponível. Verifique as permissões do navegador."));
    return () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function capturar() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    stream?.getTracks().forEach((t) => t.stop());
    const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
    // Converter dataUrl em File
    fetch(dataUrl).then(r => r.blob()).then(blob => {
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
          className="px-6 py-3 rounded-xl text-sm font-semibold"
          style={{ backgroundColor: T.card, color: T.creme }}
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

// ══════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════
export default function ProtocoloMotoboy() {
  const supabase = createClient();

  const [userId, setUserId] = useState<string>("");
  const [view, setView] = useState<View>("lista");
  const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
  const [selected, setSelected] = useState<Protocolo | null>(null);
  const [ordens, setOrdens] = useState<OrdemItem[]>([]);

  const [loadingLista, setLoadingLista] = useState(true);
  const [loadingOrdens, setLoadingOrdens] = useState(false);

  // ── Estado criação ───────────────────────────────────────────────────────
  const [direcaoCriar, setDirecaoCriar] = useState<"ida" | "volta">("ida");
  const [ordensDisponiveis, setOrdensDisponiveis] = useState<OrdemDisponivel[]>([]);
  const [loadingDisponiveis, setLoadingDisponiveis] = useState(false);
  const [selectedCriar, setSelectedCriar] = useState<Set<number>>(new Set());
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState("");
  const [sucessoCriar, setSucessoCriar] = useState(false);

  // ── Obter userId no mount ────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  // ── Carregar lista ──────────────────────────────────────────────────────
  const loadLista = useCallback(async () => {
    if (!userId) return;
    setLoadingLista(true);
    const res = await fetch(`/api/protocolo?user_id=${userId}`);
    const data: Protocolo[] = await res.json().catch(() => []);
    setProtocolos(data);
    setLoadingLista(false);
  }, [userId]);

  useEffect(() => {
    if (userId) loadLista();
  }, [userId, loadLista]);

  // ── Selecionar protocolo ────────────────────────────────────────────────
  async function selectProtocolo(p: Protocolo) {
    setSelected(p);
    setView("detalhe");
    setLoadingOrdens(true);
    const res = await fetch(`/api/protocolo/${p.id}`);
    const data: OrdemItem[] = await res.json().catch(() => []);
    setOrdens(data);
    setLoadingOrdens(false);
  }

  // ── Abrir criação ───────────────────────────────────────────────────────
  async function abrirCriar(dir: "ida" | "volta") {
    setDirecaoCriar(dir);
    setSelectedCriar(new Set());
    setFotoFile(null);
    setFotoPreview(null);
    setErroCriar("");
    setSucessoCriar(false);
    setView("criar");
    setLoadingDisponiveis(true);
    const res = await fetch(`/api/protocolo/ordens?direcao=${dir}`);
    const data: OrdemDisponivel[] = await res.json().catch(() => []);
    setOrdensDisponiveis(data);
    setLoadingDisponiveis(false);
  }

  // ── Criar protocolo ─────────────────────────────────────────────────────
  async function handleCriar() {
    setErroCriar("");
    if (selectedCriar.size === 0) { setErroCriar("Selecione ao menos uma ordem."); return; }
    if (!fotoFile) { setErroCriar("Foto das joias é obrigatória."); return; }
    setCriando(true);

    try {
      // Upload foto direto no Storage
      const fotoPath = `criacao/${userId}/${Date.now()}.jpg`;
      const { error: uploadErr } = await supabase.storage
        .from("protocolo-fotos")
        .upload(fotoPath, fotoFile, { contentType: fotoFile.type || "image/jpeg", upsert: false });
      if (uploadErr) throw new Error(`Upload foto: ${uploadErr.message}`);

      const res = await fetch("/api/protocolo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          direcao: direcaoCriar,
          ordem_ids: Array.from(selectedCriar),
          motoboy_id: userId,
          foto_criacao: fotoPath,
          user_id: userId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? `Erro ${res.status}`);

      dispararWebhook("notificar-protocolo-criado", { direcao: direcaoCriar });
      setSucessoCriar(true);
      setTimeout(() => {
        setView("lista");
        loadLista();
      }, 1400);
    } catch (e: unknown) {
      setErroCriar(e instanceof Error ? e.message : "Erro ao criar protocolo");
    } finally {
      setCriando(false);
    }
  }

  // ── CÂMERA ──────────────────────────────────────────────────────────────
  if (view === "camera") {
    return (
      <CameraTela
        onCapture={(file, preview) => { setFotoFile(file); setFotoPreview(preview); setView("criar"); }}
        onCancel={() => setView("criar")}
      />
    );
  }

  // ── CRIAR ────────────────────────────────────────────────────────────────
  if (view === "criar") {
    return (
      <div className="space-y-4 pb-6">
        <button
          onClick={() => setView("lista")}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: T.sage }}
        >
          <ArrowLeft size={15} /> Voltar
        </button>

        <h2 className="text-lg font-semibold" style={{ color: T.creme }}>
          Novo Protocolo — {direcaoCriar === "ida" ? "Loja → Fábrica" : "Fábrica → Loja"}
        </h2>

        {/* Ordens disponíveis */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.sage }}>
            Selecionar Ordens
          </p>
          {loadingDisponiveis ? (
            <div className="flex justify-center py-6">
              <Loader2 size={20} className="animate-spin" style={{ color: T.sage }} />
            </div>
          ) : ordensDisponiveis.length === 0 ? (
            <p className="text-xs text-center py-4" style={{ color: T.sage }}>Nenhuma ordem disponível</p>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {ordensDisponiveis.map((o) => {
                const sel = selectedCriar.has(o.id);
                return (
                  <button
                    key={o.id}
                    onClick={() => setSelectedCriar(prev => {
                      const next = new Set(prev);
                      sel ? next.delete(o.id) : next.add(o.id);
                      return next;
                    })}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left active:scale-[0.98] transition-all"
                    style={{
                      backgroundColor: sel ? "rgba(219,152,100,0.2)" : T.card,
                      border: `1px solid ${sel ? T.dourado + "60" : T.border}`,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0 border"
                      style={{
                        backgroundColor: sel ? T.dourado : "transparent",
                        borderColor: sel ? T.dourado : "rgba(255,255,255,0.25)",
                      }}
                    >
                      {sel && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3L3.5 5.5L8 1" stroke="#184036" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: T.creme }}>
                        {o.numero_ordem ?? `#${o.id}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Foto obrigatória */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: T.sage }}>
            Foto das Joias <span style={{ color: "#EF4444" }}>*</span>
          </p>
          {fotoPreview ? (
            <div className="relative rounded-2xl overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoPreview} alt="Foto" className="w-full max-h-48 object-cover rounded-2xl" />
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
              className="w-full rounded-2xl py-10 flex flex-col items-center gap-2.5"
              style={{ backgroundColor: T.card, border: "2px dashed rgba(255,255,255,0.15)" }}
            >
              <Camera size={32} style={{ color: T.sage }} />
              <span className="text-sm" style={{ color: T.sage }}>Tirar foto das joias</span>
            </button>
          )}
        </div>

        {/* Feedback */}
        {erroCriar && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}>
            <AlertCircle size={15} className="shrink-0" />{erroCriar}
          </div>
        )}
        {sucessoCriar && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#6EE7B7" }}>
            <CheckCircle2 size={15} className="shrink-0" />Protocolo criado com sucesso!
          </div>
        )}

        {/* Botão criar */}
        <button
          onClick={handleCriar}
          disabled={criando || selectedCriar.size === 0 || !fotoFile || sucessoCriar}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-bold text-base disabled:opacity-40 active:scale-[0.98] transition-transform"
          style={{
            background: "linear-gradient(135deg, #DB9864, #FEDDB4)",
            color: "#184036",
            minHeight: 56,
          }}
        >
          {criando ? (
            <><Loader2 size={20} className="animate-spin" /> Criando...</>
          ) : (
            <><Plus size={20} /> Criar Protocolo ({selectedCriar.size})</>
          )}
        </button>
      </div>
    );
  }

  // ── DETALHE ─────────────────────────────────────────────────────────────
  if (view === "detalhe" && selected) {
    return (
      <div className="space-y-4 pb-6">
        <button
          onClick={() => { setView("lista"); setSelected(null); }}
          className="flex items-center gap-1.5 text-sm"
          style={{ color: T.sage }}
        >
          <ArrowLeft size={15} /> Voltar
        </button>

        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold" style={{ color: T.creme }}>
              Protocolo #{selected.id}
            </h2>
            <EtapaBadge etapa={selected.etapas} direcao={selected.direcao} />
          </div>
          <p className="text-[12px]" style={{ color: T.sage }}>
            {selected.direcao === "ida" ? "Loja → Fábrica" : "Fábrica → Loja"}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.sage }}>
            Ordens ({ordens.length})
          </p>
          {loadingOrdens ? (
            <div className="flex justify-center py-4">
              <Loader2 size={20} className="animate-spin" style={{ color: T.sage }} />
            </div>
          ) : ordens.length === 0 ? (
            <p className="text-[12px] text-center py-3" style={{ color: T.sage }}>Sem ordens vinculadas</p>
          ) : (
            ordens.map((o) => (
              <div
                key={o.ordem_id}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
              >
                <Package size={16} style={{ color: T.sage }} />
                <p className="text-sm font-medium flex-1" style={{ color: T.creme }}>
                  {o.numero_ordem ?? `#${o.ordem_id}`}
                </p>
                <CheckCircle2 size={15} color="#6EE7B7" />
              </div>
            ))
          )}
        </div>

        {selected.etapas === "concluido" && (
          <div className="rounded-2xl py-4 text-center text-sm" style={{ backgroundColor: T.card, color: T.sage }}>
            Protocolo concluído — aguardando recebimento confirmado
          </div>
        )}
      </div>
    );
  }

  // ── LISTA ────────────────────────────────────────────────────────────────
  const pendentes = protocolos.filter((p) => p.etapas !== "concluido");
  const concluidos = protocolos.filter((p) => p.etapas === "concluido");

  return (
    <div className="space-y-4 pb-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold" style={{ color: T.creme }}>
          Protocolos
        </h2>
        <button
          onClick={() => loadLista()}
          className="text-[11px] px-3 py-1 rounded-lg"
          style={{ backgroundColor: T.card, color: T.sage }}
        >
          Atualizar
        </button>
      </div>

      {/* Botões de criar */}
      <div className="flex gap-2">
        <button
          onClick={() => abrirCriar("ida")}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold active:scale-[0.97] transition-all"
          style={{ backgroundColor: "rgba(219,152,100,0.18)", color: T.dourado, border: `1px solid rgba(219,152,100,0.3)` }}
        >
          <Plus size={15} /> Novo Ida
        </button>
        <button
          onClick={() => abrirCriar("volta")}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold active:scale-[0.97] transition-all"
          style={{ backgroundColor: "rgba(16,185,129,0.13)", color: "#6EE7B7", border: `1px solid rgba(16,185,129,0.25)` }}
        >
          <Plus size={15} /> Novo Volta
        </button>
      </div>

      {loadingLista ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin" style={{ color: T.sage }} />
        </div>
      ) : protocolos.length === 0 ? (
        <div
          className="rounded-2xl p-10 flex flex-col items-center gap-3"
          style={{ backgroundColor: T.card, border: `1px solid ${T.border}` }}
        >
          <Truck size={40} style={{ color: "rgba(128,167,149,0.35)" }} />
          <p className="text-sm" style={{ color: T.sage }}>Nenhum protocolo encontrado</p>
          <p className="text-[11px] text-center" style={{ color: "rgba(128,167,149,0.5)" }}>
            Crie um novo protocolo acima
          </p>
        </div>
      ) : (
        <>
          {pendentes.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: T.sage }}>
                Em andamento ({pendentes.length})
              </p>
              {pendentes.map((p) => (
                <ProtocoloCard key={p.id} protocolo={p} onClick={() => selectProtocolo(p)} />
              ))}
            </div>
          )}
          {concluidos.length > 0 && (
            <div className="space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider mt-2" style={{ color: "rgba(128,167,149,0.5)" }}>
                Concluídos ({concluidos.length})
              </p>
              {concluidos.slice(0, 10).map((p) => (
                <ProtocoloCard key={p.id} protocolo={p} onClick={() => selectProtocolo(p)} dim />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Card de protocolo ─────────────────────────────────────────────────────
function ProtocoloCard({
  protocolo: p,
  onClick,
  dim = false,
}: {
  protocolo: Protocolo;
  onClick: () => void;
  dim?: boolean;
}) {
  const ida = p.direcao === "ida";
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left active:scale-[0.98] transition-all"
      style={{
        backgroundColor: dim ? "rgba(255,255,255,0.04)" : T.card,
        border: `1px solid ${T.border}`,
        opacity: dim ? 0.65 : 1,
      }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: ida ? "rgba(219,152,100,0.18)" : "rgba(16,185,129,0.15)" }}
      >
        <Truck
          size={22}
          style={{ color: ida ? T.dourado : "#6EE7B7", transform: ida ? undefined : "scaleX(-1)" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-sm" style={{ color: T.creme }}>#{p.id}</span>
          <EtapaBadge etapa={p.etapas} direcao={p.direcao} />
        </div>
        <p className="text-[11px]" style={{ color: T.sage }}>
          {ida ? "Loja → Fábrica" : "Fábrica → Loja"}
          {p.total_ordens != null ? ` · ${p.total_ordens} ordens` : ""}
        </p>
      </div>
      <ChevronRight size={16} style={{ color: "rgba(128,167,149,0.4)" }} />
    </button>
  );
}
