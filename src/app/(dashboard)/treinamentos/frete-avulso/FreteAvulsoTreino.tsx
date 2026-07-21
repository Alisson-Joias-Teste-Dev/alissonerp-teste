"use client";

import { Bike, MapPin, DollarSign, AlignLeft, Check, XCircle, Clock, CheckCircle, Search, Plus } from "lucide-react";
import TreinamentoLayout, { type ColaItem } from "@/components/treinamentos/TreinamentoLayout";
import { type PassoTreino } from "@/components/treinamentos/TreinamentoPlayer";
import {
  CT, criarStatusChip, type ChipDef, Cursor, BotaoMock, TelaMock, nb,
} from "@/components/treinamentos/cenario";

/**
 * TREINAMENTO — Frete Avulso (solicitação, liberação por tarefa e pool de
 * motoboy). Criado 21/07/2026 seguindo a receita de conversao-reversa /
 * movimentacao-interna (exemplos de referência).
 *
 * ATUALIZADO 21/07/2026 (fix/tarefas+treinamento): o fluxo mudou — a
 * solicitação passou a nascer TAMBÉM (e principalmente) no módulo Tarefas.
 * Os rótulos abaixo foram conferidos de novo contra o código:
 *
 * ATUALIZADO DE NOVO 21/07/2026 (commit e938410c, "feat(tarefas): botao do
 * topo vira menu (Solicitacoes + Tarefa avulsa)"): o botão solto "Frete
 * avulso" do cabeçalho virou um MENU — o botão do topo agora é "+ Nova"
 * (ícone Plus) e abre um dropdown com a seção "Solicitações" (hoje só o item
 * "Frete avulso"; lista pensada pra CRESCER sem trocar de lugar), separador,
 * e "Tarefa avulsa". No mobile é um FAB único que abre o mesmo menu.
 *   - botão "+ Nova" (ícone Plus) no cabeçalho desktop do módulo Tarefas;
 *     menu com seção "Solicitações" → item "Frete avulso" (ícone Bike,
 *     descrição "Solicitar frete fora do fluxo normal da venda", só pra
 *     `role === "consultora"`), separador, e "Tarefa avulsa" (ícone Plus);
 *     no mobile o MESMO menu abre pelo FAB único (aria-label "Nova"):
 *     `app/(dashboard)/tarefas/TarefasClient.tsx` (commit e938410c —
 *     `TIPOS_SOLICITACAO` ~L979-988, `menuNovoConteudo` ~L991-1021, botão
 *     desktop ~L1176-1192, FAB mobile ~L1537-1554)
 *   - busca de venda dentro do modal (label "Venda *", placeholder "Buscar
 *     por número da venda ou cliente...", resultado "{numero_venda} —
 *     {cliente_nome}") e mensagem de sucesso "Solicitação enviada —
 *     aguardando liberação": `components/entregas/FreteAvulsoModal.tsx`
 *     (busca ~L462-505, sucesso ~L392-401)
 *   - atalho ALTERNATIVO — botão "Solicitar frete avulso" de dentro da
 *     própria venda (Aprovado/Em Rota/Entregue), que abre o MESMO modal já
 *     com a venda escolhida (pula a busca): `app/(dashboard)/vendas/[id]/VendaDetalheClient.tsx`
 *     (`podeSolicitarFreteAvulso`, botão ~L2682-2691)
 *   - a venda NÃO mostra mais nenhum status da solicitação (os banners
 *     aguardando/liberada/recusada foram removidos — comentário no próprio
 *     `VendaDetalheClient.tsx` ~L4710-4716: "Não recarrega mais a venda ao
 *     solicitar... não há mais nada aqui que dependa desse refresh"); o
 *     acompanhamento é só em Tarefas.
 *   - guarda de solicitação duplicada ("Já existe uma solicitação de frete
 *     avulso aguardando decisão para esta venda."): `lib/entrega-venda.ts`
 *     (`criarFreteAvulso`, guard ~L2175-2188)
 *   - modal de solicitação (header "Solicitar Frete Avulso", campos Descrição
 *     da corrida / Endereço de entrega / Valor cobrado do cliente / Região /
 *     Observações, botão "Solicitar frete avulso"): `components/entregas/FreteAvulsoModal.tsx`
 *   - título/descrição da tarefa ("Frete avulso solicitado — venda {numero}",
 *     "Corrida {codigo} ({regiao}). Endereço: ... Obs: ..."), prioridade "alta"
 *     e o estado 'solicitada': `lib/entrega-venda.ts` (`criarFreteAvulso`)
 *   - card da tarefa agrupado por venda (título "Venda {numero}", linha por
 *     aprovação com o nome amigável do tipo — agora "Frete avulso" — e os
 *     botões ✓/✗) e o bloco genérico Aprovar/Rejeitar com o textarea "Motivo
 *     (obrigatório para rejeitar)": `app/(dashboard)/tarefas/TarefasClient.tsx`
 *     (mapa `TIPO_LABEL`, aba "aguardando" ~L1215-1399) + `TarefaDrawer.tsx`
 *     (~757 bloco de decisão)
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
 * lugar nenhum da tela (esses estados só existem no banco/backend agora — a
 * venda não mostra mais status nenhum, e o app do motoboy não tem badge pra
 * esses dois). Os chips "Solicitada" e "Recusada" abaixo são só o indicador
 * genérico "o registro vira X" do próprio player de treinamento — não
 * simulam nenhum elemento real de tela.
 */

// ─── Chips: cópia fiel do que existe (badges "Pendente"/"Em Rota"/"Entregue"
// são literais de MotoboyAppClient.statusBadge(); "Solicitada"/"Recusada" não
// têm chip real na tela — ver nota "RÓTULOS NÃO ENCONTRADOS" acima) ──
type StatusKey = "solicitada" | "pendente" | "em_rota" | "confirmada" | "cancelada";
const STATUS: Record<StatusKey, ChipDef> = {
  solicitada: { label: "Solicitada", bg: "#EFF6FF", color: "#1E40AF" },
  pendente:   { label: "Pendente",   bg: "#FEF3C7", color: "#D97706" },
  em_rota:    { label: "Em Rota",    bg: "#FFF7ED", color: "#9A3412" },
  confirmada: { label: "Entregue",  bg: "#D1FAE5", color: "#059669" },
  cancelada:  { label: "Recusada",  bg: "#FEF2F2", color: "#991B1B" },
};
const StatusChip = criarStatusChip(STATUS);

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
    titulo: "Abrir o menu Nova e escolher Frete avulso",
    narracao: <>No módulo {nb("Tarefas")}, clique no botão {nb("+ Nova")} (canto superior) — esse é o caminho PRINCIPAL agora. No menu que abre, vá até a seção {nb("Solicitações")} e clique em {nb("Frete avulso")}. Só aparece pra quem é {nb("consultora")} (no celular é o mesmo botão flutuante único, que abre o mesmo menu).</>,
    porque: "É dali que vão sair TODAS as solicitações no futuro — hoje só o Frete avulso está na lista, mas o menu já nasceu pensado pra crescer sem trocar de lugar. O atalho de dentro da própria venda (Aprovado/Em Rota/Entregue) continua existindo e abre o mesmo modal — mas já com a venda escolhida, pulando a busca (ver nota do passo 3).",
    tela: (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 rounded-xl border p-2.5" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
          <span className="text-[13px] font-semibold" style={{ color: CT.esmeralda }}>Tarefas</span>
          <BotaoMock label="Nova" Icon={Plus} />
        </div>
        <div className="rounded-xl border p-2 space-y-1" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
          <p className="text-[9px] font-bold uppercase tracking-wide px-1 pt-0.5 pb-0.5" style={{ color: "#9CA3AF" }}>Solicitações</p>
          <span className="relative flex items-start gap-2 px-2 py-1.5 rounded-lg" style={{ background: "#18403610" }}>
            <Bike size={13} className="flex-shrink-0 mt-0.5" style={{ color: CT.esmeralda }} />
            <span className="min-w-0">
              <span className="block text-[12px] font-medium" style={{ color: "#1A1A1A" }}>Frete avulso</span>
              <span className="block text-[10px]" style={{ color: "#9CA3AF" }}>Solicitar frete fora do fluxo normal da venda</span>
            </span>
            <Cursor />
          </span>
          <div className="border-t my-1" style={{ borderColor: CT.cremeBorder }} />
          <span className="flex items-center gap-2 px-2 py-1.5 text-[12px]" style={{ color: "#6B7280" }}>
            <Plus size={13} /> Tarefa avulsa
          </span>
        </div>
      </div>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Buscar e escolher a venda",
    narracao: <>O modal {nb("Solicitar Frete Avulso")} abre com o campo {nb("Venda")} vazio. Digite o {nb("número da venda ou o nome do cliente")} e escolha na lista.</>,
    porque: "Nota: se em vez disso ela clicar no atalho \"Solicitar frete avulso\" de DENTRO da venda, este passo some — o mesmo modal já abre com a venda fixada.",
    tela: (
      <TelaMock titulo="Solicitar Frete Avulso" acessorio={<Bike size={14} style={{ color: CT.esmeralda }} />}>
        <p className="text-[10px] font-semibold uppercase mb-1 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
          <Search size={10} /> Venda <span style={{ color: "#DC2626" }}>*</span>
        </p>
        <div className="rounded-lg border px-2.5 py-2 text-[12px] mb-1" style={{ borderColor: CT.cremeBorder, color: "#9CA3AF" }}>
          Buscar por número da venda ou cliente...
        </div>
        <div className="relative rounded-lg border" style={{ borderColor: CT.cremeBorder }}>
          <div className="px-2.5 py-1.5 text-[12px]" style={{ color: "#111827" }}>
            <b>15412</b> — Larissa Freitas
          </div>
          <Cursor />
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Conferir o endereço",
    narracao: <>Ao escolher a venda, o {nb("Endereço de entrega")} carrega sozinho a partir do cadastro dela. Pode editar aqui — {nb("não muda o cadastro do cliente")}.</>,
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
    porque: "A consultora NÃO escolhe motoboy nem responsável — a solicitação cai no pool configurado no passo 1. Enquanto ninguém decide, um novo pedido pra MESMA venda é barrado: \"Já existe uma solicitação de frete avulso aguardando decisão para esta venda.\"",
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
        <div className="rounded-xl border p-4 text-center" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
          <CheckCircle size={26} style={{ color: "#059669" }} className="mx-auto mb-1" />
          <p className="text-[12px] font-bold" style={{ color: CT.esmeralda }}>Solicitação enviada — aguardando liberação</p>
        </div>
      </div>
    ),
  },
  {
    quem: "Liberador (pool)",
    titulo: "A solicitação chega como tarefa",
    narracao: <>Quem estiver no pool vê em {nb("Tarefas → Aguard. Aprovação")} o card da {nb("Venda 15412")} com a linha {nb("“Frete avulso”")} — nome amigável, não o código cru. {nb("Qualquer um do pool decide")} — não é só o 1º da lista.</>,
    tela: (
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
        <div className="p-3 border-b" style={{ borderColor: "#F3F4F6" }}>
          <p className="text-[13px] font-semibold" style={{ color: "#1A1A1A" }}>Venda 15412</p>
          <p className="text-[11px] mt-0.5" style={{ color: "#6B7280" }}>Larissa Freitas</p>
        </div>
        <div className="px-3 py-2.5 flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium" style={{ color: "#1A1A1A" }}>Frete avulso</span>
          <div className="flex gap-1.5">
            <span className="px-2 py-1 text-[11px] rounded-lg font-semibold" style={{ background: "#059669", color: "#fff" }}>✓</span>
            <span className="px-2 py-1 text-[11px] rounded-lg font-semibold border" style={{ borderColor: "#FCA5A5", color: "#DC2626" }}>✗</span>
          </div>
        </div>
      </div>
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
    porque: "O motivo é obrigatório — fica gravado na tarefa. A venda não mostra mais status da solicitação; a consultora acompanha o desfecho em Tarefas e, se quiser, solicita de novo pelo mesmo caminho (passo 2).",
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
  { chip: <StatusChip s="cancelada" />, txt: "Recusado com motivo. A consultora vê o motivo em Tarefas e pode solicitar de novo." },
];

interface TreinoProps { videoUrl: string | null; isDev: boolean; treinamentoKey: string }

export default function FreteAvulsoTreino(props: TreinoProps) {
  return (
    <TreinamentoLayout
      {...props}
      titulo="Frete Avulso (solicitação)"
      subtitulo="A consultora solicita um motoboy avulso pelo módulo Tarefas (ou pelo atalho de dentro da própria venda). A solicitação cai num pool de liberadores (qualquer um decide) e, depois de liberada, num pool de motoboys (o primeiro que aceitar leva a corrida)."
      regraDeOuro={<>a consultora {nb("nunca escolhe motoboy nem responsável")} — a solicitação sempre cai no pool. Sem ninguém configurado em Aprovadores, ela nem consegue enviar.</>}
      passos={PASSOS}
      cola={COLA}
    />
  );
}
