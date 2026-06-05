import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { internalError } from "@/lib/api-error";

// GET /api/financeiro/comissoes/resumo
//
// REGRA DE NEGÓCIO: cards do módulo de pagamento de comissões.
// O que: retorna os totais disponível (pagamentos confirmados não fechados),
// em rascunho, gerado (enviado ao financeiro) e pago.
// Por que: dar visibilidade do fluxo completo de pagamento de comissão.
// Impacto se alterado: usuário perde visão do pipeline de comissões.

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
    // Total disponível: pagamentos confirmados elegíveis, sem VT, sem A Receber, não fechados
    const [disponivel] = await sql`
      SELECT COALESCE(SUM(
        CASE WHEN pv.status = 'confirmado' AND pv.forma NOT IN ('Vale-Troca', 'A Receber')
          THEN ROUND(ve.total_comissao * pv.valor / NULLIF(ve.total_venda, 0), 2)
          ELSE 0
        END
      ), 0)::text AS valor
      FROM alissonerp.pagamentos_venda pv
      JOIN alissonerp.vendas_erp ve ON ve.id = pv.venda_id
        AND ve.situacao IN ('aprovado', 'enviado', 'entregue', 'concluido')
      WHERE pv.status = 'confirmado'
        AND pv.forma NOT IN ('Vale-Troca', 'A Receber')
        AND pv.id NOT IN (
          SELECT pagamento_venda_id FROM alissonerp.fechamento_comissao_itens
          WHERE status NOT IN ('estornado', 'cancelado')
            AND pagamento_venda_id IS NOT NULL
        )
    `;

    // Totais por status nos fechamentos
    const porStatus = await sql<Array<{ status: string; qtd: number; valor: string }>>`
      SELECT
        status,
        COUNT(*)::int AS qtd,
        COALESCE(SUM(valor_total), 0)::text AS valor
      FROM alissonerp.fechamentos_comissao
      GROUP BY status
    `;

    const mapStatus = new Map<string, { qtd: number; valor: number }>();
    for (const s of porStatus) {
      mapStatus.set(s.status, { qtd: s.qtd, valor: Number(s.valor) });
    }

    const resumo = {
      disponivel: Number(disponivel?.valor ?? 0),
      em_rascunho: mapStatus.get("rascunho")?.valor ?? 0,
      gerado: (mapStatus.get("fechado")?.valor ?? 0) + (mapStatus.get("enviado_financeiro")?.valor ?? 0),
      pago: mapStatus.get("pago")?.valor ?? 0,
      qtd_pendentes: (mapStatus.get("rascunho")?.qtd ?? 0) + (mapStatus.get("fechado")?.qtd ?? 0),
      qtd_rascunho: mapStatus.get("rascunho")?.qtd ?? 0,
      qtd_gerado: (mapStatus.get("fechado")?.qtd ?? 0) + (mapStatus.get("enviado_financeiro")?.qtd ?? 0),
      qtd_pago: mapStatus.get("pago")?.qtd ?? 0,
    };

    return NextResponse.json(resumo);
  } catch (err) {
    return internalError("[GET /api/financeiro/comissoes/resumo]", err);
  }
}
