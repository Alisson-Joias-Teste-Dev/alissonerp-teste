/**
 * POST /api/entregas-venda/[id]/aceitar-avulso
 *
 * Motoboy aceita uma corrida avulsa atribuída por outra pessoa
 * ('pendente' -> 'em_rota').
 *
 * REGRA DE NEGÓCIO (migration 346): só o motoboy DONO da entrega
 * (motoboy_id) ou admin/dev/gerente_loja podem aceitar. Corrida que o
 * próprio motoboy registrou (auto-criada, created_by == motoboy_id) não
 * passa por aqui — vai direto para /confirmar-avulso.
 *
 * IMPACTO SE ALTERADO: pular o aceite permite "confirmar" uma corrida que
 * o motoboy nunca retirou fisicamente — ver aceitarFreteAvulso() na lib.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { aceitarFreteAvulso } from "@/lib/entrega-venda";

const ROLES_ADMIN = ["desenvolvedor", "admin", "gerente_loja"];

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const entregaId = Number(id);
  if (!entregaId || isNaN(entregaId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const [usuario] = await sql`
    SELECT role FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const isAdmin = ROLES_ADMIN.includes(usuario.role as string);
  // REGRA: role 'entregador' é o motoboy do app; 'motoboy' é protocolista
  // (mesma convenção de confirmar-avulso/route.ts).
  const isMotoboy = usuario.role === "entregador" || usuario.role === "motoboy";

  if (!isAdmin && !isMotoboy) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Motoboy só pode aceitar a própria corrida
  if (isMotoboy) {
    const [entrega] = await sql`
      SELECT motoboy_id, is_avulso
      FROM alissonerp.entregas_venda
      WHERE id = ${entregaId} LIMIT 1
    `;
    if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
    if (!entrega.is_avulso) {
      return NextResponse.json({ error: "Entrega não é avulsa" }, { status: 400 });
    }
    if (String(entrega.motoboy_id) !== user.id) {
      return NextResponse.json({ error: "Você não é o motoboy desta entrega" }, { status: 403 });
    }
  }

  try {
    await aceitarFreteAvulso(entregaId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao aceitar frete avulso";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
