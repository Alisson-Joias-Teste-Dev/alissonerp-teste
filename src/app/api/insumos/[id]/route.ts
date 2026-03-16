import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// PATCH /api/insumos/:id — atualiza campos do insumo
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const {
    nome, sku, categoria_id, unidade, descricao,
    estoque_minimo, estoque_maximo, custo_compra,
  } = await req.json() as {
    nome?: string;
    sku?: string;
    categoria_id?: number;
    unidade?: string;
    descricao?: string;
    estoque_minimo?: number;
    estoque_maximo?: number;
    custo_compra?: number;
  };

  const rows = await sql`
    UPDATE alissonerp.insumos SET
      nome           = COALESCE(${nome           ?? null}, nome),
      sku            = COALESCE(${sku            ?? null}, sku),
      categoria_id   = COALESCE(${categoria_id   ?? null}::int, categoria_id),
      unidade        = COALESCE(${unidade        ?? null}, unidade),
      descricao      = COALESCE(${descricao      ?? null}, descricao),
      estoque_minimo = COALESCE(${estoque_minimo ?? null}::numeric, estoque_minimo),
      estoque_maximo = COALESCE(${estoque_maximo ?? null}::numeric, estoque_maximo),
      custo_compra   = COALESCE(${custo_compra   ?? null}::numeric, custo_compra)
    WHERE id = ${id}
    RETURNING id, nome, sku, categoria_id, unidade, estoque_minimo, estoque_maximo, custo_compra
  `;

  if (!rows[0]) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

// DELETE /api/insumos/:id — desativa (soft delete)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  const id = parseInt(rawId);
  if (isNaN(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  if (id === 1) return NextResponse.json({ error: "Insumo protegido" }, { status: 403 });

  await sql`UPDATE alissonerp.insumos SET ativo = false WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
