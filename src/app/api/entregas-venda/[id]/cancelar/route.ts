/**
 * POST /api/entregas-venda/[id]/cancelar
 * [id] = entrega_id em entregas_venda
 *
 * Cancela uma entrega que está pendente.
 *
 * REGRA DE NEGÓCIO: apenas entregas com situacao='pendente' podem ser
 * canceladas. O cancelamento libera o saldo pendente dos itens para
 * que novas entregas possam ser criadas para os mesmos itens.
 *
 * O registro NÃO é deletado — permanece como 'cancelada' para
 * rastreabilidade e auditoria.
 *
 * O QUE: recebe um motivo opcional, valida que a entrega existe e está
 * pendente, e delega para cancelarEntrega() da lib que faz a transação
 * atômica com atualização de situacao e registro de auditoria.
 *
 * POR QUE: permite corrigir erros operacionais (entrega criada com itens
 * errados, cliente desistiu, etc.) sem perder o histórico.
 *
 * IMPACTO SE ALTERADO: sem cancelamento, entregas erradas ficam "presas"
 * ocupando saldo de itens, impedindo entregas corretas.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import sql from "@/lib/db";
import { cancelarEntrega } from "@/lib/entrega-venda";
import { zodError } from "@/lib/schemas/common";

// Schema de validação: motivo é opcional, serve para registro interno
const CancelarEntregaSchema = z.object({
  motivo: z.string().max(1000, "Motivo muito longo").optional(),
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
  if (isNaN(entregaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  // Verifica se o usuário existe no ERP (qualquer role pode cancelar se tiver acesso)
  const [usuario] = await sql`
    SELECT id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  // Validação do body
  let raw: unknown;
  try {
    raw = await req.json().catch(() => ({}));
  } catch {
    raw = {};
  }

  const parsed = CancelarEntregaSchema.safeParse(raw);
  if (!parsed.success) return zodError(parsed.error);

  const { motivo } = parsed.data;

  // REGRA DE NEGÓCIO: delega para a lib que valida se a entrega está pendente.
  // Se não estiver (já confirmada ou já cancelada), lança erro com mensagem
  // específica que é capturada e retornada como 409 (Conflict).
  //
  // O motivo, se informado, poderia ser salvo em observacao ou obs_interna,
  // mas a função cancelarEntrega() atual não aceita motivo como parâmetro.
  // Registramos no console para auditoria e retornamos na resposta.
  try {
    await cancelarEntrega(entregaId, user.id);

    if (motivo) {
      console.info(
        `[entregas-venda/cancelar] Entrega ${entregaId} cancelada por ${user.id}. Motivo: ${motivo}`,
      );
    }

    return NextResponse.json({
      ok: true,
      mensagem: "Entrega cancelada",
      motivo: motivo ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao cancelar entrega";
    console.error("[entregas-venda/cancelar] Erro:", err);

    // Traduz erros conhecidos para status HTTP apropriados
    // REGRA DE NEGÓCIO: "Apenas entregas pendentes podem ser canceladas"
    // é o erro mais comum — significa que a entrega já está em outro estado.
    if (message.includes("não encontrada")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("pendentes")) {
      // Ex: "Apenas entregas pendentes podem ser canceladas."
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
