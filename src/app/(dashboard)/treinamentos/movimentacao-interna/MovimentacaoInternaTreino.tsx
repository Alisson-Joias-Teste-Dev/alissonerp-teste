"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Play, Pause, Search, Camera, CheckCircle2, Truck, HandHeart,
  Undo2, UserCheck, X, Info, Upload, Loader2, MousePointer2, SkipBack,
  SkipForward, RotateCcw, Plus, Package, Image as ImageIcon, ChevronRight,
} from "lucide-react";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

/**
 * TREINAMENTO — Movimentação Interna (v2, 16/07/2026)
 *
 * REGRA DE NEGÓCIO: este treinamento tem que ensinar o fluxo REAL, passo a passo,
 * como se fosse um vídeo — cada ação que a pessoa precisa fazer, na tela que ela
 * realmente vê. A v1 resumia tudo em 5 cenas genéricas e espremia a devolução
 * (que é handshake de 2 tempos) num passo só — resultado: gente clicava em
 * "Devolver ao estoque", entregava a peça na mão e achava que tinha acabado,
 * deixando a solicitação em aberto pra sempre.
 *
 * O QUE: player de 11 passos que toca sozinho, com a tela real de cada ação,
 * cursor mostrando ONDE clicar, narração e o status que o card assume depois.
 * POR QUE: rastreabilidade de peça é dinheiro na mão — quem não sabe operar
 * deixa peça em aberto ou pula a foto.
 * IMPACTO SE ALTERADO: os rótulos/cores/botões aqui espelham
 * `movimentacao-interna/MovimentacaoInternaClient.tsx` (statusInfo/acoesDoStatus).
 * Se a tela real mudar, ATUALIZE AQUI TAMBÉM — treinamento que ensina tela que
 * não existe mais é pior do que não ter treinamento.
 */

// ─── Chips de status — espelham statusInfo() da tela real ─────────────────────
type StatusKey = "solicitado" | "entregue" | "recebido" | "volta_solicitada" | "cliente_levou" | "devolvido";
const STATUS: Record<StatusKey, { label: string; bg: string; color: string }> = {
  solicitado:       { label: "Solicitado",        bg: "#FEF3C7", color: "#92400E" },
  entregue:         { label: "Entregue",          bg: "#EFF6FF", color: "#2563EB" },
  recebido:         { label: "Com a solicitante", bg: "#F3F4F6", color: "#6B7280" },
  volta_solicitada: { label: "Volta solicitada",  bg: "#FEF3C7", color: "#92400E" },
  cliente_levou:    { label: "Cliente levou",     bg: "#ECFDF5", color: "#059669" },
  devolvido:        { label: "Devolvido",         bg: "#F3F4F6", color: "#6B7280" },
};
function StatusChip({ s }: { s: StatusKey }) {
  const t = STATUS[s];
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: t.bg, color: t.color }}>
      {t.label}
    </span>
  );
}

// ─── Peças de cenário ─────────────────────────────────────────────────────────
/** Cursor + halo de clique — mostra ONDE a pessoa clica na tela. */
function Cursor() {
  return (
    <span className="absolute right-0 bottom-0 translate-x-[85%] translate-y-1/3 flex items-center gap-0.5 pointer-events-none">
      <span className="relative flex items-center justify-center">
        <span className="absolute w-6 h-6 rounded-full animate-ping" style={{ background: "#18403633" }} />
        <span className="w-5 h-5 rounded-full border-2" style={{ borderColor: C.esmeralda, background: "#18403622" }} />
      </span>
      <MousePointer2 size={15} style={{ color: C.esmeralda }} />
    </span>
  );
}

function Botao({ label, Icon, primario = true, cursor }: { label: string; Icon?: React.ComponentType<{ size?: number }>; primario?: boolean; cursor?: boolean }) {
  return (
    <span className="relative inline-flex">
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
        style={primario ? { background: C.esmeralda, color: C.creme, borderColor: C.esmeralda } : { background: "#fff", color: "#111827", borderColor: "#CDD3CC" }}>
        {Icon && <Icon size={12} />}{label}
      </span>
      {cursor && <Cursor />}
    </span>
  );
}

/** Card de solicitação — mesmo desenho do card/linha da tela real. */
function CardSolicitacao({ status, sub, children, fotos }: { status: StatusKey; sub?: string; children?: React.ReactNode; fotos?: string[] }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate" style={{ color: "#111827" }}>Anel Solitário Ouro 18k</p>
          <p className="text-[11px]" style={{ color: "#9CA3AF" }}>{sub ?? "AS1002"}</p>
        </div>
        <StatusChip s={status} />
      </div>
      {fotos && fotos.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {fotos.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}>
              <ImageIcon size={9} /> {f}
            </span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

const fotoObrigatoria = (
  <div className="flex items-center gap-2 mt-2 rounded-lg border border-dashed px-2.5 py-2" style={{ borderColor: C.cremeBorder, background: C.cremeBg }}>
    <Camera size={13} style={{ color: "#8A5A0B" }} />
    <span className="text-[11px] font-medium" style={{ color: "#8A5A0B" }}>Foto obrigatória</span>
  </div>
);

const b = (t: string) => <b style={{ color: "#111827" }}>{t}</b>;

// ─── As 11 cenas do "vídeo" ───────────────────────────────────────────────────
interface Passo {
  quem: "Consultora" | "Estoque" | "Todos";
  titulo: string;
  narracao: React.ReactNode;
  porque?: string;
  resultado?: StatusKey;
  tela: React.ReactNode;
}

const PASSOS: Passo[] = [
  {
    quem: "Consultora",
    titulo: "Abrir a tela",
    narracao: <>No menu lateral, abra {b("Logística → Movimentação Interna")}. É aqui que fica tudo que saiu do estoque e ainda não voltou.</>,
    tela: (
      <div className="rounded-xl border overflow-hidden text-[12px]" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
        <div className="px-3 py-2 border-b font-semibold" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>Logística</div>
        <div className="px-3 py-2" style={{ color: "#6B7280" }}>Protocolo</div>
        <div className="px-3 py-2 flex items-center justify-between" style={{ background: "#18403610", color: C.esmeralda, fontWeight: 600 }}>
          <span className="inline-flex items-center gap-1.5"><Package size={13} /> Movimentação Interna</span>
          <span className="relative w-3 h-3"><Cursor /></span>
        </div>
        <div className="px-3 py-2" style={{ color: "#6B7280" }}>Entregas</div>
      </div>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Clicar em Solicitar Peça",
    narracao: <>No topo da tela, clique em {b("Solicitar Peça")}.</>,
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>Movimentação Interna</p>
          <Botao label="Solicitar Peça" Icon={Plus} cursor />
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] mt-3" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>
          <Search size={12} /> Buscar por produto, SKU ou descrição...
        </div>
      </div>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Buscar e marcar a peça",
    narracao: <>Digite o {b("nome ou o SKU")} e marque a peça. Pode marcar {b("várias de uma vez")}.</>,
    tela: (
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
        <div className="px-3 py-2 border-b text-[13px] font-semibold" style={{ borderColor: C.cremeBorder, color: "#111827" }}>Solicitar Peça</div>
        <div className="p-3">
          <div className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px]" style={{ borderColor: C.cremeBorder, color: "#374151" }}>
            <Search size={12} style={{ color: "#9CA3AF" }} /> anel
          </div>
          <div className="mt-2 space-y-1">
            <div className="relative flex items-center gap-2 px-2.5 py-2 rounded-lg border" style={{ borderColor: C.esmeralda, background: "#18403610" }}>
              <span className="w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: C.esmeralda }}>
                <CheckCircle2 size={9} style={{ color: C.creme }} />
              </span>
              <span className="text-[12px] font-medium" style={{ color: C.esmeralda }}>Anel Solitário Ouro 18k</span>
              <span className="text-[10px] font-mono ml-auto" style={{ color: "#9CA3AF" }}>AS1002</span>
              <Cursor />
            </div>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border" style={{ borderColor: C.cremeBorder }}>
              <span className="w-3.5 h-3.5 rounded border" style={{ borderColor: "#D1D5DB" }} />
              <span className="text-[12px]" style={{ color: "#374151" }}>Anel Aparador Cravejado</span>
              <span className="text-[10px] font-mono ml-auto" style={{ color: "#9CA3AF" }}>AP204</span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Lote grande? Use a Descrição",
    narracao: <>Se for muita peça pra marcar uma a uma (uma bandeja inteira), escreva no campo {b("Descrição (para lote grande)")}: “todos os anéis da vitrine 3”.</>,
    porque: "Sem isso a consultora perde cinco minutos marcando peça por peça — e acaba não registrando nada. Um registro com descrição vale muito mais do que registro nenhum.",
    tela: (
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
        <div className="px-3 py-2 border-b text-[13px] font-semibold" style={{ borderColor: C.cremeBorder, color: "#111827" }}>Solicitar Peça</div>
        <div className="p-3">
          <p className="text-[11px] font-semibold mb-1" style={{ color: "#6B7280" }}>Descrição (para lote grande)</p>
          <div className="rounded-lg border px-2.5 py-2 text-[12px]" style={{ borderColor: C.esmeralda, color: "#374151", minHeight: 42 }}>
            todos os anéis da vitrine 3
            <span className="inline-block w-px h-3.5 ml-0.5 align-middle animate-pulse" style={{ background: C.esmeralda }} />
          </div>
          <p className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>Ex: todos os anéis da vitrine 3</p>
        </div>
      </div>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Solicitar",
    narracao: <>Clique em {b("Solicitar")}. {b("Aqui não tem foto")} — a peça ainda está no estoque, ninguém pegou nada.</>,
    resultado: "solicitado",
    tela: (
      <div className="space-y-2">
        <div className="rounded-xl border px-3 py-2 flex justify-end items-center gap-2" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
          <span className="text-[12px] px-3 py-1.5" style={{ color: "#6B7280" }}>Cancelar</span>
          <Botao label="Solicitar" cursor />
        </div>
        <CardSolicitacao status="solicitado" sub="AS1002 · Solicitado por Débora · agora" />
      </div>
    ),
  },
  {
    quem: "Estoque",
    titulo: "Confirmar a entrega — com foto",
    narracao: <>O estoque separa a peça e clica em {b("Confirmar entrega")}. O sistema {b("exige a foto")} — tire com a peça na mão, antes de passar pra consultora.</>,
    porque: "A foto na saída prova o estado em que a peça saiu e que ela realmente saiu. Protege o estoquista: se aparecer um risco depois, a foto mostra como estava.",
    resultado: "entregue",
    tela: (
      <CardSolicitacao status="solicitado" sub="AS1002 · Solicitado por Débora · 14:02">
        {fotoObrigatoria}
        <div className="mt-2"><Botao label="Confirmar entrega" Icon={Truck} cursor /></div>
      </CardSolicitacao>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Confirmar o recebimento — com foto",
    narracao: <>Ao pegar a peça {b("na mão")}, clique em {b("Confirmar recebimento")} e tire a foto.</>,
    porque: "Fecha o elo. A partir daqui o sistema sabe que a peça está com você — e se ela sumir, dá pra saber em que mão estava.",
    resultado: "recebido",
    tela: (
      <CardSolicitacao status="entregue" sub="AS1002 · Entregue por Ana · 14:05" fotos={["Foto da Entrega"]}>
        {fotoObrigatoria}
        <div className="mt-2"><Botao label="Confirmar recebimento" Icon={HandHeart} cursor /></div>
      </CardSolicitacao>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Desfecho A — Cliente levou",
    narracao: <>Vendeu? Clique em {b("Cliente levou")}. Encerra na hora e {b("não pede foto")} — a peça saiu com o cliente.</>,
    resultado: "cliente_levou",
    tela: (
      <CardSolicitacao status="recebido" sub="Com você desde 14:20" fotos={["Foto da Entrega", "Foto do Recebimento"]}>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <Botao label="Cliente levou" Icon={UserCheck} primario={false} cursor />
          <Botao label="Devolver ao estoque" Icon={Undo2} primario={false} />
        </div>
      </CardSolicitacao>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Desfecho B — Devolver ao estoque",
    narracao: <>Não vendeu? Clique em {b("Devolver ao estoque")}. Atenção: isso {b("ainda NÃO encerra")} — só avisa o estoque que a peça está voltando.</>,
    porque: "É o passo que mais gera peça esquecida. Muita gente clica aqui, entrega a peça na mão e acha que acabou — mas o card fica em “Volta solicitada” até o estoque confirmar.",
    resultado: "volta_solicitada",
    tela: (
      <CardSolicitacao status="recebido" sub="Com você desde 14:20" fotos={["Foto da Entrega", "Foto do Recebimento"]}>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <Botao label="Cliente levou" Icon={UserCheck} primario={false} />
          <Botao label="Devolver ao estoque" Icon={Undo2} primario={false} cursor />
        </div>
      </CardSolicitacao>
    ),
  },
  {
    quem: "Estoque",
    titulo: "Confirmar a devolução — com foto",
    narracao: <>O estoque recebe a peça de volta e clica em {b("Confirmar devolução")}, com foto. {b("Só agora")} a solicitação encerra.</>,
    porque: "A volta é em dois tempos de propósito: não basta dizer que devolveu — o estoque confirma que recebeu. Enquanto ninguém confirma, a peça continua na sua responsabilidade.",
    resultado: "devolvido",
    tela: (
      <CardSolicitacao status="volta_solicitada" sub="Volta pedida por Débora · 17:40" fotos={["Foto da Entrega", "Foto do Recebimento"]}>
        {fotoObrigatoria}
        <div className="mt-2"><Botao label="Confirmar devolução" Icon={CheckCircle2} cursor /></div>
      </CardSolicitacao>
    ),
  },
  {
    quem: "Todos",
    titulo: "Conferir o histórico",
    narracao: <>Clique em {b("qualquer card")} pra abrir a linha do tempo: quem fez cada passo, data, hora e as fotos. {b("Nada é apagado.")}</>,
    tela: (
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
        <div className="px-3 py-2 border-b text-[13px] font-semibold flex items-center justify-between gap-2" style={{ borderColor: C.cremeBorder, color: "#111827" }}>
          Histórico da solicitação <StatusChip s="devolvido" />
        </div>
        <div className="p-3">
          {[
            { t: "Solicitado", q: "Débora", h: "14:02", f: false },
            { t: "Entregue", q: "Ana", h: "14:05", f: true },
            { t: "Recebido", q: "Débora", h: "14:20", f: true },
            { t: "Volta solicitada", q: "Débora", h: "17:40", f: false },
            { t: "Devolvido", q: "Ana", h: "17:52", f: true },
          ].map((l, idx, arr) => (
            <div key={l.t} className="flex items-start gap-2">
              <div className="flex flex-col items-center self-stretch">
                <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: C.esmeralda }} />
                {idx < arr.length - 1 && <span className="w-px flex-1" style={{ background: C.cremeBorder }} />}
              </div>
              <div className="flex-1 flex items-center justify-between gap-2 pb-2.5">
                <span className="text-[12px]" style={{ color: "#111827" }}>{l.t} <span style={{ color: "#9CA3AF" }}>· {l.q} · {l.h}</span></span>
                {l.f && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border shrink-0" style={{ borderColor: C.cremeBorder, color: "#6B7280" }}><ImageIcon size={9} /> foto</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

// ─── Player passo a passo (o "vídeo") ─────────────────────────────────────────
const DUR_MS = 5200;

function PlayerPassoAPasso() {
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
    if (i >= PASSOS.length - 1) { setTocando(false); return; }
    timer.current = setTimeout(() => setI((v) => v + 1), DUR_MS / vel);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [i, tocando, vel]);

  const ir = useCallback((idx: number) => {
    setI(Math.max(0, Math.min(PASSOS.length - 1, idx)));
    setTocando(false);
  }, []);

  const p = PASSOS[i];
  const fim = i === PASSOS.length - 1;
  const pct = ((i + 1) / PASSOS.length) * 100;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.cremeBorder, background: C.cremeBg }}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b flex-wrap" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Passo a passo guiado</span>
        <span className="text-[12px]" style={{ color: "#6B7280" }}>
          Passo <b style={{ color: "#111827" }}>{i + 1}</b> de {PASSOS.length}
        </span>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: C.esmeralda, color: C.creme }}>{p.quem}</span>
          <span className="text-[14px] font-semibold" style={{ color: "#111827" }}>{p.titulo}</span>
        </div>

        <div className="max-w-sm mx-auto md:mx-0 pr-10">{p.tela}</div>

        <div className="mt-3 rounded-lg px-3 py-2.5" style={{ background: "#fff", borderLeft: `3px solid ${C.esmeralda}` }}>
          <p className="text-[13px] leading-relaxed" style={{ color: "#374151" }}>{p.narracao}</p>
          {p.resultado && (
            <p className="text-[12px] mt-1.5 flex items-center gap-1.5 flex-wrap" style={{ color: "#6B7280" }}>
              <ChevronRight size={12} /> O card vira <StatusChip s={p.resultado} />
            </p>
          )}
        </div>

        {p.porque && (
          <div className="mt-2 rounded-lg px-3 py-2" style={{ background: "#fff", border: `1px dashed ${C.cremeBorder}` }}>
            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: C.esmeralda }}>Por que importa</span>
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
          style={{ background: C.esmeralda, color: C.creme }}
          aria-label={fim && !tocando ? "Assistir de novo" : tocando ? "Pausar" : "Tocar"}
        >
          {fim && !tocando ? <RotateCcw size={14} /> : tocando ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={() => ir(i + 1)} disabled={fim} className="disabled:opacity-30" aria-label="Próximo passo">
          <SkipForward size={16} style={{ color: "#6B7280" }} />
        </button>

        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#D6CFC0" }}>
          <div className="h-full transition-all duration-300" style={{ width: `${pct}%`, background: C.esmeralda }} />
        </div>

        <button onClick={() => setVel((v) => (v === 1 ? 1.5 : v === 1.5 ? 2 : 1))}
          className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: "#18403612", color: C.esmeralda }}
          aria-label="Mudar velocidade">
          {vel}x
        </button>
      </div>

      <div className="border-t px-2 py-2" style={{ borderColor: C.cremeBorder }}>
        {PASSOS.map((s, idx) => {
          const ativo = idx === i;
          const feito = idx < i;
          return (
            <button key={s.titulo} onClick={() => ir(idx)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors"
              style={{ background: ativo ? "#fff" : "transparent" }}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                style={feito ? { background: "#E4F1E9", color: "#1C7A4C" } : ativo ? { background: C.esmeralda, color: C.creme } : { border: "1px solid #D6CFC0", color: "#9CA3AF" }}>
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

// ─── Simulador interativo (praticar Solicitar Peça) ───────────────────────────
const CATALOGO = [
  { nome: "Anel Solitário Ouro 18k", sku: "AS1002" },
  { nome: "Anel Aparador Cravejado", sku: "AP204" },
  { nome: "Aliança Tradicional 4mm", sku: "AL440" },
  { nome: "Aliança Anatômica 5mm", sku: "AL550" },
  { nome: "Brinco Argola Pequena", sku: "BR310" },
  { nome: "Brinco Ponto de Luz", sku: "BR118" },
  { nome: "Colar Ponto de Luz", sku: "CL220" },
  { nome: "Pingente Coração 3D", sku: "PG080" },
];
const EXEMPLOS = ["todos os anéis da vitrine 3", "bandeja de alianças", "brincos do mostruário 2"];

function SimuladorInterativo() {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<typeof CATALOGO>([]);
  const [desc, setDesc] = useState("");
  const [feito, setFeito] = useState(false);

  const term = q.trim().toLowerCase();
  const found = term.length >= 2 ? CATALOGO.filter((p) => p.nome.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)) : [];
  const has = useCallback((sku: string) => sel.some((s) => s.sku === sku), [sel]);
  const toggle = (p: typeof CATALOGO[number]) => setSel((prev) => prev.some((s) => s.sku === p.sku) ? prev.filter((s) => s.sku !== p.sku) : [...prev, p]);
  const pode = sel.length > 0 || desc.trim().length > 0;

  function reset() { setQ(""); setSel([]); setDesc(""); setFeito(false); }

  if (feito) {
    return (
      <div className="rounded-2xl border p-6 text-center" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
        <div className="w-11 h-11 rounded-full inline-flex items-center justify-center mb-2" style={{ background: C.esmeralda, color: C.creme }}><CheckCircle2 size={20} /></div>
        <p className="text-lg font-semibold" style={{ color: "#111827" }}>Solicitado!</p>
        <div className="rounded-xl border p-3 mt-3 text-left" style={{ borderColor: C.cremeBorder, background: C.cremeBg }}>
          <div className="flex items-center justify-between"><span className="text-[12px] font-mono" style={{ color: "#9CA3AF" }}>#124 · agora</span><StatusChip s="solicitado" /></div>
          {sel.length > 0 && <p className="text-[13px] mt-1.5" style={{ color: "#374151" }}>{sel.map((p) => `${p.nome} (${p.sku})`).join(", ")}</p>}
          {desc.trim() && <p className="text-[13px] mt-1 italic" style={{ color: "#6B7280" }}>“{desc.trim()}”</p>}
        </div>
        <p className="text-[13px] mt-3" style={{ color: "#6B7280" }}>Agora o estoque separa e confirma a entrega, com foto.</p>
        <button onClick={reset} className="mt-4 text-[13px] font-semibold px-4 py-2 rounded-lg" style={{ background: C.esmeralda, color: C.creme }}>Fazer outro</button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: C.cremeBorder }}>
        <p className="font-semibold text-[15px]" style={{ color: "#111827" }}>Solicitar Peça</p>
        <span className="text-[12px]" style={{ color: "#9CA3AF" }}>{sel.length > 0 ? `${sel.length} peça(s)` : "pratique aqui"}</span>
      </div>
      <div className="p-4">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto por nome ou SKU..."
            className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm focus:outline-none" style={{ borderColor: C.cremeBorder }} />
        </div>
        {sel.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {sel.map((p) => (
              <span key={p.sku} className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full" style={{ background: "#18403612", color: C.esmeralda }}>
                {p.nome}<button onClick={() => toggle(p)} aria-label="remover"><X size={11} /></button>
              </span>
            ))}
          </div>
        )}
        <div className="mt-2 space-y-1 max-h-44 overflow-auto">
          {term.length < 2 ? <p className="text-center text-[13px] py-3" style={{ color: "#9CA3AF" }}>Digite ao menos 2 letras</p>
            : found.length === 0 ? <p className="text-center text-[13px] py-3" style={{ color: "#9CA3AF" }}>Nenhum produto encontrado</p>
            : found.map((p) => {
              const on = has(p.sku);
              return (
                <button key={p.sku} onClick={() => toggle(p)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left border transition-colors"
                  style={{ borderColor: on ? C.esmeralda : C.cremeBorder, background: on ? "#18403612" : "transparent" }}>
                  <span className="w-4 h-4 rounded flex items-center justify-center border" style={{ background: on ? C.esmeralda : "#fff", borderColor: on ? C.esmeralda : "#D1D5DB" }}>
                    {on && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3L3.5 5.5L8 1" stroke="#F3EADA" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                  <span className="flex-1"><span className="text-[13px] font-medium" style={{ color: C.esmeralda }}>{p.nome}</span><br /><span className="text-[11px] font-mono" style={{ color: "#9CA3AF" }}>{p.sku}</span></span>
                </button>
              );
            })}
        </div>

        <div className="mt-4 rounded-xl border border-dashed p-3" style={{ borderColor: C.esmeralda, background: C.cremeBg }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: C.esmeralda, color: C.creme }}>LOTE GRANDE?</span>
            <b className="text-[13px]" style={{ color: "#111827" }}>Use a descrição</b>
          </div>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Ex: todos os anéis da vitrine 3"
            className="w-full px-2.5 py-2 rounded-lg border text-sm focus:outline-none resize-none" style={{ borderColor: C.cremeBorder }} />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EXEMPLOS.map((ex) => (
              <button key={ex} onClick={() => setDesc((d) => d ? `${d.replace(/\s*$/, "")}; ${ex}` : ex)}
                className="text-[12px] px-2.5 py-1 rounded-full border" style={{ borderColor: C.cremeBorder, color: C.esmeralda }}>“{ex}”</button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-4 py-3 border-t flex justify-end gap-2" style={{ borderColor: C.cremeBorder }}>
        <button onClick={reset} className="text-[13px] px-3 py-2 rounded-lg" style={{ color: "#6B7280" }}>Limpar</button>
        <button onClick={() => setFeito(true)} disabled={!pode} className="text-[13px] font-semibold px-4 py-2 rounded-lg disabled:opacity-45" style={{ background: C.esmeralda, color: C.creme }}>Solicitar</button>
      </div>
    </div>
  );
}

// ─── Vídeo do treinamento (upload só pra desenvolvedor) ───────────────────────
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
        <video controls preload="metadata" className="w-full rounded-2xl border" style={{ borderColor: C.cremeBorder, background: "#000", maxHeight: 420 }} src={videoUrl} />
      ) : (
        isDev && (
          <div className="rounded-2xl border border-dashed p-4 text-center" style={{ borderColor: C.cremeBorder, background: C.cremeBg }}>
            <p className="text-sm" style={{ color: "#6B7280" }}>Sem vídeo gravado — o passo a passo guiado abaixo já ensina o fluxo inteiro.</p>
          </div>
        )
      )}
      {isDev && (
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 text-[13px] font-semibold px-3 py-2 rounded-lg cursor-pointer" style={{ background: "#18403612", color: C.esmeralda }}>
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

interface TreinoProps { videoUrl: string | null; isDev: boolean; treinamentoKey: string }

export default function MovimentacaoInternaTreino({ videoUrl, isDev, treinamentoKey }: TreinoProps) {
  return (
    <div className="px-3 md:px-6 py-4 md:py-8 max-w-3xl">
      <Link href="/treinamentos" className="inline-flex items-center gap-1.5 text-sm mb-4" style={{ color: C.esmeralda }}>
        <ArrowLeft size={15} /> Central de Treinamentos
      </Link>

      <h2 className="text-xl md:text-2xl font-semibold" style={{ fontFamily: "var(--font-playfair)", color: C.esmeralda }}>
        Movimentação Interna
      </h2>
      <p className="text-sm mt-1 mb-5" style={{ color: "#6B7280" }}>
        Registra quem está com cada peça dentro da loja — do estoque até voltar (ou o cliente levar). Cada troca de mão fica com foto, quem, data e hora.
      </p>

      <div className="flex items-start gap-2.5 rounded-xl border p-3 mb-6" style={{ borderColor: C.cremeBorder, background: C.cremeBg }}>
        <Info size={16} className="mt-0.5 shrink-0" style={{ color: C.esmeralda }} />
        <p className="text-[13px]" style={{ color: "#4B5563" }}>
          <b style={{ color: "#111827" }}>Regra de ouro:</b> foto em toda troca de mão (entrega, recebimento, devolução). Nada é apagado — tudo grava quem fez, a data e a hora.
        </p>
      </div>

      <VideoTreinamento videoUrl={videoUrl} isDev={isDev} treinamentoKey={treinamentoKey} />

      <h3 className="text-base font-semibold mb-1" style={{ color: "#111827" }}>O fluxo inteiro, passo a passo</h3>
      <p className="text-[13px] mb-3" style={{ color: "#6B7280" }}>
        Toca sozinho. Pause, volte ou pule pra qualquer passo — as telas são as mesmas do sistema.
      </p>
      <PlayerPassoAPasso />

      <h3 className="text-base font-semibold mt-8 mb-1" style={{ color: "#111827" }}>Pratique você mesmo</h3>
      <p className="text-[13px] mb-3" style={{ color: "#6B7280" }}>
        Sem medo — isto é um treino, não mexe no sistema. Foque em <b>quando usar a descrição</b> (lote grande).
      </p>
      <SimuladorInterativo />

      <h3 className="text-base font-semibold mt-8 mb-3" style={{ color: "#111827" }}>Cola rápida — o que cada status quer dizer</h3>
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
        {([
          { s: "solicitado", txt: "A consultora pediu. A peça ainda está no estoque." },
          { s: "entregue", txt: "O estoque já entregou (com foto). Falta a consultora confirmar que pegou." },
          { s: "recebido", txt: "A peça está na mão da consultora. A responsabilidade é dela até encerrar." },
          { s: "volta_solicitada", txt: "A consultora devolveu, mas o estoque ainda NÃO confirmou. Não está encerrada." },
          { s: "cliente_levou", txt: "Encerrada: o cliente levou a peça." },
          { s: "devolvido", txt: "Encerrada: o estoque confirmou o retorno da peça (com foto)." },
        ] as { s: StatusKey; txt: string }[]).map((l, idx) => (
          <div key={l.s} className="flex items-start gap-3 px-4 py-2.5" style={{ borderTop: idx === 0 ? "none" : `1px solid ${C.cremeBorder}` }}>
            <span className="shrink-0 pt-0.5"><StatusChip s={l.s} /></span>
            <span className="text-[13px]" style={{ color: "#4B5563" }}>{l.txt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
