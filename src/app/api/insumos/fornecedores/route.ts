import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/insumos/fornecedores?q=texto
// Retorna lista de contatos para autocomplete de fornecedores
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  const rows = q
    ? await sql`
        SELECT id_contato, nome
        FROM public.contatos
        WHERE nome IS NOT NULL
          AND nome ILIKE ${"%" + q + "%"}
        ORDER BY nome
        LIMIT 50
      `
    : await sql`
        SELECT id_contato, nome
        FROM public.contatos
        WHERE nome IS NOT NULL
        ORDER BY nome
        LIMIT 50
      `;

  return NextResponse.json(rows);
}
