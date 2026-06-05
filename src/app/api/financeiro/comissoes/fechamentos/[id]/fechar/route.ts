import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// POST /api/financeiro/comissoes/fechamentos/[id]/fechar
//
// REGRA DE NEGÓCIO: aprova o fechamento e trava os valores.
// O que: muda status de 'rascunho' para 'fechado' e registra quem aprovou.
// Por que: impede edição de valores depois de aprovado.
// Impacto se alterado: risco de comissão ser recalculada depois de aprovada.

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

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

    const [atual] = await sql`
      SELECT status FROM alissonerp.fechamentos_comissao WHERE id = ${id}::uuid
    `;
    if (!atual) return NextResponse.json({ error: "Fechamento não encontrado" }, { status: 404 });
    if (atual.status !== "rascunho") {
      return NextResponse.json({ error: "Apenas fechamentos em rascunho podem ser fechados" }, { status: 409 });
    }

    await sql`
      UPDATE alissonerp.fechamentos_comissao SET
        status = 'fechado',
        approved_by = ${user.id}::uuid,
        approved_at = now()
      WHERE id = ${id}::uuid
    `;

    // Atualiza status dos itens
    await sql`
      UPDATE alissonerp.fechamento_comissao_itens SET
        status = 'fechado'
      WHERE fechamento_id = ${id}::uuid AND status = 'liberado'
    `;

    await logAudit(sql, {
      tabela: "fechamentos_comissao",
      operacao: "UPDATE",
      registro_id: id,
      usuario_id: user.id,
      dados_depois: { status: "fechado" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError("[POST /api/financeiro/comissoes/fechamentos/[id]/fechar]", err);
  }
}
