"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, RotateCcw, ChevronRight } from "lucide-react";
import { CT } from "./cenario";

/**
 * PLAYER DE TREINAMENTO — o "vídeo" passo a passo (motor reutilizável).
 *
 * REGRA DE NEGÓCIO (Jonathan, 16/07/2026): todo treinamento de módulo tem que
 * ensinar CADA PASSO do que a pessoa precisa fazer, na tela real, "como se fosse
 * um vídeo". Este é o motor: recebe os passos e entrega o player pronto
 * (toca sozinho, pausa, avança/volta, velocidade, lista clicável).
 *
 * O QUE: cada passo tem QUEM faz, o título da ação, a TELA daquele momento (com
 * o cursor no alvo do clique), a narração, o resultado (status que o registro
 * assume) e — nos passos que mais geram erro — o "por que importa".
 * POR QUE: padroniza o formato aprovado e faz treinamento novo custar só o
 * conteúdo, não a engenharia.
 * IMPACTO SE ALTERADO: muda o comportamento de TODOS os treinamentos.
 *
 * Receita pra criar um treinamento novo: `.claude/commands/treinamento.md`.
 * Exemplo de referência: treinamentos/movimentacao-interna.
 */

export interface PassoTreino {
  /** Quem executa este passo (aparece na tarja). Ex.: "Consultora", "Estoque". */
  quem: string;
  /** A ação, no imperativo curto. Ex.: "Confirmar a entrega — com foto". */
  titulo: string;
  /** A narração do passo. Use `nb()` de ./cenario pra destacar botões/campos. */
  narracao: React.ReactNode;
  /** Só nos passos que geram erro no dia a dia. Explique a consequência real. */
  porque?: string;
  /** O chip do status que o registro assume DEPOIS deste passo. */
  resultado?: React.ReactNode;
  /** A tela daquele momento, montada com as peças de ./cenario. */
  tela: React.ReactNode;
}

const DUR_MS = 5200;

export default function TreinamentoPlayer({ passos }: { passos: PassoTreino[] }) {
  const [i, setI] = useState(0);
  const [tocando, setTocando] = useState(true);
  const [vel, setVel] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Acessibilidade: quem prefere menos animação começa pausado (o conteúdo continua todo lá).
    const reduz = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reduz) setTocando(false);
  }, []);

  useEffect(() => {
    if (!tocando) return;
    // REGRA: no último passo o player PARA (não fica em loop) — é um vídeo, tem fim.
    if (i >= passos.length - 1) { setTocando(false); return; }
    timer.current = setTimeout(() => setI((v) => v + 1), DUR_MS / vel);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [i, tocando, vel, passos.length]);

  const ir = useCallback((idx: number) => {
    setI(Math.max(0, Math.min(passos.length - 1, idx)));
    setTocando(false);
  }, [passos.length]);

  if (passos.length === 0) return null;

  const p = passos[i];
  const fim = i === passos.length - 1;
  const pct = ((i + 1) / passos.length) * 100;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: CT.cremeBorder, background: CT.cremeBg }}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b flex-wrap" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Passo a passo guiado</span>
        <span className="text-[12px]" style={{ color: "#6B7280" }}>
          Passo <b style={{ color: "#111827" }}>{i + 1}</b> de {passos.length}
        </span>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: CT.esmeralda, color: CT.creme }}>{p.quem}</span>
          <span className="text-[14px] font-semibold" style={{ color: "#111827" }}>{p.titulo}</span>
        </div>

        <div className="max-w-sm mx-auto md:mx-0 pr-10">{p.tela}</div>

        <div className="mt-3 rounded-lg px-3 py-2.5" style={{ background: "#fff", borderLeft: `3px solid ${CT.esmeralda}` }}>
          <p className="text-[13px] leading-relaxed" style={{ color: "#374151" }}>{p.narracao}</p>
          {p.resultado && (
            <p className="text-[12px] mt-1.5 flex items-center gap-1.5 flex-wrap" style={{ color: "#6B7280" }}>
              <ChevronRight size={12} /> O registro vira {p.resultado}
            </p>
          )}
        </div>

        {p.porque && (
          <div className="mt-2 rounded-lg px-3 py-2" style={{ background: "#fff", border: `1px dashed ${CT.cremeBorder}` }}>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: CT.esmeralda }}>Por que importa</span>
            <p className="text-[12.5px] mt-0.5 leading-relaxed" style={{ color: "#4B5563" }}>{p.porque}</p>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 px-4 py-3">
        <button onClick={() => ir(i - 1)} disabled={i === 0} className="disabled:opacity-30" aria-label="Passo anterior">
          <SkipBack size={16} style={{ color: "#6B7280" }} />
        </button>
        <button
          onClick={() => { if (fim && !tocando) { setI(0); setTocando(true); } else setTocando((v) => !v); }}
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: CT.esmeralda, color: CT.creme }}
          aria-label={fim && !tocando ? "Assistir de novo" : tocando ? "Pausar" : "Tocar"}
        >
          {fim && !tocando ? <RotateCcw size={14} /> : tocando ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={() => ir(i + 1)} disabled={fim} className="disabled:opacity-30" aria-label="Próximo passo">
          <SkipForward size={16} style={{ color: "#6B7280" }} />
        </button>

        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#D6CFC0" }}>
          <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, background: CT.esmeralda }} />
        </div>

        <button onClick={() => setVel((v) => (v === 1 ? 1.5 : v === 1.5 ? 2 : 1))}
          className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "#18403612", color: CT.esmeralda }}
          aria-label="Mudar velocidade">
          {vel}x
        </button>
      </div>

      <div className="border-t px-2 py-2" style={{ borderColor: CT.cremeBorder }}>
        {passos.map((s, idx) => {
          const ativo = idx === i;
          const feito = idx < i;
          return (
            <button key={`${s.titulo}-${idx}`} onClick={() => ir(idx)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
              style={{ background: ativo ? "#fff" : "transparent" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={feito ? { background: "#E4F1E9", color: "#1C7A4C" } : ativo ? { background: CT.esmeralda, color: CT.creme } : { border: "1px solid #D6CFC0", color: "#9CA3AF" }}>
                {feito ? "✓" : idx + 1}
              </span>
              <span className="text-[12px] truncate" style={{ color: ativo ? "#111827" : feito ? "#6B7280" : "#9CA3AF", fontWeight: ativo ? 600 : 400 }}>
                {s.titulo}
              </span>
              <span className="text-[10px] ml-auto shrink-0" style={{ color: "#C4C9C3" }}>{s.quem}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
