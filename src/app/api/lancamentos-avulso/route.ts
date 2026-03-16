import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// POST /api/lancamentos-avulso
// Body: { tipo_lancamento, insumo_id, peso, deposito_id?, obs?, created_by? }
// Trigger trg_lancamento_avulso executa automaticamente ao INSERT.
export async function POST(req: NextRequest) {
  const { tipo_lancamento, insumo_id, deposito_id, peso, obs, created_by } =
    await req.json() as {
      tipo_lancamento: string;
      insumo_id: number;
      deposito_id?: number | null;
      peso: number;
      obs?: string | null;
      created_by?: string | null;
    };

  if (!tipo_lancamento || !insumo_id || !peso || peso <= 0) {
    return NextResponse.json(
      { error: "tipo_lancamento, insumo_id e peso são obrigatórios" },
      { status: 400 },
    );
  }

  const [row] = await sql`
    INSERT INTO alissonerp.lancamentos_avulso
      (tipo_lancamento, insumo_id, deposito_id, peso, obs, created_by)
    VALUES (
      ${tipo_lancamento}::alissonerp.enum_tipo_lancamento,
      ${insumo_id},
      ${deposito_id ?? null},
      ${peso},
      ${obs ?? null},
      ${created_by ?? null}
    )
    RETURNING id
  `;

  return NextResponse.json({ id: row.id });
}
