import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { hasRole, ROLES_DEVOLUCAO_ABRIR } from "@/lib/roles";
import { avaliarPrazoDevolucao } from "@/lib/prazo-devolucao";
// Ownership: consultora só consulta elegibilidade de venda própria.
import { requireVendaOwnership } from "@/lib/auth-vendas";

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
  if (!hasRole(u?.role ?? null, ROLES_DEVOLUCAO_ABRIR)) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const vendaId = Number(searchParams.get("venda_id"));
  if (!vendaId || isNaN(vendaId)) {
    return NextResponse.json({ error: "venda_id obrigatorio" }, { status: 400 });
  }

  // ESCOPO (só as vendas dela): consultora só consulta elegibilidade da própria venda.
  try {
    await requireVendaOwnership({ id: user.id, role: (u?.role as string) ?? "", email: "" }, vendaId);
  } catch (e) {
    const st = (e as { status?: number }).status ?? 403;
    return NextResponse.json({ error: (e as Error).message }, { status: st });
  }

  const avaliacao = await avaliarPrazoDevolucao(vendaId);
  return NextResponse.json(avaliacao);
}
