"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Clock, AlertTriangle, Volume2, VolumeX } from "lucide-react";

interface ReservaAlerta {
  venda_id: number;
  numero_venda: string;
  dias_restantes: number;
  ultimo_dia: boolean;
  valor_pendente: number;
}

const POLL_INTERVAL_MS = 60_000; // 60s — reserva é urgência diária, não de segundos
const POLL_BACKOFF_MS  = 120_000;
const TICK_INTERVAL_MS = 2000;   // bip a cada 2s — SÓ no último dia
const TICK_FREQUENCY   = 760;
const TICK_DURATION_S  = 0.18;

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * ReservaAlarme — faixa global das reservas (crediário ③) perto de virar
 * vale-crédito, para a CONSULTORA logada. Espelha o MencaoAlarme, mas:
 *  - sem som nos avisos normais; bip SÓ no último dia ("amanhã vira VC");
 *  - "ok" esconde a faixa por hoje (localStorage por data), volta amanhã.
 * Regra transversal (Jonathan): o alerta tem que aparecer NA TELA, não só no sino.
 */
export default function ReservaAlarme() {
  const [itens, setItens]       = useState<ReservaAlerta[]>([]);
  const [okHoje, setOkHoje]     = useState<boolean>(true); // começa escondido (SSR-safe)
  const [audioReady, setAudioReady] = useState<boolean>(false);
  const audioCtxRef  = useRef<AudioContext | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backoffAteRef = useRef<number | null>(null);
  const inflightCtrlRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // ── Lê o "ok de hoje" do localStorage (SSR-safe: só no client) ──────────
  useEffect(() => {
    setOkHoje(localStorage.getItem("reserva_faixa_ok") === hojeISO());
  }, []);

  const dispensarHoje = useCallback(() => {
    localStorage.setItem("reserva_faixa_ok", hojeISO());
    setOkHoje(true);
  }, []);

  // ── Fetch dos alertas ───────────────────────────────────────────────────
  const fetchAlertas = useCallback(async () => {
    if (backoffAteRef.current && Date.now() < backoffAteRef.current) return;
    if (inflightCtrlRef.current) inflightCtrlRef.current.abort();
    const ctrl = new AbortController();
    inflightCtrlRef.current = ctrl;
    try {
      const r = await fetch("/api/crediario/reserva-alertas", { cache: "no-store", signal: ctrl.signal });
      if (!r.ok) {
        if (r.status === 429 || r.status >= 500) backoffAteRef.current = Date.now() + POLL_BACKOFF_MS;
        setItens([]);
        return;
      }
      backoffAteRef.current = null;
      const data = (await r.json()) as { itens: ReservaAlerta[] };
      setItens(Array.isArray(data.itens) ? data.itens : []);
    } catch {
      backoffAteRef.current = Date.now() + POLL_BACKOFF_MS;
    } finally {
      if (inflightCtrlRef.current === ctrl) inflightCtrlRef.current = null;
    }
  }, []);

  // ── AudioContext (destrava na 1ª interação da página) ──────────────────
  const ensureAudio = useCallback(() => {
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume().catch(() => {});
      setAudioReady(true);
      return audioCtxRef.current;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      const ctx = new AC();
      ctx.resume().catch(() => {});
      audioCtxRef.current = ctx;
      setAudioReady(true);
      return ctx;
    } catch {
      return null;
    }
  }, []);

  const playBip = useCallback((ctx: AudioContext) => {
    try {
      const start = ctx.currentTime;
      const stop  = start + TICK_DURATION_S;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.5, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, stop);
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = TICK_FREQUENCY;
      osc.connect(gain);
      osc.start(start);
      osc.stop(stop + 0.05);
    } catch {
      // falha isolada não quebra o loop
    }
  }, []);

  // Destrava áudio na 1ª interação (política do Chrome)
  useEffect(() => {
    const unlock = () => ensureAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [ensureAudio]);

  // ── Polling (adiado pra após hidratação) ───────────────────────────────
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      fetchAlertas();
      intervalId = setInterval(fetchAlertas, POLL_INTERVAL_MS);
    }, 600);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchAlertas]);

  // ── Bip SÓ no último dia (e só se a faixa está visível) ────────────────
  const temUltimoDia = itens.some((i) => i.ultimo_dia);
  useEffect(() => {
    const stop = () => {
      if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    };
    if (!temUltimoDia || okHoje) { stop(); return; }
    const tick = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return; // ainda não destravado
      if (ctx.state === "suspended") { ctx.resume().catch(() => {}); return; }
      playBip(ctx);
    };
    tick();
    tickTimerRef.current = setInterval(tick, TICK_INTERVAL_MS);
    return stop;
  }, [temUltimoDia, okHoje, playBip]);

  if (okHoje || itens.length === 0) return null;

  const urgente = temUltimoDia;
  const bg = urgente ? "#fef2f2" : "#fffbeb";
  const borda = urgente ? "#d97706" : "#f59e0b";
  const cor = urgente ? "#991b1b" : "#92400e";

  return (
    <div
      className="fixed top-14 md:top-[77px] left-0 md:left-56 right-0 z-[54] shadow-md"
      style={{ background: bg, borderBottom: `2px solid ${borda}`, color: cor }}
      role="alert"
      aria-live="polite"
    >
      <div className="px-4 py-2 flex items-center gap-3 flex-wrap">
        {urgente
          ? <AlertTriangle size={18} className="flex-shrink-0 animate-pulse" strokeWidth={2.25} />
          : <Clock size={18} className="flex-shrink-0" strokeWidth={2.25} />}
        <span className="text-sm font-semibold">
          {itens.length === 1
            ? "1 reserva perto de virar vale-crédito:"
            : `${itens.length} reservas perto de virar vale-crédito:`}
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          {itens.slice(0, 6).map((i) => (
            <button
              key={i.venda_id}
              onClick={() => router.push(`/crediario?venda=${i.venda_id}`)}
              className="text-xs font-mono font-semibold px-2 py-1 rounded border transition-colors hover:bg-white"
              style={{
                borderColor: i.ultimo_dia ? "#dc2626" : borda,
                color: i.ultimo_dia ? "#991b1b" : cor,
                background: i.ultimo_dia ? "#fee2e2" : "transparent",
              }}
              title={`Venda ${i.numero_venda} — R$ ${i.valor_pendente.toFixed(2)} a receber. Abre o crediário para registrar o pagamento.`}
            >
              {i.numero_venda}
              <span className="ml-1 font-normal opacity-80">
                {i.ultimo_dia ? "· amanhã vira VC!" : `· faltam ${i.dias_restantes}d`}
              </span>
            </button>
          ))}
          {itens.length > 6 && <span className="text-xs font-semibold">+{itens.length - 6}</span>}
        </div>

        <button
          onClick={() => router.push("/crediario")}
          className="text-xs underline"
          style={{ color: cor }}
        >
          ver no crediário
        </button>

        {/* Botão "Ativar som" só aparece quando há urgente e o áudio não destravou */}
        {urgente && !audioReady && (
          <button
            onClick={ensureAudio}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm"
            style={{ background: "#dc2626", color: "#fff", border: "1px solid #991b1b" }}
            title="O navegador bloqueia áudio até você interagir. Clique para ativar."
          >
            <VolumeX size={14} strokeWidth={2.5} />
            Ativar som
          </button>
        )}
        {urgente && audioReady && (
          <span className="flex items-center gap-1 text-[10px] opacity-70" title="Áudio ativo">
            <Volume2 size={12} /> som ativo
          </span>
        )}

        <button
          onClick={dispensarHoje}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm transition-colors hover:bg-white"
          style={{ background: "#fff", color: cor, border: `1px solid ${borda}` }}
          title="Esconde a faixa só por hoje. Volta amanhã se a reserva continuar pendente."
        >
          ok, entendi
        </button>

        {/* Espaçador inerte no canto: o badge de ambiente (homolog) fica fixo no
            topo-direito; mantemos o canto livre pra ele não cobrir o "ok". */}
        <span className="ml-auto" aria-hidden="true" />
        <span className="text-[11px] italic hidden lg:block opacity-80">
          finalize o pagamento pra sair daqui
        </span>
      </div>
    </div>
  );
}
