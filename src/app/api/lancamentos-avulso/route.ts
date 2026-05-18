import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { getParametroNumber, PARAM } from "@/lib/parametros";
import { requireAuth, AuthError } from "@/lib/auth-server";
import { zodError } from "@/lib/schemas/common";

const LancamentoPostSchema = z.object({
  tipo_lancamento: z.string().min(1, "obrigatório"),
  insumo_id: z.coerce.number().int().positive(),
  deposito_id: z.coerce.number().int().nullable().optional(),
  deposito_destino_id: z.coerce.number().int().nullable().optional(),
  peso: z.coerce.number().positive(),
  obs: z.string().nullable().optional(),
  local_estoque_id: z.coerce.number().int().nullable().optional(),
}).passthrough();

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

  const raw = await req.json().catch(() => ({}));
  const parsed = LancamentoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { tipo_lancamento, insumo_id, deposito_id, deposito_destino_id, peso, obs, local_estoque_id } = parsed.data;

  const localEstoqueDefault = await getParametroNumber(PARAM.LOCAL_ESTOQUE_DEFAULT_ID);

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
