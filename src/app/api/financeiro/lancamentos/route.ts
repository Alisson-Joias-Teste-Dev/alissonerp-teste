import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const PODE = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  if (!usuario || (!PODE.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const rows = await sql`
    SELECT l.id, l.extrato_id, l.fitid, l.tipo, l.valor, l.data_transacao,
           l.descricao, l.memo, l.conciliado, e.banco
    FROM alissonerp.fin_lancamentos_bancarios l
    LEFT JOIN alissonerp.fin_extratos_bancarios e ON e.id = l.extrato_id
    ORDER BY l.data_transacao DESC NULLS LAST, l.id DESC
    LIMIT 200
  `;
  return NextResponse.json(rows.map(r => ({ ...r, valor: Number(r.valor) })));
}
