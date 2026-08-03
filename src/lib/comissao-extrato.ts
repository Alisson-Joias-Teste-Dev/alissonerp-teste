/**
 * Extrato de comissão — leitura (migration 363)
 *
 * O QUÊ
 *   Monta as linhas do extrato de comissão no formato de conta-corrente, em
 *   BALDES (buckets): comissões do mês, débitos de devolução, outros créditos,
 *   outros débitos e pagamentos efetuados. Alimenta as duas telas:
 *     tela 1 (lista)   — uma linha por vendedora, colunas = os baldes + saldo
 *     tela 2 (detalhe) — as linhas de cada balde de uma consultora
 *
 * O PORQUÊ
 *   O saldo tem que ser a SOMA dos lançamentos, sem cálculo escondido — é isso
 *   que faz a conta bater por construção e a conferência ser possível linha a
 *   linha. Formato definido pelo Jonathan em 03/08/2026, espelhando o extrato
 *   de comissão do Tiny/Olist.
 *
 * De onde vem cada linha (as duas fontes NÃO podem se sobrepor):
 *   a) `fechamento_comissao_itens` — o que já está gravado (comissões fechadas,
 *      débitos de devolução, ajustes)
 *   b) pagamentos confirmados que ainda não entraram em nenhum item — calculados
 *      na hora e marcados `previsto`, para o mês corrente não ficar vazio até
 *      alguém gerar o fechamento. A busca exclui todo pagamento já usado em (a).
 *   c) fechamentos com status 'pago' — viram a linha de baixa
 *
 * O IMPACTO SE ALTERADO
 *   Tirar o filtro anti-sobreposição de (b) faz o mesmo real aparecer duas vezes
 *   e o saldo mentir. E "comissões pendentes" (crediário não pago) NUNCA entra no
 *   saldo — o que firma a comissão é o pagamento.
 */

import sql from "@/lib/db";
import { SITUACOES_VENDA_ATIVAS } from "@/lib/vendas-situacoes";

export type BaldeExtrato =
  | "comissao"
  | "devolucao"
  | "outro_credito"
  | "outro_debito"
  | "pagamento";

export interface LinhaExtrato {
  consultora_id: number;
  consultora_nome: string | null;
  data: string;
  balde: BaldeExtrato;
  descricao: string;
  pedido: string | null;
  venda_id: number | null;
  valor_pago: number | null;
  base_comissao: number | null;
  valor: number;
  previsto: boolean;
}

/** Classifica um item gravado no balde certo do extrato. */
function baldeDoItem(tipoItem: string, devolucaoId: number | null, forma: string | null, valor: number): BaldeExtrato {
  if (devolucaoId) return "devolucao";
  if (tipoItem === "ajuste_positivo") return "outro_credito";
  if (tipoItem === "ajuste_negativo") return "outro_debito";
  if (tipoItem === "estorno") return valor < 0 ? "outro_debito" : "outro_credito";
  // Vale-troca usado numa venda nova é "outro crédito" (mesmo lugar do Tiny),
  // não "comissão do mês" — o mês é o das vendas pagas em dinheiro novo.
  if (forma === "Vale-Troca") return "outro_credito";
  return "comissao";
}

export async function linhasExtrato(
  consultoraId: number | null,
  de: string,
  ate: string,
): Promise<LinhaExtrato[]> {
  const cid = consultoraId ?? null;

  const gravados = await sql<Array<{
    consultora_id: number; consultora_nome: string | null; data: string;
    venda_id: number | null; pedido: string | null; cliente: string | null;
    forma: string | null; valor_pagamento: string; valor_venda: string;
    valor: string; tipo_item: string; devolucao_id: number | null;
  }>>`
    SELECT fi.consultora_id, ve.nome AS consultora_nome,
           COALESCE(fi.data_recebimento, fi.created_at::date)::text AS data,
           fi.venda_id, fi.numero_venda_snapshot AS pedido,
           fi.cliente_nome_snapshot AS cliente, fi.forma_recebimento AS forma,
           fi.valor_pagamento::text, fi.valor_venda::text,
           fi.comissao_calculada::text AS valor, fi.tipo_item, fi.devolucao_id
    FROM alissonerp.fechamento_comissao_itens fi
    LEFT JOIN public.vendedores ve ON ve.id_vendedor = fi.consultora_id
    WHERE fi.status NOT IN ('estornado', 'cancelado')
      AND (${cid}::int IS NULL OR fi.consultora_id = ${cid}::int)
      AND COALESCE(fi.data_recebimento, fi.created_at::date) >= ${de}::date
      AND COALESCE(fi.data_recebimento, fi.created_at::date) <= ${ate}::date
    ORDER BY 3
  `;

  const previstos = await sql<Array<{
    consultora_id: number; consultora_nome: string | null; data: string;
    venda_id: number; pedido: string; cliente: string | null; forma: string;
    valor_pagamento: string; total_venda: string; valor: string; comissionavel: boolean;
    vale_numero: string | null; vale_pedido_origem: string | null;
  }>>`
    -- ::int obrigatorio: vendas_erp.vendedor_id e BIGINT e o postgres.js devolve
    -- bigint como STRING, enquanto fechamento_comissao_itens.consultora_id e
    -- integer e vem como number. Sem o cast as duas fontes viram chaves
    -- diferentes no agrupamento e cada vendedora aparece DUAS vezes na tela.
    SELECT v.vendedor_id::int AS consultora_id, ven.nome AS consultora_nome,
           pv.data_confirmacao::date::text AS data,
           v.id AS venda_id, v.numero_venda AS pedido, c.nome AS cliente,
           pv.forma, pv.valor::text AS valor_pagamento, v.total_venda::text,
           CASE WHEN pv.comissionavel
                THEN ROUND(v.total_comissao * LEAST(pv.valor / NULLIF(v.total_venda, 0), 1), 2)
                ELSE 0 END::text AS valor,
           pv.comissionavel,
           vt.numero AS vale_numero,
           dv.numero_venda AS vale_pedido_origem
    FROM alissonerp.pagamentos_venda pv
    JOIN alissonerp.vendas_erp v ON v.id = pv.venda_id
      AND v.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
    LEFT JOIN public.vendedores ven ON ven.id_vendedor = v.vendedor_id
    LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
    LEFT JOIN alissonerp.vale_troca vt ON vt.id = pv.vale_troca_id
    LEFT JOIN alissonerp.devolucoes_venda d ON d.id = vt.devolucao_id
    LEFT JOIN alissonerp.vendas_erp dv ON dv.id = d.venda_id
    WHERE pv.status = 'confirmado'
      AND (${cid}::int IS NULL OR v.vendedor_id = ${cid}::int)
      AND v.vendedor_id IS NOT NULL
      AND pv.data_confirmacao >= ${de}::date
      AND pv.data_confirmacao < ${ate}::date + interval '1 day'
      AND pv.id NOT IN (
        SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
        WHERE status NOT IN ('estornado', 'cancelado') AND pagamento_venda_id IS NOT NULL
      )
    ORDER BY 3
  `;

  const baixas = await sql<Array<{
    consultora_id: number; consultora_nome: string | null;
    data: string; competencia: string; valor: string;
  }>>`
    SELECT f.consultora_id, ve.nome AS consultora_nome,
           f.paid_at::date::text AS data, f.competencia, f.valor_total::text AS valor
    FROM alissonerp.fechamentos_comissao f
    LEFT JOIN public.vendedores ve ON ve.id_vendedor = f.consultora_id
    WHERE f.status = 'pago' AND f.paid_at IS NOT NULL
      AND (${cid}::int IS NULL OR f.consultora_id = ${cid}::int)
      AND f.paid_at::date >= ${de}::date AND f.paid_at::date <= ${ate}::date
    ORDER BY 3
  `;

  const linhas: LinhaExtrato[] = [];

  for (const g of gravados) {
    const valor = Number(g.valor);
    const balde = baldeDoItem(g.tipo_item, g.devolucao_id, g.forma, valor);
    linhas.push({
      // Number() em TODAS as fontes: a chave do agrupamento tem que ser do mesmo
      // tipo, senao a mesma vendedora vira duas linhas. Ver o cast ::int acima.
      consultora_id: Number(g.consultora_id),
      consultora_nome: g.consultora_nome,
      data: g.data,
      balde,
      descricao: g.devolucao_id
        ? `${g.forma ?? "Devolução"}${g.pedido ? ` · pedido ${g.pedido}` : ""}`
        : `${g.cliente ?? "—"}${g.pedido ? ` · pedido ${g.pedido}` : ""}${g.forma ? ` · ${g.forma.toLowerCase()}` : ""}`,
      pedido: g.pedido,
      venda_id: g.venda_id,
      valor_pago: g.valor_pagamento ? Number(g.valor_pagamento) : null,
      base_comissao: g.valor_venda ? Number(g.valor_venda) : null,
      valor,
      previsto: false,
    });
  }

  for (const p of previstos) {
    const ehVale = p.forma === "Vale-Troca";
    linhas.push({
      consultora_id: Number(p.consultora_id),
      consultora_nome: p.consultora_nome,
      data: p.data,
      balde: ehVale ? "outro_credito" : "comissao",
      descricao: ehVale
        ? `Vale ${p.vale_numero ?? "—"}${p.vale_pedido_origem ? ` do pedido ${p.vale_pedido_origem}` : ""} usado no pedido ${p.pedido}`
        : `${p.cliente ?? "—"} · pedido ${p.pedido} · ${p.forma.toLowerCase()}`,
      pedido: p.pedido,
      venda_id: p.venda_id,
      valor_pago: Number(p.valor_pagamento),
      base_comissao: Number(p.total_venda),
      valor: Number(p.valor),
      previsto: true,
    });
  }

  for (const b of baixas) {
    linhas.push({
      consultora_id: Number(b.consultora_id),
      consultora_nome: b.consultora_nome,
      data: b.data,
      balde: "pagamento",
      descricao: `Pagamento da comissão de ${b.competencia}`,
      pedido: null,
      venda_id: null,
      valor_pago: null,
      base_comissao: null,
      valor: -Number(b.valor),
      previsto: false,
    });
  }

  return linhas.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * Saldo acumulado ANTES da data — o "saldo anterior" da tela.
 *
 * ⚠️ Só baixa do saldo o que estiver num fechamento marcado `pago`. Fechamento
 * em rascunho que já foi pago por fora NÃO baixa — o saldo anterior fica
 * inflado até alguém marcar. (Em 03/08/2026 havia R$23.980,57 nessa situação:
 * 6 fechamentos de mai/jun em rascunho, nenhum marcado pago.)
 */
export async function saldoAnterior(
  consultoraId: number | null,
  de: string,
): Promise<Map<number, number>> {
  const cid = consultoraId ?? null;

  const rows = await sql<Array<{ consultora_id: number; saldo: string }>>`
    WITH lancado AS (
      SELECT fi.consultora_id, COALESCE(SUM(fi.comissao_calculada), 0) AS v
      FROM alissonerp.fechamento_comissao_itens fi
      WHERE fi.status NOT IN ('estornado', 'cancelado')
        AND (${cid}::int IS NULL OR fi.consultora_id = ${cid}::int)
        AND COALESCE(fi.data_recebimento, fi.created_at::date) < ${de}::date
      GROUP BY 1
    ),
    naolancado AS (
      -- ::int: vendedor_id e bigint; sem o cast o UNION com consultora_id (int)
      -- vira bigint e volta como string, quebrando a chave do Map.
      SELECT v.vendedor_id::int AS consultora_id,
             COALESCE(SUM(ROUND(v.total_comissao * LEAST(pv.valor / NULLIF(v.total_venda, 0), 1), 2)), 0) AS v
      FROM alissonerp.pagamentos_venda pv
      JOIN alissonerp.vendas_erp v ON v.id = pv.venda_id
        AND v.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
      WHERE pv.status = 'confirmado' AND pv.comissionavel IS TRUE
        AND v.vendedor_id IS NOT NULL
        AND (${cid}::int IS NULL OR v.vendedor_id = ${cid}::int)
        AND pv.data_confirmacao < ${de}::date
        AND pv.id NOT IN (
          SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
          WHERE status NOT IN ('estornado', 'cancelado') AND pagamento_venda_id IS NOT NULL
        )
      GROUP BY 1
    ),
    pago AS (
      SELECT f.consultora_id, COALESCE(SUM(f.valor_total), 0) AS v
      FROM alissonerp.fechamentos_comissao f
      WHERE f.status = 'pago' AND f.paid_at IS NOT NULL
        AND (${cid}::int IS NULL OR f.consultora_id = ${cid}::int)
        AND f.paid_at::date < ${de}::date
      GROUP BY 1
    )
    SELECT c AS consultora_id,
           ROUND(COALESCE(l.v, 0) + COALESCE(n.v, 0) - COALESCE(p.v, 0), 2)::text AS saldo
    FROM (
      SELECT consultora_id AS c FROM lancado
      UNION SELECT consultora_id FROM naolancado
      UNION SELECT consultora_id FROM pago
    ) t
    LEFT JOIN lancado    l ON l.consultora_id = t.c
    LEFT JOIN naolancado n ON n.consultora_id = t.c
    LEFT JOIN pago       p ON p.consultora_id = t.c
  `;

  return new Map(rows.map((r) => [Number(r.consultora_id), Number(r.saldo)]));
}

/**
 * Comissões PENDENTES: crediário ainda não pago. Fora do saldo — aparece só
 * como previsão, com a parte já vencida separada.
 */
export async function comissoesPendentes(
  consultoraId: number | null,
): Promise<Map<number, { total: number; atrasado: number; parcelas: number }>> {
  const cid = consultoraId ?? null;

  const rows = await sql<Array<{
    consultora_id: number; parcelas: string; total: string; atrasado: string;
  }>>`
    SELECT v.vendedor_id::int AS consultora_id,
           COUNT(*)::text AS parcelas,
           ROUND(SUM(v.total_comissao * LEAST(cr.valor / NULLIF(v.total_venda, 0), 1)), 2)::text AS total,
           ROUND(SUM(CASE WHEN cr.data_vencimento < CURRENT_DATE
                     THEN v.total_comissao * LEAST(cr.valor / NULLIF(v.total_venda, 0), 1)
                     ELSE 0 END), 2)::text AS atrasado
    FROM alissonerp.contas_receber cr
    JOIN alissonerp.vendas_erp v ON v.id = cr.venda_erp_id
      AND v.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
    WHERE cr.data_recebimento IS NULL AND cr.situacao = 'pendente'
      AND v.vendedor_id IS NOT NULL
      AND (${cid}::int IS NULL OR v.vendedor_id = ${cid}::int)
    GROUP BY 1
  `;

  return new Map(rows.map((r) => [
    Number(r.consultora_id),
    { total: Number(r.total ?? 0), atrasado: Number(r.atrasado ?? 0), parcelas: Number(r.parcelas) },
  ]));
}

/** Soma as linhas de um balde. */
export function somaBalde(linhas: LinhaExtrato[], balde: BaldeExtrato): number {
  return Math.round(
    linhas.filter((l) => l.balde === balde).reduce((s, l) => s + l.valor, 0) * 100,
  ) / 100;
}
