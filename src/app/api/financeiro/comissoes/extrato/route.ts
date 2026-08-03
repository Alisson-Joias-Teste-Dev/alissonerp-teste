import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { SITUACOES_VENDA_ATIVAS } from "@/lib/vendas-situacoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";

/**
 * GET /api/financeiro/comissoes/extrato?consultora_id=4&de=2026-07-01&ate=2026-08-31
 *
 * O QUÊ
 *   O extrato de comissão da consultora, no formato de extrato bancário: cada
 *   fato é uma linha datada, agrupada por mês, com saldo que ROLA de um mês
 *   pro outro. Mais um bloco "a receber" (crediário ainda não pago) FORA do saldo.
 *
 * O PORQUÊ (regra de negócio — Jonathan, 03/08/2026)
 *   O relatório antigo é um retrato por fechamento: some o histórico e não há
 *   saldo contínuo. O extrato mostra tudo que aconteceu no mês e nos seguintes.
 *   O que firma a comissão é o PAGAMENTO — por isso o crediário não pago aparece
 *   como previsão, mas não entra no saldo.
 *
 * De onde vem cada linha:
 *   a) lançamentos gravados  → fechamento_comissao_itens (créditos de venda já
 *      fechados + débitos de devolução, migration 363)
 *   b) pagamentos ainda não fechados → calculados na hora, marcados `previsto`.
 *      Não são gravados: o fechamento do mês é que grava. Aparecem para o mês
 *      corrente não ficar vazio até alguém gerar o fechamento.
 *   c) baixas → fechamentos com status 'pago' viram débito na data do pagamento
 *
 * O IMPACTO SE ALTERADO
 *   (a) e (b) NÃO podem se sobrepor: a busca de (b) exclui todo pagamento que já
 *   esteja em algum item não cancelado. Sem esse filtro o mesmo real aparece duas
 *   vezes e o saldo mente.
 */

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export interface LancamentoExtrato {
  data: string;
  descricao: string;
  referencia: string | null;
  tipo: "comissao" | "vale" | "devolucao" | "ajuste" | "pagamento" | "sem_comissao";
  valor: number;
  previsto: boolean;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [perfil] = await sql<Array<{ role: string }>>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid
  `;
  if (!perfil || (!isFullAccess(perfil.role) && !ROLES_FINANCEIRO.includes(perfil.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const consultoraId = Number(sp.get("consultora_id"));
  const de = sp.get("de");
  const ate = sp.get("ate");

  if (!consultoraId || !de || !ate) {
    return NextResponse.json({ error: "consultora_id, de e ate obrigatórios" }, { status: 400 });
  }

  try {
    const [cons] = await sql<Array<{ nome: string }>>`
      SELECT nome FROM public.vendedores WHERE id_vendedor = ${consultoraId}
    `;

    // (a) Lançamentos já gravados no livro-razão.
    const gravados = await sql<Array<{
      data: string; descricao: string; referencia: string | null;
      tipo_item: string; valor: string; forma: string | null;
    }>>`
      SELECT
        COALESCE(fi.data_recebimento, fi.created_at::date)::text AS data,
        CASE
          WHEN fi.devolucao_id IS NOT NULL THEN COALESCE(fi.forma_recebimento, 'Devolução')
          WHEN fi.tipo_item = 'normal' THEN 'Venda ' || COALESCE(fi.numero_venda_snapshot, '')
          ELSE COALESCE(fi.forma_recebimento, 'Ajuste')
        END AS descricao,
        fi.numero_venda_snapshot AS referencia,
        fi.tipo_item,
        fi.comissao_calculada::text AS valor,
        fi.forma_recebimento AS forma
      FROM alissonerp.fechamento_comissao_itens fi
      WHERE fi.consultora_id = ${consultoraId}
        AND fi.status NOT IN ('estornado', 'cancelado')
        AND COALESCE(fi.data_recebimento, fi.created_at::date) >= ${de}::date
        AND COALESCE(fi.data_recebimento, fi.created_at::date) <= ${ate}::date
      ORDER BY 1
    `;

    // (b) Pagamentos confirmados que AINDA não estão em nenhum fechamento.
    // Mesmo cálculo do motor de fechamento — LEAST(...,1) trava o rateio em 100%.
    const previstos = await sql<Array<{
      data: string; numero_venda: string; forma: string;
      valor_pagamento: string; comissao: string; comissionavel: boolean;
    }>>`
      SELECT
        pv.data_confirmacao::date::text AS data,
        ve.numero_venda,
        pv.forma,
        pv.valor::text AS valor_pagamento,
        CASE WHEN pv.comissionavel
             THEN ROUND(ve.total_comissao * LEAST(pv.valor / NULLIF(ve.total_venda, 0), 1), 2)
             ELSE 0 END::text AS comissao,
        pv.comissionavel
      FROM alissonerp.pagamentos_venda pv
      JOIN alissonerp.vendas_erp ve ON ve.id = pv.venda_id
        AND ve.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
      WHERE pv.status = 'confirmado'
        AND ve.vendedor_id = ${consultoraId}
        AND pv.data_confirmacao >= ${de}::date
        AND pv.data_confirmacao < ${ate}::date + interval '1 day'
        AND pv.id NOT IN (
          SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
          WHERE status NOT IN ('estornado', 'cancelado') AND pagamento_venda_id IS NOT NULL
        )
      ORDER BY 1
    `;

    // (c) Baixas: o que a empresa já pagou à consultora.
    const baixas = await sql<Array<{ data: string; competencia: string; valor: string }>>`
      SELECT f.paid_at::date::text AS data, f.competencia, f.valor_total::text AS valor
      FROM alissonerp.fechamentos_comissao f
      WHERE f.consultora_id = ${consultoraId}
        AND f.status = 'pago' AND f.paid_at IS NOT NULL
        AND f.paid_at::date >= ${de}::date AND f.paid_at::date <= ${ate}::date
      ORDER BY 1
    `;

    // Saldo anterior: tudo que já foi lançado ANTES do início do período.
    const [ant] = await sql<Array<{ saldo: string }>>`
      SELECT COALESCE(SUM(fi.comissao_calculada), 0)::text AS saldo
      FROM alissonerp.fechamento_comissao_itens fi
      WHERE fi.consultora_id = ${consultoraId}
        AND fi.status NOT IN ('estornado', 'cancelado')
        AND COALESCE(fi.data_recebimento, fi.created_at::date) < ${de}::date
    `;
    const [antPago] = await sql<Array<{ pago: string }>>`
      SELECT COALESCE(SUM(f.valor_total), 0)::text AS pago
      FROM alissonerp.fechamentos_comissao f
      WHERE f.consultora_id = ${consultoraId} AND f.status = 'pago'
        AND f.paid_at IS NOT NULL AND f.paid_at::date < ${de}::date
    `;

    // Bloco "a receber": crediário em aberto. FORA do saldo — só firma quando pago.
    const aReceber = await sql<Array<{
      venc_mes: string | null; parcelas: string; valor_parcelas: string;
      comissao_prevista: string; atrasado: boolean;
    }>>`
      SELECT
        to_char(cr.data_vencimento, 'YYYY-MM') AS venc_mes,
        COUNT(*)::text AS parcelas,
        ROUND(SUM(cr.valor), 2)::text AS valor_parcelas,
        ROUND(SUM(ve.total_comissao * LEAST(cr.valor / NULLIF(ve.total_venda, 0), 1)), 2)::text AS comissao_prevista,
        (cr.data_vencimento < CURRENT_DATE) AS atrasado
      FROM alissonerp.contas_receber cr
      JOIN alissonerp.vendas_erp ve ON ve.id = cr.venda_erp_id
        AND ve.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
      WHERE ve.vendedor_id = ${consultoraId}
        AND cr.data_recebimento IS NULL
        AND cr.situacao = 'pendente'
      GROUP BY to_char(cr.data_vencimento, 'YYYY-MM'), (cr.data_vencimento < CURRENT_DATE)
      ORDER BY 1
    `;

    // Monta as linhas e agrupa por mês.
    const linhas: LancamentoExtrato[] = [
      ...gravados.map((g) => ({
        data: g.data,
        descricao: g.descricao,
        referencia: g.referencia,
        tipo: (g.tipo_item === "estorno"
          ? "devolucao"
          : g.tipo_item === "nao_comissionavel"
            ? "sem_comissao"
            : g.tipo_item === "normal"
              ? (g.forma === "Vale-Troca" ? "vale" : "comissao")
              : "ajuste") as LancamentoExtrato["tipo"],
        valor: Number(g.valor),
        previsto: false,
      })),
      ...previstos.map((p) => ({
        data: p.data,
        descricao: `Venda ${p.numero_venda} · ${p.forma.toLowerCase()} R$ ${Number(p.valor_pagamento).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        referencia: p.numero_venda,
        tipo: (p.forma === "Vale-Troca" ? "vale" : p.comissionavel ? "comissao" : "sem_comissao") as LancamentoExtrato["tipo"],
        valor: Number(p.comissao),
        previsto: true,
      })),
      ...baixas.map((b) => ({
        data: b.data,
        descricao: `Pagamento da comissão de ${b.competencia}`,
        referencia: b.competencia,
        tipo: "pagamento" as const,
        valor: -Number(b.valor),
        previsto: false,
      })),
    ].sort((a, b) => a.data.localeCompare(b.data));

    let saldo = Math.round((Number(ant.saldo) - Number(antPago.pago)) * 100) / 100;
    const saldoInicial = saldo;

    const mesesMap = new Map<string, { competencia: string; saldo_anterior: number; lancamentos: LancamentoExtrato[]; saldo: number }>();
    for (const l of linhas) {
      const comp = l.data.slice(0, 7);
      if (!mesesMap.has(comp)) {
        mesesMap.set(comp, { competencia: comp, saldo_anterior: saldo, lancamentos: [], saldo: saldo });
      }
      const m = mesesMap.get(comp)!;
      m.lancamentos.push(l);
      saldo = Math.round((saldo + l.valor) * 100) / 100;
      m.saldo = saldo;
    }

    return NextResponse.json({
      consultora: { id: consultoraId, nome: cons?.nome ?? null },
      saldo_inicial: saldoInicial,
      saldo_atual: saldo,
      meses: Array.from(mesesMap.values()),
      a_receber: aReceber.map((r) => ({
        mes: r.venc_mes,
        parcelas: Number(r.parcelas),
        valor_parcelas: Number(r.valor_parcelas),
        comissao_prevista: Number(r.comissao_prevista ?? 0),
        atrasado: r.atrasado,
      })),
    });
  } catch (err) {
    return internalError("[GET /api/financeiro/comissoes/extrato]", err);
  }
}
