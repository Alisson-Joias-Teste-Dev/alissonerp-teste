import { NextResponse } from "next/server";
import sql from "@/lib/db";

// GET /api/purificacao/teores — listar todos os teores de ouro configurados
export async function GET() {
  const rows = await sql`
    SELECT
      t.id,
      t.insumo_id,
      t.nome,
      t.teor,
      t.ativo,
      t.updated_at,
      i.sku,
      i.unidade
    FROM alissonerp.teores_ouro t
    JOIN alissonerp.insumos i ON i.id = t.insumo_id
    ORDER BY t.id
  `;

  return NextResponse.json(rows);
}
