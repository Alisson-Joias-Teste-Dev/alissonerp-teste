import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// PATCH /api/aprovacao/[aprovacaoId] — aprovar consultora
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ aprovacaoId: string }> }
) {
  const { aprovacaoId } = await params;
  const id = parseInt(aprovacaoId);
  const { etapas } = await req.json() as { etapas: string };

  const rows = await sql`
    UPDATE alissonerp.aprovacoes_consultora
    SET etapas = ${etapas}
    WHERE id = ${id}
    RETURNING id, etapas
  `;

  if (rows.length === 0) {
    return NextResponse.json({ error: "Aprovação não encontrada" }, { status: 404 });
  }
  return NextResponse.json(rows[0]);
}
