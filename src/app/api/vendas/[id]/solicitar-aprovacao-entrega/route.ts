import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  vendaEntregaDevendo,
  vendaTemExcecaoEntregaAprovada,
  solicitarAprovacaoEntregaSemPagamento,
} from "@/lib/entrega-sem-pagamento";
import { internalError } from "@/lib/api-error";

/**
 * POST /api/vendas/[id]/solicitar-aprovacao-entrega
 *
 * Pede ANTECIPADAMENTE a aprovação do SEO pra ENTREGAR uma venda DEVENDO
 * (A Receber pendente — crediário ②). A consultora clica na tela da venda dias
 * antes da entrega; no dia, o portão do criarEntrega já está liberado.
 * NÃO marca entregue (Model A) — só cria/garante a tarefa de aprovação.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`SELECT id, situacao FROM alissonerp.vendas_erp WHERE id = ${vendaId}`;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });
  if (venda.situacao === "cancelado" || venda.situacao === "rascunho") {
    return NextResponse.json({ error: "Venda precisa estar aprovada." }, { status: 409 });
  }

  // Só faz sentido se a venda está "devendo" (A Receber pendente).
  if (!(await vendaEntregaDevendo(vendaId))) {
    return NextResponse.json(
      { error: "Esta venda não tem A Receber pendente — não precisa de aprovação para entregar." },
      { status: 409 }
    );
  }
  // Já aprovado: nada a fazer.
  if (await vendaTemExcecaoEntregaAprovada(vendaId)) {
    return NextResponse.json({ ok: true, status: "aprovado", jaAprovado: true });
  }

  try {
    const { tarefaId, jaExistia } = await solicitarAprovacaoEntregaSemPagamento(
      vendaId,
      user.id,
      "Solicitação antecipada de entrega devendo (tela da venda).",
    );
    return NextResponse.json({ ok: true, status: "pendente", tarefaId, jaExistia });
  } catch (err) {
    // Aprovador não configurado etc. → mensagem clara pro front.
    const msg = err instanceof Error ? err.message : "Falha ao solicitar aprovação.";
    if (/configurad/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return internalError(`[POST /api/vendas/${vendaId}/solicitar-aprovacao-entrega]`, err, "Falha ao solicitar aprovação.");
  }
}
