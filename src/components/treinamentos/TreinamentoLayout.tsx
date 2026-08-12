"use client";

import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import TreinamentoPlayer, { type PassoTreino } from "./TreinamentoPlayer";
import { CT } from "./cenario";

/**
 * LAYOUT PADRÃO DE TREINAMENTO — a casca de toda página de treinamento.
 *
 * REGRA DE NEGÓCIO: todo treinamento de módulo segue o MESMO formato: regra de
 * ouro → passo a passo guiado → prática (opcional) → cola rápida dos status.
 * POR QUE: consistência (a pessoa aprende o formato uma vez e vale pra todos) e
 * treinamento novo custa só o conteúdo.
 * IMPACTO SE ALTERADO: muda TODAS as páginas de treinamento.
 */

export interface ColaItem { chip: React.ReactNode; txt: string }

export interface TreinamentoLayoutProps {
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
  titulo, subtitulo, regraDeOuro,
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
