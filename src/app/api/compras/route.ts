import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// POST /api/compras
// Body: { fornecedor_id?: number, obs?: string, created_by?: string }
export async function POST(req: NextRequest) {
  const { fornecedor_id, obs, created_by } = await req.json() as {
    fornecedor_id?: number | null;
    obs?: string | null;
    created_by?: string | null;
  };

  const [row] = await sql`
    INSERT INTO alissonerp.compras (situacao, fornecedor_id, obs, created_by)
    VALUES ('pendente', ${fornecedor_id ?? null}, ${obs ?? null}, ${created_by ?? null}::uuid)
    RETURNING id, situacao, total, obs, bloqueado, created_at
  `;

  return NextResponse.json(row);
}
