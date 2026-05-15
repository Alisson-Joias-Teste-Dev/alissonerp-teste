import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/compras/fornecedores
// Retorna lista de contatos (fornecedores) para o select da Nova Compra.
export async function GET() {
  const rows = await sql`
    SELECT id_contato, nome
    FROM public.contatos
    WHERE nome IS NOT NULL
    ORDER BY nome
    LIMIT 500
  `;
  return NextResponse.json(rows);
}
