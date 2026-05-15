import sql from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ordemId: string }> }
) {
  const { ordemId } = await params;
  const id = parseInt(ordemId);
  if (isNaN(id)) return NextResponse.json(null);

  try {
    const rows = await sql`
      SELECT * FROM alissonerp.vw_fichas_tecnicas
      WHERE ordem_id = ${id}
      LIMIT 1
    `;

    return NextResponse.json(rows[0] ?? null);
  } catch (err) {
    console.error("[/api/ficha] Erro ao buscar ficha técnica:", err);
    return NextResponse.json({ error: "Erro ao buscar ficha técnica" }, { status: 500 });
  }
}
