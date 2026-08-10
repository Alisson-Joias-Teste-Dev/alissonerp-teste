import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { createServerSupabase } from "@/lib/supabase/server";
import { isFullAccess } from "@/lib/roles";
import { ensureTinyToken } from "@/lib/vendas-aprovar";
import { internalError } from "@/lib/api-error";
import { logAudit } from "@/lib/audit";

// ─── POST /api/vendas/[id]/cancelar ───────────────────────────────────────────
// Cancela venda (apenas gerente+ ou admin/dev).
// Vendas com pagamento confirmado não podem ser canceladas diretamente.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [usuario] = await sql`
    SELECT role, vendedor_id FROM alissonerp.usuarios WHERE id = ${user.id}::uuid LIMIT 1
  `;
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 403 });

  const PODE_CANCELAR = ["desenvolvedor", "admin", "gerente_fabrica", "gerente_loja"];
  const ehConsultora = usuario.role === "consultora";
  const temAcessoPleno = PODE_CANCELAR.includes(usuario.role) || isFullAccess(usuario.role);
  if (!temAcessoPleno && !ehConsultora) {
    return NextResponse.json({ error: "Sem permissão para cancelar vendas" }, { status: 403 });
  }

  const { id } = await params;
  const vendaId = Number(id);
  if (isNaN(vendaId)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const [venda] = await sql`
    SELECT id, status AS situacao, bloqueado, vendedor_id, orcamento_id FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  if (!venda) return NextResponse.json({ error: "Venda não encontrada" }, { status: 404 });

  // Onda 1D: consultora so cancela venda propria
  if (ehConsultora && !temAcessoPleno) {
    if (usuario.vendedor_id == null || Number(venda.vendedor_id) !== Number(usuario.vendedor_id)) {
      return NextResponse.json({ error: "Sem permissão para esta venda" }, { status: 403 });
    }
  }

  if (ehConsultora && !temAcessoPleno && venda.situacao !== "rascunho") {
    return NextResponse.json(
      { error: "Consultoras só podem cancelar vendas em rascunho" },
      { status: 403 }
    );
  }
  if (venda.situacao === "cancelado") {
    return NextResponse.json({ error: "Venda já cancelada" }, { status: 409 });
  }
  if (venda.situacao === "concluido") {
    return NextResponse.json({ error: "Venda concluída não pode ser cancelada" }, { status: 409 });
  }

  // Verificar se há pagamentos confirmados
  const [{ count }] = await sql`
    SELECT COUNT(*) AS count
    FROM alissonerp.pagamentos_venda
    WHERE venda_id = ${vendaId} AND status = 'confirmado'
  `;
  if (Number(count) > 0) {
    return NextResponse.json(
      { error: "Venda possui pagamentos confirmados. Estorne os pagamentos antes de cancelar." },
      { status: 409 }
    );
  }

  // Se havia crédito do gerente usado, devolver ao saldo
  const [vendaCredito] = await sql`
    SELECT credito_gerente_usado FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  const creditoUsado = parseFloat(vendaCredito?.credito_gerente_usado ?? "0");

  // Carregar tiny_pedido_id antes da transação
  const [vendaTiny] = await sql`
    SELECT tiny_pedido_id FROM alissonerp.vendas_erp WHERE id = ${vendaId}
  `;
  const tinyPedidoId = vendaTiny?.tiny_pedido_id;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sql as any).begin(async (tx: typeof sql) => {
      await tx`
        UPDATE alissonerp.vendas_erp
        SET status = 'cancelado', bloqueado = true
        WHERE id = ${vendaId}
      `;

      // B9: cancelar o orçamento de origem é feito pelo gatilho
      // trg_cancelar_orcamento_ao_cancelar_venda (mig 314) — dispara em QUALQUER rota
      // que cancele a venda (esta, o PATCH situacao, solicitação de alteração) e até
      // em SQL manual. Não duplicamos aqui; orcamento_id fica no SELECT só pro log de
      // auditoria abaixo.

      if (creditoUsado > 0) {
        const { creditarSaldo } = await import("@/lib/saldo-credito");
        // Mesma transação (txClient) — devolução de crédito e cancelamento são atômicos
        await creditarSaldo(creditoUsado, vendaId, null, user.id, tx);
      }

      // Rastreabilidade §0.1: registra QUEM cancelou e o estado anterior,
      // na mesma transação (rollback desfaz o log junto).
      await logAudit(tx, {
        tabela: "vendas_erp",
        operacao: "UPDATE",
        registro_id: vendaId,
        usuario_id: user.id,
        dados_antes: { situacao: venda.situacao },
        dados_depois: { situacao: "cancelado", bloqueado: true, credito_devolvido: creditoUsado > 0 ? creditoUsado : undefined, orcamento_cancelado: venda.orcamento_id ?? undefined },
      });
    });
  } catch (err) {
    return internalError(`[POST /api/vendas/${vendaId}/cancelar]`, err, "Falha ao cancelar. Tente novamente.");
  }

  // Cancelar pedido no Tiny (best-effort: não bloqueia o cancelamento local)
  if (tinyPedidoId) {
    try {
      const token = await ensureTinyToken();
      const res = await fetch(
        `https://api.tiny.com.br/public-api/v3/pedidos/${tinyPedidoId}/situacao`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ situacao: 2 }),
          signal: AbortSignal.timeout(10000),
        },
      );
      if (res.ok) {
        await sql`
          UPDATE alissonerp.vendas_erp
          SET tiny_sync_status = 'cancelado', tiny_sync_at = NOW(), tiny_sync_erro = NULL
          WHERE id = ${vendaId}
        `;
        console.log(`[cancelar] Pedido Tiny ${tinyPedidoId} cancelado`);
      } else {
        const errBody = await res.text();
        console.error(`[cancelar] Tiny cancelar pedido ${tinyPedidoId} falhou: ${res.status} ${errBody.slice(0, 200)}`);
      }
    } catch (err) {
      console.error(`[cancelar] Tiny cancelar pedido ${tinyPedidoId} erro:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ ok: true });
}
