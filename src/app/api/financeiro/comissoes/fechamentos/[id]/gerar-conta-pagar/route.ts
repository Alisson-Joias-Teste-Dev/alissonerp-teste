import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// POST /api/financeiro/comissoes/fechamentos/[id]/gerar-conta-pagar
//
// REGRA DE NEGÓCIO: gera uma conta a pagar para o fechamento.
// O que: cria um registro em contas_pagar e vincula ao fechamento.
// Por que: integra com o fluxo financeiro existente (A Pagar).
// Impacto se alterado: comissão aprovada sem gerar pagamento.

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

    const [fechamento] = await sql`
      SELECT * FROM alissonerp.fechamentos_comissao WHERE id = ${id}::uuid
    `;
    if (!fechamento) return NextResponse.json({ error: "Fechamento não encontrado" }, { status: 404 });
    if (fechamento.status !== "fechado" && fechamento.status !== "enviado_financeiro") {
      return NextResponse.json({ error: "Fechamento precisa estar fechado para gerar conta a pagar" }, { status: 409 });
    }
    if (fechamento.conta_pagar_id) {
      return NextResponse.json({ error: "Fechamento já possui conta a pagar vinculada" }, { status: 409 });
    }

    const descricao = `Comissão ${fechamento.consultora_nome_snapshot} - ${fechamento.competencia}`;
    const hoje = new Date().toISOString().slice(0, 10);

    // Gera conta a pagar
    const [conta] = await sql`
      INSERT INTO alissonerp.contas_pagar
        (descricao, fornecedor_nome, valor, data_vencimento, categoria, created_by)
      VALUES (
        ${descricao},
        ${fechamento.consultora_nome_snapshot},
        ${Number(fechamento.valor_total)},
        ${hoje}::date,
        'comissao',
        ${user.id}::uuid
      )
      RETURNING id
    `;

    // Vincula ao fechamento
    await sql`
      UPDATE alissonerp.fechamentos_comissao SET
        status = 'enviado_financeiro',
        conta_pagar_id = ${conta.id}
      WHERE id = ${id}::uuid
    `;

    // Atualiza status dos itens
    await sql`
      UPDATE alissonerp.fechamento_comissao_itens SET
        status = 'pago'
      WHERE fechamento_id = ${id}::uuid AND status = 'fechado'
    `;

    await logAudit(sql, {
      tabela: "fechamentos_comissao",
      operacao: "UPDATE",
      registro_id: id,
      usuario_id: user.id,
      dados_depois: { status: "enviado_financeiro", conta_pagar_id: conta.id },
    });

    return NextResponse.json({ conta_pagar_id: conta.id });
  } catch (err) {
    return internalError("[POST /api/financeiro/comissoes/fechamentos/[id]/gerar-conta-pagar]", err);
  }
}
