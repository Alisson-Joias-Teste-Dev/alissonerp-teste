import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";

// POST /api/admin/fila-sync/limpar
// Deleta registros 'processado' com mais de 30 dias
export async function POST(_req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [caller] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  if (!caller || !["desenvolvedor", "admin"].includes(caller.role as string)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const result = await sql`
    DELETE FROM alissonerp.fila_sync_externo
    WHERE status = 'processado'
      AND processado_em < NOW() - INTERVAL '30 days'
    RETURNING id
  `;

  return NextResponse.json({ deletados: result.length });
}
