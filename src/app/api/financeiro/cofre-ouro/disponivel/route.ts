import { NextResponse } from "next/server";
import sql, { normalizeRow } from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";

export async function GET() {
  try {
    await requireAuth();
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    throw e;
  }

  const rows = await sql`SELECT * FROM alissonerp.vw_cofre_ouro_disponivel`;
  if (rows.length === 0) {
    return NextResponse.json({
      total_transacoes: 0, total_gramas: 0, disponivel_gramas: 0,
      total_valor_brl: 0, preco_medio_grama: 0,
    });
  }
  // REGRA DE NEGOCIO: colunas numeric da view (total_gramas, disponivel_gramas,
  // total_valor_brl, preco_medio_grama) voltam como STRING pelo driver postgres.
  // O front (CofreClient.tsx) chama .toFixed() direto nesses campos — sem
  // normalizar aqui a tela quebra com "toFixed is not a function".
  return NextResponse.json(
    normalizeRow(rows[0] as Record<string, unknown>, [
      "total_transacoes",
      "total_gramas",
      "disponivel_gramas",
      "total_valor_brl",
      "preco_medio_grama",
    ]),
  );
}
