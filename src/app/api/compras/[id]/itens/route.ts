import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

type Params = Promise<{ id: string }>;

// GET /api/compras/[id]/itens
export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const compraId = parseInt(id);

  const rows = await sql`
    SELECT id, insumo_id, deposito_id, qtd, valor_unitario, valor_total
    FROM alissonerp.itens_compra
    WHERE compra_id = ${compraId}
    ORDER BY id
  `;

  return NextResponse.json(rows);
}

// POST /api/compras/[id]/itens
// Body: { insumo_id, deposito_id?, qtd, valor_unitario? }
// Trigger trg_calcular_item_compra calcula valor_total automaticamente.
export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const compraId = parseInt(id);

  const { insumo_id, deposito_id, qtd, valor_unitario } = await req.json() as {
    insumo_id: number;
    deposito_id?: number | null;
    qtd: number;
    valor_unitario?: number | null;
  };

  if (!insumo_id || !qtd || qtd <= 0) {
    return NextResponse.json(
      { error: "insumo_id e qtd são obrigatórios" },
      { status: 400 },
    );
  }

  // Verificar se compra está bloqueada antes de inserir
  const [compra] = await sql`
    SELECT bloqueado, situacao FROM alissonerp.compras WHERE id = ${compraId} LIMIT 1
  `;
  if (!compra) return NextResponse.json({ error: "Compra não encontrada" }, { status: 404 });
  if (compra.bloqueado) return NextResponse.json({ error: "Compra bloqueada — não permite edição" }, { status: 409 });

  const [row] = await sql`
    INSERT INTO alissonerp.itens_compra
      (compra_id, insumo_id, deposito_id, qtd, valor_unitario)
    VALUES (
      ${compraId},
      ${insumo_id},
      ${deposito_id ?? 1},
      ${qtd},
      ${valor_unitario ?? null}
    )
    RETURNING id, insumo_id, deposito_id, qtd, valor_unitario, valor_total
  `;

  return NextResponse.json(row);
}
