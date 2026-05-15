import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";

// GET /api/financeiro/cofre-ouro/rastreios?baixa_id=123
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const baixaId = req.nextUrl.searchParams.get("baixa_id");
  const pagamentoId = req.nextUrl.searchParams.get("pagamento_id");

  if (baixaId) {
    // Rastreios da baixa + pagamento original
    const rows = await sql`
      SELECT r.*, pv.ouro_gramas AS pagamento_gramas, pv.forma
      FROM alissonerp.cofre_ouro_rastreios r
      LEFT JOIN alissonerp.pagamentos_venda pv ON pv.id = r.pagamento_id
      WHERE r.baixa_id = ${parseInt(baixaId)}::int OR
        r.pagamento_id IN (
          SELECT pagamento_id FROM alissonerp.cofre_ouro_rastreios WHERE baixa_id = ${parseInt(baixaId)}::int AND pagamento_id IS NOT NULL
        )
      ORDER BY r.created_at ASC
    `;
    return NextResponse.json(rows);
  }

  if (pagamentoId) {
    const rows = await sql`
      SELECT * FROM alissonerp.cofre_ouro_rastreios
      WHERE pagamento_id = ${parseInt(pagamentoId)}::int
      ORDER BY created_at ASC
    `;
    return NextResponse.json(rows);
  }

  const rows = await sql`
    SELECT * FROM alissonerp.cofre_ouro_rastreios
    ORDER BY created_at DESC
    LIMIT 200
  `;
  return NextResponse.json(rows);
}
