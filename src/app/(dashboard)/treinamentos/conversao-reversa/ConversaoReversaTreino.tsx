"use client";

import { Search, Gem, Clock, Check, XCircle, ShieldCheck, Camera, Landmark } from "lucide-react";
import TreinamentoLayout, { type ColaItem } from "@/components/treinamentos/TreinamentoLayout";
import { type PassoTreino } from "@/components/treinamentos/TreinamentoPlayer";
import {
  CT, criarStatusChip, type ChipDef, Cursor, BotaoMock, CardMock, TelaMock,
  MenuMock, TimelineMock, nb,
} from "@/components/treinamentos/cenario";

/**
 * TREINAMENTO — Conversão Reversa (ouro do cofre vira joia). Criado 16/07/2026
 * seguindo a receita `.claude/commands/treinamento.md`.
 *
 * IMPACTO SE ALTERADO: os rótulos/cores/botões abaixo foram copiados da tela real:
 *   - aba Ouro (botão "Virou joia", selo "Reversa aguardando aprovação", peso
 *     restante): `financeiro/FinanceiroClient.tsx` (TabCaixa)
 *   - modal: `components/forms/ConversaoReversaModal.tsx`
 *   - tarefa de aprovação: `tarefas/TarefaDrawer.tsx` (bloco conversao_reversa)
 *   - config de aprovadores: `components/configuracoes/aprovadores/ListaAprovadores.tsx`
 *   - obrigatoriedade da foto e trava de aprovador: `api/conversao-reversa/route.ts`
 * Se qualquer uma dessas telas mudar, ATUALIZE AQUI no mesmo commit.
 */

// ─── Chips: cópia fiel do que aparece na tela ─────────────────────────────────
type StatusKey = "aguardando" | "aprovada" | "rejeitada";
const STATUS: Record<StatusKey, ChipDef> = {
  // selo do item na aba Ouro (FinanceiroClient)
  aguardando: { label: "Reversa aguardando aprovação", bg: "#E0F2FE", color: "#0369A1" },
  // chips da tarefa (TarefaDrawer → STATUS_COLS)
  aprovada:   { label: "Aprovada",  bg: "#D1FAE5", color: "#059669" },
  rejeitada:  { label: "Rejeitada", bg: "#FEE2E2", color: "#DC2626" },
};
const StatusChip = criarStatusChip(STATUS);

/** Chip do tipo de origem, como aparece na coluna "Origem" da aba Ouro. */
const ORIGEM_CHIP: ChipDef = { label: "Venda", bg: "#E4F1E9", color: "#184036" };

// ─── Os 11 passos ─────────────────────────────────────────────────────────────
const PASSOS: PassoTreino[] = [
  {
    quem: "Admin",
    titulo: "Antes de tudo: definir quem aprova",
    narracao: <>Em {nb("Configurações → Aprovadores")}, ache {nb("Conversão Reversa (ouro do cofre virou joia)")} e marque quem pode aprovar. Pode marcar {nb("mais de uma pessoa")}.</>,
    porque: "Sem ninguém marcado, o sistema NÃO deixa abrir a conversão — dá erro pedindo pra configurar. E só quem está nessa lista aprova: nem admin de fora aprova, e a tarefa nem aparece pra quem não está nela.",
    tela: (
      <TelaMock titulo="Aprovadores">
        <div className="flex items-start gap-2">
          <span className="text-[15px]">💎</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>Conversão Reversa (ouro do cofre virou joia)</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>Só quem estiver marcado aqui aprova. Pode marcar vários.</p>
            <div className="mt-2 space-y-1">
              <div className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg border" style={{ borderColor: CT.esmeralda, background: "#18403610" }}>
                <span className="w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: CT.esmeralda }}>
                  <Check size={9} style={{ color: CT.creme }} />
                </span>
                <span className="text-[12px] font-medium" style={{ color: CT.esmeralda }}>Alisson Ranyel</span>
                <Cursor />
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border" style={{ borderColor: CT.cremeBorder }}>
                <span className="w-3.5 h-3.5 rounded border" style={{ borderColor: "#D1D5DB" }} />
                <span className="text-[12px]" style={{ color: "#374151" }}>Germana Valentim</span>
              </div>
            </div>
          </div>
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Estoquista",
    titulo: "Abrir a aba Ouro",
    narracao: <>Vá em {nb("Financeiro")}, aba {nb("Caixa")}, e clique no filtro {nb("Ouro")}. Depois abra {nb("Pendentes de Baixa")}.</>,
    tela: (
      <MenuMock grupo="Financeiro" itens={[
        { label: "Contas a Pagar" },
        { label: "Caixa", Icon: Landmark, ativo: true },
        { label: "Conciliação" },
      ]} />
    ),
  },
  {
    quem: "Estoquista",
    titulo: "Entender o peso restante",
    narracao: <>Cada linha é um ouro que está no cofre esperando baixa. Quando já saiu um pedaço, a linha mostra {nb("quanto ainda resta")} — ex.: “14.000g restantes (de 22.000g)”.</>,
    porque: "O mesmo lote de ouro pode ter várias saídas: uma parte vira joia, o resto vai pra sangria. Se você olhar só o peso cheio, tenta tirar mais do que existe — e o sistema barra.",
    tela: (
      <TelaMock titulo="Pendentes de Baixa (2)">
        <div className="flex items-center justify-between gap-2 pb-2 border-b" style={{ borderColor: CT.cremeBorder }}>
          <span className="text-[10px] font-semibold uppercase" style={{ color: "#9CA3AF" }}>Origem</span>
          <span className="text-[10px] font-semibold uppercase" style={{ color: "#9CA3AF" }}>Ouro (g)</span>
        </div>
        <div className="flex items-center justify-between gap-2 py-2">
          <div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: ORIGEM_CHIP.bg, color: ORIGEM_CHIP.color }}>Venda</span>
            <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>#15231 · Germana</p>
          </div>
          <div className="text-right">
            <p className="text-[12px] font-medium tabular-nums" style={{ color: "#92400E" }}>14.000g restantes</p>
            <p className="text-[10px]" style={{ color: "#9CA3AF" }}>(de 22.000g)</p>
          </div>
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Estoquista",
    titulo: "Clicar em Virou joia",
    narracao: <>Achou uma joia vendável nesse ouro? Clique em {nb("Virou joia")} na linha. Vale pra {nb("qualquer origem")}: Venda em Ouro, Upgrade, Compra Metal ou Conversão.</>,
    tela: (
      <CardMock
        titulo="Venda #15231 · Germana"
        sub="14.000g restantes (de 22.000g)"
        chip={<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: ORIGEM_CHIP.bg, color: ORIGEM_CHIP.color }}>Venda</span>}
      >
        <div className="mt-2 flex gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
            style={{ background: "#fff", color: "#DC2626", borderColor: "#DC2626" }}>Estornar</span>
          <span className="relative inline-flex">
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
              style={{ background: "#FEF3C7", color: "#92400E", borderColor: "#B45309" }}>
              <Gem size={12} /> Virou joia
            </span>
            <Cursor />
          </span>
        </div>
      </CardMock>
    ),
  },
  {
    quem: "Estoquista",
    titulo: "Escolher a peça",
    narracao: <>No modal {nb("Virou Joia")}, busque o produto {nb("por nome ou SKU")}. Tem que ser uma peça {nb("já cadastrada e ativa")} — a conversão nunca cria produto novo.</>,
    tela: (
      <TelaMock titulo="Virou Joia" acessorio={<Gem size={14} style={{ color: "#D97706" }} />}>
        <div className="rounded-lg px-2.5 py-1.5 mb-2" style={{ background: "#FEF3C7" }}>
          <span className="text-[11px]" style={{ color: "#92400E" }}>Origem: Venda em Ouro #15231 · restante 14.000g</span>
        </div>
        <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "#9CA3AF" }}>Produto (peça) <span style={{ color: "#DC2626" }}>*</span></p>
        <div className="relative flex items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px]" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>
          <Search size={12} style={{ color: "#9CA3AF" }} /> Buscar por nome ou SKU...
          <Cursor />
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Estoquista",
    titulo: "Quantidade e peso da joia",
    narracao: <>{nb("Quantidade (peças)")} é número inteiro. O {nb("Peso da joia (g)")} já vem preenchido com o restante — ajuste pro peso real da peça. O limite aparece embaixo: {nb("máx 14.000g")}.</>,
    porque: "O peso não pode passar do restante daquela origem. Se passar, o sistema recusa: “Peso da joia não pode ultrapassar o restante disponível”. O que sobrar continua no cofre, esperando sangria.",
    tela: (
      <TelaMock titulo="Virou Joia">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "#9CA3AF" }}>Quantidade (peças) <span style={{ color: "#DC2626" }}>*</span></p>
            <div className="rounded-lg border px-2.5 py-2 text-[12px]" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>1</div>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "#9CA3AF" }}>Peso da joia (g) <span style={{ color: "#DC2626" }}>*</span></p>
            <div className="rounded-lg border px-2.5 py-2 text-[12px]" style={{ borderColor: CT.esmeralda, color: "#374151" }}>
              8.000<span className="inline-block w-px h-3.5 ml-0.5 align-middle animate-pulse" style={{ background: CT.esmeralda }} />
            </div>
            <p className="text-[10px] mt-0.5" style={{ color: "#6B7280" }}>máx 14.000g</p>
          </div>
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Estoquista",
    titulo: "Foto do peso — obrigatória",
    narracao: <>Tire a {nb("foto do peso")} da joia na balança. {nb("Sem foto o botão não libera")} — aqui não é opcional.</>,
    porque: "A foto é a prova de que aquele peso saiu do cofre e virou aquela peça. É o que o aprovador olha pra decidir, e o que fica no histórico pra auditoria depois.",
    tela: (
      <TelaMock titulo="Virou Joia">
        <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "#9CA3AF" }}>Foto do peso <span style={{ color: "#DC2626" }}>*</span></p>
        <div className="relative flex flex-col items-center justify-center gap-1 rounded-xl h-20"
          style={{ border: `2px dashed ${CT.cremeBorder}`, background: CT.cremeBg }}>
          <Camera size={18} style={{ color: "#9CA3AF" }} />
          <span className="text-[11px]" style={{ color: "#9CA3AF" }}>Tirar foto ou selecionar</span>
          <Cursor />
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Estoquista",
    titulo: "Enviar p/ aprovação",
    narracao: <>O {nb("Motivo")} é opcional (ex.: “peça finalizada na bancada”). Clique em {nb("Enviar p/ aprovação")}. {nb("Nada sai do cofre ainda")} — só depois que o aprovador aprovar.</>,
    resultado: <StatusChip s="aguardando" />,
    tela: (
      <div className="space-y-2">
        <TelaMock titulo="Virou Joia">
          <p className="text-[10px] font-semibold uppercase mb-1" style={{ color: "#9CA3AF" }}>Motivo (opcional)</p>
          <div className="rounded-lg border px-2.5 py-2 text-[12px] mb-2" style={{ borderColor: CT.cremeBorder, color: "#9CA3AF" }}>Ex.: peça finalizada na bancada</div>
          <div className="flex justify-end items-center gap-2">
            <span className="text-[12px] px-3 py-1.5" style={{ color: "#6B7280" }}>Cancelar</span>
            <span className="relative inline-flex">
              <span className="inline-flex items-center text-[12px] font-semibold px-3 py-1.5 rounded-lg" style={{ background: "#D97706", color: "#fff" }}>Enviar p/ aprovação</span>
              <Cursor />
            </span>
          </div>
        </TelaMock>
        <CardMock
          titulo="Venda #15231 · Germana"
          sub="14.000g restantes (de 22.000g)"
          chip={<span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#E0F2FE", color: "#0369A1" }}><Clock size={9} /> Reversa aguardando aprovação</span>}
        />
      </div>
    ),
  },
  {
    quem: "Aprovador",
    titulo: "A tarefa chega pra quem aprova",
    narracao: <>Quem está na lista recebe a tarefa em {nb("Tarefas")}. Abra a {nb("Conversão Reversa")}, confira a peça, o peso e a foto — e clique em {nb("Aprovar")}.</>,
    resultado: <StatusChip s="aprovada" />,
    porque: "Aprovar é o que mexe de verdade: o peso sai do Caixa de Ouro e a peça entra no estoque da Loja, tudo de uma vez. Por isso só quem está na lista aprova — e basta um deles.",
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
        <div className="flex items-center gap-2 mb-1.5">
          <ShieldCheck size={14} style={{ color: "#92400E" }} />
          <span className="text-[13px] font-semibold" style={{ color: "#92400E" }}>Conversão Reversa</span>
        </div>
        <p className="text-[11px]" style={{ color: "#6B7280" }}>
          Metal já registrado no Caixa de Ouro vira peça pronta: aprovar dá baixa no cofre e entrada no estoque; recusar não mexe em nada.
        </p>
        <div className="flex gap-1.5 mt-2.5">
          <span className="relative inline-flex flex-1">
            <span className="w-full inline-flex items-center justify-center gap-1 text-[12px] font-semibold py-1.5 rounded-lg" style={{ background: "#059669", color: "#fff" }}>
              <Check size={11} /> Aprovar
            </span>
            <Cursor />
          </span>
          <span className="flex-1 inline-flex items-center justify-center gap-1 text-[12px] font-semibold py-1.5 rounded-lg" style={{ background: "#EF4444", color: "#fff" }}>
            <XCircle size={11} /> Rejeitar
          </span>
        </div>
      </div>
    ),
  },
  {
    quem: "Aprovador",
    titulo: "Desfecho B — Rejeitar",
    narracao: <>Alguma coisa errada? Escreva o {nb("Motivo (obrigatório para rejeitar)")} e clique em {nb("Rejeitar")}. {nb("Nada muda")}: o ouro continua no cofre e nenhuma peça entra no estoque.</>,
    resultado: <StatusChip s="rejeitada" />,
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
        <div className="flex items-center gap-2 mb-1.5">
          <ShieldCheck size={14} style={{ color: "#92400E" }} />
          <span className="text-[13px] font-semibold" style={{ color: "#92400E" }}>Conversão Reversa</span>
        </div>
        <div className="rounded-lg border px-2.5 py-2 text-[11px] mb-2" style={{ borderColor: CT.cremeBorder, background: "#fff", color: "#374151" }}>
          Peso não confere com a foto da balança
        </div>
        <div className="flex gap-1.5">
          <span className="flex-1 inline-flex items-center justify-center gap-1 text-[12px] font-semibold py-1.5 rounded-lg" style={{ background: "#059669", color: "#fff" }}>
            <Check size={11} /> Aprovar
          </span>
          <span className="relative inline-flex flex-1">
            <span className="w-full inline-flex items-center justify-center gap-1 text-[12px] font-semibold py-1.5 rounded-lg" style={{ background: "#EF4444", color: "#fff" }}>
              <XCircle size={11} /> Rejeitar
            </span>
            <Cursor />
          </span>
        </div>
      </div>
    ),
  },
  {
    quem: "Todos",
    titulo: "Conferir no Histórico de Baixas",
    narracao: <>Na aba Ouro, abra {nb("Histórico de Baixas")} e clique na baixa. Aparece {nb("qual peça virou joia")}, quem solicitou, quem aprovou e a {nb("foto do peso")}.</>,
    tela: (
      <TelaMock titulo="Baixa Ouro #17 · 8.000g" acessorio={<span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E" }}>estoque</span>}>
        <div className="rounded-lg border p-2 mb-2" style={{ borderColor: "#FDE68A", background: "#FFFBEB" }}>
          <p className="text-[11px] font-semibold mb-1" style={{ color: "#92400E" }}>Conversão Reversa · CR-2405</p>
          <p className="text-[11px]" style={{ color: "#374151" }}>Virou: <b>Anel de teste</b> (1717) · 1 peça · 8.000g</p>
          <p className="text-[11px]" style={{ color: "#6B7280" }}>Solicitou: Jonathan · Aprovou: Alisson Ranyel</p>
          <div className="mt-1.5 h-10 rounded flex items-center justify-center gap-1" style={{ background: "#00000010" }}>
            <Camera size={12} style={{ color: "#6B7280" }} /><span className="text-[10px]" style={{ color: "#6B7280" }}>foto do peso</span>
          </div>
        </div>
        <TimelineMock linhas={[
          { t: "Solicitada", q: "Jonathan", h: "14:02", foto: true },
          { t: "Aprovada", q: "Alisson", h: "14:20" },
        ]} />
      </TelaMock>
    ),
  },
];

// ─── Cola rápida ──────────────────────────────────────────────────────────────
const COLA: ColaItem[] = [
  {
    chip: <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: "#FEF3C7", color: "#92400E" }}>Xg restantes</span>,
    txt: "O que ainda sobra daquele ouro no cofre. É o teto do peso que você pode transformar em joia.",
  },
  { chip: <StatusChip s="aguardando" />, txt: "Já existe uma reversa aberta nessa origem. Fica travada até o aprovador decidir — não dá pra abrir outra." },
  { chip: <StatusChip s="aprovada" />, txt: "O peso saiu do Caixa de Ouro e a peça entrou no estoque da Loja. É o único momento em que algo se move." },
  { chip: <StatusChip s="rejeitada" />, txt: "Nada mudou: o ouro continua no cofre e nenhuma peça entrou no estoque." },
];

export default function ConversaoReversaTreino() {
  return (
    <TreinamentoLayout
      titulo="Conversão Reversa"
      subtitulo="Um ouro que está no cofre esperando baixa (de uma venda em ouro, upgrade, compra de metal ou conversão) vira uma joia pronta no estoque da Loja. Tira peso do cofre e coloca a peça no estoque — sem nenhum lançamento financeiro."
      regraDeOuro={<>foto do peso é <b style={{ color: "#111827" }}>obrigatória</b> e <b style={{ color: "#111827" }}>nada sai do cofre sem aprovação</b>. Só quem está na lista de aprovadores aprova — e o peso nunca pode passar do restante da origem.</>}
      passos={PASSOS}
      cola={COLA}
    />
  );
}
