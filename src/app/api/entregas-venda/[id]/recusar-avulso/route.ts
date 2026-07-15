/**
 * POST /api/entregas-venda/[id]/recusar-avulso
 *
 * Recusa um frete avulso SOLICITADO pela consultora ('solicitada' -> 'cancelada').
 *
 * REGRA DE NEGÓCIO (migration 346): mesma permissão de liberar-avulso — só o
 * responsável designado na solicitação ou admin/dev/gerente_loja. Exige
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
import { recusarFreteAvulso } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";

// REGRA: mesmos papéis administrativos usados nas demais rotas de avulso.
const ROLES_ADMIN = ["desenvolvedor", "admin", "gerente_loja"];

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

  const isAdmin = ROLES_ADMIN.includes(usuario.role as string);

  // REGRA DE NEGÓCIO: mesma checagem de ownership de liberar-avulso — quem
  // não é admin/gerente só recusa se for o RESPONSÁVEL designado.
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
        { error: "Você não é o responsável por decidir sobre esta corrida" },
        { status: 403 },
      );
    }
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
