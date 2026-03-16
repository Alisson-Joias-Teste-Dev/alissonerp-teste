import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/protocolo/ordens?direcao=ida|volta
export async function GET(req: NextRequest) {
  const direcao = req.nextUrl.searchParams.get("direcao");

  if (direcao === "ida") {
    const rows = await sql`
      SELECT id, numero_ordem, status::text AS status
      FROM alissonerp.vw_ordens_prontas_ida
      ORDER BY id DESC
      LIMIT 200
    `;
    return NextResponse.json(rows);
  }

  if (direcao === "volta") {
    const rows = await sql`
      SELECT id, numero_ordem, status::text AS status
      FROM alissonerp.vw_ordens_prontas_volta
      ORDER BY id DESC
      LIMIT 200
    `;
    return NextResponse.json(rows);
  }

  return NextResponse.json({ error: "direcao deve ser 'ida' ou 'volta'" }, { status: 400 });
}
