import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { SITUACOES_VENDA_ATIVAS } from "@/lib/vendas-situacoes";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// GET /api/financeiro/comissoes/fechamentos
// POST /api/financeiro/comissoes/fechamentos
//
// REGRA DE NEGÓCIO: lista e cria fechamentos de comissão.
// O que: GET retorna todos os fechamentos. POST cria um novo fechamento
// em rascunho com os pagamentos elegíveis da consultora no período.
// Por que: separa a criação (rascunho) da aprovação (fechar).
// Impacto se alterado: risco de criar fechamento duplicado ou sem rastreio.

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const fechamentos = await sql`
      SELECT
        fc.*,
        fc.id::text,
        fc.created_by::text,
        fc.approved_by::text,
        fc.created_at::text,
        fc.updated_at::text,
        fc.approved_at::text,
        fc.paid_at::text,
        fc.cancelled_at::text,
        (SELECT COUNT(*)::int FROM alissonerp.fechamento_comissao_itens fci WHERE fci.fechamento_id = fc.id) AS qtd_itens
      FROM alissonerp.fechamentos_comissao fc
      ORDER BY fc.created_at DESC
      LIMIT 100
    `;

    return NextResponse.json(fechamentos.map(normalizarFechamento));
  } catch (err) {
    return internalError("[GET /api/financeiro/comissoes/fechamentos]", err);
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const consultoraId = Number(body.consultora_id);
    const periodoInicio = String(body.periodo_inicio);
    const periodoFim = String(body.periodo_fim);
    const competencia = String(body.competencia);

    if (!consultoraId || !periodoInicio || !periodoFim || !competencia) {
      return NextResponse.json({ error: "consultora_id, periodo_inicio, periodo_fim e competencia obrigatórios" }, { status: 400 });
    }

    // Busca nome da consultora
    const [vendedor] = await sql`
      SELECT nome FROM alissonerp.vw_dash_vendedores WHERE id_vendedor = ${consultoraId}
    `;
    const nomeConsultora = vendedor?.nome ?? "Consultora";

    // Busca pagamentos elegíveis no período e calcula comissão proporcional
    const elegiveis = await sql<Array<{
      venda_id: number;
      numero_venda: string;
      pagamento_venda_id: number;
      data_venda: string;
      data_recebimento: Date;
      forma_recebimento: string;
      valor_pagamento: string;
      total_venda: string;
      total_comissao: string;
      percentual_rateio: string;
      comissao_calculada: string;
      cliente_nome: string | null;
    }>>`
      SELECT
        ve.id AS venda_id,
        ve.numero_venda,
        pv.id AS pagamento_venda_id,
        ve.data_venda::text,
        pv.data_confirmacao::date AS data_recebimento,
        pv.forma AS forma_recebimento,
        pv.valor::text AS valor_pagamento,
        ve.total_venda::text,
        ve.total_comissao::text,
        ROUND(pv.valor / NULLIF(ve.total_venda, 0), 6)::text AS percentual_rateio,
        ROUND(ve.total_comissao * pv.valor / NULLIF(ve.total_venda, 0), 2)::text AS comissao_calculada,
        c.nome AS cliente_nome
      FROM alissonerp.pagamentos_venda pv
      JOIN alissonerp.vendas_erp ve ON ve.id = pv.venda_id
        AND ve.situacao = ANY(${SITUACOES_VENDA_ATIVAS})
      LEFT JOIN public.contatos c ON c.id_contato = ve.cliente_id
      WHERE pv.status = 'confirmado'
        -- REGRA DE NEGÓCIO: A Receber (crediário) comissiona quando CONFIRMADO (pago);
        -- só Vale-Troca nunca comissiona (não é dinheiro novo). Ver comercial.md §2.
        AND pv.forma <> 'Vale-Troca'
        AND ve.vendedor_id = ${consultoraId}
        AND pv.data_confirmacao >= ${periodoInicio}::date
        AND pv.data_confirmacao <= ${periodoFim}::date
        AND pv.id NOT IN (
          SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
          WHERE status NOT IN ('estornado', 'cancelado')
            AND pagamento_venda_id IS NOT NULL
        )
    `;

    if (elegiveis.length === 0) {
      return NextResponse.json({ error: "Nenhum pagamento elegível no período para esta consultora" }, { status: 400 });
    }

    // Calcula valor total
    const valorTotal = elegiveis.reduce((s, e) => s + Number(e.comissao_calculada), 0);

    // Cria fechamento + itens em transação
    const [fechamento] = await sql`
      INSERT INTO alissonerp.fechamentos_comissao
        (consultora_id, consultora_nome_snapshot, periodo_inicio, periodo_fim, competencia, valor_total, status, created_by)
      VALUES (
        ${consultoraId}, ${nomeConsultora}, ${periodoInicio}::date, ${periodoFim}::date,
        ${competencia}, ${valorTotal}, 'rascunho', ${user.id}::uuid
      )
      RETURNING id
    `;

    for (const e of elegiveis) {
      await sql`
        INSERT INTO alissonerp.fechamento_comissao_itens
          (fechamento_id, venda_id, numero_venda_snapshot, pagamento_venda_id,
           consultora_id, cliente_nome_snapshot, data_venda, data_recebimento, forma_recebimento,
           valor_venda, valor_pagamento, valor_comissionavel, percentual_rateio,
           comissao_total_venda, comissao_calculada, status, tipo_item)
        VALUES (
          ${fechamento.id}, ${e.venda_id}, ${e.numero_venda}, ${e.pagamento_venda_id},
          ${consultoraId}, ${e.cliente_nome}, ${e.data_venda}::date, ${e.data_recebimento}::date, ${e.forma_recebimento},
          ${Number(e.total_venda)}, ${Number(e.valor_pagamento)}, ${Number(e.valor_pagamento)},
          ${Number(e.percentual_rateio)}, ${Number(e.total_comissao)},
          ${Number(e.comissao_calculada)}, 'liberado', 'normal'
        )
      `;
    }

    await logAudit(sql, {
      tabela: "fechamentos_comissao",
      operacao: "INSERT",
      registro_id: fechamento.id,
      usuario_id: user.id,
      dados_depois: { consultora_id: consultoraId, valor_total: valorTotal, qtd_itens: elegiveis.length },
    });

    return NextResponse.json({ id: fechamento.id, valor_total: valorTotal, qtd_itens: elegiveis.length }, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/financeiro/comissoes/fechamentos]", err);
  }
}

function normalizarFechamento(f: Record<string, unknown>) {
  return {
    ...f,
    id: String(f.id),
    created_by: String(f.created_by),
    approved_by: f.approved_by ? String(f.approved_by) : null,
    valor_total: Number(f.valor_total),
    qtd_itens: Number(f.qtd_itens ?? 0),
    created_at: String(f.created_at),
    updated_at: String(f.updated_at),
    approved_at: f.approved_at ? String(f.approved_at) : null,
    paid_at: f.paid_at ? String(f.paid_at) : null,
    cancelled_at: f.cancelled_at ? String(f.cancelled_at) : null,
  };
}
