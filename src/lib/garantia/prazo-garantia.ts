// ═══════════════════════════════════════════════════════════════════════════
// Garantia — decide se uma ordem de garantia pode ser aberta
//
// REGRA DE NEGÓCIO (aprovada pelo Jonathan em 17/07/2026 — a regra escrita vive
// em docs/regras-negocio/ordens.md; ESTE arquivo é a implementação dela):
//
//   1. Só abre garantia se a venda estiver com situacao = 'entregue' — ao pé da
//      letra. 'concluido' NÃO libera (decisão explícita), nem 'aprovado'.
//      Sem saída por aprovação: essa trava é seca.
//   2. Serviço vitalício (hoje só "Acabamento e polimento", marcado em
//      tipos_servico.garantia_vitalicia) → sem prazo.
//   3. Qualquer outro serviço → 7 dias úteis desde a entrega. Fora disso, só com
//      aprovação (evento 'garantia_fora_prazo').
//   4. Serviços misturados → o MAIS RESTRITIVO vence: basta um não-vitalício
//      para valer o prazo.
//
// POR QUÊ o item 4: senão o polimento vira carona — bastaria marcar "Acabamento
//   e polimento" junto para colar uma solda de graça três anos depois.
//
// IMPACTO SE ALTERADO/REMOVIDO: a garantia volta a poder ser aberta de qualquer
//   venda (hoje a única trava é 'rascunho'), sem prazo e sem aprovação. Esta é a
//   fonte ÚNICA da decisão — o modal só repete o aviso para o usuário; quem
//   chamar POST /api/ordens direto tem que bater aqui.
// ═══════════════════════════════════════════════════════════════════════════

import { diasUteisDecorridos } from "@/lib/dias-uteis";

/**
 * Prazo da garantia, em dias úteis, para serviços NÃO vitalícios.
 *
 * REGRA: constante PRÓPRIA da garantia, de propósito — não reusar a
 * PRAZO_DEVOLUCAO_DIAS_UTEIS de @/lib/dias-uteis. Hoje as duas valem 7, mas são
 * regras de negócio diferentes (devolver a peça ≠ consertar a peça). Compartilhar
 * a constante faria um prazo mudar junto com o outro sem ninguém pedir.
 */
export const PRAZO_GARANTIA_DIAS_UTEIS = 7;

/** De onde saiu a data da entrega, em ordem de confiança. */
export type FonteDataEntrega = "entrega_real" | "transicao" | "data_entrega_venda" | null;

export type MotivoBloqueioGarantia = "venda_nao_entregue" | "fora_do_prazo";

export interface AvaliacaoGarantia {
  /** true = pode abrir a garantia agora. */
  permitido: boolean;
  motivo: MotivoBloqueioGarantia | null;
  /** Mensagem pronta para o usuário (explica o que aconteceu e o que fazer). */
  mensagem: string | null;
  /** true = todos os serviços escolhidos são vitalícios (sem prazo). */
  vitalicia: boolean;
  fonte: FonteDataEntrega;
  /** ISO da data de entrega usada na conta, ou null se não houver nenhuma. */
  dataEntrega: string | null;
  /** Dias úteis desde a entrega, ou null se não deu para medir. */
  diasUteis: number | null;
  /**
   * true = o bloqueio tem saída por aprovação (fora do prazo).
   * false = trava seca (venda não entregue) — NÃO oferecer o botão.
   */
  podeSolicitarAprovacao: boolean;
}

/**
 * Erro tipado da trava de garantia, lançado de dentro da transação de criação da
 * ordem. O `motivo` deixa a API route escolher o HTTP status sem parsear a
 * mensagem: venda não entregue = 422 (trava seca), fora do prazo sem aprovação =
 * 409 (falta um pré-requisito recuperável — solicitar aprovação).
 */
export class GarantiaGuardError extends Error {
  constructor(
    public readonly motivo: MotivoBloqueioGarantia,
    message: string,
  ) {
    super(message);
    this.name = "GarantiaGuardError";
  }
}

/** A situação da venda que libera garantia. Ao pé da letra: só esta. */
const SITUACAO_LIBERA_GARANTIA = "entregue";

/**
 * Data mais antiga aceita em vendas_erp.data_entrega.
 *
 * POR QUÊ: o campo tem lixo — em 17/07/2026, das 754 preenchidas, 12 estavam no
 * FUTURO e 1 no ano 0005. Sem esse piso (e sem o teto de CURRENT_DATE aplicado no
 * SQL), essas vendas dariam "centenas de milhares de dias úteis de atraso" ou
 * prazo eterno. O ERP não existia antes de 2020 — data anterior é lixo, não dado.
 */
const DATA_ENTREGA_MINIMA_SA = "2020-01-01";

interface LinhaAvaliacao {
  situacao: string | null;
  data_entrega_real: string | null;
  data_transicao: string | null;
  data_pdv: string | null;
  qtd_tipos: number;
  qtd_vitalicios: number;
}

/**
 * avaliarGarantia — a decisão completa, em uma consulta só.
 *
 * Aceita `sql` (top-level) ou `tx` (dentro de sql.begin) — igual ao
 * assertVendaForaDeRascunho. REGRA: na criação da ordem, chamar SEMPRE com `tx`,
 * dentro da mesma transação do INSERT, senão abre janela de TOCTOU (a venda pode
 * mudar de situação entre a checagem e o INSERT).
 *
 * @param db              conexão `sql` ou `tx` (tagged template do pacote postgres)
 * @param vendaId         venda de origem (alissonerp.vendas_erp.id)
 * @param tiposServicoIds tipos de serviço escolhidos (alissonerp.tipos_servico.id)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function avaliarGarantia(
  db: any,
  vendaId: number,
  tiposServicoIds: number[],
): Promise<AvaliacaoGarantia> {
  // Lista vazia nunca deveria chegar aqui (POST /api/ordens já exige ≥1 tipo para
  // garantia), mas se chegar: 0 vitalícios de 0 tipos NÃO é "tudo vitalício" — é
  // o caso mais restritivo. Ver a checagem de qtd_tipos > 0 abaixo.
  const ids = Array.isArray(tiposServicoIds)
    ? tiposServicoIds.map(Number).filter((n) => Number.isInteger(n))
    : [];

  const [row] = (await db`
    SELECT
      v.situacao,

      -- 1ª fonte: entrega real ao cliente (motoboy = data_entrega_realizada,
      -- loja = data_retirada). É a mais confiável: alguém confirmou o
      -- recebimento. Entrega parcial: usa a confirmada MAIS RECENTE.
      (SELECT COALESCE(ev.data_entrega_realizada, ev.data_retirada)
         FROM alissonerp.entregas_venda ev
        WHERE ev.venda_id = v.id
          AND COALESCE(ev.data_entrega_realizada, ev.data_retirada) IS NOT NULL
        ORDER BY COALESCE(ev.data_entrega_realizada, ev.data_retirada) DESC
        LIMIT 1) AS data_entrega_real,

      -- 2ª fonte: quando a venda VIROU 'entregue' no histórico de transições.
      -- Cobre vendas marcadas entregues sem passar pelo módulo de entrega.
      (SELECT t.created_at
         FROM alissonerp.vendas_transicoes t
        WHERE t.venda_id = v.id
          AND t.para_situacao = ${SITUACAO_LIBERA_GARANTIA}
        ORDER BY t.created_at DESC
        LIMIT 1) AS data_transicao,

      -- 3ª fonte: a data de entrega do PDV (pedidos antigos). Última da fila e
      -- SÓ se for sã — ver DATA_ENTREGA_MINIMA_SA. Data futura não é entrega:
      -- é previsão ou erro de digitação.
      (CASE
         WHEN v.data_entrega IS NOT NULL
          AND v.data_entrega >= ${DATA_ENTREGA_MINIMA_SA}::date
          AND v.data_entrega <= CURRENT_DATE
         THEN v.data_entrega::timestamptz
       END) AS data_pdv,

      -- Vitalício: conta quantos tipos foram pedidos e quantos deles são
      -- vitalícios. A comparação (todos?) fica no TS, logo abaixo.
      (SELECT count(*) FROM alissonerp.tipos_servico ts
        WHERE ts.id = ANY(${ids}::int[])) AS qtd_tipos,
      (SELECT count(*) FROM alissonerp.tipos_servico ts
        WHERE ts.id = ANY(${ids}::int[]) AND ts.garantia_vitalicia = true) AS qtd_vitalicios

    FROM alissonerp.vendas_erp v
    WHERE v.id = ${vendaId}
  `) as LinhaAvaliacao[];

  // Venda inexistente: quem chama (POST /api/ordens) já barrou via
  // assertVendaForaDeRascunho. Defensivo — nunca liberar por falta de dado.
  if (!row) {
    return {
      permitido: false,
      motivo: "venda_nao_entregue",
      mensagem: "Venda não encontrada.",
      vitalicia: false,
      fonte: null,
      dataEntrega: null,
      diasUteis: null,
      podeSolicitarAprovacao: false,
    };
  }

  // ── Regra 1: a venda precisa estar ENTREGUE ─────────────────────────────
  // Trava SECA: não há aprovação que a resolva (a aprovação trata prazo, não
  // entrega). O caminho é marcar a venda como entregue e voltar aqui.
  if (row.situacao !== SITUACAO_LIBERA_GARANTIA) {
    return {
      permitido: false,
      motivo: "venda_nao_entregue",
      mensagem:
        `Só é possível abrir garantia de pedido ENTREGUE. Esta venda está como "${row.situacao ?? "sem situação"}". ` +
        `Marque a venda como entregue e tente de novo.`,
      vitalicia: false,
      fonte: null,
      dataEntrega: null,
      diasUteis: null,
      podeSolicitarAprovacao: false,
    };
  }

  // ── Regra 2 + 4: vitalício só se TODOS forem vitalícios ─────────────────
  // qtd_tipos > 0 barra o caso degenerado "nenhum tipo encontrado" (lista vazia
  // ou ids inexistentes), que senão passaria como 0 === 0 = "tudo vitalício".
  const qtdTipos = Number(row.qtd_tipos ?? 0);
  const qtdVitalicios = Number(row.qtd_vitalicios ?? 0);
  const vitalicia = qtdTipos > 0 && qtdVitalicios === qtdTipos;

  if (vitalicia) {
    return {
      permitido: true,
      motivo: null,
      mensagem: null,
      vitalicia: true,
      fonte: null,
      dataEntrega: null,
      diasUteis: null,
      podeSolicitarAprovacao: false,
    };
  }

  // ── Regra 3: 7 dias úteis desde a entrega ───────────────────────────────
  const dataRef =
    row.data_entrega_real ?? row.data_transicao ?? row.data_pdv ?? null;
  const fonte: FonteDataEntrega = row.data_entrega_real
    ? "entrega_real"
    : row.data_transicao
      ? "transicao"
      : row.data_pdv
        ? "data_entrega_venda"
        : null;

  // Sem NENHUMA data confiável (≈5% das vendas entregues em 17/07): não dá para
  // PROVAR que passou do prazo, então não bloqueia por prazo. Mesmo critério já
  // em produção na devolução (src/lib/prazo-devolucao.ts). A trava de 'entregue'
  // acima continua valendo — o que se abre mão aqui é só da contagem de dias.
  if (!dataRef) {
    return {
      permitido: true,
      motivo: null,
      mensagem: null,
      vitalicia: false,
      fonte: null,
      dataEntrega: null,
      diasUteis: null,
      podeSolicitarAprovacao: false,
    };
  }

  const dataEntrega = new Date(dataRef);
  const dias = diasUteisDecorridos(dataEntrega, new Date());
  const dentroPrazo = dias <= PRAZO_GARANTIA_DIAS_UTEIS;

  return {
    permitido: dentroPrazo,
    motivo: dentroPrazo ? null : "fora_do_prazo",
    mensagem: dentroPrazo
      ? null
      : `Esta venda foi entregue há ${dias} dias úteis — passou do prazo de ${PRAZO_GARANTIA_DIAS_UTEIS} dias úteis ` +
        `para garantia destes serviços. Para abrir mesmo assim, é necessário solicitar aprovação.`,
    vitalicia: false,
    fonte,
    dataEntrega: dataEntrega.toISOString(),
    diasUteis: dias,
    podeSolicitarAprovacao: !dentroPrazo,
  };
}
