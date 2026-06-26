import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import { LIMITS, checkStringLength, payloadTooLargeResponse } from "@/lib/payload-limits";
import { zodError } from "@/lib/schemas/common";

const InsumoPostSchema = z.object({
  nome: z.string().min(1, "obrigatório"),
  sku: z.string().optional(),
  categoria_id: z.coerce.number().int().positive(),
  unidade: z.string().optional(),
  descricao: z.string().optional(),
  estoque_minimo: z.coerce.number().optional(),
  estoque_maximo: z.coerce.number().optional(),
  custo_compra: z.coerce.number().optional(),
  peso_pedra: z.coerce.number().nullable().optional(),
  peso_pedra_ct: z.coerce.number().nullable().optional(),
}).passthrough();

// GET /api/insumos?categoria_id=1
export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  const categoria_id = req.nextUrl.searchParams.get("categoria_id");

  const rows = categoria_id
    ? await sql`SELECT * FROM alissonerp.vw_detalhe_pote WHERE categoria_id = ${parseInt(categoria_id)} ORDER BY insumo_nome`
    : await sql`SELECT * FROM alissonerp.vw_detalhe_pote ORDER BY categoria_nome, insumo_nome`;

  return NextResponse.json(rows);
}

// POST /api/insumos (somente full access)
export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = InsumoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { nome, sku, categoria_id, unidade, descricao, estoque_minimo, estoque_maximo, custo_compra, peso_pedra, peso_pedra_ct } = parsed.data;

  try {
    checkStringLength("nome", nome, LIMITS.NOME_MAX);
    checkStringLength("sku", sku, LIMITS.NOME_MAX);
    checkStringLength("descricao", descricao, LIMITS.DESCRICAO_LONGA_MAX);
  } catch (e) {
    const r = payloadTooLargeResponse(e);
    if (r) return r;
    throw e;
  }

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
