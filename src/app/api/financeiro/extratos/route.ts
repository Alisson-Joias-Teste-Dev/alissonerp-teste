import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1`;
  const PODE = ["desenvolvedor", "admin", "administrativo", "financeiro", "gerente_loja"];
  if (!usuario || (!PODE.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const rows = await sql`
    SELECT id, banco, agencia, conta, data_inicio, data_fim,
           arquivo_url, arquivo_nome, processado, total_lancamentos, created_at
    FROM alissonerp.fin_extratos_bancarios
    ORDER BY created_at DESC LIMIT 50
  `;
  return NextResponse.json(rows);
}
