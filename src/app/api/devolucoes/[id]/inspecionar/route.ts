import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import { inspecionarItem, type CondicaoItem } from "@/lib/devolucoes";
import { internalError } from "@/lib/api-error";
import { zodError } from "@/lib/schemas/common";

const InspecionarPostSchema = z.object({
  item_id: z.coerce.number().int().positive(),
  condicao: z.string().min(1, "obrigatório"),
  observacao: z.string().nullable().optional(),
}).passthrough();

async function getUserRole(userId: string): Promise<string | null> {
  const [row] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${userId}::uuid`;
  return row?.role ?? null;
}

// POST /api/devolucoes/[id]/inspecionar
// Body: { item_id, condicao, observacao? }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const role = await getUserRole(user.id);
  if (!hasRole(role, ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { id } = await params;
  const devId = Number(id);
  if (isNaN(devId)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const parsed = InspecionarPostSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);
  const body = { ...parsed.data, condicao: parsed.data.condicao as CondicaoItem };

  // Verificar que o item pertence a essa devolucao
  const [item] = await sql`
    SELECT id FROM alissonerp.devolucoes_itens
    WHERE id = ${body.item_id} AND devolucao_id = ${devId}
  `;
  if (!item) return NextResponse.json({ error: "Item nao pertence a esta devolucao" }, { status: 404 });

  try {
    await inspecionarItem(body.item_id, body.condicao, body.observacao ?? null, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return internalError(`[POST /api/devolucoes/${devId}/inspecionar]`, err, "Erro ao inspecionar item", 400);
  }
}
