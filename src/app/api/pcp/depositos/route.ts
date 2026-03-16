import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/pcp/depositos
export async function GET() {
  const rows = await sql`
    SELECT id, nome, tipo
    FROM alissonerp.depositos
    WHERE ativo = true
    ORDER BY id
  `;
  return NextResponse.json(rows);
}
