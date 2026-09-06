/**
 * Comissão — lançamentos do EXTRATO (livro-razão)
 *
 * O QUÊ
 *   Cria lançamentos avulsos em `fechamento_comissao_itens` com `fechamento_id`
 *   NULO. São os lançamentos que nascem NO MOMENTO DO FATO (devolução concluída),
 *   antes de existir um fechamento do mês. O fechamento adota depois.
 *
 * O PORQUÊ (regra de negócio — Jonathan, 03/08/2026)
 *   A comissão funciona como extrato bancário: cada fato vira uma linha datada
 *   e o saldo rola de um mês pro outro. Invariante que sustenta tudo:
 *   CADA REAL RECEBIDO GERA COMISSÃO UMA VEZ SÓ.
 *   Antes disso, devolução não debitava nada e a comissão ficava presa numa
 *   venda desfeita. Ver docs/regras-negocio/comercial.md §2 e migration 363.
 *
 * O IMPACTO SE FOR REMOVIDO
 *   A devolução volta a não debitar comissão. Como o uso do vale passou a
 *   comissionar (ver vale-troca.ts), a empresa pagaria comissão DUAS VEZES pelo
 *   mesmo dinheiro: uma na venda devolvida e outra na venda feita com o vale.
 */

import sql from "@/lib/db";
import {
  aplicarFator, chaveResultado, competenciaDaData, resultadosMeta,
} from "@/lib/comissao-fator";
import { logAudit } from "@/lib/audit";

export interface DebitoDevolucao {
  devolucao_id: number;
  numero: string;
  consultora_id: number;
  venda_id: number;
  numero_venda: string;
  valor_debito: number;
  itens: number;
  fracao_recebida: number;
  /** Data da venda ORIGINAL — define de qual mês-safra vem o fator da meta. */
  data_venda: string | null;
  /** Fator da meta do mês da venda devolvida (1 = comissão foi paga integral). */
  fator_meta: number;
  /** Débito ANTES do fator, para a linha poder se explicar. */
  debito_bruto: number;
}

/**
 * Calcula quanto debitar da consultora por uma devolução — SEM gravar nada.
 *
 * O QUÊ: soma, dos itens que voltaram FISICAMENTE ao estoque (`aprovado_retorno`),
 * a comissão do item proporcional ao quanto da venda o cliente já pagou.
 *
 * O PORQUÊ: a comissão segue o dinheiro recebido (comercial.md §2). Se o cliente
 * só pagou metade da venda, só metade da comissão existiu — debitar o valor cheio
 * tiraria da consultora dinheiro que ela nunca recebeu.
 * `reprovado_descarte` e `garantia` NÃO entram: decisão do Jonathan (22/07/2026)
 * — a peça não voltou ao estoque, a comissão não se mexe.
 *
 * O IMPACTO: mudar o filtro de condição ou a fração muda o valor pago a TODAS as
 * consultoras no fechamento do mês.
 */
export async function calcularDebitoDevolucao(
  devolucaoId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any,
): Promise<DebitoDevolucao | null> {
  const runner = txClient ?? sql;

  const [row] = await runner`
    WITH recebido AS (
      SELECT COALESCE(SUM(p.valor), 0)::numeric AS valor
      FROM alissonerp.pagamentos_venda p
      JOIN alissonerp.devolucoes_venda d ON d.venda_id = p.venda_id
      WHERE d.id = ${devolucaoId}
        AND p.status = 'confirmado'
        AND p.comissionavel IS TRUE
    )
    SELECT
      d.id                       AS devolucao_id,
      d.numero,
      v.vendedor_id              AS consultora_id,
      v.id                       AS venda_id,
      v.numero_venda,
      v.data_venda::text         AS data_venda,
      COUNT(di.id)               AS itens,
      -- CASE em vez de COALESCE(LEAST(...)): no PostgreSQL LEAST IGNORA NULL,
      -- então LEAST(NULL, 1) devolve 1 — uma venda sem nenhum pagamento seria
      -- lida como "100% recebida" e debitaria a comissão cheia de quem nunca
      -- recebeu nada. Achado no ensaio do acerto de julho (03/08/2026).
      CASE WHEN COALESCE(v.total_venda, 0) > 0
           THEN LEAST(r.valor / v.total_venda, 1) ELSE 0 END::numeric AS fracao_recebida,
      ROUND(
        COALESCE(SUM(
          COALESCE(iv.valor_comissao, 0)
          * (di.quantidade / NULLIF(iv.quantidade, 0))
        ), 0)
        * CASE WHEN COALESCE(v.total_venda, 0) > 0
               THEN LEAST(r.valor / v.total_venda, 1) ELSE 0 END
      , 2)::numeric              AS valor_debito
    FROM alissonerp.devolucoes_venda d
    JOIN alissonerp.vendas_erp v ON v.id = d.venda_id
    CROSS JOIN recebido r
    JOIN alissonerp.devolucoes_itens di
      ON di.devolucao_id = d.id AND di.condicao = 'aprovado_retorno'
    LEFT JOIN alissonerp.itens_venda_erp iv ON iv.id = di.item_venda_id
    WHERE d.id = ${devolucaoId}
    GROUP BY d.id, d.numero, v.vendedor_id, v.id, v.numero_venda, v.data_venda, v.total_venda, r.valor
  `;

  if (!row || !row.consultora_id) return null;

  // REGRA DE NEGÓCIO (migration 376): DEVOLVE-SE SÓ O QUE FOI PAGO.
  //
  // O PORQUÊ: se a venda nasceu num mês em que a consultora não bateu a meta, a
  // comissão dela saiu reduzida pelo fator daquele mês. Debitar o valor cheio na
  // devolução tiraria dela dinheiro que nunca entrou. É o mesmo princípio da
  // `fracao_recebida` acima (só o que o cliente pagou), agora também pelo fator.
  //
  // O IMPACTO: sem isto, agosto/2026 teria descontado R$ 53,71 a mais da Débora —
  // três devoluções (DV-00067, DV-00080, DV-00082) de vendas de agosto, mês em que
  // a comissão saiu pela metade, debitadas pelo valor inteiro.
  const consultoraId = Number(row.consultora_id);
  const competencia = competenciaDaData(row.data_venda as string | null);
  const resultados = competencia
    ? await resultadosMeta([competencia], [consultoraId])
    : new Map();
  const fator = competencia
    ? (resultados.get(chaveResultado(consultoraId, competencia))?.fator ?? 1)
    : 1;
  const bruto = Number(row.valor_debito);

  return {
    devolucao_id: Number(row.devolucao_id),
    numero: row.numero,
    consultora_id: consultoraId,
    venda_id: Number(row.venda_id),
    numero_venda: row.numero_venda,
    valor_debito: aplicarFator(bruto, fator),
    itens: Number(row.itens),
    fracao_recebida: Number(row.fracao_recebida ?? 0),
    data_venda: (row.data_venda as string | null) ?? null,
    fator_meta: fator,
    debito_bruto: bruto,
  };
}

/**
 * Grava o débito da devolução no extrato da consultora.
 *
 * O QUÊ: UMA linha `estorno` negativa (soma dos itens que voltaram), com
 * `fechamento_id` NULO — nasce solta e o fechamento do mês adota depois.
 * Datada em `data_recebimento = hoje`, porque é HOJE que a peça voltou.
 *
 * O PORQUÊ: o extrato lança no mês do fato, não no mês da venda original. Mês
 * fechado nunca é reaberto — o acerto entra como linha no mês corrente e o
 * saldo pode ficar negativo e rolar (regra aprovada pelo Jonathan em 22/07).
 *
 * O IMPACTO: o índice único `uq_fech_com_itens_devolucao` (migration 363) é a
 * trava anti-duplicidade. Se a conclusão da devolução for reprocessada, este
 * INSERT falha em vez de debitar duas vezes — por isso o erro é engolido e
 * apenas logado: não pode derrubar a conclusão da devolução (que já mexeu no
 * estoque e gerou o vale).
 */
export async function debitarComissaoDevolucao(
  devolucaoId: number,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any,
): Promise<DebitoDevolucao | null> {
  const runner = txClient ?? sql;

  const calc = await calcularDebitoDevolucao(devolucaoId, runner);
  if (!calc) return null;
  if (!(calc.valor_debito > 0)) return calc; // nada recebido = nada a debitar

  try {
    const [item] = await runner`
      INSERT INTO alissonerp.fechamento_comissao_itens (
        fechamento_id, venda_id, numero_venda_snapshot, consultora_id,
        cliente_nome_snapshot, data_venda, data_recebimento, forma_recebimento,
        valor_venda, comissao_total_venda, comissao_calculada,
        status, tipo_item, devolucao_id,
        comissao_bruta, fator_meta, motivo_fator
      )
      SELECT
        NULL, v.id, v.numero_venda, v.vendedor_id,
        c.nome, v.data_venda, CURRENT_DATE, ${"Devolução " + calc.numero},
        v.total_venda, v.total_comissao, ${-calc.valor_debito},
        'liberado', 'estorno', ${devolucaoId},
        ${-calc.debito_bruto}, ${calc.fator_meta},
        ${calc.fator_meta < 1
          ? `débito proporcional — a comissão desta venda foi paga a ${(calc.fator_meta * 100).toFixed(2).replace(".", ",")}%`
          : null}
      FROM alissonerp.vendas_erp v
      LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
      WHERE v.id = ${calc.venda_id}
      RETURNING id
    `;

    await logAudit(runner, {
      tabela: "fechamento_comissao_itens",
      operacao: "INSERT",
      registro_id: item.id,
      usuario_id: userId,
      dados_depois: {
        motivo: "debito_devolucao",
        devolucao: calc.numero,
        venda: calc.numero_venda,
        consultora_id: calc.consultora_id,
        comissao_debitada: -calc.valor_debito,
        comissao_debitada_bruta: -calc.debito_bruto,
        fator_meta: calc.fator_meta,
        fracao_recebida: calc.fracao_recebida,
      },
    });
  } catch (e) {
    // Trava do índice único: devolução já debitada. Não pode derrubar a
    // conclusão da devolução — estoque e vale já foram processados.
    console.error("[comissao-lancamentos] debito da devolucao nao gravado:", e);
    return null;
  }

  return calc;
}

/**
 * O fechamento do mês ADOTA os lançamentos soltos da consultora no período.
 *
 * O QUÊ: carimba `fechamento_id` nos lançamentos com fechamento nulo cuja
 * `data_recebimento` cai dentro do período.
 *
 * O PORQUÊ: o débito da devolução nasce solto no dia do fato. Sem a adoção ele
 * nunca chegaria num pagamento e o desconto não sairia do papel.
 *
 * O IMPACTO: se removido, o fechamento paga só as comissões de venda e ignora
 * todos os débitos — a empresa paga a mais.
 */
export async function adotarLancamentosSoltos(
  fechamentoId: string,
  consultoraId: number,
  periodoInicio: string,
  periodoFim: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txClient?: any,
): Promise<{ qtd: number; valor: number }> {
  const runner = txClient ?? sql;

  const rows = await runner`
    UPDATE alissonerp.fechamento_comissao_itens
    SET fechamento_id = ${fechamentoId}::uuid, updated_at = now()
    WHERE fechamento_id IS NULL
      AND consultora_id = ${consultoraId}
      AND status NOT IN ('estornado', 'cancelado')
      AND data_recebimento >= ${periodoInicio}::date
      AND data_recebimento <= ${periodoFim}::date
    RETURNING comissao_calculada
  `;

  return {
    qtd: rows.length,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    valor: rows.reduce((s: number, r: any) => s + Number(r.comissao_calculada), 0),
  };
}
