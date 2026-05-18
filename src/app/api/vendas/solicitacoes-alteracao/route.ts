import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";

const ROLES_FINANCEIRO = ["admin", "desenvolvedor", "diretor"];

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;

  if (!ROLES_FINANCEIRO.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status") ?? "pendente";
  const STATUS_VALIDOS = new Set(["pendente", "aprovado", "rejeitado"]);
  const status = STATUS_VALIDOS.has(statusParam) ? statusParam : "pendente";

  const rows = await sql`
    SELECT
      s.id, s.tipo, s.venda_id, s.pagamento_id, s.campo,
      s.valor_atual, s.valor_solicitado, s.motivo,
      s.solicitado_por_id, s.solicitado_por_nome,
      s.status, s.decidido_por_id, s.decidido_por_nome,
      s.motivo_decisao, s.decidido_em, s.created_at,
      v.numero_venda,
      p.forma AS pagamento_forma,
      p.valor AS pagamento_valor
    FROM alissonerp.solicitacoes_alteracao s
    JOIN alissonerp.vendas_erp v ON v.id = s.venda_id
    LEFT JOIN alissonerp.pagamentos_venda p ON p.id = s.pagamento_id
    WHERE s.status = ${status}
    ORDER BY s.created_at DESC
    LIMIT 200
  `;

  return NextResponse.json(rows.map((r) => ({
    ...r,
    pagamento_valor: r.pagamento_valor != null ? Number(r.pagamento_valor) : null,
  })));
}
