"use client";

import { Bike, MapPin, DollarSign, AlignLeft, Check, XCircle, Clock, CheckCircle, Search, Plus, Store, Camera, Send, AlertTriangle } from "lucide-react";
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
 * BLOCO 6 (21/07/2026) — reescrito do zero para o comportamento FINAL da
 * branch feat/frete-avulso-solicitacao (após os blocos 1-5). Cada rótulo foi
 * conferido de novo contra o código NESTA data — fonte de cada um:
 *
 *   - DUAS listas de aprovadores, título EXATO de cada uma ("Frete avulso
 *     solicitado — pago pelo cliente" / "Frete avulso solicitado — custo da
 *     loja") e suas descrições: `components/configuracoes/aprovadores/
 *     ListaAprovadores.tsx` (chaves `aprovadores_frete_avulso` e
 *     `aprovadores_frete_avulso_loja`, ~L205-219).
 *   - mensagem de erro quando falta aprovador em cada lista ("Nenhum
 *     aprovador de frete avulso configurado..." / "...(loja) configurado..."):
 *     `lib/entrega-venda.ts` (`criarFreteAvulso`, ~L2435-2439).
 *   - item "Frete avulso" do menu "+ Nova" visível pra QUALQUER papel que
 *     acessa Tarefas (não só consultora — `podeVer: (_r) => true`), rótulo e
 *     descrição ("Solicitar frete fora do fluxo normal da venda"):
 *     `app/(dashboard)/tarefas/TarefasClient.tsx` (`TIPOS_SOLICITACAO`
 *     ~L1028-1044, `menuNovoConteudo` ~L1052-1078).
 *   - campo "Venda (opcional)" (sem asterisco — deixou de ser obrigatória),
 *     hint "Se a corrida for de uma venda, busque aqui — o endereço vem
 *     preenchido.", placeholder "Buscar por número da venda ou cliente...",
 *     resultado "{numero_venda} — {cliente_nome}":
 *     `components/entregas/FreteAvulsoModal.tsx` (~L651-723).
 *   - endereço de entrega virou o formulário ESTRUTURADO (CEP, logradouro,
 *     número, complemento, bairro, cidade, UF) com busca automática por CEP
 *     (ViaCEP) — não é mais textarea de texto livre:
 *     `components/endereco/EnderecoForm.tsx` (migration 355) e uso em
 *     `FreteAvulsoModal.tsx` (~L725-741).
 *   - bloco "Quem paga *" (botões "Loja"/"Cliente") + "Comprovante de
 *     pagamento *" (obrigatório só quando Cliente), textos de apoio ("Cliente
 *     pagou — anexe o comprovante abaixo...", "Custo da loja — sem
 *     comprovante..."): `FreteAvulsoModal.tsx` (~L748-826, migration 354).
 *   - "Descrição da corrida *", "Valor cobrado do cliente (R$) *" (só quando
 *     pagante === 'cliente' — some com 'loja', ajuste 21/07,
 *     `precisaValorCobradoDoCliente` em `lib/frete-avulso-valor-cobrado.ts`),
 *     "Região *" (Fortaleza R$20 / Fora de Fortaleza R$50 / Longe (negociar) /
 *     Correios), botão "Solicitar frete avulso" e sucesso "Solicitação
 *     enviada — aguardando liberação": `FreteAvulsoModal.tsx` (`REGIOES`
 *     ~L143-148, rodapé ~L1013, sucesso ~L630).
 *   - guarda de solicitação duplicada ("Já existe uma solicitação de frete
 *     avulso aguardando decisão para esta venda."): `lib/entrega-venda.ts`
 *     (`criarFreteAvulso`, guard ~L2175-2188 na versão anterior — mesma
 *     mensagem mantida nesta).
 *   - aba "Minhas solicitações" (ícone Send) dentro do painel Filtros —
 *     mostra pra quem CRIOU a tarefa tudo que pediu, em qualquer status,
 *     inclusive recusada: `TarefasClient.tsx` (`VIEW_OPTIONS` ~L538).
 *   - o aprovador vê "Frete cobrado" e "Frete motoboy" (com fmtBRL) ANTES de
 *     decidir, "Quem paga: Cliente/Loja" e o link "Ver comprovante" quando o
 *     cliente paga; acima de R$200 (`LIMITE_ALERTA_FRETE_MOTOBOY`, `lib/
 *     frete-avulso-alerta.ts`) o card do frete do motoboy fica vermelho com
 *     ícone de alerta — SEM bloquear a aprovação:
 *     `app/(dashboard)/tarefas/TarefaDrawer.tsx` (~L709-800).
 *   - card da tarefa agrupado por venda (título "Venda {numero}", linha
 *     "Frete avulso") e o bloco Aprovar/Rejeitar com o textarea "Motivo
 *     (obrigatório para rejeitar)": `TarefasClient.tsx` (mapa `TIPO_LABEL`,
 *     aba "aguardando") + `TarefaDrawer.tsx` (bloco de decisão).
 *   - liberação (solicitada→pendente, lança o saldo) e recusa
 *     (solicitada→cancelada, motivo obrigatório): `lib/entrega-venda.ts`
 *     (`liberarFreteAvulso`, `recusarFreteAvulso`).
 *   - os casos do motoboy ("Aceitar corrida", "Finalizar entrega",
 *     "Aguardando confirmação da loja") e os badges de status do card
 *     ("Pendente"/"Em Rota"/"Entregue"):
 *     `app/(dashboard)/entregas-venda/motoboy/MotoboyAppClient.tsx`.
 *   - erro do 2º motoboy que tenta aceitar depois: `app/api/entregas-venda/
 *     [id]/aceitar-avulso/route.ts` ("Esta corrida já tem outro motoboy.").
 *   - o estoque (`estoquista_loja`) passou a ter acesso ao módulo de menu
 *     "Entregas" (`/entregas-venda`, ícone Truck, grupo "Logística") e vê
 *     TODAS as entregas avulsas, sem o filtro de vendedor_id que só vale pra
 *     consultora: `lib/auth/permissions.ts` (`ROLES_ENTREGAS_VENDA`,
 *     `ROLE_MENUS.estoquista_loja` ~L112), `components/Sidebar.tsx`
 *     (`ROLES_ENTREGAS_VENDA` ~L148), confirmado pelo teste
 *     `src/__tests__/entregas-venda-estoquista-acesso.test.ts`.
 *
 * RÓTULOS NÃO ENCONTRADOS NO CÓDIGO (reportado, não inventado): continua sem
 * existir um chip curto de UMA palavra para os estados 'solicitada' e
 * 'cancelada' em nenhum lugar da tela (esses estados só existem no banco/
 * backend — a venda não mostra status nenhum, e o app do motoboy não tem
 * badge pra esses dois). Os chips "Solicitada" e "Recusada" abaixo continuam
 * sendo só o indicador genérico "o registro vira X" do player de
 * treinamento — não simulam nenhum elemento real de tela.
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
    titulo: "Antes de tudo: configurar as DUAS listas de quem libera",
    narracao: <>Em {nb("Configurações → Aprovadores")} existem duas listas separadas: {nb("Frete avulso solicitado — pago pelo cliente")} (decide quando o CLIENTE paga, com comprovante) e {nb("Frete avulso solicitado — custo da loja")} (decide quando é a LOJA quem paga). Marque quem participa de cada uma — pode marcar {nb("mais de uma pessoa")} em cada lista.</>,
    porque: "Sem ninguém marcado na lista certa, o sistema NÃO deixa criar a solicitação — o erro muda conforme quem paga: \"Nenhum aprovador de frete avulso configurado\" (cliente) ou \"Nenhum aprovador de frete avulso (loja) configurado\" (loja). Esse passo é feito UMA vez.",
    tela: (
      <TelaMock titulo="Aprovadores">
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-[15px]">🛵</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>Frete avulso solicitado — pago pelo cliente</p>
              <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>Qualquer um da lista decide a mesma tarefa. Pode marcar vários.</p>
              <div className="mt-2 space-y-1">
                <div className="relative flex items-center gap-2 px-2 py-1.5 rounded-lg border" style={{ borderColor: CT.esmeralda, background: "#18403610" }}>
                  <span className="w-3.5 h-3.5 rounded flex items-center justify-center" style={{ background: CT.esmeralda }}>
                    <Check size={9} style={{ color: CT.creme }} />
                  </span>
                  <span className="text-[12px] font-medium" style={{ color: CT.esmeralda }}>Germana Valentim</span>
                  <Cursor />
                </div>
              </div>
            </div>
          </div>
          <div className="border-t" style={{ borderColor: CT.cremeBorder }} />
          <div className="flex items-start gap-2">
            <span className="text-[15px]">🏪</span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold" style={{ color: "#111827" }}>Frete avulso solicitado — custo da loja</p>
              <p className="text-[10px] mt-0.5" style={{ color: "#9CA3AF" }}>Lista separada — autoriza o custo quando é a loja quem paga.</p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border" style={{ borderColor: CT.cremeBorder }}>
                  <span className="w-3.5 h-3.5 rounded border" style={{ borderColor: "#D1D5DB" }} />
                  <span className="text-[12px]" style={{ color: "#374151" }}>Alisson Ranyel</span>
                </div>
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
    narracao: <>No módulo {nb("Tarefas")}, clique no botão {nb("+ Nova")} (canto superior). No menu que abre, vá até a seção {nb("Solicitações")} e clique em {nb("Frete avulso")} — visível pra {nb("QUALQUER papel")} que acessa Tarefas, não só consultora (no celular é o mesmo botão flutuante único, que abre o mesmo menu).</>,
    porque: "Antes só a consultora via este item — hoje quem decide é o PONTO DE ENTRADA (de onde o modal é aberto), não o cargo de quem clica. O atalho de dentro da própria venda (Aprovado/Em Rota/Entregue) continua existindo e abre o mesmo modal — mas já com a venda escolhida, pulando a busca (ver passo 3).",
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
    titulo: "Buscar a venda — agora opcional",
    narracao: <>O modal {nb("Solicitar Frete Avulso")} abre com o campo {nb("Venda (opcional)")} vazio. Se a corrida for de uma venda, digite o {nb("número da venda ou o nome do cliente")} e escolha na lista — senão, pode seguir sem buscar.</>,
    porque: "A corrida pode não ter venda nenhuma (ex.: \"levar material à loja\", \"buscar peça\") — por isso o rótulo diz \"(opcional)\" e não trava mais o botão de enviar. Nota: se em vez disso a consultora clicar no atalho \"Solicitar frete avulso\" de DENTRO da venda, este passo some — o mesmo modal já abre com a venda fixada.",
    tela: (
      <TelaMock titulo="Solicitar Frete Avulso" acessorio={<Bike size={14} style={{ color: CT.esmeralda }} />}>
        <p className="text-[10px] font-semibold uppercase mb-1 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
          <Search size={10} /> Venda (opcional)
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
    titulo: "Preencher o endereço — formulário com busca por CEP",
    narracao: <>O {nb("Endereço de entrega")} deixou de ser um texto único — agora é um formulário com {nb("CEP, logradouro, número, complemento, bairro, cidade e UF")}. Ao escolher a venda ele carrega sozinho (pode editar aqui — {nb("não muda o cadastro do cliente")}); digitando um CEP válido, os campos se preenchem sozinhos.</>,
    tela: (
      <TelaMock titulo="Solicitar Frete Avulso" acessorio={<MapPin size={14} style={{ color: CT.esmeralda }} />}>
        <p className="text-[10px] font-semibold uppercase mb-1 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
          <MapPin size={10} /> Endereço de entrega <span style={{ color: "#DC2626" }}>*</span>
        </p>
        <div className="grid grid-cols-3 gap-1.5 mb-1.5">
          <div className="relative col-span-2 rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: CT.esmeralda, color: "#374151" }}>
            60175-047
            <Cursor />
          </div>
          <div className="rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>210</div>
        </div>
        <div className="rounded-lg border px-2 py-1.5 text-[11px] mb-1.5" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>Rua das Flores</div>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>Aldeota</div>
          <div className="rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>Fortaleza</div>
          <div className="rounded-lg border px-2 py-1.5 text-[11px]" style={{ borderColor: CT.cremeBorder, color: "#374151" }}>CE</div>
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Informar quem paga — e anexar o comprovante se for o cliente",
    narracao: <>Escolha {nb("Quem paga")}: {nb("Loja")} ou {nb("Cliente")}. Se for {nb("Cliente")}, anexe o {nb("Comprovante de pagamento")} (foto) — campo obrigatório.</>,
    porque: "Este é o passo mais importante do treino: sem \"Quem paga\" marcado — ou sem o comprovante quando é o Cliente — o botão \"Solicitar frete avulso\" fica desabilitado, sem nenhum aviso na tela além disso. E quem paga decide QUEM vai aprovar depois: cliente cai na lista de acompanhamento, loja cai na lista que autoriza o custo (ver passo 1).",
    tela: (
      <TelaMock titulo="Solicitar Frete Avulso" acessorio={<Store size={14} style={{ color: CT.esmeralda }} />}>
        <p className="text-[10px] font-semibold uppercase mb-1 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
          <Store size={10} /> Quem paga <span style={{ color: "#DC2626" }}>*</span>
        </p>
        <div className="flex gap-1.5 mb-2">
          <span className="flex-1 text-center text-[11px] font-semibold py-1.5 rounded-lg border" style={{ borderColor: CT.cremeBorder, color: "#6B7280" }}>Loja</span>
          <span className="relative flex-1 inline-flex">
            <span className="w-full text-center text-[11px] font-semibold py-1.5 rounded-lg" style={{ background: CT.esmeralda, color: "#fff" }}>Cliente</span>
            <Cursor />
          </span>
        </div>
        <p className="text-[10px] font-semibold uppercase mb-1 flex items-center gap-1" style={{ color: "#9CA3AF" }}>
          <Camera size={10} /> Comprovante de pagamento <span style={{ color: "#DC2626" }}>*</span>
        </p>
        <div className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[11px] font-semibold" style={{ borderColor: "#D1FAE5", background: "#D1FAE5", color: "#059669" }}>
          <Camera size={12} /> Comprovante anexado
        </div>
      </TelaMock>
    ),
  },
  {
    quem: "Consultora",
    titulo: "Preencher valor, região e descrição — e enviar",
    narracao: <>Informe a {nb("Descrição da corrida")}, o {nb("Valor cobrado do cliente (R$)")} e a {nb("Região")} (Fortaleza / Fora de Fortaleza / Longe / Correios). Observações é opcional. Depois clique em {nb("Solicitar frete avulso")}.</>,
    porque: "A consultora não escolhe motoboy nem responsável — a solicitação cai no pool certo, definido pelo passo anterior (quem paga). Um novo pedido pra MESMA venda é barrado enquanto o anterior não for decidido: \"Já existe uma solicitação de frete avulso aguardando decisão para esta venda.\" Depois de enviar, dá pra acompanhar em \"Minhas solicitações\" (próximo passo). Este exemplo segue o caminho \"Cliente paga\" (passo anterior) — se a escolha tivesse sido \"Loja\", este campo \"Valor cobrado do cliente\" nem apareceria: a loja assume o custo integral, sem cobrança ao cliente (ajuste 21/07, pedido do Jonathan).",
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
    quem: "Quem solicitou",
    titulo: "Acompanhar em \"Minhas solicitações\"",
    narracao: <>Em {nb("Tarefas → Filtros → Minhas solicitações")}, quem pediu vê TODOS os próprios pedidos, em qualquer status — inclusive os {nb("recusados")}.</>,
    porque: "É o único lugar que mostra o pedido depois que ele some da fila do aprovador (por exemplo, se for recusado) — a venda não mostra mais nenhum status da solicitação.",
    tela: (
      <div className="rounded-xl border p-2 space-y-1.5" style={{ borderColor: CT.cremeBorder, background: "#fff" }}>
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg" style={{ background: "#18403610" }}>
          <Send size={13} style={{ color: CT.esmeralda }} />
          <span className="text-[12px] font-semibold" style={{ color: CT.esmeralda }}>Minhas solicitações</span>
        </div>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border" style={{ borderColor: CT.cremeBorder }}>
          <div className="min-w-0">
            <p className="text-[12px] font-medium truncate" style={{ color: "#1A1A1A" }}>Venda 15412 — Frete avulso</p>
            <p className="text-[10px]" style={{ color: "#9CA3AF" }}>Larissa Freitas</p>
          </div>
          <StatusChip s="cancelada" />
        </div>
      </div>
    ),
  },
  {
    quem: "Liberador (pool)",
    titulo: "A solicitação chega como tarefa — com os valores",
    narracao: <>Quem estiver no pool certo vê em {nb("Tarefas → Aguard. Aprovação")} os valores ANTES de decidir: {nb("Frete cobrado")} e {nb("Frete motoboy")}. Acima de {nb("R$200")} o valor do motoboy aparece em vermelho, com aviso — não bloqueia, só chama atenção.</>,
    porque: "Se for o cliente que paga, aparece também \"Quem paga: Cliente\" e o link para ver o comprovante anexado — sem isso, o comprovante fica salvo mas ninguém confere antes de decidir.",
    tela: (
      <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: CT.cremeBorder, background: CT.cremeBg }}>
        <p className="text-[12px] font-semibold" style={{ color: CT.esmeralda }}>Pagamento do Frete Avulso</p>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white p-2 border text-[11px]" style={{ borderColor: CT.cremeBorder }}>
            <p style={{ color: "#6B7280" }}>Frete cobrado</p>
            <p className="font-bold" style={{ color: "#111827" }}>R$ 20,00</p>
          </div>
          <div className="rounded-lg p-2 border text-[11px]" style={{ borderColor: "#FCA5A5", background: "#FEF2F2" }}>
            <p style={{ color: "#6B7280" }}>Frete motoboy</p>
            <p className="font-bold flex items-center gap-1" style={{ color: "#DC2626" }}>
              <AlertTriangle size={11} /> R$ 250,00
            </p>
          </div>
        </div>
        <p className="text-[11px]" style={{ color: "#6B7280" }}>
          Quem paga: <span className="font-semibold" style={{ color: "#1A1A1A" }}>Cliente</span>
        </p>
      </div>
    ),
  },
  {
    quem: "Liberador (pool)",
    titulo: "Aprovar — libera e lança o frete",
    narracao: <>Confira o endereço, os valores e (se for o caso) o comprovante, e clique em {nb("Aprovar")}.</>,
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
    narracao: <>Achou algo errado (endereço estranho, valor fora do padrão, comprovante que não confere)? Escreva o {nb("Motivo (obrigatório para rejeitar)")} e clique em {nb("Rejeitar")}.</>,
    porque: "O motivo é obrigatório — fica gravado na tarefa. A venda não mostra mais status da solicitação; quem pediu acompanha o desfecho em \"Minhas solicitações\" (passo 7) e, se quiser, solicita de novo pelo mesmo caminho (passo 2).",
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
    titulo: "A corrida aparece sem dono — o primeiro que aceitar leva",
    narracao: <>No app do motoboy, a corrida liberada aparece pra {nb("TODOS os entregadores")}, com o endereço e a observação herdados da venda. Clique em {nb("Aceitar corrida")}.</>,
    porque: "O PRIMEIRO que aceitar vira dono — quem tentar depois recebe \"Esta corrida já tem outro motoboy.\"",
    resultado: <StatusChip s="em_rota" />,
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
    porque: "Entrega confirmada entra no acerto do motoboy — é o corte que decide o que ele recebe. Quem também acompanha essas entregas pelo caminho normal: o estoque (papel estoquista_loja) agora tem acesso ao menu \"Entregas\" e vê TODAS as avulsas, sem filtro por vendedor. (Caso à parte não detalhado neste treino: se o PRÓPRIO motoboy registra a corrida, ela nasce esperando a LOJA confirmar, não o pool — o card mostra \"Aguardando confirmação da loja\" no lugar do botão Aceitar.)",
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
];

// ─── Cola rápida ──────────────────────────────────────────────────────────────
const COLA: ColaItem[] = [
  { chip: <StatusChip s="solicitada" />, txt: "Enviada. Está no pool certo (cliente ou loja, conforme quem paga), esperando algum aprovador liberar ou recusar." },
  { chip: <StatusChip s="pendente" />, txt: "Liberado — o frete já foi lançado no saldo da gerente, mas nenhum motoboy aceitou ainda." },
  { chip: <StatusChip s="em_rota" />, txt: "Um motoboy aceitou e está a caminho." },
  { chip: <StatusChip s="confirmada" />, txt: "Entregue — entra no acerto do motoboy." },
  { chip: <StatusChip s="cancelada" />, txt: "Recusado com motivo. Some da fila do aprovador, mas continua visível em \"Minhas solicitações\" — dá pra solicitar de novo." },
];

interface TreinoProps { videoUrl: string | null; isDev: boolean; treinamentoKey: string }

export default function FreteAvulsoTreino(props: TreinoProps) {
  return (
    <TreinamentoLayout
      {...props}
      titulo="Frete Avulso (solicitação)"
      subtitulo="Quem solicita (qualquer papel que acessa Tarefas) informa quem paga o frete e o endereço; a corrida cai no pool de aprovadores certo (qualquer um decide) e, depois de liberada, num pool de motoboys (o primeiro que aceitar leva a corrida)."
      regraDeOuro={<>quem solicita {nb("nunca escolhe motoboy nem responsável")} — a solicitação sempre cai no pool certo, definido por {nb("quem paga")} (Loja ou Cliente). Sem ninguém configurado nas DUAS listas de Aprovadores, ela nem consegue enviar.</>}
      passos={PASSOS}
      cola={COLA}
    />
  );
}
