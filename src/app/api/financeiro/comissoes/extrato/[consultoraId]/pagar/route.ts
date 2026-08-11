import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { SITUACOES_VENDA_ATIVAS } from "@/lib/vendas-situacoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";
import { resolverEscopoComissao } from "@/lib/comissao-permissao";
import { adotarLancamentosSoltos } from "@/lib/comissao-lancamentos";

/**
 * POST   /api/financeiro/comissoes/extrato/[consultoraId]/pagar   → registra o pagamento
 * DELETE /api/financeiro/comissoes/extrato/[consultoraId]/pagar   → estorna o pagamento
 *
 * O QUÊ
 *   Registra, num clique, o pagamento da comissão de um mês: cria o fechamento
 *   da competência (se ainda não existe), recolhe os lançamentos soltos do
 *   período e marca como PAGO na data informada.
 *
 * O PORQUÊ (decisão do Jonathan, 03/08/2026)
 *   A tela de Fechamentos saiu do ar — o extrato virou a tela única. Antes eram
 *   4 passos (criar → fechar → gerar conta a pagar → pagar) numa tela que a
 *   vendedora não pode ver. Agora é uma ação só, dentro do extrato.
 *   NÃO gera conta a pagar: em produção nunca existiu uma (0 registros) e o
 *   registro é feito quando o Pix JÁ saiu.
 *
 * O IMPACTO SE ALTERADO
 *   O fechamento continua sendo o registro do pagamento — é dele que o extrato
 *   tira a linha de baixa, na COMPETÊNCIA. Se algum dia o pagamento deixar de
 *   gravar fechamento, o extrato para de mostrar a baixa e o saldo nunca desce.
 */

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ consultoraId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const escopo = await resolverEscopoComissao(user.id);
  // Pagar exige escrita no módulo. A consultora vê o próprio extrato, mas não
  // registra o próprio pagamento — nem o da colega.
  if (!escopo?.podePagar) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { consultoraId } = await ctx.params;
  const cid = Number(consultoraId);
  const body = await req.json().catch(() => ({}));
  const { competencia, data_pagamento, valor, descricao } = body ?? {};

  if (!cid || !competencia || !/^\d{4}-\d{2}$/.test(String(competencia))) {
    return NextResponse.json({ error: "consultoraId e competencia (AAAA-MM) obrigatórios" }, { status: 400 });
  }
  if (!data_pagamento || !/^\d{4}-\d{2}-\d{2}$/.test(String(data_pagamento))) {
    return NextResponse.json({ error: "data_pagamento (AAAA-MM-DD) obrigatória" }, { status: 400 });
  }

  const de = `${competencia}-01`;
  const [ano, mes] = String(competencia).split("-").map(Number);
  const ate = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

  try {
    const [jaPago] = await sql<Array<{ id: string }>>`
      SELECT id FROM alissonerp.fechamentos_comissao
      WHERE consultora_id = ${cid} AND competencia = ${competencia} AND status = 'pago'
      LIMIT 1
    `;
    if (jaPago) {
      return NextResponse.json({ error: "Esta competência já está paga. Estorne antes de registrar de novo." }, { status: 409 });
    }

    const [cons] = await sql<Array<{ nome: string }>>`
      SELECT nome FROM public.vendedores WHERE id_vendedor = ${cid}
    `;

    // Reusa o rascunho da competência quando já existe — dois fechamentos do
    // mesmo mês para a mesma consultora é o que gerava a confusão da tela antiga.
    let [fechamento] = await sql<Array<{ id: string }>>`
      SELECT id FROM alissonerp.fechamentos_comissao
      WHERE consultora_id = ${cid} AND competencia = ${competencia}
        AND status NOT IN ('pago', 'cancelado')
      ORDER BY created_at DESC LIMIT 1
    `;

    if (!fechamento) {
      [fechamento] = await sql<Array<{ id: string }>>`
        INSERT INTO alissonerp.fechamentos_comissao
          (consultora_id, consultora_nome_snapshot, periodo_inicio, periodo_fim,
           competencia, valor_total, status, created_by)
        VALUES (${cid}, ${cons?.nome ?? `#${cid}`}, ${de}::date, ${ate}::date,
                ${competencia}, 0, 'rascunho', ${user.id}::uuid)
        RETURNING id
      `;
    }

    // Itens dos pagamentos do período que ainda não estão em nenhum fechamento.
    // Mesma consulta do motor antigo — inclusive o `< fim + 1 dia`, que existe
    // porque `<= fim` perde tudo que foi confirmado no próprio último dia.
    await sql`
      INSERT INTO alissonerp.fechamento_comissao_itens
        (fechamento_id, venda_id, numero_venda_snapshot, pagamento_venda_id, consultora_id,
         cliente_nome_snapshot, data_venda, data_recebimento, forma_recebimento,
         valor_venda, valor_pagamento, valor_comissionavel, percentual_rateio,
         comissao_total_venda, comissao_calculada, status, tipo_item)
      SELECT ${fechamento.id}::uuid, v.id, v.numero_venda, pv.id, ${cid},
             c.nome, v.data_venda, pv.data_confirmacao::date, pv.forma,
             v.total_venda, pv.valor, pv.valor,
             LEAST(ROUND(pv.valor / NULLIF(v.total_venda, 0), 6), 1),
             v.total_comissao,
             CASE WHEN pv.comissionavel
                  THEN ROUND(v.total_comissao * LEAST(pv.valor / NULLIF(v.total_venda, 0), 1), 2)
                  ELSE 0 END,
             'liberado',
             CASE WHEN pv.comissionavel THEN 'normal' ELSE 'nao_comissionavel' END
      FROM alissonerp.vendas_erp v
      JOIN alissonerp.pagamentos_venda pv ON pv.venda_id = v.id AND pv.status = 'confirmado'
      LEFT JOIN public.contatos c ON c.id_contato = v.cliente_id
      WHERE v.vendedor_id = ${cid}
        AND v.status = ANY(${SITUACOES_VENDA_ATIVAS})
        AND pv.data_confirmacao >= ${de}::date
        AND pv.data_confirmacao < ${ate}::date + interval '1 day'
        AND pv.id NOT IN (
          SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
          WHERE status NOT IN ('estornado', 'cancelado') AND pagamento_venda_id IS NOT NULL
        )
    `;

    // Recolhe os lançamentos soltos do período (débitos de devolução, ajustes).
    await adotarLancamentosSoltos(fechamento.id, cid, de, ate);

    const [tot] = await sql<Array<{ total: string; itens: string }>>`
      SELECT COALESCE(ROUND(SUM(comissao_calculada), 2), 0)::text AS total,
             COUNT(*)::text AS itens
      FROM alissonerp.fechamento_comissao_itens
      WHERE fechamento_id = ${fechamento.id}::uuid AND status NOT IN ('estornado', 'cancelado')
    `;

    // O valor pago pode ser diferente do apurado (acerto combinado, arredondamento
    // para cima). Grava o que SAIU — o extrato tem que refletir o Pix, não a teoria.
    const valorPago = valor != null && Number(valor) > 0
      ? Math.round(Number(valor) * 100) / 100
      : Number(tot.total);

    await sql`
      UPDATE alissonerp.fechamentos_comissao
      SET valor_total = ${valorPago},
          status      = 'pago',
          paid_at     = ${data_pagamento}::date,
          approved_at = COALESCE(approved_at, now()),
          approved_by = COALESCE(approved_by, ${user.id}::uuid),
          updated_at  = now()
      WHERE id = ${fechamento.id}::uuid
    `;

    await sql`
      UPDATE alissonerp.fechamento_comissao_itens
      SET status = 'pago', updated_at = now()
      WHERE fechamento_id = ${fechamento.id}::uuid AND status NOT IN ('estornado', 'cancelado')
    `;

    await logAudit(sql, {
      tabela: "fechamentos_comissao",
      operacao: "UPDATE",
      registro_id: fechamento.id,
      usuario_id: user.id,
      dados_depois: {
        motivo: "pagamento_registrado_pelo_extrato",
        consultora_id: cid, competencia, data_pagamento,
        valor_apurado: Number(tot.total), valor_pago: valorPago,
        qtd_itens: Number(tot.itens), descricao: descricao ?? null,
      },
    });

    return NextResponse.json({
      id: fechamento.id, competencia, valor_pago: valorPago,
      valor_apurado: Number(tot.total), qtd_itens: Number(tot.itens),
    }, { status: 201 });
  } catch (err) {
    return internalError("[POST comissoes/extrato/[id]/pagar]", err);
  }
}

/**
 * Estorna o pagamento de uma competência.
 *
 * O QUÊ: o fechamento volta para `rascunho`, os itens voltam para `liberado` e
 * a data de pagamento é apagada — a baixa some do extrato e o saldo sobe de volta.
 *
 * O PORQUÊ: sem a tela de Fechamentos, um pagamento registrado errado ficaria
 * sem como desfazer. NÃO apaga item nenhum: o que foi apurado continua lá.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ consultoraId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const escopo = await resolverEscopoComissao(user.id);
  if (!escopo?.podePagar) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { consultoraId } = await ctx.params;
  const cid = Number(consultoraId);
  const competencia = req.nextUrl.searchParams.get("competencia");
  const motivo = req.nextUrl.searchParams.get("motivo");

  if (!cid || !competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ error: "consultoraId e competencia (AAAA-MM) obrigatórios" }, { status: 400 });
  }
  if (!motivo || motivo.trim().length < 5) {
    return NextResponse.json({ error: "motivo do estorno é obrigatório" }, { status: 400 });
  }

  try {
    const [fech] = await sql<Array<{ id: string; valor_total: string; paid_at: string | null }>>`
      SELECT id, valor_total::text, paid_at::text FROM alissonerp.fechamentos_comissao
      WHERE consultora_id = ${cid} AND competencia = ${competencia} AND status = 'pago'
      LIMIT 1
    `;
    if (!fech) return NextResponse.json({ error: "Não há pagamento registrado nesta competência" }, { status: 404 });

    await sql`
      UPDATE alissonerp.fechamentos_comissao
      SET status = 'rascunho', paid_at = NULL, updated_at = now()
      WHERE id = ${fech.id}::uuid
    `;
    await sql`
      UPDATE alissonerp.fechamento_comissao_itens
      SET status = 'liberado', updated_at = now()
      WHERE fechamento_id = ${fech.id}::uuid AND status = 'pago'
    `;

    await logAudit(sql, {
      tabela: "fechamentos_comissao",
      operacao: "UPDATE",
      registro_id: fech.id,
      usuario_id: user.id,
      dados_antes: { status: "pago", paid_at: fech.paid_at, valor_total: Number(fech.valor_total) },
      dados_depois: { status: "rascunho", motivo_estorno: motivo },
    });

    return NextResponse.json({ ok: true, id: fech.id });
  } catch (err) {
    return internalError("[DELETE comissoes/extrato/[id]/pagar]", err);
  }
}
