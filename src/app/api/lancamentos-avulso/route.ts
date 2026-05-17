import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { requireAuth, AuthError } from "@/lib/auth-server";

// POST /api/lancamentos-avulso
// Body: { tipo_lancamento, insumo_id, peso, deposito_id?, deposito_destino_id?, obs?, local_estoque_id? }
// Trigger trg_lancamento_avulso executa automaticamente ao INSERT.
// `created_by` vem da sessão autenticada — NUNCA do body (rastreabilidade de ouro).
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    throw e;
  }

  const { tipo_lancamento, insumo_id, deposito_id, deposito_destino_id, peso, obs, local_estoque_id } =
    await req.json() as {
      tipo_lancamento: string;
      insumo_id: number;
      deposito_id?: number | null;
      deposito_destino_id?: number | null;
      peso: number;
      obs?: string | null;
      local_estoque_id?: number | null;
    };

  const localEstoqueDefault = await getParametroNumber(PARAM.LOCAL_ESTOQUE_DEFAULT_ID);

  if (!tipo_lancamento || !insumo_id || !peso || peso <= 0) {
    return NextResponse.json(
      { error: "tipo_lancamento, insumo_id e peso são obrigatórios" },
      { status: 400 },
    );
  }

  if (tipo_lancamento === "transferencia" && deposito_id && deposito_destino_id &&
      Number(deposito_id) === Number(deposito_destino_id)) {
    return NextResponse.json({ error: "Origem e destino não podem ser iguais" }, { status: 400 });
  }

  const [row] = await sql`
    INSERT INTO alissonerp.lancamentos_avulso
      (tipo_lancamento, insumo_id, deposito_id, deposito_destino_id, peso, obs, created_by, local_estoque_id)
    VALUES (
      ${tipo_lancamento}::alissonerp.enum_tipo_lancamento,
      ${insumo_id},
      ${deposito_id ?? null},
      ${deposito_destino_id ?? null},
      ${peso},
      ${obs ?? null},
      ${user.id}::uuid,
      ${local_estoque_id ?? localEstoqueDefault}
    )
    RETURNING id
  `;

  return NextResponse.json({ id: row.id });
}
