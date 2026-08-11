import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { resolverEscopoComissao } from "@/lib/comissao-permissao";

// POST /api/financeiro/comissoes/ajustes
//
// REGRA DE NEGÓCIO: lançamento manual no extrato de comissão (crédito ou débito).
// O que: insere um lançamento avulso, datado na competência que o usuário
// escolher — o fechamento daquele mês adota depois.
// Por que: acerto que não vem de venda nem de devolução (erro de cálculo,
// combinado, desconto de peça perdida) precisa entrar no extrato com motivo.
// Impacto se alterado: ajuste sem rastreio ou no mês errado.

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const escopo = await resolverEscopoComissao(user.id);
  // Lançar exige escrita. A consultora vê o extrato, mas não lança na própria
  // comissão.
  if (!escopo?.podePagar) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const body = await req.json();
    const consultoraId = Number(body.consultora_id);
    const valor = Number(body.valor);
    const justificativa = String(body.justificativa ?? "").trim();
    const tipoItem = String(body.tipo_item ?? "ajuste_positivo");
    // competencia (AAAA-MM): O MÊS A QUE O LANÇAMENTO SE REFERE.
    //
    // ANTES o código carimbava `hoje` — o lançamento caía no mês em que a pessoa
    // clicou, não no mês do fato. Foi o que jogou os R$199,17 da venda 15323
    // (acerto de MAIO) para julho, aparecendo como crédito novo num mês em que
    // ele já tinha sido pago. Sem este campo o erro se repete a cada acerto.
    const competencia = String(body.competencia ?? "").trim();
    const vendaId = body.venda_id != null && Number(body.venda_id) > 0 ? Number(body.venda_id) : null;

    if (!consultoraId || !valor || valor <= 0 || !justificativa) {
      return NextResponse.json({ error: "consultora_id, valor (>0) e justificativa obrigatórios" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(competencia)) {
      return NextResponse.json({ error: "competencia (AAAA-MM) obrigatória — o mês a que o lançamento se refere" }, { status: 400 });
    }

    if (!["ajuste_positivo", "ajuste_negativo", "estorno"].includes(tipoItem)) {
      return NextResponse.json({ error: "tipo_item deve ser ajuste_positivo, ajuste_negativo ou estorno" }, { status: 400 });
    }

    // O lançamento é datado no ÚLTIMO DIA da competência escolhida. Não usa
    // `hoje`: o extrato agrupa por data, então a data é o que define em qual mês
    // a linha aparece.
    const [ano, mes] = competencia.split("-").map(Number);
    const dataLancamento = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

    const valorFinal = tipoItem === "ajuste_negativo" || tipoItem === "estorno" ? -valor : valor;

    // Contexto da venda, quando o acerto se refere a uma.
    const [venda] = vendaId
      ? await sql<Array<{ numero_venda: string; cliente: string | null }>>`
          SELECT v.numero_venda, c.nome AS cliente
          FROM alissonerp.vendas_erp v
          LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
          WHERE v.id = ${vendaId}
        `
      : [undefined];

    // Nasce SOLTO (fechamento_id nulo), como o débito de devolução. Quem recolhe
    // é o pagamento da competência (adotarLancamentosSoltos). Antes o ajuste
    // criava/rea­proveitava um fechamento do mês corrente por conta própria — foi
    // assim que um acerto de maio foi parar dentro do fechamento de junho.
    const [item] = await sql`
      INSERT INTO alissonerp.fechamento_comissao_itens
        (fechamento_id, consultora_id, venda_id, numero_venda_snapshot, cliente_nome_snapshot,
         data_venda, data_recebimento, forma_recebimento,
         valor_pagamento, valor_comissionavel, comissao_calculada, status, tipo_item)
      VALUES (
        NULL, ${consultoraId}, ${vendaId}, ${venda?.numero_venda ?? null}, ${venda?.cliente ?? null},
        ${dataLancamento}::date, ${dataLancamento}::date, ${"Lançamento manual — " + justificativa},
        ${valor}, ${valor}, ${valorFinal}, 'liberado', ${tipoItem}
      )
      RETURNING id
    `;

    await logAudit(sql, {
      tabela: "fechamento_comissao_itens",
      operacao: "INSERT",
      registro_id: item.id,
      usuario_id: user.id,
      dados_depois: {
        tipo_item: tipoItem, valor: valorFinal, justificativa,
        consultora_id: consultoraId, competencia, data: dataLancamento,
        venda_id: vendaId,
      },
    });

    return NextResponse.json({
      id: item.id, competencia, data: dataLancamento, valor: valorFinal,
    }, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/financeiro/comissoes/ajustes]", err);
  }
}
