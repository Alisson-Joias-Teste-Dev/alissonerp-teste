"use client";

import { useState, useEffect, useRef } from "react";
import { X, AlertCircle, RotateCcw, ImageIcon } from "lucide-react";
import { S } from "@/components/layout/ServiceLayout";

interface Props {
  titulo?: string;
  dica?: string;
  onCapture: (base64: string, preview: string) => void;
  onCancel: () => void;
}

// ── Câmera fullscreen com borda dourada ───────────────────────────────────────
export default function ServiceCamera({ titulo = "Tirar foto", dica = "Enquadre a peça", onCapture, onCancel }: Props) {
  const videoRef           = useRef<HTMLVideoElement>(null);
  const fileRef            = useRef<HTMLInputElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady]   = useState(false);
  const [error, setError]   = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let captured: MediaStream | null = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Câmera não disponível. Use o botão abaixo para selecionar uma foto.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } })
      .then((s) => {
        if (!active) { s.getTracks().forEach(t => t.stop()); return; }
        captured = s;
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() => setError("Câmera não disponível. Use o botão abaixo para selecionar uma foto."));

    return () => {
      active = false;
      captured?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Parar stream ao desmontar
  useEffect(() => {
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, [stream]);

  function capturar() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    stream?.getTracks().forEach(t => t.stop());
    setPreview(dataUrl);
  }

  function confirmar() {
    if (preview) onCapture(preview, preview);
  }

  function refazer() {
    setPreview(null);
    // Reiniciar câmera
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Câmera não disponível. Use o botão abaixo para selecionar uma foto.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } } })
      .then((s) => {
        setStream(s);
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.onloadedmetadata = () => setReady(true);
        }
      })
      .catch(() => setError("Não foi possível reiniciar a câmera."));
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setPreview(result);
    };
    reader.readAsDataURL(file);
  }

  // ── Preview: confirmar ou refazer ──────────────────────────────────────────
  if (preview) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-black">
        <div className="relative flex-1 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" className="w-full h-full object-contain" />
          {/* Moldura dourada */}
          <div
            className="absolute inset-6 rounded-2xl pointer-events-none"
            style={{ border: `2px solid rgba(212,175,55,0.5)` }}
          />
        </div>
        <div
          className="flex items-center justify-between px-8 py-5 shrink-0"
          style={{ backgroundColor: "rgba(0,0,0,0.9)", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={refazer}
            className="flex flex-col items-center gap-1.5"
          >
            <RotateCcw size={22} color="rgba(255,255,255,0.7)" />
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>Refazer</span>
          </button>

          <button
            onClick={confirmar}
            className="w-20 h-20 rounded-full flex items-center justify-center font-semibold text-sm"
            style={{ backgroundColor: S.gold, color: "#1a1a1a" }}
          >
            OK
          </button>

          <button
            onClick={onCancel}
            className="flex flex-col items-center gap-1.5"
          >
            <X size={22} color="rgba(255,255,255,0.7)" />
            <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.5)" }}>Cancelar</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Erro de câmera: fallback para file input ───────────────────────────────
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 p-8" style={{ backgroundColor: "#0a1a16" }}>
        <AlertCircle size={44} color="#EF4444" />
        <p className="text-white text-sm text-center">{error}</p>

        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-semibold text-sm"
          style={{ backgroundColor: S.gold, color: "#1a1a1a" }}
        >
          <ImageIcon size={18} />
          Selecionar foto da galeria
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        <button onClick={onCancel} className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
          Cancelar
        </button>
      </div>
    );
  }

  // ── Câmera ao vivo ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Video */}
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />

        {/* Moldura dourada */}
        <div
          className="absolute inset-8 rounded-2xl pointer-events-none"
          style={{ border: `2px solid rgba(212,175,55,0.55)` }}
        />

        {/* Título e dica */}
        <div className="absolute top-5 left-0 right-0 text-center">
          <p className="text-xs font-semibold" style={{ color: S.gold }}>{titulo}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.5)" }}>{dica}</p>
        </div>

        {/* Botão fechar */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          <X size={16} color="white" />
        </button>
      </div>

      {/* Controles */}
      <div
        className="flex items-center justify-between px-10 py-5 shrink-0"
        style={{ backgroundColor: "rgba(0,0,0,0.88)", paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
      >
        {/* Galeria fallback */}
        <button
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center gap-1.5"
        >
          <ImageIcon size={22} color="rgba(255,255,255,0.5)" />
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>Galeria</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

        {/* Shutter */}
        <button
          onClick={capturar}
          disabled={!ready}
          className="w-[70px] h-[70px] rounded-full disabled:opacity-30 active:scale-90 transition-transform"
          style={{
            background: "radial-gradient(circle at 40% 35%, rgba(255,255,255,0.95), rgba(212,175,55,0.4))",
            border: "4px solid rgba(212,175,55,0.45)",
          }}
          aria-label="Capturar foto"
        />

        {/* Cancelar */}
        <button onClick={onCancel} className="flex flex-col items-center gap-1.5">
          <X size={22} color="rgba(255,255,255,0.5)" />
          <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>Cancelar</span>
        </button>
      </div>
    </div>
  );
}
