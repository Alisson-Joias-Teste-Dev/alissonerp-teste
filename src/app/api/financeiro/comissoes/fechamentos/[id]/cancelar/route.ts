import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// POST /api/financeiro/comissoes/fechamentos/[id]/cancelar
//
// REGRA DE NEGÓCIO: cancela fechamento com justificativa.
// O que: muda status para 'cancelado' e libera os pagamentos
// para um novo fechamento.
// Por que: preserva o histórico de cancelamento sem apagar dados.
// Impacto se alterado: pagamentos podem ficar presos ou sem rastreio.

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "administrativo", "financeiro", "gerente_loja"];

export async function POST(
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
    const body = await req.json().catch(() => ({}));
    const motivo = String(body.motivo ?? "").trim();

    if (!motivo) {
      return NextResponse.json({ error: "Motivo do cancelamento é obrigatório" }, { status: 400 });
    }

    const [atual] = await sql`
      SELECT status, conta_pagar_id FROM alissonerp.fechamentos_comissao WHERE id = ${id}::uuid
    `;
    if (!atual) return NextResponse.json({ error: "Fechamento não encontrado" }, { status: 404 });
    if (atual.status === "cancelado") {
      return NextResponse.json({ error: "Fechamento já está cancelado" }, { status: 409 });
    }
    if (atual.status === "pago") {
      return NextResponse.json({ error: "Fechamento pago não pode ser cancelado. Crie um ajuste negativo." }, { status: 409 });
    }

    await sql`
      UPDATE alissonerp.fechamentos_comissao SET
        status = 'cancelado',
        cancelled_at = now(),
        cancel_reason = ${motivo}
      WHERE id = ${id}::uuid
    `;

    // Libera itens do fechamento para não bloquearem novos fechamentos
    await sql`
      UPDATE alissonerp.fechamento_comissao_itens SET
        status = 'cancelado'
      WHERE fechamento_id = ${id}::uuid AND status IN ('liberado', 'fechado')
    `;

    // Se tinha conta a pagar vinculada, desvincula sem cancelar a conta
    if (atual.conta_pagar_id) {
      await sql`
        UPDATE alissonerp.fechamentos_comissao SET
          conta_pagar_id = NULL
        WHERE id = ${id}::uuid
      `;
    }

    await logAudit(sql, {
      tabela: "fechamentos_comissao",
      operacao: "UPDATE",
      registro_id: id,
      usuario_id: user.id,
      dados_depois: { status: "cancelado", motivo },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/financeiro/comissoes/fechamentos/[id]/cancelar]", err);
  }
}
