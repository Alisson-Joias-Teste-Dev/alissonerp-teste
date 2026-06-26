import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/admin/fila-sync/[id]/reprocessar
// Move falha_definitiva → pendente, zera tentativas e proxima_execucao
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!caller || !["desenvolvedor", "admin"].includes(caller.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const result = await sql`
    UPDATE alissonerp.fila_sync_externo
    SET status = 'pendente',
        tentativas = 0,
        proxima_execucao = NULL,
        ultimo_erro = NULL,
        processado_em = NULL
    WHERE id = ${itemId}
      AND status = 'falha_definitiva'
    RETURNING id, status, tentativas
  `;

  if (result.length === 0) {
    return NextResponse.json({ error: "Item não encontrado ou não está em falha_definitiva" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, item: result[0] });
}
