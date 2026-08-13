/**
 * POST /api/entregas-venda/[id]/aceitar-avulso
 *
 * Motoboy aceita uma corrida avulsa do POOL ('pendente' -> 'em_rota').
 *
 * REGRA DE NEGÓCIO (pool de motoboy — patch A2): a corrida liberada nasce SEM
 * dono (motoboy_id NULL) e aparece pra TODOS os entregadores — qualquer um
 * pega a primeira disponível (não existe mais "atribuição" a um motoboy
 * específico). Corrida que o próprio motoboy registrou (auto-criada,
 * created_by == motoboy_id) não passa por aqui — vai direto para
 * /confirmar-avulso.
 *
 * IMPACTO SE ALTERADO: pular o aceite permite "confirmar" uma corrida que
 * o motoboy nunca retirou fisicamente — ver aceitarFreteAvulso() na lib.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { aceitarFreteAvulso } from "@/lib/entrega-venda";

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

  // REGRA DE NEGÓCIO (pool — patch A2): só entregador (motoboy) aceita
  // corrida do pool — admin/gerente_loja gerenciam/liberam solicitações mas
  // não "pegam" corrida no lugar de um motoboy. 'entregador' é o motoboy do
  // app; 'motoboy' é protocolista (mesma convenção de confirmar-avulso/route.ts).
  const isMotoboy = usuario.role === "entregador" || usuario.role === "motoboy";
  if (!isMotoboy) {
    return NextResponse.json({ error: "Apenas entregadores aceitam corridas." }, { status: 403 });
  }

  // REGRA DE NEGÓCIO (pool — patch A2): a corrida pode estar SEM dono
  // (motoboy_id NULL — liberada, ainda não aceita por ninguém) ou já ser
  // deste motoboy (reenvio da mesma chamada é idempotente). Se já tem OUTRO
  // dono, barra aqui com mensagem clara. A garantia real contra corrida (dois
  // motoboys clicando "aceitar" quase ao mesmo tempo) é o UPDATE condicional
  // atômico dentro de aceitarFreteAvulso() na lib — este check aqui é só a
  // resposta amigável do caso comum (corrida já tem dono confirmado).
  const [entrega] = await sql`
    SELECT is_avulso, situacao, motoboy_id
    FROM alissonerp.entregas_venda
    WHERE id = ${entregaId} LIMIT 1
  `;
  if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
  if (!entrega.is_avulso) {
    return NextResponse.json({ error: "Entrega não é avulsa" }, { status: 400 });
  }
  const semDono = entrega.motoboy_id === null;
  const jaEDele = entrega.motoboy_id !== null && String(entrega.motoboy_id) === user.id;
  if (!semDono && !jaEDele) {
    return NextResponse.json({ error: "Esta corrida já tem outro motoboy." }, { status: 403 });
  }

  try {
    await aceitarFreteAvulso(entregaId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao aceitar frete avulso";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
