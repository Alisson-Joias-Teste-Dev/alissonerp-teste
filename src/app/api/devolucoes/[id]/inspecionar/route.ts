import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import { inspecionarItem, type CondicaoItem } from "@/lib/devolucoes";

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

  const body = await req.json() as {
    item_id: number;
    condicao: CondicaoItem;
    observacao?: string | null;
  };

  if (!body.item_id || !body.condicao) {
    return NextResponse.json({ error: "item_id e condicao obrigatorios" }, { status: 400 });
  }

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
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
