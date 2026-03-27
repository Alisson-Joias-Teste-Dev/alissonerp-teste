import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/insumos?categoria_id=1
export async function GET(req: NextRequest) {
  const categoria_id = req.nextUrl.searchParams.get("categoria_id");

  const rows = categoria_id
    ? await sql`SELECT * FROM alissonerp.vw_detalhe_pote WHERE categoria_id = ${parseInt(categoria_id)} ORDER BY insumo_nome`
    : await sql`SELECT * FROM alissonerp.vw_detalhe_pote ORDER BY categoria_nome, insumo_nome`;

  return NextResponse.json(rows);
}

// POST /api/insumos
export async function POST(req: NextRequest) {
  const { nome, sku, categoria_id, unidade, descricao, estoque_minimo, estoque_maximo, custo_compra, peso_pedra, peso_pedra_ct } =
    await req.json() as {
      nome: string;
      sku?: string;
      categoria_id: number;
      unidade?: string;
      descricao?: string;
      estoque_minimo?: number;
      estoque_maximo?: number;
      custo_compra?: number;
      peso_pedra?: number | null;
      peso_pedra_ct?: number | null;
    };

  if (!nome || !categoria_id) {
    return NextResponse.json({ error: "Nome e categoria são obrigatórios" }, { status: 400 });
  }

  const rows = await sql`
    INSERT INTO alissonerp.insumos
      (nome, sku, categoria_id, unidade, descricao, estoque_minimo, estoque_maximo, custo_compra, peso_pedra, peso_pedra_ct, ativo)
    VALUES
      (${nome}, ${sku ?? null}, ${categoria_id}, ${unidade ?? "g"},
       ${descricao ?? null}, ${estoque_minimo ?? 0}, ${estoque_maximo ?? 0}, ${custo_compra ?? 0},
       ${peso_pedra ?? null}::real, ${peso_pedra_ct ?? null}::numeric, true)
    RETURNING id, nome, sku, categoria_id, unidade, peso_pedra, peso_pedra_ct
  `;
  return NextResponse.json(rows[0], { status: 201 });
}
