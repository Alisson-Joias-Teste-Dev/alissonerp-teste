"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, Loader2, Camera, Video, Square, CheckSquare,
  StopCircle, Play, Upload, Trash2, Settings,
} from "lucide-react";
import { compressImage } from "./_shared/compressImage";
import { C } from "./_shared/constants";
import { ProdutoBuscaOrdem } from "./_shared/ProdutoBuscaOrdem";
import type { ProdutoBusca } from "./_shared/types";

// ─── Types ────────────────────────────────────────────────────────────────────
type Produto = ProdutoBusca;

interface TipoServico {
  id: number;
  nome: string;
  ativo: boolean;
}

export interface NovaOrdemServicoInternoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  userId: string;
  userName: string;
}

/** Detecta o melhor mimeType suportado pelo MediaRecorder */
function getMimeType(): string {
  const types = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
    "video/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const t of types) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return "";
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NovaOrdemServicoInternoModal({
  isOpen,
  onClose,
  onSuccess,
  userId,
  userName,
}: NovaOrdemServicoInternoModalProps) {
  // ── Busca de produto ──────────────────────────────────────────────────────
  const [produto, setProduto]       = useState<Produto | null>(null);

  // ── Tipos de serviço ──────────────────────────────────────────────────────
  const [tiposServico, setTiposServico]           = useState<TipoServico[]>([]);
  const [tiposSelecionados, setTiposSelecionados] = useState<number[]>([]);
  const [loadingTipos, setLoadingTipos]           = useState(false);

  // ── Foto da peça ──────────────────────────────────────────────────────────
  const [foto, setFoto]               = useState<{ file: File; preview: string } | null>(null);
  const fotoInputRef                  = useRef<HTMLInputElement>(null);

  // ── Vídeo ─────────────────────────────────────────────────────────────────
  const mediaRecorderSupported = typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    getMimeType() !== "";

  // Modo: "gravar" | "upload"
  const [videoMode, setVideoMode]       = useState<"gravar" | "upload">("gravar");
  const [video, setVideo]               = useState<{ blob: Blob; url: string; ext: string } | null>(null);

  // Gravação
  const [gravando, setGravando]         = useState(false);
  const [streamAtivo, setStreamAtivo]   = useState(false);
  const [recSecs, setRecSecs]           = useState(0);
  const streamRef                       = useRef<MediaStream | null>(null);
  const mediaRecorderRef                = useRef<MediaRecorder | null>(null);
  const chunksRef                       = useRef<Blob[]>([]);
  const videoPreviewRef                 = useRef<HTMLVideoElement>(null);
  const videoPlaybackRef                = useRef<HTMLVideoElement>(null);
  const timerRef                        = useRef<ReturnType<typeof setInterval> | null>(null);
  const [erroCamera, setErroCamera]     = useState<string | null>(null);

  // Upload arquivo
  const videoInputRef                   = useRef<HTMLInputElement>(null);
  const [videoUploadErro, setVideoUploadErro] = useState<string | null>(null);

  // ── Submit ────────────────────────────────────────────────────────────────
  const [salvando, setSalvando]   = useState(false);
  const [erro, setErro]           = useState<string | null>(null);
  const [toast, setToast]         = useState<string | null>(null);

  // ── Carregar tipos de serviço ao montar ───────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setLoadingTipos(true);
    fetch("/api/tipos-servico")
      .then(r => r.ok ? r.json() : { tipos: [] })
      .then(d => setTiposServico(d.tipos ?? []))
      .catch(() => setTiposServico([]))
      .finally(() => setLoadingTipos(false));
  }, [isOpen]);

  // ── Cleanup ao fechar ─────────────────────────────────────────────────────
  const pararStream = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try { mediaRecorderRef.current.stop(); } catch { /* ignore */ }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoPreviewRef.current) {
      videoPreviewRef.current.srcObject = null;
    }
    setGravando(false);
    setStreamAtivo(false);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      pararStream();
      // Cleanup URLs
      if (foto) URL.revokeObjectURL(foto.preview);
      if (video) URL.revokeObjectURL(video.url);
      // Reset state
      setProduto(null);
      setTiposSelecionados([]);
      setFoto(null);
      setVideo(null);
      setErroCamera(null);
      setVideoUploadErro(null);
      setErro(null);
      setRecSecs(0);
      chunksRef.current = [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function selecionarProduto(p: Produto) {
    setProduto(p);
  }

  function removerProduto() { setProduto(null); }

  // ── Toggle tipo de serviço ────────────────────────────────────────────────
  function toggleTipo(id: number) {
    setTiposSelecionados(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  // ── Foto ──────────────────────────────────────────────────────────────────
  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (foto) URL.revokeObjectURL(foto.preview);
    setFoto({ file, preview: URL.createObjectURL(file) });
    e.target.value = "";
  }

  function removerFoto() {
    if (foto) URL.revokeObjectURL(foto.preview);
    setFoto(null);
  }

  // ── Vídeo — Gravação ──────────────────────────────────────────────────────
  async function iniciarCamera() {
    setErroCamera(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
        videoPreviewRef.current.muted = true;
        videoPreviewRef.current.play().catch(() => {});
      }
      setStreamAtivo(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErroCamera(`Câmera não acessível: ${msg}`);
    }
  }

  function iniciarGravacao() {
    if (!streamRef.current) return;
    const mimeType = getMimeType();
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    chunksRef.current = [];
    const mr = new MediaRecorder(streamRef.current, mimeType ? { mimeType } : undefined);
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "video/webm" });
      if (video) URL.revokeObjectURL(video.url);
      const url = URL.createObjectURL(blob);
      setVideo({ blob, url, ext });
      pararStream();
    };
    mr.start(100);
    setGravando(true);
    setRecSecs(0);
    timerRef.current = setInterval(() => setRecSecs(s => s + 1), 1000);
  }

  function pararGravacao() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }

  function descartarVideo() {
    if (video) URL.revokeObjectURL(video.url);
    setVideo(null);
    setRecSecs(0);
    chunksRef.current = [];
    pararStream();
  }

  // ── Vídeo — Upload ────────────────────────────────────────────────────────
  function handleVideoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    setVideoUploadErro(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setVideoUploadErro("Arquivo muito grande (máx 100MB)");
      e.target.value = "";
      return;
    }
    const allowedTypes = ["video/mp4", "video/webm", "video/quicktime", "video/avi", "video/x-msvideo"];
    if (!allowedTypes.some(t => file.type.startsWith(t.split("/")[0]) && file.type.includes(t.split("/")[1])) &&
        !file.type.startsWith("video/")) {
      setVideoUploadErro("Tipo de arquivo inválido. Use MP4, WebM ou MOV.");
      e.target.value = "";
      return;
    }
    const ext = file.name.split(".").pop() ?? "mp4";
    if (video) URL.revokeObjectURL(video.url);
    const url = URL.createObjectURL(file);
    setVideo({ blob: file, url, ext });
    e.target.value = "";
  }

  // ── Validação form ────────────────────────────────────────────────────────
  const canSubmit = !salvando &&
    produto !== null &&
    tiposSelecionados.length > 0 &&
    foto !== null &&
    video !== null;

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit || !produto || !foto || !video) return;
    setSalvando(true);
    setErro(null);

    let fotoPath: string | null = null;
    let videoPath: string | null = null;

    try {
      // 1. Comprimir e fazer upload da foto
      const fotoBase64 = await compressImage(foto.file);
      if (!fotoBase64) throw new Error("Erro ao processar foto");

      const fotoKey = `servico/${Date.now()}_foto.jpg`;
      const fotoRes = await fetch("/api/ordens/upload-arquivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "ordem-fotos", path: fotoKey, base64: fotoBase64, contentType: "image/jpeg" }),
      });
      if (!fotoRes.ok) {
        const d = await fotoRes.json();
        throw new Error(d.error ?? "Erro ao enviar foto");
      }
      const fotoData = await fotoRes.json();
      fotoPath = fotoData.url ?? fotoData.path;

      // 2. Upload do vídeo
      const videoExt = video.ext;
      const videoKey = `servico/${Date.now()}_video.${videoExt}`;
      const videoContentType = videoExt === "mp4" ? "video/mp4" : videoExt === "mov" ? "video/quicktime" : "video/webm";

      // Converter Blob para base64
      const videoBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Erro ao ler vídeo"));
        reader.readAsDataURL(video.blob);
      });

      const videoRes = await fetch("/api/ordens/upload-arquivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "ordem-videos", path: videoKey, base64: videoBase64, contentType: videoContentType }),
      });
      if (!videoRes.ok) {
        const d = await videoRes.json();
        // Cleanup foto
        await fetch("/api/ordens/upload-arquivo", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bucket: "ordem-fotos", path: fotoKey }),
        }).catch(() => {});
        throw new Error(d.error ?? "Erro ao enviar vídeo");
      }
      const videoData = await videoRes.json();
      videoPath = videoData.url ?? videoData.path;

      // 3. Criar ordem
      const res = await fetch("/api/ordens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo_ordem:        "servico_interno",
          origem:            "erp",
          rota:              "pcp",
          created_by:        userId,
          foto_peca_servico: fotoPath,
          video_observacao:  videoPath,
          tipos_servico_ids: tiposSelecionados,
          itens: [{
            produto_id:    produto.id_produto,
            nome_produto:  produto.nome,
            sku:           produto.sku,
            quantidade:    1,
            peso_estimado: produto.peso_precificado != null ? Number(produto.peso_precificado) : null,
          }],
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        // Best-effort cleanup
        await Promise.allSettled([
          fetch("/api/ordens/upload-arquivo", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket: "ordem-fotos", path: fotoKey }),
          }),
          fetch("/api/ordens/upload-arquivo", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket: "ordem-videos", path: videoKey }),
          }),
        ]);
        throw new Error(d.error ?? "Erro ao criar ordem");
      }

      const data = await res.json();
      setToast(`Ordem ${data.numero_ordem} criada com sucesso!`);
      setTimeout(() => {
        setToast(null);
        onClose();
        onSuccess?.();
      }, 1500);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSalvando(false);
    }
  }

  if (!isOpen) return null;

  const agora = new Date();
  const dataHoraStr = agora.toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }) + " " + agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  // ─── JSX ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        onClick={onClose}
      >
        {/* Painel */}
        <div
          className="w-full md:max-w-xl md:rounded-2xl rounded-t-2xl overflow-hidden flex flex-col shadow-2xl"
          style={{ backgroundColor: "#fff", maxHeight: "92vh" }}
          onClick={e => e.stopPropagation()}
        >
          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div
            className="px-5 py-4 flex items-center justify-between border-b shrink-0"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: "#DCFCE7" }}
              >
                <Settings size={17} style={{ color: "#166534" }} />
              </div>
              <div>
                <h2
                  className="text-base font-semibold leading-tight"
                  style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}
                >
                  Serviço Interno
                </h2>
                <span
                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: "#DCFCE7", color: "#166534" }}
                >
                  Nova Ordem
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Fechar"
            >
              <X size={18} style={{ color: "#6B7280" }} />
            </button>
          </div>

          {/* ── Body ────────────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

            {/* Responsável + Data/Hora */}
            <div
              className="grid grid-cols-2 gap-3 px-4 py-3 rounded-xl text-sm"
              style={{ backgroundColor: C.bg, border: `1px solid ${C.cremeBorder}` }}
            >
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "#9CA3AF" }}>
                  Responsável
                </p>
                <p className="font-medium truncate" style={{ color: "#1A1A1A" }}>{userName}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "#9CA3AF" }}>
                  Data / Hora
                </p>
                <p className="font-medium" style={{ color: "#1A1A1A" }}>{dataHoraStr}</p>
              </div>
            </div>

            {/* ── Produto ──────────────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
                Produto <span style={{ color: "#EF4444" }}>*</span>
              </p>

              {!produto ? (
                <ProdutoBuscaOrdem onSelecionar={selecionarProduto} />
              ) : (
                <div
                  className="rounded-xl border p-4 flex items-center justify-between"
                  style={{ borderColor: "#166534", backgroundColor: "#F0FDF4" }}
                >
                  <div className="min-w-0 mr-2">
                    <p className="font-semibold text-sm truncate" style={{ color: "#1A1A1A" }}>{produto.nome}</p>
                    <p className="text-xs mt-0.5" style={{ color: "#6B7280" }}>
                      {produto.sku}{produto.tipo_metal ? ` · ${produto.tipo_metal}` : ""}
                      {produto.peso_precificado != null && <> · {Number(produto.peso_precificado).toFixed(2)}g</>}
                    </p>
                  </div>
                  <button
                    onClick={removerProduto}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <X size={14} style={{ color: "#166534" }} />
                  </button>
                </div>
              )}
            </div>

            {/* ── Tipos de Serviço ─────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
                Tipos de Serviço <span style={{ color: "#EF4444" }}>*</span>
                <span className="ml-1 text-[10px] font-normal lowercase" style={{ color: "#9CA3AF" }}>
                  (mín. 1)
                </span>
              </p>
              {loadingTipos ? (
                <div className="flex items-center gap-2 py-2" style={{ color: "#9CA3AF" }}>
                  <Loader2 size={13} className="animate-spin" />
                  <span className="text-xs">Carregando...</span>
                </div>
              ) : tiposServico.length === 0 ? (
                <p className="text-sm" style={{ color: "#9CA3AF" }}>Nenhum tipo cadastrado em configurações.</p>
              ) : (
                <div className="space-y-2">
                  {tiposServico.map(t => {
                    const checked = tiposSelecionados.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTipo(t.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors"
                        style={{
                          borderColor:     checked ? "#166534" : C.cremeBorder,
                          backgroundColor: checked ? "#F0FDF4" : "#fff",
                        }}
                      >
                        {checked
                          ? <CheckSquare size={16} style={{ color: "#166534", flexShrink: 0 }} />
                          : <Square      size={16} style={{ color: "#9CA3AF", flexShrink: 0 }} />
                        }
                        <span className="text-sm font-medium" style={{ color: "#1A1A1A" }}>{t.nome}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Foto da Peça ─────────────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
                Foto da Peça <span style={{ color: "#EF4444" }}>*</span>
              </p>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFotoChange}
              />
              {foto ? (
                <div className="relative inline-block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={foto.preview}
                    alt="Foto da peça"
                    className="w-32 h-32 object-cover rounded-xl border"
                    style={{ borderColor: "#166534" }}
                  />
                  <button
                    onClick={removerFoto}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center shadow-sm"
                    style={{ backgroundColor: "#EF4444" }}
                    aria-label="Remover foto"
                  >
                    <X size={12} color="#fff" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fotoInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed transition-colors hover:bg-gray-50 text-sm"
                  style={{ borderColor: C.cremeBorder }}
                >
                  <Camera size={16} style={{ color: "#9CA3AF" }} />
                  <span style={{ color: "#9CA3AF" }}>Tirar foto da peça</span>
                </button>
              )}
            </div>

            {/* ── Vídeo de Observação ───────────────────────────────────────── */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#6B7280" }}>
                Vídeo de Observação <span style={{ color: "#EF4444" }}>*</span>
              </p>

              {/* Seletor de modo (só mostra se MediaRecorder suportado) */}
              {mediaRecorderSupported && !video && (
                <div
                  className="flex gap-1 rounded-xl p-1 mb-3 w-fit"
                  style={{ backgroundColor: C.bg, border: `1px solid ${C.cremeBorder}` }}
                >
                  {(["gravar", "upload"] as const).map(m => (
                    <button
                      key={m}
                      onClick={() => { setVideoMode(m); setErroCamera(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: videoMode === m ? "#fff" : "transparent",
                        color:           videoMode === m ? "#1A1A1A" : "#6B7280",
                        boxShadow:       videoMode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                      }}
                    >
                      {m === "gravar" ? <Video size={13} /> : <Upload size={13} />}
                      {m === "gravar" ? "Gravar" : "Upload"}
                    </button>
                  ))}
                </div>
              )}

              {/* Vídeo gravado/uploaded — preview */}
              {video ? (
                <div className="space-y-2">
                  <video
                    ref={videoPlaybackRef}
                    src={video.url}
                    controls
                    className="w-full rounded-xl"
                    style={{ maxHeight: "200px", backgroundColor: "#000" }}
                  />
                  <button
                    onClick={descartarVideo}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors"
                    style={{ borderColor: "#FCA5A5", color: "#B91C1C", backgroundColor: "#FEF2F2" }}
                  >
                    <Trash2 size={13} /> Descartar vídeo
                  </button>
                </div>
              ) : videoMode === "gravar" && mediaRecorderSupported ? (
                /* Modo gravação */
                <div className="space-y-3">
                  {/* Preview ao vivo */}
                  <div
                    className="rounded-xl overflow-hidden relative"
                    style={{ backgroundColor: "#000", minHeight: streamAtivo ? "180px" : "0" }}
                  >
                    {streamAtivo && (
                      <video
                        ref={videoPreviewRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full rounded-xl"
                        style={{ maxHeight: "200px" }}
                      />
                    )}
                    {gravando && (
                      <div
                        className="absolute top-2 left-2 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                        style={{ backgroundColor: "rgba(239,68,68,0.9)", color: "#fff" }}
                      >
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        REC {formatTime(recSecs)}
                      </div>
                    )}
                  </div>

                  {/* Erro câmera */}
                  {erroCamera && (
                    <div
                      className="text-xs px-3 py-2 rounded-lg"
                      style={{ backgroundColor: "#FEF2F2", color: "#B91C1C", border: "1px solid #FCA5A5" }}
                    >
                      {erroCamera}
                    </div>
                  )}

                  {/* Botões */}
                  <div className="flex items-center gap-2">
                    {!streamAtivo && !gravando && (
                      <button
                        onClick={iniciarCamera}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                        style={{ backgroundColor: C.esmeralda, color: "#fff" }}
                      >
                        <Video size={15} /> Iniciar câmera
                      </button>
                    )}
                    {streamAtivo && !gravando && (
                      <button
                        onClick={iniciarGravacao}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                        style={{ backgroundColor: "#DC2626", color: "#fff" }}
                      >
                        <Play size={15} /> Gravar
                      </button>
                    )}
                    {gravando && (
                      <button
                        onClick={pararGravacao}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
                        style={{ backgroundColor: "#7F1D1D", color: "#fff" }}
                      >
                        <StopCircle size={15} /> Parar gravação
                      </button>
                    )}
                    {(streamAtivo || gravando) && (
                      <button
                        onClick={pararStream}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm border"
                        style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* Modo upload */
                <div className="space-y-2">
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleVideoUpload}
                  />
                  <button
                    onClick={() => { setVideoUploadErro(null); videoInputRef.current?.click(); }}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed transition-colors hover:bg-gray-50 text-sm"
                    style={{ borderColor: C.cremeBorder }}
                  >
                    <Upload size={16} style={{ color: "#9CA3AF" }} />
                    <span style={{ color: "#9CA3AF" }}>Selecionar vídeo (máx 100MB)</span>
                  </button>
                  {videoUploadErro && (
                    <div
                      className="text-xs px-3 py-2 rounded-lg"
                      style={{ backgroundColor: "#FEF2F2", color: "#B91C1C", border: "1px solid #FCA5A5" }}
                    >
                      {videoUploadErro}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Erro geral */}
            {erro && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ backgroundColor: "#FEF2F2", border: "1px solid #FCA5A5", color: "#B91C1C" }}
              >
                {erro}
              </div>
            )}
          </div>

          {/* ── Footer ───────────────────────────────────────────────────────── */}
          <div
            className="px-5 py-4 border-t flex items-center justify-between gap-3 shrink-0"
            style={{ borderColor: C.cremeBorder, backgroundColor: C.bg }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium border transition-colors hover:bg-gray-50"
              style={{ borderColor: C.cremeBorder, color: "#6B7280" }}
            >
              Cancelar
            </button>

            {/* Indicadores de preenchimento */}
            <div className="flex items-center gap-1.5">
              {[
                { ok: produto !== null,            label: "Produto" },
                { ok: tiposSelecionados.length > 0, label: "Tipo" },
                { ok: foto !== null,               label: "Foto" },
                { ok: video !== null,              label: "Vídeo" },
              ].map(({ ok, label }) => (
                <span
                  key={label}
                  className="w-2 h-2 rounded-full"
                  title={label}
                  style={{ backgroundColor: ok ? "#166534" : "#D1D5DB" }}
                />
              ))}
            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-medium text-white transition-opacity"
              style={{
                backgroundColor: canSubmit ? C.esmeralda : "#9CA3AF",
                cursor: canSubmit ? "pointer" : "not-allowed",
                opacity: canSubmit ? 1 : 0.7,
              }}
            >
              {salvando ? (
                <><Loader2 size={14} className="animate-spin" /> Criando...</>
              ) : (
                "Criar Ordem"
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-[60] px-5 py-3 rounded-xl shadow-lg text-sm font-medium text-white"
          style={{ backgroundColor: C.esmeralda }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
