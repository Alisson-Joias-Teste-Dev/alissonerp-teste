/**
 * GET  /api/precificacao/curva/categorias — lista categorias
 * POST /api/precificacao/curva/categorias — cria nova categoria
 *
 * Permissoes:
 *   - GET: isPrecificacaoAccess
 *   - POST: isFullAccess
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { normalizeCategoriaRow } from "@/lib/curva-precificacao";
import { internalError } from "@/lib/api-error";
import { zodError, PercentSchema } from "@/lib/schemas/common";

const CategoriaSchema = z.object({
  nome: z.string().min(1, "nome obrigatorio").max(200),
  max_weight: z.number().positive("max_weight deve ser positivo"),
  variation: z.number().optional(),
  comm_variation: z.number().optional(),
  max_discount: PercentSchema.optional(),
  ativo: z.boolean().optional(),
  ordem: z.number().int().optional(),
});

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  void user;

  try {
    const rows = await sql`
      SELECT id, nome, max_weight, variation, comm_variation, max_discount, ativo, ordem,
             created_at, updated_at
      FROM alissonerp.curva_categorias
      ORDER BY ordem ASC
    `;

    const categorias = (rows as unknown as Record<string, unknown>[]).map(normalizeCategoriaRow);
    return NextResponse.json({ categorias });
  } catch (err) {
    console.error("[GET /api/precificacao/curva/categorias]", err);
    return NextResponse.json({ error: "Erro ao buscar categorias" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = CategoriaSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { nome, max_weight, variation, comm_variation, max_discount, ativo, ordem } = parsed.data;

  try {
    // Se ordem nao foi informada, pega o max+1
    let ordemFinal: number;
    if (ordem != null) {
      ordemFinal = Number(ordem);
    } else {
      const [maxRow] = (await sql`
        SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM alissonerp.curva_categorias
      `) as unknown as Array<{ proxima: number }>;
      ordemFinal = Number(maxRow.proxima);
    }

    const [row] = await sql`
      INSERT INTO alissonerp.curva_categorias
        (nome, max_weight, variation, comm_variation, max_discount, ativo, ordem)
      VALUES (
        ${String(nome)},
        ${Number(max_weight)},
        ${variation != null ? Number(variation) : 0},
        ${comm_variation != null ? Number(comm_variation) : 0},
        ${max_discount != null ? Number(max_discount) : 0},
        ${ativo != null ? Boolean(ativo) : true},
        ${ordemFinal}
      )
      RETURNING *
    `;

    const categoria = normalizeCategoriaRow(row as unknown as Record<string, unknown>);
    return NextResponse.json({ categoria }, { status: 201 });
  } catch (err) {
    return internalError("[POST /api/precificacao/curva/categorias]", err, "Erro ao criar categoria");
  }
}
