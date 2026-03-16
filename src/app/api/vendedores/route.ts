import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/vendedores — lista vendedores para dropdown
export async function GET() {
  const rows = await sql`
    SELECT id_vendedor, nome
    FROM public.vendedores
    ORDER BY nome
  `;
  return NextResponse.json(rows);
}
