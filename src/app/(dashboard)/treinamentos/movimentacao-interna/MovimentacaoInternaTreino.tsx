"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Play, Pause, Search, Camera, CheckCircle2, Truck, HandHeart,
  Undo2, UserCheck, X, Info,
} from "lucide-react";

const C = { esmeralda: "#184036", creme: "#F3EADA", cremeBorder: "#E8DCC8", cremeBg: "#FAFAF7" };

type ChipTone = "amber" | "blue" | "slate" | "green";
const TONE: Record<ChipTone, { bg: string; fg: string }> = {
  amber: { bg: "#FBEFCF", fg: "#8A5A0B" },
  blue:  { bg: "#E7EFFA", fg: "#2159A0" },
  slate: { bg: "#ECEEEA", fg: "#586159" },
  green: { bg: "#E4F1E9", fg: "#1C7A4C" },
};
function Chip({ tone, children }: { tone: ChipTone; children: React.ReactNode }) {
  const t = TONE[tone];
  return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ backgroundColor: t.bg, color: t.fg }}>{children}</span>;
}

// ─── Simulador automático (toca sozinho) ──────────────────────────────────────
interface Cena {
  passo: string; quem: string; legenda: string; render: React.ReactNode;
}
function telaSolicitar() {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
      <p className="text-sm font-medium mb-2" style={{ color: "#111827" }}>Solicitar Peça</p>
      <div className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[13px]" style={{ borderColor: C.cremeBorder, color: "#9CA3AF" }}>
        <Search size={13} /> anel…
      </div>
      <div className="flex gap-1.5 mt-2 flex-wrap">
        <span className="text-[12px] px-2 py-0.5 rounded-full" style={{ background: "#18403612", color: C.esmeralda }}>Anel AS1002</span>
      </div>
      <div className="rounded-lg border px-2.5 py-2 text-[12px] mt-2" style={{ borderColor: C.cremeBorder, color: "#9CA3AF", background: C.cremeBg }}>Descrição: todos os anéis da vitrine 3</div>
    </div>
  );
}
function telaCard(status: React.ReactNode, extra?: React.ReactNode, subtitulo?: string) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm" style={{ color: "#111827" }}>Anel AS1002</p>
          {subtitulo && <p className="text-[12px]" style={{ color: "#9CA3AF" }}>{subtitulo}</p>}
        </div>
        {status}
      </div>
      {extra}
    </div>
  );
}
const camera = (
  <div className="inline-flex items-center gap-1.5 text-[12px] mt-2 px-2 py-1 rounded" style={{ background: "#FBEFCF", color: "#8A5A0B" }}>
    <Camera size={13} /> Foto obrigatória
  </div>
);
const btn = (label: string, Icon?: React.ComponentType<{ size?: number }>) => (
  <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg mt-2" style={{ background: C.esmeralda, color: C.creme }}>
    {Icon && <Icon size={12} />}{label}
  </div>
);

const CENAS: Cena[] = [
  { passo: "1. Solicitar", quem: "Consultora", legenda: "A consultora busca a peça (ou descreve o lote) e clica em Solicitar. Sem foto — a peça ainda está no estoque.", render: telaSolicitar() },
  { passo: "2. Confirmar entrega", quem: "Estoque", legenda: "O estoque separa a peça e confirma a entrega — com foto da peça saindo da mão dele.", render: telaCard(<Chip tone="amber">Solicitado</Chip>, <div>{camera}<div>{btn("Confirmar entrega", Truck)}</div></div>, "Solicitado por Débora") },
  { passo: "3. Confirmar recebimento", quem: "Consultora", legenda: "Ao receber a peça na mão, a consultora confirma o recebimento — com foto.", render: telaCard(<Chip tone="blue">Entregue</Chip>, <div>{camera}<div>{btn("Confirmar recebimento", HandHeart)}</div></div>, "Entregue por Ana") },
  { passo: "4. Finalizar", quem: "Consultora / Estoque", legenda: "Resolvido: ou o cliente levou (encerra na hora), ou volta ao estoque — e aí o estoque confirma a devolução com foto.", render: telaCard(<Chip tone="slate">Com a solicitante</Chip>, <div className="flex gap-1.5 mt-2 flex-wrap"><span className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg border" style={{ borderColor: "#CDD3CC", color: "#111827" }}><UserCheck size={12} />Cliente levou</span><span className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-lg border" style={{ borderColor: "#CDD3CC", color: "#111827" }}><Undo2 size={12} />Devolver ao estoque</span></div>, "Com você desde 14:20") },
  { passo: "Encerrado", quem: "Histórico", legenda: "Fim. Tudo fica no histórico: quem fez cada passo, a data, a hora e as fotos. Nada some.", render: telaCard(<Chip tone="green">Cliente levou</Chip>, undefined, "Fechado por Débora") },
];

function SimuladorAutomatico() {
  const [i, setI] = useState(0);
  const [tocando, setTocando] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Respeita quem prefere menos animação: começa pausado.
    const reduz = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reduz) setTocando(false);
  }, []);

  useEffect(() => {
    if (!tocando) return;
    timer.current = setTimeout(() => setI((v) => (v + 1) % CENAS.length), 3800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [i, tocando]);

  const cena = CENAS[i];
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: C.cremeBorder, background: C.cremeBg }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: C.cremeBorder }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#9CA3AF" }}>Demonstração automática</span>
        <button onClick={() => setTocando((v) => !v)} className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg" style={{ background: "#18403612", color: C.esmeralda }} aria-label={tocando ? "Pausar" : "Tocar"}>
          {tocando ? <Pause size={13} /> : <Play size={13} />}{tocando ? "Pausar" : "Tocar"}
        </button>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-sm font-semibold" style={{ color: C.esmeralda }}>{cena.passo}</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: C.esmeralda, color: C.creme }}>{cena.quem}</span>
        </div>
        <div className="max-w-sm mx-auto md:mx-0">{cena.render}</div>
        <p className="text-[13px] mt-3" style={{ color: "#4B5563" }}>{cena.legenda}</p>
      </div>
      <div className="flex items-center gap-1.5 px-4 pb-3">
        {CENAS.map((_, idx) => (
          <button key={idx} onClick={() => { setI(idx); setTocando(false); }} aria-label={`Ir para o passo ${idx + 1}`}
            className="h-1.5 rounded-full transition-all" style={{ width: idx === i ? 22 : 8, background: idx === i ? C.esmeralda : "#D6CFC0" }} />
        ))}
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
          <div className="flex items-center justify-between"><span className="text-[12px] font-mono" style={{ color: "#9CA3AF" }}>#124 · agora</span><Chip tone="amber">Solicitado</Chip></div>
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Digite o nome ou o código (ex.: anel, AL440)…"
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
            : found.length === 0 ? <p className="text-center text-[13px] py-3" style={{ color: "#9CA3AF" }}>Nenhuma peça encontrada</p>
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
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Ex.: todos os anéis da vitrine 3"
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

// ─── Passo a passo + por que importa ──────────────────────────────────────────
const PASSOS = [
  { n: "1", titulo: "Solicitar a peça", quem: "Consultora", oque: "Busque por SKU ou, se for muita peça, escreva na descrição. Sem foto aqui.", porque: "Registra desde o começo quem pediu e o quê — o ponto de partida da rastreabilidade." },
  { n: "2", titulo: "Confirmar a entrega", quem: "Estoque", oque: "Separe a peça e confirme com foto.", porque: "A foto na saída prova o estado da peça e que ela saiu do estoque. Protege o estoquista." },
  { n: "3", titulo: "Confirmar o recebimento", quem: "Consultora", oque: "Ao pegar a peça, confirme com foto.", porque: "Fecha o elo: agora o sistema sabe que a peça está com você. Se sumir, dá pra saber em que mão estava." },
  { n: "4", titulo: "Finalizar", quem: "Consultora / Estoque", oque: "Cliente levou (encerra) ou Devolver ao estoque (o estoque confirma com foto).", porque: "Sem finalizar, a peça fica “em aberto” pra sempre. A devolução em 2 passos garante que o estoque confirmou o retorno — não basta dizer que devolveu." },
];

export default function MovimentacaoInternaTreino() {
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
        <p className="text-[13px]" style={{ color: "#4B5563" }}><b style={{ color: "#111827" }}>Regra de ouro:</b> foto em toda troca de mão (entrega, recebimento, devolução). Nada é apagado — tudo grava quem fez, a data e a hora.</p>
      </div>

      <SimuladorAutomatico />

      <h3 className="text-base font-semibold mt-8 mb-1" style={{ color: "#111827" }}>Pratique você mesmo</h3>
      <p className="text-[13px] mb-3" style={{ color: "#6B7280" }}>Sem medo — isto é um treino, não mexe no sistema. Foque em <b>quando usar a descrição</b> (lote grande).</p>
      <SimuladorInterativo />

      <h3 className="text-base font-semibold mt-8 mb-3" style={{ color: "#111827" }}>Passo a passo — e por que cada passo importa</h3>
      <div className="space-y-3">
        {PASSOS.map((p) => (
          <div key={p.n} className="rounded-xl border p-4" style={{ borderColor: C.cremeBorder, background: "#fff" }}>
            <div className="flex items-center gap-2.5 mb-1.5">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: C.esmeralda, color: C.creme }}>{p.n}</span>
              <b className="text-[15px]" style={{ color: "#111827" }}>{p.titulo}</b>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#18403612", color: C.esmeralda }}>{p.quem}</span>
            </div>
            <p className="text-[13px] ml-[38px]" style={{ color: "#4B5563" }}>{p.oque}</p>
            <div className="ml-[38px] mt-2 rounded-lg px-3 py-2" style={{ background: C.cremeBg, borderLeft: `3px solid ${C.esmeralda}` }}>
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.esmeralda }}>Por que importa</span>
              <p className="text-[13px] mt-0.5" style={{ color: "#4B5563" }}>{p.porque}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
