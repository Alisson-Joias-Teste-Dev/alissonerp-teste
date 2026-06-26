/**
 * /api/gestao-estoque/user-views
 *
 * CRUD simples de filtros nomeados do usuario logado para o dashboard
 * "Inteligencia de Estoque" (scope = 'gestao-estoque').
 *
 *   GET    /api/gestao-estoque/user-views        -> lista vistas do usuario
 *   POST   /api/gestao-estoque/user-views        -> cria/upserta vista (body: { nome, filtros })
 *   DELETE /api/gestao-estoque/user-views?id=N   -> deleta vista (so se for do usuario)
 *
 * Persiste em alissonerp.user_views (migration 168).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { zodError } from "@/lib/schemas/common";

export const dynamic = "force-dynamic";

const SCOPE = "gestao-estoque";

const UserViewPostSchema = z.object({
  nome: z.string().min(1, "obrigatório").max(80),
  filtros: z.record(z.string(), z.unknown()),
}).passthrough();

type ViewRow = {
  id: number;
  nome: string;
  filtros: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const rows = await sql<ViewRow[]>`
      SELECT id, nome, filtros, created_at, updated_at
      FROM alissonerp.user_views
      WHERE user_auth_id = ${user.id} AND scope = ${SCOPE}
      ORDER BY updated_at DESC
    `;
    return NextResponse.json({ views: rows });
  } catch (err) {
    console.error("[GET user-views]", err);
    return NextResponse.json({ error: "Erro ao listar vistas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const raw = await req.json().catch(() => null);
  if (raw === null) return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  const parsed = UserViewPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const nome = body.nome.trim();
  const filtros = body.filtros;

  try {
    const [row] = await sql<ViewRow[]>`
      INSERT INTO alissonerp.user_views (user_auth_id, scope, nome, filtros)
      VALUES (${user.id}, ${SCOPE}, ${nome}, ${JSON.stringify(filtros)}::jsonb)
      ON CONFLICT (user_auth_id, scope, nome) DO UPDATE SET
        filtros    = EXCLUDED.filtros,
        updated_at = NOW()
      RETURNING id, nome, filtros, created_at, updated_at
    `;
    return NextResponse.json({ view: row });
  } catch (err) {
    console.error("[POST user-views]", err);
    return NextResponse.json({ error: "Erro ao salvar vista" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const idRaw = searchParams.get("id");
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  try {
    const rows = await sql`
      DELETE FROM alissonerp.user_views
      WHERE id = ${id} AND user_auth_id = ${user.id} AND scope = ${SCOPE}
      RETURNING id
    `;
    if (rows.count === 0) {
      return NextResponse.json({ error: "Vista não encontrada" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE user-views]", err);
    return NextResponse.json({ error: "Erro ao deletar vista" }, { status: 500 });
  }
}
