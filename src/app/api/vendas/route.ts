import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/vendas?inicio=YYYY-MM-DD&fim=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fim    = searchParams.get("fim");

  if (!inicio || !fim) {
    return NextResponse.json({ error: "inicio e fim obrigatórios" }, { status: 400 });
  }

  const vendas = await sql`
    SELECT
      v.id,
      v.numero_pedido,
      v.data_venda,
      v.total_venda,
      v.total_produtos,
      v.total_itens_qnt,
      v.status,
      v.entregue,
      v.observacoes,
      v.cliente_nome,
      v.cliente_cpf,
      v.vendedor_nome,
      v.vendedor_id
    FROM alissonerp.vw_vendas_completa v
    WHERE v.data_venda >= ${inicio}::date
      AND v.data_venda <  (${fim}::date + INTERVAL '1 day')
    ORDER BY v.id DESC
    LIMIT 1000
  `;

  return NextResponse.json(vendas);
}
