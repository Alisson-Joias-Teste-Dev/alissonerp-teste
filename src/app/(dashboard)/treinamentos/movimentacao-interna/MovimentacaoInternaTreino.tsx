"use client";

import { useState, useCallback } from "react";
import { Search, CheckCircle2, Truck, HandHeart, Undo2, UserCheck, X, Plus, Package, Ban } from "lucide-react";
import TreinamentoLayout, { type ColaItem } from "@/components/treinamentos/TreinamentoLayout";
import { type PassoTreino } from "@/components/treinamentos/TreinamentoPlayer";
import {
  CT, criarStatusChip, type ChipDef, Cursor, BotaoMock, CardMock, TelaMock,
  MenuMock, FotoObrigatoria, TimelineMock, nb,
} from "@/components/treinamentos/cenario";

/**
 * TREINAMENTO — Movimentação Interna (v2, 16/07/2026).
 * É o EXEMPLO DE REFERÊNCIA do formato padrão: só conteúdo (status, passos,
 * cola e a prática); o player e a casca vêm de @/components/treinamentos.
 *
 * IMPACTO SE ALTERADO: os rótulos/cores/botões abaixo espelham a tela real
 * (`movimentacao-interna/MovimentacaoInternaClient.tsx` → statusInfo/acoesDoStatus).
 * Se a tela mudar, ATUALIZE AQUI — treinamento que ensina tela que não existe
 * mais é pior do que não ter treinamento.
 */

// ─── Status: cópia fiel de statusInfo() da tela real ──────────────────────────
type StatusKey = "solicitado" | "entregue" | "recebido" | "volta_solicitada" | "cliente_levou" | "devolvido" | "cancelado";
const STATUS: Record<StatusKey, ChipDef> = {
  solicitado:       { label: "Solicitado",        bg: "#FEF3C7", color: "#92400E" },
  entregue:         { label: "Entregue",          bg: "#EFF6FF", color: "#2563EB" },
  recebido:         { label: "Com a solicitante", bg: "#F3F4F6", color: "#6B7280" },
  volta_solicitada: { label: "Volta solicitada",  bg: "#FEF3C7", color: "#92400E" },
  cancelado:        { label: "Cancelada",         bg: "#FCEBEB", color: "#A32D2D" },
  cliente_levou:    { label: "Cliente levou",     bg: "#ECFDF5", color: "#059669" },
  devolvido:        { label: "Devolvido",         bg: "#F3F4F6", color: "#6B7280" },
};
const StatusChip = criarStatusChip(STATUS);

const PECA = "Anel Solitário Ouro 18k";

// ─── Os 11 passos ─────────────────────────────────────────────────────────────
const PASSOS: PassoTreino[] = [
  {
    quem: "Consultora",
    titulo: "Abrir a tela",
    narracao: <>No menu lateral, abra {nb("Logística → Movimentação Interna")}. É aqui que fica tudo que saiu do estoque e ainda não voltou.</>,
    tela: (
      <MenuMock grupo="Logística" itens={[
        { label: "Protocolo" },
        { label: "Movimentação Interna", Icon: Package, ativo: true },
        { label: "Entregas" },
      ]} />
    ),
  },
  {
    quem: "Consultora",
    titulo: "Clicar em Solicitar Peça",
    narracao: <>No topo da tela, clique em {nb("Solicitar Peça")}.</>,
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold" style={{ color: "#111827" }}>Movimentação Interna</p>
          <BotaoMock label="Solicitar Peça" Icon={Plus} cursor />
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] mt-3" style={{ borderColor: CT.cremeBorder, color: "#9CA3AF" }}>
          <Search size={12} /> Buscar por produto, SKU ou descrição...
        </div>
      </div>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Buscar e marcar a peça",
    narracao: <>Digite o {nb("nome ou o SKU")} e marque a peça. Pode marcar {nb("várias de uma vez")}.</>,
    tela: (
      <TelaMock titulo="Solicitar Peça">
        <div className="flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px]" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>
          <Search size={12} style={{ color: "#9CA3AF" }} /> anel
        </div>
        <div className="mt-2 space-y-1">
          <div className="relative flex items-center gap-2 px-2.5 py-2 rounded-lg border" style={{ borderColor: CT.esmeralda, background: "#18403610" }}>
            <span className="w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: CT.esmeralda }}>
              <CheckCircle2 size={9} style={{ color: CT.creme }} />
            </span>
            <span className="text-[12px] font-medium" style={{ color: CT.esmeralda }}>{PECA}</span>
            <span className="text-[10px] font-mono ml-auto" style={{ color: "#9CA3AF" }}>AS1002</span>
            <Cursor />
          </div>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border" style={{ borderColor: CT.cremeBorder }}>
            <span className="w-3.5 h-3.5 rounded border" style={{ borderColor: "#D1D5DB" }} />
            <span className="text-[12px]" style={{ color: "#374151" }}>Anel Aparador Cravejado</span>
            <span className="text-[10px] font-mono ml-auto" style={{ color: "#9CA3AF" }}>AP204</span>
          </div>
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Lote grande? Use a Descrição",
    narracao: <>Se for muita peça pra marcar uma a uma (uma bandeja inteira), escreva no campo {nb("Descrição (para lote grande)")}: “todos os anéis da vitrine 3”.</>,
    porque: "Sem isso a consultora perde cinco minutos marcando peça por peça — e acaba não registrando nada. Um registro com descrição vale muito mais do que registro nenhum.",
    tela: (
      <TelaMock titulo="Solicitar Peça">
        <p className="text-[11px] font-semibold mb-1" style={{ color: "#6B7280" }}>Descrição (para lote grande)</p>
        <div className="rounded-lg border px-2.5 py-2 text-[12px]" style={{ borderColor: CT.esmeralda, color: "#374151", minHeight: 42 }}>
          todos os anéis da vitrine 3
          <span className="inline-block w-px h-3.5 ml-0.5 align-middle animate-pulse" style={{ background: CT.esmeralda }} />
        </div>
        <p className="text-[10px] mt-1" style={{ color: "#9CA3AF" }}>Ex: todos os anéis da vitrine 3</p>
      </TelaMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Solicitar",
    narracao: <>Clique em {nb("Solicitar")}. {nb("Aqui não tem foto")} — a peça ainda está no estoque, ninguém pegou nada.</>,
    resultado: <StatusChip s="solicitado" />,
    tela: (
      <div className="space-y-2">
        <div className="rounded-xl border px-3 py-2 flex justify-end items-center gap-2" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
          <span className="text-[12px] px-3 py-1.5" style={{ color: "#6B7280" }}>Cancelar</span>
          <BotaoMock label="Solicitar" cursor />
        </div>
        <CardMock titulo={PECA} sub="AS1002 · Solicitado por Débora · agora" chip={<StatusChip s="solicitado" />} />
      </div>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Desistiu? Cancele — não deixe pendurado",
    narracao: <>Cliente mudou de ideia antes de a peça sair do estoque? Clique em {nb("Cancelar")} e {nb("escreva o motivo")} (é obrigatório). Só dá pra cancelar enquanto está {nb("Solicitado")} — depois que a peça foi entregue, o caminho é {nb("Devolver ao estoque")}.</>,
    porque: "Solicitação abandonada em “Solicitado” faz o estoque perseguir peça que ninguém quer, e o filtro Em aberto vira mentira. O motivo é obrigatório porque é ele que mostra por que as vendas estão morrendo antes de começar.",
    resultado: <StatusChip s="cancelado" />,
    tela: (
      <CardMock titulo={PECA} sub="AS1002 · Solicitado por Débora · 14:02" chip={<StatusChip s="solicitado" />}>
        <div className="rounded-lg px-2.5 py-2 text-[11px]" style={{ background: "#FFFBEB", color: "#92400E", border: "1px solid #FDE68A" }}>
          A peça continua no estoque. Nada é movimentado.
        </div>
        <div className="rounded-lg border px-2.5 py-2 mt-2 text-[11px]" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>
          Cliente desistiu da peça
          <span className="inline-block w-px h-3.5 ml-0.5 align-middle animate-pulse" style={{ background: CT.esmeralda }} />
        </div>
        <div className="mt-2"><BotaoMock label="Cancelar solicitação" Icon={Ban} cursor /></div>
      </CardMock>
    ),
  },
  {
    quem: "Estoque",
    titulo: "Confirmar a entrega — com foto",
    narracao: <>O estoque separa a peça e clica em {nb("Confirmar entrega")}. O sistema {nb("exige a foto")} — tire com a peça na mão, antes de passar pra consultora.</>,
    porque: "A foto na saída prova o estado em que a peça saiu e que ela realmente saiu. Protege o estoquista: se aparecer um risco depois, a foto mostra como estava.",
    resultado: <StatusChip s="entregue" />,
    tela: (
      <CardMock titulo={PECA} sub="AS1002 · Solicitado por Débora · 14:02" chip={<StatusChip s="solicitado" />}>
        <FotoObrigatoria />
        <div className="mt-2"><BotaoMock label="Confirmar entrega" Icon={Truck} cursor /></div>
      </CardMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Confirmar o recebimento — com foto",
    narracao: <>Ao pegar a peça {nb("na mão")}, clique em {nb("Confirmar recebimento")} e tire a foto.</>,
    porque: "Fecha o elo. A partir daqui o sistema sabe que a peça está com você — e se ela sumir, dá pra saber em que mão estava.",
    resultado: <StatusChip s="recebido" />,
    tela: (
      <CardMock titulo={PECA} sub="AS1002 · Entregue por Ana · 14:05" chip={<StatusChip s="entregue" />} etiquetas={["Foto da Entrega"]}>
        <FotoObrigatoria />
        <div className="mt-2"><BotaoMock label="Confirmar recebimento" Icon={HandHeart} cursor /></div>
      </CardMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Desfecho A — Cliente levou",
    narracao: <>Vendeu? Clique em {nb("Cliente levou")}. Encerra na hora e {nb("não pede foto")} — a peça saiu com o cliente.</>,
    resultado: <StatusChip s="cliente_levou" />,
    tela: (
      <CardMock titulo={PECA} sub="Com você desde 14:20" chip={<StatusChip s="recebido" />} etiquetas={["Foto da Entrega", "Foto do Recebimento"]}>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <BotaoMock label="Cliente levou" Icon={UserCheck} primario={false} cursor />
          <BotaoMock label="Devolver ao estoque" Icon={Undo2} primario={false} />
        </div>
      </CardMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Desfecho B — Devolver ao estoque",
    narracao: <>Não vendeu? Clique em {nb("Devolver ao estoque")}. Atenção: isso {nb("ainda NÃO encerra")} — só avisa o estoque que a peça está voltando.</>,
    porque: "É o passo que mais gera peça esquecida. Muita gente clica aqui, entrega a peça na mão e acha que acabou — mas o card fica em “Volta solicitada” até o estoque confirmar.",
    resultado: <StatusChip s="volta_solicitada" />,
    tela: (
      <CardMock titulo={PECA} sub="Com você desde 14:20" chip={<StatusChip s="recebido" />} etiquetas={["Foto da Entrega", "Foto do Recebimento"]}>
        <div className="flex gap-1.5 mt-2 flex-wrap">
          <BotaoMock label="Cliente levou" Icon={UserCheck} primario={false} />
          <BotaoMock label="Devolver ao estoque" Icon={Undo2} primario={false} cursor />
        </div>
      </CardMock>
    ),
  },
  {
    quem: "Estoque",
    titulo: "Confirmar a devolução — com foto",
    narracao: <>O estoque recebe a peça de volta e clica em {nb("Confirmar devolução")}, com foto. {nb("Só agora")} a solicitação encerra.</>,
    porque: "A volta é em dois tempos de propósito: não basta dizer que devolveu — o estoque confirma que recebeu. Enquanto ninguém confirma, a peça continua na sua responsabilidade.",
    resultado: <StatusChip s="devolvido" />,
    tela: (
      <CardMock titulo={PECA} sub="Volta pedida por Débora · 17:40" chip={<StatusChip s="volta_solicitada" />} etiquetas={["Foto da Entrega", "Foto do Recebimento"]}>
        <FotoObrigatoria />
        <div className="mt-2"><BotaoMock label="Confirmar devolução" Icon={CheckCircle2} cursor /></div>
      </CardMock>
    ),
  },
  {
    quem: "Todos",
    titulo: "Conferir o histórico",
    narracao: <>Clique em {nb("qualquer card")} pra abrir a linha do tempo: quem fez cada passo, data, hora e as fotos. {nb("Nada é apagado.")}</>,
    tela: (
      <TelaMock titulo="Histórico da solicitação" acessorio={<StatusChip s="devolvido" />}>
        <TimelineMock linhas={[
          { t: "Solicitado", q: "Débora", h: "14:02" },
          { t: "Entregue", q: "Ana", h: "14:05", foto: true },
          { t: "Recebido", q: "Débora", h: "14:20", foto: true },
          { t: "Volta solicitada", q: "Débora", h: "17:40" },
          { t: "Devolvido", q: "Ana", h: "17:52", foto: true },
        ]} />
      </TelaMock>
    ),
  },
];

// ─── Cola rápida ──────────────────────────────────────────────────────────────
const COLA: ColaItem[] = [
  { chip: <StatusChip s="solicitado" />, txt: "A consultora pediu. A peça ainda está no estoque." },
  { chip: <StatusChip s="entregue" />, txt: "O estoque já entregou (com foto). Falta a consultora confirmar que pegou." },
  { chip: <StatusChip s="recebido" />, txt: "A peça está na mão da consultora. A responsabilidade é dela até encerrar." },
  { chip: <StatusChip s="volta_solicitada" />, txt: "A consultora devolveu, mas o estoque ainda NÃO confirmou. Não está encerrada." },
  { chip: <StatusChip s="cliente_levou" />, txt: "Encerrada: o cliente levou a peça." },
  { chip: <StatusChip s="devolvido" />, txt: "Encerrada: o estoque confirmou o retorno da peça (com foto)." },
];

// ─── Prática: Solicitar Peça ──────────────────────────────────────────────────
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
      <div className="rounded-2xl border p-6 text-center" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
        <div className="w-11 h-11 rounded-full inline-flex items-center justify-center mb-2" style={{ background: CT.esmeralda, color: CT.creme }}><CheckCircle2 size={20} /></div>
        <p className="text-lg font-semibold" style={{ color: "#111827" }}>Solicitado!</p>
        <div className="rounded-xl border p-3 mt-3 text-left" style={{ borderColor: CT.cremeBorder, background: CT.cremeBg }}>
          <div className="flex items-center justify-between"><span className="text-[12px] font-mono" style={{ color: "#9CA3AF" }}>#124 · agora</span><StatusChip s="solicitado" /></div>
          {sel.length > 0 && <p className="text-[13px] mt-1.5" style={{ color: "#374151" }}>{sel.map((p) => `${p.nome} (${p.sku})`).join(", ")}</p>}
          {desc.trim() && <p className="text-[13px] mt-1 italic" style={{ color: "#6B7280" }}>“{desc.trim()}”</p>}
        </div>
        <p className="text-[13px] mt-3" style={{ color: "#6B7280" }}>Agora o estoque separa e confirma a entrega, com foto.</p>
        <button onClick={reset} className="mt-4 text-[13px] font-semibold px-4 py-2 rounded-lg" style={{ background: CT.esmeralda, color: CT.creme }}>Fazer outro</button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: CT.cremeBorder }}>
        <p className="font-semibold text-[15px]" style={{ color: "#111827" }}>Solicitar Peça</p>
        <span className="text-[12px]" style={{ color: "#9CA3AF" }}>{sel.length > 0 ? `${sel.length} peça(s)` : "pratique aqui"}</span>
      </div>
      <div className="p-4">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#9CA3AF" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto por nome ou SKU..."
            className="w-full pl-7 pr-3 py-2 rounded-lg border text-sm focus:outline-none" style={{ borderColor: CT.cremeBorder }} />
        </div>
        {sel.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {sel.map((p) => (
              <span key={p.sku} className="inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-full" style={{ background: "#18403612", color: CT.esmeralda }}>
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
                  style={{ borderColor: on ? CT.esmeralda : CT.cremeBorder, background: on ? "#18403612" : "transparent" }}>
                  <span className="w-4 h-4 rounded flex items-center justify-center border" style={{ background: on ? CT.esmeralda : "#fff", borderColor: on ? CT.esmeralda : "#D1D5DB" }}>
                    {on && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3L3.5 5.5L8 1" stroke="#F3EADA" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </span>
                  <span className="flex-1"><span className="text-[13px] font-medium" style={{ color: CT.esmeralda }}>{p.nome}</span><br /><span className="text-[11px] font-mono" style={{ color: "#9CA3AF" }}>{p.sku}</span></span>
                </button>
              );
            })}
        </div>

        <div className="mt-4 rounded-xl border border-dashed p-3" style={{ borderColor: CT.esmeralda, background: CT.cremeBg }}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: CT.esmeralda, color: CT.creme }}>LOTE GRANDE?</span>
            <b className="text-[13px]" style={{ color: "#111827" }}>Use a descrição</b>
          </div>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} placeholder="Ex: todos os anéis da vitrine 3"
            className="w-full px-2.5 py-2 rounded-lg border text-sm focus:outline-none resize-none" style={{ borderColor: CT.cremeBorder }} />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EXEMPLOS.map((ex) => (
              <button key={ex} onClick={() => setDesc((d) => d ? `${d.replace(/\s*$/, "")}; ${ex}` : ex)}
                className="text-[12px] px-2.5 py-1 rounded-full border" style={{ borderColor: CT.cremeBorder, color: CT.esmeralda }}>“{ex}”</button>
            ))}
          </div>
        </div>
      </div>
      <div className="px-4 py-3 border-t flex justify-end gap-2" style={{ borderColor: CT.cremeBorder }}>
        <button onClick={reset} className="text-[13px] px-3 py-2 rounded-lg" style={{ color: "#6B7280" }}>Limpar</button>
        <button onClick={() => setFeito(true)} disabled={!pode} className="text-[13px] font-semibold px-4 py-2 rounded-lg disabled:opacity-45" style={{ background: CT.esmeralda, color: CT.creme }}>Solicitar</button>
      </div>
    </div>
  );
}

interface TreinoProps { videoUrl: string | null; isDev: boolean; treinamentoKey: string }

export default function MovimentacaoInternaTreino(props: TreinoProps) {
  return (
    <TreinamentoLayout
      {...props}
      titulo="Movimentação Interna"
      subtitulo="Registra quem está com cada peça dentro da loja — do estoque até voltar (ou o cliente levar). Cada troca de mão fica com foto, quem, data e hora."
      regraDeOuro={<>foto em toda troca de mão (entrega, recebimento, devolução). Nada é apagado — tudo grava quem fez, a data e a hora.</>}
      passos={PASSOS}
      cola={COLA}
      praticaSub={<>Sem medo — isto é um treino, não mexe no sistema. Foque em <b>quando usar a descrição</b> (lote grande).</>}
    >
      <SimuladorInterativo />
    </TreinamentoLayout>
  );
}
