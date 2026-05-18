import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { zodError } from "@/lib/schemas/common";

const GatewayPatchSchema = z.object({
  nome: z.string().optional(),
  tipo: z.string().optional(),
  ativo: z.boolean().optional(),
  cor: z.string().optional(),
  obs: z.string().optional(),
}).passthrough();

async function getUser() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const gid = Number(id);
  const raw = await req.json().catch(() => ({}));
  const parsed = GatewayPatchSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const { nome, tipo, ativo, cor, obs } = parsed.data;

  const [updated] = await sql`
    UPDATE alissonerp.fin_gateways
    SET
      nome  = COALESCE(${nome  ?? null}, nome),
      tipo  = COALESCE(${tipo  ?? null}, tipo),
      ativo = COALESCE(${ativo ?? null}, ativo),
      cor   = COALESCE(${cor   ?? null}, cor),
      obs   = COALESCE(${obs   ?? null}, obs)
    WHERE id = ${gid}
    RETURNING id, nome, tipo, ativo, cor, obs, created_at::text AS created_at
  `;
  if (!updated) return NextResponse.json({ error: "Gateway não encontrado" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!usuario || !isFullAccess(usuario.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const gid = Number(id);

  const [used] = await sql`
    SELECT COUNT(*)::int AS cnt FROM alissonerp.pagamentos_venda WHERE fin_gateway_id = ${gid}
  `;
  if ((used?.cnt ?? 0) > 0) {
    await sql`UPDATE alissonerp.fin_gateways SET ativo = false WHERE id = ${gid}`;
    return NextResponse.json({ deactivated: true });
  }
  await sql`DELETE FROM alissonerp.fin_gateways WHERE id = ${gid}`;
  return NextResponse.json({ deleted: true });
}
