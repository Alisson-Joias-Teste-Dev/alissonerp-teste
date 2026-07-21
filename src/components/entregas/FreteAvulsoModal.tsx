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
 * REGRA DE NEGÓCIO (migration 354, 21/07 — "quem paga", só no modo
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
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, CheckCircle, Bike, MapPin, AlignLeft, User, Search, DollarSign, Store, Camera } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";
import { useErrorStore } from "@/stores/errorStore";
import EnderecoForm, { type EnderecoValue, ENDERECO_VAZIO, enderecoDaVenda, type EnderecoVendaFields } from "@/components/endereco/EnderecoForm";
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

interface Motoboy {
  id: number;
  user_id: string | null;
  nome: string;
  telefone: string | null;
  veiculo: string | null;
}

interface Contato {
  id_contato: number;
  nome: string;
}

/** Resultado da busca de venda (consultora) — subconjunto de /api/vendas?q= */
interface VendaBusca {
  id: number;
  numero_venda: string;
  cliente_nome: string | null;
  total_venda: number;
}

/** Campos de endereço de entrega retornados por GET /api/vendas/[id] —
 *  mesmo formato aceito por enderecoDaVenda() (EnderecoForm.tsx). */
type VendaEnderecoResp = EnderecoVendaFields;

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
}

const REGIOES = [
  { value: "fortaleza", label: "Fortaleza", frete: 20 },
  { value: "fora_fortaleza", label: "Fora de Fortaleza", frete: 50 },
  { value: "longe", label: "Longe (negociar)", frete: 0 },
  { value: "correios", label: "Correios", frete: 0 },
] as const;

type Regiao = "fortaleza" | "fora_fortaleza" | "longe" | "correios";

export default function FreteAvulsoModal({ isOpen, onClose, onCriado, modoSolicitacao = false, vendaId, enderecoInicial, formularioCompleto = false }: Props) {
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

  const [motoboys, setMotoboys] = useState<Motoboy[]>([]);
  const [motoboyId, setMotoboyId] = useState("");
  const [regiao, setRegiao] = useState<Regiao>("fortaleza");
  const [descricao, setDescricao] = useState("");
  const [observacoes, setObservacoes] = useState("");

  // Busca de contato (opcional) — só usada fora do modo consultora
  const [buscaContato, setBuscaContato] = useState("");
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [contatoSelecionado, setContatoSelecionado] = useState<Contato | null>(null);
  const [buscandoContato, setBuscandoContato] = useState(false);

  // Busca de venda + endereço editável (só modo consultora)
  const [vendaBusca, setVendaBusca] = useState("");
  const [vendasResultado, setVendasResultado] = useState<VendaBusca[]>([]);
  const [buscandoVenda, setBuscandoVenda] = useState(false);
  const [vendaSelecionada, setVendaSelecionada] = useState<VendaBusca | null>(null);
  // REGRA DE NEGÓCIO (migration 355 — endereço estruturado): antes era um
  // texto único (textarea); agora é o valor controlado do EnderecoForm.
  const [enderecoEntrega, setEnderecoEntrega] = useState<EnderecoValue>(ENDERECO_VAZIO);
  const [carregandoEndereco, setCarregandoEndereco] = useState(false);
  const [freteCobradoConsultora, setFreteCobradoConsultora] = useState("");

  // REGRA DE NEGÓCIO (migration 354 — "quem paga"): só existe no modo
  // solicitação. `comprovanteBase64` só é exigido quando pagante='cliente'.
  const [pagante, setPagante] = useState<"loja" | "cliente" | "">("");
  const [comprovanteBase64, setComprovanteBase64] = useState("");
  const comprovanteInputRef = useRef<HTMLInputElement>(null);

  const [freteNegociado, setFreteNegociado] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState(false);

  const freteCalculado = REGIOES.find(r => r.value === regiao)?.frete ?? 0;

  // Carregar motoboys ao abrir — só necessário no formulário ENXUTO (loja
  // escolhendo motoboy na hora). O formulário COMPLETO (solicitação OU
  // direto-completo) não escolhe motoboy — a corrida cai no pool.
  useEffect(() => {
    if (!isOpen || mostrarFormularioCompleto) return;
    apiFetch<Motoboy[]>("/api/entregas-venda/motoboys")
      .then(d => setMotoboys(Array.isArray(d) ? d : []))
      // Pitfall §3: sem a lista de motoboys o frete avulso não pode ser criado
      .catch(() => useErrorStore.getState().push("Erro ao carregar lista de motoboys", { level: "warning" }));
  }, [isOpen, mostrarFormularioCompleto]);

  // Busca de contato com debounce — só no formulário ENXUTO.
  const buscarContatos = useCallback(async (q: string) => {
    if (q.length < 2) { setContatos([]); return; }
    setBuscandoContato(true);
    try {
      const data = await apiFetch<Contato[]>(`/api/contatos/busca?q=${encodeURIComponent(q)}&limit=8`);
      setContatos(Array.isArray(data) ? data : []);
    } catch {
      setContatos([]);
    } finally {
      setBuscandoContato(false);
    }
  }, []);

  useEffect(() => {
    if (mostrarFormularioCompleto) return;
    const t = setTimeout(() => buscarContatos(buscaContato), 300);
    return () => clearTimeout(t);
  }, [buscaContato, buscarContatos, mostrarFormularioCompleto]);

  // ── Busca de venda com debounce (consultora) ──────────────────────────────
  // REGRA DE NEGÓCIO: reusa GET /api/vendas?q= (mesma listagem paginada usada
  // na tela de vendas). Esse endpoint exige inicio/fim — usamos uma janela
  // ampla (3 anos) só para viabilizar a busca por texto. O filtro de
  // vendedor_id já embutido nessa rota (não-full-access) garante que a
  // consultora só encontra vendas PRÓPRIAS, sem precisar duplicar a regra de
  // ownership aqui no front.
  const buscarVendas = useCallback(async (q: string) => {
    if (q.length < 2) { setVendasResultado([]); return; }
    setBuscandoVenda(true);
    try {
      const hoje = new Date();
      const inicio = new Date(hoje);
      inicio.setFullYear(inicio.getFullYear() - 3);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const params = new URLSearchParams({
        q,
        inicio: fmt(inicio),
        fim: fmt(hoje),
        page_size: "8",
      });
      const data = await apiFetch<{ items: VendaBusca[] }>(`/api/vendas?${params.toString()}`);
      setVendasResultado(Array.isArray(data.items) ? data.items : []);
    } catch {
      setVendasResultado([]);
    } finally {
      setBuscandoVenda(false);
    }
  }, []);

  useEffect(() => {
    if (!mostrarFormularioCompleto || vendaFixada) return;
    const t = setTimeout(() => buscarVendas(vendaBusca), 300);
    return () => clearTimeout(t);
  }, [vendaBusca, buscarVendas, mostrarFormularioCompleto, vendaFixada]);

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

  /** Seleciona a venda e busca o endereço de entrega para pré-preencher o
   *  EnderecoForm — CAMPO A CAMPO (enderecoDaVenda), não mais concatenado. */
  async function selecionarVenda(v: VendaBusca) {
    setVendaSelecionada(v);
    setVendaBusca("");
    setVendasResultado([]);
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
    setMotoboyId("");
    setRegiao("fortaleza");
    setDescricao("");
    setObservacoes("");
    setFreteNegociado("");
    setBuscaContato("");
    setContatos([]);
    setContatoSelecionado(null);
    setVendaBusca("");
    setVendasResultado([]);
    setVendaSelecionada(null);
    setEnderecoEntrega(ENDERECO_VAZIO);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);

    try {
      const freteNegociadoNum = freteNegociado ? parseFloat(freteNegociado.replace(",", ".")) : undefined;

      if (mostrarFormularioCompleto) {
        // REGRA DE NEGÓCIO (modelo POOL; fix 21/07 — venda deixa de ser
        // obrigatória; reforma da tela Entregas — mesmo corpo serve o modo
        // DIRETO com formulário completo, só muda `solicitar`): body NÃO
        // inclui motoboyId/contatoId/liberacaoResponsavelId — quem preenche
        // informa o endereço confirmado e o valor cobrado do cliente; a
        // venda é OPCIONAL (frete avulso pode não partir de uma venda, ex.:
        // "levar material à loja"). Com venda fixada (V3), o id vem da prop;
        // sem ela, do buscador (pode ficar undefined se nada foi buscado/
        // selecionado).
        const vendaIdEfetivo = vendaId ?? vendaSelecionada?.id;
        // REGRA DE NEGÓCIO (migration 355 — endereço estruturado): mínimo
        // exigido é logradouro + número + cidade (validado aqui E no
        // backend, criarFreteAvulso — defesa em profundidade). `vendaId` NÃO
        // entra mais nesta validação — é o endereço quem diz para onde ir.
        if (
          !enderecoEntrega.logradouro.trim() ||
          !enderecoEntrega.numero.trim() ||
          !enderecoEntrega.cidade.trim()
        ) {
          throw new Error("Preencha o endereço completo (logradouro, número e cidade).");
        }
        // REGRA DE NEGÓCIO (ajuste 21/07 — "loja não pede valor cobrado do
        // cliente"): só exige o campo quando pagante === 'cliente'. Com
        // pagante === 'loja' o campo fica escondido e o valor enviado é 0 (a
        // loja assume o custo) — ver src/lib/frete-avulso-valor-cobrado.ts.
        // IMPACTO SE REMOVIDO: solicitação com loja pagando fica bloqueada
        // pedindo um valor que não faz sentido nesse caso.
        if (precisaValorCobradoDoCliente(pagante) && freteCobradoConsultora === "") {
          throw new Error("Informe o valor cobrado do cliente.");
        }
        // REGRA DE NEGÓCIO (migration 354 — "quem paga"): validado aqui
        // (front) E no backend (defesa em profundidade — ver
        // criarFreteAvulso). Comprovante só é exigido quando pagante='cliente'.
        if (!pagante) {
          throw new Error("Selecione quem paga o frete avulso.");
        }
        if (pagante === "cliente" && !comprovanteBase64) {
          throw new Error("Anexe o comprovante de pagamento do cliente.");
        }
        await apiFetch("/api/entregas-venda/frete-avulso", {
          method: "POST",
          body: JSON.stringify({
            // REGRA DE NEGÓCIO (intenção explícita; reforma da tela Entregas):
            // `solicitar: true` só é enviado quando `ehSolicitacao` (=
            // modoSolicitacao) — é o que faz o backend tratar a chamada como
            // SOLICITAÇÃO (nasce 'solicitada', cria tarefa no pool). O modo
            // direto-com-formulário-completo (mostrarFormularioCompleto=true,
            // ehSolicitacao=false) usa este MESMO corpo mas omite `solicitar`
            // — a rota trata como criação direta ('pendente', sem tarefa),
            // igual ao formulário enxuto de sempre.
            // IMPACTO SE SEMPRE MANDAR true: o modo direto-completo passaria
            // a gerar solicitação/tarefa em vez de criar liberado na hora.
            solicitar: ehSolicitacao ? true : undefined,
            vendaId: vendaIdEfetivo,
            // REGRA DE NEGÓCIO (migration 355): campo a campo, espelhando os
            // nomes aceitos pelo Zod schema de route.ts (enderecoEntregaLogradouro
            // etc.) — antes era um único texto concatenado no client.
            enderecoEntregaLogradouro: enderecoEntrega.logradouro.trim(),
            enderecoEntregaNumero: enderecoEntrega.numero.trim(),
            enderecoEntregaComplemento: enderecoEntrega.complemento.trim() || undefined,
            enderecoEntregaBairro: enderecoEntrega.bairro.trim() || undefined,
            enderecoEntregaCidade: enderecoEntrega.cidade.trim(),
            enderecoEntregaCep: enderecoEntrega.cep.trim() || undefined,
            enderecoEntregaUf: enderecoEntrega.uf.trim() || undefined,
            freteCobrado: parseFloat(freteCobradoConsultora.replace(",", ".")) || 0,
            regiao,
            freteMotoboyOverride: freteNegociadoNum && freteNegociadoNum > 0 ? freteNegociadoNum : undefined,
            descricaoAvulso: descricao.trim(),
            observacoes: observacoes.trim() || undefined,
            pagante,
            comprovanteBase64: pagante === "cliente" ? comprovanteBase64 : undefined,
          }),
        });
      } else {
        await apiFetch("/api/entregas-venda/frete-avulso", {
          method: "POST",
          body: JSON.stringify({
            motoboyId,
            regiao,
            freteCobrado: 0,
            freteMotoboyOverride: freteNegociadoNum && freteNegociadoNum > 0 ? freteNegociadoNum : undefined,
            descricaoAvulso: descricao.trim(),
            contatoId: contatoSelecionado?.id_contato,
            observacoes: observacoes.trim() || undefined,
          }),
        });
      }
      setSucesso(true);
      setTimeout(() => {
        resetar();
        onCriado();
        onClose();
      }, 1500);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar frete avulso");
    } finally {
      setEnviando(false);
    }
  }

  if (!isOpen) return null;

  // Validação de submit — cada LAYOUT tem seus próprios campos obrigatórios
  // (formulário completo vs enxuto — não depende de ehSolicitacao/modo de
  // envio, só de quais campos estão na tela).
  // REGRA DE NEGÓCIO (migration 355 — endereço estruturado; fix 21/07 —
  // venda deixa de ser obrigatória; reforma da tela Entregas — vale para
  // solicitação E para o modo direto-com-formulário-completo): mínimo
  // exigido é logradouro + número + cidade, mesmo padrão validado no
  // handleSubmit e no backend (criarFreteAvulso). Venda NÃO trava mais o
  // botão — é opcional.
  const disabledFormularioCompleto =
    enviando ||
    !enderecoEntrega.logradouro.trim() || !enderecoEntrega.numero.trim() || !enderecoEntrega.cidade.trim() ||
    (precisaValorCobradoDoCliente(pagante) && freteCobradoConsultora === "") || !descricao.trim() ||
    !pagante || (pagante === "cliente" && !comprovanteBase64);
  const disabledPadrao =
    enviando || !motoboyId || !descricao.trim() ||
    (freteCalculado === 0 && !(freteNegociado && parseFloat(freteNegociado.replace(",", ".")) > 0));
  const disabledSubmit = mostrarFormularioCompleto ? disabledFormularioCompleto : disabledPadrao;

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
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>

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

              {mostrarFormularioCompleto ? (
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

                    {/* Venda (consultora) — escondido quando a venda já vem fixada (V3, aberto de dentro da venda).
                        REGRA DE NEGÓCIO (fix 21/07 — venda deixa de ser obrigatória): frete avulso pode
                        não ter venda (ex.: "levar material à loja", "buscar peça") — por isso o rótulo
                        diz "(opcional)" e a dica explica quando vale a pena buscar. */}
                    {!vendaFixada && (
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                        <Search size={13} /> Venda (opcional)
                      </label>
                      <div style={{ fontSize: 11, color: C.cinza, marginBottom: 6 }}>
                        Se a corrida for de uma venda, busque aqui — o endereço vem preenchido.
                      </div>
                      {vendaSelecionada ? (
                        <div style={{
                          padding: "8px 12px", borderRadius: 8,
                          border: `1px solid ${C.esmeralda}`,
                          background: C.esmeraldaLt,
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: C.esmeralda }}>
                            {vendaSelecionada.numero_venda} — {vendaSelecionada.cliente_nome ?? "Cliente não identificado"}
                          </span>
                          <button
                            type="button"
                            onClick={() => { setVendaSelecionada(null); setEnderecoEntrega(ENDERECO_VAZIO); }}
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.cinza }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div style={{ position: "relative" }}>
                          <input
                            type="text"
                            placeholder="Buscar por número da venda ou cliente..."
                            value={vendaBusca}
                            onChange={e => setVendaBusca(e.target.value)}
                            style={{
                              width: "100%", padding: "9px 12px", borderRadius: 8,
                              border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                              boxSizing: "border-box",
                            }}
                          />
                          {buscandoVenda && (
                            <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                              <Loader2 size={14} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
                            </div>
                          )}
                          {vendasResultado.length > 0 && (
                            <div style={{
                              position: "absolute", top: "100%", left: 0, right: 0,
                              background: "#fff", border: `1px solid ${C.cremeBorder}`,
                              borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                              zIndex: 100, maxHeight: 200, overflowY: "auto",
                            }}>
                              {vendasResultado.map(v => (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => selecionarVenda(v)}
                                  style={{
                                    display: "block", width: "100%", textAlign: "left",
                                    padding: "8px 12px", border: "none",
                                    background: "none", cursor: "pointer", fontSize: 13,
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = C.cremeBg}
                                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                                >
                                  <strong>{v.numero_venda}</strong> — {v.cliente_nome ?? "—"}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    )}

                    {/* Endereço de entrega — formulário estruturado com busca
                        por CEP (migration 355). Editável: não altera o
                        cadastro do cliente/venda, só o que fica gravado na
                        entrega. */}
                    <div style={{ marginBottom: 14 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                        <MapPin size={13} /> Endereço de entrega *
                      </label>
                      {carregandoEndereco ? (
                        <div style={{ fontSize: 12, color: C.cinza, display: "flex", alignItems: "center", gap: 6 }}>
                          <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                          Carregando endereço da venda...
                        </div>
                      ) : (
                        <EnderecoForm value={enderecoEntrega} onChange={setEnderecoEntrega} />
                      )}
                    </div>
                  </div>

                  {/* Coluna B — Pagamento */}
                  <div>
                    <div style={tituloSecao}>PAGAMENTO</div>

                    {/* Quem paga (migration 354) + Comprovante — bloco destacado:
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
              ) : (
                <>
                  {campoDescricao}

                  {/* Motoboy (criação direta — loja/admin/estoquista) */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                      <Bike size={13} /> Motoboy *
                    </label>
                    <select
                      required
                      value={motoboyId}
                      onChange={e => setMotoboyId(e.target.value)}
                      style={{
                        width: "100%", padding: "9px 12px", borderRadius: 8,
                        border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                        boxSizing: "border-box", background: "#fff",
                      }}
                    >
                      <option value="">Selecionar motoboy...</option>
                      {motoboys.map(m => (
                        <option key={m.id} value={m.user_id ?? String(m.id)}>{m.nome}</option>
                      ))}
                    </select>
                  </div>

                  {campoRegiao}

                  {/* Cliente (opcional) — só no modo criação direta; no modo consultora o cliente vem da venda */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.cinza, marginBottom: 6 }}>
                      <User size={13} /> Cliente (opcional)
                    </label>
                    {contatoSelecionado ? (
                      <div style={{
                        padding: "8px 12px", borderRadius: 8,
                        border: `1px solid ${C.esmeralda}`,
                        background: C.esmeraldaLt,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.esmeralda }}>
                          {contatoSelecionado.nome}
                        </span>
                        <button
                          type="button"
                          onClick={() => { setContatoSelecionado(null); setBuscaContato(""); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: C.cinza }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ position: "relative" }}>
                        <input
                          type="text"
                          placeholder="Buscar por nome..."
                          value={buscaContato}
                          onChange={e => setBuscaContato(e.target.value)}
                          style={{
                            width: "100%", padding: "9px 12px", borderRadius: 8,
                            border: `1px solid ${C.cremeBorder}`, fontSize: 13,
                            boxSizing: "border-box",
                          }}
                        />
                        {buscandoContato && (
                          <div style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}>
                            <Loader2 size={14} color={C.cinza} style={{ animation: "spin 1s linear infinite" }} />
                          </div>
                        )}
                        {contatos.length > 0 && (
                          <div style={{
                            position: "absolute", top: "100%", left: 0, right: 0,
                            background: "#fff", border: `1px solid ${C.cremeBorder}`,
                            borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                            zIndex: 100, maxHeight: 200, overflowY: "auto",
                          }}>
                            {contatos.map(c => (
                              <button
                                key={c.id_contato}
                                type="button"
                                onClick={() => { setContatoSelecionado(c); setBuscaContato(""); setContatos([]); }}
                                style={{
                                  display: "block", width: "100%", textAlign: "left",
                                  padding: "8px 12px", border: "none",
                                  background: "none", cursor: "pointer", fontSize: 13,
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = C.cremeBg}
                                onMouseLeave={e => e.currentTarget.style.background = "none"}
                              >
                                {c.nome}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {campoObservacoes}
                </>
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
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
