import { NextResponse } from "next/server";
import sql from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/usuarios/transportadores
// Lista usuários habilitados como transportadores (is_transportador = true)
export async function GET() {
  const rows = await sql`
    SELECT id, nome, role
    FROM alissonerp.usuarios
    WHERE is_transportador = true AND ativo = true
    ORDER BY nome
  `;
  return NextResponse.json(rows);
}
