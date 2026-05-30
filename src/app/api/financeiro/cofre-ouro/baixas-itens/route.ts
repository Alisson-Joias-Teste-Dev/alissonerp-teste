import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";

// GET /api/financeiro/cofre-ouro/baixas-itens?baixa_id=123
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const baixaIdRaw = req.nextUrl.searchParams.get("baixa_id");
  const baixaId = baixaIdRaw ? Number(baixaIdRaw) : null;

  if (baixaIdRaw && (!baixaId || Number.isNaN(baixaId))) {
    return NextResponse.json({ error: "baixa_id inválido" }, { status: 400 });
  }

  // REGRA DE NEGÓCIO: o histórico da baixa precisa mostrar snapshot dos itens
  // selecionados no momento da baixa para garantir auditoria estável.
  // IMPACTO: sem este endpoint, não há como abrir a baixa e ver suas linhas.
  const rows = baixaId
    ? await sql`
      SELECT
        id,
        baixa_id,
        origem_tipo,
        origem_id,
        referencia,
        pessoa_nome,
        data_origem,
        gramas,
        valor_brl,
        created_at
      FROM alissonerp.cofre_ouro_baixa_itens
      WHERE baixa_id = ${baixaId}
      ORDER BY created_at ASC, id ASC
    `
    : await sql`
      SELECT
        i.id,
        i.baixa_id,
        i.origem_tipo,
        i.origem_id,
        i.referencia,
        i.pessoa_nome,
        i.data_origem,
        i.gramas,
        i.valor_brl,
        i.created_at
      FROM alissonerp.cofre_ouro_baixa_itens i
      JOIN alissonerp.cofre_ouro_baixas b ON b.id = i.baixa_id
      WHERE b.status IN ('pendente', 'em_trafego', 'concluido')
      ORDER BY i.created_at DESC, i.id DESC
    `;

  return NextResponse.json(rows);
}
