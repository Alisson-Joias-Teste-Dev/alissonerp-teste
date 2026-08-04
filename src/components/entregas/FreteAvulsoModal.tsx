"use client";

/**
 * FreteAvulsoModal — Modal para criar (ou solicitar) uma corrida avulsa de motoboy.
 *
 * REGRA DE NEGÓCIO: frete avulso não tem venda vinculada (exceto no modo
 * solicitação, ver abaixo). O motoboy realiza a corrida (buscar peça, levar
 * material, etc.) e confirma no app com um botão. Sem código de verificação,
 * sem WhatsApp.
 *
 * REGRA DE NEGÓCIO (solicitação da consultora — migration 353, modelo POOL;
 * fix 21/07 — venda deixa de ser obrigatória): quando quem abre o modal é a
 * consultora, ela não cria o avulso já liberado — apenas SOLICITA,
 * informando o endereço de entrega (editável aqui, NÃO altera o cadastro do
 * cliente/venda) e o valor cobrado do cliente. A venda é OPCIONAL — a
 * corrida pode não partir de uma venda (ex.: "levar material à loja",
 * "buscar peça"); quando buscada/selecionada, pré-preenche o endereço a
 * partir dela. Não escolhe motoboy nem responsável: a solicitação cai no
 * pool de aprovadores da chave de config `aprovadores_frete_avulso`
 * (Config › Aprovadores; qualquer um decide via módulo Tarefas).
 *
 * REGRA DE NEGÓCIO (V3 — solicitar DE DENTRO da venda): quando a prop
 * `vendaId` é informada (aberto pelo botão "Solicitar frete avulso" da própria
 * tela da venda — ver VendaDetalheClient), a venda já é conhecida e o modal
 * NÃO mostra o buscador de venda — só o endereço (pré-preenchido via
 * `enderecoInicial`, ainda editável) e o valor cobrado.
 *
 * REGRA DE NEGÓCIO (decisão do Jonathan, 21/07): o módulo Tarefas é o lugar
 * ÚNICO das solicitações — abre este modal SEM `vendaId` (ver TarefasClient),
 * então cai no modo de busca de venda abaixo (modoSolicitacao sem vendaId). O
 * mesmo modo de busca também continua servindo quem abre o modal pela tela
 * de Entregas.
 *
 * REGRA DE NEGÓCIO (intenção explícita — ponto de entrada decide, não o
 * cargo): o modo (SOLICITAÇÃO vs criação DIRETA) vem da prop `modoSolicitacao`,
 * setada pelo caller conforme de ONDE o modal foi aberto — não é mais
 * inferido pelo `userRole` (antes `userRole === "consultora"`). O QUÊ: antes o
 * MESMO botão fazia coisas diferentes conforme o cargo de quem clicava (uma
 * surpresa silenciosa) e admin/dev não conseguiam nem testar o fluxo de
 * solicitação. POR QUÊ: quem sabe a intenção é o PONTO DE ENTRADA (menu
 * Tarefas → Solicitações = sempre solicitação; botão da tela de Entregas =
 * sempre direto), não o cargo de quem está logado.
 * IMPACTO SE VOLTAR A INFERIR POR CARGO: reaparece o comportamento fantasma —
 * o mesmo modal, aberto do mesmo lugar, mudando de comportamento conforme
 * quem está logado.
 *
 * REGRA DE NEGÓCIO (migration 359, 21/07 — "quem paga", só no modo
 * solicitação): a consultora informa QUEM PAGA o frete — 'loja' ou 'cliente'.
 * Se 'cliente', o comprovante de pagamento (foto) é OBRIGATÓRIO (validado
 * aqui E no backend, criarFreteAvulso). O aprovador muda conforme a escolha
 * (cliente -> pool de sempre, `aprovadores_frete_avulso`; loja -> lista nova
 * `aprovadores_frete_avulso_loja`) mas isso é resolvido no servidor — o modal
 * só manda `pagante` + `comprovanteBase64`.
 * IMPACTO SE ALTERADO: sem o campo, o backend rejeita a solicitação (400);
 * sem o comprovante quando pagante='cliente', idem.
 *
 * REGRA DE NEGÓCIO (migration 355, 21/07 — endereço estruturado): o campo de
 * endereço deixou de ser um textarea de texto livre e virou o formulário
 * estruturado EnderecoForm (CEP/logradouro/número/complemento/bairro/cidade/
 * UF, com busca automática por CEP) — padrão do sistema, já usado em Nova
 * Venda. O pré-preenchimento a partir da venda (própria ou buscada) agora
 * mapeia CAMPO A CAMPO (enderecoDaVenda), não concatena mais num texto único.
 * Mínimo obrigatório: logradouro + número + cidade (validado aqui E no
 * backend, criarFreteAvulso — defesa em profundidade).
 * IMPACTO SE ALTERADO: o backend rejeita (400) sem logradouro/número/cidade.
 *
 * REGRA DE NEGÓCIO (ajuste 21/07 — "se for loja não precisa colocar o valor
 * cobrado do cliente", pedido do Jonathan): o campo "Valor cobrado do
 * cliente" só aparece/é exigido quando pagante === 'cliente' (ver
 * precisaValorCobradoDoCliente(), src/lib/frete-avulso-valor-cobrado.ts).
 * Com pagante === 'loja' o campo some, não bloqueia o submit e o valor
 * enviado ao backend é 0 (freteCobrado) — a loja assume o custo integral da
 * corrida. Sem migration nova: é só front + validação, o backend
 * (`z.number().nonnegative()`, criarFreteAvulso) já aceitava 0.
 * IMPACTO SE ALTERADO: campo sem sentido volta a ser exigido com loja
 * pagando, travando a solicitação por um valor que não existe nesse caso.
 *
 * REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07 — decisão do Jonathan:
 * "mesmo formulário da tarefa, mas criação DIRETA"): o botão "Frete Avulso"
 * da tela de Entregas (EntregasVendaClient.tsx) passou a abrir este modal com
 * a nova prop `formularioCompleto` (SEM `modoSolicitacao`) — mostra o MESMO
 * formulário de 2 colunas da solicitação (venda opcional, endereço
 * estruturado, quem paga + comprovante, valor cobrado, região, observação),
 * mas continua criando DIRETO (`solicitar` não é enviado — nasce 'pendente',
 * sem tarefa/pool). `mostrarFormularioCompleto` (= `modoSolicitacao ||
 * formularioCompleto`) controla SÓ o LAYOUT (quais campos aparecem);
 * `ehSolicitacao` (= `modoSolicitacao`, inalterado) continua controlando o
 * MODO DE ENVIO (se manda `solicitar: true` e os textos "Solicitar"/
 * "Solicitação enviada"). Isso permite o par (completo, direto) que não
 * existia antes — só (enxuto, direto) e (completo, solicitação).
 * IMPACTO SE MISTURADO: usar `ehSolicitacao` para decidir o LAYOUT faria o
 * modo direto voltar ao formulário enxuto (motoboy+região+cliente, sem
 * endereço/pagante/comprovante) mesmo com `formularioCompleto=true`.
 *
 * IMPACTO SE ALTERADO: delegar a criação para POST /api/entregas-venda/frete-avulso.
 * Não fazer INSERT direto.
 *
 * LIMPEZA (código morto, 21/07): o formulário ENXUTO antigo (motoboy
 * escolhido na hora + busca de cliente avulso, sem endereço/pagante/
 * comprovante) foi REMOVIDO. O QUÊ: existia um 3º modo — criação direta SEM
 * `formularioCompleto` — que só era alcançado quando NENHUM caller passava
 * `modoSolicitacao` nem `formularioCompleto`. POR QUÊ: desde o commit
 * ab4ee47a (reforma da tela Entregas) os 3 pontos de entrada reais
 * (EntregasVendaClient, VendaDetalheClient, TarefasClient) sempre passam um
 * dos dois — confirmado via grep, zero chamadores restantes para o enxuto.
 * IMPACTO SE REINTRODUZIDO: qualquer novo caller que abrir este modal sem
 * `modoSolicitacao`/`formularioCompleto` agora cai no formulário COMPLETO
 * (não existe mais fallback enxuto) — é a única forma suportada.
 *
 * REGRA DE NEGÓCIO (pedido do Jonathan, 03/08/2026 — "obrigatório o nome do
 * cliente"): reusa o `ClienteSelector` do módulo Metal (mesmo componente,
 * mesma busca em public.contatos — nada duplicado). Quando `vendaFixada`
 * (aberto de dentro da venda — VendaDetalheClient), o cliente já é
 * inequívoco (o da própria venda) — o caller manda `contatoIdInicial` e o
 * seletor nem aparece. Fora disso (Tarefas e Entregas-direto, os 2 casos SEM
 * venda pré-vinculada), o seletor aparece e é OBRIGATÓRIO; se uma venda for
 * buscada/selecionada dentro do modal, auto-preenche a partir do que
 * GET /api/vendas/[id] já retorna (cliente_id/nome/cpf/telefone — mesma
 * chamada que já preenche o endereço), continuando editável/trocável.
 * IMPACTO SE REMOVIDO: reabre a lacuna documentada na migration 365 ("frete
 * avulso não tem cliente") que virou gambiarra de config manual.
 *
 * REGRA DE NEGÓCIO (pedido do Jonathan, 04/08/2026 — endereço sai do
 * formulário principal, vira popup de confirmação): antes o endereço era um
 * EnderecoForm sempre visível no corpo do modal. Ficou "com cara de muito
 * trabalho" — trocado por um passo separado (ConfirmarEnderecoModal) que só
 * aparece ao clicar "Solicitar frete avulso":
 *   1. Venda selecionada na sugestão abaixo → sugere o endereço DELA.
 *   2. Sem venda, cliente com endereço no cadastro (public.contatos) →
 *      sugere o endereço DO CADASTRO (GET /api/contatos/busca agora traz
 *      esses campos).
 *   3. Nenhum dos dois → abre direto pra digitar (nada a confirmar).
 * A confirmação NUNCA é pulada quando existe sugestão — sempre mostra o
 * endereço por extenso e exige clique explícito antes de gravar (ver
 * ConfirmarEnderecoModal). O buscador de venda por NÚMERO (texto livre) saiu
 * — no lugar, ao selecionar o cliente o modal busca sozinho as vendas DELE
 * (GET /api/vendas?cliente_id=) e pergunta "essa corrida é de alguma
 * dessas?" — vendas fora da janela de entrega (aprovado/em_rota/entregue)
 * aparecem desabilitadas com o motivo (mesma janela que já existe em
 * criarFreteAvulso, JANELA_FRETE_AVULSO_COM_VENDA — não duplicada, só
 * refletida na UI).
 * IMPACTO SE REMOVIDO: motivo original documentado acima — sem confirmação,
 * corridas iam pro endereço errado ou o formulário ficava pesado demais pra
 * consultora preencher rápido.
 */

import { useState, useEffect, useRef } from "react";
import { X, Loader2, CheckCircle, Bike, MapPin, AlignLeft, DollarSign, Store, Camera } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useErrorStore } from "@/stores/errorStore";
import { type EnderecoValue, ENDERECO_VAZIO, enderecoDaVenda, type EnderecoVendaFields } from "@/components/endereco/EnderecoForm";
import ClienteSelector, { type ClienteOption } from "@/components/metal/ClienteSelector";
import ConfirmarEnderecoModal, { enderecoCompleto } from "@/components/entregas/ConfirmarEnderecoModal";
import { precisaValorCobradoDoCliente } from "@/lib/frete-avulso-valor-cobrado";

const C = {
  esmeralda: "#184036",
  esmeraldaLt: "#18403612",
  creme: "#F3EADA",
  cremeBorder: "#E8DCC8",
  cremeBg: "#FAFAF7",
  vermelho: "#DC2626",
  vermelhoLt: "#FEE2E2",
  verde: "#059669",
  verdeLt: "#D1FAE5",
  cinza: "#6B7280",
  cinzaBorder: "#E5E7EB",
};

/** Resultado da busca de venda — subconjunto de /api/vendas?cliente_id=. */
interface VendaBusca {
  id: number;
  numero_venda: string;
  cliente_nome: string | null;
  total_venda: number;
  situacao: string;
  data_venda: string;
}

/** REGRA DE NEGÓCIO (04/08/2026): janela de situações que criarFreteAvulso
 *  aceita pra vincular frete avulso a uma venda (ver src/lib/entrega-venda.ts,
 *  JANELA_FRETE_AVULSO_COM_VENDA) — refletida aqui SÓ pra desabilitar/avisar
 *  na UI, não é uma trava nova. Vendas fora disso aparecem na lista (o
 *  Jonathan pediu sem filtro), mas desabilitadas com o motivo.
 *  IMPACTO SE DIVERGIR DO BACKEND: UI deixaria clicável uma venda que o
 *  servidor rejeitaria com 400 — sempre espelhar a mesma lista. */
const JANELA_FRETE_AVULSO_COM_VENDA = ["aprovado", "em_rota", "entregue"];

function labelSituacaoVenda(situacao: string): string {
  const labels: Record<string, string> = {
    rascunho: "Rascunho", aprovado: "Aprovado", em_rota: "Em rota",
    entregue: "Entregue", concluido: "Concluída", cancelado: "Cancelada",
    virou_credito: "Virou crédito",
  };
  return labels[situacao] ?? situacao;
}

/** Endereço de cadastro trazido por GET /api/contatos/busca (03/08/2026). */
interface ClienteComEndereco extends ClienteOption {
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
}

function enderecoDoCadastro(c: ClienteComEndereco): EnderecoValue {
  return {
    cep: c.cep ?? "",
    logradouro: c.endereco ?? "",
    numero: c.numero ?? "",
    complemento: c.complemento ?? "",
    bairro: c.bairro ?? "",
    cidade: c.municipio ?? "",
    uf: c.uf ?? "",
  };
}

/** Campos de endereço de entrega retornados por GET /api/vendas/[id] —
 *  mesmo formato aceito por enderecoDaVenda() (EnderecoForm.tsx). */
type VendaEnderecoResp = EnderecoVendaFields & {
  /** REGRA DE NEGÓCIO (03/08/2026): a mesma resposta de GET /api/vendas/[id]
   *  já traz o cliente da venda (ver route.ts, `v.cliente_id, v.cliente_nome,
   *  v.cliente_cpf_cnpj, v.cliente_telefone`) — reusado aqui pra auto-
   *  preencher o ClienteSelector sem uma 2ª chamada. */
  cliente_id: number | null;
  cliente_nome: string | null;
  cliente_cpf_cnpj: string | null;
  cliente_telefone: string | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCriado: () => void;
  /**
   * REGRA DE NEGÓCIO (intenção explícita — ponto de entrada decide, não o
   * cargo): decide se o modal é de SOLICITAÇÃO (nasce 'solicitada', cai no
   * pool de liberadores) ou CRIAÇÃO DIRETA (nasce 'pendente', como sempre
   * foi) — comandado pelo CALLER (de onde o modal foi aberto), não pelo
   * cargo de quem está logado. `false`/omitido = criação direta.
   * IMPACTO SE REMOVIDO: volta a inferir por cargo — mesmo botão, 2
   * comportamentos diferentes conforme quem clica.
   */
  modoSolicitacao?: boolean;
  /**
   * REGRA DE NEGÓCIO (V3): quando informado, o modal já nasce vinculado a
   * esta venda (aberto de dentro da tela da venda) — esconde o buscador de
   * venda e usa este id direto no submit. Só faz sentido combinado com
   * modoSolicitacao=true.
   */
  vendaId?: number;
  /** Endereço de entrega estruturado (migration 355 — campo a campo, não
   *  mais concatenado) para pré-preencher o EnderecoForm quando `vendaId` é
   *  informado. Ignorado sem vendaId. Montar com enderecoDaVenda(). */
  enderecoInicial?: EnderecoValue;
  /**
   * REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07): mostra o formulário
   * COMPLETO (2 colunas — venda opcional, endereço estruturado, quem paga +
   * comprovante, valor cobrado, região, observação) mesmo em criação DIRETA
   * (`modoSolicitacao` omitido/false). Usado pelo botão "Frete Avulso" da
   * tela de Entregas — decisão do Jonathan: mesmo formulário da solicitação,
   * mas continua nascendo 'pendente' (sem tarefa). Ignorado quando
   * `modoSolicitacao=true` (a solicitação já sempre mostra o completo).
   * IMPACTO SE REMOVIDO: o botão volta a abrir o formulário enxuto antigo
   * (sem endereço/pagante/comprovante).
   */
  formularioCompleto?: boolean;
  /**
   * REGRA DE NEGÓCIO (03/08/2026 — "obrigatório o nome do cliente"): id do
   * contato da venda (public.contatos.id_contato), só quando `vendaId`
   * também é informado (vendaFixada) — o cliente da corrida já é o mesmo da
   * venda, sem precisar buscar de novo. Ignorado sem vendaId.
   */
  contatoIdInicial?: number;
}

const REGIOES = [
  { value: "fortaleza", label: "Fortaleza", frete: 20 },
  { value: "fora_fortaleza", label: "Fora de Fortaleza", frete: 50 },
  { value: "longe", label: "Longe (negociar)", frete: 0 },
  { value: "correios", label: "Correios", frete: 0 },
] as const;

type Regiao = "fortaleza" | "fora_fortaleza" | "longe" | "correios";

export default function FreteAvulsoModal({ isOpen, onClose, onCriado, modoSolicitacao = false, vendaId, enderecoInicial, formularioCompleto = false, contatoIdInicial }: Props) {
  // REGRA DE NEGÓCIO (intenção explícita — ponto de entrada decide, não o
  // cargo): no modo solicitação, quem abriu o modal só SOLICITA — não cria o
  // avulso já liberado e não escolhe motoboy/responsável. Vem da prop, não
  // mais de userRole === "consultora" (ver comentário no topo do arquivo).
  // Controla o MODO DE ENVIO (solicitar:true vs criação direta) e os textos
  // do modal — NÃO controla mais sozinho o layout (ver mostrarFormularioCompleto).
  const ehSolicitacao = modoSolicitacao;
  // REGRA DE NEGÓCIO (reforma da tela Entregas, 21/07): controla o LAYOUT
  // (quais campos aparecem) — true na solicitação real E no novo modo
  // direto-com-formulário-completo (botão "Frete Avulso" de Entregas). Ver
  // comentário completo no topo do arquivo.
  const mostrarFormularioCompleto = ehSolicitacao || formularioCompleto;
  // REGRA DE NEGÓCIO (V3): quando aberto de dentro da venda, a venda já é
  // conhecida — não precisa buscar. IMPACTO SE REMOVIDO: reaparece o
  // buscador de venda mesmo quando o caller já sabe qual é.
  const vendaFixada = mostrarFormularioCompleto && vendaId != null;

  const [regiao, setRegiao] = useState<Regiao>("fortaleza");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const [vendaSelecionada, setVendaSelecionada] = useState<VendaBusca | null>(null);
  // REGRA DE NEGÓCIO (04/08/2026): vendas do cliente selecionado, buscadas
  // sozinho (sem digitar nada) assim que o cliente é escolhido — substitui o
  // buscador de venda por número. Ver comentário no topo do arquivo.
  const [vendasDoCliente, setVendasDoCliente] = useState<VendaBusca[]>([]);
  const [carregandoVendasDoCliente, setCarregandoVendasDoCliente] = useState(false);
  // true depois de clicar "Nenhuma dessas" — some a caixa de sugestão até o
  // cliente mudar de novo (link discreto reabre, ver JSX).
  const [sugestaoDispensada, setSugestaoDispensada] = useState(false);
  // REGRA DE NEGÓCIO (migration 355 — endereço estruturado): valor
  // controlado, mas agora só existe DENTRO do ConfirmarEnderecoModal — o
  // formulário principal não mostra mais o EnderecoForm.
  const [enderecoEntrega, setEnderecoEntrega] = useState<EnderecoValue>(ENDERECO_VAZIO);
  const [carregandoEndereco, setCarregandoEndereco] = useState(false);
  // REGRA DE NEGÓCIO (04/08/2026): abre só ao clicar "Solicitar frete
  // avulso", depois de validar os campos do formulário principal — ver
  // handleAbrirConfirmacaoEndereco.
  const [mostrarPopupEndereco, setMostrarPopupEndereco] = useState(false);
  const [freteCobradoConsultora, setFreteCobradoConsultora] = useState("");

  // REGRA DE NEGÓCIO (03/08/2026 — "obrigatório o nome do cliente"): só
  // usado quando !vendaFixada (Tarefas e Entregas-direto) — com vendaFixada,
  // o cliente vem direto de `contatoIdInicial` (prop), sem seletor visível.
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteComEndereco | null>(null);
  // Id efetivo enviado ao backend nos dois casos — unifica a checagem de
  // obrigatoriedade abaixo (disabledFormularioCompleto) e o submit.
  // REGRA DE NEGÓCIO (03/08/2026): prioriza contatoIdInicial (vendaFixada
  // normal); cai para o ClienteSelector quando ele não vier — cobre o caso
  // raro de venda fixada SEM cliente cadastrado (cliente_id nulo), onde
  // esconder o seletor deixaria o formulário travado sem saída.
  const contatoIdEfetivo = contatoIdInicial ?? clienteSelecionado?.id_contato;
  const mostrarSeletorCliente = !contatoIdInicial;

  // REGRA DE NEGÓCIO (migration 359 — "quem paga"): só existe no modo
  // solicitação. `comprovanteBase64` só é exigido quando pagante='cliente'.
  const [pagante, setPagante] = useState<"loja" | "cliente" | "">("");
  const [comprovanteBase64, setComprovanteBase64] = useState("");
  const comprovanteInputRef = useRef<HTMLInputElement>(null);

  const [freteNegociado, setFreteNegociado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const freteCalculado = REGIOES.find(r => r.value === regiao)?.frete ?? 0;

  // ── Vendas do cliente selecionado (04/08/2026) ────────────────────────────
  // REGRA DE NEGÓCIO: assim que o cliente é escolhido no ClienteSelector,
  // busca sozinho as vendas dele — substitui o buscador de venda por número.
  // Reusa GET /api/vendas (mesma listagem paginada da tela de vendas) com o
  // novo filtro cliente_id. Sem filtro de situação (pedido do Jonathan) — a
  // janela de quais vendas PODEM ser vinculadas é só visual (ver
  // JANELA_FRETE_AVULSO_COM_VENDA), não filtra a lista.
  useEffect(() => {
    if (!mostrarSeletorCliente) return;
    setVendaSelecionada(null);
    setSugestaoDispensada(false);
    if (!clienteSelecionado) { setVendasDoCliente([]); return; }
    let cancelado = false;
    setCarregandoVendasDoCliente(true);
    (async () => {
      try {
        const hoje = new Date();
        const inicio = new Date(hoje);
        inicio.setFullYear(inicio.getFullYear() - 3);
        const fmt = (d: Date) => d.toISOString().slice(0, 10);
        const params = new URLSearchParams({
          cliente_id: String(clienteSelecionado.id_contato),
          inicio: fmt(inicio),
          fim: fmt(hoje),
          page_size: "20",
        });
        const data = await apiFetch<{ items: VendaBusca[] }>(`/api/vendas?${params.toString()}`);
        if (!cancelado) setVendasDoCliente(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (!cancelado) setVendasDoCliente([]);
      } finally {
        if (!cancelado) setCarregandoVendasDoCliente(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteSelecionado?.id_contato, mostrarSeletorCliente]);

  // REGRA DE NEGÓCIO (V3): venda fixada (aberto de dentro da tela da venda) —
  // pré-preenche o endereço editável com o que o caller já calculou (cadastro
  // de entrega da venda), sem precisar de uma 2ª chamada a /api/vendas/[id].
  // Roda a cada abertura do modal (resetar() limpa ao fechar).
  useEffect(() => {
    if (isOpen && vendaFixada) {
      setEnderecoEntrega(enderecoInicial ?? ENDERECO_VAZIO);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, vendaFixada, enderecoInicial]);

  /** Seleciona uma venda da sugestão (04/08/2026 — vendasDoCliente) e busca o
   *  endereço DELA pra sugerir no popup de confirmação (enderecoDaVenda,
   *  campo a campo, não concatenado). Só chamada pra vendas dentro da janela
   *  permitida (ver JANELA_FRETE_AVULSO_COM_VENDA) — as demais aparecem
   *  desabilitadas na lista e não chegam aqui. */
  async function selecionarVenda(v: VendaBusca) {
    setVendaSelecionada(v);
    setCarregandoEndereco(true);
    try {
      const detalhe = await apiFetch<VendaEnderecoResp>(`/api/vendas/${v.id}`);
      setEnderecoEntrega(enderecoDaVenda(detalhe));
    } catch {
      useErrorStore.getState().push("Erro ao carregar endereço da venda", { level: "warning" });
    } finally {
      setCarregandoEndereco(false);
    }
  }

  /** Lê o comprovante de pagamento como base64 (mesmo padrão de ConfirmarEntregaModal). */
  function handleComprovanteSelecionado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setComprovanteBase64(reader.result as string);
    reader.readAsDataURL(file);
  }

  function resetar() {
    setRegiao("fortaleza");
    setDescricao("");
    setObservacoes("");
    setFreteNegociado("");
    setVendaSelecionada(null);
    setVendasDoCliente([]);
    setSugestaoDispensada(false);
    setEnderecoEntrega(ENDERECO_VAZIO);
    setMostrarPopupEndereco(false);
    setClienteSelecionado(null);
    setFreteCobradoConsultora("");
    setPagante("");
    setComprovanteBase64("");
    setErro("");
    setSucesso(false);
  }

  function handleClose() {
    resetar();
    onClose();
  }

  /**
   * REGRA DE NEGÓCIO (04/08/2026): submit do formulário principal NÃO chama
   * mais a API direto — valida os campos que ficaram no corpo do modal
   * (descrição/pagante/comprovante/cliente/valor) e abre o popup de
   * confirmação de endereço. O envio de verdade acontece em
   * enviarSolicitacao(), chamado pelo popup depois que o endereço é
   * confirmado ou digitado. Com vendaFixada (endereço já vem pronto da
   * prop), pula direto pro envio — não há nada pra sugerir/confirmar aqui
   * dentro do modal.
   */
  function handleAbrirConfirmacaoEndereco(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    try {
      if (precisaValorCobradoDoCliente(pagante) && freteCobradoConsultora === "") {
        throw new Error("Informe o valor cobrado do cliente.");
      }
      if (!pagante) {
        throw new Error("Selecione quem paga o frete avulso.");
      }
      if (pagante === "cliente" && !comprovanteBase64) {
        throw new Error("Anexe o comprovante de pagamento do cliente.");
      }
      if (!contatoIdEfetivo) {
        throw new Error("Selecione o cliente da corrida.");
      }
      if (vendaFixada) {
        void enviarSolicitacao(enderecoEntrega);
      } else {
        setMostrarPopupEndereco(true);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao validar a solicitação");
    }
  }

  /** Endereço sugerido pro popup — venda selecionada tem prioridade sobre o
   *  cadastro do cliente (é mais específico pra esta corrida). null quando
   *  nenhum dos dois tem endereço completo — popup abre pra digitar. */
  const enderecoSugerido = vendaSelecionada && enderecoCompleto(enderecoEntrega)
    ? enderecoEntrega
    : clienteSelecionado && enderecoCompleto(enderecoDoCadastro(clienteSelecionado))
      ? enderecoDoCadastro(clienteSelecionado)
      : null;
  const fonteSugestao: "venda" | "cadastro" | null = vendaSelecionada && enderecoCompleto(enderecoEntrega)
    ? "venda"
    : enderecoSugerido ? "cadastro" : null;

  /** Envio de verdade — chamado direto (vendaFixada) ou pelo
   *  ConfirmarEnderecoModal depois que o endereço é confirmado/digitado. */
  async function enviarSolicitacao(endereco: EnderecoValue) {
    setErro("");
    setEnviando(true);
    try {
      const freteNegociadoNum = freteNegociado ? parseFloat(freteNegociado.replace(",", ".")) : undefined;
      const vendaIdEfetivo = vendaId ?? vendaSelecionada?.id;

      await apiFetch("/api/entregas-venda/frete-avulso", {
        method: "POST",
        body: JSON.stringify({
          // REGRA DE NEGÓCIO (03/08/2026): Number() por segurança — id_contato
          // é bigint no Postgres e pode chegar como string (ver ClienteSelector);
          // o backend também coage (z.coerce), defesa em profundidade.
          contatoId: Number(contatoIdEfetivo),
          solicitar: ehSolicitacao ? true : undefined,
          vendaId: vendaIdEfetivo,
          enderecoEntregaLogradouro: endereco.logradouro.trim(),
          enderecoEntregaNumero: endereco.numero.trim(),
          enderecoEntregaComplemento: endereco.complemento.trim() || undefined,
          enderecoEntregaBairro: endereco.bairro.trim() || undefined,
          enderecoEntregaCidade: endereco.cidade.trim(),
          enderecoEntregaCep: endereco.cep.trim() || undefined,
          enderecoEntregaUf: endereco.uf.trim() || undefined,
          freteCobrado: parseFloat(freteCobradoConsultora.replace(",", ".")) || 0,
          regiao,
          freteMotoboyOverride: freteNegociadoNum && freteNegociadoNum > 0 ? freteNegociadoNum : undefined,
          descricaoAvulso: descricao.trim(),
          observacoes: observacoes.trim() || undefined,
          pagante,
          comprovanteBase64: pagante === "cliente" ? comprovanteBase64 : undefined,
        }),
      });
      setMostrarPopupEndereco(false);
      setSucesso(true);
      setTimeout(() => {
        resetar();
        onCriado();
        onClose();
      }, 1500);
    } catch (err) {
      setMostrarPopupEndereco(false);
      setErro(err instanceof Error ? err.message : "Erro ao criar frete avulso");
    } finally {
      setEnviando(false);
    }
  }

  if (!isOpen) return null;

  // Validação de submit — cada LAYOUT tem seus próprios campos obrigatórios
  // (formulário completo vs enxuto — não depende de ehSolicitacao/modo de
  // envio, só de quais campos estão na tela).
  // REGRA DE NEGÓCIO (fix 21/07 — venda deixa de ser obrigatória; 04/08/2026
  // — endereço saiu do formulário principal, validado no popup): campos
  // obrigatórios AQUI são só os que continuam visíveis no corpo do modal.
  // Endereço não trava mais este botão — trava o "Confirmar"/"Sim,
  // confirmar" do ConfirmarEnderecoModal (ver enderecoCompleto lá).
  const disabledFormularioCompleto =
    enviando || carregandoEndereco ||
    (precisaValorCobradoDoCliente(pagante) && freteCobradoConsultora === "") || !descricao.trim() ||
    !pagante || (pagante === "cliente" && !comprovanteBase64) ||
    !contatoIdEfetivo;
  // LIMPEZA (código morto, 21/07): existia um `disabledPadrao` (formulário
  // ENXUTO, exigia motoboyId) e um ternário `mostrarFormularioCompleto ?
  // disabledFormularioCompleto : disabledPadrao`. Removido junto com o
  // formulário enxuto — não há mais um 2º layout para alternar.
  const disabledSubmit = disabledFormularioCompleto;

  /**
   * REGRA DE LAYOUT (responsividade, 21/07 — layout aprovado pelo Jonathan):
   * Descrição/Região/Observações aparecem nos 2 modos, mas em posições
   * diferentes (coluna A/B na solicitação vs. sequência única no direto).
   * Viram JSX reaproveitável aqui para não duplicar o markup entre os dois
   * layouts abaixo. NENHUMA regra/validação muda — só a ORGANIZAÇÃO visual.
   *
   * REGRA DE LAYOUT (ajuste 21/07 — eliminar rolagem no modo solicitação):
   * no modo solicitação, Observações fica na Coluna B (junto de pagamento/
   * região), NÃO na Coluna A (descrição/venda/endereço) — o endereço
   * estruturado (EnderecoForm) deixou a Coluna A bem mais alta, e colocar
   * Observações nela só pioraria o desequilíbrio. No modo direto,
   * Observações continua no mesmo lugar de sempre (sequência única, sem
   * colunas) — este bloco reaproveitável não muda para esse modo.
   */
  const campoDescricao = (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
        <AlignLeft size={13} /> Descrição da corrida *
      </label>
      <input
        type="text"
        required
        placeholder="Ex: Buscar colar na casa da cliente, Levar material à loja..."
        value={descricao}
        onChange={e => setDescricao(e.target.value)}
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 8,
          border: `1px solid ${C.cremeBorder}`, fontSize: 13,
          boxSizing: "border-box",
        }}
      />
    </div>
  );

  const campoObservacoes = (
    <div style={{ marginBottom: 0 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
        <AlignLeft size={13} /> Observações (opcional)
      </label>
      <textarea
        rows={2}
        value={observacoes}
        onChange={e => setObservacoes(e.target.value)}
        placeholder="Informações adicionais..."
        style={{
          width: "100%", padding: "9px 12px", borderRadius: 8,
          border: `1px solid ${C.cremeBorder}`, fontSize: 13,
          resize: "vertical", boxSizing: "border-box",
        }}
      />
    </div>
  );

  const campoRegiao = (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
        <MapPin size={13} /> Região *
      </label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {REGIOES.map(r => (
          <button
            type="button"
            key={r.value}
            // REGRA DE NEGÓCIO (cosmético, 21/07): limpa o valor negociado com
            // o motoboy ao trocar de região. O QUÊ: freteNegociado só é
            // usado pelo backend quando a região tem frete=0 (longe/correios
            // — ver calcularValorMotoboy/criarFreteAvulso); em região com
            // valor fixo (Fortaleza/Fora de Fortaleza) o override é
            // descartado SILENCIOSAMENTE no servidor. O PORQUÊ: sem limpar,
            // quem digitava um valor em "Longe" e trocava pra "Fortaleza"
            // continuava com o campo preenchido (mesmo escondido) e achava
            // que aquele valor tinha sido enviado. IMPACTO SE REMOVIDO:
            // volta a confusão — valor "fantasma" que nunca chega a valer.
            onClick={() => { setRegiao(r.value); setFreteNegociado(""); }}
            style={{
              padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              border: `1px solid ${regiao === r.value ? C.esmeralda : C.cremeBorder}`,
              background: regiao === r.value ? C.esmeralda : "#fff",
              color: regiao === r.value ? "#fff" : C.cinza,
              cursor: "pointer",
            }}
          >
            {r.label} {r.frete > 0 ? `(R$${r.frete})` : ""}
          </button>
        ))}
      </div>
      {freteCalculado > 0 && (
        <p style={{ fontSize: 11, color: C.cinza, marginTop: 6 }}>
          Motoboy recebe: R${freteCalculado.toFixed(2)} — descontado do saldo de frete grátis
        </p>
      )}
      {freteCalculado === 0 && (
        <div style={{ marginTop: 8 }}>
          {/* REGRA DE NEGÓCIO: o "*" só faz sentido no formulário ENXUTO —
              é o único layout que BLOQUEIA o submit sem este valor
              (disabledPadrao). No formulário COMPLETO (solicitação ou
              direto-completo, disabledFormularioCompleto) o campo é
              opcional — por isso o indicador segue mostrarFormularioCompleto,
              não ehSolicitacao (que só decide o texto/modo de envio). */}
          <label style={{ fontSize: 11, fontWeight: 600, color: C.cinza, display: "block", marginBottom: 4 }}>
            Valor negociado com o motoboy (R$) {mostrarFormularioCompleto ? "" : "*"}
          </label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Ex: 35,00"
            value={freteNegociado}
            onChange={e => setFreteNegociado(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 8,
              border: `1px solid ${C.cremeBorder}`, fontSize: 13,
              boxSizing: "border-box",
            }}
          />
          {freteNegociado && parseFloat(freteNegociado.replace(",", ".")) > 0 && (
            <p style={{ fontSize: 11, color: C.cinza, marginTop: 4 }}>
              Motoboy recebe: R${parseFloat(freteNegociado.replace(",", ".")).toFixed(2)} — descontado do saldo de frete grátis
            </p>
          )}
        </div>
      )}
    </div>
  );

  /** Título discreto de seção — mesmo padrão visual dos labels do arquivo (cinza/uppercase), só em esmeralda para marcar a divisão de coluna. */
  const tituloSecao: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.esmeralda, letterSpacing: 0.6,
    textTransform: "uppercase", marginBottom: 10,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16,
        width: "100%",
        // REGRA DE LAYOUT (responsividade, 21/07 — layout aprovado pelo
        // Jonathan): formulário COMPLETO (solicitação OU direto-completo)
        // tem mais campos (venda, endereço, pagamento, comprovante, região)
        // — modal mais largo (~820px) libera as 2 colunas abaixo. Formulário
        // ENXUTO (motoboy, região, cliente) fica com coluna quase vazia em 2
        // colunas — mantido em 480px/1 coluna.
        // IMPACTO SE IGUALAR: modo enxuto ganha espaço vazio sem uso.
        maxWidth: mostrarFormularioCompleto ? 820 : 480,
        maxHeight: "90vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        overflow: "hidden",
      }}>
        {/* Header — fixo, fora da área de rolagem */}
        <div style={{
          background: C.esmeralda, color: "#fff",
          padding: "16px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bike size={20} />
            <span style={{ fontWeight: 700, fontSize: 16 }}>
              {ehSolicitacao ? "Solicitar Frete Avulso" : "Frete Avulso"}
            </span>
          </div>
          <button onClick={handleClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {/* Sucesso */}
        {sucesso ? (
          <div style={{ padding: 40, textAlign: "center", overflowY: "auto" }}>
            <CheckCircle size={48} color={C.verde} style={{ marginBottom: 12 }} />
            <p style={{ fontWeight: 700, color: C.esmeralda, fontSize: 16 }}>
              {ehSolicitacao ? "Solicitação enviada — aguardando liberação" : "Corrida registrada!"}
            </p>
            {!ehSolicitacao && (
              <p style={{ color: C.cinza, fontSize: 13 }}>O motoboy verá no app e confirmará ao concluir.</p>
            )}
          </div>
        ) : (
          // REGRA DE LAYOUT (responsividade, 21/07): formulário em 3 faixas —
          // corpo com overflowY:auto rola sozinho; rodapé (Cancelar/Solicitar)
          // fica FIXO (flexShrink:0), fora da rolagem. ANTES o formulário
          // inteiro rolava junto e, no modo solicitação (mais campos), o
          // botão de ação ficava fora da área visível (print do Jonathan).
          // IMPACTO SE REMOVIDO: botão some de novo em telas menores/baixas.
          <form onSubmit={handleAbrirConfirmacaoEndereco} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

            {/* Corpo — rola independente do rodapé */}
            <div style={{ padding: "20px", overflowY: "auto", flex: 1, minHeight: 0 }}>

              {/* Erro */}
              {erro && (
                <div style={{
                  padding: "10px 14px", borderRadius: 8,
                  background: C.vermelhoLt, color: C.vermelho,
                  fontSize: 13, marginBottom: 16,
                }}>
                  {erro}
                </div>
              )}

              {/* LIMPEZA (código morto, 21/07): existia um ternário
                  `mostrarFormularioCompleto ? (completo) : (enxuto)` — o
                  formulário ENXUTO (motoboy selecionado na hora + busca de
                  cliente avulso, sem endereço/pagante/comprovante) foi
                  removido por não ter mais chamador (ver comentário no topo
                  do arquivo). Só o formulário COMPLETO permanece; a var
                  `mostrarFormularioCompleto` continua existindo (documenta a
                  regra ehSolicitacao||formularioCompleto) mas hoje é sempre
                  true nos 3 pontos de entrada reais. */}
              {(
                // REGRA DE LAYOUT (responsividade, 21/07 — layout aprovado
                // pelo Jonathan; reforma da tela Entregas — mesmo layout para
                // solicitação E direto-com-formulário-completo): 2 colunas no
                // desktop, 1 coluna no celular,
                // via auto-fit/minmax — SEM media query manual. Uso
                // minmax(min(300px,100%), 1fr) em vez de minmax(300px, 1fr)
                // puro: com só 1 coluna (celular estreito, ~360px) o grid
                // ainda reservava 300px fixos e estourava a largura do modal;
                // o min(...,100%) trava a coluna no espaço realmente
                // disponível. Coluna A = dados da corrida; Coluna B = pagamento.
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))",
                  gap: 18,
                }}>
                  {/* Coluna A — A corrida */}
                  <div>
                    <div style={tituloSecao}>A CORRIDA</div>
                    {campoDescricao}

                    {/* Cliente da corrida — REGRA DE NEGÓCIO (03/08/2026):
                        obrigatório, exceto quando a venda já vem fixada
                        (vendaFixada = cliente inequívoco, vem da prop
                        contatoIdInicial, sem seletor visível). */}
                    {mostrarSeletorCliente && (
                    <div style={{ marginBottom: 14 }}>
                      <ClienteSelector
                        value={clienteSelecionado}
                        onChange={setClienteSelecionado}
                        label="Cliente da corrida *"
                        placeholder="Buscar por nome ou CPF..."
                      />
                    </div>
                    )}

                    {/* Endereço do cliente — REGRA DE NEGÓCIO (04/08/2026,
                        pedido do Jonathan): assim que o cliente é
                        selecionado, mostra o endereço do CADASTRO dele
                        (public.contatos) direto no formulário — só pra
                        visualização rápida, não é a confirmação (que
                        continua acontecendo no popup ao clicar "Solicitar",
                        ver ConfirmarEnderecoModal — nunca pulada). Some
                        quando o cliente não tem endereço no cadastro; some
                        também se uma venda for selecionada (a sugestão real
                        no popup passa a ser a da venda, que tem prioridade —
                        mostrar os dois aqui confundiria qual vale). */}
                    {mostrarSeletorCliente && clienteSelecionado && !vendaSelecionada && enderecoCompleto(enderecoDoCadastro(clienteSelecionado)) && (
                      <div style={{
                        marginBottom: 14, fontSize: 12, color: C.cinza,
                        display: "flex", alignItems: "flex-start", gap: 6,
                      }}>
                        <MapPin size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>
                          Endereço do cliente: {enderecoDoCadastro(clienteSelecionado).logradouro}, nº {enderecoDoCadastro(clienteSelecionado).numero}
                          {enderecoDoCadastro(clienteSelecionado).bairro ? ` — ${enderecoDoCadastro(clienteSelecionado).bairro}` : ""}
                          {enderecoDoCadastro(clienteSelecionado).cidade ? `, ${enderecoDoCadastro(clienteSelecionado).cidade}` : ""}
                          {enderecoDoCadastro(clienteSelecionado).uf ? `/${enderecoDoCadastro(clienteSelecionado).uf}` : ""}
                        </span>
                      </div>
                    )}

                    {/* Sugestão de venda do cliente — REGRA DE NEGÓCIO
                        (04/08/2026): substitui o buscador por número. Ao
                        escolher o cliente acima, busca sozinho as vendas
                        dele; pergunta se a corrida é de alguma. Vendas fora
                        da janela de entrega (ver JANELA_FRETE_AVULSO_COM_VENDA)
                        aparecem desabilitadas com o motivo — não bloqueiam a
                        lista, só o clique (o backend rejeitaria mesmo). */}
                    {mostrarSeletorCliente && clienteSelecionado && carregandoVendasDoCliente && (
                      <div style={{ fontSize: 12, color: C.cinza, display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                        <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                        Buscando vendas de {clienteSelecionado.nome}...
                      </div>
                    )}
                    {mostrarSeletorCliente && clienteSelecionado && !carregandoVendasDoCliente && vendasDoCliente.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        {vendaSelecionada ? (
                          <div style={{
                            padding: "8px 12px", borderRadius: 8,
                            border: `1px solid ${C.esmeralda}`, background: C.esmeraldaLt,
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                          }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.esmeralda }}>
                              Venda {vendaSelecionada.numero_venda}
                            </span>
                            <button
                              type="button"
                              onClick={() => { setVendaSelecionada(null); setEnderecoEntrega(ENDERECO_VAZIO); }}
                              style={{ background: "none", border: "none", cursor: "pointer", color: C.cinza }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : sugestaoDispensada ? (
                          <button
                            type="button"
                            onClick={() => setSugestaoDispensada(false)}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.cinza, textDecoration: "underline", padding: 0 }}
                          >
                            Corrida avulsa (sem venda) — ver vendas de {clienteSelecionado.nome} de novo
                          </button>
                        ) : (
                          <div style={{ padding: 12, borderRadius: 10, background: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 8 }}>
                              Essa corrida é de alguma venda de {clienteSelecionado.nome}?
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                              {vendasDoCliente.map(v => {
                                const habilitada = JANELA_FRETE_AVULSO_COM_VENDA.includes(v.situacao);
                                return (
                                  <button
                                    key={v.id}
                                    type="button"
                                    disabled={!habilitada || carregandoEndereco}
                                    onClick={() => habilitada && selecionarVenda(v)}
                                    title={habilitada ? undefined : `Não pode vincular — venda ${labelSituacaoVenda(v.situacao).toLowerCase()}`}
                                    style={{
                                      display: "flex", alignItems: "center", justifyContent: "space-between",
                                      padding: "8px 10px", borderRadius: 8, textAlign: "left",
                                      border: `1px solid ${habilitada ? C.esmeralda : C.cremeBorder}`,
                                      background: habilitada ? "#fff" : C.cremeBg,
                                      opacity: habilitada ? 1 : 0.65,
                                      cursor: habilitada ? "pointer" : "not-allowed",
                                    }}
                                  >
                                    <span>
                                      <div style={{ fontSize: 13, fontWeight: 600, color: habilitada ? "#1f2937" : C.cinza }}>
                                        Venda {v.numero_venda} — {new Date(v.data_venda).toLocaleDateString("pt-BR")}
                                      </div>
                                      {!habilitada && (
                                        <div style={{ fontSize: 11, color: C.cinza }}>
                                          Não pode vincular — venda {labelSituacaoVenda(v.situacao).toLowerCase()}
                                        </div>
                                      )}
                                    </span>
                                    <span style={{
                                      fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 12,
                                      background: habilitada ? C.verdeLt : C.cremeBorder, color: habilitada ? "#065F46" : C.cinza,
                                    }}>
                                      {labelSituacaoVenda(v.situacao)}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                            <div style={{ textAlign: "center" }}>
                              <button
                                type="button"
                                onClick={() => setSugestaoDispensada(true)}
                                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.esmeralda, textDecoration: "underline", padding: 0 }}
                              >
                                Nenhuma dessas — corrida avulsa
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Coluna B — Pagamento */}
                  <div>
                    <div style={tituloSecao}>PAGAMENTO</div>

                    {/* Quem paga (migration 359) + Comprovante — bloco destacado:
                        ANTES o comprovante nascia solto mais abaixo na lista de
                        campos, longe do campo que o obriga (pagante==='cliente'). */}
                    <div style={{ padding: 12, borderRadius: 10, background: C.cremeBg, border: `1px solid ${C.cremeBorder}` }}>
                      <div style={{ marginBottom: pagante === "cliente" ? 14 : 0 }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                          <Store size={13} /> Quem paga *
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {(["loja", "cliente"] as const).map(op => (
                            <button
                              type="button"
                              key={op}
                              // REGRA DE NEGÓCIO (ajuste 21/07): trocar para "Loja" limpa
                              // freteCobradoConsultora junto com o comprovante — mesmo cuidado
                              // já aplicado ao freteNegociado ao trocar de região (campo
                              // "fantasma" que fica preenchido mas nunca é enviado/some da
                              // tela). IMPACTO SE REMOVIDO: valor digitado com "Cliente"
                              // reaparece se a pessoa voltar para "Cliente" depois de já ter
                              // trocado para "Loja" e o campo ter sido reexibido.
                              onClick={() => {
                                setPagante(op);
                                if (op === "loja") { setComprovanteBase64(""); setFreteCobradoConsultora(""); }
                              }}
                              style={{
                                flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                                border: `1px solid ${pagante === op ? C.esmeralda : C.cremeBorder}`,
                                background: pagante === op ? C.esmeralda : "#fff",
                                color: pagante === op ? "#fff" : C.cinza,
                                cursor: "pointer",
                              }}
                            >
                              {op === "loja" ? "Loja" : "Cliente"}
                            </button>
                          ))}
                        </div>
                        <p style={{ fontSize: 11, color: C.cinza, marginTop: 6 }}>
                          {pagante === "cliente"
                            ? "Cliente pagou — anexe o comprovante abaixo. A tarefa vai para quem acompanha as entregas avulsas."
                            : pagante === "loja"
                              ? "Custo da loja — sem comprovante. A tarefa vai para quem autoriza esse custo."
                              : "Define o comprovante e quem decide a solicitação."}
                        </p>
                      </div>

                      {/* Comprovante de pagamento — obrigatório só quando o cliente paga */}
                      {pagante === "cliente" && (
                        <div>
                          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                            <Camera size={13} /> Comprovante de pagamento *
                          </label>
                          <input
                            ref={comprovanteInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handleComprovanteSelecionado}
                            style={{ display: "none" }}
                          />
                          <button
                            type="button"
                            onClick={() => comprovanteInputRef.current?.click()}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 6,
                              padding: "8px 12px", borderRadius: 8,
                              border: `1px solid ${C.cremeBorder}`,
                              background: comprovanteBase64 ? C.verdeLt : "#fff",
                              color: comprovanteBase64 ? C.verde : C.cinza,
                              fontSize: 12, fontWeight: 600, cursor: "pointer",
                            }}
                          >
                            <Camera size={14} />
                            {comprovanteBase64 ? "Comprovante anexado" : "Anexar comprovante"}
                          </button>
                          {comprovanteBase64 && (
                            <div style={{ marginTop: 8 }}>
                              <img
                                src={comprovanteBase64}
                                alt="Comprovante de pagamento"
                                style={{
                                  width: "100%", maxWidth: 200, borderRadius: 8,
                                  border: `1px solid ${C.cremeBorder}`,
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Valor cobrado do cliente — REGRA DE NEGÓCIO (ajuste 21/07,
                        pedido do Jonathan: "se for loja não precisa colocar o valor
                        cobrado do cliente"): só existe quando pagante === 'cliente'.
                        Com pagante === 'loja' o campo some (a loja assume o custo
                        integral, freteCobrado enviado = 0 — ver handleSubmit).
                        IMPACTO SE MOSTRADO SEMPRE: campo sem sentido pra loja
                        (não há "cobrança do cliente" quando é a loja quem paga). */}
                    {precisaValorCobradoDoCliente(pagante) && (
                    <div style={{ marginTop: 14, marginBottom: 14 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                        <DollarSign size={13} /> Valor cobrado do cliente (R$) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Ex: 20,00"
                        value={freteCobradoConsultora}
                        onChange={e => setFreteCobradoConsultora(e.target.value)}
                        style={{
                          width: "100%", padding: "9px 12px", borderRadius: 8,
                          border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    )}

                    {campoRegiao}

                    {/* Observações — movida da Coluna A para cá (21/07, ajuste
                        de layout pedido pelo Jonathan): o endereço estruturado
                        (EnderecoForm, migration 355) deixou a Coluna A bem mais
                        alta que a Coluna B, e o formulário passou a rolar no
                        modo solicitação. Mover Observações para a Coluna B
                        rebalanceia as duas colunas sem remover/alterar nenhum
                        campo. IMPACTO SE VOLTAR PARA A COLUNA A: o desequilíbrio
                        de altura volta e a rolagem reaparece no desktop. */}
                    {campoObservacoes}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé — fixo, fora da rolagem. Cancelar chama o mesmo
                handleClose do X do cabeçalho (reset + fechar), sem lógica
                nova; é o ponto que mais incomodou no print do Jonathan
                (botão de ação fora da área visível). */}
            <div style={{
              padding: "16px 20px",
              borderTop: `1px solid ${C.cremeBorder}`,
              display: "flex", gap: 10,
              flexShrink: 0,
            }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  padding: "12px 20px",
                  background: "#fff", color: C.cinza,
                  border: `1px solid ${C.cremeBorder}`, borderRadius: 10,
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={disabledSubmit}
                style={{
                  flex: 1, padding: "12px 0",
                  background: C.esmeralda, color: "#fff",
                  border: "none", borderRadius: 10,
                  fontSize: 14, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  opacity: disabledSubmit ? 0.6 : 1,
                }}
              >
                {enviando ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <Bike size={16} />}
                {enviando
                  ? (ehSolicitacao ? "Enviando..." : "Registrando...")
                  : (ehSolicitacao ? "Solicitar frete avulso" : "Registrar Corrida")}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* REGRA DE NEGÓCIO (04/08/2026): só existe fora de vendaFixada — com
          venda fixada o endereço já vem pronto da prop e o submit vai direto
          (ver handleAbrirConfirmacaoEndereco). */}
      {!vendaFixada && (
        <ConfirmarEnderecoModal
          isOpen={mostrarPopupEndereco}
          enderecoSugerido={enderecoSugerido}
          fonte={fonteSugestao}
          numeroVenda={vendaSelecionada?.numero_venda}
          onConfirmar={(endereco) => void enviarSolicitacao(endereco)}
          onCancelar={() => setMostrarPopupEndereco(false)}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
