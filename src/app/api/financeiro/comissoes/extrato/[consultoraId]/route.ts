import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { resolverEscopoComissao, resolverConsultoraAlvo } from "@/lib/comissao-permissao";
import {
  linhasExtrato, saldoAnterior, comissoesPendentes, pendentesDetalhe, somaBalde,
} from "@/lib/comissao-extrato";
import { chaveResultado, resultadosMeta, ritmoMeta } from "@/lib/comissao-fator";

/**
 * GET /api/financeiro/comissoes/extrato/[consultoraId]?competencia=2026-07
 *
 * TELA 2 do extrato: o detalhe de uma consultora no mês, com as linhas de cada
 * balde (comissões do mês, débitos de devolução, outros créditos, outros
 * débitos, pagamentos efetuados) e o resumo que fecha o saldo.
 *
 * REGRA: o resumo é a soma dos baldes — não há cálculo fora das linhas. É isso
 * que permite conferir pedido a pedido. Ver comercial.md §2.1.
 */

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ consultoraId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const escopo = await resolverEscopoComissao(user.id);
  if (!escopo) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { consultoraId } = await ctx.params;
  const competencia = req.nextUrl.searchParams.get("competencia");

  // O id da URL é um PEDIDO, não uma ordem: quem não vê todas recebe sempre o
  // próprio id. Trocar o número na barra não abre a comissão da colega.
  const id = resolverConsultoraAlvo(escopo, Number(consultoraId) || null);

  if (!id || !competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "consultoraId e competencia (AAAA-MM) obrigatórios" }, { status: 400 });
  }

  const de = `${competencia}-01`;
  const [ano, mes] = competencia.split("-").map(Number);
  const ate = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

  try {
    const [linhas, saldos, pendentes, parcelas, cons, pagoRows] = await Promise.all([
      linhasExtrato(id, de, ate, true),
      saldoAnterior(id, de),
      comissoesPendentes(id),
      pendentesDetalhe(id),
      sql<Array<{ nome: string }>>`SELECT nome FROM public.vendedores WHERE id_vendedor = ${id}`,
      // A competência já foi paga? É o que decide se o menu oferece "realizar
      // pagamento" ou "estornar" — e o que impede pagar duas vezes o mesmo mês.
      sql<Array<{ paid_at: string | null; valor_total: string }>>`
        SELECT paid_at::date::text, valor_total::text FROM alissonerp.fechamentos_comissao
        WHERE consultora_id = ${id} AND competencia = ${competencia} AND status = 'pago'
        LIMIT 1
      `,
    ]);

    const ant = saldos.get(id) ?? 0;
    const comissao = somaBalde(linhas, "comissao");
    const devolucao = somaBalde(linhas, "devolucao");
    const outroCredito = somaBalde(linhas, "outro_credito");
    const outroDebito = somaBalde(linhas, "outro_debito");
    const pagamento = somaBalde(linhas, "pagamento");
    const pend = pendentes.get(id);

    const balde = (b: string) => linhas.filter((l) => l.balde === b);

    // Resultado da meta DO MÊS do extrato — é o cabeçalho que explica por que os
    // valores aparecem reduzidos e o que a consultora usa para saber quanto falta.
    const meta = (await resultadosMeta([competencia], [id])).get(chaveResultado(id, competencia));

    // RITMO: só faz sentido no mês em curso — em mês passado o resultado já é o
    // que é, e "faltam X por dia" viraria conselho para uma corrida encerrada.
    const mesCorrente = competencia === new Date().toISOString().slice(0, 7);
    const ritmo = mesCorrente && meta && !meta.sem_meta
      ? (await ritmoMeta(competencia, [id])).get(id) ?? null
      : null;

    // QUANTO ESTÁ EM JOGO: a diferença entre a comissão cheia do mês e a que está
    // saindo com o fator. É o número que faz a meta virar decisão — em ago/2026,
    // bater a meta valia R$ 1.418,77 a mais para a Débora.
    const comissaoBruta = linhas
      .filter((l) => l.balde === "comissao")
      .reduce((s, l) => s + l.comissao_bruta, 0);
    const emJogo = Math.round((comissaoBruta - somaBalde(linhas, "comissao")) * 100) / 100;

    return NextResponse.json({
      consultora: { id, nome: cons[0]?.nome ?? `#${id}` },
      competencia, de, ate,
      meta: meta
        ? {
            meta_valor: meta.meta_valor,
            realizado: meta.realizado,
            pct_atingido: meta.pct_atingido,
            fator: meta.fator,
            motivo: meta.motivo,
            congelado: meta.congelado,
            sem_meta: meta.sem_meta,
            falta: Math.max(0, Math.round((meta.meta_valor - meta.realizado) * 100) / 100),
            // Atrás (negativo) ou à frente (positivo) do que o mês já pedia.
            ritmo: ritmo
              ? {
                  meta_ate_agora: ritmo.meta_ate_agora,
                  diferenca: Math.round((meta.realizado - ritmo.meta_ate_agora) * 100) / 100,
                  meta_restante: Math.max(0, Math.round((meta.meta_valor - meta.realizado) * 100) / 100),
                  dias_restantes: ritmo.dias_restantes,
                  horas_restantes: ritmo.horas_restantes,
                  por_dia: ritmo.dias_restantes > 0
                    ? Math.round(Math.max(0, meta.meta_valor - meta.realizado) / ritmo.dias_restantes * 100) / 100
                    : 0,
                  por_hora: ritmo.horas_restantes > 0
                    ? Math.round(Math.max(0, meta.meta_valor - meta.realizado) / ritmo.horas_restantes * 100) / 100
                    : 0,
                }
              : null,
            comissao_cheia: Math.round(comissaoBruta * 100) / 100,
            em_jogo: emJogo,
          }
        : null,
      // A tela usa isto para mostrar ou não o menu "mais ações". É espelho do
      // que o servidor já decidiu — as rotas de ação checam de novo por conta
      // própria, esconder botão não é permissão.
      permissoes: { podePagar: escopo.podePagar, podeVerTodas: escopo.podeVerTodas },
      pago: pagoRows.length > 0,
      pagamento: pagoRows[0]
        ? { data: pagoRows[0].paid_at, valor: Number(pagoRows[0].valor_total) }
        : null,
      saldo_anterior: ant,
      baldes: {
        comissao: balde("comissao"),
        devolucao: balde("devolucao"),
        outro_credito: balde("outro_credito"),
        outro_debito: balde("outro_debito"),
        pagamento: balde("pagamento"),
      },
      resumo: {
        saldo_anterior: ant,
        comissoes_mes: comissao,
        debito_devolucoes: Math.abs(devolucao),
        outros_creditos: outroCredito,
        outros_debitos: Math.abs(outroDebito),
        pagamentos: Math.abs(pagamento),
        saldo: Math.round((ant + comissao + devolucao + outroCredito + outroDebito + pagamento) * 100) / 100,
      },
      pendentes: {
        total: pend?.total ?? 0,
        atrasado: pend?.atrasado ?? 0,
        parcelas: pend?.parcelas ?? 0,
        // itens: as parcelas por trás do total, para a tela abrir ao clicar.
        itens: parcelas,
      },
    });
  } catch (err) {
    return internalError("[GET /api/financeiro/comissoes/extrato/[consultoraId]]", err);
  }
}
