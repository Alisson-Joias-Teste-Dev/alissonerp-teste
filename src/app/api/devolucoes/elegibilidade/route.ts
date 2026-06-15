import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO } from "@/lib/roles";
import { avaliarPrazoDevolucao } from "@/lib/prazo-devolucao";

// ─── GET /api/devolucoes/elegibilidade?venda_id= ─────────────────────────────
// REGRA DE NEGÓCIO: avalia o prazo de devolução (7 dias úteis a partir da entrega
//   real ao cliente). O front chama ao carregar a venda para mostrar na hora se
//   pode criar devolução normal ou se precisa pedir aprovação (fora do prazo).
// NÃO substitui a trava de 'entregue' — só mede o prazo.
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });

  const [u] = await sql`SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid`;
  if (!hasRole(u?.role ?? null, ROLES_DEVOLUCAO)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const vendaId = Number(searchParams.get("venda_id"));
  if (!vendaId || isNaN(vendaId)) {
    return NextResponse.json({ error: "venda_id obrigatorio" }, { status: 400 });
  }

  const avaliacao = await avaliarPrazoDevolucao(vendaId);
  return NextResponse.json(avaliacao);
}
