"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Info, Upload, Loader2 } from "lucide-react";
import TreinamentoPlayer, { type PassoTreino } from "./TreinamentoPlayer";
import { CT } from "./cenario";

/**
 * LAYOUT PADRÃO DE TREINAMENTO — a casca de toda página de treinamento.
 *
 * REGRA DE NEGÓCIO: todo treinamento de módulo segue o MESMO formato aprovado
 * pelo Jonathan (16/07/2026): regra de ouro → vídeo (se houver) → passo a passo
 * guiado → prática (opcional) → cola rápida dos status.
 * POR QUE: consistência (a pessoa aprende o formato uma vez e vale pra todos) e
 * treinamento novo custa só o conteúdo.
 * IMPACTO SE ALTERADO: muda TODAS as páginas de treinamento.
 *
 * Receita: `.claude/commands/treinamento.md`.
 */

// ─── Vídeo gravado (opcional; upload só pro desenvolvedor) ────────────────────
function VideoTreinamento({ videoUrl, isDev, treinamentoKey }: { videoUrl: string | null; isDev: boolean; treinamentoKey: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  if (!videoUrl && !isDev) return null;

  async function enviar(file: File) {
    setErro("");
    if (file.size > 37 * 1024 * 1024) { setErro("Vídeo muito grande (máx ~37MB)."); return; }
    setEnviando(true);
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file);
      });
      const resp = await fetch("/api/treinamentos/video", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treinamento_key: treinamentoKey, base64, mime: file.type || "video/mp4" }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error ?? `Erro ${resp.status}`);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar vídeo");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mb-6">
      {videoUrl ? (
        <video controls preload="metadata" className="w-full rounded-2xl border" style={{ borderColor: CT.cremeBorder, background: "#000", maxHeight: 420 }} src={videoUrl} />
      ) : (
        isDev && (
          <div className="rounded-2xl border border-dashed p-4 text-center" style={{ borderColor: CT.cremeBorder, background: CT.cremeBg }}>
            <p className="text-sm" style={{ color: "#6B7280" }}>Sem vídeo gravado — o passo a passo guiado abaixo já ensina o fluxo inteiro.</p>
          </div>
        )
      )}
      {isDev && (
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-lg cursor-pointer" style={{ background: "#18403612", color: CT.esmeralda }}>
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {enviando ? "Enviando…" : videoUrl ? "Trocar vídeo" : "Anexar vídeo"}
            <input type="file" accept="video/*" className="hidden" disabled={enviando}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) enviar(f); }} />
          </label>
          <span className="text-[12px]" style={{ color: "#9CA3AF" }}>Só o desenvolvedor vê este botão · máx ~37MB</span>
          {erro && <span className="text-[12px]" style={{ color: "#DC2626" }}>{erro}</span>}
        </div>
      )}
    </div>
  );
}

export interface ColaItem { chip: React.ReactNode; txt: string }

export interface TreinamentoLayoutProps {
  /** Vem da page.tsx do treinamento (server) — não invente. */
  videoUrl: string | null;
  isDev: boolean;
  treinamentoKey: string;
  titulo: string;
  /** 1-2 linhas: o que o módulo resolve, em português de loja. */
  subtitulo: string;
  /** A regra que não pode ser esquecida (ex.: "foto em toda troca de mão"). */
  regraDeOuro?: React.ReactNode;
  passos: PassoTreino[];
  /** "Cola rápida": o que cada status quer dizer. Opcional. */
  cola?: ColaItem[];
  /** Bloco de prática (simulador interativo do módulo). Opcional. */
  children?: React.ReactNode;
  /** Título do bloco de prática. */
  praticaTitulo?: string;
  praticaSub?: React.ReactNode;
}

export default function TreinamentoLayout({
  videoUrl, isDev, treinamentoKey, titulo, subtitulo, regraDeOuro,
  passos, cola, children, praticaTitulo = "Pratique você mesmo", praticaSub,
}: TreinamentoLayoutProps) {
  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-3xl">
      <Link href="/treinamentos" className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: CT.esmeralda }}>
        <ArrowLeft size={15} /> Central de Treinamentos
      </Link>

      <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: CT.esmeralda }}>
        {titulo}
      </h2>
      <p className="text-sm mt-1 mb-5" style={{ color: "#6B7280" }}>{subtitulo}</p>

      {regraDeOuro && (
        <div className="flex items-start gap-2.5 rounded-xl border p-3 mb-6" style={{ borderColor: CT.cremeBorder, background: CT.cremeBg }}>
          <Info size={16} className="mt-0.5 shrink-0" style={{ color: CT.esmeralda }} />
          <p className="text-[13px]" style={{ color: "#4B5563" }}>
            <b style={{ color: "#111827" }}>Regra de ouro:</b> {regraDeOuro}
          </p>
        </div>
      )}

      <VideoTreinamento videoUrl={videoUrl} isDev={isDev} treinamentoKey={treinamentoKey} />

      <h3 className="text-base font-semibold mb-1" style={{ color: "#111827" }}>O fluxo inteiro, passo a passo</h3>
      <p className="text-[13px] mb-3" style={{ color: "#6B7280" }}>
        Toca sozinho. Pause, volte ou pule pra qualquer passo — as telas são as mesmas do sistema.
      </p>
      <TreinamentoPlayer passos={passos} />

      {children && (
        <>
          <h3 className="text-base font-semibold mt-8 mb-1" style={{ color: "#111827" }}>{praticaTitulo}</h3>
          {praticaSub && <p className="text-[13px] mb-3" style={{ color: "#6B7280" }}>{praticaSub}</p>}
          {children}
        </>
      )}

      {cola && cola.length > 0 && (
        <>
          <h3 className="text-base font-semibold mt-8 mb-3" style={{ color: "#111827" }}>Cola rápida — o que cada status quer dizer</h3>
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
            {cola.map((l, idx) => (
              <div key={idx} className="flex items-start gap-3 px-4 py-2.5" style={{ borderTop: idx === 0 ? "none" : `1px solid ${CT.cremeBorder}` }}>
                <span className="shrink-0 pt-0.5">{l.chip}</span>
                <span className="text-[13px]" style={{ color: "#4B5563" }}>{l.txt}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
