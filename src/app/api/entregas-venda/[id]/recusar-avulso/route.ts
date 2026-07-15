/**
 * POST /api/entregas-venda/[id]/recusar-avulso
 *
 * Recusa um frete avulso SOLICITADO pela consultora ('solicitada' -> 'cancelada').
 *
 * REGRA DE NEGÓCIO (migration 346, modelo POOL): mesma permissão de
 * liberar-avulso — qualquer liberador ativo (tabela
 * alissonerp.frete_avulso_liberadores) ou admin/dev/diretor
 * (podeGerenciarSolicitacoesAvulso). Não há mais responsável designado. Exige
 * motivo (mín. 3 caracteres) para dar rastreabilidade à consultora sobre
 * por que a corrida não foi liberada.
 *
 * IMPACTO SE ALTERADO: recusa NUNCA lança saldo (o custo não foi assumido
 * pela loja) — ver recusarFreteAvulso() na lib.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { recusarFreteAvulso, podeGerenciarSolicitacoesAvulso } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";

const RecusarAvulsoSchema = z.object({
  motivo: z.string().min(3, "Motivo deve ter ao menos 3 caracteres").max(500),
});

export async function POST(
  req: NextRequest,
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

  // REGRA DE NEGÓCIO (modelo POOL): mesma checagem de liberar-avulso — quem
  // não é full-access só recusa se estiver ativo na lista de liberadores.
  // IMPACTO SE REMOVIDO: qualquer usuário logado recusaria (cancelaria) a
  // corrida solicitada de qualquer venda, sem controle de quem está autorizado.
  if (!(await podeGerenciarSolicitacoesAvulso(user.id, usuario.role as string))) {
    return NextResponse.json(
      { error: "Você não tem permissão para decidir sobre fretes avulsos" },
      { status: 403 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  const parsed = RecusarAvulsoSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  try {
    await recusarFreteAvulso(entregaId, user.id, parsed.data.motivo);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao recusar frete avulso";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
