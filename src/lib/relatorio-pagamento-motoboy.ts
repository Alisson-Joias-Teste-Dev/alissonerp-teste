/**
 * relatorio-pagamento-motoboy.ts — regras puras do relatório de pagamento
 * do motoboy por entregador + período (aba "Pagamento do motoboy").
 *
 * O QUE: extrai da rota `GET /api/entregas-venda/motoboy/relatorio-pagamento`
 * a parte que não depende de banco — o MARCO de corte, a validação do
 * período e a CLASSIFICAÇÃO de cada corrida em Pagar/Revisar/Não pagar —
 * para ser testável sem mockar SQL/auth (mesmo padrão de
 * `frete-avulso-alerta.ts`/`frete-verba.ts`: regra pura isolada da rota).
 *
 * REGRA DE NEGÓCIO (decisão do Jonathan, 21/07/2026 — ver
 * docs/regras-negocio/entregas.md §11 e a memória
 * reference_relatorio_corridas_motoboy.md): o relatório espelha o processo
 * MANUAL que hoje o Jonathan faz por PDF (reportlab) para o financeiro
 * pagar o entregador — sai da fonte NOVA (`entregas_venda`), não da legada
 * `public.controle_entregas`, porque o pagamento já foi feito até 19/07/2026
 * ("começando do zero"). Por isso o MARCO_RELATORIO_PAGAMENTO_MOTOBOY.
 *
 * IMPACTO SE ALTERADO: mudar a classificação aqui muda o valor "a pagar" que
 * o financeiro confia para liberar o dinheiro do entregador — qualquer
 * ajuste tem que ser combinado com o Jonathan (ver PARE no relato da task).
 */

/**
 * REGRA DE NEGÓCIO: pagamento feito até 19/07/2026 já está quitado — o
 * relatório do módulo novo só existe a partir de 20/07/2026 (decisão
 * explícita do Jonathan, "começando do zero"). Corridas anteriores não detem
 * entrar aqui de novo (pagaria em dobro).
 * IMPACTO SE ALTERADO: mover o marco para trás reabre corridas já pagas
 * manualmente pelo PDF antigo — risco de pagamento em dobro ao entregador.
 */
export const MARCO_RELATORIO_PAGAMENTO_MOTOBOY = "2026-07-20";

/**
 * Valida se a data de início do período está ANTES do marco (20/07/2026).
 * Comparação lexicográfica funciona pois ambas as strings são 'YYYY-MM-DD'.
 */
export function periodoAntesDoMarco(dataInicio: string): boolean {
  return dataInicio < MARCO_RELATORIO_PAGAMENTO_MOTOBOY;
}

export type ClassificacaoCorridaMotoboy = "pagar" | "revisar" | "nao_pagar";

/** Situações de `vendas_erp.status` que indicam a venda já FECHADA/entregue no ERP. */
const SITUACOES_VENDA_FECHADA = new Set(["entregue", "concluido"]);

/** Dados mínimos de UMA corrida necessários para classificá-la. */
export interface CorridaParaClassificar {
  /** `entregas_venda.venda_id` — null quando é avulsa sem venda vinculada. */
  vendaId: number | null;
  /** `vendas_erp.status` da venda vinculada — null quando não há venda. */
  vendaSituacao: string | null;
  /** `entregas_venda.is_avulso`. */
  isAvulso: boolean;
  /** `entregas_venda.descricao_avulso`. */
  descricaoAvulso: string | null;
  /** true quando existe linha correspondente em `alissonerp.motoboys` para o `motoboy_id`. */
  temCadastroMotoboy: boolean;
  /**
   * Posição (1-based) desta corrida entre as corridas confirmadas da MESMA
   * venda dentro do período do relatório (calculado por ROW_NUMBER na
   * consulta SQL, partição por `venda_id`, ordenado por data). Corridas SEM
   * venda (avulsa sem `venda_id`) devem vir sempre com `1` — não há como
   * (nem sentido em) checar duplicidade sem venda para comparar.
   */
  ordemNaVenda: number;
}

export interface ClassificacaoResultado {
  classificacao: ClassificacaoCorridaMotoboy;
  motivo: string | null;
}

/**
 * Classifica UMA corrida em Pagar / Revisar / Não pagar — é uma SUGESTÃO do
 * sistema (decisão do Jonathan, 21/07/2026): o financeiro pode rever e
 * AJUSTAR a decisão de cada corrida no relatório antes de fechar o
 * pagamento (ver `decisaoInicialFinanceiro` abaixo e
 * `RelatorioPagamentoMotoboy.tsx`, que expõe um toggle Pagar/Não pagar por
 * linha) — esta função nunca é a palavra final, só o ponto de partida.
 *
 * ORDEM DE PRIORIDADE (mutuamente exclusiva — a primeira regra que bater
 * decide, mesmo que outras também se apliquem):
 *   1. Venda vinculada CANCELADA (única certeza automática) -> Não pagar
 *   2. Corrida DUPLICADA (2ª+ na mesma venda no período)    -> Revisar
 *   3. Entrega de PEDIDO com venda ainda não fechada/entregue -> Revisar
 *   4. Avulsa SEM venda e SEM descrição clara -> Revisar
 *   5. Motoboy sem cadastro em `alissonerp.motoboys` -> Revisar
 *   6. Resto -> Pagar
 *
 * REGRA DE NEGÓCIO (mudança 21/07/2026, pedido explícito do Jonathan):
 * duplicidade deixou de ser "Não pagar" automático — é só SUSPEITA (o
 * motoboy pode ter feito 2 viagens reais para a mesma venda), não certeza de
 * que ele não trabalhou. "Não pagar" fica reservado para o único caso onde
 * não há dúvida nenhuma: a venda foi cancelada. Todo o resto vira "Revisar"
 * — o financeiro decide, o sistema só avisa.
 *
 * IMPACTO SE ALTERADO: esta função é a ÚNICA fonte da SUGESTÃO — usada pela
 * rota (cálculo real) e pelos testes anti-volta. Duplicar a lógica em outro
 * lugar (ex.: no componente de front) divergiria da regra oficial. A decisão
 * FINAL (editável) não mora aqui — mora no estado do componente de front,
 * inicializada por `decisaoInicialFinanceiro`.
 */
export function classificarCorridaMotoboy(
  corrida: CorridaParaClassificar,
): ClassificacaoResultado {
  const { vendaId, vendaSituacao, isAvulso, descricaoAvulso, temCadastroMotoboy, ordemNaVenda } = corrida;

  // 1. Venda cancelada — única certeza automática (a venda não deveria mais
  // existir, então a corrida não deveria ter sido paga por ela).
  if (vendaId !== null && vendaSituacao === "cancelado") {
    return { classificacao: "nao_pagar", motivo: "Venda vinculada está cancelada." };
  }

  // 2. Duplicidade — mais de uma corrida confirmada para a mesma venda no
  // período. SUSPEITA, não certeza (o motoboy pode ter feito 2 viagens de
  // verdade) — por isso Revisar, não Não pagar; o financeiro confirma.
  if (vendaId !== null && ordemNaVenda > 1) {
    return {
      classificacao: "revisar",
      motivo: "Suspeita de corrida duplicada — já existe outra corrida confirmada para a mesma venda neste período. Confirme se são duas viagens reais antes de pagar.",
    };
  }

  // 3. Entrega de pedido (não-avulsa) cuja venda ainda não está fechada no
  // ERP — sinal de inconsistência (entrega confirmada mas venda pendente).
  if (!isAvulso && !SITUACOES_VENDA_FECHADA.has(vendaSituacao ?? "")) {
    return {
      classificacao: "revisar",
      motivo: "Venda ainda não está fechada/entregue no ERP.",
    };
  }

  // 4. Avulsa sem venda vinculada e sem descrição — não dá para saber o que
  // o motoboy foi fazer, financeiro precisa confirmar antes de pagar.
  if (isAvulso && vendaId === null && !(descricaoAvulso ?? "").trim()) {
    return {
      classificacao: "revisar",
      motivo: "Corrida avulsa sem venda vinculada e sem descrição.",
    };
  }

  // 5. Motoboy sem cadastro formal — corrida existe mas não há como
  // confirmar os dados do entregador (chave pix, etc.) com segurança.
  if (!temCadastroMotoboy) {
    return {
      classificacao: "revisar",
      motivo: "Motoboy sem cadastro em alissonerp.motoboys.",
    };
  }

  return { classificacao: "pagar", motivo: null };
}

/** Decisão FINAL editável pelo financeiro — binária (ou paga, ou não). */
export type DecisaoPagamentoMotoboy = "pagar" | "nao_pagar";

/**
 * Valor INICIAL do toggle editável de cada linha do relatório — ponto de
 * partida que o financeiro pode sobrepor, nunca a decisão travada.
 *
 * REGRA DE NEGÓCIO: só a sugestão "pagar" começa marcada como "pagar" —
 * "revisar" E "nao_pagar" começam como "nao_pagar" (postura conservadora:
 * qualquer coisa que o sistema sinalizou como suspeita/incerta exige ação
 * ATIVA do financeiro para entrar no total, nunca o contrário).
 * IMPACTO SE INVERTIDO (revisar começar como "pagar"): o financeiro teria
 * que ATIVAMENTE desmarcar cada suspeita para não pagar por engano — abre
 * espaço para corrida duvidosa ser paga por falta de atenção, não por
 * decisão consciente.
 */
export function decisaoInicialFinanceiro(
  classificacao: ClassificacaoCorridaMotoboy,
): DecisaoPagamentoMotoboy {
  return classificacao === "pagar" ? "pagar" : "nao_pagar";
}

/**
 * Soma o `frete_motoboy` das corridas classificadas como "pagar" (sugestão
 * BRUTA do sistema, ainda sem revisão do financeiro) — usado pela ROTA só
 * para informar "quanto o sistema sugere" (`total_pagar` na resposta). NÃO é
 * o total final exibido no relatório — esse vem de `calcularTotalAjustado`,
 * client-side, depois do financeiro revisar/ajustar cada linha.
 *
 * `foiPago` (opcional, default false): corrida já paga em um lote anterior
 * (`pagamentos_motoboy_itens`) não entra na soma — já foi liquidada, somar
 * de novo infla o valor que falta pagar.
 * IMPACTO SE ALTERADO: somar outras classificações, ou incluir já pagas,
 * infla o valor que o financeiro vê como "ainda falta pagar".
 */
export function calcularTotalPagar(
  corridas: Array<{ classificacao: ClassificacaoCorridaMotoboy; freteMotoboy: number; foiPago?: boolean }>,
): number {
  return corridas
    .filter((c) => c.classificacao === "pagar" && !(c.foiPago ?? false))
    .reduce((soma, c) => soma + c.freteMotoboy, 0);
}

/**
 * Soma o `frete_motoboy` das corridas com DECISÃO FINAL "pagar" — depois do
 * financeiro revisar/ajustar cada linha no relatório. É este número (não
 * `calcularTotalPagar`) que aparece como "Total a pagar" no rodapé da tela e
 * que vira os `entrega_ids` mandados para `POST
 * /api/entregas-venda/motoboy/pagar` quando o financeiro confirma.
 *
 * Corridas já pagas (`foiPago=true`) são excluídas mesmo que a decisão final
 * marcada seja "pagar" — não há double-pay possível (a UNIQUE do banco já
 * barraria), mas também não devem inflar o total do que falta liberar.
 */
export function calcularTotalAjustado(
  corridas: Array<{ decisaoFinal: DecisaoPagamentoMotoboy; freteMotoboy: number; foiPago: boolean }>,
): number {
  return corridas
    .filter((c) => c.decisaoFinal === "pagar" && !c.foiPago)
    .reduce((soma, c) => soma + c.freteMotoboy, 0);
}
