"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

interface Contagens {
  vencido: number;
  valor_vencido: number;
}

const POLL_INTERVAL_MS = 120_000; // 2 min — vencido é urgência diária, não de segundos

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * VencidosAlarme — faixa global de contas VENCIDAS do crediário, em TODA a tela
 * do sistema (montada no DashboardShell, junto do ReservaAlarme). Regra do
 * Jonathan: "a tag vermelha tem que ser global no sistema todo" — o alerta de
 * cobrança aparece em qualquer página, não só no /crediario.
 *
 * Escopo segue o papel (a API /api/crediario já filtra): consultora vê só as
 * dela; gerente/admin veem a loja inteira. "ok" esconde por hoje (localStorage
 * por data) e volta amanhã se ainda houver vencidos. Sem som (diferente do
 * ReservaAlarme, que bipa no último dia).
 */
export default function VencidosAlarme() {
  const [info, setInfo] = useState<Contagens | null>(null);
  const [okHoje, setOkHoje] = useState<boolean>(true); // começa escondido (SSR-safe)
  const router = useRouter();

  useEffect(() => {
    setOkHoje(localStorage.getItem("crediario_vencidos_ok") === hojeISO());
  }, []);

  const dispensarHoje = useCallback(() => {
    localStorage.setItem("crediario_vencidos_ok", hojeISO());
    setOkHoje(true);
  }, []);

  const fetchInfo = useCallback(async () => {
    try {
      const r = await fetch("/api/crediario?counts=1&limit=1", { cache: "no-store" });
      if (!r.ok) { setInfo(null); return; }
      const d = (await r.json()) as { contagens?: Contagens };
      setInfo(d.contagens ?? null);
    } catch {
      // erro de rede não quebra a tela — tenta de novo no próximo ciclo
    }
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      fetchInfo();
      intervalId = setInterval(fetchInfo, POLL_INTERVAL_MS);
    }, 600);
    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchInfo]);

  if (okHoje || !info || info.vencido <= 0) return null;

  const valor = info.valor_vencido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const plural = info.vencido !== 1;

  return (
    <div
      className="fixed top-14 md:top-[77px] left-0 md:left-56 right-0 z-[53] shadow-md"
      style={{ background: "#dc2626", color: "#fff" }}
      role="alert"
      aria-live="polite"
    >
      <div className="px-4 py-2 flex items-center gap-3 flex-wrap">
        <AlertTriangle size={18} className="flex-shrink-0" strokeWidth={2.25} />
        <span className="text-sm font-semibold flex-1 min-w-0">
          Você tem {info.vencido} conta{plural ? "s" : ""} vencida{plural ? "s" : ""} ({valor}). Cobre os clientes!
        </span>
        <button
          onClick={() => router.push("/crediario")}
          className="text-xs underline whitespace-nowrap"
          style={{ color: "#fff" }}
        >
          ver no crediário
        </button>
        <button
          onClick={dispensarHoje}
          className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
          style={{ background: "#fff", color: "#991b1b" }}
          title="Esconde a faixa só por hoje. Volta amanhã se ainda houver contas vencidas."
        >
          ok
        </button>
      </div>
    </div>
  );
}
