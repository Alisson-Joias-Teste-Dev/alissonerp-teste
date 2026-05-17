/**
 * GET  /api/precificacao/curva/categorias — lista categorias
 * POST /api/precificacao/curva/categorias — cria nova categoria
 *
 * Permissoes:
 *   - GET: isPrecificacaoAccess
 *   - POST: isFullAccess
 */

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { normalizeCategoriaRow } from "@/lib/curva-precificacao";

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

  const body = await req.json();
  const { nome, max_weight, variation, comm_variation, max_discount, ativo, ordem } = body as Record<string, unknown>;

  if (!nome || max_weight == null) {
    return NextResponse.json({ error: "nome e max_weight são obrigatórios" }, { status: 400 });
  }
  if (Number(max_weight) <= 0) {
    return NextResponse.json({ error: "max_weight deve ser positivo" }, { status: 400 });
  }
  if (max_discount != null && (Number(max_discount) < 0 || Number(max_discount) > 100)) {
    return NextResponse.json({ error: "max_discount deve estar entre 0 e 100" }, { status: 400 });
  }

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
    console.error("[POST /api/precificacao/curva/categorias]", err);
    const msg = err instanceof Error ? err.message : "Erro ao criar categoria";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
