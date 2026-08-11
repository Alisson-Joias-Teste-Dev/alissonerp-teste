import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { zodError } from "@/lib/schemas/common";

const ROLES = ["desenvolvedor", "admin", "gerente_loja"];

const PostSchema = z.object({
  local_estoque_id: z.coerce.number().int().positive(),
  obs: z.string().optional(),
}).passthrough();

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const rows = await sql`
    SELECT a.id, a.local_estoque_id, le.nome AS local_nome,
      a.status, a.observacao AS obs, a.total_itens, a.itens_contados, a.itens_divergentes,
      a.created_at, a.data_conclusao, uc.email AS criado_por_email
    FROM alissonerp.auditorias_estoque a
    LEFT JOIN alissonerp.locais_estoque le ON le.id = a.local_estoque_id
    LEFT JOIN auth.users uc ON uc.id = a.created_by
    ORDER BY CASE a.status WHEN 'em_andamento' THEN 0 ELSE 1 END, a.created_at DESC
    LIMIT 50
  `;
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usr] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usr || !ROLES.includes(usr.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const raw = await req.json().catch(() => ({}));
  const parsed = PostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { local_estoque_id, obs } = parsed.data;

  const [existente] = await sql`
    SELECT id FROM alissonerp.auditorias_estoque
    WHERE local_estoque_id = ${local_estoque_id} AND status = 'em_andamento'
  `;
  if (existente) return NextResponse.json({ error: `Já existe auditoria em andamento para este local (ID: ${existente.id})` }, { status: 409 });

  const [auditoria] = await sql`
    INSERT INTO alissonerp.auditorias_estoque (local_estoque_id, observacao, created_by)
    VALUES (${local_estoque_id}, ${obs ?? null}, ${user.id})
    RETURNING id
  `;

  return NextResponse.json({ id: auditoria.id }, { status: 201 });
}
