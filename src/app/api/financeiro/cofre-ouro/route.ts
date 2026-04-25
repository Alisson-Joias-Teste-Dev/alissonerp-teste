import { NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";

const ROLES_FINANCEIRO = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];

// GET /api/financeiro/cofre-ouro
// Lê da view alissonerp.vw_cofre_ouro (posição agregada de pagamentos em ouro)
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario || (!ROLES_FINANCEIRO.includes(usuario.role) && !isFullAccess(usuario.role))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [row] = await sql`SELECT * FROM alissonerp.vw_cofre_ouro`;

  return NextResponse.json({
    total_transacoes:  Number(row?.total_transacoes  ?? 0),
    total_gramas:      Number(row?.total_gramas      ?? 0),
    total_valor_brl:   Number(row?.total_valor_brl   ?? 0),
    preco_medio_grama: Number(row?.preco_medio_grama ?? 0),
    transacoes_30d:    Number(row?.transacoes_30d    ?? 0),
    gramas_30d:        Number(row?.gramas_30d        ?? 0),
    valor_brl_30d:     Number(row?.valor_brl_30d     ?? 0),
  });
}
