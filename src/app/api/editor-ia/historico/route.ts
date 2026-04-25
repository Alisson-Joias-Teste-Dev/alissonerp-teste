/**
 * GET  /api/editor-ia/historico?limit=50&mine=1
 * Lista histórico de geracoes (global por padrão, só do usuário se mine=1).
 *
 * DELETE /api/editor-ia/historico?id=123
 * Remove item (admin/desenvolvedor ou dono).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { deleteFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const mine = url.searchParams.get("mine") === "1";

  const rows = mine
    ? await sql`
        SELECT id, user_id, user_nome, modelo, categoria,
               cenario_id, cenario_nome, aspect_ratio, detalhes,
               imagem_url, storage_path, elapsed_ms, cache_hits, created_at
          FROM alissonerp.editor_ia_historico
         WHERE user_id = ${user.id}
         ORDER BY created_at DESC
         LIMIT ${limit}
      `
    : await sql`
        SELECT id, user_id, user_nome, modelo, categoria,
               cenario_id, cenario_nome, aspect_ratio, detalhes,
               imagem_url, storage_path, elapsed_ms, cache_hits, created_at
          FROM alissonerp.editor_ia_historico
         ORDER BY created_at DESC
         LIMIT ${limit}
      `;

  return NextResponse.json({ items: rows });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const url = new URL(req.url);
  const id = Number(url.searchParams.get("id") || 0);
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  // Checa dono ou admin
  const roleRow = await sql<Array<{ role: string | null }>>`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `.catch(() => [] as Array<{ role: string | null }>);
  const role = roleRow[0]?.role ?? "";
  const isAdmin = role === "desenvolvedor" || role === "admin";

  const rows = await sql<Array<{ user_id: string | null; storage_path: string }>>`
    SELECT user_id, storage_path
      FROM alissonerp.editor_ia_historico
     WHERE id = ${id}
     LIMIT 1
  `;
  if (rows.length === 0) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (!isAdmin && rows[0].user_id !== user.id) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await deleteFile("editor-ia-geradas", rows[0].storage_path).catch(() => ({}));
  await sql`DELETE FROM alissonerp.editor_ia_historico WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}
