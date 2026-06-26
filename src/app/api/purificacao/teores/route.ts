import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { requireAuth, AuthError } from "@/lib/auth-server";

// GET /api/purificacao/teores — listar todos os teores de ouro configurados
export async function GET(req: NextRequest) {
  try {
    await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

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
