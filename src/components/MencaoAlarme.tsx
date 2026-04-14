"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Volume2, VolumeX, Clock } from "lucide-react";

interface Pendente {
  id: number;
  ordem_id: number | null;
  numero_ordem: string | null;
  titulo: string;
  mensagem: string | null;
  link: string | null;
  remetente_nome: string | null;
  created_at: string;
}

interface Resposta {
  total: number;
  itens: Pendente[];
  silenciado_ate: string | null;
}

// ─── Constantes ────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 10_000; // 10s — rápido o suficiente p/ sentir "agora"
const TICK_INTERVAL_MS = 1000;   // 1 bip por segundo (1s bip, 1s silêncio)
const TICK_FREQUENCY   = 880;    // Hz — A5, bem audível em qualquer speaker
const TICK_DURATION_S  = 0.15;   // 150ms por bip (curto e claro)
const TICK_VOLUME      = 0.75;   // 75% — bem audível sem estourar
const SNOOZE_MINUTOS   = 10;     // minutos que o botão "Adiar" silencia

/**
 * MencaoAlarme — monitora menções aguardando resposta do usuário logado e
 * dispara banner fixo + bip duplo via Web Audio API até o usuário responder.
 *
 * Regras:
 *  - Som só toca após 1ª interação do usuário na página (política do Chrome).
 *    Enquanto não houver interação, o banner mostra "🔊 Ativar som".
 *  - Qualquer comentário do usuário na mesma ordem silencia a pendência.
 *  - Apenas visualizar NÃO silencia — é proposital.
 */
export default function MencaoAlarme() {
  const [pendentes, setPendentes]   = useState<Pendente[]>([]);
  const [adiando, setAdiando]       = useState<boolean>(false);
  const [audioReady, setAudioReady] = useState<boolean>(false);
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const tickTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const router        = useRouter();

  // ── Fetch das pendências ───────────────────────────────────────────────
  const fetchPendentes = useCallback(async () => {
    try {
      const r = await fetch("/api/notificacoes/pendentes-resposta", {
        cache: "no-store",
      });
      if (!r.ok) {
        setPendentes([]);
        return;
      }
      const data = (await r.json()) as Resposta;
      // Durante snooze ativo o endpoint devolve total=0 + silenciado_ate — basta
      // limpar pendentes (banner/som somem). Quando a janela expira, o próximo
      // poll traz as pendências de volta e o alarme reinicia sozinho.
      setPendentes(Array.isArray(data.itens) ? data.itens : []);
    } catch {
      // Rede caiu — próxima tentativa em 10s
    }
  }, []);

  // ── Criar AudioContext (chamado no click "Ativar som" OU na 1ª interação) ──
  const ensureAudio = useCallback(() => {
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
      if (audioCtxRef.current.state === "suspended") {
        audioCtxRef.current.resume().catch(() => {});
      }
      setAudioReady(true);
      return audioCtxRef.current;
    }
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
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

  // Toca um bip curto (reutilizado para o loop E para o teste ao ativar)
  const playBip = useCallback(
    (ctx: AudioContext, delaySec: number, volume = TICK_VOLUME) => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle"; // corte bom sem ser estridente
        osc.frequency.value = TICK_FREQUENCY;

        const start = ctx.currentTime + delaySec;
        // Envelope linear: 8ms attack, sustain, 25ms release
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(volume, start + 0.008);
        gain.gain.setValueAtTime(volume, start + TICK_DURATION_S - 0.025);
        gain.gain.linearRampToValueAtTime(0, start + TICK_DURATION_S);

        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + TICK_DURATION_S + 0.05);
      } catch {
        // Falha isolada não pode quebrar o loop
      }
    },
    []
  );

  // ── Desbloqueio automático na 1ª interação da página ───────────────────
  // Não toca bip de confirmação — se não houver pendência, fica silencioso.
  // O loop em playTick dispara automaticamente quando houver pendência real.
  useEffect(() => {
    const unlock = () => {
      ensureAudio();
    };
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
    };
  }, [ensureAudio]);

  // ── Polling inicial + intervalo (adiado para após hidratação) ──────────
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let idleHandle: number | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const startPolling = () => {
      fetchPendentes();
      intervalId = setInterval(fetchPendentes, POLL_INTERVAL_MS);
    };

    const ric = (
      window as unknown as {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number }
        ) => number;
      }
    ).requestIdleCallback;

    if (typeof ric === "function") {
      idleHandle = ric(startPolling, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(startPolling, 500);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      if (idleHandle != null) {
        const cic = (
          window as unknown as {
            cancelIdleCallback?: (h: number) => void;
          }
        ).cancelIdleCallback;
        if (typeof cic === "function") cic(idleHandle);
      }
    };
  }, [fetchPendentes]);

  // ── Loop de bip duplo enquanto houver pendências ───────────────────────
  useEffect(() => {
    const stopTick = () => {
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };

    if (pendentes.length === 0) {
      stopTick();
      return;
    }

    const playTick = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return; // ainda não desbloqueado — banner mostra o botão
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
      playBip(ctx, 0);
    };

    // Dispara imediatamente ao detectar pendência nova
    playTick();
    tickTimerRef.current = setInterval(playTick, TICK_INTERVAL_MS);

    return stopTick;
  }, [pendentes.length, playBip]);

  // ── Navegar pra ordem ──────────────────────────────────────────────────
  const irParaOrdem = useCallback(
    (p: Pendente) => {
      const destino =
        p.link ?? (p.ordem_id != null ? `/ordens/${p.ordem_id}` : null);
      if (!destino) return;
      router.push(destino);
      // Não revalidamos aqui: pendência SÓ cai ao responder (enviar comentário)
    },
    [router]
  );

  // ── Handler do botão "Ativar som" (fallback manual) ────────────────────
  const ativarSomManual = useCallback(() => {
    const ctx = ensureAudio();
    if (ctx) {
      // Toca 2 bips de confirmação para o usuário ouvir o volume
      playBip(ctx, 0, 0.3);
      playBip(ctx, TICK_DURATION_S + 0.08, 0.3);
    }
  }, [ensureAudio, playBip]);

  // ── Handler do botão "Adiar" ───────────────────────────────────────────
  // Silencia o alarme por SNOOZE_MINUTOS. Após esse tempo, o próximo polling
  // volta a trazer as pendências e o alarme reinicia automaticamente.
  const adiarAlarme = useCallback(async () => {
    if (adiando) return;
    setAdiando(true);
    try {
      const r = await fetch("/api/notificacoes/adiar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutos: SNOOZE_MINUTOS }),
      });
      if (r.ok) {
        // Otimismo: esconde o banner/som imediatamente; o próximo poll confirma
        setPendentes([]);
      }
    } catch {
      // Falhou — próximo polling tenta de novo e o alarme continua
    } finally {
      setAdiando(false);
    }
  }, [adiando]);

  if (pendentes.length === 0) return null;

  const primeira = pendentes[0];
  const total = pendentes.length;

  return (
    <div
      className="fixed top-14 md:top-0 left-0 md:left-56 right-0 z-[55] shadow-md"
      style={{
        background: "#fef2f2",
        borderBottom: "2px solid #dc2626",
        color: "#991b1b",
      }}
      role="alert"
      aria-live="assertive"
    >
      <div className="px-4 py-2 flex items-center gap-3 flex-wrap">
        <AlertTriangle
          size={18}
          className="flex-shrink-0 animate-pulse"
          strokeWidth={2.25}
        />
        <span className="text-sm font-semibold">
          {total === 1
            ? "1 menção aguardando sua resposta:"
            : `${total} menções aguardando sua resposta:`}
        </span>

        <div className="flex items-center gap-2 flex-wrap">
          {pendentes.slice(0, 5).map((p) => (
            <button
              key={p.id}
              onClick={() => irParaOrdem(p)}
              className="text-xs font-mono font-semibold px-2 py-1 rounded border transition-colors hover:bg-white"
              style={{ borderColor: "#dc2626", color: "#991b1b" }}
              title={
                (p.remetente_nome ? `${p.remetente_nome}: ` : "") +
                (p.mensagem ?? "")
              }
            >
              {p.numero_ordem ?? `#${p.ordem_id ?? "—"}`}
              {p.remetente_nome ? (
                <span className="ml-1 font-normal opacity-80">
                  ({p.remetente_nome.split(" ")[0]})
                </span>
              ) : null}
            </button>
          ))}
          {total > 5 && (
            <span className="text-xs font-semibold">+{total - 5}</span>
          )}
        </div>

        {/* Botão "Ativar som" quando áudio ainda não está destravado */}
        {!audioReady && (
          <button
            onClick={ativarSomManual}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm animate-pulse"
            style={{
              background: "#dc2626",
              color: "#fff",
              border: "1px solid #991b1b",
            }}
            title="O navegador bloqueia áudio até você interagir. Clique para ativar."
          >
            <VolumeX size={14} strokeWidth={2.5} />
            Ativar som
          </button>
        )}
        {audioReady && (
          <span
            className="flex items-center gap-1 text-[10px] opacity-70"
            title="Áudio ativo"
          >
            <Volume2 size={12} />
            som ativo
          </span>
        )}

        {/* Botão "Adiar N min" — silencia temporariamente */}
        <button
          onClick={adiarAlarme}
          disabled={adiando}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm transition-colors disabled:opacity-50"
          style={{
            background: "#fff",
            color: "#991b1b",
            border: "1px solid #dc2626",
          }}
          title={`Silencia o alarme por ${SNOOZE_MINUTOS} minutos. Após esse tempo, se ainda não houver resposta, o alarme volta a tocar.`}
        >
          <Clock size={14} strokeWidth={2.5} />
          {adiando ? "Adiando..." : `Adiar ${SNOOZE_MINUTOS} min`}
        </button>

        <span className="text-[11px] italic ml-auto hidden md:block opacity-80">
          Responda na ordem para silenciar
        </span>
      </div>

      {primeira.mensagem && (
        <div
          className="px-4 pb-2 text-[11px] truncate"
          style={{ color: "#7f1d1d" }}
        >
          <span className="font-semibold">
            {primeira.numero_ordem ?? `#${primeira.ordem_id ?? "—"}`} —{" "}
          </span>
          {primeira.mensagem.length > 140
            ? primeira.mensagem.slice(0, 140) + "…"
            : primeira.mensagem}
        </div>
      )}
    </div>
  );
}
