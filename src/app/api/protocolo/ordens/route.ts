import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const direcao = req.nextUrl.searchParams.get("direcao") || "ida";

  if (direcao === "volta") {
    const rows = await sql`
      SELECT id, numero_ordem, status::text as status
      FROM alissonerp.vw_ordens_prontas_volta
      ORDER BY id DESC
    `;
    return NextResponse.json(rows);
  }

  const rows = await sql`
    SELECT id, numero_ordem, status::text as status
    FROM alissonerp.vw_ordens_prontas_ida
    ORDER BY id DESC
  `;

  return NextResponse.json(rows);
}
