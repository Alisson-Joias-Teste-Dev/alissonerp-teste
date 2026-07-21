"use client";

import { Bike, MapPin, DollarSign, AlignLeft, Check, XCircle, Clock, CheckCircle } from "lucide-react";
import TreinamentoLayout, { type ColaItem } from "@/components/treinamentos/TreinamentoLayout";
import { type PassoTreino } from "@/components/treinamentos/TreinamentoPlayer";
import {
  CT, criarStatusChip, type ChipDef, Cursor, BotaoMock, CardMock, TelaMock, nb,
} from "@/components/treinamentos/cenario";

/**
 * TREINAMENTO — Frete Avulso (solicitação, liberação por tarefa e pool de
 * motoboy). Criado 21/07/2026 seguindo a receita de conversao-reversa /
 * movimentacao-interna (exemplos de referência).
 *
 * IMPACTO SE ALTERADO: os rótulos/cores/botões abaixo foram copiados da tela real:
 *   - config do pool de aprovadores ("Frete avulso solicitado (pool)", ícone
 *     🛵, descrição): `components/configuracoes/aprovadores/ListaAprovadores.tsx`
 *     (entrada `aprovadores_frete_avulso`)
 *   - botão "Solicitar frete avulso" e os 3 banners de status (solicitada
 *     aguardando / liberada / recusada com motivo): `app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx`
 *     (`podeSolicitarFreteAvulso`, bloco "Frete avulso solicitado pela consultora (V3)")
 *   - chip "Aprovado"/"Em Rota"/"Entregue" da situação da venda (passo 2):
 *     `VendaDetalheClient.tsx` (SITUACAO_LABEL / SITUACAO_COLOR)
 *   - modal de solicitação (header "Solicitar Frete Avulso", campos Descrição
 *     da corrida / Endereço de entrega / Valor cobrado do cliente / Região /
 *     Observações, botão "Solicitar frete avulso", mensagem de sucesso
 *     "Solicitação enviada — aguardando liberação"): `components/entregas/FreteAvulsoModal.tsx`
 *   - título/descrição da tarefa ("Frete avulso solicitado — venda {numero}",
 *     "Corrida {codigo} ({regiao}). Endereço: ... Obs: ..."), prioridade "alta"
 *     e o estado 'solicitada': `lib/entrega-venda.ts` (`criarFreteAvulso`)
 *   - cabeçalho da tarefa (título, badge de prioridade "Alta", badge de status
 *     "Aguard. Aprovação") e o bloco genérico Aprovar/Rejeitar com o textarea
 *     "Motivo (obrigatório para rejeitar)": `app/(dashboard)/tarefas/TarefaDrawer.tsx`
 *     (linha ~353 cabeçalho; ~757 bloco de decisão) + `TarefasClient.tsx`
 *     (PRIORIDADE_BADGE, STATUS_COLS)
 *   - liberação (solicitada→pendente, lança o saldo) e recusa (solicitada→cancelada,
 *     motivo obrigatório): `lib/entrega-venda.ts` (`liberarFreteAvulso`, `recusarFreteAvulso`)
 *   - os 3 casos do motoboy ("Aceitar corrida", "Finalizar entrega",
 *     "Aguardando confirmação da loja") e os badges de status do card
 *     ("Pendente"/"Em Rota"/"Entregue"): `app/(dashboard)/entregas-venda/motoboy/MotoboyAppClient.tsx`
 *     (`statusBadge`, casos 1/2/3 ~L433-515)
 *   - erro do 2º motoboy que tenta aceitar depois: `app/api/entregas-venda/[id]/aceitar-avulso/route.ts`
 *     ("Esta corrida já tem outro motoboy.")
 *   - "entra no acerto do motoboy": comentário de `confirmarFreteAvulso` em `lib/entrega-venda.ts`
 *
 * RÓTULOS NÃO ENCONTRADOS NO CÓDIGO (reportado, não inventado): não existe um
 * chip curto de UMA palavra para os estados 'solicitada' e 'cancelada' em
 * lugar nenhum da tela (a venda mostra frase inteira no banner, e o app do
 * motoboy não tem badge pra esses dois — o fallback de `statusBadge()`
 * devolveria a string crua). Os chips "Solicitada" e "Recusada" abaixo foram
 * construídos a partir do texto do banner ("Frete avulso solicitado —
 * aguardando decisão..." / "Frete avulso recusado...") usando as MESMAS cores
 * dos banners reais — não são cópia literal de um chip existente. Também: o
 * board de Tarefas (`TarefasClient.tsx`, mapa `TIPO_LABEL`) não tem entrada
 * para o tipo "frete_avulso" — na coluna "Aguard. Aprovação" a linha da
 * aprovação mostraria hoje o texto cru "frete_avulso" em vez de um nome
 * amigável (gap pré-existente, fora do escopo deste treino). Por isso o passo
 * 6 usa o CABEÇALHO da tarefa (tarefa.titulo, que É formatado corretamente)
 * em vez da lista agrupada por venda, que tropeça nesse gap.
 */

// ─── Chips: cópia fiel do que existe (badges "Pendente"/"Em Rota"/"Entregue"
// são literais de MotoboyAppClient.statusBadge(); "Solicitada"/"Recusada" são
// construídos a partir das cores dos banners de VendaDetalheClient — ver nota acima) ──
type StatusKey = "solicitada" | "pendente" | "em_rota" | "confirmada" | "cancelada";
const STATUS: Record<StatusKey, ChipDef> = {
  solicitada: { label: "Solicitada", bg: "#EFF6FF", color: "#1E40AF" },
  pendente:   { label: "Pendente",   bg: "#FEF3C7", color: "#D97706" },
  em_rota:    { label: "Em Rota",    bg: "#FFF7ED", color: "#9A3412" },
  confirmada: { label: "Entregue",  bg: "#D1FAE5", color: "#059669" },
  cancelada:  { label: "Recusada",  bg: "#FEF2F2", color: "#991B1B" },
};
const StatusChip = criarStatusChip(STATUS);

/** Chip da situação da venda (SITUACAO_LABEL/SITUACAO_COLOR de VendaDetalheClient). */
const VENDA_CHIP: ChipDef = { label: "Aprovado", bg: "#D1FAE5", color: "#065F46" };

// ─── Os 12 passos ──────────────────────────────────────────────────────────────
const PASSOS: PassoTreino[] = [
  {
    quem: "Admin",
    titulo: "Antes de tudo: configurar quem libera",
    narracao: <>Em {nb("Configurações → Aprovadores")}, ache {nb("Frete avulso solicitado (pool)")} e marque quem pode liberar ou recusar. Pode marcar {nb("mais de uma pessoa")}.</>,
    porque: "Sem ninguém marcado, o sistema NÃO deixa criar a solicitação — dá erro \"Nenhum aprovador de frete avulso configurado\". Esse passo é feito UMA vez.",
    tela: (
      <TelaMock titulo="Aprovadores">
        <div className="flex items-start gap-2">
          <span className="text-[15px]">🛵</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>Frete avulso solicitado (pool)</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>Qualquer um da lista decide a mesma tarefa. Pode marcar vários.</p>
            <div className="mt-2 space-y-1">
              <div className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg border" style={{ borderColor: CT.esmeralda, background: "#18403610" }}>
                <span className="w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: CT.esmeralda }}>
                  <Check size={9} style={{ color: CT.creme }} />
                </span>
                <span className="text-[12px] font-medium" style={{ color: CT.esmeralda }}>Germana Valentim</span>
                <Cursor />
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border" style={{ borderColor: CT.cremeBorder }}>
                <span className="w-3.5 h-3.5 rounded border" style={{ borderColor: "#D1D5DB" }} />
                <span className="text-[12px]" style={{ color: "#374151" }}>Alisson Ranyel</span>
              </div>
            </div>
          </div>
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Abrir a venda",
    narracao: <>A solicitação sai de {nb("DENTRO da venda")} — não tem atalho pelo menu Entregas. Só aparece com a venda {nb("Aprovado, Em Rota ou Entregue")}.</>,
    porque: "Venda ainda rascunho (ou já cancelada/virou crédito) não mostra o botão — nem no servidor a solicitação é aceita fora dessa janela.",
    tela: (
      <CardMock titulo="Venda #15412 · Larissa Freitas" sub="Total R$ 2.480,00" chip={
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: VENDA_CHIP.bg, color: VENDA_CHIP.color }}>{VENDA_CHIP.label}</span>
      } />
    ),
  },
  {
    quem: "Consultora",
    titulo: "Clicar em Solicitar frete avulso",
    narracao: <>Dentro da venda, clique em {nb("Solicitar frete avulso")}.</>,
    tela: (
      <div className="relative w-full px-4 py-2.5 rounded-lg border flex items-center gap-2" style={{ backgroundColor: "#FAFAF7", borderColor: CT.cremeBorder, color: CT.esmeralda }}>
        <Bike size={15} />
        <span className="text-sm font-medium">Solicitar frete avulso</span>
        <Cursor />
      </div>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Conferir o endereço",
    narracao: <>O modal {nb("Solicitar Frete Avulso")} abre com o {nb("Endereço de entrega")} já preenchido com o cadastro da venda. Pode editar aqui — {nb("não muda o cadastro do cliente")}.</>,
    tela: (
      <TelaMock titulo="Solicitar Frete Avulso" acessorio={<Bike size={14} style={{ color: CT.esmeralda }} />}>
        <p className="text-[10px] font-semibold uppercase mb-1 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
          <MapPin size={10} /> Endereço de entrega <span style={{ color: "#DC2626" }}>*</span>
        </p>
        <div className="relative rounded-lg border px-2.5 py-2 text-[12px]" style={{ borderColor: CT.esmeralda, color: "#374151" }}>
          Rua das Flores, nº 210, Aldeota, Fortaleza, CE
          <Cursor />
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Preencher valor e enviar",
    narracao: <>Informe a {nb("Descrição da corrida")}, o {nb("Valor cobrado do cliente (R$)")} e a {nb("Região")} (Fortaleza / Fora de Fortaleza / Longe / Correios). Observações é opcional. Depois clique em {nb("Solicitar frete avulso")}.</>,
    porque: "A consultora NÃO escolhe motoboy nem responsável — a solicitação cai no pool configurado no passo 1. Qualquer um deles decide.",
    resultado: <StatusChip s="solicitada" />,
    tela: (
      <div className="space-y-2">
        <TelaMock titulo="Solicitar Frete Avulso">
          <p className="text-[10px] font-semibold uppercase mb-1 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
            <DollarSign size={10} /> Valor cobrado do cliente (R$) <span style={{ color: "#DC2626" }}>*</span>
          </p>
          <div className="rounded-lg border px-2.5 py-2 text-[12px] mb-2" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>20,00</div>
          <div className="flex justify-end">
            <span className="relative inline-flex">
              <BotaoMock label="Solicitar frete avulso" Icon={Bike} cursor />
            </span>
          </div>
        </TelaMock>
        <CardMock titulo="Venda #15412 · Larissa Freitas" sub="Total R$ 2.480,00" chip={<StatusChip s="solicitada" />} />
      </div>
    ),
  },
  {
    quem: "Liberador (pool)",
    titulo: "A solicitação chega como tarefa",
    narracao: <>Quem estiver no pool recebe a tarefa em {nb("Tarefas")}: {nb("“Frete avulso solicitado — venda 15412”")}. {nb("Qualquer um do pool vê")} — não é só o 1º da lista.</>,
    tela: (
      <TelaMock titulo="Frete avulso solicitado — venda 15412">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#92400E" }}>Alta</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: "#EDE9FE", color: "#7C3AED" }}>Aguard. Aprovação</span>
        </div>
        <p className="text-[11px]" style={{ color: "#374151" }}>
          Corrida FA-0231 (fortaleza). Endereço: Rua das Flores, nº 210, Aldeota, Fortaleza, CE.
        </p>
      </TelaMock>
    ),
  },
  {
    quem: "Liberador (pool)",
    titulo: "Aprovar — libera e lança o frete",
    narracao: <>Confira o endereço e o valor, e clique em {nb("Aprovar")}.</>,
    porque: "Aprovar muda a corrida de solicitada pra pendente e já lança o frete no saldo de frete grátis da gerente — nada disso acontece antes da aprovação.",
    resultado: <StatusChip s="pendente" />,
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: CT.cremeBorder }}>
        <textarea readOnly rows={2} placeholder="Motivo (obrigatório para rejeitar)"
          className="w-full px-3 py-2 border rounded-xl text-xs resize-none mb-2"
          style={{ borderColor: CT.cremeBorder, color: "#9CA3AF" }} />
        <div className="flex gap-2">
          <span className="relative flex-1 inline-flex">
            <span className="w-full inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-xl" style={{ backgroundColor: "#059669", color: "#fff" }}>
              <Check size={12} /> Aprovar
            </span>
            <Cursor />
          </span>
          <span className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-xl" style={{ backgroundColor: "#EF4444", color: "#fff" }}>
            <XCircle size={12} /> Rejeitar
          </span>
        </div>
      </div>
    ),
  },
  {
    quem: "Liberador (pool)",
    titulo: "Desfecho B — Recusar com motivo",
    narracao: <>Achou algo errado (endereço estranho, valor fora do padrão)? Escreva o {nb("Motivo (obrigatório para rejeitar)")} e clique em {nb("Rejeitar")}.</>,
    porque: "O motivo é obrigatório — a consultora vê exatamente por que foi recusado no banner da própria venda, com o botão \"Solicitar novamente\".",
    resultado: <StatusChip s="cancelada" />,
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: CT.cremeBorder }}>
        <textarea readOnly rows={2} value="Valor cobrado divergente do combinado com o cliente"
          className="w-full px-3 py-2 border rounded-xl text-xs resize-none mb-2"
          style={{ borderColor: CT.cremeBorder, color: "#374151" }} />
        <div className="flex gap-2">
          <span className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-xl" style={{ backgroundColor: "#059669", color: "#fff" }}>
            <Check size={12} /> Aprovar
          </span>
          <span className="relative flex-1 inline-flex">
            <span className="w-full inline-flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-xl" style={{ backgroundColor: "#EF4444", color: "#fff" }}>
              <XCircle size={12} /> Rejeitar
            </span>
            <Cursor />
          </span>
        </div>
      </div>
    ),
  },
  {
    quem: "Motoboy",
    titulo: "A corrida aparece sem dono",
    narracao: <>No app do motoboy, a corrida liberada aparece pra {nb("TODOS os entregadores")} com o endereço e a observação herdados da venda.</>,
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] font-bold" style={{ color: CT.esmeralda }}>FA-0231</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#D97706" }}>Pendente</span>
        </div>
        <p className="text-[11px]" style={{ color: "#6B7280" }}>
          <span className="font-semibold" style={{ color: "#1f2937" }}>Larissa Freitas</span> · <span className="font-semibold" style={{ color: "#6D28D9" }}>Levar colar na casa da cliente</span>
        </p>
        <p className="text-[11px] mt-1" style={{ color: "#6B7280" }}>📍 Rua das Flores, nº 210, Aldeota, Fortaleza, CE</p>
        <div className="mt-2">
          <BotaoMock label="Aceitar corrida" Icon={Bike} />
        </div>
      </div>
    ),
  },
  {
    quem: "Motoboy",
    titulo: "Aceitar corrida",
    narracao: <>Clique em {nb("Aceitar corrida")}.</>,
    porque: "O PRIMEIRO que aceitar vira dono — quem tentar depois recebe \"Esta corrida já tem outro motoboy.\"",
    resultado: <StatusChip s="em_rota" />,
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] font-bold" style={{ color: CT.esmeralda }}>FA-0231</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#D97706" }}>Pendente</span>
        </div>
        <div className="mt-2 relative inline-flex">
          <BotaoMock label="Aceitar corrida" Icon={Bike} cursor />
        </div>
      </div>
    ),
  },
  {
    quem: "Motoboy",
    titulo: "Finalizar entrega",
    narracao: <>Depois de entregar, clique em {nb("Finalizar entrega")}.</>,
    porque: "Entrega confirmada entra no acerto do motoboy — é o corte que decide o que ele recebe.",
    resultado: <StatusChip s="confirmada" />,
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] font-bold" style={{ color: CT.esmeralda }}>FA-0231</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#FFF7ED", color: "#9A3412" }}>Em Rota</span>
        </div>
        <div className="mt-2 relative inline-flex">
          <BotaoMock label="Finalizar entrega" Icon={CheckCircle} cursor />
        </div>
      </div>
    ),
  },
  {
    quem: "Motoboy",
    titulo: "Caso à parte — corrida que ele mesmo registrou",
    narracao: <>Se o PRÓPRIO motoboy registra a corrida (ele já saiu e volta pra lançar depois), ela {nb("nasce esperando a LOJA confirmar")} — não o pool. No lugar do botão Aceitar, o card mostra {nb("“Aguardando confirmação da loja”")}.</>,
    porque: "É um caminho diferente da solicitação da consultora — não confundir os dois: aqui quem libera é a loja, não o pool de aprovadores.",
    tela: (
      <div className="rounded-xl border p-3" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[13px] font-bold" style={{ color: CT.esmeralda }}>FA-0244</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded" style={{ background: "#FEF3C7", color: "#D97706" }}>Pendente</span>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2" style={{ background: CT.cremeBg }}>
          <Clock size={13} style={{ color: "#92400E" }} />
          <span className="text-[11px] font-medium" style={{ color: "#92400E" }}>Aguardando confirmação da loja</span>
        </div>
      </div>
    ),
  },
];

// ─── Cola rápida ──────────────────────────────────────────────────────────────
const COLA: ColaItem[] = [
  { chip: <StatusChip s="solicitada" />, txt: "A consultora enviou. Está no pool, esperando algum aprovador liberar ou recusar." },
  { chip: <StatusChip s="pendente" />, txt: "Liberado — o frete já foi lançado no saldo da gerente, mas nenhum motoboy aceitou ainda." },
  { chip: <StatusChip s="em_rota" />, txt: "Um motoboy aceitou e está a caminho." },
  { chip: <StatusChip s="confirmada" />, txt: "Entregue — entra no acerto do motoboy." },
  { chip: <StatusChip s="cancelada" />, txt: "Recusado com motivo. A consultora vê o motivo na própria venda e pode solicitar de novo." },
];

interface TreinoProps { videoUrl: string | null; isDev: boolean; treinamentoKey: string }

export default function FreteAvulsoTreino(props: TreinoProps) {
  return (
    <TreinamentoLayout
      {...props}
      titulo="Frete Avulso (solicitação)"
      subtitulo="A consultora solicita um motoboy avulso de dentro da própria venda. A solicitação cai num pool de liberadores (qualquer um decide) e, depois de liberada, num pool de motoboys (o primeiro que aceitar leva a corrida)."
      regraDeOuro={<>a consultora {nb("nunca escolhe motoboy nem responsável")} — a solicitação sempre cai no pool. Sem ninguém configurado em Aprovadores, ela nem consegue enviar.</>}
      passos={PASSOS}
      cola={COLA}
    />
  );
}
