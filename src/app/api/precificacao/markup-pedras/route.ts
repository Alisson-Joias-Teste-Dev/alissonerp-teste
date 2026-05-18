/**
 * GET   /api/precificacao/markup-pedras — listar faixas de markup por tamanho de pedra
 * PATCH /api/precificacao/markup-pedras — atualizar markup de uma faixa (por ID)
 * POST  /api/precificacao/markup-pedras — criar nova faixa
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authOr401 } from "@/lib/auth-server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

const MarkupPatchSchema = z.object({
  id: z.coerce.number().int().positive(),
  nome: z.string().optional(),
  tamanho_min: z.coerce.number().optional(),
  tamanho_max: z.coerce.number().optional(),
  markup: z.coerce.number().optional(),
  ativo: z.boolean().optional(),
}).passthrough();

const MarkupPostSchema = z.object({
  nome: z.string().min(1, "obrigatório"),
  tamanho_min: z.coerce.number(),
  tamanho_max: z.coerce.number(),
  unidade: z.string().optional(),
  markup: z.coerce.number().positive(),
}).passthrough();

async function authorize(req?: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return { error: errRes, user: null };
  if (!isFullAccess(user.role)) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }), user: null };
  }
  return { error: null, user };
}

export async function GET(req: NextRequest) {
  const [user, errRes] = await authOr401(req);
  if (errRes) return errRes;
  if (!isFullAccess(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    const faixas = await sql`
      SELECT id, nome, tamanho_min, tamanho_max, unidade, markup, ativo, created_at, updated_at
      FROM alissonerp.markup_pedras
      ORDER BY tamanho_min ASC
    `;
    return NextResponse.json({ faixas });
  } catch (err) {
    console.error("[GET /api/precificacao/markup-pedras]", err);
    return NextResponse.json({ error: "Erro ao buscar faixas de markup" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { error, user } = await authorize(req);
  if (error) return error;
  void user;

  const rawPatch = await req.json().catch(() => ({}));
  const parsedPatch = MarkupPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return zodError(parsedPatch.error);
  const { id, nome, tamanho_min, tamanho_max, markup, ativo } = parsedPatch.data;

  if (markup !== undefined && Number(markup) <= 0) {
    return NextResponse.json({ error: "markup deve ser positivo" }, { status: 400 });
  }
  if (tamanho_min !== undefined && tamanho_max !== undefined && Number(tamanho_max) <= Number(tamanho_min)) {
    return NextResponse.json({ error: "tamanho_max deve ser maior que tamanho_min" }, { status: 400 });
  }

  try {
    const [faixa] = await sql`
      UPDATE alissonerp.markup_pedras
      SET
        nome        = COALESCE(${nome ?? null}, nome),
        tamanho_min = COALESCE(${tamanho_min != null ? Number(tamanho_min) : null}, tamanho_min),
        tamanho_max = COALESCE(${tamanho_max != null ? Number(tamanho_max) : null}, tamanho_max),
        markup      = COALESCE(${markup != null ? Number(markup) : null}, markup),
        ativo       = COALESCE(${ativo ?? null}, ativo),
        updated_at  = NOW()
      WHERE id = ${Number(id)}
      RETURNING *
    `;

    if (!faixa) return NextResponse.json({ error: "Faixa não encontrada" }, { status: 404 });

    return NextResponse.json({ faixa });
  } catch (err) {
    console.error("[PATCH /api/precificacao/markup-pedras]", err);
    return NextResponse.json({ error: "Erro ao atualizar faixa" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { error, user } = await authorize(req);
  if (error) return error;

  const rawPost = await req.json().catch(() => ({}));
  const parsedPost = MarkupPostSchema.safeParse(rawPost);
  if (!parsedPost.success) return zodError(parsedPost.error);
  const { nome, tamanho_min, tamanho_max, unidade, markup } = parsedPost.data;

  if (Number(tamanho_max) <= Number(tamanho_min)) {
    return NextResponse.json({ error: "tamanho_max deve ser maior que tamanho_min" }, { status: 400 });
  }

  try {
    const [faixa] = await sql`
      INSERT INTO alissonerp.markup_pedras (nome, tamanho_min, tamanho_max, unidade, markup, created_by)
      VALUES (
        ${nome},
        ${Number(tamanho_min)},
        ${Number(tamanho_max)},
        ${unidade ?? "ct"},
        ${Number(markup)},
        ${user!.id}::uuid
      )
      RETURNING *
    `;
    return NextResponse.json({ faixa }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/precificacao/markup-pedras]", err);
    return NextResponse.json({ error: "Erro ao criar faixa" }, { status: 500 });
  }
}
