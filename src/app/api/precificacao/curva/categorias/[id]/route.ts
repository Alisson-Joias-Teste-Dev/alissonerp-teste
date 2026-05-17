/**
 * PATCH  /api/precificacao/curva/categorias/[id] — atualiza categoria
 * DELETE /api/precificacao/curva/categorias/[id] — soft delete (ativo=false)
 *
 * Permissoes: isFullAccess
 */

import { NextRequest, NextResponse } from "next/server";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { normalizeCategoriaRow } from "@/lib/curva-precificacao";

async function authorize(req?: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return { error: errRes, user: null };
  if (!isFullAccess(user.role)) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }), user: null };
  }
  return { error: null, user };
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await authorize(req);
  if (error) return error;

  const { id } = await ctx.params;
  const catId = Number(id);
  if (!catId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  const body = await req.json();
  const { nome, max_weight, variation, comm_variation, max_discount, ativo, ordem } = body as Record<string, unknown>;

  if (max_weight !== undefined && Number(max_weight) <= 0) {
    return NextResponse.json({ error: "max_weight deve ser positivo" }, { status: 400 });
  }
  if (max_discount !== undefined && (Number(max_discount) < 0 || Number(max_discount) > 100)) {
    return NextResponse.json({ error: "max_discount deve estar entre 0 e 100" }, { status: 400 });
  }

  try {
    const [row] = await sql`
      UPDATE alissonerp.curva_categorias SET
        nome           = COALESCE(${nome != null ? String(nome) : null}, nome),
        max_weight     = COALESCE(${max_weight != null ? Number(max_weight) : null}, max_weight),
        variation      = COALESCE(${variation != null ? Number(variation) : null}, variation),
        comm_variation = COALESCE(${comm_variation != null ? Number(comm_variation) : null}, comm_variation),
        max_discount   = COALESCE(${max_discount != null ? Number(max_discount) : null}, max_discount),
        ativo          = COALESCE(${ativo != null ? Boolean(ativo) : null}, ativo),
        ordem          = COALESCE(${ordem != null ? Number(ordem) : null}, ordem)
      WHERE id = ${catId}
      RETURNING *
    `;

    if (!row) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });

    const categoria = normalizeCategoriaRow(row as unknown as Record<string, unknown>);
    return NextResponse.json({ categoria });
  } catch (err) {
    console.error("[PATCH /api/precificacao/curva/categorias/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro ao atualizar categoria";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await authorize(req);
  if (error) return error;

  const { id } = await ctx.params;
  const catId = Number(id);
  if (!catId) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const [row] = await sql`
      UPDATE alissonerp.curva_categorias
      SET ativo = false
      WHERE id = ${catId}
      RETURNING id
    `;
    if (!row) return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/precificacao/curva/categorias/[id]]", err);
    return NextResponse.json({ error: "Erro ao desativar categoria" }, { status: 500 });
  }
}
