/**
 * GET   /api/precificacao/markup-pedras — listar faixas de markup por tamanho de pedra
 * PATCH /api/precificacao/markup-pedras — atualizar markup de uma faixa (por ID)
 * POST  /api/precificacao/markup-pedras — criar nova faixa
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";

async function authorize() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado", status: 401, user: null };

  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) return { error: "Sem permissão", status: 403, user: null };

  return { error: null, status: 200, user };
}

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role)) {
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
  const { error, status, user } = await authorize();
  if (error) return NextResponse.json({ error }, { status });

  const body = await req.json();
  const { id, nome, tamanho_min, tamanho_max, markup, ativo } = body;

  if (!id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

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
  const { error, status, user } = await authorize();
  if (error) return NextResponse.json({ error }, { status });

  const body = await req.json();
  const { nome, tamanho_min, tamanho_max, unidade, markup } = body;

  if (!nome || tamanho_min == null || tamanho_max == null || markup == null) {
    return NextResponse.json(
      { error: "nome, tamanho_min, tamanho_max e markup são obrigatórios" },
      { status: 400 }
    );
  }
  if (Number(tamanho_max) <= Number(tamanho_min)) {
    return NextResponse.json({ error: "tamanho_max deve ser maior que tamanho_min" }, { status: 400 });
  }
  if (Number(markup) <= 0) {
    return NextResponse.json({ error: "markup deve ser positivo" }, { status: 400 });
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
