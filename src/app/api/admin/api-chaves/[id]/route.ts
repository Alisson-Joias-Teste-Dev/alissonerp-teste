/**
 * PATCH  /api/admin/api-chaves/:id  — ativa/desativa ou renomeia
 * DELETE /api/admin/api-chaves/:id  — revoga permanentemente
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import sql from "@/lib/db";

async function autorizarAdmin(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const role = user.user_metadata?.role as string | undefined;
  if (!isFullAccess(role ?? "")) return null;
  return user;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await autorizarAdmin(req);
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const chaveId = Number(id);
  if (isNaN(chaveId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json() as { nome?: string; ativa?: boolean; rate_limit_por_minuto?: number };

  await sql`
    UPDATE alissonerp.api_chaves SET
      nome                  = COALESCE(${body.nome ?? null}, nome),
      ativa                 = COALESCE(${body.ativa ?? null}, ativa),
      rate_limit_por_minuto = COALESCE(${body.rate_limit_por_minuto ?? null}, rate_limit_por_minuto)
    WHERE id = ${chaveId}
  `;

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await autorizarAdmin(req);
  if (!user) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const chaveId = Number(id);
  if (isNaN(chaveId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  await sql`DELETE FROM alissonerp.api_chaves WHERE id = ${chaveId}`;

  return NextResponse.json({ ok: true });
}
