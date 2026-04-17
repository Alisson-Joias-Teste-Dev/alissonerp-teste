"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Volume2, VolumeX, Clock, Bell, BellOff } from "lucide-react";

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
const TICK_DURATION_S  = 0.20;   // 200ms por bip (um pouco mais longo)
const TICK_VOLUME      = 1.0;    // 100% — máximo possível via Web Audio
const SNOOZE_MINUTOS   = 5;      // minutos que "Adiar" silencia O SOM

/**
 * MencaoAlarme — monitora menções aguardando resposta do usuário logado.
 *
 * Comportamento:
 *  - Banner vermelho fixo NO TOPO enquanto houver pendências (não some com snooze).
 *  - Bip a cada 1s via Web Audio (triangle + square empilhados p/ volume máximo).
 *  - "Adiar 5 min" silencia APENAS O SOM — banner permanece.
 *  - Notifications API (SO nativo): ao detectar nova menção, dispara notificação
 *    desktop que toca som do Sistema Operacional — funciona com aba em background,
 *    minimizada, em outra janela ou outro desktop virtual (não com Chrome fechado).
 *  - Aviso "áudio suspenso" se AudioContext estiver inválido (user mutou aba / SO).
 *
 * Regras:
 *  - Som Web Audio só toca após 1ª interação (política do Chrome).
 *  - Notifications exige permissão — pede no click "Ativar som".
 *  - Qualquer comentário do usuário na ordem silencia a pendência (backend).
 *  - Apenas visualizar NÃO silencia — é proposital.
 */
export default function MencaoAlarme() {
  const [pendentes, setPendentes]       = useState<Pendente[]>([]);
  const [silenciadoAte, setSilenciadoAte] = useState<string | null>(null);
  const [adiando, setAdiando]           = useState<boolean>(false);
  const [audioReady, setAudioReady]     = useState<boolean>(false);
  const [audioSuspended, setAudioSuspended] = useState<boolean>(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | "unsupported">("default");
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const tickTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const notifShownRef = useRef<Set<number>>(new Set()); // ids de menções já notificadas
  const router        = useRouter();

  // Computado: som silenciado por snooze?
  const somSilenciado = silenciadoAte != null
    && new Date(silenciadoAte).getTime() > Date.now();

  // ── Fetch das pendências ───────────────────────────────────────────────
  const fetchPendentes = useCallback(async () => {
    try {
      const r = await fetch("/api/notificacoes/pendentes-resposta", {
        cache: "no-store",
      });
      if (!r.ok) {
        setPendentes([]);
        setSilenciadoAte(null);
        return;
      }
      const data = (await r.json()) as Resposta;
      setPendentes(Array.isArray(data.itens) ? data.itens : []);
      setSilenciadoAte(data.silenciado_ate ?? null);
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
      setAudioSuspended(audioCtxRef.current.state === "suspended");
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
      setAudioSuspended(ctx.state === "suspended");
      return ctx;
    } catch {
      return null;
    }
  }, []);

  // ── Pedir permissão de Notifications (SO nativo) ───────────────────────
  const ensureNotifPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotifPermission("unsupported");
      return "unsupported" as const;
    }
    let perm = Notification.permission;
    if (perm === "default") {
      try {
        perm = await Notification.requestPermission();
      } catch {
        perm = "denied";
      }
    }
    setNotifPermission(perm);
    return perm;
  }, []);

  // Lê o estado inicial da permissão
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotifPermission("unsupported");
      return;
    }
    setNotifPermission(Notification.permission);
  }, []);

  // Toca um bip curto (triangle + square empilhados = máximo volume/agressividade)
  const playBip = useCallback(
    (ctx: AudioContext, delaySec: number, volume = TICK_VOLUME) => {
      try {
        const start = ctx.currentTime + delaySec;
        const stop  = start + TICK_DURATION_S;

        // Master gain — envelope único
        const master = ctx.createGain();
        master.gain.setValueAtTime(0, start);
        master.gain.linearRampToValueAtTime(volume, start + 0.008);
        master.gain.setValueAtTime(volume, stop - 0.025);
        master.gain.linearRampToValueAtTime(0, stop);
        master.connect(ctx.destination);

        // Osc 1 — triangle (fundamental clara)
        const osc1 = ctx.createOscillator();
        osc1.type = "triangle";
        osc1.frequency.value = TICK_FREQUENCY;
        const g1 = ctx.createGain();
        g1.gain.value = 0.6;
        osc1.connect(g1).connect(master);

        // Osc 2 — square oitava acima (bite)
        const osc2 = ctx.createOscillator();
        osc2.type = "square";
        osc2.frequency.value = TICK_FREQUENCY * 2;
        const g2 = ctx.createGain();
        g2.gain.value = 0.35;
        osc2.connect(g2).connect(master);

        osc1.start(start); osc1.stop(stop + 0.05);
        osc2.start(start); osc2.stop(stop + 0.05);
      } catch {
        // Falha isolada não pode quebrar o loop
      }
    },
    []
  );

  // ── Desbloqueio automático na 1ª interação da página ───────────────────
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

  // ── Re-render a cada 30s enquanto silenciado (pra expirar contagem) ────
  useEffect(() => {
    if (!somSilenciado) return;
    const t = setInterval(() => {
      // força re-render ao atualizar um estado derivado
      setSilenciadoAte((v) => v);
    }, 30_000);
    return () => clearInterval(t);
  }, [somSilenciado]);

  // ── Loop de bip enquanto houver pendências E não estiver silenciado ────
  useEffect(() => {
    const stopTick = () => {
      if (tickTimerRef.current) {
        clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    };

    if (pendentes.length === 0 || somSilenciado) {
      stopTick();
      return;
    }

    const playTick = () => {
      const ctx = audioCtxRef.current;
      if (!ctx) return; // ainda não desbloqueado — banner mostra o botão
      if (ctx.state === "suspended") {
        setAudioSuspended(true);
        ctx.resume().catch(() => {});
        return; // não toca nesse tick, espera destravar
      }
      setAudioSuspended(false);
      playBip(ctx, 0);
    };

    // Dispara imediatamente ao detectar pendência nova
    playTick();
    tickTimerRef.current = setInterval(playTick, TICK_INTERVAL_MS);

    return stopTick;
  }, [pendentes.length, somSilenciado, playBip]);

  // ── Notifications API (SO nativo): dispara pra cada menção nova ───────
  useEffect(() => {
    if (notifPermission !== "granted") return;
    if (typeof window === "undefined" || !("Notification" in window)) return;

    for (const p of pendentes) {
      if (notifShownRef.current.has(p.id)) continue;

      // Só notifica se a aba não estiver em foco (evita notif duplicada quando usuário já está vendo)
      if (document.visibilityState === "visible" && document.hasFocus()) {
        notifShownRef.current.add(p.id); // marca como "vista" mesmo sem notificar
        continue;
      }

      try {
        const titulo = p.remetente_nome
          ? `${p.remetente_nome} te mencionou`
          : "Nova menção aguardando resposta";
        const body = [
          p.numero_ordem ? `Ordem ${p.numero_ordem}` : null,
          p.mensagem ?? p.titulo ?? "",
        ].filter(Boolean).join(" — ");

        const n = new Notification(titulo, {
          body,
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
          tag: `mencao-${p.id}`,
          requireInteraction: true, // fica até o user clicar/dispensar
          silent: false,            // toca som do SO
        });

        n.onclick = () => {
          window.focus();
          const destino = p.link ?? (p.ordem_id != null ? `/ordens/${p.ordem_id}` : "/");
          router.push(destino);
          n.close();
        };

        notifShownRef.current.add(p.id);
      } catch {
        // Falha isolada — ignora, volta a tentar no próximo poll
      }
    }

    // Limpa IDs que não estão mais pendentes (pra re-notificar se voltar)
    const idsAtivos = new Set(pendentes.map((p) => p.id));
    for (const id of Array.from(notifShownRef.current)) {
      if (!idsAtivos.has(id)) notifShownRef.current.delete(id);
    }
  }, [pendentes, notifPermission, router]);

  // ── Navegar pra ordem ──────────────────────────────────────────────────
  const irParaOrdem = useCallback(
    (p: Pendente) => {
      const destino =
        p.link ?? (p.ordem_id != null ? `/ordens/${p.ordem_id}` : null);
      if (!destino) return;
      router.push(destino);
    },
    [router]
  );

  // ── Handler do botão "Ativar som" ──────────────────────────────────────
  const ativarSomManual = useCallback(async () => {
    const ctx = ensureAudio();
    if (ctx) {
      // Toca 2 bips de confirmação para o usuário ouvir o volume
      playBip(ctx, 0, 0.3);
      playBip(ctx, TICK_DURATION_S + 0.08, 0.3);
    }
    // Aproveita o gesto pra pedir permissão de Notifications
    await ensureNotifPermission();
  }, [ensureAudio, playBip, ensureNotifPermission]);

  // ── Handler do botão "Adiar" (só silencia som) ─────────────────────────
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
        const data = (await r.json()) as { silenciado_ate: string | null };
        setSilenciadoAte(data.silenciado_ate ?? null);
      }
    } catch {
      // Falhou — próximo polling tenta de novo
    } finally {
      setAdiando(false);
    }
  }, [adiando]);

  if (pendentes.length === 0) return null;

  const primeira = pendentes[0];
  const total = pendentes.length;

  // Minutos restantes do snooze (pra exibir no banner)
  const minutosRestantes = somSilenciado && silenciadoAte
    ? Math.max(0, Math.ceil((new Date(silenciadoAte).getTime() - Date.now()) / 60000))
    : 0;

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
          className={`flex-shrink-0 ${somSilenciado ? "" : "animate-pulse"}`}
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

        {/* Aviso: áudio foi suspenso (user mutou aba ou SO está mudo) */}
        {audioReady && audioSuspended && !somSilenciado && (
          <span
            className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded animate-pulse"
            style={{ background: "#fef08a", color: "#854d0e", border: "1px solid #ca8a04" }}
            title="Áudio suspenso — verifique o volume da aba e do sistema"
          >
            <VolumeX size={12} />
            áudio mudo
          </span>
        )}

        {/* Indicador: som está ok */}
        {audioReady && !audioSuspended && !somSilenciado && (
          <span
            className="flex items-center gap-1 text-[10px] opacity-70"
            title="Áudio ativo"
          >
            <Volume2 size={12} />
            som ativo
          </span>
        )}

        {/* Indicador: som silenciado pelo snooze */}
        {somSilenciado && (
          <span
            className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded"
            style={{ background: "#fff7ed", color: "#9a3412", border: "1px solid #fb923c" }}
            title="Som silenciado temporariamente"
          >
            <VolumeX size={12} />
            som mudo ({minutosRestantes} min)
          </span>
        )}

        {/* Estado das notificações do SO */}
        {notifPermission === "granted" && (
          <span
            className="flex items-center gap-1 text-[10px] opacity-70"
            title="Notificações do Sistema Operacional ativas — você será avisado mesmo com a aba em segundo plano"
          >
            <Bell size={12} />
            notif. SO
          </span>
        )}
        {notifPermission === "denied" && (
          <span
            className="flex items-center gap-1 text-[10px]"
            style={{ color: "#b91c1c" }}
            title="Notificações bloqueadas no navegador — habilite nas configurações do site para receber alertas com a aba em segundo plano"
          >
            <BellOff size={12} />
            notif. bloqueadas
          </span>
        )}
        {notifPermission === "default" && audioReady && (
          <button
            onClick={ensureNotifPermission}
            className="flex items-center gap-1 text-[10px] underline"
            title="Permitir notificações desktop para receber alertas com a aba em segundo plano"
          >
            <Bell size={12} />
            permitir notif.
          </button>
        )}

        {/* Botão "Adiar" — silencia SOMENTE o som */}
        <button
          onClick={adiarAlarme}
          disabled={adiando || somSilenciado}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm transition-colors disabled:opacity-50"
          style={{
            background: "#fff",
            color: "#991b1b",
            border: "1px solid #dc2626",
          }}
          title={`Silencia apenas o SOM do alarme por ${SNOOZE_MINUTOS} minutos. O aviso continua visível. Responda para remover de vez.`}
        >
          <VolumeX size={14} strokeWidth={2.5} />
          {adiando
            ? "Adiando..."
            : somSilenciado
              ? `Som mudo (${minutosRestantes} min)`
              : `Silenciar som ${SNOOZE_MINUTOS} min`}
        </button>

        <span className="text-[11px] italic ml-auto hidden md:block opacity-80">
          Responda na ordem para silenciar definitivamente
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
