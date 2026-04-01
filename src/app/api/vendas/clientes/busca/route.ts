import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// ─── GET /api/vendas/clientes/busca?q=&limit= ─────────────────────────────────
// Busca clientes em public.contatos (READONLY)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q     = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(Number(searchParams.get("limit") ?? "20"), 50);

  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const clientes = await sql`
    SELECT
      id_contato AS id,
      nome,
      cpf_cnpj,
      email,
      telefone,
      celular
    FROM public.contatos
    WHERE
      nome     ILIKE ${'%' + q + '%'}
      OR cpf_cnpj ILIKE ${'%' + q + '%'}
      OR email    ILIKE ${'%' + q + '%'}
      OR telefone ILIKE ${'%' + q + '%'}
      OR celular  ILIKE ${'%' + q + '%'}
    ORDER BY nome
    LIMIT ${limit}
  `;

  return NextResponse.json(clientes);
}
