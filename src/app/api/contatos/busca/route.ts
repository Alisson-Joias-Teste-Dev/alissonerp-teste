// ═══════════════════════════════════════════════════════════════════════════
// Busca de contatos para autocomplete
//
// REGRA DE NEGÓCIO: Busca em public.contatos por nome ou CPF/CNPJ.
// Usado pelo ClienteSelector para selecionar fornecedores e clientes.
// ═══════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 10, 50);

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const search = `%${q}%`;

  const rows = await sql`
    SELECT id_contato, nome, cpf_cnpj, telefone
    FROM public.contatos
    WHERE nome ILIKE ${search} OR cpf_cnpj ILIKE ${search}
    ORDER BY nome ASC
    LIMIT ${limit}
  `;

  return NextResponse.json(rows);
}
