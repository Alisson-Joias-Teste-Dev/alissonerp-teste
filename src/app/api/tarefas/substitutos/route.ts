import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const SubstitutoPostSchema = z.object({
  usuario_id: z.string().min(1, "obrigatório"),
  substituto_id: z.string().min(1, "obrigatório"),
  inicio: z.string().optional(),
  fim: z.string().optional(),
}).passthrough();

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const isAdmin = isFullAccess(usuario?.role);

  const substitutos = isAdmin
    ? await sql`
        SELECT s.id, s.usuario_id, u.nome AS usuario_nome,
               s.substituto_id, us.nome AS substituto_nome,
               s.inicio, s.fim, s.ativo, s.created_at
        FROM alissonerp.tarefas_substitutos s
        LEFT JOIN alissonerp.usuarios u ON u.id = s.usuario_id
        LEFT JOIN alissonerp.usuarios us ON us.id = s.substituto_id
        ORDER BY s.ativo DESC, s.inicio DESC
      `
    : await sql`
        SELECT s.id, s.usuario_id, u.nome AS usuario_nome,
               s.substituto_id, us.nome AS substituto_nome,
               s.inicio, s.fim, s.ativo, s.created_at
        FROM alissonerp.tarefas_substitutos s
        LEFT JOIN alissonerp.usuarios u ON u.id = s.usuario_id
        LEFT JOIN alissonerp.usuarios us ON us.id = s.substituto_id
        WHERE s.usuario_id = ${user.id}::uuid OR s.substituto_id = ${user.id}::uuid
        ORDER BY s.ativo DESC, s.inicio DESC
      `;

  return NextResponse.json(substitutos);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!isFullAccess(usuario?.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = SubstitutoPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = parsed.data;

  const [substituto] = await sql`
    INSERT INTO alissonerp.tarefas_substitutos
      (usuario_id, substituto_id, inicio, fim, criado_por)
    VALUES (
      ${body.usuario_id}::uuid, ${body.substituto_id}::uuid,
      ${body.inicio ?? null}::date, ${body.fim ?? null}::date,
      ${user.id}::uuid
    )
    RETURNING id, usuario_id, substituto_id, inicio, fim, created_at
  `;

  return NextResponse.json(substituto, { status: 201 });
}
