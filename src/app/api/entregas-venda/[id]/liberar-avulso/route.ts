/**
 * POST /api/entregas-venda/[id]/liberar-avulso
 *
 * Libera um frete avulso SOLICITADO pela consultora ('solicitada' -> 'pendente').
 *
 * REGRA DE NEGÓCIO (migration 346, modelo POOL): pode liberar qualquer
 * liberador ativo (tabela alissonerp.frete_avulso_liberadores) ou
 * admin/dev/diretor (podeGerenciarSolicitacoesAvulso) — não há mais
 * responsável designado; qualquer um do pool decide qualquer solicitação. A
 * liberação é o momento em que o custo do frete é assumido pela loja — o
 * saldo da gerente é lançado dentro de liberarFreteAvulso() na lib.
 *
 * IMPACTO SE ALTERADO: não contornar com UPDATE direto na tabela — a lib
 * garante atomicidade (FOR UPDATE) e evita lançamento de saldo em dobro.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { liberarFreteAvulso, podeGerenciarSolicitacoesAvulso } from "@/lib/entrega-venda";

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

  // REGRA DE NEGÓCIO (modelo POOL): quem não é full-access só libera se
  // estiver ativo na lista de liberadores — não existe mais responsável
  // fixo por solicitação, qualquer um do pool decide qualquer uma.
  // IMPACTO SE REMOVIDO: qualquer usuário logado liberaria custo de frete
  // de qualquer solicitação, sem controle de quem está autorizado.
  if (!(await podeGerenciarSolicitacoesAvulso(user.id, usuario.role as string))) {
    return NextResponse.json(
      { error: "Você não tem permissão para liberar fretes avulsos" },
      { status: 403 },
    );
  }

  try {
    await liberarFreteAvulso(entregaId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao liberar frete avulso";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
