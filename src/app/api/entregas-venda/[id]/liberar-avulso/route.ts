/**
 * POST /api/entregas-venda/[id]/liberar-avulso
 *
 * Libera um frete avulso SOLICITADO pela consultora ('solicitada' -> 'pendente').
 *
 * REGRA DE NEGÓCIO (migration 346): só o responsável designado na solicitação
 * (liberacao_responsavel_id) ou admin/dev/gerente_loja pode liberar. A
 * liberação é o momento em que o custo do frete é assumido pela loja — o
 * saldo da gerente é lançado dentro de liberarFreteAvulso() na lib.
 *
 * IMPACTO SE ALTERADO: não contornar com UPDATE direto na tabela — a lib
 * garante atomicidade (FOR UPDATE) e evita lançamento de saldo em dobro.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { liberarFreteAvulso } from "@/lib/entrega-venda";

// REGRA: mesmos papéis administrativos usados nas demais rotas de avulso.
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

  // REGRA DE NEGÓCIO: quem não é admin/gerente só libera se for o
  // RESPONSÁVEL designado na solicitação (escolhido pela consultora).
  // IMPACTO SE REMOVIDO: qualquer usuário logado liberaria custo de frete
  // de qualquer solicitação, sem controle do responsável designado.
  if (!isAdmin) {
    const [entrega] = await sql`
      SELECT liberacao_responsavel_id, is_avulso
      FROM alissonerp.entregas_venda
      WHERE id = ${entregaId} LIMIT 1
    `;
    if (!entrega) return NextResponse.json({ error: "Entrega não encontrada" }, { status: 404 });
    if (!entrega.is_avulso) {
      return NextResponse.json({ error: "Entrega não é avulsa" }, { status: 400 });
    }
    if (!entrega.liberacao_responsavel_id || String(entrega.liberacao_responsavel_id) !== user.id) {
      return NextResponse.json(
        { error: "Você não é o responsável por liberar esta corrida" },
        { status: 403 },
      );
    }
  }

  try {
    await liberarFreteAvulso(entregaId, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao liberar frete avulso";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
