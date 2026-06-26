import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";

// GET /api/financeiro/comissoes/fechamentos/[id]
//
// REGRA DE NEGÓCIO: detalhe completo do fechamento + itens.
// O que: retorna o cabeçalho e todos os itens de pagamento do fechamento.
// Por que: permite auditoria completa de cada comissão paga.
// Impacto se alterado: perde rastreabilidade de comissão.

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const fechamentoId = id;

    const [fechamento] = await sql`
      SELECT fc.*, fc.id::text, fc.created_by::text, fc.approved_by::text,
             fc.created_at::text, fc.updated_at::text, fc.approved_at::text,
             fc.paid_at::text, fc.cancelled_at::text
      FROM alissonerp.fechamentos_comissao fc
      WHERE fc.id = ${fechamentoId}::uuid
    `;

    if (!fechamento) {
      return NextResponse.json({ error: "Fechamento não encontrado" }, { status: 404 });
    }

    const itens = await sql`
      SELECT fci.*, fci.id::text, fci.fechamento_id::text,
             fci.venda_id::text, fci.pagamento_venda_id::text,
             fci.estorno_de_item_id::text,
             fci.created_at::text, fci.updated_at::text
      FROM alissonerp.fechamento_comissao_itens fci
      WHERE fci.fechamento_id = ${fechamentoId}::uuid
      ORDER BY fci.data_recebimento DESC NULLS LAST, fci.created_at
    `;

    return NextResponse.json({
      ...fechamento,
      id: String(fechamento.id),
      created_by: String(fechamento.created_by),
      approved_by: fechamento.approved_by ? String(fechamento.approved_by) : null,
      valor_total: Number(fechamento.valor_total),
      created_at: String(fechamento.created_at),
      updated_at: String(fechamento.updated_at),
      approved_at: fechamento.approved_at ? String(fechamento.approved_at) : null,
      paid_at: fechamento.paid_at ? String(fechamento.paid_at) : null,
      cancelled_at: fechamento.cancelled_at ? String(fechamento.cancelled_at) : null,
      qtd_itens: itens.length,
      itens: itens.map((i) => ({
        ...i,
        id: String(i.id),
        fechamento_id: String(i.fechamento_id),
        venda_id: String(i.venda_id),
        pagamento_venda_id: i.pagamento_venda_id ? String(i.pagamento_venda_id) : null,
        estorno_de_item_id: i.estorno_de_item_id ? String(i.estorno_de_item_id) : null,
        valor_venda: Number(i.valor_venda),
        valor_pagamento: Number(i.valor_pagamento),
        valor_comissionavel: Number(i.valor_comissionavel),
        percentual_rateio: Number(i.percentual_rateio),
        comissao_total_venda: Number(i.comissao_total_venda),
        comissao_calculada: Number(i.comissao_calculada),
        created_at: String(i.created_at),
        updated_at: String(i.updated_at),
      })),
    });
  } catch (err) {
    return internalError("[GET /api/financeiro/comissoes/fechamentos/[id]]", err);
  }
}
